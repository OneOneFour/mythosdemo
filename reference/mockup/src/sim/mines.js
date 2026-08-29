import { spawnCart } from './carts.js';
import { chips, impacts } from './state.js';
import { MINES, PILES } from '../world/layout.js';


/* ---------- rigs ---------- */
export function updateMines(dt) {
  for (const m of MINES) {
    m.flash = Math.max(0, m.flash - dt);
    m.t += dt / m.period;
    if (m.t >= 1) { m.t -= 1; m.struck = false; }
    const p = m.t < 0.5 ? Math.pow(m.t / 0.5, 2.2) : 1 - Math.pow((m.t - 0.5) / 0.5, 0.8);
    m.ang = m.rest + (m.reach - m.rest) * p;
    if (!m.struck && m.t >= 0.48 && m.t <= 0.60) { m.struck = true; strike(m); }
  }
}

export function strike(m) {
  const fx = m.x + m.dir * 10, fy = m.y + 2;
  m.stage++; m.flash = 0.14;
  for (let i = 0, n = 3 + ((Math.random() * 3) | 0); i < n; i++)
    chips.push({ x: fx, y: fy, vx: -m.dir * (18 + Math.random() * 46),
                 vy: -26 - Math.random() * 46, g: 340,
                 life: 0.45 + Math.random() * 0.35, col: m.rock });
  if (m.stage >= 4) {
    // a full cart is only won when the face finally breaks out
    spawnCart(m.x, m.y + 6, m.shaft ? m.shaft.x : PILES[m.dumpPile].x, m.ore,
              m.shaft ? { shaft: m.shaft } : { pile: m.dumpPile });
    m.stage = 0; m.flash = 0.30;
    for (let i = 0; i < 10; i++)
      chips.push({ x: fx, y: fy, vx: -m.dir * (8 + Math.random() * 78),
                   vy: -44 - Math.random() * 68, g: 340,
                   life: 0.55 + Math.random() * 0.5,
                   col: Math.random() < 0.4 ? m.ore : m.rock });
    impacts.push({ x: fx, y: fy, life: 0.3, max: 0.3, type: 'burst', col: m.ore });
  }
}
