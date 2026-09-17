/* view layer — the tab row primitive: one row of tabs, one active. Paints the
   row and reports each tab's rectangle; `shell/ui.js#cycleTab` owns which tab
   is active. */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');
const ACTIVE_BG = mix(BACK, INK, 0.28);
const RULE = mix(BACK, DIM, 0.5);

export const TAB_H = 9;

/* Rectangles come back in canvas px, and `h` is `TAB_H` per line used, so a
   caller anchors its body below `y + h` and never below `y + TAB_H`. */
export function drawTabs(g, opts) {
  const { id, y, w, tabs, active, vw } = opts;
  let { x } = opts;
  x = Math.max(0, Math.min(x | 0, vw - 2));
  const maxRight = Math.min(x + Math.max(1, w | 0), vw - 2);
  const hits = [];
  let cx = x, cy = y, right = x, placed = 0;

  for (const t of tabs) {
    const tw = textWidth(t.label) + 6;

    /* Wrap before dropping: the crafting row overruns the 200 px buffer
       floor's 188 px of content width by 16 px, and a dropped tab takes its
       whole category off screen with nothing left to say it is there. */
    if (placed && cx + tw > maxRight) { cx = x; cy += TAB_H; }

    /* Dropped rather than truncated: this canvas vocabulary has no `clip()`,
       so a truncated label would paint its full width past the boundary while
       its hit rect claimed otherwise. The first tab is kept regardless. */
    if (placed && cx + tw > maxRight) break;

    const isActive = t.id === active;
    if (isActive) R(g, cx, cy, tw, TAB_H, ACTIVE_BG);
    drawText(g, t.label, cx + 3, cy + 1, isActive ? INK : DIM, 1, 1);
    hits.push({ x: cx, y: cy, w: tw, h: TAB_H, id: t.id });
    cx += tw;
    if (cx > right) right = cx;
    placed++;
  }
  const h = cy + TAB_H - y;
  /* One rule under the last line, spanning the widest line. */
  R(g, x, y + h - 1, Math.max(1, Math.min(right, maxRight) - x), 1, RULE);

  const rect = { id, x, y, w: right - x, h, active, hits };
  drawn.tabs.push(rect);
  return rect;
}
