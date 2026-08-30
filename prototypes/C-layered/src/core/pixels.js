/* LAYER core — integer-pixel primitives.

   STUBBED LEAF: these are the only drawing calls in the prototype and they do
   nothing but forward to a 2D context. Per the brief, the leaf is stubbed and
   the structure around it is not. */

export function R(g, x, y, w, h, col) {
  if (!g) return;
  g.fillStyle = col;
  g.fillRect(x | 0, y | 0, w | 0, h | 0);
}

export function glow(g, x, y, r, col, a) {
  if (!g) return;
  g.globalAlpha = a;
  R(g, x - r, y - r, r * 2, r * 2, col);
  g.globalAlpha = 1;
}

/* 5x7 bitmap text. STUBBED LEAF — the glyph table is not reproduced here; the
   signature is what `view/hud.js` is written against. */
export function drawText(g, s, x, y, col, sx = 1, sy = 1) {
  if (!g) return;
  R(g, x, y, textWidth(s) * sx, 7 * sy, col);
}

export const textWidth = s => String(s).length * 6;
