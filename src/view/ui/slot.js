/* LAYER view — the SLOT primitive: a swatch, the count in the bottom-right
   corner in a compact face, and an optional corner glyph (a tile-capable
   form, a relic frame — the CALLER decides what the glyph means; this file
   draws pixels, not rules, and carries no substance or machine name, per
   ARCHITECTURE §3).

   A LEAF, deliberately: it does not push into `./state.js#drawn` itself.
   Every caller so far (`grid.js`) is already a container that records the
   slot's content alongside its own geometry — one record per slot, not two.
   A future standalone use (an equipment slot outside any grid) is exactly a
   1xN `grid.js` call, not a reason to duplicate this file's bookkeeping.
   See docs/DEVELOPER_GUIDE.md#widget-primitives */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';

const DIM = colour('uiDim'), INK = colour('ui'), BACK = colour('uiBack');

export const SLOT_SIZE = 16;

/* `opts`: { x, y, size?, item, focused?, frameColour? }.
   `item` is `{ sub, form, n, mass, colour, glyph }` or `null` for empty.
   `colour` is a resolved hex/rgb string — a swatch colour is a fact about a
   substance's `look`, which this file must not know how to look up (that
   would be a `data/substances.js` import, forbidden by ARCHITECTURE §3's "no
   substance name in view/" the same way `hud.js#pockets` already respects
   it: the CALLER resolves `SUB[sub].look.item` and hands over the colour).
   Returns `{ sub, form, n, mass }`, the exact shape the `__mf.ui` projection
   carries. */
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
   ABSOLUTE rectangle `grid.js#drawGrid` already returned for it -- the exact
   "read back what was actually drawn" discipline `view/ui/mainPanel.js
   #frameUniqueSlots` established for a relic's frame, moved here so a second
   caller (the armed-placement highlight, `shell/ui.js#ui.armedPlace`) draws
   with the IDENTICAL visual language instead of a second one-off border
   routine. `s` is one entry of `drawGrid`'s own returned `slots` array
   (`{x,y,w,h,...}`), not a fresh rectangle -- callers never recompute
   geometry `drawGrid` already settled.
   See docs/DEVELOPER_GUIDE.md#record-what-you-drew */
export function frameSlot(g, s, col) {
  R(g, s.x, s.y, s.w, 1, col);
  R(g, s.x, s.y, 1, s.h, col);
  R(g, s.x, s.y + s.h - 1, s.w, 1, col);
  R(g, s.x + s.w - 1, s.y, 1, s.h, col);
}
