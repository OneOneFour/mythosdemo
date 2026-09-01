/* LAYER view — TREATMENTS: named pure drawing functions a `look` row may request.
   Imports `core` and `data` only. Reads no model and mutates nothing.

   THIS TABLE PLUS A NAME IN A CONTENT ROW IS HOW APPEARANCE BECAME DATA:

     data/substances.js says   look:{ treatments:[{ fn:'glint', col:'veinA', n:2 }] }
     view/paint.js says        for (const t of look.treatments) TREAT[t.fn](g, cell, t)

   and no substance name appears anywhere in `view/`. A `fn` name that is not a
   key here, and any colour name a `look` block gets wrong, fails
   `npm run check:content` (`tools/content.mjs` assertion 15) rather than drawing
   nothing at depth 300 — which is what actually used to happen, `treat()`'s
   `if (fn)` swallowing an unknown name in silence. The `tools/resolve.mjs` this
   header used to cite has never existed.
   See docs/DEVELOPER_GUIDE.md#colour-and-appearance

   CONTRACT. Every function takes `(g, cell, p)` where `cell` is
   `{ px, py, tx, ty, tile }` in destination pixels and band tiles, and `p` is
   the row's own parameter object.

   THEY MAY USE `hash2` AND MUST NOT USE `rand`. Rendering consumes no
   randomness (ARCHITECTURE invariant 7): a repaint must not be a mutation of
   anything, not even of an RNG cursor, or a screenshot would depend on how many
   times the frame had been drawn. Flicker comes from the clock plus a position
   hash, never from the stream. */

import { colour } from '../data/palette.js';
import { LIGHT, R, glow, noiseFill } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';

/* ---------- HOW FAR A DECORATION REACHES, IN TILES ----------
   A treatment that draws OUTSIDE its own cell is clipped by the chunk canvas it
   is drawing into, and the neighbouring chunk does not independently redraw the
   missing part -- those pixels are permanently lost, silently, with no error and
   nothing visual to notice it by. That is not a hypothesis; docs/AUDIT-2.md
   section 5 read it straight off two adjacent chunk canvases (seed 1, tile
   (7,17): the canopy's top row was out of bounds in its owning chunk and fully
   transparent in the chunk above).

   So every decoration declares its own MAXIMUM reach here, in tiles, in every
   direction, and `view/paint.js` scans a margin of neighbouring tiles that wide
   before it decides a chunk is finished. The number is authoritative rather than
   descriptive: the treatments below CLAMP their own data-supplied `w`/`h`
   against it, so a content row cannot ask for a canopy the margin does not
   cover. Grow one of these and the margin grows with it, in one place.

   `paint.js` takes the largest of them as its margin, so this table is the only
   thing that has to be right. */
export const EXTENT = Object.freeze({ canopy: 4, grassCap: 1 });

