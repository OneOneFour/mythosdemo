/* LAYER view — THE QUICKBAR. Two rows of five, numbered 1-9-then-0, ALWAYS
   drawn (not gated on the main panel being open -- a quickbar is part of the
   permanent HUD, the same way the hearts are). The quickbar's cells ARE
   `run.inv[run.mainSlots .. run.inv.length)` -- the same physical storage the
   Character tab's grid draws, sliced differently (docs/PLAN-phase12.md §3
   D-H). Not a mirror, not a derived list, not an assignment table: dragging a
   pair here MOVES it, the same `write.moveSlot` the Character tab's own grid
   also drives. There is nothing left to overflow, so there is nothing to
   scroll or truncate -- a genuine scope reduction the storage-shape decision
   buys for free.
   See docs/DEVELOPER_GUIDE.md#widget-primitives

   Imports `core`, `data`, READ-ONLY `model`, and the primitives in this same
   directory. No `rules`, no `shell`. */

import { drawText, textWidth } from '../../core/font.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { SUB } from '../../data/substances.js';
import { massOfPair } from '../../model/items.js';
import { run } from '../../model/run.js';
import { drawGrid } from './grid.js';
import { drawPanel } from './panel.js';
import { frameSlot } from './slot.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');
const ARMED = colour('uiGood');
const SIZE = 14, COLS = 5;

/* ONE mapping, TWO readers: this string is the whole rule for "which digit
   key names which slot" -- slot 0 is '1', slot 8 is '9', slot 9 (the second
   row's last cell) is '0', matching a physical numpad/keyboard row left to
   right. `digitOf` (drawing the glyph in each cell) and `slotForDigit`
   (`shell/input.js`'s digit-key handler, arming the SAME slot a click on it
   already would) both index this one array, so "press 3" and "the slot
   showing 3" cannot silently disagree about which slot that is.
   See docs/DEVELOPER_GUIDE.md#one-decision-two-readers */
const DIGITS = '1234567890';
const digitOf = i => DIGITS[i];

/* The inverse of `digitOf` above -- a lowercased `KeyboardEvent.key` to a
   quickbar slot index, or -1 for any key that names no slot. Exported so
   `shell/input.js` (which may import `view`, read-only, per its own header)
   never has to re-derive or hand-copy this mapping. */
export const slotForDigit = k => DIGITS.indexOf(k);

/* One line of key bindings, collapsed by default (`ui.hintsOpen`). Named
   here rather than pulled from `shell/input.js` (`view` may not import
   `shell`) -- a legend is presentation text describing bindings that file
   already owns, not a second source of truth for what a key DOES.

   Written for the END STATE of docs/PLAN-phase12.md §4.1's keymap table --
   `e`/menu, `r`/action, `c`/collect and `z`/cancel are all real today, but
   `x`/dig, `u`/craft, `v`/use and `p`/equip are not actually removed as
   physical keys until Phase 12d lands. Until then this legend and the live
   key table legitimately disagree; that is a known, named discrepancy
   (12c2's own prompt), not a bug to "fix" by reverting this string. */
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
  /* THE ARMED-PLACEMENT HIGHLIGHT (Part 1, click-to-arm placement): a player
     may have assigned a placeable pair to a quickbar slot, so arming reaches
     here too, not only the Character tab's own inventory grid -- same
     border, same colour, `view/ui/mainPanel.js#frameArmedSlot`'s exact twin,
     just against this file's own grid instead of duplicating that function
     for one extra caller. */
  if (ui.armedPlace)
    for (const s of grid.slots)
      if (s.sub === ui.armedPlace.sub && s.form === ui.armedPlace.form) frameSlot(g, s, ARMED);

  /* One toggleable hint line, bottom-left, out of the quickbar's way. Its own
     `drawPanel` id (unused visually beyond a faint backing rect) so the UI
     dispatcher can hit-test a click on it apart from every other rect drawn
     this frame. */
  const label = ui.hintsOpen ? LEGEND : 'KEYS';
  const hw = Math.min(textWidth(label) + 6, W - 12);
  drawPanel(g, { id: 'hints-toggle', x: 4, y: H - 11, w: hw, h: 9, vw: W, vh: H, alpha: 0.6 });
  drawText(g, label, 6, H - 9, INK, 1, 1);
}
