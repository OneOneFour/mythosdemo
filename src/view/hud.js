/* LAYER view — THE HUD. Drawn in the same pixel space as the world using the
   5x7 bitmap font. Imports `core`, `data` and READ-ONLY `model` queries.

   NO `fillText` anywhere. Below roughly 240 px of base width the panels
   overlap and the depth gauge collides with anything centred, which is what
   the clamps are for.

   `hoverInfo` is `view`'s own scratch record of what it drew last frame, read
   back only by the test hook. Nothing here calls `model/epoch.js#bump`. */

import { drawText, textWidth, wrap } from '../core/font.js';
import { R, lineTo } from '../core/pixels.js';
import { mix } from '../core/palette.js';
import { AIR, byHudOrder, F, FORM, labelOf, shortLabelOf } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { godName } from '../data/gods.js';
import { colour } from '../data/palette.js';
import { SPAWN_BAND } from '../data/world.js';
import { TRINKET } from '../data/trinkets.js';
import { BOON } from '../data/boons.js';
import { ASKERS, CYCLES } from '../data/cycles.js';
import { S } from '../data/substances.js';
import { aim } from '../model/aim.js';
import { boons } from '../model/boons.js';
import { committedWithin, markedAt, queued, withinReach } from '../model/digqueue.js';
import { eff, mods } from '../model/mods.js';
import { items } from '../model/items.js';
import { PH, player, playerCentre } from '../model/player.js';
import { defOf, feedCheck, feedTarget, machineAt } from '../model/machines.js';
import {
  batchHave, burdenFrac, burdenOf, cycleRow, hasPick, machineIdFor,
  placementCheck, run, tributeHave
} from '../model/run.js';
import { linkCheck, reachOf } from '../model/segments.js';
import { beat } from '../model/tutorial.js';
import { tileAt } from '../model/tiles.js';
import { bandOf, worldX, worldY } from '../model/world.js';
import { CALLOUTS } from '../data/callouts.js';
import { banner, frontToast, toasts } from './fx.js';
import { resolveHover } from './hover.js';
import { stats as paintStats } from './paint.js';
import { drawBar } from './ui/bar.js';
import { drawDraft, draftOpen } from './ui/draft.js';
import { drawMainPanel } from './ui/mainPanel.js';
import { drawPanel } from './ui/panel.js';
import { drawQuickbar } from './ui/quickbar.js';
import { drawRuler, masked, roman, rulerWidth } from './ui/ruler.js';
import { drawn as uiDrawn, resetDrawn as resetUiDrawn } from './ui/state.js';

/* Three ink tones. `ink` is primary, `ink2` the secondary body tone for
   de-emphasised text that must still read, and `dim` encodes a state rather
   than a volume -- in this file one site, `depth()`'s at-or-above-the-datum
   reading.

   `shade` is the text-shadow tone, and only for text drawn straight onto
   rendered world with no panel behind it. Anything inside `panel()` or
   `drawPanel()` gets no shadow, because the panel is the backing. */
const UI = {
  ink:    colour('ui'),
  ink2:   colour('uiInk2'),
  dim:    colour('uiDim'),
  shade:  colour('uiShade'),
  back:   colour('uiBack'),
  heart:  '#d8433a',
  hollow: '#2c2028',
  hi:     '#ff8a7a',
  good:   '#9ad86a',
  /* BURDEN's warning colour, past the soft cap. */
  amber:  '#e0a030',
  debug:  colour('watB'),
  /* A relic's frame and the armed miracle's ghost. `ichor` is the same
     divine-gold a trinket's own `look.item` uses, so border, swatch and
     ghost read as one material. */
  relic:  colour('ichor')
};

/* What a tooltip is showing right now, or `active:false`. The one thing this
   module exposes for introspection outside a draw call — see the header
   comment on why this is safe and `stats` in `view/paint.js` for the
   precedent. */
export const hoverInfo = { active: false, x: 0, y: 0, lines: null };

export function drawHUD(g, f) {
  const { W, H } = f;

  /* The widget layer's own scratch space is rebuilt once per HUD frame --
     see `view/ui/state.js`'s header. */
  resetUiDrawn();

  hearts(g, 6, 6);
  /* BURDEN's bottom edge is TRIBUTE's anchor, the same way `boonStack` hands
     its own bottom to `hudRuler` and `debug`. */
  const burdenBottom = burden(g, 6, 14, W);
  tribute(g, f, 6, burdenBottom, W);
  depth(g, W, 6);
  /* `favourBottom`, not `boonBottom`, is what reaches `hudRuler` and
     `debug`, or FAVOUR draws through whichever runs next. */
  const boonBottom = boonStack(g, f, W, 19);
  const favourBottom = favour(g, W, boonBottom + 3);
  /* BEFORE the reticle and the ghosts on purpose: a queued mark, the aim
     reticle and a build ghost can all land on one tile in one frame, and the
     one the next press acts on is the reticle. Painted first, it stays under
     them. */
  digMarks(g, f);
  reticle(g, f);
  buildGhost(g, f);
  collectPrompt(g, f);
  drawQuickbar(g, f);
  /* One widget, two mounts: `view/overview.js` mounts it full height. Drawn
     AFTER the quickbar, whose real rect it measures out of `drawn` to know
     where to stop, and BEFORE the main panel, which must cover it. */
  hudRuler(g, f, W, H, favourBottom);
  /* THE CALLOUT GOES UNDER THE WINDOW AND THE TOAST GOES OVER IT. Standing
     guidance loses to a window the player opened on purpose; a fact that
     just happened does not, or a refusal raised BY a click inside the panel
     would be hidden by the panel that raised it. */
  calloutLine(g, f, W, H);
  /* THE MAIN PANEL DRAWS OVER EVERY PERMANENT HUD ELEMENT ABOVE -- it is a
     window sitting over the HUD, not a member of it, and it PAUSES NOTHING:
     the world above it keeps stepping every frame it is open.
     `view/ui/mainPanel.js` no-ops when `main` is not on the panel stack. */
  drawMainPanel(g, f);
  toastLine(g, f, W, H);
  if (f.flags.showDebug) debug(g, f, W, favourBottom);
  /* Death outranks the win. A player cannot die after winning, since
     `shell/main.js#step` stops on `run.won`, but the reverse can happen
     inside one frame: a miss's heart loss and a completion are both
     `rules/cycles.js#step` decisions. */
  if (run.dead) deathScreen(g, W, H);
  else if (run.won) winScreen(g, W, H);
  /* A window over everything above it, including a main panel the player
     left open. BELOW the two end screens, because a finished run never
     reaches `applyDraftIntents`, so a modal over the win screen would be an
     untakeable card covering the restart button. ABOVE the title banner and
     the hover tooltip. */
  else if (draftOpen(f)) drawDraft(g, f);
  else if (banner.fade > 0) title(g, W, H);
  else tooltip(g, f);
}

