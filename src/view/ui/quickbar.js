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
const SIZE = 14, COLS = 5;

/* Gap between the IN HAND line's baseline box and the quickbar's own top
   edge. The 5x7 font plus one row of shadow is 8 px tall, so 2 px of air
   above the grid puts the line clear of it without moving anything. */
const HAND_GAP = 10;
const HAND_PREFIX = 'IN HAND ';

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

  inHand(g, f, grid);

  /* One toggleable hint line, bottom-left, out of the quickbar's way. Its own
     `drawPanel` id (unused visually beyond a faint backing rect) so the UI
     dispatcher can hit-test a click on it apart from every other rect drawn
     this frame. */
  const label = ui.hintsOpen ? LEGEND : 'KEYS';
  const hw = Math.min(textWidth(label) + 6, W - 12);
  drawPanel(g, { id: 'hints-toggle', x: 4, y: H - 11, w: hw, h: 9, vw: W, vh: H, alpha: 0.6 });
  drawText(g, label, 6, H - 9, INK, 1, 1);
}

/* ---------- IN HAND ----------
   ONE LINE, AND ONLY WHEN SOMETHING IS ARMED. Not a permanent fixture with
   an empty state: `ui.armedPlace` is null the overwhelming majority of the
   time, and a fixture reading "IN HAND --" would spend eight pixels of the
   HUD's most contested row on saying nothing. This is new information
   appearing, which is why it reads at a glance without a legend.

   WHY IT EXISTS AT ALL (docs/PLAN-phase16-interaction-model-v2.md §4.4,
   §5 D16-E #2): the armed pair is this game's "item in cursor", and until
   this line the ONLY cue that anything was in it was `frameSlot`'s border
   on a slot inside the main panel -- which `shell/main.js#applyIntents`
   auto-closes the instant a placement intent arrives. So the cue was
   routinely behind a window the game itself had just shut. Deliberately NOT
   a mouse-following cursor icon: that is docs/PLAN-phase16-interaction-
   model-v2.md §5 D16-A's rejected alternative, and this game's placement
   already answers "where" with the aim reticle and the build ghost.

   ANCHORED OFF `drawGrid`'S OWN RETURNED RECT AND THE MEASURED TEXT, never a
   hardcoded origin (CLAUDE.md D8). `grid` is what `drawGrid` actually drew --
   already clamped and already shrunk-to-fit by that primitive -- so the line
   tracks the quickbar rather than re-deriving where the quickbar "should"
   be; a viewport narrow enough to move the grid moves this with it. RIGHT-
   EDGE aligned to the grid, because that edge is the stable one (the grid is
   pinned to the right of the screen and grows leftwards), then clamped left
   to 2 so a long pair name at a narrow base buffer slides into view instead
   of off it -- the same clamp `view/hud.js#cableGhost`'s refusal text and
   every primitive in this directory apply. The label is composed by
   `data/forms.js#labelOf`, THE shared pair-name composer this repo already
   has three other readers for (`view/hover.js`, `view/hud.js#pairLabel`,
   `shell/notify.js`); nothing here hand-writes "COPPER ORE".

   AND IT RESERVES THE BAND RULER'S COLUMN, which is the one thing the first
   version of this got wrong and the first baseline caught. `view/hud.js
   #hudRuler` mounts the DEPTH ruler against the right edge (D8's table) and
   stops it 4 px above the quickbar's real rect -- which is exactly the strip
   this line then wanted, so "IN HAND TIMBER LADDER" came out with the ruler's
   bar and numeral column drawn through the last three letters. `rulerWidth()`
   is the measured reserve that widget's own header tells a caller to read
   ("whatever the widest numeral in this world actually is, that is how much
   room the widget needs"), so the right edge of this text is the ruler's left
   edge, not the quickbar's. It CANNOT be read back out of
   `view/ui/state.js#drawn` instead: `hudRuler` runs AFTER `drawQuickbar`
   precisely so it can read the quickbar's rect, so at this point in the frame
   the ruler has not drawn yet. Reserved unconditionally, including on the
   short viewports where `hudRuler` bails out early -- a line that moved
   depending on whether a different widget happened to render is worse than
   four unused pixels. */
function inHand(g, f, grid) {
  const { W, ui } = f;
  if (!ui.armedPlace) return;

  const text = HAND_PREFIX + labelOf(ui.armedPlace.sub, ui.armedPlace.form);
  const tw = textWidth(text);
  const right = Math.min(grid.x + grid.w, W - rulerWidth() - 3);
  const tx = Math.max(2, right - tw);
  const ty = Math.max(2, grid.y - HAND_GAP);
  drawText(g, text, tx, ty, ARMED, 1, 1, SHADE);
}
