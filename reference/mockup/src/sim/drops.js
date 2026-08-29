import { P } from '../core/palette.js';
import { pileAdd, pileFor } from './piles.js';
import { GRAV, chips, drops, impacts } from './state.js';
import { LAVA_Y } from '../world/config.js';
import { SHAFTS } from '../world/layout.js';


/* ---------- free fall ---------- */
export function spawnDrop(x, y, col, landY, landType, size, streak, pile) {
  drops.push({ x: x | 0, y, vy: 6 + Math.random() * 16, col, landY, landType,
               size: size || 3, streak: !!streak,
               pile: (pile === undefined ? -1 : pile) });
}

export let spoilT = 1.2, fuelT = 0.6;

export function updateDrops(dt) {
  const S = id => SHAFTS.find(s => s.id === id);
  // timber going down the fuel shaft to the pot
  fuelT -= dt;
  if (fuelT <= 0) {
    fuelT = 2.8 + Math.random() * 1.4;
    const b = S('B');
    spawnDrop(b.x - 1, b.y0 + 2, P.woodB, b.y1 - 4, 'stone', 4, false, pileFor(b));
  }
  // process waste going down the spoil shaft into the lava
  spoilT -= dt;
  if (spoilT <= 0) {
    spoilT = 1.3 + Math.random() * 1.6;
    const gsh = S('G');
    const big = Math.random() < 0.22;
    spawnDrop(gsh.x - 1, gsh.y0 + 2, big ? P.basB : P.ochreD, LAVA_Y, 'lava',
              big ? 5 : 3, true, -1);
  }

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vy += GRAV * dt;
    d.y += d.vy * dt;
    if (d.y >= d.landY) { land(d); drops.splice(i, 1); }
  }
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i];
    c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += c.g * dt;
    if (c.life <= 0) chips.splice(i, 1);
  }
  for (let i = impacts.length - 1; i >= 0; i--) {
    impacts[i].life -= dt;
    if (impacts[i].life <= 0) impacts.splice(i, 1);
  }
  if (chips.length > 500) chips.splice(0, chips.length - 500);
}

export function land(d) {
  const t = d.landType;
  if (d.pile >= 0) pileAdd(d.pile);
  impacts.push({ x: d.x, y: d.landY, life: t === 'lava' ? 0.55 : 0.32,
                 max: t === 'lava' ? 0.55 : 0.32, type: t, col: d.col });
  const n = t === 'lava' ? 12 : 7;
  for (let i = 0; i < n; i++)
    chips.push({ x: d.x, y: d.landY,
                 vx: (Math.random() - 0.5) * (t === 'lava' ? 64 : 52),
                 vy: -(t === 'lava' ? 40 : 22) - Math.random() * (t === 'lava' ? 80 : 38),
                 g: t === 'lava' ? 70 : 330,
                 life: (t === 'lava' ? 0.8 : 0.4) + Math.random() * 0.6,
                 col: t === 'lava' ? (Math.random() < 0.5 ? P.lavaA : P.lavaB) : d.col });
}
