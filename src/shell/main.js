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
import { bands, heightPx, widthPx, write as worldw } from '../model/world.js';
import { placeMachine, placeTile, placeableFromPockets } from '../rules/placement.js';
import { step as stepFx } from '../view/fx.js';
import { render } from '../view/scene.js';
import { boot, newRun } from './boot.js';
import { clearEdges, cmd, flags, pointer, wants } from './input.js';
import { drainJournal } from './notify.js';
import { boons, stepAll, trinkets } from './schedule.js';
import { hoverInfo, pocketHits } from '../view/hud.js';

export const STEP = 1 / 120;
export const MAX_CATCHUP = 0.25;             // s of real time simulated per frame

export const clock = { t: 0, dt: 0, frame: 0, acc: 0 };
export const cam = { x: 0, y: 0 };

/* The frame context handed to `view`. One object, reused, because `view` may not
   import `shell` and allocating a fresh one sixty times a second is waste.
   `mouse` is `cmd.mx`/`cmd.my`/`cmd.hasMouse` copied in every `draw()` — WORLD
   px, same as `cam`, so `view/hover.js` can test world content directly and
   subtract `cam` itself for anything drawn in screen space (the HUD). */
const frameCtx = { cam, t: 0, dt: 0, frame: 0, W: 0, H: 0, flags, mouse: { x: 0, y: 0, has: false } };

/* ---------- one frame of simulation ---------- */
export function step(dt) {
  /* THE MAP OVERVIEW FREEZES THE RUN. Guarded HERE, not in `frame()`, so the
     pause is one fact true of `step()` itself rather than something only the
     real RAF loop knows to honour -- the headless test hook's `frames()`/
     `hold()` call this function directly (there is no RAF loop under
     `?test=1`), and a test proving the pause has to hold a movement key
     through exactly this entry point. Nothing advances: not the clock, not
     `stepAll` (so no substance rule runs), not the camera follow at the
     bottom of this function. `frame()`'s accumulator keeps draining in real
     time regardless -- each call here still costs the caller one `STEP` off
     `clock.acc` even though it does nothing, so no backlog of catch-up frames
     is waiting the instant the map closes. */
  if (flags.showMap) return;

  clock.dt = dt;
  clock.t += dt;
  clock.frame++;

  /* Left mouse and X are the same intent. Resolved here because which DEVICE
     asked is a shell question. */
  const digging = cmd.dig || cmd.mouse;
  const c = {
    left: cmd.left, right: cmd.right, up: cmd.up, down: cmd.down,
    hop: cmd.hop, dig: digging, place: cmd.place, craft: cmd.craft,
    hasMouse: cmd.hasMouse, mx: cmd.mx, my: cmd.my
  };

  stepAll(dt, c);

  /* Purely presentational, and therefore not a rule: the pick swings on the
     clock, not on the simulation. */
  playerw.set('digging', digging && ((clock.t * 9) | 0) % 2 === 0);
  updateCamera(dt);
}

/* One-shot intents. Placement and drafting are EVENTS, not steps, which is why
   they are here and not in `shell/schedule.js` -- and, as of this fix, why this
   runs exactly once per real ANIMATION FRAME rather than once per fixed
   substep. It used to run from inside `step()`: at a refresh rate below 120 Hz
   a single frame runs several substeps and re-read the same still-true
   `wants.machine`, attempting the same placement several times (one success
   plus refusal-toast spam); above 120 Hz a frame can run ZERO substeps, and
   `clearEdges()` still wiped the intent at the end of it, silently dropping a
   press. Each branch self-clears the flag it consumed, immediately, rather
   than waiting for `clearEdges()` -- so a flag this function never reaches
   (the game is paused, `aim` isn't valid yet) survives to the next frame
   instead of being erased on a schedule it knows nothing about. */
