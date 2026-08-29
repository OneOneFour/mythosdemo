import { CX, R, W, lineTo } from '../core/canvas.js';
import { P } from '../core/palette.js';
import { LEVELS, SHAFT_W, SURFACE_Y, WATER_Y } from './config.js';
import { RAILS, SHAFTS, STATIONS } from './layout.js';


/* ---------- pipe primitives ---------- */
export function pipeH(g, x0, x1, y, t) {
  if (x1 <= x0) return;
  R(g, x0, y, x1 - x0, t, P.cuC);
  R(g, x0, y, x1 - x0, 1, P.cuA);
  R(g, x0, y + 1, x1 - x0, 1, P.cuB);
  R(g, x0, y + t - 1, x1 - x0, 1, P.cuD);
  for (let x = x0 + 6; x < x1; x += 22) R(g, x, y - 1, 3, t + 2, P.cuB);
}

export function pipeV(g, x, y0, y1, t) {
  if (y1 <= y0) return;
  R(g, x, y0, t, y1 - y0, P.cuC);
  R(g, x, y0, 1, y1 - y0, P.cuA);
  R(g, x + t - 1, y0, 1, y1 - y0, P.cuD);
  for (let y = y0 + 8; y < y1; y += 20) R(g, x - 1, y, t + 2, 3, P.cuB);
}


/* --- the lift: five stages, each with its own headframe and deck --- */
export function liftStructure(g) {
  const x = CX - (SHAFT_W >> 1);
  for (let i = 1; i < LEVELS.length; i++) {
    const ly = LEVELS[i - 1].y;
    // landing deck across the shaft — this is what breaks the shaft up
    R(g, x - 6, ly - 4, SHAFT_W + 12, 5, P.woodA);
    R(g, x - 6, ly + 1, SHAFT_W + 12, 3, P.woodC);
    for (let k = 0; k < SHAFT_W + 12; k += 8) R(g, x - 6 + k, ly + 1, 1, 3, P.woodD);
    // a hatch the cage passes through, on the right half
    R(g, x + 24, ly - 4, 16, 5, 'rgba(0,0,0,0.55)');
    R(g, x + 23, ly - 5, 1, 7, P.irB);
    R(g, x + 40, ly - 5, 1, 7, P.irB);
    // winding drum for the stage below, hung under this deck
    R(g, x + 26, ly + 4, 12, 9, P.vdB);
    R(g, x + 26, ly + 4, 12, 2, P.vdA);
    R(g, x + 29, ly + 6, 6, 5, P.vdD);
    R(g, x + 24, ly + 6, 2, 4, P.irB);
    // brake lever and rail post on the landing
    R(g, x + 8, ly - 12, 2, 9, P.irB);
    R(g, x + 6, ly - 13, 6, 2, P.irA);
    R(g, x - 6, ly - 14, 1, 11, P.woodB);
    R(g, x - 6, ly - 14, 14, 1, P.woodB);
    // counterweight guide for this stage
    R(g, x + 2, ly + 4, 2, LEVELS[i].y - ly - 8, P.irD);
  }
  // headworks above the surface
  R(g, x - 8, 236, SHAFT_W + 16, 8, P.woodA);
  R(g, x - 12, 228, SHAFT_W + 24, 8, P.irC);
  R(g, x - 12, 228, SHAFT_W + 24, 2, P.irA);
  R(g, x + 12, 212, 20, 16, P.vdB);
  R(g, x + 12, 212, 20, 2, P.vdA);
  R(g, x + 16, 216, 12, 9, P.vdD);
  R(g, x - 26, 244, 14, 40, P.woodB);
  R(g, x - 24, 246, 10, 36, P.woodD);
}

export function drawRails(g) {
  for (const r of RAILS) {
    R(g, r.x0, r.y + 2, r.x1 - r.x0, 1, P.irC);           // rail
    R(g, r.x0, r.y + 4, r.x1 - r.x0, 1, P.irD);
    for (let x = r.x0; x < r.x1; x += 6) R(g, x, r.y + 3, 2, 2, P.woodC);  // sleepers
  }
}


