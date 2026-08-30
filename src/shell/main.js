/* LAYER shell — THE LOOP. Fixed timestep, camera, and the wiring of input to
   rules. Imports every layer; this is the entry point `index.html` loads.

   ============================================================================
   A FIXED 1/120 s STEP, AND NOT FOR PERFORMANCE.
   No `rules` module ever sees a variable dt. That is what lets fall damage,
   mining time and machine throughput be functions of the WORLD rather than of
   the display: a tile takes exactly its stated seconds at 30 fps and at 144 fps,
   and a 5-tile drop measures 40 px either way. The accumulator is capped, so a
   tab that was backgrounded for a minute does not simulate a minute in one
   frame and teleport the player through the floor.
   ============================================================================

   The journal is drained once per FRAME and not once per substep. Sound is a
   frame-rate phenomenon; the simulation is not. */

import { VIEW, resize, stage } from '../core/canvas.js';
import { clamp } from '../core/math.js';
import { M, MACH } from '../data/machines.js';
import { aim } from '../model/aim.js';
import { items } from '../model/items.js';
import { machines } from '../model/machines.js';
import { PH, PW, player, write as playerw } from '../model/player.js';
import { pocketRows, run } from '../model/run.js';
import { heightPx, widthPx } from '../model/world.js';
import { placeMachine, placeTile, placeableFromPockets } from '../rules/placement.js';
import { step as stepFx } from '../view/fx.js';
import { render } from '../view/scene.js';
import { boot, newRun } from './boot.js';
import { clearEdges, cmd, flags, pointer, wants } from './input.js';
import { drainJournal } from './notify.js';
import { boons, stepAll, trinkets } from './schedule.js';

export const STEP = 1 / 120;
export const MAX_CATCHUP = 0.25;             // s of real time simulated per frame

export const clock = { t: 0, dt: 0, frame: 0, acc: 0 };
export const cam = { x: 0, y: 0 };

/* The frame context handed to `view`. One object, reused, because `view` may not
   import `shell` and allocating a fresh one sixty times a second is waste. */
const frameCtx = { cam, t: 0, dt: 0, frame: 0, W: 0, H: 0, flags };

/* ---------- one frame of simulation ---------- */
export function step(dt) {
  clock.dt = dt;
  clock.t += dt;
  clock.frame++;

  /* Left mouse and X are the same intent. Resolved here because which DEVICE
     asked is a shell question. */
  const digging = cmd.dig || cmd.mouse;
  const c = {
    left: cmd.left, right: cmd.right, up: cmd.up, down: cmd.down,
    hop: cmd.hop, dig: digging, place: cmd.place,
    hasMouse: cmd.hasMouse, mx: cmd.mx, my: cmd.my
  };

  applyIntents(c);
  stepAll(dt, c);

  /* Purely presentational, and therefore not a rule: the pick swings on the
     clock, not on the simulation. */
  playerw.set('digging', digging && ((clock.t * 9) | 0) % 2 === 0);
  updateCamera(dt);
}

/* One-shot intents. Placement and drafting are EVENTS, not steps, which is why
   they are here and not in `shell/schedule.js`. */
function applyIntents(c) {
  if (wants.machine && aim.valid && aim.band) {
    /* Anchor the footprint so its BOTTOM row is the aimed tile: you point at the
       space a machine should stand in, not at its top-left corner. `th` comes
       off the row, so this line does not know how tall a furnace is. */
    const def = MACH[M[wants.machine]];
    if (def) placeMachine(aim.band, wants.machine, aim.tx, aim.ty - def.th + 1);
  }

  if (c.place && aim.valid && aim.band) {
    /* The first tile-capable pair in the pockets, in HUD order. A build menu
       would let the player choose; the rule is the same either way. */
    const p = placeableFromPockets(pocketRows())[0];
    if (p) placeTile(aim.band, aim.tx, aim.ty, p.sub, p.form);
  }

  /* Drafting, bound to a key so both boon tiers are exercisable by hand. The
     director that decides WHEN a god offers something is not built; these are
     the two calls it would make. */
  if (wants.draft === 'trinket') {
    const t = trinkets.draftable()[0];
    if (t) trinkets.equip(t.id);
  }
  if (wants.draft === 'boon') {
    const b = boons.draftable()[0];
    if (b) boons.grant(b.id);
  }
}

