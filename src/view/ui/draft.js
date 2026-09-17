/* view layer — the draft modal: the cards a god lays out, and what a second
   look costs.

   The freeze is `shell/ui.js#pausesRun`; this file only draws what stands
   while the run is stopped. Every card and the reroll row register into
   `./state.js#drawn.panels` for `shell` to hit-test, and a card's id carries
   the index into `run.offer.ids`, so the pointer and the keyboard reach the
   same card.

   Mod lines are built from the offered row, not from `model/mods.js#explain`,
   which can only describe a modifier already applied. Layout is driven by
   `ids.length` and reserves no gap for a card that is not there. */

import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { BOON } from '../../data/boons.js';
import { godName } from '../../data/gods.js';
import { GRANT } from '../../data/grants.js';
import { MIRACLE } from '../../data/miracles.js';
import { colour } from '../../data/palette.js';
import { TRINKET } from '../../data/trinkets.js';
import { canReroll, offerExhausted, offerGod, rerollPrice, run } from '../../model/run.js';
import { drawPanel } from './panel.js';

const INK = colour('ui'), INK2 = colour('uiInk2'), DIM = colour('uiDim');
const BACK = colour('uiBack');
const GOOD = colour('uiGood'), AMBER = colour('uiAmber');
/* The divine accent `view/hud.js` and `view/ui/mainPanel.js` use for a relic. */
const RELIC = colour('ichor');

/* `run.offer.tier` -> the frozen table its ids index; `rules/draft.js` owns
   which ids. */
const TABLE = { boon: BOON, grant: GRANT, trinket: TRINKET, miracle: MIRACLE };

const TITLE = 'CHOOSE ONE';

const M = 3;      // outer margin, screen px
const PAD = 3;    // card inner padding, screen px
const GAP = 3;    // between cards, and between the block's three parts
const LINE = 8;   // 7px glyph cell + 1px leading
/* Below this a card is narrower than the longest single word any shipped row
   uses (10 chars, 59 px) plus its padding, so wrapping would break words. Two
   cards fit at the 200 px base-buffer floor; three drop to a second row. */
const MIN_CARD_W = 86;
/* A ceiling: at 640 px of base width two cards would be 313 px each. 128 px is
   20 characters, the longest shipped row name on one line. */
const MAX_CARD_W = 128;

/* Is the modal standing? `f.ui.stack` is `shell/ui.js`'s panel stack, handed
   over read-only; a half-built `run.offer` has no `ids` and nothing to draw. */
export const draftOpen = f => f.ui.stack.includes('draft') && !!run.offer?.ids?.length;

/* Greedy word wrap to `maxW` screen px at scale 1. A word wider than the whole
   line is hard-broken rather than allowed to overrun the card frame. */
function wrap(s, maxW) {
  const out = [];
  if (!s) return out;
  let line = '';
  for (const word of String(s).split(' ')) {
    let w = word;
    while (textWidth(w) > maxW) {
      const fit = Math.max(1, Math.floor((maxW + 1) / 6));
      if (line) { out.push(line); line = ''; }
      out.push(w.slice(0, fit));
      w = w.slice(fit);
    }
    const next = line ? line + ' ' + w : w;
    if (textWidth(next) > maxW && line) { out.push(line); line = w; }
    else line = next;
  }
  if (line) out.push(line);
  return out;
}

const push = (out, s, col, maxW) => { for (const l of wrap(s, maxW)) out.push({ s: l, col }); };

/* One `{key, mul, add}` row as the player reads it, worded identically to the
   Character tab's. The sign is not the polarity -- `hard x0.85` is a benefit and
   `climb x0.8` a cost, both printing negative -- so nothing colours by it. */
function modLines(m, maxW, out) {
  const dot = m.key.indexOf('.');
  const base = dot < 0 ? m.key : m.key.slice(0, dot);
  const scope = dot < 0 ? null : m.key.slice(dot + 1);
  const label = (scope ? scope.toUpperCase() + ' ' : '') + base.toUpperCase();
  if (m.mul !== undefined && m.mul !== 1) {
    const pct = Math.round((m.mul - 1) * 100);
    push(out, `${pct >= 0 ? '+' : ''}${pct}% ${label}`, GOOD, maxW);
  }
  if (m.add !== undefined && m.add !== 0)
    push(out, `${m.add >= 0 ? '+' : ''}${m.add} ${label}`, GOOD, maxW);
}

/* In priority order, last dropped first: the draw loop stops at the card's
   bottom edge rather than clipping, so line order is the degradation rule and a
   short card loses its flavour text. */
function cardLines(row, index, maxW) {
  const out = [];
  push(out, row.god ? `${index + 1}  ${godName(row.god)}` : String(index + 1), RELIC, maxW);
  push(out, row.name, INK, maxW);
  for (const m of row.mods ?? []) modLines(m, maxW, out);
  push(out, row.text, INK2, maxW);
  return out;
}

