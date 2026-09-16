/* LAYER view — THE DRAFT MODAL: the cards a god lays out, and what a second
   look costs. Imports `core`, `data` and READ-ONLY `model` queries, plus the
   panel primitive beside it (same-layer imports are legal). No `rules`, no
   `shell`.

   IT PAUSES NOTHING FROM HERE. The freeze is `shell/ui.js#pausesRun`, read by
   `shell/main.js#step` — this file only draws the thing that is standing while
   the run is stopped, and `f.ui.stack` is how it learns that, handed over
   through the frame context exactly as `f.flags` already is.

   A CLICK THAT DOES SOMETHING IS SHELL CALLING RULES. Every card and the
   reroll row are registered into `./state.js#drawn.panels` under the ids
   `draft-card-<i>` and `draft-reroll`; `shell/main.js#applyDraftIntents`
   hit-tests those rectangles and sets the SAME `wants.takeCard` /
   `wants.reroll` the 1/2/3 and `r` keys set. Nothing here dispatches, and
   `<i>` is the index into `run.offer.ids`, which is what makes the pointer
   and the keyboard reach the identical card.


   THE MOD LINES ARE BUILT FROM THE ROW, NOT FROM `model/mods.js#explain`.
   `explain` filters the LIVE `mods.rows` list, so it can only describe a
   modifier already applied — an offered trinket is not equipped and an
   offered boon is not running, so it would return nothing for every card on
   the table. `view/ui/mainPanel.js#trinketDeltaLines` is a reader of the live
   list for that reason and is not reusable here; what IS shared is the
   wording, and `modLines` below produces byte-identical strings to that
   file's `formatModRow` so the same modifier reads the same on the card and
   in the Character tab. See docs/FINDINGS.md for the lift that would make it
   one function.

   TWO CARDS IS A REAL CASE, not a degenerate one: the grant tier ships at two
   rows by decision and `rules/draft.js`
   never pads, so the layout is driven by `run.offer.ids.length` and never
   reserves a gap where a third card would be. */

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
/* The divine accent `view/hud.js` and `view/ui/mainPanel.js` already use for a
   relic's frame -- a god's name on a card is the same fact, not a second one. */
const RELIC = colour('ichor');

/* `run.offer.tier` -> the frozen table its ids index. The four tiers of
   CLAUDE.md D1; `rules/draft.js` owns which ids, this owns what they look
   like. */
const TABLE = { boon: BOON, grant: GRANT, trinket: TRINKET, miracle: MIRACLE };

const TITLE = 'CHOOSE ONE';

const M = 3;      // outer margin, screen px
const PAD = 3;    // card inner padding, screen px
const GAP = 3;    // between cards, and between the block's three parts
const LINE = 8;   // 7px glyph cell + 1px leading
/* Below this a card is narrower than the longest single word any shipped row
   uses (10 chars, 59 px) plus its padding, so wrapping would start breaking
   words rather than lines. Two cards still fit side by side at the 200 px base
   buffer floor `core/canvas.js#resize` enforces; three do not, and drop to a
   second row rather than being squeezed. */
const MIN_CARD_W = 86;
/* And a ceiling, because the cards are a MODAL and not a banner: at 640 px of
   base width two cards would otherwise be 313 px each and hold three short
   lines of text in a shape nothing reads as a card. 128 px is 20 characters,
   which is the longest shipped row NAME (`BELLOWS OF THE FORGE`) on one line
   and wraps the flavour text to two or three. */
const MAX_CARD_W = 128;

/* Is the modal standing? `f.ui.stack` is `shell/ui.js`'s panel stack, handed
   over read-only. The `ids` test is the same one `shell/main.js`'s test-hook
   projection makes: a half-built `run.offer` is a REQUEST for an offer and
   there is nothing to draw for it. */
export const draftOpen = f => f.ui.stack.includes('draft') && !!run.offer?.ids?.length;