/* ---------- camera ----------
   Leads the player in the direction of travel, and looks further DOWN than up,
   because down is where the game is. Clamped to the band the player is in:
   resizing the window moves the camera and nothing else (invariant 2). */
function updateCamera(dt) {
  const b = player.band;
  if (!b) return;
  const tx = player.x + PW / 2 - VIEW.w / 2 + player.face * VIEW.w * 0.08;
  const ty = player.y + PH / 2 - VIEW.h / 2 + Math.min(40, player.vy * 0.12);
  const k = Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  clampCam();
}

function clampCam() {
  const b = player.band;
  if (!b) return;
  /* A band narrower than the viewport centres rather than clamping to a corner,
     which is what a 96-tile astral platform on a wide monitor needs. */
  const w = widthPx(b), h = heightPx(b);
  cam.x = w > VIEW.w ? clamp(cam.x, b.origin.x, b.origin.x + w - VIEW.w)
                     : b.origin.x + (w - VIEW.w) / 2;
  cam.y = h > VIEW.h ? clamp(cam.y, b.origin.y, b.origin.y + h - VIEW.h)
                     : b.origin.y + (h - VIEW.h) / 2;
}

/* ---------- draw ---------- */
export function draw() {
  const g = stage.ctx;
  if (!g) return;
  frameCtx.t = clock.t;
  frameCtx.dt = clock.dt;
  frameCtx.frame = clock.frame;
  frameCtx.W = VIEW.w;
  frameCtx.H = VIEW.h;
  render(g, frameCtx);
}

/* ---------- the loop ---------- */
let last = 0;

export function frame(now) {
  const t = now / 1000;
  const real = last ? t - last : STEP;
  last = t;

  if (wants.restart) newRun();

  clock.acc += Math.min(MAX_CATCHUP, real);
  let n = 0;
  while (clock.acc >= STEP) { step(STEP); clock.acc -= STEP; n++; }
  if (!n) { clock.dt = real; }               // keep the FPS readout honest

  clearEdges();
  stepFx(real);
  drainJournal(clock.t);
  draw();
  requestAnimationFrame(frame);
}

/* ---------- the test hook ----------
   With `?test=1` the RAF loop does not start. The page exposes a handle that
   advances an exact number of substeps at an exact dt and then renders once, so
   a screenshot is bit-reproducible. Nothing here runs in a normal session, and
   a later phase writes screenshot tests against it. */
function installTestHook() {
  globalThis.__mf = {
    ready: true,
    newRun, step, draw, resize,
    clock, cam, player, run, aim, items, machines, cmd, flags,

    /* Advance n substeps at a fixed dt, then draw once. */
    frames(n, dt = STEP) {
      for (let i = 0; i < n; i++) { step(dt); clearEdges(); }
      stepFx(n * dt);
      drainJournal(clock.t);
      draw();
    },

    /* Hold a command set down for n substeps. Edge-triggered commands are
       released after the first substep, exactly as a real key would be. */
    hold(keys, n, dt = STEP) {
      for (const k of Object.keys(keys)) cmd[k] = keys[k];
      for (let i = 0; i < n; i++) {
        step(dt);
        clearEdges();
        if (keys.hop) cmd.hop = false;
        if (keys.place) cmd.place = false;
      }
      stepFx(n * dt);
      drainJournal(clock.t);
      draw();
    }
  };
}

if (typeof document !== 'undefined' && document.getElementById('stage')) {
  const testMode = typeof location !== 'undefined'
                && new URLSearchParams(location.search).has('test');
  boot(testMode ? 1337 : undefined);
  pointer.cam = cam;
  clampCam();
  cam.x = player.x + PW / 2 - VIEW.w / 2;
  cam.y = player.y + PH / 2 - VIEW.h / 2;
  clampCam();
  if (typeof addEventListener === 'function')
    addEventListener('resize', () => clampCam());
  if (testMode) { installTestHook(); draw(); }
  else requestAnimationFrame(frame);
}
