/* model layer — a uniform bucket grid over world pixels. Knows nothing about
   items or machines.

   `model/items.js` builds the one grid there is; every catch box, belt and
   carrier asks it what is in its mouth once a frame through `itemsIn`. */

export const BUCKET = 32;              // px

export const makeGrid = () => ({ heads: new Map(), next: [] });

export function clearGrid(g) { g.heads.clear(); g.next.length = 0; }

/* Buckets are addressed by one integer so the Map key is a number. The stride
   is wider than any band, so two columns cannot collide. */
const STRIDE = 100000;
const cellKey = (x, y) => Math.floor(y / BUCKET) * STRIDE + Math.floor(x / BUCKET);

/* `i` is an index into whatever array the caller owns. */
export function insert(g, i, x, y) {
  const k = cellKey(x, y);
  g.next[i] = g.heads.get(k) ?? -1;
  g.heads.set(k, i);
}

/* Visits the buckets overlapping `r` and calls `fn(index)` for each occupant.
   Bucket-granular: an occupant up to `BUCKET` px outside `r` is visited too, so
   the caller re-tests the exact point (`model/items.js#itemsIn`). */
export function query(g, r, fn) {
  const x0 = Math.floor(r.x / BUCKET), x1 = Math.floor((r.x + r.w) / BUCKET);
  const y0 = Math.floor(r.y / BUCKET), y1 = Math.floor((r.y + r.h) / BUCKET);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      let i = g.heads.get(cy * STRIDE + cx) ?? -1;
      while (i !== -1) { fn(i); i = g.next[i]; }
    }
}
