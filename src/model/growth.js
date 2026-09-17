/* model layer — accumulated growth time per planted seed, in seconds of
   simulation time, as a float.

   A sparse `Map` and not a `model/fields.js` named field: a field decays by
   default while this accumulates, and a field costs a dense
   `Float32Array(tw * th)` per band (~28 KB for the surface band) for a
   mechanic with single-digit live instances.

   An entry is created and cleared in one place, `model/tiles.js`'s
   `write.setByte`: a byte whose form declares `tile.roots` plants, and any
   other byte at that coordinate clears. `clearAll()` from `newRun` is the one
   clear that hook cannot perform, since `b.mat` is replaced wholesale. */

import { bump } from './epoch.js';
import { idx } from './world.js';

/* Band ordinal prefixes the band-local tile index. Verbatim
   `model/mining.js`'s key, and it must stay verbatim: the two modules address
   the same coordinates. */
const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);

/* The value is a record and not a bare float, because `rules/growth.js`
   enumerates what is planted every substep and inverting the packed key would
   duplicate `key` and `world.js#idx`. */
export const grove = { grown: new Map() };

export const write = {
  /* A seed goes into the ground with zero seconds on it. Re-planting the same
     tile restarts the clock rather than compounding it. */
  plant(b, tx, ty) {
    grove.grown.set(key(b, tx, ty), { ord: b.ord, tx, ty, secs: 0 });
    bump();
  },

  /* Returns the new total. 0 and no write for a tile that was never planted,
     so a stray call cannot conjure a seed the tile grid knows nothing of. */
  add(b, tx, ty, secs) {
    const e = grove.grown.get(key(b, tx, ty));
    if (!e) return 0;
    e.secs += secs;
    bump();
    return e.secs;
  },

  /* No bump when there was nothing to delete: `model/tiles.js#write.setByte`
     calls this for every terrain edit, including the several hundred thousand
     writes worldgen makes at boot. */
  clear(b, tx, ty) { if (grove.grown.delete(key(b, tx, ty))) bump(); },

  clearAll() { grove.grown.clear(); bump(); }
};

/* Is a seed growing here? A different question from `grownAt() > 0`: a seed
   planted this frame has zero seconds on it and is still growing, which is
   how `view/scene.js`'s overlay draws stage 0. */
export const growingAt = (b, tx, ty) => grove.grown.has(key(b, tx, ty));

/* Accumulated seconds, or 0 with nothing planted. */
export const grownAt = (b, tx, ty) => grove.grown.get(key(b, tx, ty))?.secs || 0;

/* 0..1 against the caller's own total, which is a parameter so a `view` pass
   and a `rules` step cannot measure against different numbers. Clamped at 1,
   so a stage read never indexes past the last silhouette. */
export const stageAt = (b, tx, ty, total) =>
  !(total > 0) || !Number.isFinite(total) ? 0
    : Math.min(1, grownAt(b, tx, ty) / total);

/* The live map, for `rules/growth.js` to walk. Returned rather than copied,
   since a defensive copy per substep would allocate for nothing. Callers must
   not write to it directly -- `write` above is the door. */
export const planted = () => grove.grown;

/* How many seeds are in the ground, and a fair bound on the map: an entry
   exists only while its seed tile does. */
export const activeCount = () => grove.grown.size;