/* A row id the tier's table does not hold reads as the id itself rather than as
   a blank card, so a content gap stays visible. */
const rowFor = (tier, id) => TABLE[tier]?.[id] ?? { name: String(id).toUpperCase(), text: '' };

/* The reroll row's three strings: the cost, whose purse pays, and which of the
   two refusals applies. `model/run.js#canReroll` is the predicate both this and
   `rules/draft.js` read; `offerExhausted` is which half of it failed. */
function rerollRow() {
  const asker = offerGod();
  const price = rerollPrice();
  const have = asker ? (run.favour[asker] ?? 0) : 0;
  const live = canReroll(asker);
  return {
    live,
    main: asker
      ? `[R] REROLL  ${price} FAVOUR  ${godName(asker)} ${have}`
      : `[R] REROLL  ${price} FAVOUR`,
    reason: live ? null : (offerExhausted() ? 'THIS IS ALL THERE IS' : 'NOT ENOUGH FAVOUR')
  };
}

/* Draws nothing and records nothing when no offer stands. Assumes the canvas
   transform is identity (screen space) and leaves `globalAlpha` at 1. */
export function drawDraft(g, f) {
  if (!draftOpen(f)) return;
  const vw = f.W, vh = f.H;
  const ids = run.offer.ids, tier = run.offer.tier;

  g.globalAlpha = 0.85;
  R(g, 0, 0, vw, vh, BACK);
  g.globalAlpha = 1;

  const availW = vw - 2 * M, availH = vh - 2 * M;

  const ts = vh >= 240 && textWidth(TITLE, 2) <= availW ? 2 : 1;
  const headH = ts * 7 + 4;

  const rr = rerollRow();
  const rrW = Math.min(availW,
    Math.max(textWidth(rr.main), rr.reason ? textWidth(rr.reason) : 0) + 6);
  const rrH = (rr.reason ? 2 : 1) * LINE + 3;

  const perRow = Math.min(ids.length,
    Math.max(1, Math.floor((availW + GAP) / (MIN_CARD_W + GAP))));
  const rowCount = Math.ceil(ids.length / perRow);
  const cardW = Math.min(MAX_CARD_W, Math.floor((availW - (perRow - 1) * GAP) / perRow));
  const inner = cardW - 2 * PAD;

  const lines = ids.map((id, i) => cardLines(rowFor(tier, id), i, inner));
  const wanted = Math.max(...lines.map(l => l.length)) * LINE + 5;
  const cardsBudget = availH - headH - rrH - 2 * GAP;
  const cardH = Math.max(LINE + 5,
    Math.min(wanted, Math.floor((cardsBudget - (rowCount - 1) * GAP) / rowCount)));

  const blockH = headH + rowCount * cardH + (rowCount - 1) * GAP + GAP + rrH;
  let y = M + Math.max(0, (availH - blockH) >> 1);

  drawText(g, TITLE, M + Math.max(0, (availW - textWidth(TITLE, ts)) >> 1), y, INK, ts, 1);
  y += headH;

  for (let i = 0; i < ids.length; i++) {
    const col = i % perRow, rowIdx = (i / perRow) | 0;
    /* The last row of a grid that does not divide evenly is centred on its own
       count, so a 2+1 layout does not leave the odd card hanging left. */
    const inThisRow = Math.min(perRow, ids.length - rowIdx * perRow);
    const rowW = inThisRow * cardW + (inThisRow - 1) * GAP;
    const x = M + ((availW - rowW) >> 1) + col * (cardW + GAP);
    const p = drawPanel(g, {
      id: `draft-card-${i}`, x, y: y + rowIdx * (cardH + GAP),
      w: cardW, h: cardH, vw, vh, alpha: 0.94
    });
    let ly = p.contentY;
    const bottom = p.y + p.h - 2;
    for (const ln of lines[i]) {
      if (ly + 7 > bottom) break;
      drawText(g, ln.s, p.x + PAD, ly, ln.col, 1, 1);
      ly += LINE;
    }
  }
  y += rowCount * cardH + (rowCount - 1) * GAP + GAP;

  /* Recorded and clickable even when dimmed: `rules/draft.js#reroll` is the one
     place that decides, and it refuses out loud through a journal row. */
  const rp = drawPanel(g, {
    id: 'draft-reroll', x: M + ((availW - rrW) >> 1), y, w: rrW, h: rrH, vw, vh, alpha: 0.94
  });
  drawText(g, rr.main, rp.x + 3, rp.y + 2, rr.live ? INK : DIM, 1, 1);
  if (rr.reason) drawText(g, rr.reason, rp.x + 3, rp.y + 2 + LINE, AMBER, 1, 1);
}
