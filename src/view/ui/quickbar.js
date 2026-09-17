/* view layer — the quickbar: one row of slots, numbered from 1, always drawn.
   Its cells are `run.inv[run.mainSlots ..]`, the same storage the Character
   tab's grid draws, so dragging a pair here moves it through the same
   `write.moveSlot`. Nothing here scrolls or truncates. */

import { drawText, textWidth } from '../../core/font.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { labelOf } from '../../data/forms.js';
import { SUB } from '../../data/substances.js';
import { massOfPair } from '../../model/items.js';
import { run } from '../../model/run.js';
import { drawGrid } from './grid.js';
import { drawPanel } from './panel.js';
import { rulerWidth } from './ruler.js';
import { frameSlot } from './slot.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');
const ARMED = colour('uiGood');
const SHADE = colour('uiShade');
/* `COLS` matches `eff('quickbarSlots')`: `./grid.js` paints a cell for every
   column of every row, so a count the slot count does not divide leaves boxes
   addressing nothing. The resulting 119 px fits the 200 px buffer floor. */
const SIZE = 14, COLS = 8;

/* Clears the IN HAND line above the grid: the 5x7 font plus one row of shadow
   is 8 px tall, leaving 2 px of air. */
const HAND_GAP = 10;
const HAND_PREFIX = 'IN HAND ';

/* Which digit key names which slot, counted along a keyboard row from slot 0
   at '1'. Longer than the strip, so both readers bound themselves by the real
   cell count. */
const DIGITS = '1234567890';
const digitOf = i => DIGITS[i];

/* A lowercased `KeyboardEvent.key` to a quickbar slot index, or -1 for a key
   that names no slot. Bounded by the array itself, because `eff('quickbarSlots')`
   sits in `data/tuning.js` and `view` may not import it. */
export const slotForDigit = k => {
  const i = DIGITS.indexOf(k);
  return i >= 0 && i < run.inv.length - run.mainSlots ? i : -1;
};

/* One line of key bindings, collapsed by default (`ui.hintsOpen`). Presentation
   text only; `shell/input.js` owns what a key does. */
const LEGEND = 'E MENU  R ACTION  Q DROP  C COLLECT  Z CANCEL  L LINK  LMB ACT';

export function drawQuickbar(g, f) {
  const { W, H, ui } = f;
  const qSlots = run.inv.slice(run.mainSlots);
  const w = COLS * (SIZE + 1) - 1;
  const x = Math.max(2, W - w - 6);
  const rows = Math.ceil(qSlots.length / COLS);
  const y = H - rows * (SIZE + 1) - 1 - 11;

  const items = qSlots.map((slot, i) => !slot
    ? { sub: null, form: null, n: 0, mass: 0, colour: mix(BACK, DIM, 0.15), glyph: digitOf(i) }
    : { sub: slot.sub, form: slot.form, n: slot.n, mass: massOfPair(slot.sub, slot.form) * slot.n,
        colour: SUB[slot.sub].look?.item ? colour(SUB[slot.sub].look.item[0]) : DIM, glyph: digitOf(i) });

  const grid = drawGrid(g, { id: 'quickbar', x, y, h: rows * (SIZE + 1) - 1, vw: W, vh: H, cols: COLS, items, cell: SIZE });
  /* An armed placeable may sit in a quickbar slot, so the armed border is drawn
     here too, matching `view/ui/mainPanel.js#frameArmedSlot`. */
  if (ui.armedPlace)
    for (const s of grid.slots)
      if (s.sub === ui.armedPlace.sub && s.form === ui.armedPlace.form) frameSlot(g, s, ARMED);

  inHand(g, f, grid);

  /* One toggleable hint line, bottom-left. Its own `drawPanel` id so the UI
     dispatcher can hit-test a click on it apart from every other rect. */
  const label = ui.hintsOpen ? LEGEND : 'KEYS';
  const hw = Math.min(textWidth(label) + 6, W - 12);
  drawPanel(g, { id: 'hints-toggle', x: 4, y: H - 11, w: hw, h: 9, vw: W, vh: H, alpha: 0.6 });
  drawText(g, label, 6, H - 9, INK, 1, 1);
}

/* IN HAND -- one line, only while `ui.armedPlace` is set. Anchored off
   `drawGrid`'s returned rect and the measured text, never a hardcoded origin,
   so a narrow viewport moves it. */
function inHand(g, f, grid) {
  const { W, ui } = f;
  if (!ui.armedPlace) return;

  const text = HAND_PREFIX + labelOf(ui.armedPlace.sub, ui.armedPlace.form);
  const tw = textWidth(text);
  /* `view/hud.js#hudRuler` runs after `drawQuickbar` so it can read the grid's
     rect, which means its own rect does not exist yet: the column is reserved
     from `rulerWidth()` unconditionally, even where `hudRuler` bails out. */
  const right = Math.min(grid.x + grid.w, W - rulerWidth() - 3);
  const tx = Math.max(2, right - tw);
  const ty = Math.max(2, grid.y - HAND_GAP);
  drawText(g, text, tx, ty, ARMED, 1, 1, SHADE);
}
