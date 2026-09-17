/* view layer — the grid primitive: fixed-size square slots in a clamped
   column count, scrollable.

   Scrolling snaps to whole rows rather than clipping: the headless 2d stub
   implements no `clip()`/`rect()`, so every drawn slot must already fall
   inside the grid's bounds. Content width derives from `cols x cell`, never
   from a caller-supplied `w`, and a grid too narrow for `cols` reduces its
   column count -- a clamped `w` over a full `cols` loop would draw slots the
   returned rect denies are there. */
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawSlot, SLOT_SIZE } from './slot.js';
import { drawn } from './state.js';

const BACK = colour('uiBack'), DIM = colour('uiDim');
const CELL_BG = mix(BACK, DIM, 0.18);

export function rowsVisible(h, cell = SLOT_SIZE, gap = 1) {
  return Math.max(1, Math.floor((h + gap) / (cell + gap)));
}

export function colsVisible(w, cell = SLOT_SIZE, gap = 1) {
  return Math.max(1, Math.floor((w + gap) / (cell + gap)));
}

export function rowCount(itemCount, cols) {
  return Math.max(1, Math.ceil(itemCount / Math.max(1, cols)));
}

/* `cols` is a request, reduced to what fits between `x` and `vw`; `scroll` is
   a row offset clamped here, which `shell/ui.js#scrollOf` persists. Returned
   `w`/`h` are the actual drawn bounds, one `slots` entry per drawn cell. */
export function drawGrid(g, opts) {
  const {
    id, vw, vh, items, scroll = 0, cell = SLOT_SIZE, gap = 1, focus = -1
  } = opts;
  let { x, y, h, cols } = opts;
  x |= 0; y |= 0;

  const maxCols = colsVisible(Math.max(cell, vw - x - 2), cell, gap);
  cols = Math.max(1, Math.min(cols | 0, maxCols));
  x = Math.max(2, Math.min(x, vw - (cols * (cell + gap) - gap) - 2));

  h = Math.max(cell, Math.min(h | 0, vh - y - 2));
  y = Math.max(2, Math.min(y, vh - h - 2));

  const rowH = cell + gap;
  const rows = rowCount(items.length, cols);
  const visRows = Math.min(rows, rowsVisible(h, cell, gap));
  const firstRow = Math.max(0, Math.min(scroll | 0, Math.max(0, rows - visRows)));

  const slots = [];
  for (let r = 0; r < visRows; r++) {
    const row = firstRow + r;
    if (row >= rows) break;
    for (let c = 0; c < cols; c++) {
      const idx = row * cols + c;
      const cx = (x + c * (cell + gap)) | 0;
      const cy = (y + r * rowH) | 0;
      R(g, cx, cy, cell, cell, CELL_BG);
      const item = idx < items.length ? items[idx] : null;
      const content = drawSlot(g, { x: cx, y: cy, size: cell, item, focused: idx === focus });
      slots.push({ x: cx, y: cy, w: cell, h: cell, index: idx, ...content });
    }
  }

  const w = cols * (cell + gap) - gap;
  const drawnH = visRows * rowH - gap;
  const rect = { id, x, y, w, h: drawnH, cols, rows, scroll: firstRow, cell, slots };
  drawn.grids.push(rect);
  return rect;
}
