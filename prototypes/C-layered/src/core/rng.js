/* LAYER core — seeded RNG plus a positional hash.

   `rand()` is the run's stream and consuming it out of order changes the world;
   `hash2()` is stateless and is the only randomness `view` may use, so that a
   repaint is not a mutation. `tools/layers.mjs` enforces the second half of that
   sentence by refusing `view -> core/rng.js#rand`. */

const state = { s: 1337 >>> 0 };

export function seedRng(seed) { state.s = (seed >>> 0) || 1; }

export function rand() {
  state.s ^= state.s << 13; state.s >>>= 0;
  state.s ^= state.s >>> 17;
  state.s ^= state.s << 5;  state.s >>>= 0;
  return state.s / 4294967296;
}

/* Stateless 2D hash in [0,1). Same input, same pixel, forever. */
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
