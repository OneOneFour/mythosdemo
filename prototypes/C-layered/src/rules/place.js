/* LAYER rules — placing a machine.

   `placeFurnace()` in today's tree is 18 lines of furnace-specific footprint
   checking. This is the same 18 lines reading `tw`, `th` and `footing` off the
   row, so every machine that will ever exist is placeable and `structures.js`
   is deleted. */

import { MACH } from '../data/machines.js';
import { S } from '../data/substances.js';
import { solidAt, tileAt } from '../model/tiles.js';
import { write as mw } from '../model/machines.js';
import { push } from '../model/journal.js';

export function place(band, defIdx, tx, ty) {
  const def = MACH[defIdx];

  for (let j = 0; j < def.th; j++)
    for (let i = 0; i < def.tw; i++)
      if (tileAt(band, tx + i, ty + j) !== S.air) {
        push('refused', { x: tx * band.tile, y: ty * band.tile },
             { machine: def.id, why: 'NEEDS CLEAR SPACE' });
        return null;
      }

  let footing = 0;
  for (let i = 0; i < def.tw; i++) if (solidAt(band, tx + i, ty + def.th)) footing++;
  if (footing < def.footing) {
    push('refused', { x: tx * band.tile, y: ty * band.tile },
         { machine: def.id, why: 'NEEDS A FLOOR' });
    return null;
  }

  const m = mw.place(band, defIdx, tx, ty);
  push('placed', { x: m.box.x, y: m.box.y }, { machine: def.id });
  return m;
}
