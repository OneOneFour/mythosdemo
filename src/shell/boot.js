/* LAYER shell — newRun(). BOOT ORDER IS LOAD-BEARING.
   Imports every layer. This is the only file allowed to know the order below,
   and the only one that imports both `rules` and `view` — which is what makes
   the direction in `tools/layers.mjs` a rule instead of a wish.

   ============================================================================
   THE ORDER, AND WHAT BREAKS IF YOU MOVE A LINE:

     1  canvas.attach()             finds the surface; null headless, not a throw
     2  resize()                    sets VIEW.w/h, which the camera clamp needs
     3  seedRng(seed)               EVERY run reproducible from its seed, and it
                                    must precede anything that draws from the
                                    stream, which is worldgen
     4  run.write.resetMeta()       once per page; `reset()` once per run
     5  run.write.reset(seed)       builds the pocket ledger and the granted set
     6  world.write.allocate(cfg)   allocates the typed arrays FROM THE ROW; the
                                    old code allocated at import and that is why
                                    more than one band was impossible
     7  fields.write.allocate(...)  needs the band record from (6)
     8  generate(band)              needs (6) and (3)
     9  player.write.spawn(...)     needs (8), or it spawns inside rock
    10  items.write.spawn(pick/brand)  needs (9) for a position to plant beside

   Getting this wrong throws during boot and renders NOTHING AT ALL, which is
   the exact mistake recorded in CLAUDE.md. It is written down here because it
   cannot be inferred from the import graph.
   ============================================================================

   ARCHITECTURE invariant 8: `newRun()` RESETS EVERYTHING. A field that survives
   a restart is a determinism bug, so every model module with a `clear` is
   cleared below, and so are the two caches `view` owns. */

import { attach, resize } from '../core/canvas.js';
import { seedRng } from '../core/rng.js';
import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { BANDS, SPAWN_BAND } from '../data/world.js';
import { write as aimw } from '../model/aim.js';
import { write as boonw } from '../model/boons.js';
import { write as fieldw } from '../model/fields.js';
import { write as growthw } from '../model/growth.js';
import { write as itemw } from '../model/items.js';
import { write as journalw } from '../model/journal.js';
import { write as machw } from '../model/machines.js';
import { write as digw } from '../model/mining.js';
import { write as modw } from '../model/mods.js';
import { player, write as playerw } from '../model/player.js';
import { write as runw } from '../model/run.js';
import { write as segw } from '../model/segments.js';
import { bandOf, worldX, worldY, write as worldw } from '../model/world.js';
import { generate } from '../rules/generate.js';
import { reset as resetFx, title } from '../view/fx.js';
import { resetChunks } from '../view/paint.js';
import { initAudio, resetAudio } from './audio.js';
import { installInput } from './input.js';
import { setAutoCollect, setAutoFeed } from './ui.js';

/* Once per PAGE. Everything here is a device or a listener, and none of it is
   allowed to depend on a world existing yet. */
export function boot(seed) {
  attach();
  resize();
  initAudio();
  installInput();
  runw.resetMeta();            // once per PAGE; `reset()` is once per run
  if (typeof addEventListener === 'function')
    addEventListener('resize', () => resize());
  newRun(seed);
}

