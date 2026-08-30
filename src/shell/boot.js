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

   Getting this wrong throws during boot and renders NOTHING AT ALL, which is
   the exact mistake recorded in CLAUDE.md. It is written down here because it
   cannot be inferred from the import graph.
   ============================================================================

   ARCHITECTURE invariant 8: `newRun()` RESETS EVERYTHING. A field that survives
   a restart is a determinism bug, so every model module with a `clear` is
   cleared below, and so are the two caches `view` owns. */

import { attach, resize } from '../core/canvas.js';
import { seedRng } from '../core/rng.js';
import { BANDS, SPAWN_BAND } from '../data/world.js';
import { write as aimw } from '../model/aim.js';
import { write as fieldw } from '../model/fields.js';
import { write as itemw } from '../model/items.js';
import { write as journalw } from '../model/journal.js';
import { write as machw } from '../model/machines.js';
import { write as digw } from '../model/mining.js';
import { write as modw } from '../model/mods.js';
import { player, write as playerw } from '../model/player.js';
import { write as runw } from '../model/run.js';
import { bandOf, write as worldw } from '../model/world.js';
import { generate } from '../rules/generate.js';
import { reset as resetFx, title } from '../view/fx.js';
import { resetChunks } from '../view/paint.js';
import { initAudio, resetAudio } from './audio.js';
import { installInput } from './input.js';

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
  itemw.clear();
  digw.clearAll();
  modw.clear();
  aimw.reset();
  journalw.clear();
  resetChunks();               // canvases holding the previous world
  resetFx();                   // chips and toasts from the previous world
  resetAudio();

  /* --- the stream, then the ledger --- */
  seedRng(seed);
  runw.reset(seed);

  /* --- the world. Every band is resident at once, so descending from one into
         another is a tile query rather than a world rebuild. A production build
         would allocate the deep bands lazily; the seam is identical. --- */
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
  playerw.spawn(home, home.cfg.spawnTx ?? (home.tw >> 1), (home.cfg.floorTy ?? 0) - 2);

  title('MYTHOS FACTORY', 'TORMENT I', 2.6);
  return player;
}

/* One place to ask "has this page been booted", for the test hook. */
export const booted = () => !!player.band;
