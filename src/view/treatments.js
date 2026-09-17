/* view layer — treatments: named pure drawing functions a `look` row requests
   by name. A `fn` or colour name that is not a key here fails the content lint
   rather than drawing nothing at depth 300, and a colour parameter under a key
   the lint does not know throws from `colour()` the first time it paints.
   These may use `hash2` and must not use `rand`: a repaint must mutate
   nothing, not even an RNG cursor.

   Every function takes `(g, cell, p)`: `cell` is `{ px, py, tx, ty, tile }` in
   destination pixels and band tiles, `p` the row's own parameter object. A
   machine part gets four more cell fields on the same contract -- `w`/`h`, the
   footprint's pixel size; `turn`, accumulated rotation in radians from the
   model rather than a frame counter; and `t`, the clock. */

import { colour } from '../data/palette.js';
import { LIGHT, R, glow, lineTo, noiseFill } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';

/* How far a decoration reaches, in tiles. Pixels a treatment draws outside its
   own cell are clipped away for good, so `view/paint.js` scans a margin this
   wide and the treatments clamp their own `w`/`h` against it. */
export const EXTENT = Object.freeze({ canopy: 4, grassCap: 1 });

export const TREAT = {

  /* Speckles positioned from the tile's own coordinates, so they sit still
     between frames. */
  glint(g, c, p) {
    const col = colour(p.col);
    for (let k = 0; k < (p.n || 2); k++)
      R(g, c.px + ((hash2(c.tx + k * 13, c.ty * 5) * c.tile) | 0),
           c.py + ((hash2(c.ty + k * 7, c.tx * 3) * c.tile) | 0),
           1, 1, col);
  },

  /* A soft halo, the one non-integer effect here: additive light rather than
     geometry, so it cannot produce a half-pixel edge. The pulse comes from the
     clock plus a position hash when the caller has a clock to give. */
  halo(g, c, p) {
    const base = p.a ?? 0.3;
    const pulse = c.t != null
      ? Math.sin(c.t * 1.1 + hash2(c.tx, c.ty) * 6.283) * (p.pulse ?? 0.08)
      : 0;
    glow(g, c.px + c.tile / 2, c.py + c.tile / 2, p.r || c.tile, colour(p.col), Math.max(0, base + pulse));
  },

  /* Horizontal courses, for brick and for bedded strata. */
  banded(g, c, p) {
    const col = colour(p.col), every = p.every || 3;
    for (let y = 0; y < c.tile; y++)
      if ((c.ty * c.tile + y) % every === 0) R(g, c.px, c.py + y, c.tile, 1, col);
  },

  /* An olive crown: a union of `CANOPY_BLOBS`, a fixed lopsided fan, eroded at
     the rim. Three tones from one light, positional over band coordinates and
     never the chunk's, so a tree straddling a boundary is one tree. */
  canopy(g, c, p) {
    const t = c.tile;
    const tones = [colour(p.leaves?.[0] || 'vdC'),
                   colour(p.leaves?.[1] || 'vdB'),
                   colour(p.leaves?.[2] || p.leaves?.[1] || 'vdA')];
    /* Clamped against the declared reach rather than trusted from the row: a
       crown wider than that is silently clipped at every seam. */
    const spanH = Math.min(p.h ?? 4, EXTENT.canopy) * t;
    const spanW = Math.min(p.w ?? 5, EXTENT.canopy * 2) * t;

    const cx = c.px + t / 2;
    /* Sunk a whole tile, so the crown swallows the trunk's top tile rather than
       perching on it. */
    const baseY = c.py + t * 1.5;

    const blobs = CANOPY_BLOBS.map(([lx, ly, lr], i) => ({
      x: cx + lx * spanW + jit(c.tx, c.ty, i * 2),
      y: baseY - ly * spanH + jit(c.tx, c.ty, i * 2 + 1),
      r: lr * spanW
    }));

    /* Called for anchor tiles outside the chunk being painted, so `cx` and
       `baseY` are routinely negative or past the far edge. Skipping those pixels
       stops nine chunks each paying for the whole crown. */
    const clip = c.clip ?? Infinity;
    const x0 = Math.max(0, Math.round(cx - spanW / 2));
    const x1 = Math.min(clip, Math.round(cx + spanW / 2));
    const y0 = Math.max(0, Math.round(baseY - spanH));
    const y1 = Math.min(clip, Math.round(baseY));
    const ox = c.tx * t - c.px, oy = c.ty * t - c.py;

    for (let y = y0; y < y1; y++) {
      /* Runs, not pixels: a crown is ~900 cells and one `fillRect` each is paid
         on every repaint for no visual difference. */
      let runX = 0, runCol = null;
      for (let x = x0; x <= x1; x++) {
        const col = x < x1 ? leafAt(x, y, blobs, tones, ox, oy) : null;
        if (col === runCol) continue;
        if (runCol) R(g, runX, y, x - runX, 1, runCol);
        runX = x; runCol = col;
      }
    }
  },

  /* A turf cap: a whole tile of bright green over a darker lower edge, speckled
     per tile so it steps with relief, draping over a lip and banking across a
     one-tile step -- which is why `EXTENT.grassCap` is 1 and not 0. */
  grassCap(g, c, p) {
    const t = c.tile;
    const col = colour(p.col || 'grassA');
    const low = colour(p.low || p.col || 'grassA');
    const dark = colour(p.dark || p.low || 'grassC');
    const lowH = Math.max(1, p.lowH ?? ((t / 3) | 0));

    R(g, c.px, c.py, t, t, col);
    R(g, c.px, c.py + t - lowH, t, lowH, low);
    noiseFill(g, c.px, c.py, t, t, [dark, low], p.grain ?? 0.14, seedAt(c.tx, c.ty, 991));

    for (let x = 0; x < t; x++)
      if (hash2(c.tx * t + x, c.ty * 13 + 5) < 0.35)
        R(g, c.px + x, c.py - 1, 1, 1, col);

    if (!c.solidBelow) return;
    const drape = Math.min(p.drape ?? 4, EXTENT.grassCap * t);
    if (c.openL) lip(g, c.px, c.py + t, drape, c.tx, c.ty, low, dark, false);
    if (c.openR) lip(g, c.px + t, c.py + t, drape, c.tx, c.ty, low, dark, true);

    /* Clamped against the declared reach: a bank wider than the chunk margin is
       cut at every seam. */
    const reach = Math.min(p.bevel ?? t, EXTENT.grassCap * t);
    if (c.bankL) bank(g, c.px, c.py, t, reach, c.tx, c.ty, false, col, low, dark);
    if (c.bankR) bank(g, c.px + t, c.py, t, reach, c.tx, c.ty, true, col, low, dark);
  },

  /* A ladder: two rails, with the rung rows taken from the tile's absolute band
     row rather than a counter restarting at each tile's top edge, so a column of
     any length is one ladder. No jitter and no hash. */
  ladder(g, c, p) {
    const t = c.tile;
    const rail = colour(p.body);
    const lit = colour(p.hi ?? p.body);
    const under = colour(p.lo ?? p.body);

    /* Clamped so the two rails can never cross or leave the tile: this treatment
       has no `EXTENT` entry and may not draw outside its own cell. */
    const inset = Math.max(0, Math.min((t >> 1) - 1, p.inset ?? 1));
    const rw = Math.max(1, Math.min(t - inset * 2, p.railW ?? 1));
    const pitch = Math.max(1, p.every ?? 3);
    const deep = Math.max(1, Math.min(pitch, p.tread ?? 1));
    const phase = p.phase ?? 1;

    R(g, c.px + inset, c.py, rw, t, rail);
    R(g, c.px + t - inset - rw, c.py, rw, t, rail);

    const x = c.px + inset, w = t - inset * 2;
    for (let y = 0; y < t; y++) {
      const k = (((c.ty * t + y - phase) % pitch) + pitch) % pitch;
      if (k >= deep) continue;
      R(g, x, c.py + y, w, 1, k === 0 ? lit : under);
    }
  },

  /* Machinery: the parts a `look.parts` list may name. `EXTENT` does not apply
     -- a machine draws live into the frame, never into a chunk canvas -- and a
     part is bounded by its own footprint. Rotation is `c.turn`, 0 unplaced. */

  /* A toothed wheel at four sizes. The teeth reach past the footprint on the
     four orthogonal axes, so two orthogonally adjacent gears overlap teeth in
     the gap and two diagonal ones do not. Tooth count follows the angle grid. */
  gearWheel(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const d = p.d ?? Math.min(bw, bh);
    const x = c.px + ((bw - d) >> 1) + (p.dx | 0);
    const y = c.py + ((bh - d) >> 1) + (p.dy | 0);
    const cx = x + d / 2, cy = y + d / 2;
    const n = p.teeth ?? 8;
    /* A tooth sits on the rim, not on a spike: `rt` defaults to the wheel's own
       radius, which puts the 2x2 tooth block astride the rim and protrudes about
       a pixel -- enough that two wheels one tile apart abut. */
    const rt = p.rt ?? (d / 2);
    const turn = c.turn || 0;

    /* Teeth first, so the rim's dark outline overpaints their inner ends. One
       flat tone per tooth, and the wheel's body rather than its highlight, which
       merges into the lit rim. */
    const tcol = colour(p.col ?? p.body);
    for (let i = 0; i < n; i++) {
      const a = turn + i * (Math.PI * 2 / n);
      R(g, Math.round(cx + Math.cos(a) * rt - 1),
           Math.round(cy + Math.sin(a) * rt - 1), 2, 2, tcol);
    }

    discShaded(g, x, y, d, colour(p.body), colour(p.hi ?? p.body), colour(p.lo ?? p.body));

    /* Spokes are what makes rotation legible at 8 px, but not below a 12 px
       wheel: four dark radii across the 9 px interior of an 11 px wheel is most
       of the disc. */
    if (d >= 12 && (p.spokes ?? 0) > 0) {
      /* In the outline tone, so a spoke reads as a slot cut through the wheel. */
      const slot = colour(p.lo ?? p.body);
      for (let i = 0; i < p.spokes; i++) {
        const a = turn + i * (Math.PI * 2 / p.spokes);
        lineTo(g, Math.round(cx), Math.round(cy),
               Math.round(cx + Math.cos(a) * (d / 2 - 2)),
               Math.round(cy + Math.sin(a) * (d / 2 - 2)), slot);
      }
    }

    /* The boss, always: a wheel with no centre reads as a ring. */
    const hd = p.hd ?? Math.max(2, (d / 3.5) | 0);
    disc(g, Math.round(cx - hd / 2), Math.round(cy - hd / 2), hd,
         colour(p.dark ?? p.lo ?? p.body));
  },

  /* A winding drum seen end-on down its own axis: a squat cylinder with two iron
     hoops and a lit top course. */
  drum(g, c, p) {
    const bw = c.w ?? c.tile;
    const w = p.w ?? Math.max(4, (bw / 2) | 0), h = p.h ?? 5;
    const x = c.px + (p.dx | 0), y = c.py + (p.dy | 0);
    const body = colour(p.body), hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);

    R(g, x, y, w, h, body);
    R(g, x, y, w, 1, hi);
    R(g, x, y + h - 1, w, 1, lo);
    /* Hoops: two vertical bands in the trim colour, inset a pixel from each end. */
    const band = colour(p.trim ?? p.lo ?? p.body);
    R(g, x + 1, y, 1, h, band);
    R(g, x + w - 2, y, 1, h, band);
  },

  /* The post-and-beam frame these machines are bolted into: two uprights and a
     lintel. Drawn under the wheels, so list it first. */
  frame(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const x = c.px, y = c.py;
    const post = p.post ?? 2;
    const body = colour(p.body), hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);

    R(g, x, y, post, bh, body);
    R(g, x + bw - post, y, post, bh, body);
    R(g, x, y, bw, p.beam ?? 2, body);
    R(g, x, y, bw, 1, hi);
    R(g, x, y, 1, bh, hi);
    R(g, x + bw - 1, y, 1, bh, lo);
    if (p.sill) R(g, x, y + bh - 1, bw, 1, lo);
  },

  /* The crank handle: a boss, an arm drawn to the full radius with `lineTo` and
     a knob capped on its end, so which way it points reads at 8 px wide. The
     arm's length does not change with phase. */
  crankArm(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const cx = Math.round(c.px + (p.cx ?? (bw / 2)) + (p.dx | 0));
    const cy = Math.round(c.py + (p.cy ?? (bh / 3)) + (p.dy | 0));
    const r = p.r ?? Math.max(3, (bw / 2) + 1);
    /* `a0` is the resting angle: dead right at phase 0 reads as a lever, so the
       offset is appearance only and still a pure function of `c.turn`. */
    const a = (c.turn || 0) + (p.a0 ?? 0);
    const ex = Math.round(cx + Math.cos(a) * r), ey = Math.round(cy + Math.sin(a) * r);

    /* The bearing, the arm and the grip, all three: a 1 px arm with a 2x2 knob
       read as a scratch over the post, so `thick:2` is what makes it a handle. */
    R(g, cx - 2, cy - 2, 4, 4, colour(p.dark ?? p.body));
    R(g, cx - 1, cy - 1, 2, 2, colour(p.body));
    lineTo(g, cx, cy, ex, ey, colour(p.body), 2);
    R(g, ex - 1, ey - 2, 3, 4, colour(p.col ?? p.hi ?? p.body));
    R(g, ex - 1, ey - 2, 3, 1, colour(p.hi ?? p.col ?? p.body));
  },

  /* A squared timber shaft with iron collars, running along the footprint's own
     long axis, so no row states orientation. `thick` is the shaft's
     cross-section, `inset` how far short of the footprint's ends it stops. */
  shaft(g, c, p) {
    const bw = c.w ?? c.tile, bh = c.h ?? c.tile;
    const vert = p.vert ?? (bh > bw);
    const along = vert ? bh : bw, across = vert ? bw : bh;
    const thick = p.thick ?? Math.max(2, (across / 2) | 0);
    const run = Math.max(1, (p.len ?? along) - (p.inset ?? 0) * 2);

    /* `a` is the coordinate along the shaft, `b` across it: one pair of
       expressions applied twice rather than two copies of the geometry. */
    const a0 = (vert ? c.py : c.px) + (p.inset ?? 0) + (vert ? (p.dy | 0) : (p.dx | 0));
    const b0 = (vert ? c.px : c.py) + ((across - thick) >> 1)
             + (vert ? (p.dx | 0) : (p.dy | 0));
    const box = (bo, bs, ao, as, col) =>
      vert ? R(g, bo, ao, bs, as, col) : R(g, ao, bo, as, bs, col);

    box(b0, thick, a0, run, colour(p.body));
    box(b0, 1, a0, run, colour(p.hi ?? p.body));
    box(b0 + thick - 1, 1, a0, run, colour(p.lo ?? p.body));

    const collar = colour(p.trim ?? p.lo ?? p.body);
    const nc = p.collars ?? 2;
    for (let k = 0; k < nc; k++)
      box(b0 - 1, thick + 2, a0 + (((run - 1) * (nc > 1 ? k / (nc - 1) : 0.5)) | 0), 1, collar);
  }
};

