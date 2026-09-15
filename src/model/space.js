/* LAYER model — a uniform bucket grid. Knows nothing about items or machines.
   Imports nothing. May be imported by `model`, `rules`, `view`.

   Generic on purpose but not speculative: `model/items.js` builds the one grid
   there is, and every machine catch box, belt and carrier asks it "what is in
   my mouth" once a frame through `itemsIn`. A linear scan is
   O(machines x items), and a catch box is checked every frame by design.

   It stays in `model` rather than `core` because a bucket size in world pixels
   is a world fact, not arithmetic. */

export const BUCKET = 32;              // px

export const makeGrid = () => ({ heads: new Map(), next: [] });

export function clearGrid(g) { g.heads.clear(); g.next.length = 0; }

/* Buckets are addressed by a single integer so the Map key is a number.
   The stride is far wider than any band, so two columns cannot collide. */
const STRIDE = 100000;
const cellKey = (x, y) => Math.floor(y / BUCKET) * STRIDE + Math.floor(x / BUCKET);

/* `i` is an index into whatever array the caller owns. No allocation per item
   beyond the chain slot. */
export function insert(g, i, x, y) {
  const k = cellKey(x, y);
  g.next[i] = g.heads.get(k) ?? -1;
  g.heads.set(k, i);
}

/* Visits the buckets overlapping `r` and calls `fn(index)` for each occupant.
   BUCKET-GRANULAR, deliberately: `insert` keeps a bucket key and not the point
   it was given, so an occupant up to `BUCKET` px outside `r` is visited too and
   the exact test belongs to whoever owns the positions.
   `model/items.js#itemsIn` is that owner and the only caller; a second caller
   owes the same re-test. */
export function query(g, r, fn) {
  const x0 = Math.floor(r.x / BUCKET), x1 = Math.floor((r.x + r.w) / BUCKET);
  const y0 = Math.floor(r.y / BUCKET), y1 = Math.floor((r.y + r.h) / BUCKET);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      let i = g.heads.get(cy * STRIDE + cx) ?? -1;
      while (i !== -1) { fn(i); i = g.next[i]; }
    }
}
