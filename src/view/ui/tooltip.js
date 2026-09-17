/* view layer — the tooltip primitive: follows the cursor, clamps to the
   viewport, sections separated by a blank line. `drawn.tooltip` is a single
   slot; only one tooltip can be under the cursor at once. */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const INK = colour('ui'), INK2 = colour('uiInk2'), BACK = colour('uiBack');

/* A `Line` is either a plain string or `{ s, col }`. The returned `lines` is
   always a flat array of plain strings whatever went in, because
   `__mf.ui.tooltip` projects it and assertions call `startsWith` on members. */
export function drawTooltip(g, opts) {
  const { sections, cx, cy, vw, vh, offset = 8 } = opts;
  const rows = [];
  sections.forEach((sec, i) => {
    if (i > 0) rows.push({ s: '', col: null });
    for (const l of sec) rows.push(typeof l === 'string' ? { s: l, col: null } : l);
  });

  let w = 0;
  for (const r of rows) w = Math.max(w, textWidth(r.s));
  w += 8;
  const h = rows.length * 8 + 4;

  const x = Math.max(0, Math.min(cx + offset, vw - w - 2));
  const y = Math.max(0, Math.min(cy + offset, vh - h - 2));

  g.globalAlpha = 0.92; R(g, x, y, w, h, BACK); g.globalAlpha = 1;
  R(g, x, y, w, 1, mix(BACK, INK, 0.55));

  rows.forEach((r, i) => {
    if (!r.s) return;
    /* Title in `INK`, body lines in `INK2`; a line that encodes state takes
       `r.col` from the caller. */
    drawText(g, r.s, x + 4, y + 3 + i * 8, r.col || (i === 0 ? INK : INK2), 1, 1);
  });

  const rect = { x, y, w, h, lines: rows.map(r => r.s) };
  drawn.tooltip = rect;
  return rect;
}
