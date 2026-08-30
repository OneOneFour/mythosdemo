/* The loop. Reads the clock, steps the fixed schedule, drains the journal,
   renders. `shell` may import anything; nothing may import `shell`. */

import { stepFixed } from './schedule.js';
import { drain } from './audio.js';
import { bind } from './input.js';
import { demo } from './boot.js';
import { cur } from '../model/world.js';
import { paintTile } from '../view/paint.js';
import { hearts, pockets, trinkets } from '../view/hud.js';
import { heatOverlay } from '../view/overlays.js';

export const clock = { t: 0, dt: 0, frame: 0, acc: 0 };

export function start() {
  bind();
  demo();
}

export function frame(ms, g) {
  const dt = Math.min(0.1, (ms - clock.t) / 1000);
  clock.t = ms; clock.dt = dt; clock.frame++;

  clock.acc = stepFixed(clock.acc + dt);
  drain();
  render(g);
}

/* Renders and mutates nothing. tools/epoch.mjs asserts the second half. */
export function render(g) {
  const b = cur.band;
  if (!b) return;
  for (let ty = 0; ty < 4; ty++)
    for (let tx = 0; tx < 4; tx++) paintTile(g, b, tx, ty, tx * b.tile, ty * b.tile);
  heatOverlay(g, b, null);
  pockets(g, 4, 4);
  hearts(g, 4, 14);
  trinkets(g, 4, 24);
}