export const TREAT = {

  /* Speckles, so a vein is spottable from across a cavern. Positions come from
     the tile's own coordinates, so they sit still between frames. */
  glint(g, c, p) {
    const col = colour(p.col);
    for (let k = 0; k < (p.n || 2); k++)
      R(g, c.px + ((hash2(c.tx + k * 13, c.ty * 5) * c.tile) | 0),
           c.py + ((hash2(c.ty + k * 7, c.tx * 3) * c.tile) | 0),
           1, 1, col);
  },

  /* A soft halo: hot metal, ichor, anything self-lit. The one non-integer
     effect in the project, and it is additive light rather than geometry, so it
     cannot produce a half-pixel edge. */
  halo(g, c, p) {
    glow(g, c.px + c.tile / 2, c.py + c.tile / 2, p.r || c.tile, colour(p.col), p.a ?? 0.3);
  },

  /* Horizontal courses, for brick and for bedded strata. */
  banded(g, c, p) {
    const col = colour(p.col), every = p.every || 3;
    for (let y = 0; y < c.tile; y++)
      if ((c.ty * c.tile + y) % every === 0) R(g, c.px, c.py + y, c.tile, 1, col);
  },

  /* AN OLIVE CROWN, and it is deliberately a THIRD shape.

     What was here was a flat `w` x `h` tile rectangle of two greens -- chosen,
     with a reason recorded in this very comment, over the preserved mockup's
     `oliveTree()`, whose 26 polar-scattered 2x2 dots (verbatim in
     `reference/mockup/src/world/strata.js`) read as fuzz rather than as a tree
     at this project's small viewport. That objection stands. So does the
     rectangle's own problem: it reads as a rectangle. Reverting to the dot
     cloud would trade one wrong answer for the other.

     The third shape is a UNION OF A FEW BLOBS, eroded at the rim. Solid
     interior, so it holds together at 8 px to the tile the way the dot cloud
     never did; a ragged outline, so it is not a rectangle. `CANOPY_BLOBS` is a
     FIXED layout -- five overlapping discs in a deliberately lopsided fan --
     rather than a per-pixel scatter, which is the whole difference: the
     silhouette is designed and only its edge is random. Olives are sparse,
     silver-green and irregular (SPEC section 5), so the fan leans, the two
     upper blobs are small, and the highlight tone gets a scatter of flecks
     where the light catches -- the silver in silver-green.

     THREE TONES, ONE SUN. Underside shade, body, sun-side highlight, chosen per
     pixel from its offset within its own blob projected onto
     `core/pixels.js#LIGHT`. No second light direction, and no baked-in "top
     course is lighter" -- which is what the rectangle did, and why it read as a
     lit box rather than as a lit sphere.

     Everything is positional (`hash2` over BAND pixel coordinates, never the
     chunk's own), so the same crown is identical from either side of a seam --
     without that, a tree straddling a chunk boundary would be two different
     trees meeting in the middle. `paint.js` is the only caller and only when
     `skyExposedAt` is true, a `model` query this file may not make itself. */
  canopy(g, c, p) {
    const t = c.tile;
    const tones = [colour(p.leaves?.[0] || 'vdC'),
                   colour(p.leaves?.[1] || 'vdB'),
                   colour(p.leaves?.[2] || p.leaves?.[1] || 'vdA')];
    /* Clamped against the declared reach, not trusted from the row: the chunk
       margin is sized off `EXTENT` and a crown wider than that would be
       silently clipped at every seam. */
    const spanH = Math.min(p.h ?? 4, EXTENT.canopy) * t;
    const spanW = Math.min(p.w ?? 5, EXTENT.canopy * 2) * t;

    const cx = c.px + t / 2;                    // centred on the trunk
    /* Sunk a WHOLE tile, so the crown swallows the trunk's top tile rather than
       perching on it. Perched, a 3-5 tile trunk with a crown on its last tile
       reads as a palm; overlapped, it reads as a tree. */
    const baseY = c.py + t * 1.5;

    const blobs = CANOPY_BLOBS.map(([lx, ly, lr], i) => ({
      x: cx + lx * spanW + jit(c.tx, c.ty, i * 2),
      y: baseY - ly * spanH + jit(c.tx, c.ty, i * 2 + 1),
      r: lr * spanW
    }));

    /* THE BOUNDING BOX IS CLIPPED TO THE CANVAS ON PURPOSE, and the lower bound
       matters as much as the upper: this is called for anchor tiles OUTSIDE the
       chunk being painted (that is what the margin is for), so `cx`/`baseY` are
       routinely negative or past the far edge. `R()` would clip those pixels
       anyway; skipping them here is what stops nine chunks each paying for the
       whole crown when only one of them can show it. */
    const clip = c.clip ?? Infinity;
    const x0 = Math.max(0, Math.round(cx - spanW / 2));
    const x1 = Math.min(clip, Math.round(cx + spanW / 2));
    const y0 = Math.max(0, Math.round(baseY - spanH));
    const y1 = Math.min(clip, Math.round(baseY));
    const ox = c.tx * t - c.px, oy = c.ty * t - c.py;

    for (let y = y0; y < y1; y++) {
      /* Runs, not pixels: a crown is ~900 cells and one `fillRect` each is a
         cost the chunk bake pays on every repaint for no visual difference. */
      let runX = 0, runCol = null;
      for (let x = x0; x <= x1; x++) {
        const col = x < x1 ? leafAt(x, y, blobs, tones, ox, oy) : null;
        if (col === runCol) continue;
        if (runCol) R(g, runX, y, x - runX, 1, runCol);
        runX = x; runCol = col;
      }
    }
  },

  /* A TURF CAP, and the emphasis is on cap rather than fringe. What this used
     to draw was two pixels of green on a tile's top edge, which reads as a line
     ruled along the ground rather than as ground; docs/ARCHAEOLOGY.md section 1a
     has the older look it is recovered from, and that look was a FULL band --
     `R(g, 0, SURFACE_Y - 6, W, 8, P.grassA)` then `R(g, 0, SURFACE_Y + 2, W, 4,
     P.grassB)`, i.e. a whole tile of bright green over a darker green lower
     edge, with a `noiseFill` speckle pass over both and 1 px tufts above. Same
     three parts here, per tile instead of screen-wide, so it steps with Phase
     7's relief instead of running flat.

     AND IT DRAPES OVER A LIP. A hillside is otherwise a stack of cut cubes: the
     turf stops dead at the top face and the vertical face below it is bare
     subsoil. So where this tile has an open side and solid rock beneath it, the
     turf runs a few pixels down that face, ragged, which is the one detail that
     makes a step read as a bank of earth rather than as a block. That drape is
     why `EXTENT.grassCap` is 1 tile and not 0.

     `paint.js` calls this only when `skyExposedAt` is true. Read the soil row's
     own comment in `data/substances.js` before widening anything here: a
     generic "any air above" test painted grass on cave ceilings. */
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
  }
};