function applyIntents() {
  /* Same freeze as `step()`, and the same reason: placing a machine or
     drafting a boon resolves against `aim`, which is a reading of the world
     the player cannot currently see -- the map covers it. A press that lands
     while the map is open is simply dropped, not queued: `clearEdges()` still
     wipes `wants.machine`/`wants.draft`/`cmd.place` on its own schedule
     whether or not this function consumed them. */
  if (flags.showMap) return;

  if (wants.machine && aim.valid && aim.band) {
    /* Anchor the footprint so its BOTTOM row is the aimed tile: you point at the
       space a machine should stand in, not at its top-left corner. `th` comes
       off the row, so this line does not know how tall a furnace is. */
    const def = MACH[M[wants.machine]];
    if (def) placeMachine(aim.band, wants.machine, aim.tx, aim.ty - def.th + 1);
    wants.machine = null;
  }

  if (cmd.place && aim.valid && aim.band) {
    /* The first tile-capable pair in the pockets, in HUD order. A build menu
       would let the player choose; the rule is the same either way. */
    const p = placeableFromPockets(pocketRows())[0];
    if (p) placeTile(aim.band, aim.tx, aim.ty, p.sub, p.form);
    cmd.place = false;
  }

  /* Drafting, bound to a key so both boon tiers are exercisable by hand. The
     director that decides WHEN a god offers something is not built; these are
     the two calls it would make. */
  if (wants.draft === 'trinket') {
    const t = trinkets.draftable()[0];
    if (t) trinkets.grant(t.id);
    wants.draft = null;
  }
  if (wants.draft === 'boon') {
    const b = boons.draftable()[0];
    if (b) boons.grant(b.id);
    wants.draft = null;
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
     which is what a 96-tile astral platform on a wide monitor needs. Bands
     differ in width (astral is inset), so X still clamps to the CURRENT band
     only. */
  const w = widthPx(b);
  cam.x = w > VIEW.w ? clamp(cam.x, b.origin.x, b.origin.x + w - VIEW.w)
                     : b.origin.x + (w - VIEW.w) / 2;

  /* Y clamps to the UNION of every band, not just the current one -- bands
     stack contiguously in world space (`data/world.js` declares them
     top-to-bottom with each origin.y equal to the previous band's bottom
     edge), so this is one seamless column, not three separate ones. Clamping
     per-band used to cap `cam.y` at the current band's own floor even while
     the player kept descending past it: the camera pinned short of the seam,
     `view/scene.js#visible()` correctly stopped drawing the band below (there
     was nothing there to draw yet), and the instant `player.band` flipped,
     this function re-evaluated against the NEW band's range -- whose minimum
     is the seam itself -- snapping `cam.y` up to a full viewport height in one
     frame. That was "digging glitches at the bottom of the screen." A union
     clamp has no such seam: the smooth follow in `updateCamera` eases across
     a band change exactly like it eases across anything else. */
  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const bottom = last.origin.y + heightPx(last);
  const totalH = bottom - top;
  cam.y = totalH > VIEW.h ? clamp(cam.y, top, bottom - VIEW.h)
                          : top + (totalH - VIEW.h) / 2;
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
  frameCtx.mouse.x = cmd.mx;
  frameCtx.mouse.y = cmd.my;
  frameCtx.mouse.has = cmd.hasMouse;
  render(g, frameCtx);
}

/* ---------- the loop ---------- */
let last = 0;

export function frame(now) {
  const t = now / 1000;
  const real = last ? t - last : STEP;
  last = t;

  /* Self-cleared here rather than by `clearEdges()` below: that call is now
     skipped on a zero-substep frame (see the comment further down), and a
     restart left set would otherwise fire again on every frame until one
     finally runs a substep. */
  if (wants.restart) { newRun(); wants.restart = false; }

  clock.acc += Math.min(MAX_CATCHUP, real);
  let n = 0;
  while (clock.acc >= STEP) { step(STEP); clock.acc -= STEP; n++; }
  if (!n) { clock.dt = real; }               // keep the FPS readout honest

  applyIntents();

  /* `cmd.hop` is read inside a fixed substep (`rules/player.js`), so it must
     only be cleared once one has actually run -- above 120 Hz refresh a frame
     can run zero substeps, and clearing it here unconditionally erased a hop
     or a restart before the physics ever saw it. `applyIntents()` above
     already self-clears everything else it consumes, on its own schedule, so
     gating the rest of `clearEdges()` on `n` costs nothing extra. */
  if (n) clearEdges();
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

    /* Read-back of `view/hud.js`'s own last-frame output, for hover assertions.
       `hover` is what a tooltip would show right now; `hits` are the hitboxes
       the HUD strip/panel actually drew, so a test can find the exact rect for
       a `{sub, form}` pair instead of guessing a pixel coordinate — the same
       trap CLAUDE.md's "hardcoded click coordinates" mistake describes. */
    hover: hoverInfo, hits: pocketHits,

    /* Fog of war, TEST ONLY. `model/world.js#write.revealAll` has no other
       caller: several screenshot tests park the camera at a band the player
       never walked to, to prove TERRAIN rendering is correct, which is a
       question fog of war must not be allowed to swallow just because it now
       exists. Nothing a real playthrough does ever reaches this. */
    revealAll: b => worldw.revealAll(b),

    /* Move the pointer to a SCREEN pixel (canvas space, same units `hits`
       reports in) without a real DOM pointer event -- there is no browser
       gesture to synthesize headlessly, and `cmd.mx/my` are WORLD px, so this
       is `toWorld`'s own arithmetic with `cam` standing in for the click. */
    mouseAt(sx, sy) { cmd.mx = cam.x + sx; cmd.my = cam.y + sy; cmd.hasMouse = true; },

    /* Advance n substeps at a fixed dt, then draw once. `applyIntents()` runs
       once per substep here rather than once per call -- as it would inside a
       real `frame()` -- because it now self-clears whatever it consumes, so a
       `wants.machine`/`wants.draft`/`cmd.place` set once by a real key event
       still fires exactly once across the whole call, same as it would in one
       real frame; calling it every iteration just means the test hook does not
       have to guess which substep the real frame boundary would have been. */
    frames(n, dt = STEP) {
      for (let i = 0; i < n; i++) { step(dt); applyIntents(); clearEdges(); }
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
        applyIntents();
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
