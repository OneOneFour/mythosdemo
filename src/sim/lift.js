import { CX } from '../core/canvas.js';
import { pileAdd, pileTake } from './piles.js';
import { smoke } from './state.js';
import { CAGES } from '../world/layout.js';


/* ---------- the lift, five stages ---------- */
export function updateCages(dt) {
  for (const c of CAGES) {
    if (c.wait > 0) { c.wait -= dt; continue; }
    c.y += c.dir * (c.dir < 0 ? 11 : 26) * dt;            // slow up, quick down
    if (c.y <= c.top) {
      c.y = c.top; c.dir = 1; c.wait = 1.1;
      if (c.load > 0 && c.to >= 0) { pileAdd(c.to, c.load); c.load = 0; }
      else c.load = 0;
      smoke.push({ x: CX + 8, y: c.top + 6, vx: 1, vy: -12, r: 2, life: 2 });
    }
    if (c.y >= c.bot) {
      c.y = c.bot; c.dir = -1; c.wait = 1.4;
      if (c.from >= 0) {                                  // pick up what's waiting
        let k = 0;
        while (k < 4 && pileTake(c.from)) k++;
        c.load = k;
      }
    }
    if (c.dir < 0 && Math.random() < 0.4)
      smoke.push({ x: CX + 8 + (Math.random() - 0.5) * 10, y: c.y + 16,
                   vx: (Math.random() - 0.5) * 5, vy: 5 + Math.random() * 8,
                   r: 1.4 + Math.random() * 2, life: 1.8 + Math.random() });
  }
}
