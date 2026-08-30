/* LAYER core — seeded randomness and a positional hash.
   Depends on nothing. May be imported by every layer.

   Two different things live here and confusing them is a determinism bug:

     rand()      the RUN's stream. Stateful. Consuming it out of order changes
                 the world, so nothing may draw from it during rendering
                 (ARCHITECTURE invariant 7).
     hash2()     stateless. Same input, same value, forever. This is the only
                 randomness `view` may use, because a repaint must not be a
                 mutation of anything — not even of an RNG cursor.

   Ported near-verbatim from the previous codebase's `core/rng.js`. */

/* mulberry32. Small, fast, and good enough that a run is worth sharing. */
export function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Stateless 2D hash in [0,1). Used by chunk painting and edge jitter. */
export const hash2 = (x, y) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};

/* ES module bindings are read-only for importers, so the generator lives on an
   object and is swapped by property. This is the project convention for any
   scalar written in one module and read in another. */
export const rng = { next: Math.random };

export function seedRng(seed) { rng.next = mulberry(seed | 0); }

export const rand = () => rng.next();

/* Convenience draws, so call sites stop rewriting the same arithmetic. */
export const randRange = (lo, hi) => lo + rand() * (hi - lo);
export const randInt   = (lo, hi) => lo + ((rand() * (hi - lo + 1)) | 0);
