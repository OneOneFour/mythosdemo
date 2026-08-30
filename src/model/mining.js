/* LAYER model — accumulated pick time per tile, in SECONDS as a float.
   Imports `model` only. May be imported by `model`, `rules`, `view`.

   A Map and not a `Float32Array(tw * th)`: at most a handful of tiles are ever
   part-mined at once, and the array form is 196 KB resident to describe three
   of them. A dig also abandons progress the moment the player looks elsewhere,
   so the live set is naturally tiny and naturally sparse.

   SECONDS, compared directly against the substance row's hardness, which is also
   seconds. There is no /255, no byte, and therefore no framerate at which a hard
   material becomes unbreakable -- which is exactly the bug that storing progress
   as a byte alongside the material produced. */

import { bump } from './epoch.js';
import { idx } from './world.js';

/* Band ordinal prefixes the tile index, because two bands may be mined at once
   and a bare tile index would collide between them. */
const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);

export const dig = { work: new Map() };

export const write = {
  /* Returns the new total, so the caller need not read it back. */
  add(b, tx, ty, secs) {
    const k = key(b, tx, ty);
    const now = (dig.work.get(k) || 0) + secs;
    dig.work.set(k, now);
    bump();
    return now;
  },

  clear(b, tx, ty) { dig.work.delete(key(b, tx, ty)); bump(); },

  clearAll() { dig.work.clear(); bump(); }
};

export const workAt = (b, tx, ty) => dig.work.get(key(b, tx, ty)) || 0;

/* 0..1, for crack rendering. `view` imports this and nothing else from here. */
export const progressAt = (b, tx, ty, hardSecs) =>
  !(hardSecs > 0) || !Number.isFinite(hardSecs) ? 0
    : Math.min(1, workAt(b, tx, ty) / hardSecs);

/* How many tiles are currently part-mined. A debug read, and the cheap proof
   that the Map stays small. */
export const activeCount = () => dig.work.size;
