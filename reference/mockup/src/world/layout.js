import { CX, W } from '../core/canvas.js';
import { P } from '../core/palette.js';
import { carts, chips, drips, drops, dust, impacts, smoke } from '../sim/state.js';
import { LAVA_Y, LEVELS, SHAFT_W, SURFACE_Y } from './config.js';

export let VOIDS, SHAFTS, PILES, STATIONS, CAGES, RAILS, MINES;


/* --- placement helpers -------------------------------------------------
   The drifts narrow with depth, so a position that is fine on a wide
   screen can fall outside the excavated space on a narrow one. Every
   shaft, rig and station is therefore clamped to the intersection of the
   drifts it actually touches, and pushed clear of the lift shaft. */
export function clampX(x) { return Math.max(10, Math.min(W - 10, x | 0)); }

export function driftRange(i) {
  const l = LEVELS[i];
  return l.h ? [W * l.a + 7, W * l.b - 7] : [8, W - 8];
}

export function spanRange(idx) {
  let lo = 8, hi = W - 8;
  for (const i of idx) {
    const r = driftRange(i);
    lo = Math.max(lo, r[0]); hi = Math.min(hi, r[1]);
  }
  if (hi < lo) { const m = (lo + hi) / 2; lo = hi = m; }
  return [lo, hi];
}

export function levelsBetween(y0, y1) {
  const out = [];
  LEVELS.forEach((l, i) => { if (l.h && l.y >= y0 && l.y <= y1) out.push(i); });
  return out;
}


// keep clear of the lift shaft, choosing whichever side has room
export function dodgeLift(x, half, lo, hi, desired) {
  const keep = (SHAFT_W >> 1) + half + 4;
  if (Math.abs(x - CX) >= keep) return x;
  const left = CX - keep, right = CX + keep;
  const okL = left >= lo, okR = right <= hi;
  if (okL && (!okR || desired < CX)) return left;
  if (okR) return right;
  return x;
}

export function placeShaft(desired, y0, y1, w) {
  const [lo, hi] = spanRange(levelsBetween(y0, y1));
  const half = w / 2;
  let x = Math.max(lo + half, Math.min(hi - half, desired));
  return dodgeLift(x, half, lo + half, hi - half, desired) | 0;
}

export function placeOn(desired, li, half) {
  const [lo, hi] = spanRange([li]);
  let x = Math.max(lo + half, Math.min(hi - half, desired));
  return dodgeLift(x, half, lo + half, hi - half, desired) | 0;
}

