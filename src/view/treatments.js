/* LAYER view — TREATMENTS: named pure drawing functions a `look` row may request.
   Imports `core` and `data` only. Reads no model and mutates nothing.

   ============================================================================
   THIS TABLE PLUS A NAME IN A CONTENT ROW IS HOW APPEARANCE BECAME DATA.
   The previous renderer contained the line `if (M.id === 'copper')` — a
   renderer string-comparing a gameplay id, which was only possible because the
   renderer imported the gameplay table. Here:

     data/substances.js says   look:{ treatments:[{ fn:'glint', col:'veinA', n:2 }] }
     view/paint.js says        for (const t of look.treatments) TREAT[t.fn](g, cell, t)

   and no substance name appears anywhere in `view/`. "This material glints" is
   therefore a row edit, and a `fn` name that is not a key here fails
   `tools/resolve.mjs` at build time rather than drawing nothing at depth 300.
   ============================================================================

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
