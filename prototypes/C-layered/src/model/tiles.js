/* LAYER model — tile storage and tile queries. Storage only.

   Mining progress is NOT here. It is in `model/mining.js`, and the rule that
   breaks a tile is in `rules/mining.js`. That split is the point: while
   progress lived in the tile store it was under constant pressure to be a byte
   in the same array as the material, and the brief's granite bug is what that
   pressure produced. Storage that holds one number per tile forever, and
   progress that holds a number for the two or three tiles currently being hit,
   are different data structures with different lifetimes. */

import { S, SUB } from '../data/substances.js';
import { bump } from './epoch.js';
import { idx, inBounds } from './world.js';

/* Out of bounds is BEDROCK, not -1. Seven boundary special-cases and one
   `mat[-1]` throw disappear into this line: every caller can ask a substance
   row about a tile it does not have. Above the top of a band is air, so you can
   still jump. */
export function tileAt(b, tx, ty) {
  if (ty < 0) return S.air;
  if (!inBounds(b, tx, ty)) return S.bedrock;
  return b.mat[idx(b, tx, ty)];
}

export const rowAt   = (b, tx, ty) => SUB[tileAt(b, tx, ty)];
export const solidAt = (b, tx, ty) => rowAt(b, tx, ty).tile?.solid === true;
export const climbAt = (b, tx, ty) => rowAt(b, tx, ty).tile?.climb === true;
export const hardAt  = (b, tx, ty) => rowAt(b, tx, ty).tile?.hard ?? Infinity;

export const write = {
  set(b, tx, ty, sub) {
    if (!inBounds(b, tx, ty)) return false;
    const i = idx(b, tx, ty);
    if (b.mat[i] === sub) return false;
    b.mat[i] = sub;
    write.touch(b, tx, ty);
    bump();
    return true;
  },

  /* Bump the chunk version, and the neighbour's too when the tile sits on a
     seam: a tile on a chunk edge bleeds its edge shading into the next chunk. */
  touch(b, tx, ty) {
    const cx = (tx / b.chunk) | 0, cy = (ty / b.chunk) | 0;
    if (cx < 0 || cx >= b.cx || cy < 0 || cy >= b.cy) return;
    b.ver[cy * b.cx + cx]++;
    if (tx % b.chunk === 0            && cx > 0)        b.ver[cy * b.cx + cx - 1]++;
    if (tx % b.chunk === b.chunk - 1  && cx < b.cx - 1) b.ver[cy * b.cx + cx + 1]++;
    if (ty % b.chunk === 0            && cy > 0)        b.ver[(cy - 1) * b.cx + cx]++;
    if (ty % b.chunk === b.chunk - 1  && cy < b.cy - 1) b.ver[(cy + 1) * b.cx + cx]++;
    bump();
  },

  fill(b, sub) {
    b.mat.fill(sub);
    for (let i = 0; i < b.ver.length; i++) b.ver[i]++;
    bump();
  }
};
