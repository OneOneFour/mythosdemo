/* core layer — arithmetic with no game concepts in it. */

export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp  = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
export const sign  = v => v < 0 ? -1 : v > 0 ? 1 : 0;

/* A rectangle is four numbers in world pixels. */
export const rect = (x, y, w, h) => ({ x, y, w, h });

/* Axis-aligned overlap, `slack` in world px, expanding `b` on every side. */
export const overlaps = (a, b, slack = 0) =>
  a.x < b.x + b.w + slack && a.x + a.w > b.x - slack &&
  a.y < b.y + b.h + slack && a.y + a.h > b.y - slack;
