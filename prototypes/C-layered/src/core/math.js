/* LAYER core — imports nothing but core. No game concepts live here. */

export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp  = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
export const sign  = v => v < 0 ? -1 : v > 0 ? 1 : 0;

/* Axis-aligned overlap with an optional slack in px. Used by the machine
   interpreter (hand-feed reach) and by the catch box. */
export const overlaps = (a, b, slack = 0) =>
  a.x < b.x + b.w + slack && a.x + a.w > b.x - slack &&
  a.y < b.y + b.h + slack && a.y + a.h > b.y - slack;

export const rect = (x, y, w, h) => ({ x, y, w, h });