/* Five discrete hearts, no partials and no regeneration, so a bar would be a
   lie -- the player must be able to count what a fall will cost. */
function hearts(g, x, y) {
  for (let i = 0; i < run.maxHearts; i++) {
    const full = i < run.hearts;
    const hx = x + i * 9;
    const col = full ? UI.heart : UI.hollow;
    R(g, hx,     y + 1, 2, 2, col);
    R(g, hx + 3, y + 1, 2, 2, col);
    R(g, hx,     y + 2, 5, 2, col);
    R(g, hx + 1, y + 4, 3, 1, col);
    R(g, hx + 2, y + 5, 1, 1, col);
    if (full) R(g, hx + 1, y + 1, 1, 1, UI.hi);
  }
}

/* A compact bar below the hearts, on the same `drawBar` primitive and the
   same three-state rule the Character tab uses: good under the soft cap,
   amber past it, red at or over the hard cap. Bar plus value text stays under
   130 px, so it never reaches the depth gauge even at the 200 px buffer
   floor. The lockout is spelled out in words, so a refused climb is never a
   silent wall. Returns the y just past what it drew; TRIBUTE reads it. */
function burden(g, x, y, W) {
  const cap = eff('burden'), soft = eff('burdenSoft'), frac = burdenFrac();
  const locked = frac >= 1;
  const col = locked ? UI.heart : frac >= soft ? UI.amber : UI.good;

  const bar = drawBar(g, {
    id: 'hud-burden', x, y, w: 50, h: 3, frac, fillColour: col, vw: W,
    valueText: `${burdenOf().toFixed(1)} / ${cap.toFixed(0)} T`,
    /* No panel behind it, unlike the Character tab's own copy of this bar --
       see `view/ui/bar.js`'s `shadow` note. */
    shadow: UI.shade
  });

  let by = bar.y + bar.h;
  if (locked) {
    drawText(g, 'TOO HEAVY TO CLIMB', x, by + 2, UI.heart, 1, 1, UI.shade);
    by += 9;
  }
  return by + 2;
}

/* m:ss. Every countdown this file prints uses it -- the tribute deadline, the
   batch window's own length and a boon's remaining time. */
function mmss(secs) {
  const s = Math.max(0, Math.ceil(secs));
  return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0');
}

/* Is a countdown flashing this instant? One rule, two readers -- the boon
   stack and the tribute deadline -- so "nearly out" cannot come to mean two
   things. Derived from `f.t` and the seconds left, never `rand()` and never a
   frame counter. 3 Hz reads without strobing. */
function urgentFlash(left, t) {
  return left > 0 && left <= eff('urgentSecs') && ((t * 6) | 0) % 2 === 0;
}

/* Left column, anchored at `burden()`'s returned bottom. Draws the same
   `have`/`need` numbers `tributeMet` decides completion from, never
   re-deciding it, and nothing at all when `run.tribute` is null. No timer
   line when `left === null`, because cycle 1 has no clock.

   Drawn through `drawBar` alone, so nothing lands in `drawn.panels` and the
   always-on-UI dispatcher gains no target. Rows order through `byHudOrder`,
   so a bill and the pockets agree on which pair comes first. */
const TRIBUTE_BAR_W = 50;
/* 4, not 2: the aggregate bar has no label, so `drawBar` centres its value
   text 2 px ABOVE the bar. A 2 px gap lands its "N%" flush against the demand
   row's bottom edge. */
const TRIBUTE_ROW_GAP = 4;

function tribute(g, f, x, y, W) {
  let ry = y;
  const cyc = run.tribute ? cycleRow() : null;

  if (cyc) {
    drawText(g, 'TRIBUTE ' + roman(run.cycle - 1), x, ry, UI.ink, 1, 1, UI.shade);
    ry += 8;

    const rows = cyc.demand
      .map(d => ({ ...d, so: S[d.sub], fo: F[d.form] }))
      .sort((a, b) => byHudOrder({ sub: a.so, form: a.fo }, { sub: b.so, form: b.fo }));

    /* Clamped PER ROW, though the ledger itself accepts over-delivery: a
       fraction over 1 across several over-filled rows would read as "more
       than done", which is not a state a trial has. */
    let have = 0, need = 0;
    for (const d of rows) {
      const h = tributeHave(d.sub, d.form);
      have += Math.min(h, d.n);
      need += d.n;
      const bar = drawBar(g, {
        id: 'tribute-' + d.sub + '-' + d.form, x, y: ry, w: TRIBUTE_BAR_W, h: 3,
        frac: d.n > 0 ? h / d.n : 1, vw: W,
        label: labelOf(d.so, d.fo), valueText: `${h} / ${d.n}`, shadow: UI.shade
      });
      ry = bar.y + bar.h + TRIBUTE_ROW_GAP;
    }

    /* The batch clause is a demand row and counts towards the aggregate.
       `tributeMet` is every demand row AND this clause, so an aggregate over
       the rows alone reads 100% on an unpaid cycle.

       Clamped at `batch.n` because `batchHave()` saturates near it --
       `prunedCredits` discards surplus -- so a raw count would print less than
       the player handed over. */
    const batch = cyc.batch;
    if (batch) {
      const h = Math.min(batchHave(), batch.n);
      have += h;
      need += batch.n;
      const bar = drawBar(g, {
        id: 'tribute-batch', x, y: ry, w: TRIBUTE_BAR_W, h: 3,
        frac: batch.n > 0 ? h / batch.n : 1, vw: W,
        label: batchLabel(batch, `${h} / ${batch.n}`, x, W),
        valueText: `${h} / ${batch.n}`, shadow: UI.shade
      });
      ry = bar.y + bar.h + TRIBUTE_ROW_GAP;
    }

    /* 99% IS THE CEILING SHORT OF DONE. `Math.round` alone reaches 100 from
       a fraction under 1 as soon as a trial asks for more than 200 units,
       and "100% and still refused" is the exact lie this row was fixed for. */
    const aggFrac = need > 0 ? have / need : 0;
    const pct = aggFrac >= 1 ? 100 : Math.min(99, Math.round(aggFrac * 100));
    const agg = drawBar(g, {
      id: 'tribute-progress', x, y: ry, w: TRIBUTE_BAR_W, h: 3, frac: aggFrac, vw: W,
      valueText: pct + '%', shadow: UI.shade
    });
    ry = agg.y + agg.h + TRIBUTE_ROW_GAP;

    if (run.tribute.left !== null) {
      const flash = urgentFlash(run.tribute.left, f.t);
      drawText(g, mmss(run.tribute.left), x, ry, flash ? UI.heart : UI.ink2, 1, 1, UI.shade);
      ry += 9;
    }
  }

  ry = missTally(g, x, ry, W);
  return ry === y ? y : ry + 2;
}