/* `[x, y, r]` per blob, as fractions of the crown's own span: x from the
   trunk's centre, y up from its base, r of the width. */
const CANOPY_BLOBS = [
  [ 0.00, 0.40, 0.29],
  [-0.27, 0.29, 0.22],
  [ 0.26, 0.34, 0.205],
  [-0.13, 0.68, 0.165],
  [ 0.18, 0.62, 0.15]
];

/* Rim erosion: inside `RIM` of a blob's own solidity a pixel is unconditional,
   outside it a pixel survives on its own hash, so only the outline is ragged. */
const RIM = 0.34, RIM_KEEP = 0.56;
const FLECK = 0.16;
const RIM_LIT = 0.58;                   // only the outer part of a lobe is lit or shaded
const LIT_HI = 0.34, LIT_LO = -0.28;

/* +-1 px, positional, so no two crowns in a band are the same crown. */
const jit = (tx, ty, k) => ((hash2(tx * 37 + k, ty * 61 + k * 7) * 3) | 0) - 1;

/* The leaf tone at one pixel, or null for sky. `ox`/`oy` convert a destination
   pixel into band pixel coordinates, which keeps the crown identical across a
   chunk seam. */
function leafAt(x, y, blobs, tones, ox, oy) {
  let best = -1, bx = 0, by = 0, br = 1;
  for (const b of blobs) {
    const dx = x - b.x, dy = y - b.y;
    const m = 1 - (dx * dx + dy * dy) / (b.r * b.r);
    if (m > best) { best = m; bx = dx; by = dy; br = b.r; }
  }
  if (best <= 0) return null;

  const wx = x + ox, wy = y + oy;
  if (best < RIM && hash2(wx * 2 + 11, wy * 3 + 7) > RIM_KEEP) return null;

    /* Which way this pixel faces against the one declared light direction, but
       only over the outer part of a lobe: shading the whole radius put five
       overlapping gradients across the crown and read as diagonal hatching. */
  const lit = -(bx * LIGHT.x + by * LIGHT.y) / (br * 1.42);
  if (best < RIM_LIT) {
    if (lit > LIT_HI) return tones[2];
    if (lit < LIT_LO) return tones[0];
  }
  if (lit > 0 && hash2(wx * 5 + 3, wy * 7 + 13) < FLECK) return tones[2];
  return tones[1];
}

