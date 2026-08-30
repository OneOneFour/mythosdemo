/* ============================================================
   SPATIAL QUERIES.

   STUB (leaf): the body is a uniform bucket grid over model/items.js with
   Int32Array heads and a next chain. The SEAM is what matters here — every
   part that reaches for nearby items goes through `near()`, so the container
   can change without a rules edit.
   ============================================================ */

import { items } from './items.js';

/* Items whose centre falls inside the rect. Linear today; bucketed later. */
export function near(x, y, w, h) {
  const out = [];
  for (const it of items)
    if (it.x >= x && it.x <= x + w && it.y >= y && it.y <= y + h) out.push(it);
  return out;
}

export const overlaps = (a, b, pad = 0) =>
  a.x + a.w > b.x - pad && a.x < b.x + b.w + pad &&
  a.y + a.h > b.y - pad && a.y < b.y + b.h + pad;