/* The widest row TRIBUTE draws, because it names a pair AND a window. At the
   200 px floor the full name ran its value text under the FAVOUR bars.
   FAVOUR's x cannot be read here, since it draws after this, so the budget is
   the left half of the viewport. Over budget it falls back to `shortLabelOf`
   rather than to a runtime truncation. */
function batchLabel(batch, valueText, x, W) {
  const span = ' IN ' + mmss(batch.secs);
  const full = labelOf(S[batch.sub], F[batch.form]) + span;
  const rowW = Math.max(TRIBUTE_BAR_W, textWidth(full)) + 3 + textWidth(valueText);
  return rowW <= (W >> 1) - x ? full : shortLabelOf(S[batch.sub], F[batch.form]) + span;
}

/* How close the run is to ending on the calendar rather than on hearts. Drawn
   only once a deadline has expired, in the heart colour, because the second
   miss empties the bar outright. Stays up between trials, so the frame
   `run.tribute` is null does not blink it away.

   One line or two, against the same left-half budget the batch row uses: at
   the 200 px floor a single line reaches the FAVOUR bars. */
function missTally(g, x, y, W) {
  if (!run.misses) return y;
  const count = 'MISSED ' + run.misses;
  const warn = run.misses === 1 ? 'ONE MORE ENDS THIS' : null;
  const joined = warn ? count + ' -- ' + warn : count;
  const rows = !warn || textWidth(joined) <= (W >> 1) - x ? [joined] : [count, warn];

  let ry = y;
  for (const r of rows) {
    drawText(g, r, Math.max(2, Math.min(x, W - textWidth(r) - 2)), ry, UI.heart, 1, 1, UI.shade);
    ry += 9;
  }
  return ry;
}

/* The tooltip itself. `resolveHover` does the actual hit-testing and content
   lookup, entirely from the pointer and the model; this just lays out
   whatever it returns and remembers it in `hoverInfo` for the test hook. */
function tooltip(g, f) {
  /* `drawn.tooltip` is a single slot, so a panel that already drew one this
     frame wins. Both read the same pointer, and a panel's grids sit over the
     world. */
  if (uiDrawn.tooltip) return;
  /* No HUD hitboxes of its own, so this falls straight through to
     `resolveHover`'s world path: falling item, then machine, then bare
     tile. */
  const info = resolveHover(f, []);
  hoverInfo.active = !!info;
  hoverInfo.x = info ? info.x : 0;
  hoverInfo.y = info ? info.y : 0;
  hoverInfo.lines = info ? info.lines : null;
  if (!info) return;

  const { x, y, lines } = info;
  let w = 0;
  for (const l of lines) w = Math.max(w, textWidth(l));
  w += 8;
  const h = lines.length * 8 + 4;

  /* Offset from the cursor, then clamped to stay on-screen -- a tooltip that
     runs off the edge at the corner of a narrow viewport is unreadable, which
     is the same class of bug the panel clamps above exist to prevent. */
  const bx = Math.min(x + 8, f.W - w - 2);
  const by = Math.min(y + 8, f.H - h - 2);

  panel(g, bx, by, w, h, 0.92);
  lines.forEach((l, i) => drawText(g, l, bx + 4, by + 3 + i * 8, i === 0 ? UI.ink : UI.ink2, 1, 1));
}

/* One tile reads one metre, measured from the SPAWN band's ground line, so
   depth is a fact about the world rather than about which band you are in.

   Measured at the FEET, `player.y + PH`, because `player.y` is the TOP of the
   16 px body and measuring it read `+2M` on the spawn floor. The datum is
   `worldY(ref, floorTy)`, the same expression `placementCheck` gates
   `minDepth` on -- that one measures a tile row, so it has no `PH` to add. */
function depth(g, W, y) {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return;
  const datum = worldY(ref, ref.cfg.floorTy ?? 0);
  const d = Math.round((player.y + PH - datum) / ref.tile);
  const s = (d >= 0 ? d : '+' + -d) + 'M';
  const w = textWidth(s) + 8;
  panel(g, W - w - 6, y - 2, w, 11);
  /* `dim` encodes a state here: the reading is at or above the spawn datum,
     so the number is a fact about the surface rather than about a descent. */
  drawText(g, s, W - w - 2, y, d > 0 ? UI.ink : UI.dim, 1, 1);
}

/* Both ends are measured, never chosen. The TOP is `boonStack`'s return, the
   y just past what it drew, so the ruler moves with the live boon rows. The
   BOTTOM is the quickbar's REAL rect out of `drawn`, not a copy of its
   arithmetic -- two panels that must not overlap share the rectangle one of
   them actually painted.

   No names and no footer: the depth figure and band name already exist
   top-right. What the HUD gains is the shape. Skipped when the gap is too
   short to read, since a 20 px bar over 416 rows is a smear. */
const HUD_RULER_MIN_H = 40;

function hudRuler(g, f, W, H, boonBottom) {
  const y = boonBottom + 6;
  const qb = uiDrawn.grids.find(gr => gr.id === 'quickbar');
  const bottom = (qb ? qb.y : H - 12) - 4;
  if (bottom - y < HUD_RULER_MIN_H) return;
  drawRuler(g, { id: 'hud-ruler', x: W - rulerWidth() - 2, y, h: bottom - y, vw: W, vh: H });
}

/* Top-right, newest at top: `boons.active` is append-order and never
   reordered on refresh, so walking it backwards puts the newest on top.
   Capped at 5 rows with a '+N' overflow line.

   Nothing here is clickable. The fill and the last-5-seconds flash derive
   only from `f.t` and the boon's `left`, never `rand()`, or a screenshot
   would depend on how many times the HUD had been drawn. Returns the y just
   past what it drew. */