/* ---------- the olive crown's own shape ----------
   `[x, y, r]` per blob, as fractions of the crown's own span: x from the trunk's
   centre, y UP from its base, r of the width. Lopsided on purpose -- a
   symmetrical fan reads as a bush, and an olive is neither symmetrical nor
   round. Five is the count the phase brief asks for the top of (3-5) and the
   fewest that still hides its own seams: three blobs leave visible lobes, seven
   average out into a circle. */
const CANOPY_BLOBS = [
  [ 0.00, 0.40, 0.29],
  [-0.27, 0.29, 0.22],
  [ 0.26, 0.34, 0.205],
  [-0.13, 0.68, 0.165],
  [ 0.18, 0.62, 0.15]
];

/* Rim erosion. Inside `RIM` of the blob's own solidity a pixel is unconditional;
   outside it, it survives on its own hash -- so the interior is solid and only
   the outline is ragged, which is the entire difference between this and a dot
   cloud. */
const RIM = 0.34, RIM_KEEP = 0.56;
const FLECK = 0.16;                     // silver-green: highlight flecks in the light
const RIM_LIT = 0.58;                   // only the outer part of a lobe is lit or shaded
const LIT_HI = 0.34, LIT_LO = -0.28;

/* +-1 px, positional, so no two crowns in a band are the same crown. */
const jit = (tx, ty, k) => ((hash2(tx * 37 + k, ty * 61 + k * 7) * 3) | 0) - 1;

/* The leaf tone at one pixel, or null for sky. `ox`/`oy` convert a destination
   pixel into BAND pixel coordinates, which is what keeps the crown identical
   across a chunk seam. */
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

  /* Which way this pixel faces, against the one declared light direction --
     but only the OUTER part of a lobe takes a light or a shadow tone. Shading
     the whole radius instead put a linear gradient across every blob, and five
     overlapping gradients read as diagonal hatching rather than as foliage;
     confining it to the rim leaves the interior as leaf mass and lights the
     lobes that face the sun, which is what a crown of clustered foliage does. */
  const lit = -(bx * LIGHT.x + by * LIGHT.y) / (br * 1.42);
  if (best < RIM_LIT) {
    if (lit > LIT_HI) return tones[2];
    if (lit < LIT_LO) return tones[0];
  }
  if (lit > 0 && hash2(wx * 5 + 3, wy * 7 + 13) < FLECK) return tones[2];
  return tones[1];
}

/* Turf spilling over the edge of a cliff, down the face of the tile below.
   Ragged by construction: each row down is one or two pixels wide and the run
   stops early on its own hash, so no two lips are the same length and none is a
   ruled vertical line. `x` is the FACE's own edge — the left face's own column
   for a left lip, one past the right face's for a right one. */
function lip(g, x, y, depth, tx, ty, near, far, right) {
  for (let k = 0; k < depth; k++) {
    if (k > 0 && hash2(tx * 7 + k, ty * 3 + (right ? 11 : 5)) < 0.28) break;
    const w = 1 + ((hash2(tx * 17 + k, ty * 29 + (right ? 5 : 1)) * 2) | 0);
    R(g, right ? x - w : x, y + k, w, 1, k < depth - 2 ? near : far);
  }
}

/* A stable local seed for a `noiseFill` pass over one tile. Positional, so the
   same tile speckles identically on every repaint and from either side of a
   chunk seam — the same reason every other function here uses `hash2`. */
export const seedAt = (tx, ty, salt) =>
  (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663) ^ salt) | 0;

/* Apply a row's treatment list. One call site in `view/paint.js`, but exported
   so the item and machine passes share the exact same semantics. */
export function treat(g, look, cell) {
  for (const t of look?.treatments || []) {
    const fn = TREAT[t.fn];
    if (fn) fn(g, cell, t);
  }
}
