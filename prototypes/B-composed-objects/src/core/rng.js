/* Two RNG sources, deliberately separate.

   `rand()` is the seeded run stream. Only sim code may draw from it, so the
   number of draws per tick must not depend on the camera or the framerate.

   `hash2(x, y)` is a pure spatial hash. Rendering uses this and never `rand()`,
   which is what keeps a repaint from consuming run randomness. */
let s = 1;
export const seed = n => { s = (n | 0) || 1; };
export function rand() {
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
  return ((s >>> 0) % 100000) / 100000;
}
export function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