/* Turf spilling over the edge of a cliff, down the face of the tile below, each
   row one or two pixels wide and stopping early on its own hash. `x` is the
   face's own edge: its column on the left, one past it on the right. */
function lip(g, x, y, depth, tx, ty, near, far, right) {
  for (let k = 0; k < depth; k++) {
    if (k > 0 && hash2(tx * 7 + k, ty * 3 + (right ? 11 : 5)) < 0.28) break;
    const w = 1 + ((hash2(tx * 17 + k, ty * 29 + (right ? 5 : 1)) * 2) | 0);
    R(g, right ? x - w : x, y + k, w, 1, k < depth - 2 ? near : far);
  }
}

/* The outer corner of a one-tile step, chamfered in turf: the notch over the
   lower tread filled on the diagonal, a pixel wider per row, with `TURF_LIT` px
   lit from the outer end. The cells stay AIR, so collision is untouched. */
const TURF_LIT = 5;

function bank(g, x, y, t, reach, tx, ty, right, col, low, dark) {
  for (let k = 0; k < t; k++) {
    const jag = hash2(tx * 13 + k, ty * 41 + (right ? 3 : 19)) < 0.42 ? 1 : 0;
    const w = Math.min(reach, k + 1 + jag);
    const x0 = right ? x : x - w;
    const edge = right ? x0 + w - 1 : x0;
    R(g, x0, y + k, w, 1, col);
    if (w > TURF_LIT)
      R(g, right ? x0 : x0 + TURF_LIT, y + k, w - TURF_LIT, 1, low);
      /* A tuft on the slope, one row above the outer pixel, which is open air.
         Never one pixel further out: that would reach past `EXTENT.grassCap` and
         be clipped at a seam. */
    if (hash2(tx * 7 + k * 3, ty * 23 + k) < 0.35) R(g, edge, y + k - 1, 1, 1, col);
    if (hash2(tx * 11 + k, ty * 29 + k * 5) < 0.28) R(g, edge, y + k, 1, 1, dark);
  }
}

