/* LAYER shell — KEYBOARD AND POINTER. Imports `core`, `model` (read) and
   `shell`.

   ============================================================================
   NOTE FOR FUTURE EDITS, kept from the previous codebase because it is still
   the relevant warning: in the original mockup this module existed, was
   imported by nothing, and did not even parse. It is wired into
   `shell/main.js` now, and the test hook exercises it, so it cannot silently
   rot again.
   ============================================================================

   `hop` and `place` are EDGE-TRIGGERED. A held key must not repeat-fire: a held
   space bar that re-launched every frame turned a one-tile hop into flight, and
   a held place key emptied the pockets into a wall in half a second.
   `clearEdges()` is called once per frame AFTER the rules have read them, which
   is why the flag lives here and not on the key state.

   AUDIO IS UNLOCKED FROM THE FIRST GESTURE, on both the key and pointer paths.
   Browsers refuse to start an AudioContext before one, and the gesture is not
   ours to fake. */

import { VIEW, stage } from '../core/canvas.js';
import { buildableMachines } from '../model/run.js';
import { audio, unlockAudio } from './audio.js';

/* The command set the rules read. One object, mutated by property, per the
   project convention for cross-module mutable state. `craft` is a HOLD, like
   `dig`, not an edge -- `rules/crafting.js` accumulates while it is true and
   forgets the bar the instant it is not. */
export const cmd = {
  left: false, right: false, up: false, down: false,
  hop: false, dig: false, place: false, craft: false, drop: false,
  mouse: false, mx: 0, my: 0, hasMouse: false
};

/* One-shot intents, consumed and cleared by `shell/main.js`. Separate from
   `cmd` because these are requests to the shell, not movement. */
export const wants = { restart: false, machine: null, draft: null };

/* Presentation toggles. Read by `view` through the frame context — `view` may
   not import `shell`, so they are passed in rather than imported. `showMap` is
   the full-world overview: `shell/main.js#frame()` reads it to freeze the
   substep loop, and `view/scene.js#render()` reads it to take the overview
   render path instead of the normal camera-relative one. */
export const flags = { showGrid: false, showChunks: false, showDebug: false, showInv: false, showMap: false };

const KEYS = {
  a: 'left',  arrowleft: 'left',
  d: 'right', arrowright: 'right',
  w: 'up',    arrowup: 'up',
  s: 'down',  arrowdown: 'down'
};

let hopHeld = false, placeHeld = false, dropHeld = false;

function set(k, down) {
  const key = k.toLowerCase();
  if (KEYS[key]) cmd[KEYS[key]] = down;
  if (key === ' ')                  { if (down && !hopHeld) cmd.hop = true; hopHeld = down; }
  if (key === 'x' || key === 'j')   cmd.dig = down;
  if (key === 'e')                  { if (down && !placeHeld) cmd.place = true; placeHeld = down; }
  if (key === 'u')                  cmd.craft = down;
  /* 'q' for the drop verb (CLAUDE.md D4's prerequisite) -- EDGE-TRIGGERED,
     same `*Held` latch idiom as `hop`/`place` above: this file's own header
     already records that a held key emptying the pockets into a wall in
     half a second is a bug, and a held drop would empty the pockets one
     pair at a time just as fast. */
  if (key === 'q')                  { if (down && !dropHeld) cmd.drop = true; dropHeld = down; }
}

export function installInput() {
  if (typeof addEventListener !== 'function') return;

  addEventListener('keydown', e => {
    unlockAudio();
    set(e.key, true);
    const k = e.key.toLowerCase();
    if (k === 'g') flags.showGrid   = !flags.showGrid;
    if (k === 'c') flags.showChunks = !flags.showChunks;
    if (k === 'h') flags.showDebug  = !flags.showDebug;
    if (k === 'i') flags.showInv    = !flags.showInv;
    /* 'o' for "overview" -- 'm' was already mute, and every other mnemonic
       letter (map, w/a/s/d, world) was claimed by movement or an earlier
       phase; checked the full `KEYS` table and every `if (k === ...)` above
       before picking it. Same edge-triggered boolean-flip idiom as `showGrid`/
       `showChunks`/`showDebug`/`showInv` -- a held key does not matter here,
       since the map is a mode you sit in, not an action you repeat. */
    if (k === 'o') flags.showMap    = !flags.showMap;
    if (k === 'm') audio.muted = !audio.muted;
    if (k === 'f') wants.machine = 'furnace';
    if (k === 't') wants.draft = 'trinket';
    if (k === 'b') wants.draft = 'boon';
    if (k === 'l') wants.machine = 'lift';
    if (k === 'r') wants.restart = true;

    /* Digits only mean anything while the inventory panel is open: they pick
       the Nth row of `model/run.js#buildableMachines()`, the SAME list and
       SAME order `view/hud.js`'s BUILD section draws, so "press 3" and "the
       panel's third row" can never disagree about which machine that is.
       Unbound with the panel closed rather than always-on, so a digit typed
       during ordinary play (there is nothing else digits do yet) is not a
       silent machine-placement trap. */
    if (flags.showInv) {
      const slot = '123456789'.indexOf(k);
      if (slot >= 0) {
        const list = buildableMachines();
        if (list[slot]) wants.machine = list[slot].id;
      }
    }

    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
      e.preventDefault();
  });

  addEventListener('keyup', e => set(e.key, false));

  /* Losing focus must release everything. A key that was down when the tab
     changed stays down forever otherwise, and the player returns to a character
     walking into a wall. */
  addEventListener('blur', () => {
    for (const k of ['left', 'right', 'up', 'down', 'dig', 'place', 'craft', 'mouse']) cmd[k] = false;
    hopHeld = false; placeHeld = false; dropHeld = false;
  });

  const cv = stage.cv;
  if (!cv) return;

  /* Pointer position in WORLD pixels. The canvas is upscaled by CSS, so the
     divide by `VIEW.scale` is what maps a screen pixel back to a world one. The
     camera offset is supplied by `shell/main.js` because the camera is its. */
  const toWorld = (e, cam) => {
    const r = cv.getBoundingClientRect();
    cmd.mx = cam.x + (e.clientX - r.left) / VIEW.scale;
    cmd.my = cam.y + (e.clientY - r.top) / VIEW.scale;
    cmd.hasMouse = true;
  };
  pointer.toWorld = toWorld;

  cv.addEventListener('pointermove', e => toWorld(e, pointer.cam));
  cv.addEventListener('pointerdown', e => {
    unlockAudio();
    toWorld(e, pointer.cam);
    if (e.button === 2) cmd.place = true; else cmd.mouse = true;
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointerup', e => {
    if (e.button === 2) cmd.place = false; else cmd.mouse = false;
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerleave', () => { cmd.hasMouse = false; cmd.mouse = false; });
}

/* The camera the pointer maps against. `shell/main.js` points this at its own
   camera object once, rather than this file importing the loop and creating a
   cycle inside `shell`. */
export const pointer = { cam: { x: 0, y: 0 }, toWorld: null };

/* Called once per frame after the rules have read the command set. */
export function clearEdges() {
  cmd.hop = false;
  cmd.place = false;
  cmd.drop = false;
  wants.restart = false;
  wants.machine = null;
  wants.draft = null;
}
