/* LAYER view — the TAB ROW primitive. One row of tabs, one active. Drawing and
   cycling are separate concerns on purpose: this file only paints a row and
   reports each tab's rectangle; `shell/ui.js#cycleTab` owns which tab is
   active, the same split `panel.js` keeps with `shell/ui.js#open`/`close`. */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');
const ACTIVE_BG = mix(BACK, INK, 0.28);
const RULE = mix(BACK, DIM, 0.5);

export const TAB_H = 9;

/* `opts`: { id, x, y, w, vw, tabs: [{id, label}], active }.
   Returns `{ id, x, y, w, h, active, hits: [{x,y,w,h,id}] }`, all in canvas
   pixels. `h` is `TAB_H` per line used, so a caller anchors its body below
   `y + h` and never below `y + TAB_H`. */
export function drawTabs(g, opts) {
  const { id, y, w, tabs, active, vw } = opts;
  let { x } = opts;
  x = Math.max(0, Math.min(x | 0, vw - 2));
  const maxRight = Math.min(x + Math.max(1, w | 0), vw - 2);
  const hits = [];
  let cx = x, cy = y, right = x, placed = 0;

  for (const t of tabs) {
    const tw = textWidth(t.label) + 6;

    /* Wrap before dropping. A dropped tab takes its whole category off the
       screen with nothing left to say the category is there, and the
       crafting row already exceeds the 200 px floor's 188 px of content
       width by 16 px. */
    if (placed && cx + tw > maxRight) { cx = x; cy += TAB_H; }

    /* A tab too wide for a line of its own is dropped, not truncated —
       drawn text is never clipped (there is no `clip()` in this project's
       canvas vocabulary, see `grid.js`'s header), so a truncated tab would
       actually paint its full label past the boundary while claiming a
       narrower hit rect. The FIRST tab is the one exception: showing one
       tab that slightly overruns a viewport too narrow for even one is
       still more legible than showing none, the same floor `grid.js` keeps
       at one column. */
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
  /* One rule under the LAST line, spanning the widest line, so a short
     final line does not leave the row underlined to a ragged edge. */
  R(g, x, y + h - 1, Math.max(1, Math.min(right, maxRight) - x), 1, RULE);

  const rect = { id, x, y, w: right - x, h, active, hits };
  drawn.tabs.push(rect);
  return rect;
}