/* --- station bodies. inputs and outputs are drawn where they actually are --- */
export function stationBodies(g) {
  for (const s of STATIONS) {
    const x = s.x, y = s.y - s.h, w = s.w, h = s.h;
    if (s.kind === 'pot') {
      R(g, x, y, w, h, P.limeD);                          // stone vat
      R(g, x, y, 2, h, P.limeC);
      R(g, x + w - 2, y, 2, h, '#6d6656');
      R(g, x - 3, y - 4, w + 6, 5, P.limeC);
      R(g, x - 3, y - 4, w + 6, 1, P.limeA);
      for (let i = 1; i < 3; i++) R(g, x, y + i * (h / 3), w, 1, '#6d6656');
      R(g, x + 4, s.y, w - 8, 5, P.irD);                  // firebox
      R(g, x + 2, s.y + 5, w - 4, 2, P.irC);
      R(g, x - 12, y + 6, 12, 6, P.woodB);                // input launder
      R(g, x - 12, y + 10, 12, 2, P.woodD);
      R(g, x + w, y + 4, 10, 4, P.cuC);                   // output spout
    } else if (s.kind === 'sorter') {
      R(g, x, y, w, h, P.woodB);                          // timber trommel
      R(g, x, y, w, 2, P.woodA);
      R(g, x + 3, y + 4, w - 6, h - 10, P.irD);
      for (let i = 0; i < 5; i++) R(g, x + 4 + i * 7, y + 5, 2, h - 12, P.irB);
      R(g, x - 10, y + 2, 10, 6, P.woodC);                // feed chute
      R(g, x + 4, s.y - 4, w - 8, 4, P.irC);
      R(g, x + w, y + h - 10, 8, 4, P.woodC);             // discharge
    } else if (s.kind === 'wash') {
      R(g, x, y, w, h, P.vdC);                            // bronze washing trough
      R(g, x, y, w, 3, P.vdA);
      R(g, x + 2, y + 4, w - 4, h - 8, P.vdD);
      R(g, x - 8, y - 6, 8, 8, P.cuC);                    // water feed
      R(g, x + w, y + h - 8, 9, 4, P.vdB);
      R(g, x + 4, s.y, w - 8, 4, P.woodC);
    } else if (s.kind === 'crucible') {
      R(g, x, y, w, h, P.irD);
      R(g, x, y, w, 3, P.irB);
      R(g, x + 4, y + 5, w - 8, h - 12, P.basD);
      R(g, x - 3, s.y - 6, w + 6, 5, P.irC);
      R(g, x + w, y + 6, 8, 5, P.irC);                    // pour spout
      R(g, x + 6, y - 10, 8, 10, P.irC);                  // charging chute
      R(g, x + 5, y - 11, 10, 2, P.irA);
    } else if (s.kind === 'still') {
      R(g, x, y, w, h, P.cuC);                            // small alembic
      R(g, x, y, w, 2, P.cuA);
      R(g, x + w / 2 - 4, y - 9, 8, 9, P.cuB);
      R(g, x + w / 2 - 5, y - 10, 10, 2, P.cuA);
      lineTo(g, x + w / 2 + 4, y - 6, x + w + 8, y + 6, P.cuC, 2);
      R(g, x + 3, s.y, w - 6, 4, P.irD);                  // cold, empty firebox
    }
  }
}


/* --- pipes that justify the fluid and waste flows --- */
export function servicePipes(g) {
  const S = id => SHAFTS.find(s => s.id === id);
  const L = LEVELS.map(l => l.y);
  // coolant: aquifer down to the crucible floor
  pipeV(g, CX + 60, WATER_Y + 6, L[4] - 10, 6);
  pipeH(g, CX + 60, CX + 96, WATER_Y + 6, 5);
  pipeH(g, CX + 46, CX + 62, L[4] - 12, 5);
  // waste lines from pot and washery into the spoil shaft
  pipeH(g, CX + 52, S('G').x, L[2] - 22, 5);
  pipeH(g, S('G').x, CX - 24, L[3] - 20, 5);
  // fuel branch off the timber shaft toward the pot firebox
  pipeH(g, S('B').x, CX + 4, L[2] - 8, 5);
  // long-run pipes on the rock face, for texture
  for (const [y, a, b] of [[420, 0.00, 0.30], [520, 0.72, 1.00],
                           [760, 0.00, 0.22], [1450, 0.68, 1.00]]) {
    const x0 = (W * a) | 0, x1 = (W * b) | 0;
    pipeH(g, x0, x1, y, 5);
  }
}

export function surfaceWorks(g) {
  const S = id => SHAFTS.find(s => s.id === id);
  // woodcutter feeding the timber shaft
  const wx = S('B').x;
  R(g, wx - 20, SURFACE_Y - 16, 16, 10, P.woodB);
  R(g, wx - 20, SURFACE_Y - 16, 16, 2, P.woodA);
  R(g, wx - 8, SURFACE_Y - 14, 8, 3, P.irB);
  R(g, wx - 12, SURFACE_Y - 22, 3, 7, P.irC);
  R(g, wx - 6, SURFACE_Y - 10, 10, 5, P.woodC);           // stacked timber
  R(g, wx - 6, SURFACE_Y - 13, 7, 3, P.woodC);
  // ore hopper over shaft A
  const ax = S('A').x;
  R(g, ax - 10, SURFACE_Y - 14, 20, 8, P.woodB);
  R(g, ax - 8, SURFACE_Y - 12, 16, 5, P.woodD);
  R(g, ax - 10, SURFACE_Y - 15, 20, 1, P.woodA);
}
