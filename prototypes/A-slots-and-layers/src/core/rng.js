/* core — no imports outside core. Pure arithmetic. */

/* Position hash. Painting reads this and never `rand()`, so rendering
   consumes no randomness and is replay-safe. */
export function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Seeded stream. Sim only. */
let s = 1337;
export const seed = n => { s = n | 0 || 1; };
export function rand() {
  s = (s * 1664525 + 1013904223) | 0;
  return ((s >>> 8) & 0xffffff) / 0x1000000;
}