const BOON_ROWS_MAX = 5;
const BOON_ROW_H = 9;

function boonStack(g, f, W, startY) {
  const rows = boons.active;
  if (!rows.length) return startY;

  const shown = rows.slice(-BOON_ROWS_MAX).reverse();
  const overflow = rows.length - shown.length;
  let y = startY;

  for (const a of shown) {
    const b = BOON[a.id];
    if (!b) continue;
    const frac = Math.max(0, Math.min(1, a.left / b.secs));
    const flash = urgentFlash(a.left, f.t);

    /* POLISH: the SHORT name here -- the boon timer stack is the exact
       fixed-width, right-anchored row named as clipping-prone ("FORGE OF
       HEPHAESTUS"). Falls back to the full name for a boon with no `short`
       given yet, same as `shortLabelOf` does for a substance/form pair. */
    const label = b.short || b.name;
    const timeStr = mmss(a.left);
    const barW = 24;
    const w = 6 + textWidth(label) + 4 + barW + 4 + textWidth(timeStr) + 4;
    const x = Math.max(2, W - w - 6);

    R(g, x, y, 4, 4, UI.relic);                              // a god's gift, same accent a trinket's border uses
    drawText(g, label, x + 6, y - 1, flash ? UI.heart : UI.ink, 1, 1, UI.shade);
    const barX = x + 6 + textWidth(label) + 4;
    R(g, barX, y, barW, 3, UI.hollow);
    R(g, barX, y, Math.round(barW * frac), 3, flash ? UI.heart : UI.good);
    drawText(g, timeStr, barX + barW + 4, y - 1, UI.ink2, 1, 1, UI.shade);

    y += BOON_ROW_H;
  }

  if (overflow > 0) {
    const s = '+' + overflow;
    drawText(g, s, Math.max(2, W - textWidth(s) - 6), y - 1, UI.ink2, 1, 1, UI.shade);
    y += BOON_ROW_H;
  }

  return y;
}

/* Right column, in the boon stack's anchor chain: given `boonBottom + 3`, and
   its own return reaches `hudRuler` and `debug`.

   Masked with `view/ui/ruler.js#masked`, the one place that predicate lives. A
   god is known once `run.favour[god] !== undefined`, and both `complete` and
   `miss` write favour unconditionally, so the first resolution of a cycle
   takes the mask off, win or lose. `FAVOUR_MAX` is derived from the table, so
   the bar cannot imply a ceiling the content lacks; negative favour clamps
   the BAR to empty while `valueText` prints the real number. */
const FAVOUR_MAX = CYCLES.reduce((s, c) => s + (c.reward.favour || 0), 0);
const FAVOUR_ROW_GAP = 2;

function favour(g, W, startY) {
  if (!ASKERS.length) return startY;

  const rows = ASKERS.map(god => {
    const known = run.favour[god] !== undefined;
    const n = run.favour[god] ?? 0;
    return {
      god, known,
      label: masked(godName(god), known),
      valueText: known ? String(n) : '',
      frac: Math.max(0, Math.min(1, n / FAVOUR_MAX))
    };
  });

  /* The bar is as wide as the widest name, or the mask. `drawBar` puts a
     bar's value text beside the BAR at a y inside the LABEL's line above, so
     a bar narrower than its label ("HEPHAESTUS" is 59 px) pushed the number
     against the label's tail and read as an exponent.

     The panel's x must also clear the widest value on screen this frame, or
     the same collision moves to the viewport edge: with the bar flush to
     `vw - 6`, `drawBar`'s clamp pulls the value text back over it. `rowW` is
     measured from what is drawn, so the margin is exactly as wide as
     needed. */
  let labelW = 0, valueW = 0;
  for (const r of rows) {
    labelW = Math.max(labelW, textWidth(r.label));
    valueW = Math.max(valueW, textWidth(r.valueText));
  }
  const barW = labelW;
  const rowW = Math.max(labelW, barW + 3 + valueW);
  const x = Math.max(2, W - rowW - 6);

  let y = startY;
  for (const r of rows) {
    const bar = drawBar(g, {
      id: 'favour-' + r.god, x, y, w: barW, h: 3, vw: W,
      frac: r.frac, label: r.label, valueText: r.valueText, shadow: UI.shade
    });
    y = bar.y + bar.h + FAVOUR_ROW_GAP;
  }
  return y;
}

/* Three states, and telling them apart is the whole feature:
     WORKED     the tile mining is committed to. X in a 1 px frame, primary
                ink, at most one per frame.
     IN REACH   a mark inside `eff('reach')`. The whole X, primary ink.
     DEFERRED   beyond reach. Two px of each of the X's four ends, state tone.

   Density and tone carry the read, not alpha, which lost the deferred state
   over grass. An X, because `reticle` draws elbows and `drawFootprintGhost`
   fills the tile. `committedWithin` and `withinReach` take `reach` as a
   parameter, so this pass and the rules step cannot disagree. */

/* The X, inset a pixel so it reads as a mark on the tile rather than a border
   of it, over a shadow of itself one row lower. `tips` keeps two pixels of
   each end and drops the middle.

   The shadow is what makes a diagonal read on any ground, since light pixels
   carry on unlit rock and dark ones on lit grass. Shadows go down FIRST, in
   their own pass, so one never lands on a mark pixel, and the lowest falls on
   row `t - 1` and never leaves the tile. Under a 4 px tile the tile fills. */
function markGlyph(g, x, y, t, col, tips) {
  const n = t - 2;
  if (n < 2) { R(g, x, y, t, t, col); return; }
  const keep = tips ? 2 : n;
  for (const [c, dy] of [[UI.shade, 1], [col, 0]])
    for (let i = 0; i < n; i++) {
      if (i >= keep && i < n - keep) continue;
      R(g, x + 1 + i,     y + 1 + i + dy, 1, 1, c);
      R(g, x + t - 2 - i, y + 1 + i + dy, 1, 1, c);
    }
}

