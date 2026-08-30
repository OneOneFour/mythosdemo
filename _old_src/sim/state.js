
/* ============================================================
   SHARED MUTABLE STATE

   ES module bindings are read-only for importers, so anything
   written in one module and read in another lives on an object and
   is mutated by property. Carried over from the mockup deliberately.
   ============================================================ */
export const GRAV     = 320;      // px/s^2
export const TERMINAL = 400;      // px/s cap on fall speed

export const clock = { t: 0, dt: 0, frame: 0 };

export const cam   = { x: 0, y: 0, tx: 0, ty: 0 };

export const items = [];          // dropped material, falls under gravity
export const chips = [];          // cosmetic debris

export const view  = {
  showGrid: false, showChunks: false, showDebug: false, titleFade: 1
};

/* run-scoped state; reset by newRun() */
export const run = {
  seed: 1337, t: 0, dead: false, deathCause: '',
  hearts: 5, maxHearts: 5, invuln: 0,
  hasPick: false,
  inv: { soil: 0, stone: 0, copper: 0, timber: 0 },
  beat: 0,                        // index into the tutorial beat sheet
  trial: null,                    // { need, have, done }
  toast: '', toastT: 0,
  deepest: 0
};

export function toast(msg, secs = 3.2) { run.toast = msg; run.toastT = secs; }
