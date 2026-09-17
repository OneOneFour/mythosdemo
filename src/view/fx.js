/* view layer — transient presentation: chips, toasts and the title fade,
   whose state this layer owns. `shell/notify.js` emits here when it drains a
   journal row, `shell/main.js` steps it, `view/scene.js` draws it.

   Chips must not consume `rand()`. The journal drains once per frame, so the
   number of draws would depend on the display refresh rate and the world would
   depend on framerate. This file carries its own generator, seeded from a
   constant and advanced only here. */

import { mulberry } from '../core/rng.js';
import { R } from '../core/pixels.js';

const MAX_CHIPS = 600;
const CHIP_GRAV = 340;

/* Rewound by `reset()`, so a chip's scatter depends on the run rather than on
   how many chips the page has ever emitted. */
const SPARK_SEED = 0x5EEDCAFE;
let spark = mulberry(SPARK_SEED);

export const chips = [];
export const toasts = [];
export const banner = { text: '', sub: '', fade: 0 };

/* `n` chips bursting from a world point. `col` is already resolved hex. */
export function burst(x, y, n, col, spread = 90) {
  for (let k = 0; k < n; k++) {
    if (chips.length >= MAX_CHIPS) break;
    chips.push({
      x, y,
      vx: (spark() - 0.5) * spread,
      vy: -30 - spark() * 60,
      life: 0.28 + spark() * 0.35,
      col
    });
  }
}

/* One row shows and up to three are held, drained from the front. A repeat
   refreshes rather than queues, matched on the text. The moment anything
   waits, the row on screen is cut to `TOAST_HANDOFF`. */
const TOAST_MAX = 3;
const TOAST_HANDOFF = 1.0;

export function toast(text, secs = 3.2) {
  if (!text) return;
  const same = toasts.find(o => o.text === text);
  if (same) same.t = Math.max(same.t, secs);
  else {
    toasts.push({ text, t: secs });
    /* The front row has already had its glance; the newest is never dropped. */
    if (toasts.length > TOAST_MAX) toasts.shift();
  }
  if (toasts.length > 1) toasts[0].t = Math.min(toasts[0].t, TOAST_HANDOFF);
}

/* The row on screen. `view/hud.js#toastLine` reads this rather than indexing
   `toasts` itself. */
export const frontToast = () => toasts[0] || null;

export function title(text, sub, secs = 1) {
  banner.text = text; banner.sub = sub; banner.fade = secs;
}

/* Called once per frame from `shell/main.js`. `dt` is seconds. */
export function step(dt) {
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i];
    c.life -= dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += CHIP_GRAV * dt;
    if (c.life <= 0) chips.splice(i, 1);
  }
  /* Only the front row ages; the rest are waiting their turn, not fading. */
  if (toasts.length && (toasts[0].t -= dt) <= 0) toasts.shift();
  if (banner.fade > 0) banner.fade = Math.max(0, banner.fade - dt * 0.55);
}

/* Called by `shell/boot.js` on a new run. The generator is rewound with the
   chips, or two runs of the same seed would scatter them differently. */
export function reset() {
  spark = mulberry(SPARK_SEED);
  chips.length = 0;
  toasts.length = 0;
  banner.text = ''; banner.sub = ''; banner.fade = 0;
}

export function drawChips(g, cam, W, H) {
  for (const c of chips) {
    const x = (c.x - cam.x) | 0, y = (c.y - cam.y) | 0;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    R(g, x, y, 1, 1, c.col);
  }
}