/* Once per RUN. */
export function newRun(seed = (Math.random() * 1e9) | 0) {
  /* --- tear down, before anything reads a stale array --- */
  worldw.clear();
  machw.clear();
  segw.clear();        // Phase 8d: a segment holds two MACHINE RECORDS, so it
                       // must go with the machines it points at -- and a
                       // segment surviving a restart is exactly the
                       // determinism bug invariant 8 exists to name
  itemw.clear();
  digw.clearAll();
  growthw.clearAll();  // Phase 15 (docs/PLAN-phase15-trees.md D15-B): the one
                       // ledger `model/tiles.js#write.setByte` cannot clear
                       // for itself here, because `worldw.clear()` above
                       // replaces `b.mat` wholesale rather than tile by tile
                       // -- so a seed three-quarters grown would still be
                       // three-quarters grown in the next run, at the same
                       // coordinates, which is exactly invariant 8's
                       // determinism bug and exactly what docs/FINDINGS.md
                       // (8d, #2) records happening to `segments`
  modw.clear();
  boonw.clear();       // Phase 4 (docs/BUILD_PLAN.md): a boon surviving a
                        // restart is invariant 8's determinism bug, same as
                        // every other model clear on this list
  aimw.reset();
  journalw.clear();
  setAutoCollect(false);  // D13-A (docs/PLAN-phase13.md §4.3): AUTO COLLECT is
                          // an INPUT, not a cosmetic preference -- it ORs into
                          // `cmd.collect` in `shell/main.js#step`, so it gates
                          // what enters `run.inv`, which moves burden, climb
                          // speed and carrier load. A toggle surviving a
                          // restart would make two runs from the same seed
                          // diverge on what the player clicked before dying,
                          // which is exactly invariant 8's determinism bug.
                          // Was the ONLY `shell` state on this teardown list;
                          // as of Phase 16b there are two, and both are here
                          // for that reason and not for tidiness.
  setAutoFeed(false);     // D16-C's answer is D13-A's, unchanged
                          // (docs/PLAN-phase16-interaction-model-v2.md §5
                          // D16-C says so in as many words: "the same kind of
                          // fact takes the same answer; 16b must not
                          // introduce a second policy"). AUTO FEED is an
                          // INPUT too -- it gates `rules/machines.js#
                          // handFeed`, which spends `run.inv` into a machine
                          // buffer, which moves burden and climb speed and,
                          // through `rules/cycles.js#drainReceivers`,
                          // whether a trial gets paid. A toggle surviving a
                          // restart would make two runs from the same seed
                          // diverge on what the player clicked before dying.
  resetChunks();               // canvases holding the previous world
  resetFx();                   // chips and toasts from the previous world
  resetAudio();

  /* --- the stream, then the ledger --- */
  seedRng(seed);
  runw.reset(seed);

  /* --- the world. Every band is resident at once, so descending from one into
         another is a tile query rather than a world rebuild. --- */
  for (const cfg of BANDS) {
    const b = worldw.allocate(cfg);
    fieldw.allocate(b, cfg.fields);
    generate(b);
  }

  /* --- the player. `spawnTx` and `floorTy` are band-local numbers on the row;
         nothing converts them to a world constant. Two tiles above the ground
         line, so the 16 px body starts in air and the first frame is a landing
         rather than an ejection. --- */
  const home = bandOf(SPAWN_BAND);
  const spawnTx = home.cfg.spawnTx ?? (home.tw >> 1), floorTy = home.cfg.floorTy ?? 0;
  playerw.spawn(home, spawnTx, floorTy - 2);

  /* --- the starting skyline. AT BOOT ONLY -- this is not how fog of war works
         from here on, which is real line of sight (`rules/reveal.js`). The sky
         and the soil cap down to where `data/world.js`'s stone begins are
         shown unconditionally, trees included, so the first frame of a run is
         the waking-up view of the surface rather than a screen of fog the
         player would have to walk around to burn off one tree trunk at a
         time. `floorTy + 8` reaches a couple of rows past the soil layer's
         own `toTy` (7 rows deep) with margin to spare; it does not need to be
         exact, only past the soil/stone seam, since nothing below that seam
         is "the surface". --- */
  worldw.revealRows(home, floorTy + 8);

  /* --- the first gift. Planted a few tiles off centre, inside the flat spawn
         shelf (`SHELF` in `rules/generate.js`) so it never lands on a ragged
         lip or a tree. An ordinary item, not a special case: it falls the last
         tile like anything else and then LIES THERE until the player picks it
         up -- pickup has been opt-in since Phase 12b, so walking over it is no
         longer enough: hold `c` (`cmd.collect`) inside `eff('pickupR')`, or
         turn AUTO COLLECT on in the Character tab. `model/run.js#hasPick()`
         reads the result either way. --- */
  itemw.spawn(home, worldX(home, spawnTx + 4), worldY(home, floorTy - 1), S.pick, F.relic, 0, 0);

  /* --- Prometheus's fire, stolen once. A `timber/brand` on the OTHER side of
         spawn from the pickaxe, inside the same shelf, planted rather than
         handed over for the identical reason: nothing teleports into your
         hands. `rules/light.js` lights it automatically the moment it enters
         the pockets -- there is no separate "light your torch" verb -- so
         picking it up is the whole of "acquiring the run's first light
         source". --- */
  itemw.spawn(home, worldX(home, spawnTx - 4), worldY(home, floorTy - 1), S.timber, F.brand, 0, 0);

  title('MYTHOS FACTORY', 'TORMENT I', 2.6);
  return player;
}

/* One place to ask "has this page been booted", for the test hook. */
export const booted = () => !!player.band;
