import { TILE } from './tiles.js';

/* ============================================================
   HASHGRID — a uniform spatial index on 4-tile cells, over EVERYTHING with
   an `x`/`y`: items, machines, actors, monsters.

   It is generic over `e.tag` rather than typed per collection, which is what
   makes "monsters eat items off chutes" and "a monster rides a deck"
   (DESIGN item 14) a query rather than a new pairwise loop.

   comp/catchbox.js queries a few cells; the alternative it replaces is
   items x machines pair checks every frame.
   ============================================================ */
export function createIndex(cfg) {
  const cell = 4 * TILE;
  const cx = Math.ceil((cfg.tw * TILE) / cell), cy = Math.ceil((cfg.th * TILE) / cell);
  const buckets = new Map();                 // key -> Set of entities

  const key = (gx, gy) => gy * cx + gx;
  const gridOf = (x, y) => [Math.max(0, Math.min(cx - 1, (x / cell) | 0)),
                            Math.max(0, Math.min(cy - 1, (y / cell) | 0))];

  function bucket(k) {
    let b = buckets.get(k);
    if (!b) buckets.set(k, b = new Set());
    return b;
  }

  return {
    /* An entity may be a host (footprint) or an item (a point). */
    add(e) {
      const fp = e.slots?.footprint;
      const x = fp ? fp.x : e.x, y = fp ? fp.y : e.y;
      const [gx, gy] = gridOf(x, y);
      e._cell = key(gx, gy);
      bucket(e._cell).add(e);
    },

    remove(e) { buckets.get(e._cell)?.delete(e); },

    /* Call after a move; a no-op unless the entity changed cell. */
    update(e) {
      const [gx, gy] = gridOf(e.x, e.y), k = key(gx, gy);
      if (k === e._cell) return;
      this.remove(e); e._cell = k; bucket(k).add(e);
    },

    each(x, y, w, h, fn) {
      const [x0, y0] = gridOf(x, y), [x1, y1] = gridOf(x + w, y + h);
      for (let gy = y0; gy <= y1; gy++)
        for (let gx = x0; gx <= x1; gx++) {
          const b = buckets.get(key(gx, gy));
          if (b) for (const e of b) fn(e);
        }
    }
  };
}
