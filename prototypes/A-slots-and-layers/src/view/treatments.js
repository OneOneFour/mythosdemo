/* ============================================================
   PAINT TREATMENTS — appearance as data.

   Today src/world/paint.js:127 says `if (M.id === 'copper')` to draw ore
   glints. Here that is `['glint', { col:'veinA', n:2 }]` in copper's look
   row, and this file is a table of small pure functions keyed by name.

   Adding "this material glows":
       data/substances.js   look.treatments: [['glow', { col:'hot', r:6 }]]
   and nothing else, because `glow` is already a row here. Adding a treatment
   nothing has yet is one row here. Either way no paint function is edited and
   no substance is named in `view/`.

   Treatments read hash2(tx, ty) and never rand(), so painting consumes no
   randomness and a repaint is identical to the first paint.
   ============================================================ */

import { R } from '../core/pixels.js';
import { mix } from '../core/color.js';
import { hash2 } from '../core/rng.js';
import { COL } from '../data/palette.js';

/* c = { px, py, tx, ty, tile, look, exposed } */
export const TREAT = {

  grain(g, c, p) {
    void p;
    for (let y = 0; y < c.tile; y++)
      for (let x = 0; x < c.tile; x++) {
        const h = hash2(c.tx * c.tile + x, c.ty * c.tile + y);
        if (h < 0.16) R(g, c.px + x, c.py + y, 1, 1, COL[c.look.lo]);
        else if (h > 0.90) R(g, c.px + x, c.py + y, 1, 1, COL[c.look.hi]);
      }
  },

  edges(g, c, p) {
    void p;
    if (c.exposed.up)
      R(g, c.px, c.py, c.tile, 2, COL[c.look.hi]);
    if (c.exposed.left)
      R(g, c.px, c.py, 1, c.tile, mix(COL[c.look.base], COL[c.look.hi], 0.45));
    if (c.exposed.right)
      R(g, c.px + c.tile - 1, c.py, 1, c.tile, mix(COL[c.look.base], COL[c.look.lo], 0.5));
    if (c.exposed.down)
      R(g, c.px, c.py + c.tile - 1, c.tile, 1, COL[c.look.lo]);
  },

  glint(g, c, p) {
    for (let k = 0; k < (p.n ?? 2); k++)
      R(g, c.px + ((hash2(c.tx + k * 13, c.ty * 5) * c.tile) | 0),
           c.py + ((hash2(c.ty + k * 7, c.tx * 3) * c.tile) | 0),
           1, 1, COL[p.col]);
  },

  banded(g, c, p) {
    for (let y = 0; y < c.tile; y += (p.every ?? 3))
      R(g, c.px, c.py + y, c.tile, 1, COL[p.col]);
  },

  glow(g, c, p) {
    const r = p.r ?? 6;
    R(g, c.px - r, c.py - r, c.tile + r * 2, c.tile + r * 2,
      mix(COL[p.col], '#000000', 1 - (p.a ?? 0.35)));
  }
};

export const TREAT_NAMES = Object.freeze(Object.keys(TREAT));