function digMarks(g, f) {
  const set = queued();
  if (!set.size || run.dead) return;

  const c = playerCentre();
  const reach = eff('reach');
  const target = committedWithin(c.x, c.y, reach);

  for (const m of set.values()) {
    /* A stale mark is collected by `rules/mining.js` on its next substep, not
       here, because reads never mutate. `markedAt` is the model's own
       staleness predicate, so this pass cannot invent a second answer. */
    if (!markedAt(m.band, m.tx, m.ty)) continue;

    const t = m.band.tile;
    const x = (worldX(m.band, m.tx) - f.cam.x) | 0;
    const y = (worldY(m.band, m.ty) - f.cam.y) | 0;
    if (x <= -t || y <= -t || x >= f.W || y >= f.H) continue;

    const worked = !!target && target.b === m.band && target.tx === m.tx && target.ty === m.ty;
    const near = worked || withinReach(m, c.x, c.y, reach);

    markGlyph(g, x, y, t, near ? UI.ink : UI.dim, !near);
    if (worked) {
      R(g, x, y, t, 1, UI.ink);         R(g, x, y + t - 1, t, 1, UI.ink);
      R(g, x, y + 1, 1, t - 2, UI.ink); R(g, x + t - 1, y + 1, 1, t - 2, UI.ink);
    }
  }
}

/* The aim reticle, in world space but drawn with the HUD because it is a
   statement about the pick and not about the rock. */
function reticle(g, f) {
  if (!aim.valid || !aim.band || !hasPick() || run.dead) return;
  const b = aim.band, t = b.tile;
  const x = (b.origin.x + aim.tx * t - f.cam.x) | 0;
  const y = (b.origin.y + aim.ty * t - f.cam.y) | 0;
  if (x < -t || y < -t || x > f.W || y > f.H) return;
  const col = aim.mode === 'place' ? UI.good : '#ffe9a8';
  g.globalAlpha = 0.75;
  R(g, x, y, 2, 1, col);             R(g, x, y, 1, 2, col);
  R(g, x + t - 2, y, 2, 1, col);     R(g, x + t - 1, y, 1, 2, col);
  R(g, x, y + t - 1, 2, 1, col);     R(g, x, y + t - 2, 1, 2, col);
  R(g, x + t - 2, y + t - 1, 2, 1, col);
  R(g, x + t - 1, y + t - 2, 1, 2, col);
  g.globalAlpha = 1;
}

/* Preview the armed pair's footprint at the reticle, snapped to the grid and
   tinted by `model/run.js#placementCheck` -- the same query
   `rules/placement.js#placeMachine` calls before touching the world. `view`
   may not import `rules`, so this reads a model query and nothing else.
   Anchored bottom row at the aimed tile, exactly as a real placement is, so
   the preview can never show a spot the placement would not choose. */
function drawFootprintGhost(g, f, band, tx, ty, tw, th, ok, why) {
  const t = band.tile;
  const col = ok ? UI.good : UI.heart;

  g.globalAlpha = 0.35;
  for (let j = 0; j < th; j++)
    for (let i = 0; i < tw; i++) {
      const x = (band.origin.x + (tx + i) * t - f.cam.x) | 0;
      const y = (band.origin.y + (ty + j) * t - f.cam.y) | 0;
      R(g, x, y, t, t, col);
    }
  g.globalAlpha = 1;

  if (!ok && why) {
    const x = (band.origin.x + tx * t - f.cam.x) | 0;
    const y = (band.origin.y + ty * t - f.cam.y) | 0;
    ghostLabel(g, f, x, y, why, UI.heart);
  }
}

/* The reason, in the ghost's own colour, one line above the top-left of its
   subject, shadowed so it survives lit rock. Clamped to the viewport, because
   a refusal off the edge is a refusal nobody reads.

   `below` puts the line one row UNDER `y`. `feedGhost`'s machine-anchored
   label and `feedPrompt`'s player-anchored one fire in the same frame a tile
   or two apart, so stacking both above would print one over the other. */
function ghostLabel(g, f, x, y, text, col, below = false) {
  const w = textWidth(text);
  const ly = below ? y + 2 : y - 8;
  drawText(g, text, Math.max(2, Math.min(x, f.W - w - 2)),
           Math.max(2, Math.min(ly, f.H - 10)), col, 1, 1, UI.shade);
}

/* With something armed and a machine under the reticle, LMB feeds rather than
   places. `model/machines.js#feedCheck` is the query `handOne` enforces and
   this previews. An outline, not a fill, because a machine already has art, a
   badge and a buffer bar.

   Reach is deliberately NOT checked: it is a fact about the body at the
   instant of a press, which `feedTarget` asks once, there. So this states a
   property of the machine and the pair, and walking closer never changes it.
   `have`/`cap` are the matched CLAUSE's, not the machine's total, since the
   furnace's 8-ore/2-fuel asymmetry needs that. Both are 0 on a refusal. */
function feedGhost(g, f, m, armed) {
  const check = feedCheck(m, armed.sub, armed.form);
  const col = check.ok ? UI.good : UI.heart;
  const x = (m.box.x - f.cam.x) | 0, y = (m.box.y - f.cam.y) | 0;
  const w = m.box.w | 0, h = m.box.h | 0;

  g.globalAlpha = 0.85;
  R(g, x, y, w, 1, col);
  R(g, x, y, 1, h, col);
  R(g, x, y + h - 1, w, 1, col);
  R(g, x + w - 1, y, 1, h, col);
  g.globalAlpha = 1;

  ghostLabel(g, f, x, y, check.ok ? check.have + '/' + check.cap : check.why, col);
}

/* At the PLAYER rather than the machine: `feedGhost` answers "would this
   machine take it" from anywhere the reticle reaches, and this answers "is a
   press live this instant", which needs `feedTarget`'s reach check -- the same
   one `shell/input.js` asks before setting `cmd.feed`. Feeding is LMB with no
   bound key, so the label spells the button.

   Below the feet, not above the head, because `feedGhost`'s label occupies the
   row above the MACHINE and the two subjects sit close on screen. */
function feedPrompt(g, f) {
  const x = (player.x - f.cam.x) | 0, y = (player.y + PH - f.cam.y) | 0;
  ghostLabel(g, f, x, y, 'LMB FEED', UI.good, true);
}

/* The pickup analogue of `feedPrompt`. Pickup is opt-in, so standing over a
   resting item collects nothing, and this is silent while auto collect is on.
   `items`/`eff('pickupR')` mirror `rules/items.js#step`'s `near()` gate,
   measured from the player's centre since collect has no aim, repeated here
   because `view` may not import `rules`. Above the head, the opposite of
   `feedPrompt`, so neither row lies if both are ever true. */