/* A circle, one integer row at a time -- no `arc` and no fill path, either of
   which antialiases its own edge. `d` is the diameter and the disc exactly fills
   the `d x d` box at `(x, y)`. */
export function disc(g, x, y, d, col) {
  for (let j = 0; j < d; j++) {
    const k = ((j + 0.5) / d) * 2 - 1;
    const w = Math.max(1, Math.round(d * Math.sqrt(Math.max(0, 1 - k * k))));
    R(g, x + ((d - w) >> 1), y + j, w, 1, col);
  }
}

/* The same disc as a machined wheel: a 1 px dark outline all the way round, a
   mid-tone interior, and a lit crescent on the sun side of the rim. `RIM_R2` is
   squared normalised radius, so the highlight test needs no square root. */
const RIM_R2 = 0.30;
const DISC_LIT = 0.35;

export function discShaded(g, x, y, d, body, hi, lo) {
  disc(g, x, y, d, lo);                       // the outline, as a full disc
  const di = d - 2;
  if (di < 1) return;

  const r = di / 2;
  for (let j = 0; j < di; j++) {
    const ny = ((j + 0.5) - r) / r;
    let runX = 0, runCol = null;
    for (let i = 0; i <= di; i++) {
      const nx = ((i + 0.5) - r) / r;
      const r2 = nx * nx + ny * ny;
      let col = null;
      if (i < di && r2 <= 1) {
        col = body;
        if (r2 > RIM_R2 && -(nx * LIGHT.x + ny * LIGHT.y) / 1.42 > DISC_LIT) col = hi;
      }
      if (col === runCol) continue;
      if (runCol) R(g, x + 1 + runX, y + 1 + j, i - runX, 1, runCol);
      runX = i; runCol = col;
    }
  }
}

/* A stable local seed for a `noiseFill` pass over one tile. Positional, so the
   tile speckles identically on every repaint and from either side of a seam. */
export const seedAt = (tx, ty, salt) =>
  (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663) ^ salt) | 0;

/* Apply a row's treatment list. Exported so the item and machine passes share
   the exact same semantics as `view/paint.js`'s call. */
export function treat(g, look, cell) {
  for (const t of look?.treatments || []) {
    const fn = TREAT[t.fn];
    if (fn) fn(g, cell, t);
  }
}
