/* LAYER view — TREATMENTS: named pure drawing functions a `look` row may request.
   Imports `core` and `data` only. Reads no model and mutates nothing.

   THIS TABLE PLUS A NAME IN A CONTENT ROW IS HOW APPEARANCE BECAME DATA:

     data/substances.js says   look:{ treatments:[{ fn:'glint', col:'veinA', n:2 }] }
     view/paint.js says        for (const t of look.treatments) TREAT[t.fn](g, cell, t)

   and no substance name appears anywhere in `view/`. A `fn` name that is not a
   key here fails `tools/resolve.mjs` at build time rather than drawing nothing
   at depth 300. See docs/DEVELOPER_GUIDE.md#colour-and-appearance

   CONTRACT. Every function takes `(g, cell, p)` where `cell` is
   `{ px, py, tx, ty, tile }` in destination pixels and band tiles, and `p` is
   the row's own parameter object.

   THEY MAY USE `hash2` AND MUST NOT USE `rand`. Rendering consumes no
   randomness (ARCHITECTURE invariant 7): a repaint must not be a mutation of
   anything, not even of an RNG cursor, or a screenshot would depend on how many
   times the frame had been drawn. Flicker comes from the clock plus a position
   hash, never from the stream. */

import { colour } from '../data/palette.js';
import { R, glow, noiseFill } from '../core/pixels.js';
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

  /* A blocky canopy over a trunk's TOP tile: `w` x `h` TILES of solid colour,
     centred on the trunk and sitting flush on top of it, with a lighter top
     course rather than a dithered edge -- deliberately closer to Terraria's
     leaf blocks than to the preserved mockup's stochastic dot-cloud
     `oliveTree()` (`reference/mockup/src/world/strata.js`), which reads as
     fuzzy rather than as a tree at this project's small viewport. `paint.js`
     is the only caller, and only when `skyExposedAt` is true -- "a clear shot
     to the sky", which is a `model/tiles.js` query this file may not make
     itself (data + core only, see the file header). */
  canopy(g, c, p) {
    const base = colour(p.leaves?.[0] || 'vdB'), hi = colour(p.leaves?.[1] || 'vdA');
    const w = (p.w || 3) * c.tile, h = (p.h || 2) * c.tile;
    const bx = (c.px + c.tile / 2 - w / 2) | 0, by = c.py - h;
    R(g, bx, by, w, h, base);
    R(g, bx, by, w, Math.max(1, (c.tile / 4) | 0), hi);
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
