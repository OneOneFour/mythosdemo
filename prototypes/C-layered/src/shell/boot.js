/* LAYER shell — newRun(). BOOT ORDER IS LOAD-BEARING.

     1  world.write.allocate(band)   allocates the typed arrays from the row
     2  fields.write.allocate(band)  needs the band record from (1)
     3  run.write.reset(seed)        builds the pocket ledger from the table
     4  mods.write.clear()           a new run starts with no trinkets
     5  seedRng(seed)                every run reproducible from its seed
     6  generate(band)               needs (1); reads `gen` blocks
     7  player.write.spawn(...)      needs (6) or it spawns inside rock
     8  place(...)                   needs (6) for the footing check

   Getting this order wrong throws during boot and renders nothing at all,
   which is the mistake recorded in CLAUDE.md. `shell` is the only layer allowed
   to know this order, and it is the only layer that imports both `rules` and
   `view` — which is what makes the direction in `tools/layers.mjs` a rule
   instead of a wish. */

import { BANDS } from '../data/world.js';
import { M, MACH } from '../data/machines.js';
import { S } from '../data/substances.js';
import { seedRng } from '../core/rng.js';
import { write as worldw, bandOf } from '../model/world.js';
import { write as fieldw } from '../model/fields.js';
import { write as runw } from '../model/run.js';
import { write as modw } from '../model/mods.js';
import { write as itemw } from '../model/items.js';
import { write as machw } from '../model/machines.js';
import { write as digw } from '../model/mining.js';
import { write as tilew } from '../model/tiles.js';
import { write as playerw } from '../model/player.js';
import { write as aimw } from '../model/aim.js';
import { generate } from '../rules/generate.js';
import { place } from '../rules/place.js';
import { equip } from '../rules/trinkets.js';

export function newRun(seed = (Math.random() * 1e9) | 0) {
  worldw.clear();
  machw.clear(); itemw.clear(); digw.clearAll();
  modw.clear(); aimw.reset();
  runw.reset(seed);
  seedRng(seed);

  /* Both bands are allocated up front so that DESIGN item 18 works: descending
     from one into another is a tile query, not a world rebuild. A production
     build would allocate lazily on first entry; the seam is the same. */
  for (const cfg of BANDS) {
    const b = worldw.allocate(cfg);
    fieldw.allocate(b, cfg.fields);
    generate(b);
  }

  const surface = bandOf('surface');
  playerw.spawn(surface, BANDS[0].spawnTx, BANDS[0].surfaceTy - 2);

  /* Starting furniture. A real run has the player dig the shelf and place
     these; there is no input in this prototype, so `shell` carves and places.
     Machine ids come from the table, and the footprint comes off the row, so
     this loop does not know how big a furnace is. */
  for (const [id, tx] of [[M.furnace, BANDS[0].spawnTx + 3],
                          [M.crusher, BANDS[0].spawnTx + 8]]) {
    const def = MACH[id], ty = BANDS[0].surfaceTy;
    for (let j = 0; j < def.th; j++)
      for (let i = 0; i < def.tw; i++) tilew.set(surface, tx + i, ty + j, S.air);
    place(surface, id, tx, ty);
  }

  /* A boon the player begins with, so that the tunable path is exercised from
     frame one rather than only after a draft. */
  equip('winged-sandals');
}
