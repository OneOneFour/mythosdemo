/* ============================================================
   TILE STORAGE AND QUERIES ONLY.

   Deliberately no mining progress here. Mining is a verb of the actor doing
   it (rules/mining.js) and its progress lives in model/mining.js. When
   progress sat in the tile store it got pressured into the storage's own
   byte width; keeping it out is the structural half of that fix.
   ============================================================ */

import { AIR, SUB } from '../data/substances.js';
import { BEDROCK, idx, inBounds } from './world.js';
import { bump } from './epoch.js';

export const matAt = (b, tx, ty) => (inBounds(b, tx, ty) ? b.mat[idx(b, tx, ty)] : BEDROCK);
export const subAt = (b, tx, ty) => SUB[matAt(b, tx, ty)];

export const isSolid = (b, tx, ty) => subAt(b, tx, ty).tile?.solid === true;
export const isAir = (b, tx, ty) => matAt(b, tx, ty) === AIR;
export const hardOf = (b, tx, ty) => subAt(b, tx, ty).tile?.hard ?? Infinity;

export const write = {
  set(b, tx, ty, mat) {
    if (!inBounds(b, tx, ty)) return false;
    const i = idx(b, tx, ty);
    if (b.mat[i] === mat) return false;
    b.mat[i] = mat;
    write.markDirty(b, tx, ty);
    bump();
    return true;
  },

  markDirty(b, tx, ty) {
    const c = ((ty / b.chunk) | 0) * b.cx + ((tx / b.chunk) | 0);
    if (c >= 0 && c < b.dirty.length) b.dirty[c] = 1;
  },

  /* Region transform — DESIGN item 10, miracles. A rule calls this; nothing
     about a one-shot terrain edit needs a new primitive. */
  fill(b, tx0, ty0, tx1, ty1, mat) {
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) write.set(b, tx, ty, mat);
  }
};
