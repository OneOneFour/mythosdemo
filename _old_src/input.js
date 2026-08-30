import { VIEW, cv } from './core/canvas.js';
import { cam, run, view } from './sim/state.js';
import { audio, unlockAudio } from './core/sfx.js';


/* ============================================================
   INPUT

   Note for future edits: in the mockup this module existed but was
   imported by nothing and did not even parse. It is wired into
   main.js now, and tools/check.mjs imports it so it can never
   silently rot again.
   ============================================================ */
export const cmd = {
  left: false, right: false, up: false, down: false,
  hop: false, dig: false, place: false,
  mouse: false, mx: 0, my: 0, hasMouse: false
};

/* hop and place are edge-triggered: held keys should not repeat-fire */
let hopHeld = false, placeHeld = false;

export const wants = { restart: false, furnace: false };

const KEYS = {
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
  w: 'up', arrowup: 'up',
  s: 'down', arrowdown: 'down'
};

function set(k, down) {
  const key = k.toLowerCase();
  if (KEYS[key]) cmd[KEYS[key]] = down;
  if (key === ' ') { if (down && !hopHeld) cmd.hop = true; hopHeld = down; }
  if (key === 'x' || key === 'j') cmd.dig = down;
  if (key === 'e') { if (down && !placeHeld) cmd.place = true; placeHeld = down; }
}

export function installInput() {
  if (typeof addEventListener !== 'function') return;

  addEventListener('keydown', e => {
    unlockAudio();                       // browsers need a gesture before audio
    set(e.key, true);
    const k = e.key.toLowerCase();
    if (k === 'g') view.showGrid   = !view.showGrid;
    if (k === 'c') view.showChunks = !view.showChunks;
    if (k === 'h') view.showDebug  = !view.showDebug;
    if (k === 'm') audio.muted = !audio.muted;
    if (k === 'f') wants.furnace = true;
    if (k === 'r' && run.dead) wants.restart = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
      e.preventDefault();
  });

  addEventListener('keyup', e => set(e.key, false));
  addEventListener('blur', () => {
    for (const k of ['left', 'right', 'up', 'down', 'dig', 'place', 'mouse']) cmd[k] = false;
    hopHeld = false; placeHeld = false;
  });

  if (!cv) return;

  const toWorld = e => {
    const r = cv.getBoundingClientRect();
    cmd.mx = cam.x + (e.clientX - r.left) / VIEW.scale;
    cmd.my = cam.y + (e.clientY - r.top)  / VIEW.scale;
    cmd.hasMouse = true;
  };

  cv.addEventListener('pointermove', toWorld);
  cv.addEventListener('pointerdown', e => {
    unlockAudio();
    toWorld(e);
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

/* Called once per frame after the sim has read them. */
export function clearEdges() {
  cmd.hop = false;
  cmd.place = false;
  wants.furnace = false;
  wants.restart = false;
}
