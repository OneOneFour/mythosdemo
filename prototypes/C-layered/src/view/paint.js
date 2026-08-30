/* LAYER view — tile painting. Contains no substance name.

   Compare with today's `world/paint.js`, which names `copper` at line 127 and
   can only do so because it imports the gameplay table. `view` may import
   `data` and read-only `model` queries here too — the difference is that there
   is nothing in a row for it to branch on: it reads `look`, and `look` is the
   only block in a substance row that `view` touches. */

import { SUB } from '../data/substances.js';
import { COL } from '../data/palette.js';
import { R } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { mix } from '../core/color.js';
import { solidAt, tileAt, hardAt } from '../model/tiles.js';
import { progressAt } from '../model/mining.js';
import { TREAT } from './treatments.js';

export function paintTile(g, b, tx, ty, px, py) {
  const row = SUB[tileAt(b, tx, ty)];
  const look = row.look;
  if (!look || !row.tile?.solid) return;

  const base = COL[look.base], hi = COL[look.hi], lo = COL[look.lo];
  R(g, px, py, b.tile, b.tile, base);

  /* grain */
  for (let y = 0; y < b.tile; y++)
    for (let x = 0; x < b.tile; x++) {
      const h = hash2(tx * b.tile + x, ty * b.tile + y);
      if (h < 0.16)      R(g, px + x, py + y, 1, 1, lo);
      else if (h > 0.90) R(g, px + x, py + y, 1, 1, hi);
    }

  /* exposed faces catch light; buried faces do not */
  if (!solidAt(b, tx, ty - 1)) R(g, px, py, b.tile, 2, hi);
  if (!solidAt(b, tx - 1, ty)) R(g, px, py, 1, b.tile, mix(base, hi, 0.45));
  if (!solidAt(b, tx + 1, ty)) R(g, px + b.tile - 1, py, 1, b.tile, mix(base, lo, 0.5));
  if (!solidAt(b, tx, ty + 1)) R(g, px, py + b.tile - 1, b.tile, 1, lo);

  /* THE LINE THAT USED TO SAY `if (M.id === 'copper')` */
  const cell = { px, py, tx, ty, tile: b.tile };
  for (const t of look.treatments || []) TREAT[t.fn](g, cell, t);

  const d = progressAt(b, tx, ty, hardAt(b, tx, ty));
  if (d > 0.05) cracks(g, px, py, tx, ty, d, b.tile);
}

/* Item sprites are the same idea one layer down: colours and treatments off the
   row's `look.item`, no substance name. */
export function paintItem(g, it, px, py) {
  const look = SUB[it.sub].look;
  const size = SUB[it.sub].item.size;
  R(g, px, py, size, size, COL[look.item[0]]);
  R(g, px, py + size - 1, size, 1, COL[look.item[1]]);
  const cell = { px, py, tx: px | 0, ty: py | 0, tile: size };
  for (const t of look.treatments || []) TREAT[t.fn](g, cell, t);
}

/* Cracks come from the tile's own hash, so they grow in place rather than
   flickering between frames. */
function cracks(g, px, py, tx, ty, d, tile) {
  const n = 1 + ((d * 5) | 0);
  for (let k = 0; k < n; k++) {
    let x = 1 + ((hash2(tx * 3 + k, ty * 11) * (tile - 2)) | 0);
    let y = 1 + ((hash2(ty * 3 + k, tx * 11) * (tile - 2)) | 0);
    for (let s = 0; s < 1 + ((d * 4) | 0); s++) {
      R(g, px + x, py + y, 1, 1, '#160f0a');
      x += hash2(x + k, y + s) < 0.5 ? 1 : -1;
      y += hash2(y + s, x + k) < 0.62 ? 1 : 0;
      if (x < 0 || x >= tile || y < 0 || y >= tile) break;
    }
  }
}
