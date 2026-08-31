/* LAYER view — the TAB ROW primitive. One row, one active tab. Drawing and
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
   Returns `{ id, x, y, w, h, active, hits: [{x,y,w,h,id}] }`. */
export function drawTabs(g, opts) {
  const { id, y, w, tabs, active, vw } = opts;
  let { x } = opts;
  x = Math.max(0, Math.min(x | 0, vw - 2));
  const maxRight = Math.min(x + Math.max(1, w | 0), vw - 2);
  const hits = [];
  let cx = x;

  for (const t of tabs) {
    const tw = textWidth(t.label) + 6;
    /* A tab that would bleed past `maxRight` is dropped, not truncated —
       drawn text is never clipped (there is no `clip()` in this project's
       canvas vocabulary, see `grid.js`'s header), so a truncated tab would
       actually paint its full label past the boundary while claiming a
       narrower hit rect. The FIRST tab is the one exception: showing one
       tab that slightly overruns a viewport too narrow for even one is
       still more legible than showing none, the same floor `grid.js` keeps
       at one column. */
    if (cx > x && cx + tw > maxRight) break;
    const isActive = t.id === active;
    if (isActive) R(g, cx, y, tw, TAB_H, ACTIVE_BG);
    drawText(g, t.label, cx + 3, y + 1, isActive ? INK : DIM, 1, 1);
    hits.push({ x: cx, y, w: tw, h: TAB_H, id: t.id });
    cx += tw;
  }
  R(g, x, y + TAB_H - 1, Math.max(1, Math.min(cx, maxRight) - x), 1, RULE);

  const rect = { id, x, y, w: cx - x, h: TAB_H, active, hits };
  drawn.tabs.push(rect);
  return rect;
}