/* Greedy word wrap to `maxW` screen px at scale 1. A word wider than the
   whole line is hard-broken rather than allowed to overrun the card frame
   (CLAUDE.md D8: the mockup's overflow is a bug to fix, not a target). */
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

/* One `{key, mul, add}` row as the player reads it. Byte-identical wording to
   `view/ui/mainPanel.js#formatModRow`, and the same single accent colour, so
   a modifier reads the same on the card and in the Character tab.

   THE SIGN IS NOT THE POLARITY, and this deliberately does not pretend
   otherwise. `poseidon-flood`'s `hard x0.85` is a BENEFIT and `girdle`'s
   `climb x0.8` is a COST, and both print as a negative percentage -- whether
   up is good is a fact about the tunable, which lives in `data/tuning.js` and
   may only ever be imported by `model/mods.js`. Colouring by sign would state
   the wrong thing for one of those two rows at the exact moment the player is
   choosing. Parked in docs/FINDINGS.md with the one-key fix. */
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

/* IN PRIORITY ORDER, LAST DROPPED FIRST. The draw loop stops at the card's
   bottom edge rather than clipping (there is no `clip()` in this project's
   canvas vocabulary -- docs/DEVELOPER_GUIDE.md#widget-primitives), so line
   order IS the degradation rule: the asking god, the name and the numbers
   survive a short card; the flavour text is what goes. */
function cardLines(row, index, maxW) {
  const out = [];
  push(out, row.god ? `${index + 1}  ${godName(row.god)}` : String(index + 1), RELIC, maxW);
  push(out, row.name, INK, maxW);
  for (const m of row.mods ?? []) modLines(m, maxW, out);
  push(out, row.text, INK2, maxW);
  return out;
}

/* A row id the tier's table does not hold reads as the id itself rather than
   as a blank card -- the same fallback `data/gods.js#godName` makes for an
   unnamed god, and for the same reason: a content gap must be visible. */
const rowFor = (tier, id) => TABLE[tier]?.[id] ?? { name: String(id).toUpperCase(), text: '' };

/* The REROLL row's three strings: what it costs, whose purse pays, and -- when
   it cannot be pressed -- WHICH of the two refusals applies. The words are
   `rules/draft.js#reroll`'s own two, verbatim, so the dimmed row says exactly
   what pressing it would journal. `model/run.js#canReroll` is the single
   predicate both read, and `offerExhausted` is which half of it failed. A
   debug-key draft (`god` null) needs no branch: nobody is asking, so there is
   no purse, `have` is 0 and the row reads short-of-favour, which it is. */
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
   transform is identity (screen space), which is what `view/hud.js` draws in;
   leaves `globalAlpha` at 1. */
export function drawDraft(g, f) {
  if (!draftOpen(f)) return;
  const vw = f.W, vh = f.H;
  const ids = run.offer.ids, tier = run.offer.tier;

  /* The frozen world stays readable underneath, which is the whole point of
     the freeze: the player is choosing about THIS factory, not about a black
     screen. */
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
    /* The LAST row of a grid that does not divide evenly is centred on its own
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

  /* RECORDED EVEN WHEN DIMMED, and clickable: `rules/draft.js#reroll` is the
     one place that decides, and it refuses out loud through a `'refused'`
     journal row (D17-B: "never a hidden button"). A rect that silently
     swallowed the press would teach the player nothing that the reason
     already drawn on it does not -- and it would put the predicate in a
     second place. */
  const rp = drawPanel(g, {
    id: 'draft-reroll', x: M + ((availW - rrW) >> 1), y, w: rrW, h: rrH, vw, vh, alpha: 0.94
  });
  drawText(g, rr.main, rp.x + 3, rp.y + 2, rr.live ? INK : DIM, 1, 1);
  if (rr.reason) drawText(g, rr.reason, rp.x + 3, rp.y + 2 + LINE, AMBER, 1, 1);
}