function collectPrompt(g, f) {
  if (f.ui.autoCollect) return;
  const c = playerCentre(), r = eff('pickupR');
  const near = items.some(it => {
    const dx = it.x - c.x, dy = it.y - c.y;
    return dx * dx + dy * dy < r * r;
  });
  if (!near) return;
  const x = (player.x - f.cam.x) | 0, y = (player.y - f.cam.y) | 0;
  ghostLabel(g, f, x, y, 'C COLLECT', UI.good);
}

/* An armed `phial` is the top LMB rule, so it silently converts LMB from
   "dig" to "spend a one-shot". Drawn in the divine gold, not good/red: those
   mean "this placement is legal / is not", and a miracle has no legality to
   report.

   A tile fill plus four spokes -- the fill is `drawFootprintGhost`'s own
   35%-alpha idiom, the spokes are what stop it reading as a placement. Static
   geometry from `aim` alone, no `clock.t` pulse and no `rand()`, or a
   screenshot would depend on when it was taken. */
const MIRACLE_SPOKE = 3;
function miracleGhost(g, f) {
  const b = aim.band, t = b.tile;
  const x = (b.origin.x + aim.tx * t - f.cam.x) | 0;
  const y = (b.origin.y + aim.ty * t - f.cam.y) | 0;
  const cx = x + (t >> 1), cy = y + (t >> 1);

  g.globalAlpha = 0.35;
  R(g, x, y, t, t, UI.relic);
  g.globalAlpha = 1;

  R(g, cx, y - MIRACLE_SPOKE, 1, MIRACLE_SPOKE, UI.relic);
  R(g, cx, y + t, 1, MIRACLE_SPOKE, UI.relic);
  R(g, x - MIRACLE_SPOKE, cy, MIRACLE_SPOKE, 1, UI.relic);
  R(g, x + t, cy, MIRACLE_SPOKE, 1, UI.relic);
}

/* Draws the cable the second `l` press would create, tinted by
   `model/segments.js#linkCheck` -- the same query `linkSegment` calls before
   it mutates anything. Four things, each a different question:
     the armed end       WHICH hub the gesture is anchored to
     the cable           WHERE it would run, and whether it is legal
     the reach limit     HOW FAR this hub reaches; the cable clips there
     the blocked sample  WHICH tile is in the way, from `linkCheck`'s `at`
   Aiming at nothing is a third state, not a refusal: no machine means no pair
   to check, so the cable is dim and no `why` is printed. The reach clip still
   shows, because reach is a fact about the armed hub alone. */
function cableGhost(g, f) {
  const from = f.ui.linkFrom;
  /* Must stay the same point `model/segments.js#anchorOf` picks, or the ghost
     previews a cable offset from the one the link creates. Re-derived rather
     than imported, since it is two additions on a box `view` already holds. */
  const ax = from.box.x + from.box.w / 2, ay = from.box.y + from.box.h / 2;

  const to = machineAt(aim.band, aim.tx, aim.ty);
  const t = aim.band.tile;
  const bx = to ? to.box.x + to.box.w / 2 : aim.band.origin.x + aim.tx * t + t / 2;
  const by = to ? to.box.y + to.box.h / 2 : aim.band.origin.y + aim.ty * t + t / 2;

  const check = to && to !== from ? linkCheck(from, to) : null;
  const col = !check ? UI.dim : check.ok ? UI.good : UI.heart;

  /* Clipped at the SMALLER of the two reaches, exactly as `linkCheck` refuses
     on it -- so the clip point and the refusal are one number. */
  const reach = Math.min(reachOf(from), to ? reachOf(to) : Infinity);
  const len = Math.hypot(bx - ax, by - ay);
  const clipped = reach > 0 && len > reach;
  const k = clipped ? reach / len : 1;

  const x0 = (ax - f.cam.x) | 0, y0 = (ay - f.cam.y) | 0;
  const x1 = (ax + (bx - ax) * k - f.cam.x) | 0;
  const y1 = (ay + (by - ay) * k - f.cam.y) | 0;

  g.globalAlpha = 0.85;
  lineTo(g, x0, y0, x1, y1, col);
  g.globalAlpha = 1;

  /* The armed end: FOUR CORNER BRACKETS, not a fill, so the hub's own art
     stays visible under the marker that says "this end is spoken for". */
  const lx = x0 - from.box.w / 2, rx = x0 + from.box.w / 2 - 1;
  const ty = y0 - from.box.h / 2, byy = y0 + from.box.h / 2 - 1;
  for (const [cx, sx] of [[lx, 1], [rx, -1]])
    for (const [cy, sy] of [[ty, 1], [byy, -1]]) {
      R(g, sx > 0 ? cx : cx - 2, cy, 3, 1, UI.good);
      R(g, cx, sy > 0 ? cy : cy - 2, 1, 3, UI.good);
    }

  if (clipped) {                                    // where the reach runs out
    R(g, x1 - 2, y1 - 2, 5, 1, UI.heart);
    R(g, x1 - 2, y1 + 2, 5, 1, UI.heart);
    R(g, x1 - 2, y1 - 1, 1, 3, UI.heart);
    R(g, x1 + 2, y1 - 1, 1, 3, UI.heart);
  }

  if (check?.at) {                                  // the FIRST blocked sample
    const sx = (check.at.x - f.cam.x) | 0, sy = (check.at.y - f.cam.y) | 0;
    g.globalAlpha = 0.55;
    R(g, sx - 3, sy - 3, 7, 7, UI.heart);
    g.globalAlpha = 1;
    R(g, sx - 1, sy - 1, 3, 3, UI.hi);
  }

  /* Clamped to the viewport, because a refusal drawn off the right edge at a
     narrow buffer is a refusal nobody reads. */
  if (check && !check.ok) {
    const w = textWidth(check.why);
    drawText(g, check.why, Math.max(2, Math.min(x1 + 5, f.W - w - 2)),
             Math.max(2, Math.min(y1 - 4, f.H - 10)), UI.heart, 1, 1, UI.shade);
  }
}

