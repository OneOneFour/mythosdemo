import { rebuild } from './bootstrap.js';
import { H } from './core/canvas.js';
import { render } from './render/scene.js';
import { updateCarts } from './sim/carts.js';
import { updateDrops } from './sim/drops.js';
import { updateCages } from './sim/lift.js';
import { updateMines } from './sim/mines.js';
import { updateParticles, updateTrickle } from './sim/particles.js';
import { cam, clock, view } from './sim/state.js';
import { updateStations } from './sim/stations.js';
import { WORLD_H } from './world/config.js';


/* ============================================================
   DRAW
   ============================================================ */
export let t0 = performance.now() / 1000;

export function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - t0); t0 = now; clock.t += dt;

  if (view.tour && clock.t - view.lastInput > 5) cam.target += 11 * dt;
  cam.target = Math.max(0, Math.min(WORLD_H - H, cam.target));
  cam.y += (cam.target - cam.y) * Math.min(1, dt * 7);

  updateMines(dt);
  updateCarts(dt);
  updateStations(dt);
  updateDrops(dt);
  updateCages(dt);
  updateParticles(dt);
  updateTrickle(dt, cam.y);
  view.titleFade = Math.max(0, 1 - Math.max(0, clock.t - 3.2) / 1.6);

  render();
  requestAnimationFrame(frame);
}


/* ---------- boot ---------- */
rebuild();

requestAnimationFrame(frame);
