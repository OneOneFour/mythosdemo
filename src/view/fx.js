/* LAYER view — TRANSIENT PRESENTATION: chips, toasts and the title fade.
   Imports `core` and `data` only. Reads no model and writes none.

   These three things are presentation STATE, owned by the layer that draws
   them: a chip is not a world fact (so not `model`, which would owe it a
   `newRun()` reset), and `view` may not import `shell`. So `shell/notify.js`
   EMITS into this file when it drains a journal row, `shell/main.js` STEPS it,
   and `view/scene.js` DRAWS it -- the same ownership pattern as the chunk cache
   in `view/paint.js`. See docs/DEVELOPER_GUIDE.md#where-does-state-go

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

/* Private stream. Deliberately NOT `rand()` — see the header. Rewound by
   `reset()` below, so a chip's scatter depends on the run rather than on how
   many chips the page has ever emitted. */
const SPARK_SEED = 0x5EEDCAFE;
let spark = mulberry(SPARK_SEED);

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

/* ---------- the toast queue ----------
   ONE LINE IS SHOWN AND UP TO THREE ARE HELD, drained in order from the front.
   This slot used to keep exactly one row and let the newest fact win, which
   lost a fact whenever a frame contained two: `rules/grants.js#step` awards the
   furnace and the cloud dock in the same substep when the First Trial is paid,
   so `CRUDE FURNACE IS GRANTED` -- the whole reward of docs/SPEC.md section 4 --
   was overwritten inside its own frame and the player never saw it
   (docs/PLAYTEST.md B3).

   THE HANDOFF IS WHAT KEEPS A QUEUE FROM BURYING THE NEWEST FACT. The reason
   the slot was single in the first place was urgency: a refusal that arrived
   behind three stale lines would be read late or not at all. So the moment
   anything is waiting, the row on screen is cut to `TOAST_HANDOFF` -- one
   glance, about four short words at 250 ms each -- and the newest row is up
   within a second however many are queued. Nothing is lost and nothing waits.

   A REPEAT REFRESHES RATHER THAN QUEUES. Eleven hand-feeds push eleven
   identical `1 COPPER ORE TITHED` rows (`shell/notify.js`'s own note), and
   stacking those would be 35 s of the same sentence. Matching on the text is
   enough because the text is all this file has.

   THE BANNER KEEPS ITS SINGLE SLOT, and that is a decision rather than an
   omission. `shell/notify.js#BANNERS` maps exactly one journal kind to it (a
   paid trial) and `shell/boot.js` raises the opening title; two of those cannot
   land in one frame, so a banner queue would be machinery for a collision that
   cannot occur -- and a banner is two lines across the middle of the screen, so
   two in a row would hold the centre for five seconds and the second would read
   as though the first had not happened. */
const TOAST_MAX = 3;
const TOAST_HANDOFF = 1.0;

export function toast(text, secs = 3.2) {
  if (!text) return;
  const same = toasts.find(o => o.text === text);
  if (same) same.t = Math.max(same.t, secs);
  else {
    toasts.push({ text, t: secs });
    /* Drops the FRONT, which is the row that has already had its glance. The
       newest fact is the one that must not be discarded. */
    if (toasts.length > TOAST_MAX) toasts.shift();
  }
  if (toasts.length > 1) toasts[0].t = Math.min(toasts[0].t, TOAST_HANDOFF);
}

/* The row on screen. `view/hud.js#toastLine` reads this rather than indexing
   `toasts` itself, so the drain order lives in the file that owns the queue. */
export const frontToast = () => toasts[0] || null;

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
  /* Only the front row ages. The rest are waiting their turn, not fading
     behind it. */
  if (toasts.length && (toasts[0].t -= dt) <= 0) toasts.shift();
  if (banner.fade > 0) banner.fade = Math.max(0, banner.fade - dt * 0.55);
}

/* Cleared by `shell/boot.js` on a new run, for the same reason the chunk cache
   is: a chip from the previous world is a lie. The generator is rewound with
   them, or two runs of the same seed would scatter their chips differently. */
export function reset() {
  spark = mulberry(SPARK_SEED);
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
