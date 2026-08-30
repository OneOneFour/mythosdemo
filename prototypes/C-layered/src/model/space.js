/* LAYER model — a uniform bucket grid. Knows nothing about items or machines.

   Generic on purpose but not speculative: it has two callers on day one —
   `model/items.js` for falling material and `rules/machines.js` for port mouths
   — and a third named in DESIGN (monsters). It stays here rather than in `core`
   because a bucket size in world pixels is a world fact. */

export const BUCKET = 32;              // px

export const makeGrid = () => ({ heads: new Map(), next: [] });

export function clearGrid(g) { g.heads.clear(); g.next.length = 0; }

const cellKey = (x, y) => ((y / BUCKET) | 0) * 100000 + ((x / BUCKET) | 0);

/* `i` is an index into whatever array the caller owns. No allocation per item
   beyond the chain slot. */
export function insert(g, i, x, y) {
  const k = cellKey(x, y);
  g.next[i] = g.heads.get(k) ?? -1;
  g.heads.set(k, i);
}

/* Visits the 4-9 buckets overlapping `r` and calls `fn(index)`. */
export function query(g, r, fn) {
  const x0 = ((r.x / BUCKET) | 0), x1 = (((r.x + r.w) / BUCKET) | 0);
  const y0 = ((r.y / BUCKET) | 0), y1 = (((r.y + r.h) / BUCKET) | 0);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      let i = g.heads.get(cy * 100000 + cx) ?? -1;
      while (i !== -1) { fn(i); i = g.next[i]; }
    }
}
