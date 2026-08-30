/* LAYER core — the 5x7 bitmap font.
   Depends on `vendor` only. May be imported by every layer.

   The HUD is drawn in the same pixel space as the world using these glyphs.
   `fillText` is forbidden project-wide: mixing an antialiased system font into
   a nearest-neighbour upscale breaks the look immediately. A real text
   library doesn't fix that — it usually rasterises the same way `fillText`
   does — so the shape stays "vendor a bitmap font, blit it ourselves"; what
   changed is the source. `vendor/font5x7.js` carries the byte data and its
   licence; this file is the one and only place that decodes it, once, at
   import.

   Glyphs are 5 columns x 7 rows. Row 7 (the descender row `,gpqy` use
   upstream) is dropped rather than adopted, so every glyph still fits the
   project's existing 7-row cell and no caller's line-pitch math changes. */
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

export function textWidth(s, sc = 1, tr = 1) { return s.length * (5 * sc + tr) - tr; }

export function drawText(g, s, x, y, col, sc = 1, tr = 1) {
  g.fillStyle = col;
  let cx = x | 0;
  for (const ch of s) {
    const gl = GLYPHS[ch] || GLYPHS['?'];
    for (let r = 0; r < 7; r++) {
      const row = gl[r];
      for (let c = 0; c < 5; c++) {
        if (row[c] === '1') g.fillRect(cx + c * sc, (y | 0) + r * sc, sc, sc);
      }
    }
    cx += 5 * sc + tr;
  }
}
