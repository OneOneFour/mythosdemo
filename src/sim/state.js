
/* ============================================================
   DYNAMICS
   ============================================================ */
export const carts   = [];   // horizontal haulage along a drift

export const drops   = [];   // free fall inside a shaft

export const chips   = [];

export const impacts = [];

export const smoke   = [];

export const dust    = [];

export const drips   = [];

export const GRAV = 320;


/* Mutable state that more than one module writes. ES module bindings are
   read-only for importers, so anything written across a module boundary
   lives on an object and is mutated by property instead. */
export const cam   = { y: 300, target: 300 };
export const clock = { t: 0 };
export const view  = { tour: true, lastInput: -99, showGrid: false, titleFade: 1 };

