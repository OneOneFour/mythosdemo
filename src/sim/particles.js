import { H, W } from '../core/canvas.js';
import { P } from '../core/palette.js';
import { ambient } from '../render/scene.js';
import { drips, dust, smoke } from './state.js';
import { bandAt } from '../world/config.js';
import { FALLS } from '../world/layout.js';


/* ---------- ambient ---------- */
export function updateParticles(dt) {
  for (let i = smoke.length - 1; i >= 0; i--) {
    const s = smoke[i];
    s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += dt * 1.6;
    if (s.life <= 0) smoke.splice(i, 1);
  }
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 60 * dt;
    if (d.life <= 0) dust.splice(i, 1);
  }
  if (Math.random() < 0.6) {
    const f = FALLS[(Math.random() * FALLS.length) | 0];
    if (f) drips.push({ x: f.x + (Math.random() - 0.5) * f.w, y: f.y + f.h,
                        vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 26, life: 0.6 });
  }
  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i];
    d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 90 * dt;
    if (d.life <= 0) drips.splice(i, 1);
  }
  if (smoke.length > 400) smoke.splice(0, smoke.length - 400);
}

export const TRICKLE = {
  'THE HEAVENS': P.cloudB, 'THE DIG SITE': P.soil, 'PALE LIMESTONE': P.limeD,
  'OCHRE STRATA': P.ochreD, 'THE AQUIFER': P.watB, 'BASALT & BRINE': P.basD,
  'THE ABYSS': P.vio, 'GATES OF HADES': P.hadC
};

export let trickT = 0;

export function updateTrickle(dt, cy) {
  trickT -= dt;
  if (trickT > 0) return;
  trickT = 0.1 + Math.random() * 0.14;
  const y = cy + Math.random() * H;
  dust.push({ x: (Math.random() * W) | 0, y, vx: (Math.random() - 0.5) * 5,
              vy: 8 + Math.random() * 14, life: 1 + Math.random() * 0.8,
              col: TRICKLE[bandAt(y).name] || P.limeD });
}
