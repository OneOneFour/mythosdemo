/* ============================================================
   THE TILE PAINT LOOP. One loop, no material names, no branches on identity.

   Painting a tile is: look up the substance's look row, run its treatment
   list. Everything a material looks like is in data/substances.js.

   `view` may import `core`, `data` and `model` queries, and may import
   neither `rules` nor any model `write`. tools/layers.mjs fails the build on
   either, and tools/epoch.mjs proves at runtime that a full render moves the
   mutation counter by zero.
   ============================================================ */

import { AIR, SUB } from '../data/substances.js';
import { hardOf, isSolid, matAt } from '../model/tiles.js';
import { progressAt } from '../model/mining.js';
import { idx } from '../model/world.js';
import { TREAT } from './treatments.js';
import { R } from '../core/pixels.js';
import { COL } from '../data/palette.js';
import { hash2 } from '../core/rng.js';

const EMPTY = {};

export function paintTile(g, b, tx, ty, px, py) {
  const mat = matAt(b, tx, ty);
  if (mat === AIR) return;
  const s = SUB[mat];
  const look = s.look;
  if (!look || !look.base) return;

  R(g, px, py, b.tile, b.tile, COL[look.base]);

  const cell = { px, py, tx, ty, tile: b.tile, look,
                 exposed: { up: !isSolid(b, tx, ty - 1), down: !isSolid(b, tx, ty + 1),
                            left: !isSolid(b, tx - 1, ty), right: !isSolid(b, tx + 1, ty) } };

  for (const [name, params] of look.treatments ?? []) {
    const fn = TREAT[name];
    /* A look row naming a treatment that does not exist is caught by
       tools/layers.mjs before import; this throw is the belt to that braces. */
    if (!fn) throw new Error(`${s.id}: unknown treatment '${name}'`);
    fn(g, cell, params ?? EMPTY);
  }

  const d = progressAt(idx(b, tx, ty), hardOf(b, tx, ty));
  if (d > 0.05) cracks(g, b, tx, ty, px, py, d);
}

/* STUB (leaf): crack geometry. Drawn from the tile's own hash so cracks grow
   in place rather than flickering between frames. */
function cracks(g, b, tx, ty, px, py, d) {
  const n = (d * 6) | 0;
  for (let k = 0; k < n; k++)
    R(g, px + ((hash2(tx + k, ty) * b.tile) | 0),
         py + ((hash2(ty, tx + k) * b.tile) | 0), 1, 1, '#000000');
}
