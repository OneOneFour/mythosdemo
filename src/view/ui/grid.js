/* LAYER view — the GRID primitive: fixed-size square slots, a configurable
   column count, scrollable.

   SCROLLING IS SNAPPED TO WHOLE ROWS rather than done with a canvas clip. This
   project draws with `R()`/`lineTo()` only, and the headless 2d stub does not
   implement `clip()`/`rect()` at all -- so a real clip would pass in a browser
   and throw in `npm run check`. Snapping means every drawn slot is already
   fully inside the grid's bounds.

   COLUMN COUNT IS CLAMPED TOO, and this is the part that is easy to get
   wrong: the content width is DERIVED from `cols x cell`, never from a
   caller-supplied `w`. Reporting a clamped `w` while looping over the full
   `cols` would draw slots past it while the returned rect claims they are not
   there -- exactly the layout/hit-test disagreement recording a drawn rect
   exists to prevent. So a grid that cannot fit `cols` REDUCES its effective
   column count. */
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

/* `opts`: { id, x, y, h, vw, vh, cols, items, scroll?, cell?, gap?, focus? }.
   `items[i]` is `null` (empty slot) or `{ sub, form, n, mass, colour, glyph }`,
   the exact shape `slot.js#drawSlot` expects — `grid.js` never inspects it.
   `cols` is a REQUEST, reduced to whatever fits between `x` and `vw`.
   `scroll` is a ROW offset, clamped here; the caller (`shell/ui.js#scrollOf`)
   owns persisting whatever value this returns.
   Returns `{ id, x, y, w, h, cols, rows, scroll, cell, slots }` — `w`/`h` are
   the ACTUAL drawn bounding box, `cols` the actual (possibly reduced) count,
   and `slots` one `{x,y,w,h,index,sub,form,n,mass}` per drawn cell, which is
   what a click handler hit-tests against and what `__mf.ui` projects. */
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