export function layoutContent() {
  const L = LEVELS.map(l => l.y);

  /* --- vertical shafts. y0 is the mouth, y1 is the floor it lands on --- */
  SHAFTS = [
    { id: 'A', d: CX -  84, w: 12, y0: L[0], y1: L[1],   kind: 'ore'   },
    { id: 'B', d: CX - 140, w: 14, y0: L[0], y1: L[2],   kind: 'fuel'  },
    { id: 'C', d: CX +  78, w: 12, y0: L[1], y1: L[2],   kind: 'ore'   },
    { id: 'D', d: CX - 108, w: 12, y0: L[2], y1: L[3],   kind: 'ore'   },
    { id: 'E', d: CX + 112, w: 12, y0: L[3], y1: L[4],   kind: 'ore'   },
    { id: 'F', d: CX -  62, w: 12, y0: L[4], y1: L[5],   kind: 'ore'   },
    { id: 'G', d: CX +  40, w: 14, y0: L[2], y1: LAVA_Y, kind: 'spoil' }
  ];
  for (const sh of SHAFTS) sh.x = placeShaft(sh.d, sh.y0, sh.y1, sh.w);
  // separate any two shafts that ended up stacked after clamping
  for (let i = 0; i < SHAFTS.length; i++)
    for (let j = i + 1; j < SHAFTS.length; j++) {
      const a = SHAFTS[i], b = SHAFTS[j];
      if (a.y1 <= b.y0 || b.y1 <= a.y0) continue;
      if (Math.abs(a.x - b.x) >= 11) continue;
      const [lo, hi] = spanRange(levelsBetween(Math.min(a.y0,b.y0), Math.max(a.y1,b.y1)));
      b.x = (b.x + 12 <= hi - b.w/2) ? b.x + 12
          : (b.x - 12 >= lo + b.w/2 ? b.x - 12 : b.x);
    }
  const S = id => SHAFTS.find(s => s.id === id);

  /* --- carved space: drifts, shafts, and the lift shaft --- */
  VOIDS = [];
  // the surface is open air, not carved, but it IS legal space for material
  VOIDS.push({ x: 0, y: SURFACE_Y - 22, w: W, h: 22, kind: 'open' });
  LEVELS.forEach((l, i) => {
    if (i === 0) return;
    VOIDS.push({ x: (W * l.a) | 0, y: l.y - l.h, w: (W * (l.b - l.a)) | 0, h: l.h,
                 kind: 'drift', level: i });
  });
  for (const s of SHAFTS)
    VOIDS.push({ x: s.x - (s.w >> 1), y: s.y0 - 6, w: s.w, h: s.y1 - s.y0 + 6,
                 kind: 'shaft', id: s.id });
  VOIDS.push({ x: CX - (SHAFT_W >> 1), y: 250, w: SHAFT_W, h: L[5] - 250,
               kind: 'lift' });

  /* --- piles. cap is what the floor will hold before it backs up --- */
  PILES = [
    { id: 'ore1',  x: S('A').x,      y: L[1], w: 22, cap: 26, n: 4,  maxH: 9,
      col: P.veinB,  col2: P.ochreC, label: 'ORE' },
    { id: 'fuel',  x: S('B').x,      y: L[2], w: 26, cap: 30, n: 12, maxH: 10,
      col: P.woodB,  col2: P.woodC,  label: 'TIMBER' },
    { id: 'ore2',  x: S('C').x,      y: L[2], w: 24, cap: 28, n: 6,  maxH: 10,
      col: P.veinA,  col2: P.veinC,  label: 'ORE' },
    { id: 'ore3',  x: S('D').x,      y: L[3], w: 22, cap: 26, n: 3,  maxH: 9,
      col: P.veinB,  col2: P.ochreD, label: 'ORE' },
    { id: 'wash',  x: S('E').x,      y: L[4], w: 22, cap: 24, n: 2,  maxH: 9,
      col: '#c8b48a', col2: P.limeD, label: 'WASHED' },
    { id: 'deep',  x: S('F').x,      y: L[5], w: 24, cap: 22, n: 18, maxH: 9,
      col: P.vioHi,  col2: P.vio,    label: 'ORE' },
    /* deck piles: finished goods waiting on a lift landing */
    { id: 'goods1', x: placeOn(CX - 34, 1, 12),      y: L[1], w: 18, cap: 10, n: 2, maxH: 7,
      col: '#b06fe0', col2: '#7d47a8', label: 'CRATES',  crate: true },
    { id: 'goods2', x: placeOn(CX - 34, 2, 12),      y: L[2], w: 18, cap: 10, n: 4, maxH: 7,
      col: '#b06fe0', col2: '#7d47a8', label: 'ESSENCE', crate: true },
    { id: 'goods3', x: placeOn(CX - 34, 3, 12),      y: L[3], w: 18, cap: 10, n: 2, maxH: 7,
      col: '#e6d9a8', col2: P.cuB,    label: 'CRATES',  crate: true },
    { id: 'goods4', x: placeOn(CX - 34, 4, 12),      y: L[4], w: 18, cap: 10, n: 3, maxH: 7,
      col: '#e6d9a8', col2: P.cuB,    label: 'INGOTS',  crate: true },
    { id: 'goods5', x: placeOn(CX - 32, 5, 12),      y: L[5], w: 16, cap: 8,  n: 0, maxH: 6,
      col: P.ichor,  col2: P.cuC,     label: 'ICHOR',   crate: true },
    /* the unworked heap at the bottom — nothing consumes this */
    { id: 'dead',  x: placeOn(CX - 150, 5, 18), y: L[5], w: 30, cap: 34, n: 26, maxH: 11,
      col: P.abyB,   col2: P.vio,     label: 'SPOIL' }
  ];
  const pi = id => PILES.findIndex(p => p.id === id);

  /* --- processing stations. inputs drain piles; output goes somewhere real --- */
  STATIONS = [
    { id: 'SORTER', perOut: 1, prog: 0, kind: 'sorter', x: placeOn(CX - 44, 1, 26) - 20, y: L[1], w: 40, h: 26,
      inputs: [pi('ore1')], rate: 7.5, cool: 0.4, fire: 0, starved: false,
      liquid: null,
      out: { kind: 'cart', from: clampX(CX - 24), to: S('C').x, y: L[1] - 4,
             shaft: 'C', pile: pi('ore2'), col: P.veinA } },

    { id: 'POT', perOut: 3, prog: 0, kind: 'pot', x: placeOn(CX + 26, 2, 28) - 22, y: L[2], w: 44, h: 34,
      inputs: [pi('ore2'), pi('fuel')], rate: 3.7, cool: 1.0, fire: 0, starved: false,
      liquid: '#7fd36b',
      out: { kind: 'cart', from: clampX(CX + 30), to: CX - 30, y: L[2] - 4,
             pile: pi('goods2'), col: '#b06fe0' },
      spoil: true },

    { id: 'WASHERY', perOut: 2, prog: 0, kind: 'wash', x: placeOn(CX - 60, 3, 27) - 21, y: L[3], w: 42, h: 28,
      inputs: [pi('ore3')], rate: 3.3, cool: 0.7, fire: 0, starved: false,
      liquid: P.watC,
      out: { kind: 'cart', from: clampX(CX - 12), to: S('E').x, y: L[3] - 4,
             shaft: 'E', pile: pi('wash'), col: '#c8b48a' },
      spoil: true },

    { id: 'CRUCIBLE', perOut: 2, prog: 0, kind: 'crucible', x: placeOn(CX + 58, 4, 29) - 23, y: L[4], w: 46, h: 30,
      inputs: [pi('wash')], rate: 7.1, cool: 1.3, fire: 0, starved: false,
      liquid: P.lavaB,
      out: { kind: 'cart', from: clampX(CX + 56), to: CX - 30, y: L[4] - 4,
             pile: pi('goods4'), col: '#e6d9a8' } },

    /* no fuel reaches this depth, so it never runs */
    { id: 'STILL', perOut: 2, prog: 0, kind: 'still', x: placeOn(CX + 44, 5, 21) - 17, y: L[5], w: 34, h: 26,
      inputs: [pi('deep'), pi('fuel_none')], rate: 3.0, cool: 0.5, fire: 0,
      starved: true, liquid: P.ichor,
      out: { kind: 'pile', pile: pi('goods5') } }
  ];

  /* --- the lift, in five independent stages --- */
  CAGES = [];
  for (let i = 1; i < LEVELS.length; i++) {
    CAGES.push({
      stage: i, top: L[i - 1] - 4, bot: L[i] - 26,
      y: L[i] - 26 - Math.random() * (L[i] - L[i - 1] - 40),
      dir: Math.random() < 0.5 ? -1 : 1, load: 0, wait: 0,
      from: PILES.findIndex(p => p.id === 'goods' + i),
      to:   PILES.findIndex(p => p.id === 'goods' + (i - 1))
    });
  }

  /* --- mining rigs, each at a working face with a rail to a shaft mouth --- */
  MINES = [
    rig(placeOn(CX - 176, 0, 14), L[0] - 8, -1, P.soil,   P.veinB,  S('A'), 1.8, true),
    rig(placeOn(CX + 176, 1, 14), L[1] - 6,  1, P.limeC,  P.limeA,  S('A'), 1.8, false),
    rig(placeOn(CX - 214, 2, 14), L[2] - 6, -1, P.ochreB, P.veinA,  S('D'), 1.5, false),
    rig(placeOn(CX + 186, 3, 14), L[3] - 6,  1, P.aquB,   P.watB,   S('E'), 1.8, false),
    rig(placeOn(CX - 158, 4, 14), L[4] - 6, -1, P.basB,  '#9a4e3c', S('F'), 1.3, false),
    rig(placeOn(CX + 116, 5, 14), L[5] - 6,  1, P.abyB,   P.vioHi,  null,   2.1, false)
  ];
  // the L1 rig hauls to shaft C, not A
  MINES[1].shaft = S('C');
  // the L3 rig works the same level as the washery, so it hauls to its feed pile
  MINES[3].shaft = null;
  MINES[3].dumpPile = pi('ore3');
  // the deepest rig has no shaft below it, so its ore heaps on the floor
  MINES[5].dumpPile = pi('dead');

  /* --- rails: drawn statically wherever carts run --- */
  RAILS = [];
  for (const m of MINES) {
    const target = m.shaft ? m.shaft.x : PILES[m.dumpPile].x;
    RAILS.push({ y: m.y + 6, x0: Math.min(m.x, target), x1: Math.max(m.x, target) });
  }
  for (const s of STATIONS)
    if (s.out.kind === 'cart')
      RAILS.push({ y: s.out.y + 4, x0: Math.min(s.out.from, s.out.to),
                   x1: Math.max(s.out.from, s.out.to) });

  layoutScenery();
  for (const arr of [carts, drops, chips, impacts, smoke, dust, drips]) arr.length = 0;
}

