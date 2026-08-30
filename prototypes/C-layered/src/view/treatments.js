/* LAYER view — TREATMENTS: named pure drawing functions, one per row.

   This table plus a name in a substance row is how appearance becomes data.
   Today `world/paint.js:127` reads `if (M.id === 'copper')` — a renderer
   string-comparing a gameplay id, which is only possible because the renderer
   is allowed to import the gameplay table. Here:

     - `data/substances.js` says   look:{ treatments:[{ fn:'glow', col:'hot' }] }
     - `view/paint.js` says        for (const t of look.treatments) TREAT[t.fn](...)
     - and no substance name appears anywhere in `view/`.

   "This material glows" is therefore a row edit. `ingot` in the substance table
   is exactly that case and no paint function was touched to add it.

   A `fn` name that is not a key here fails `tools/resolve.mjs` at build time.

   Every function takes (g, cell, p): `cell` is { px, py, tx, ty, tile } and `p`
   is the row's own parameter object. They may use `hash2` and must not use
   `rand`, so a repaint consumes no randomness and is not a mutation —
   `tools/layers.mjs` refuses a `view -> rand` import. */

import { R, glow as glowRect } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { COL } from '../data/palette.js';

export const TREAT = {
  /* speckles, so a vein is spottable from across a cavern */
  glint(g, c, p) {
    for (let k = 0; k < (p.n || 2); k++)
      R(g, c.px + ((hash2(c.tx + k * 13, c.ty * 5) * 8) | 0),
           c.py + ((hash2(c.ty + k * 7, c.tx * 3) * 8) | 0),
           1, 1, COL[p.col]);
  },

  /* a soft halo: hot ingots, ichor, anything self-lit */
  glow(g, c, p) {
    glowRect(g, c.px + 4, c.py + 4, p.r || 8, COL[p.col], p.a || 0.3);
  },

  /* horizontal courses, for brick and for strata */
  banded(g, c, p) {
    const every = p.every || 3;
    for (let y = 0; y < 8; y++)
      if ((c.ty * 8 + y) % every === 0) R(g, c.px, c.py + y, 8, 1, COL[p.col]);
  }
};
