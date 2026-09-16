/* LAYER view — the SLOT primitive: a swatch, the count in the bottom-right
   corner in a compact face, and an optional corner glyph. The CALLER decides
   what the glyph means; this file draws pixels and carries no substance or
   machine name.

   A LEAF, deliberately: it does not push into `./state.js#drawn` itself.
   Every caller so far (`grid.js`) is already a container that records the
   slot's content alongside its own geometry -- one record per slot, not two.
   A standalone equipment slot would be a 1xN `grid.js` call. */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';

const DIM = colour('uiDim'), INK = colour('ui'), BACK = colour('uiBack');

export const SLOT_SIZE = 16;

/* `opts`: { x, y, size?, item, focused?, frameColour? }.
   `item` is `{ sub, form, n, mass, colour, glyph }` or `null` for empty.
   `colour` is a resolved hex/rgb string: a swatch colour is a fact about a
   substance's `look`, and this file may not import `data/substances.js` to
   find it, so the CALLER resolves `SUB[sub].look.item`.
   Returns `{ sub, form, n, mass }`, the shape `__mf.ui` projects. */
export function drawSlot(g, opts) {
  const { item, focused = false, frameColour = null } = opts;
  let { x, y, size = SLOT_SIZE } = opts;
  x |= 0; y |= 0; size |= 0;

  R(g, x, y, size, size, mix(BACK, DIM, 0.12));
  if (focused) R(g, x, y, size, 1, INK);

  if (!item) return { sub: null, form: null, n: 0, mass: 0 };

  const { sub = null, form = null, n = 0, mass = 0, colour: swatch = DIM, glyph = null } = item;
  const pad = 2;
  R(g, x + pad, y + pad, size - pad * 2, size - pad * 2, swatch);

  if (frameColour) {
    R(g, x, y, size, 1, frameColour);
    R(g, x, y, 1, size, frameColour);
    R(g, x, y + size - 1, size, 1, frameColour);
    R(g, x + size - 1, y, 1, size, frameColour);
  }
  if (glyph) drawText(g, glyph, x + 1, y + 1, INK, 1, 1);
  if (n > 0) {
    const s = String(n);
    const tw = textWidth(s);
    drawText(g, s, x + size - tw - 1, y + size - 8, INK, 1, 1);
  }
  return { sub, form, n, mass };
}

/* A slot's own highlight border, drawn as a POST-HOC overlay against the
   ABSOLUTE rectangle `grid.js#drawGrid` already returned for it. `s` is one
   entry of that returned `slots` array, not a fresh rectangle -- callers
   never recompute geometry `drawGrid` already settled.

   TWO CONCENTRIC 1-PX BORDERS, the second inset by one pixel in the same
   colour: at ~1/3 window resolution one pixel of `uiGood` against a substance
   swatch reads as an edge rather than as a choice. No caller opts out -- "this
   slot is called out" must look like one thing, not two. */
export function frameSlot(g, s, col) {
  R(g, s.x, s.y, s.w, 1, col);
  R(g, s.x, s.y, 1, s.h, col);
  R(g, s.x, s.y + s.h - 1, s.w, 1, col);
  R(g, s.x + s.w - 1, s.y, 1, s.h, col);

  R(g, s.x + 1, s.y + 1, s.w - 2, 1, col);
  R(g, s.x + 1, s.y + 1, 1, s.h - 2, col);
  R(g, s.x + 1, s.y + s.h - 2, s.w - 2, 1, col);
  R(g, s.x + s.w - 2, s.y + 1, 1, s.h - 2, col);
}