function buildGhost(g, f) {
  if (!aim.valid || !aim.band) return;

  /* A LINK IN PROGRESS OUTRANKS AN ARMED PLACEMENT, because the two gestures
     use the same reticle and only one of them can be what the next press
     means. `l` armed a hub, so the next press links; whatever is armed in the
     quickbar is not what the player is doing. */
  if (f.ui.linkFrom) { cableGhost(g, f); return; }

  /* The same footprint tint, generalised to a single tile. `view` may not
     import `rules`, so `placeTile`'s "needs something to hang from" is not
     re-proven; what this can check is whether the tile is clear, which
     covers the common case of aiming at solid rock. */
  const armed = f.ui.armedPlace;
  if (!armed) return;

  /* This branch order IS `shell/input.js`'s LMB dispatch order, and must be:
     a ghost previewing a lower-priority rule than the press will fire is
     confidently wrong.
       1  an armed miracle always wins            -> `miracleGhost`
       2  a machine under the reticle, in reach   -> `feedGhost`
       3  open ground, something armed            -> the footprint ghosts
       4  otherwise mine                          -> no ghost
     `view` may not import `shell`, so the order is mirrored rather than
     shared, which is why both lists are written out in full. */
  if (armed.form === F.phial) { miracleGhost(g, f); return; }

  /* `def.handFeed` is part of the test: it is the first half of `feedTarget`'s
     two questions. A gear, an axle or a hub has no hand-feed clause, so rule
     2 cannot fire on it and the press falls to rule 3. `feedTarget(armed)` is
     called again below, reach and all, only to decide whether `feedPrompt` is
     warranted. */
  const target = machineAt(aim.band, aim.tx, aim.ty);
  if (target && defOf(target).handFeed) {
    feedGhost(g, f, target, armed);
    if (feedTarget(armed)) feedPrompt(g, f);
    return;
  }

  if (armed.form === F.rig) {
    const id = machineIdFor(armed.sub);
    const def = id && MACH[M[id]];
    if (!def) return;
    const tx = aim.tx, ty = aim.ty - def.th + 1;
    const check = placementCheck(aim.band, id, tx, ty);
    drawFootprintGhost(g, f, aim.band, tx, ty, def.tw, def.th, check.ok, check.why);
  } else if (FORM[armed.form]?.tile) {
    const ok = tileAt(aim.band, aim.tx, aim.ty) === AIR;
    drawFootprintGhost(g, f, aim.band, aim.tx, aim.ty, 1, 1, ok, ok ? null : 'SOMETHING IS ALREADY THERE');
  }
}

/* A transient toast always wins, because it is a fact that just happened and
   is more urgent than standing guidance. The FRONT of the queue, not the
   back, so two facts arriving in one frame show in the order they happened.

   With none showing, the callout falls back to whichever tutorial beat the
   player has not finished. Two indices are `null` and show nothing. */
const CALLOUT_FADE_SECS = 0.4;
const calloutFade = { beat: -1, since: 0 };

function toastLine(g, f, W, H) {
  const front = frontToast();
  if (front) bottomLine(g, f, W, H, front.text, 1);
}

function calloutLine(g, f, W, H) {
  if (toasts.length) return;
  const b = beat(run);
  const text = CALLOUTS[b];
  if (!text) return;
  /* Queued, not overlapping: only one line is drawn, so a beat change cannot
     show two instructions at once. The fade derives from `f.t` plus the beat
     it last changed at, never a frame counter and never `rand()`. */
  if (b !== calloutFade.beat) { calloutFade.beat = b; calloutFade.since = f.t; }
  bottomLine(g, f, W, H, text,
             Math.min(1, Math.max(0, (f.t - calloutFade.since) / CALLOUT_FADE_SECS)));
}

/* Wrapped because the panel clamps and `drawText` does not clip. The width is
   capped at `W - 4`, but text drawn at `x + 6` runs as far as it likes, so at
   the 200 px buffer 8 of the 9 callout rows spilled off the right edge.

   `LINE_PITCH * n + 4` is 12 for one line, the height this panel has always
   had, so nothing moves where every row already fits. */
const LINE_PITCH = 8;
const CALLOUT_PAD = 12;

/* Exported so the harness can assert every callout row fits at
   `core/canvas.js#BASE_W_MIN` against the budget the renderer uses, rather
   than a second copy of these two numbers. */
export const calloutLines = (text, W) => wrap(text, W - 4 - CALLOUT_PAD);

function bottomLine(g, f, W, H, text, fadeAlpha) {
  const lines = calloutLines(text, W);
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, textWidth(l));
  const w = Math.min(widest + CALLOUT_PAD, W - 4);
  const h = lines.length * LINE_PITCH + 4;
  const x = Math.max(2, (W - w) >> 1);
  const y = Math.max(2, calloutBottom(H, x, w) - h);
  panel(g, x, y, w, h, 0.78, fadeAlpha);
  g.globalAlpha = fadeAlpha;
  lines.forEach((l, i) => drawText(g, l, x + 6, y + 3 + i * LINE_PITCH, UI.ink, 1, 1));
  g.globalAlpha = 1;
}

/* How far down the callout may reach. It is centred and the quickbar is
   pinned right, so the two meet only when the text runs under the strip,
   which happens at the 200 px floor. Both neighbours' rects are read out of
   `drawn`, never re-derived, and the callout lifts only where it overlaps one
   in x. With room it sits at `H - 4`.

   The reserve above the quickbar's rect is its `HAND_GAP` of 10 px plus 2 px
   of air, because the IN HAND line lives in that gap and is not part of the
   grid's rectangle. Held whether or not a pair is armed, so the callout does
   not hop. */
const QUICKBAR_RESERVE = 12;

function calloutBottom(H, x, w) {
  let bottom = H - 4;
  const qb = uiDrawn.grids.find(gr => gr.id === 'quickbar');
  if (qb && x < qb.x + qb.w && x + w > qb.x)
    bottom = Math.min(bottom, qb.y - QUICKBAR_RESERVE);
  const keys = uiDrawn.panels.find(p => p.id === 'hints-toggle');
  if (keys && x < keys.x + keys.w && x + w > keys.x)
    bottom = Math.min(bottom, keys.y - 2);
  return bottom;
}

