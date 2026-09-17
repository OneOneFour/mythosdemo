/* view layer — the panel primitive: a titled window with 2 px bevelled chrome,
   a dark fill and an optional close box. Records what it drew into
   `./state.js#drawn.panels`, so a caller hit-tests what was painted rather
   than a second copy of this layout math. Clamped to the `vw`/`vh` viewport it
   is given, as every primitive here is. */
import { drawText } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');
const LIGHT = mix(BACK, INK, 0.55);
const SHADOW = mix(BACK, DIM, 0.35);

export const TITLE_H = 9;
export const CLOSE_SIZE = 7;

/* Returns `contentY`, where the caller's own content starts: below the title
   bar when there is one. */
export function drawPanel(g, opts) {
  const { id, vw, vh, title = '', closable = false, alpha = 0.92 } = opts;
  let { x, y, w, h } = opts;
  x |= 0; y |= 0;
  w = Math.max(1, Math.min(w | 0, vw - 4));
  h = Math.max(1, Math.min(h | 0, vh - 4));
  x = Math.max(2, Math.min(x, vw - w - 2));
  y = Math.max(2, Math.min(y, vh - h - 2));

  g.globalAlpha = alpha;
  R(g, x, y, w, h, BACK);
  g.globalAlpha = 1;
  R(g, x, y, w, 1, LIGHT);
  R(g, x, y, 1, h, LIGHT);
  R(g, x, y + h - 1, w, 1, SHADOW);
  R(g, x + w - 1, y, 1, h, SHADOW);

  let contentY = y + 3;
  if (title) {
    drawText(g, title, x + 3, y + 2, INK, 1, 1);
    R(g, x + 1, y + TITLE_H, w - 2, 1, SHADOW);
    contentY = y + TITLE_H + 3;
  }

  let closeHit = null;
  if (closable) {
    const cx = x + w - CLOSE_SIZE - 1, cy = y + 1;
    R(g, cx, cy, CLOSE_SIZE, CLOSE_SIZE, mix(BACK, DIM, 0.5));
    drawText(g, 'X', cx + 1, cy, INK, 1, 1);
    closeHit = { x: cx, y: cy, w: CLOSE_SIZE, h: CLOSE_SIZE };
  }

  const rect = { id, x, y, w, h, title, contentY, closeHit };
  drawn.panels.push(rect);
  return rect;
}
