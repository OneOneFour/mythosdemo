/* LAYER core — arithmetic with no game concepts in it.
   Depends on nothing. May be imported by every layer. */

export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp  = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
export const sign  = v => v < 0 ? -1 : v > 0 ? 1 : 0;

/* A rectangle is four numbers in world pixels. Machines, catch-box mouths,
   the player hitbox and item queries are all this shape. */
export const rect = (x, y, w, h) => ({ x, y, w, h });

/* Axis-aligned overlap with optional slack in px. One implementation, so the
   catch box and the hand-feed reach cannot disagree about "touching". */
export const overlaps = (a, b, slack = 0) =>
  a.x < b.x + b.w + slack && a.x + a.w > b.x - slack &&
  a.y < b.y + b.h + slack && a.y + a.h > b.y - slack;
