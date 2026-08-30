/* Placement. Generic over data/machines.js: `tw`, `th` and the Footprint
   part's `footing` are read from the row, so there is no placeFurnace(). */

import { MACH, M } from '../data/machines.js';
import { cur } from '../model/world.js';
import { write as mw } from '../model/machines.js';
import { write as rw } from '../model/run.js';
import { valid } from './parts/footprint.js';

export function place(machineId, tx, ty) {
  const b = cur.band;
  const def = MACH[M[machineId]];
  if (!def) throw new Error(`unknown machine '${machineId}'`);

  const footing = def.parts.find(p => p[0] === 'Footprint')?.[1]?.footing ?? 0;
  const bad = valid(b, tx, ty, def.tw, def.th, footing);
  if (bad) { rw.toast(bad); return null; }

  const host = mw.assemble(machineId, tx, ty, b.tile);
  rw.toast(`${def.name} PLACED`);
  return host;
}
