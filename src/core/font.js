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
   layout pass in `view` measures with it (CLAUDE.md D8), and widening it by
   the offset would move every panel that shadows any of its text. */
export function textWidth(s, sc = 1, tr = 1) { return s.length * (5 * sc + tr) - tr; }

/* `shadow` (docs/PLAN-phase13.md 2.4c) is a colour string or `null`. When set,
   the WHOLE STRING is rasterised once at (x+sc, y+sc) in the shadow tone and
   then once at (x, y) in `col`.

   TWO COMPLETE TRAVERSALS, NOT ONE INTERLEAVED PASS. `fillStyle` is set once
   per traversal, outside the glyph loop, so a shadowed string costs exactly
   TWO `fillStyle` writes -- not two per glyph, and emphatically not two per
   pixel, which is what drawing the shadow bit and the ink bit together inside
   the innermost loop would cost. At ~11-14 `fillRect`s a glyph the second
   pass is a few thousand extra 1x1 fills on the heaviest screen, which is
   negligible beside world painting; a `fillStyle` swap per pixel would not
   be.

   Used ONLY where a site draws straight onto rendered world with nothing
   behind it. A site inside a panel gets no shadow -- the panel is the
   backing -- and a site next to an already-backed one gets a backing rect
   instead, extending the idiom `view/ui/ruler.js` and `view/overview.js`
   already use rather than putting a second mechanism beside it. */
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
