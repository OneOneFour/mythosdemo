import { spawnDrop } from './drops.js';
import { floorType, pileAdd, pileFor } from './piles.js';
import { carts, impacts } from './state.js';
import { PILES } from '../world/layout.js';


/* ---------- carts: horizontal haulage ---------- */
export function spawnCart(x, y, toX, col, dest) {
  carts.push({ x, y, toX, col, dest, dir: Math.sign(toX - x) || 1, sp: 26 + Math.random() * 8 });
}

export function updateCarts(dt) {
  for (let i = carts.length - 1; i >= 0; i--) {
    const c = carts[i];
    c.x += c.dir * c.sp * dt;
    if ((c.dir > 0 && c.x >= c.toX) || (c.dir < 0 && c.x <= c.toX)) {
      if (c.dest.shaft) {
        const s = c.dest.shaft;
        spawnDrop(s.x - 1, s.y0 + 2, c.col, s.y1 - 4, floorType(s), 3, false,
                  pileFor(s));
      } else if (c.dest.pile >= 0) {
        pileAdd(c.dest.pile);
        impacts.push({ x: PILES[c.dest.pile].x, y: PILES[c.dest.pile].y - 3,
                       life: 0.25, max: 0.25, type: 'stone', col: c.col });
      }
      carts.splice(i, 1);
    }
  }
}
