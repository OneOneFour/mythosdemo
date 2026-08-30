/* LAYER model — band allocation and tile addressing.

   No module-scope dimension constant exists in this file, which is the point.
   A band is allocated from a `data/world.js` row at run time, and MORE THAN ONE
   MAY BE RESIDENT: `bands` is an array, and every query below takes the band
   record as its first argument.

   Threading `b` through every call is real noise — roughly one extra parameter
   on forty call sites. It buys DESIGN item 18: Hades and Tartarus are two bands
   the player descends between, and a mutated singleton cannot hold both. */

import { bump } from './epoch.js';

export const bands = [];              // allocated band records, in origin order

export const write = {
  allocate(cfg) {
    const b = {
      id: cfg.id, name: cfg.name,
      ord: bands.length,              // stable index, used as a key prefix
      tw: cfg.tw, th: cfg.th, tile: cfg.tile, chunk: cfg.chunk,
      origin: cfg.origin,
      cx: Math.ceil(cfg.tw / cfg.chunk),
      cy: Math.ceil(cfg.th / cfg.chunk),
      mat: new Uint8Array(cfg.tw * cfg.th),
      /* A per-chunk VERSION counter, not a dirty flag. `view` owns the chunk
         cache and must therefore know which chunks have changed — but `view`
         may not write to `model`, so it cannot clear a flag. A counter that only
         goes up lets the renderer keep its own "version I last painted" map and
         stay side-effect-free. The epoch guard in `tools/check.mjs` is what
         forced this, and it is a better invalidation scheme than the flag. */
      ver: null,
      fields: {}                      // filled by model/fields.js
    };
    b.ver = new Uint32Array(b.cx * b.cy).fill(1);
    bands.push(b);
    bump();
    return b;
  },

  clear() { bands.length = 0; bump(); }
};

export const bandOf = id => bands.find(b => b.id === id) || null;

/* The band a world-space tile falls in, or null. This is the only place that
   knows bands stack. */
export const bandAt = (tx, ty) => bands.find(b =>
  ty >= b.origin.ty && ty < b.origin.ty + b.th &&
  tx >= b.origin.tx && tx < b.origin.tx + b.tw) || null;

export const idx = (b, tx, ty) => ty * b.tw + tx;

export const inBounds = (b, tx, ty) =>
  tx >= 0 && tx < b.tw && ty >= 0 && ty < b.th;

export const widthPx  = b => b.tw * b.tile;
export const heightPx = b => b.th * b.tile;
