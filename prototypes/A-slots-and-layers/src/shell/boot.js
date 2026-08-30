/* ============================================================
   BOOT ORDER IS LOAD-BEARING (CLAUDE.md says so, from experience).

     1  allocate the band          model/world.js  — nothing has dimensions yet
     2  allocate its fields        model/fields.js — sized from the band
     3  activate it                so `cur.band` is non-null before any rule
     4  reset run state
     5  worldgen                   (stubbed)
     6  spawn the player
     7  place starting machines    assemble() needs the band's tile size

   Getting this wrong throws during boot and renders nothing at all, which is
   the honest failure mode and better than a half-built world.
   ============================================================ */

import { BAND } from '../data/bands.js';
import { write as ww, cur } from '../model/world.js';
import { write as fw } from '../model/fields.js';
import { write as rw } from '../model/run.js';
import { write as pw } from '../model/player.js';
import { write as mw } from '../model/machines.js';
import { write as dw } from '../model/mining.js';
import { write as iw } from '../model/items.js';
import { write as modw } from '../model/mods.js';
import { place } from '../rules/place.js';

export function newRun(seed = 1337, bandId = 'surface') {
  const cfg = BAND[bandId];
  const b = ww.allocate(cfg);
  fw.allocate(b);
  ww.activate(cfg.id);

  rw.reset(seed);
  dw.clearAll();
  iw.reset();
  mw.reset();
  modw.clear();

  /* STUB (leaf): worldgen. `rules/generate.js` would iterate substance rows
     with a `gen` block, so an ore places itself and worldgen names none. */

  pw.spawn(cfg.spawnTx, cfg.surfaceTy - 2, cur.band.tile);
  return b;
}

/* A second, differently-sized band, resident at the same time. This is the
   whole of DESIGN item 18. */
export function openBand(bandId) {
  const cfg = BAND[bandId];
  const b = ww.allocate(cfg);
  fw.allocate(b);
  return b;
}

export function demo() {
  newRun(1337);
  place('furnace', 40, 30);
  place('crusher', 46, 30);
  place('kiln', 50, 30);
  place('winch', 44, 40);
  place('bloodWinch', 48, 40);
}
