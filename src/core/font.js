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

/* A 1 px diagonal shadow does NOT change advance width, so this is untouched
   by `drawText`'s `shadow` argument and must stay that way -- every anchored
   layout pass in `view` measures with it, and widening it by the offset would
   move every panel that shadows any of its text. */
export function textWidth(s, sc = 1, tr = 1) { return s.length * (5 * sc + tr) - tr; }

/* Break `s` on spaces so no line measures wider than `budget` px. Lives here
   rather than in a caller because `textWidth` above is the only authority on
   how wide a string is, and a wrapper that guessed would drift from it.

   A single word wider than `budget` is returned long rather than cut: a cut
   word reads as a rendering fault, an overhanging one reads as a long word.
   Callers that cannot afford the overhang must check the result. */
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

/* `shadow` is a colour string or `null`. When set, the WHOLE STRING is
   rasterised once at (x+sc, y+sc) in the shadow tone and then once at (x, y)
   in `col`.

   TWO COMPLETE TRAVERSALS, NOT ONE INTERLEAVED PASS. `fillStyle` is set once
   per traversal, outside the glyph loop, so a shadowed string costs exactly
   TWO `fillStyle` writes -- not two per glyph, and emphatically not two per
   pixel. Used ONLY where a site draws straight onto rendered world with
   nothing behind it; a site inside a panel gets no shadow, and one next to an
   already-backed site gets a backing rect instead. */
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
