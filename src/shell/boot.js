/* shell layer — boot and newRun(). Moving a line in this order throws during
   boot and renders nothing.
     1  attach()                  finds the surface; null headless, no throw
     2  resize()                  sets VIEW.w/h, which the camera clamp needs
     3  seedRng(seed)             must precede worldgen, which draws from it
     4  run.write.resetMeta()     once per page
     5  run.write.reset(seed)     pocket ledger and granted set
     6  world.write.allocate(cfg) typed arrays sized from the row
     7  fields.write.allocate()   needs the band record from (6)
     8  generate(band)            needs (6) and (3)
     9  player.write.spawn()      needs (8), or it spawns inside rock
    10  items.write.spawn(pick)   needs (9) for a position to plant beside
   A field surviving `newRun()` is a determinism bug. */

import { attach, resize } from '../core/canvas.js';
import { seedRng } from '../core/rng.js';
import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { BANDS, SPAWN_BAND } from '../data/world.js';
import { write as aimw } from '../model/aim.js';
import { write as boonw } from '../model/boons.js';
import { write as dqw } from '../model/digqueue.js';
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

/* Once per page: devices and listeners, none of which may assume a world. */
export function boot(seed) {
  attach();
  resize();
  initAudio();
  installInput();
  runw.resetMeta();            // once per page; `reset()` is once per run
  if (typeof addEventListener === 'function')
    addEventListener('resize', () => resize());
  newRun(seed);
}

/* Once per run. */
export function newRun(seed = (Math.random() * 1e9) | 0) {
  // tear down, before anything reads a stale array
  worldw.clear();
  machw.clear();
  segw.clear();        // holds two machine records, so it goes with them
  itemw.clear();
  digw.clearAll();
  dqw.clearAll();
  growthw.clearAll();  // worldw.clear() replaces b.mat wholesale, so setByte
                       // never gets the chance to clear this one
  modw.clear();
  boonw.clear();
  aimw.reset();
  journalw.clear();
  setAutoCollect(false);  // gate what enters run.inv, so surviving a restart
  setAutoFeed(false);     // would diverge one seed's two runs
  /* `ui.menu` is not cleared: `shell/save.js#load` calls this with the menu
     still up, so a refusal can be drawn on it. */
  resetChunks();               // canvases holding the previous world
  resetFx();                   // chips and toasts from the previous world
  resetAudio();

  seedRng(seed);
  runw.reset(seed);

  for (const cfg of BANDS) {
    const b = worldw.allocate(cfg);
    fieldw.allocate(b, cfg.fields);
    generate(b);
  }

  /* Spawned two tiles up, so the 16 px body starts in air and the first frame
     is a landing. */
  const home = bandOf(SPAWN_BAND);
  const spawnTx = home.cfg.spawnTx ?? (home.tw >> 1), floorTy = home.cfg.floorTy ?? 0;
  playerw.spawn(home, spawnTx, floorTy - 2);

  /* Boot only; from here fog of war is line of sight. `+ 8` clears the 7-row
     soil layer, so the seam is the only bound that matters. */
  worldw.revealRows(home, floorTy + 8);

  /* `+ 4` stays inside the flat spawn shelf (`SHELF` in `rules/generate.js`),
     so the pick never lands on a ragged lip or a tree. */
  itemw.spawn(home, worldX(home, spawnTx + 4), worldY(home, floorTy - 1), S.pick, F.relic, 0, 0);

  title('MYTHOS FACTORY', 'TORMENT I', 2.6);
  return player;
}

export const booted = () => !!player.band;
