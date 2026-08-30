/* LAYER view — TRANSIENT PRESENTATION: chips, toasts and the title fade.
   Imports `core` and `data` only. Reads no model and writes none.

   ============================================================================
   DECLARED ADDITION to the file list in the brief, with the reason.
   These three things are STATE, they are not the model, and they have to live
   somewhere. The candidates were:

     model/   wrong: a chip is not a world fact, and `newRun()` would owe it a
              reset obligation for something a screenshot does not depend on.
     shell/   wrong: `view` may not import `shell`, so nothing could draw them.
     view/    correct: presentation state, owned by the layer that draws it.

   So `shell/notify.js` EMITS into this file when it drains a journal row,
   `shell/main.js` STEPS it, and `view/scene.js` DRAWS it. That is the same
   ownership pattern as the chunk cache in `view/paint.js`.
   ============================================================================

   RANDOMNESS. Chips must not consume `rand()`. The journal is drained once per
   FRAME, so the number of drains depends on the display refresh rate — a chip
   drawing from the run's stream would make the world itself depend on framerate,
   which is exactly the determinism bug invariant 7 forbids. So this file carries
   its own generator, seeded from a constant and advanced only here. Two players
   at 60 and 144 fps see different sparks and dig identical worlds. */

import { mulberry } from '../core/rng.js';
import { R } from '../core/pixels.js';

const MAX_CHIPS = 600;
const CHIP_GRAV = 340;

/* Private stream. Deliberately NOT `rand()` — see the header. */
const spark = mulberry(0x5EEDCAFE);

export const chips = [];
export const toasts = [];
export const banner = { text: '', sub: '', fade: 0 };

/* ---------- emit, called from `shell/notify.js` ---------- */

/* `n` chips bursting from a world point. `col` is already resolved hex: the
   caller has the `look` row, and this file has no business reading content. */
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

export function toast(text, secs = 3.2) {
  if (!text) return;
  toasts.length = 0;                 // one line at a time; the newest fact wins
  toasts.push({ text, t: secs });
}

export function title(text, sub, secs = 1) {
  banner.text = text; banner.sub = sub; banner.fade = secs;
}

/* ---------- step, called once per frame from `shell/main.js` ---------- */
export function step(dt) {
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i];
    c.life -= dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += CHIP_GRAV * dt;
    if (c.life <= 0) chips.splice(i, 1);
  }
  for (let i = toasts.length - 1; i >= 0; i--)
    if ((toasts[i].t -= dt) <= 0) toasts.splice(i, 1);
  if (banner.fade > 0) banner.fade = Math.max(0, banner.fade - dt * 0.55);
}

/* Cleared by `shell/boot.js` on a new run, for the same reason the chunk cache
   is: a chip from the previous world is a lie. */
export function reset() {
  chips.length = 0;
  toasts.length = 0;
  banner.text = ''; banner.sub = ''; banner.fade = 0;
}

/* ---------- draw ---------- */
export function drawChips(g, cam, W, H) {
  for (const c of chips) {
    const x = (c.x - cam.x) | 0, y = (c.y - cam.y) | 0;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    R(g, x, y, 1, 1, c.col);
  }
}
