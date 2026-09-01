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
import { R, glow } from '../core/pixels.js';
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

  /* A green cap on the top few pixels of a tile, plus a few tufts poking one
     pixel higher -- the mockup's grass-tuft look
     (`reference/mockup/src/world/strata.js#drawSurface`), ported to a single
     tile rather than a screen-wide pass. `paint.js` only calls this when
     `skyExposedAt` is true, which is what keeps grass off a tunnel ceiling. */
  grassCap(g, c, p) {
    const col = colour(p.col || 'grassA'), h = p.h || 2;
    R(g, c.px, c.py, c.tile, h, col);
    for (let x = 0; x < c.tile; x++)
      if (hash2(c.tx * c.tile + x, c.ty * 13 + 5) < 0.35)
        R(g, c.px + x, c.py - 1, 1, 1, col);
  }
};

/* Apply a row's treatment list. One call site in `view/paint.js`, but exported
   so the item and machine passes share the exact same semantics. */
export function treat(g, look, cell) {
  for (const t of look?.treatments || []) {
    const fn = TREAT[t.fn];
    if (fn) fn(g, cell, t);
  }
}
