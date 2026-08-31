/* LAYER view — the TOOLTIP primitive: follows the cursor, clamps to the
   viewport, multi-section (a blank line separates sections — inputs vs.
   output vs. flavour text, for instance). One at a time: `drawn.tooltip` is
   a single slot, the same singular idiom `view/hud.js#hoverInfo` already
   uses, because only one tooltip can be under the cursor at once. */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');

/* `opts`: { sections: string[][], cx, cy, vw, vh, offset? }.
   `sections` is an array of line-arrays; a blank line is inserted between
   sections when joining. Returns `{ x, y, w, h, lines }`. */
export function drawTooltip(g, opts) {
  const { sections, cx, cy, vw, vh, offset = 8 } = opts;
  const lines = [];
  sections.forEach((sec, i) => {
    if (i > 0) lines.push('');
    lines.push(...sec);
  });

  let w = 0;
  for (const l of lines) w = Math.max(w, textWidth(l));
  w += 8;
  const h = lines.length * 8 + 4;

  const x = Math.max(0, Math.min(cx + offset, vw - w - 2));
  const y = Math.max(0, Math.min(cy + offset, vh - h - 2));

  g.globalAlpha = 0.92; R(g, x, y, w, h, BACK); g.globalAlpha = 1;
  R(g, x, y, w, 1, mix(BACK, INK, 0.55));

  lines.forEach((l, i) => {
    if (!l) return;
    drawText(g, l, x + 4, y + 3 + i * 8, i === 0 ? INK : DIM, 1, 1);
  });

  const rect = { x, y, w, h, lines: lines.slice() };
  drawn.tooltip = rect;
  return rect;
}
