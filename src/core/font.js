/* core layer — the 5x7 bitmap font. Depends on `vendor` only, and is the one
   place `vendor/font5x7.js`'s byte data is decoded, once at import.
   A glyph is 5 columns x 7 rows; upstream's 8th descender row is dropped, so
   every glyph fits a 7-row cell and caller line pitch is unaffected. */
import { FONT5X7_BYTES, FONT5X7_FIRST, FONT5X7_LAST } from '../../vendor/font5x7.js';

const ROWS = 7, COLS = 5;

export const GLYPHS = {};
for (let code = FONT5X7_FIRST; code <= FONT5X7_LAST; code++) {
  const base = (code - FONT5X7_FIRST) * COLS;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let row = '';
    for (let c = 0; c < COLS; c++) row += (FONT5X7_BYTES[base + c] >> r) & 1;
    rows.push(row);
  }
  GLYPHS[String.fromCharCode(code)] = rows;
}

/* Advance width in px. A shadowed string measures the same, so `drawText`'s
   1 px shadow offset is deliberately absent here; `view`'s layout passes
   measure every string, shadowed or not, through this. */
export function textWidth(s, sc = 1, tr = 1) { return s.length * (5 * sc + tr) - tr; }

/* Break `s` on spaces so no line measures wider than `budget` px. A single
   word wider than `budget` is returned whole and overhangs, so a caller that
   cannot afford the overhang has to check the result. */
export function wrap(s, budget, sc = 1, tr = 1) {
  const lines = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && textWidth(next, sc, tr) > budget) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/* `shadow` is a colour string or null: the whole string is rasterised at
   (x+sc, y+sc) in the shadow tone, then at (x, y) in `col`. Two complete
   traversals rather than one interleaved pass, so `fillStyle` is written twice
   per string instead of twice per glyph. */
export function drawText(g, s, x, y, col, sc = 1, tr = 1, shadow = null) {
  if (shadow) pass(g, s, (x | 0) + sc, (y | 0) + sc, shadow, sc, tr);
  pass(g, s, x | 0, y | 0, col, sc, tr);
}

function pass(g, s, x, y, col, sc, tr) {
  g.fillStyle = col;
  let cx = x;
  for (const ch of s) {
    const gl = GLYPHS[ch] || GLYPHS['?'];
    for (let r = 0; r < 7; r++) {
      const row = gl[r];
      for (let c = 0; c < 5; c++) {
        if (row[c] === '1') g.fillRect(cx + c * sc, y + r * sc, sc, sc);
      }
    }
    cx += 5 * sc + tr;
  }
}
