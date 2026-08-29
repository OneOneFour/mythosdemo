import { P } from '../core/palette.js';
import { spawnCart } from './carts.js';
import { spawnDrop } from './drops.js';
import { pileAdd, pileTake } from './piles.js';
import { smoke } from './state.js';
import { LAVA_Y } from '../world/config.js';
import { PILES, SHAFTS, STATIONS } from '../world/layout.js';


/* ---------- stations ---------- */
export function updateStations(dt) {
  for (const s of STATIONS) {
    s.fire = Math.max(0, s.fire - dt * 0.8);
    s.cool -= dt;
    if (s.cool > 0) continue;
    let ready = true;
    for (const i of s.inputs) if (i < 0 || PILES[i].n < 1) ready = false;
    s.starved = !ready;
    if (!ready) { s.cool = 0.4; continue; }
    for (const i of s.inputs) pileTake(i);
    // run hot when the feed heap is backing up
    let load = 0;
    for (const i of s.inputs) load = Math.max(load, PILES[i].n / PILES[i].cap);
    s.hot = load > 0.55;
    s.cool = s.rate * (s.hot ? 0.62 : 1);
    s.fire = 1;
    s.prog++;
    if (s.prog >= s.perOut) {                 // enough charges for one unit
      s.prog = 0;
      if (s.out.kind === 'cart')
        spawnCart(s.out.from, s.out.y, s.out.to, s.out.col,
                  s.out.shaft ? { shaft: SHAFTS.find(q => q.id === s.out.shaft) }
                              : { pile: s.out.pile });
      else pileAdd(s.out.pile);
    }
    if (s.spoil) {
      const gsh = SHAFTS.find(q => q.id === 'G');
      if (gsh) spawnDrop(gsh.x - 1, Math.max(gsh.y0 + 2, s.y - 18),
                         P.ochreD, LAVA_Y, 'lava', 3, true, -1);
    }
    for (let i = 0; i < 3; i++)
      smoke.push({ x: s.x + s.w / 2 + (Math.random() - 0.5) * 6, y: s.y - s.h - 2,
                   vx: (Math.random() - 0.5) * 5, vy: -10 - Math.random() * 8,
                   r: 1 + Math.random() * 2, life: 1.6 + Math.random() });
  }
}
