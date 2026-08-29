import { world } from './build.js';
import { VOIDS } from './layout.js';


/* ---------- world layout ---------- */
export const WORLD_H = 2520;

export const BANDS = [
  { name:'THE HEAVENS',    y0:   0, y1: 300, act:'—' },
  { name:'THE DIG SITE',   y0: 300, y1: 372, act:'I' },
  { name:'PALE LIMESTONE', y0: 372, y1: 640, act:'I' },
  { name:'OCHRE STRATA',   y0: 640, y1:1010, act:'II' },
  { name:'THE AQUIFER',    y0:1010, y1:1330, act:'III' },
  { name:'BASALT & BRINE', y0:1330, y1:1740, act:'IV' },
  { name:'THE ABYSS',      y0:1740, y1:2180, act:'V' },
  { name:'GATES OF HADES', y0:2180, y1:2520, act:'VI' }
];

export const SURFACE_Y = 340;

export function bandAt(y) {
  const i = BANDS.findIndex(b => y < b.y1);
  return i < 0 ? BANDS[BANDS.length - 1] : BANDS[i];   // -1 means below the floor
}

/* ============================================================
   EXCAVATION MODEL
   Everything below is derived from an explicit list of carved voids.
   Rock is solid unless it appears in VOIDS. Falling material only
   travels inside a SHAFT, and always terminates on a floor, where it
   accumulates in a PILE. A PILE only shrinks if something consumes it.
   ============================================================ */

/* Working levels. Each is a horizontal drift with a floor at y.
   The mine narrows with depth — less excavated the deeper you go. */
export const LEVELS = [
  { name: 'SURFACE',   y:  340, a: 0.00, b: 1.00, h:  0 },
  { name: 'LEVEL I',   y:  618, a: 0.03, b: 0.95, h: 44 },
  { name: 'LEVEL II',  y:  898, a: 0.01, b: 0.99, h: 52 },
  { name: 'LEVEL III', y: 1288, a: 0.09, b: 0.85, h: 46 },
  { name: 'LEVEL IV',  y: 1638, a: 0.15, b: 0.89, h: 46 },
  { name: 'LEVEL V',   y: 2138, a: 0.24, b: 0.72, h: 42 }
];

export const LAVA_Y = 1652, WATER_Y = 1108;

export const SHAFT_W = 44;                         // the elevator shaft
