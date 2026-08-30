/* LAYER shell — the loop. Fixed timestep.

   1/120 s substeps, so no `rules` module ever sees a variable dt. That is not a
   performance decision: it is what lets fall damage, mining time and machine
   throughput be functions of the world rather than of the display. */

import { newRun } from './boot.js';
import { stepAll } from './schedule.js';
import { drainJournal } from './notify.js';
import { render } from '../view/scene.js';
import { player } from '../model/player.js';

export const STEP = 1 / 120;
export const clock = { t: 0, dt: 0, frame: 0, acc: 0 };
export const cam = { x: 0, y: 0 };

/* Input is explicitly out of scope in the brief. This is the shape the schedule
   is written against and nothing fills it. */
export const cmd = { left: false, right: false, up: false, down: false,
                     jump: false, dig: false, place: false };

export function boot(seed) {
  newRun(seed);
  return { frame };
}

export function frame(g, dtReal, W, H) {
  clock.acc += Math.min(0.25, dtReal);        // never simulate more than 0.25 s
  while (clock.acc >= STEP) {
    stepAll(STEP, cmd);
    clock.acc -= STEP;
    clock.t += STEP;
  }
  clock.frame++;
  drainJournal();                             // once per FRAME, not per substep

  cam.x = player.x - W / 2;
  cam.y = player.y - H / 2;
  render(g, cam, W, H);
}