function debug(g, f, W, top = 22) {
  const panelY = Math.max(22, top);
  const rows = [
    'FPS ' + (f.dt > 0 ? Math.round(1 / f.dt) : 0),
    'BAND ' + (player.band ? player.band.id.toUpperCase() : '-'),
    'POS ' + Math.round(player.x) + ',' + Math.round(player.y),
    'VY ' + Math.round(player.vy),
    'GND ' + (player.onGround ? 'Y' : 'N') + ' LAD ' + (player.onLadder ? 'Y' : 'N'),
    'PAINT ' + paintStats.painted + ' RE ' + paintStats.repainted +
      ' CACHE ' + paintStats.cached,
    'MODS ' + mods.rows.length + ' ' +
      [...new Set(mods.rows.map(m => m.src))].map(id => TRINKET[id]?.god || id).join(' ')
  ];
  let w = 0;
  for (const r of rows) w = Math.max(w, textWidth(r));
  panel(g, W - w - 12, panelY, w + 10, rows.length * 9 + 6, 0.8);
  rows.forEach((r, i) => drawText(g, r, W - w - 7, panelY + 4 + i * 9, UI.debug, 1, 1));
}

/* Sized from its own measured label, never a hardcoded origin, and registered
   into `drawn.panels` under `'death-restart'` so
   `shell/input.js#onDeathRestart` hit-tests what was actually drawn rather
   than a second copy of this layout arithmetic. */
const RESTART_LABEL = 'BEGIN THE NEXT TORMENT';

/* Two end-of-run screens, one implementation. `deathScreen` and `winScreen`
   differ only in wash, lines and the id their button records; the layout, the
   measured button and the `drawn.panels` registration are here once. `id` is
   what makes the two hit-testable apart. */
function endScreen(g, W, H, { wash, lines, id }) {
  g.globalAlpha = 0.78; R(g, 0, 0, W, H, wash); g.globalAlpha = 1;
  let y = (H >> 1) - 26;
  for (const [s, col, want] of lines) {
    /* A double-size headline drops to single rather than overflowing.
       `THE EAGLE COMES` is 164 px at scale 2 and fits the 200 px buffer floor;
       `THE GODS ARE ANSWERED` is 252 px and clipped mid-word. Measured, so no
       line has to be kept short by hand. */
    const sc = want > 1 && textWidth(s, want) > W - 8 ? want - 1 : want;
    drawText(g, s, Math.max(4, (W - textWidth(s, sc)) >> 1), y, col, sc, 1);
    y += sc === 2 ? 22 : 13;
  }

  const bw = textWidth(RESTART_LABEL) + 8, bh = 11;
  const btn = drawPanel(g, { id, x: (W - bw) >> 1, y, w: bw, h: bh, vw: W, vh: H, alpha: 0.9 });
  drawText(g, RESTART_LABEL, btn.x + 4, btn.y + 2, UI.good, 1, 1);
}

/* Depth reached, in the same datum `depth()` draws off and `placementCheck`
   gates on. `run.deepest` is the deepest `player.y`, the top of the body, so
   it takes the same `+ PH`. Shared by both end screens. */
function depthReached() {
  const ref = bandOf(SPAWN_BAND);
  const datum = ref ? worldY(ref, ref.cfg.floorTy ?? 0) : 0;
  const tile = ref ? ref.tile : 8;
  return Math.max(0, Math.round((run.deepest + PH - datum) / tile));
}

/* THE TWO LINES BOTH ENDINGS PRINT, WRITTEN ONCE. A run is worth the same
   three facts whichever way it ended -- how many trials were paid, what the
   gods think of you, and what it cost -- and the death screen used to carry
   only the last of them. `run.cycle - 1` is trials PAID, and a win leaves
   `run.cycle` one past the last shipped row, so the same expression reads
   `CYCLES.length` there and the win screen's own pixels do not move.

   `ink2` on the second row, not `dim`: it encodes nothing and only wants to
   sit quieter than the row above. No shadow on either, because the
   full-screen wash is the backing. */
function tallyLines() {
  const favourTotal = Object.values(run.favour ?? {}).reduce((a, b) => a + b, 0);
  return [
    [Math.max(0, run.cycle - 1) + ' TRIALS PAID -- ' + favourTotal + ' FAVOUR', UI.ink, 1],
    ['MISSES ' + run.misses + ' -- DEPTH REACHED ' + depthReached() + 'M', UI.ink2, 1]
  ];
}

function deathScreen(g, W, H) {
  endScreen(g, W, H, {
    wash: '#0a0206',
    id: 'death-restart',
    lines: [
      ['THE EAGLE COMES', UI.heart, 2],
      [run.deathCause || 'UNKNOWN', UI.ink, 1],
      ...tallyLines()
    ]
  });
}

/* `run.won` is set once, the frame `run.cycle` passes the last shipped row,
   so this draws for the rest of the process's life and `shell/main.js#step`
   stops stepping.

   `endScreen` with a different wash, different lines and the id
   `'win-restart'`, hit-tested through the same `drawn.panels` lookup the
   death button uses. */
function winScreen(g, W, H) {
  endScreen(g, W, H, {
    /* A pale gold wash rather than the death screen's near-black red: the two
       endings must not be mistakable for each other at a glance. */
    wash: '#1b1608',
    id: 'win-restart',
    lines: [
      ['THE GODS ARE ANSWERED', UI.good, 2],
      ...tallyLines()
    ]
  });
}

function title(g, W, H) {
  g.globalAlpha = Math.min(1, banner.fade);
  /* Straight onto the rendered world with nothing behind it, so both lines
     take the shadow. The sub-line moves off `dim` (it encoded nothing; it was
     just the smaller of two). */
  drawText(g, banner.text, Math.max(2, (W - textWidth(banner.text, 2)) >> 1),
           (H >> 1) - 30, UI.ink, 2, 2, UI.shade);
  drawText(g, banner.sub, Math.max(2, (W - textWidth(banner.sub)) >> 1),
           (H >> 1) - 8, UI.ink2, 1, 2, UI.shade);
  g.globalAlpha = 1;
}

/* `fade` scales BOTH the body and the top bevel. Without it the bevel was
   drawn after `globalAlpha` went back to 1, so a panel fading in showed a
   fully opaque 1 px line over nothing -- visible as the callout's only
   pixels at the start of `CALLOUT_FADE_SECS`. Every static caller leaves
   `fade` at 1 and is unaffected. */
function panel(g, x, y, w, h, a = 0.72, fade = 1) {
  g.globalAlpha = a * fade; R(g, x, y, w, h, UI.back);
  g.globalAlpha = fade; R(g, x, y, w, 1, mix(UI.back, UI.dim, 0.6));
  g.globalAlpha = 1;
}

/* Exported so a future tribute panel and the pocket strip cannot drift apart on
   how a pair is named. `labelOf` builds "COPPER INGOT" from two rows; nothing
   hand-writes it. */
export const pairLabel = (sub, form) => labelOf(sub, form);