export function rig(x, y, dir, rock, ore, shaft, period, manual) {
  return { x: x | 0, y: y | 0, dir, rock, ore, shaft, period, manual: !!manual,
           t: Math.random(), stage: 0, flash: 0, struck: false, dumpPile: -1,
           rest: manual ? -1.55 : -1.20, reach: manual ? 0.60 : 0.45, ang: 0 };
}


/* ---------- water and lava surfaces (unchanged geometry, kept as content) ---------- */
export let FALLS, LAVAFALLS, EYES;

export function layoutScenery() {
  FALLS = [
    { x: (W * 0.10) | 0, y: 1046, h: 62, w: 7 },
    { x: (W * 0.22) | 0, y: 1046, h: 62, w: 5 },
    { x: (W * 0.80) | 0, y: 1046, h: 62, w: 6 },
    { x: (W * 0.92) | 0, y: 1046, h: 62, w: 8 },
    { x: (W * 0.16) | 0, y: 1154, h: 90, w: 5 }
  ];
  LAVAFALLS = [
    { x: (W * 0.26) | 0, y: 1560, h: 92, w: 6 },
    { x: (W * 0.72) | 0, y: 1520, h: 132, w: 5 },
    { x: (W * 0.94) | 0, y: 1584, h: 68, w: 4 }
  ];
  EYES = [
    { x: (W * 0.14) | 0, y: 1836, s: 2, hue: '#7fe0c8', ph: 0.0 },
    { x: (W * 0.88) | 0, y: 1912, s: 2, hue: '#9ad86a', ph: 1.7 },
    { x: (W * 0.42) | 0, y: 2010, s: 1, hue: '#e07a7a', ph: 3.1 },
    { x: (W * 0.66) | 0, y: 2260, s: 3, hue: '#a06fd6', ph: 4.4 }
  ];
}
