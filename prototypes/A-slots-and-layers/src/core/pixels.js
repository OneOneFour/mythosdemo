/* core — the integer-pixel primitives.

   STUB (leaf): the bodies are the two-line canvas calls from src/core/canvas.js
   and src/core/font.js. Nothing about this prototype is being evaluated on
   them, and stubbing them keeps `view/` importable in Node so tools/epoch.mjs
   can run a render without a DOM. */

export function R(g, x, y, w, h, col) {
  void g; void x; void y; void w; void h; void col;   // g.fillStyle = col; g.fillRect(x|0, y|0, w|0, h|0)
}

export function drawText(g, str, x, y, col, sx = 1, sy = 1) {
  void g; void str; void x; void y; void col; void sx; void sy;   // 5x7 bitmap font
  return 0;
}

export const textWidth = str => str.length * 6;
