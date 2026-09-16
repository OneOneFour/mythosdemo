/* LAYER view — THE HUD. Drawn in the same pixel space as the world using the
   5x7 bitmap font. Imports `core`, `data` and READ-ONLY `model` queries.

   NO `fillText` ANYWHERE (invariant 9). Mixing an antialiased system font into
   a nearest-neighbour upscale breaks the look immediately, and it is the first
   thing that creeps back in, so the rule is absolute.

   ============================================================================
   THE ALWAYS-ON HUD SHOWS A BAR, NOT A STRIP. It used to draw every held pair
   by name and count below the hearts (`pockets()`, a text strip driven by
   `run.pocketRows()` -- deleted along with its only caller once this changed).
   That was clutter, not information the player needs at a glance: the same
   `pocketRows()` query backs the full detail in the CHARACTER tab (`i`), which
   is now the ONLY inventory display -- the older text panel this file used to
   also draw (`invPanel`, gated on `flags.showInv`) was retired once the tabbed
   window covered the same information; see `docs/FINDINGS.md` for when and
   why. All that remains always-on is a compact burden bar, drawn with the SAME
   `view/ui/bar.js` primitive and the SAME three-colour rule the Character
   tab's own burden bar already uses (`view/ui/mainPanel.js#drawCharacterTab`)
   -- one fact about "how heavy am I", not a second implementation of it.
   ============================================================================

   Panels clamp on narrow viewports. Below roughly 240 px of base width the
   panels overlap and the depth gauge collides with anything centred; the clamps
   below are what stop that, and they were learned the hard way. Keep them.

   ============================================================================
   HOVER IS RESOLVED, NOT STORED. `view/hover.js#resolveHover` reads the pointer
   off the frame context and the model fresh every call; nothing here caches a
   result on a model record (ARCHITECTURE invariant 9). The one piece of state
   in THIS file, `hoverInfo` below, is `view`'s own scratch space
   for what it drew and found last frame -- the same idiom `view/paint.js`'s
   `stats` and `view/scene.js`'s `stats` already use for "what did the last
   render do", read back only by the test hook and never by another module's
   logic. It costs nothing the epoch check watches, because nothing here calls
   `model/epoch.js#bump`.
   ============================================================================ */

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
import { committedWithin, markedAt, queued } from '../model/digqueue.js';
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

/* THREE INK TONES, AND `dim` IS NOT ONE OF THE BODY ONES (Phase 13a,
   docs/PLAN-phase13.md §2.3/§2.4). `ink` is primary, `ink2` is the secondary
   body tone for de-emphasised text that must still READ, and `dim` now means
   only what it encodes: in this file, exactly one site -- `depth()`'s
   at-or-above-the-datum reading. Everything that used `dim` merely to look
   quieter is on `ink2`.

   `shade` is the text-shadow tone, passed as `drawText`'s 8th argument (and
   through `view/ui/bar.js`'s own `shadow` option) ONLY at the sites in this
   file that draw straight onto rendered world with no panel behind them: the
   burden bar and its lockout line, TRIBUTE's heading/rows/clock, FAVOUR's
   rows, the boon rows, the two build-ghost refusals and the title banner.
   Anything this file draws inside `panel()`/`drawPanel()` -- the tooltip, the
   depth readout, the callout, the debug rows, the death screen and its
   restart button -- gets NO shadow, because the panel is already the
   backing. */
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
  /* BURDEN's warning colour, past the soft cap (D3/D4) -- see below. */
  amber:  '#e0a030',
  debug:  colour('watB'),
  /* THE DIVINE ACCENT: a relic's frame, and the armed
     miracle's ghost (`miracleGhost` below). `ichor` is already the
     divine-gold `data/palette.js` name a trinket's own `look.item` uses (see
     `bellows` in `data/substances.js`), so a trinket's border, a trinket's
     swatch and a miracle's ghost all read as the same material rather than
     the HUD inventing a second and third "this is special" colour -- a
     miracle is a divine one-shot, so it is the same fact, not an exception
     to it. */
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
  /* BURDEN's own bottom edge used to be thrown away here -- a bare statement
     with no assignment -- which is exactly what left no anchor for TRIBUTE
     to hang under (D8). Captured now, the same way `boonStack` below has
     always handed its own bottom to `hudRuler`/`debug`. */
  const burdenBottom = burden(g, 6, 14, W);
  tribute(g, f, 6, burdenBottom, W);
  depth(g, W, 6);
  /* The timed-boon stack: BELOW the depth gauge just drawn
     (y 6). FAVOUR is inserted directly under it, in the SAME
     anchor chain: `favourBottom`, not `boonBottom`, is what now reaches
     `hudRuler` and `debug`, or FAVOUR would draw through whichever of them
     ran next. */
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
  /* THE BAND RULER, RIGHT EDGE, COMPACT (docs/BUILD_PLAN.md Phase 9 section 3).
     One widget, two contexts: `view/overview.js` mounts the same function full
     height with band names and a footer, and this is the other mount. Drawn
     AFTER the quickbar on purpose -- it measures the quickbar's real rect out of
     `view/ui/state.js#drawn` to know where to stop -- and BEFORE the main panel,
     which is a window over the permanent HUD and must cover it. */
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
  /* DEATH OUTRANKS THE WIN, and it is a real ordering rather than a
     defensive one: `shell/main.js#step` stops stepping the moment `run.won`
     is set, so a player cannot die after winning -- but the reverse can
     happen inside a single frame (a miss's second heart loss and cycle 4's
     completion are both `rules/cycles.js#step` decisions), and an end screen
     that showed a victory over a corpse would be the wrong one. */
  if (run.dead) deathScreen(g, W, H);
  else if (run.won) winScreen(g, W, H);
  /* THE DRAFT MODAL JOINS THIS CHAIN rather than being drawn beside it: it is
     a window over everything above -- including `drawMainPanel`, which the
     player may have left open -- and nothing under it may paint on top.
     BELOW the two end screens on purpose, and not for tidiness: a run that is
     over does not reach `applyDraftIntents` (`shell/main.js`'s `run.won`
     guard returns above it), so a modal drawn over the win screen would be a
     card nothing could take and a restart button it covered. ABOVE the title
     banner and the hover tooltip, which are the world talking and must not
     read through a ceremony the game raised. */
  else if (draftOpen(f)) drawDraft(g, f);
  else if (banner.fade > 0) title(g, W, H);
  else tooltip(g, f);
}

/* ---------- five discrete hearts, per docs/SPEC.md section 2 ----------
   No partials and no regeneration, so a bar would be a lie: the player must be
   able to count what a fall will cost. */
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

/* ---------- BURDEN, D3/D4 ----------
   A compact bar below the hearts, reusing `view/ui/bar.js#drawBar` -- the
   SAME primitive and the SAME three-state colour rule the Character tab's
   own burden bar already draws (`view/ui/mainPanel.js#drawCharacterTab`):
   good under the soft cap, amber past it, red at/over the hard cap. Narrow
   by construction (bar plus value text tops out well under 130 px) so it
   never reaches the depth gauge `depth()` draws top-right, even at the
   200 px phone floor `core/canvas.js#resize` enforces. The lockout is still
   spelled out in words below the bar so a refused climb (`rules/player.js`)
   is never a silent wall the player has to reverse-engineer. Returns the y
   just past whatever it drew -- `drawHUD` used to discard this (a bare
   statement, no assignment), which is exactly why nothing anchored under it
   until now: TRIBUTE (below) is what actually reads it. */
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

/* Is a countdown flashing this instant? ONE rule, two readers -- the boon
   stack and the tribute deadline -- so the HUD cannot come to mean two
   different things by "nearly out". Derived from `f.t` (== `clock.t`) and
   the seconds left, never `rand()` and never a frame counter. 3 Hz, which is
   fast enough to catch the eye and slow enough to stay readable. */
function urgentFlash(left, t) {
  return left > 0 && left <= eff('urgentSecs') && ((t * 6) | 0) % 2 === 0;
}

/* ---------- TRIBUTE, Phase 10c / docs/SPEC.md section 18 / D8, D-F ----------
   Left column, anchored at `burden()`'s own returned bottom just above --
   the value that call site used to discard. Reads `run.tribute`
   (`model/run.js`) and the live row out of `data/cycles.js#CYCLE` directly:
   `view` may read `model`, and a cycle's demand shape is read-only content,
   so there is nothing here for a `rules` import to duplicate.
   `tributeMet()`'s own completion predicate stays in `model/run.js` for
   `rules/cycles.js` to share -- this panel only draws the SAME `have`/`need`
   numbers, never re-decides completion.

   NOTHING IS DRAWN WHEN `run.tribute` IS NULL -- every shipped cycle paid,
   or the one frame between a completion and `rules/cycles.js#ensureLiveCycle`
   re-arming the next. NO TIMER LINE WHEN `left === null` -- cycle 1 has no
   clock (docs/SPEC.md section 4) and a panel that drew a zero for it would
   be lying about a deadline that can never expire.

   READ-ONLY: drawn through `drawBar` alone, never `view/ui/panel.js`, so
   nothing here lands in `drawn.panels` and the always-on-UI dispatcher
   (`shell/main.js#applyUiIntents`, `shell/input.js#onAlwaysOnUi`) has
   nothing new to widen for (docs/PLAN-phase10.md 2.9).

   Demand rows are ordered through `data/forms.js#byHudOrder`, the SAME rule
   the pocket strip uses (`pairLabel`'s own header below), so a cycle's bill
   and a player's pockets never disagree on which pair comes first. The bar
   width (50 px) matches `burden`'s own bar immediately above rather than
   being measured from the widest label -- `view/ui/bar.js`'s own fix (step 1
   of this phase) is what keeps a label wider than that from colliding with
   the value text beside it, so the column does not have to be as wide as
   "COPPER PLATE" just to stay legible. */
const TRIBUTE_BAR_W = 50;
/* 4, not 2: a LABELLED bar's value text sits beside its own bar (offset from
   the label's own line), but the AGGREGATE bar below the demand rows has no
   label, so `drawBar` centres its value text 2 px ABOVE the bar itself
   (`view/ui/bar.js`'s `barY - 2`) -- with a 2 px gap that lands the
   aggregate's "N%" flush against the demand row bar's own bottom edge,
   caught by eye once actually drawn rather than by the arithmetic alone. */
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

    /* The aggregate below is clamped PER ROW (`Math.min(have, d.n)`) even
       though the ledger itself is not (`model/run.js#tributeMet`'s own
       comment: over-delivery is accepted, invariant 5's "material that falls
       in is free" applied to a receiver) -- a display fraction that could
       exceed 1 across several over-filled rows would read as "more than
       done", which is not a state this trial has. */
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

    /* THE BATCH CLAUSE IS A DEMAND ROW, AND IT COUNTS TOWARDS THE AGGREGATE.
       `model/run.js#tributeMet` is every demand row AND this clause, so an
       aggregate summed over the demand rows alone read 100% on an unpaid
       cycle 4 while the clock ran out (docs/SPEC.md section 18.10).

       CLAMPED AT `batch.n`, and that is not cosmetic: `batchHave()` saturates
       near that value because `prunedCredits` discards surplus entries, so a
       raw "X delivered" readout would print a number smaller than the player
       handed over. The clamped fraction is exact. */
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

/* THE BATCH ROW'S LABEL, MEASURED AGAINST THE COLUMN IT HAS (D8). It is the
   widest row TRIBUTE draws, because it names a pair AND a window, and at the
   200 px floor the full name ran its value text under the FAVOUR bars.
   FAVOUR's own x cannot be read here -- `favour()` draws after this -- so the
   budget is the left half of the viewport, which is the split the right-hand
   stack has always been anchored to. Over budget it falls back to
   `data/forms.js#shortLabelOf`, the abbreviation the boon stack already uses
   for exactly this, rather than to a runtime truncation. */
function batchLabel(batch, valueText, x, W) {
  const span = ' IN ' + mmss(batch.secs);
  const full = labelOf(S[batch.sub], F[batch.form]) + span;
  const rowW = Math.max(TRIBUTE_BAR_W, textWidth(full)) + 3 + textWidth(valueText);
  return rowW <= (W >> 1) - x ? full : shortLabelOf(S[batch.sub], F[batch.form]) + span;
}

/* HOW CLOSE THE RUN IS TO ENDING ON THE CALENDAR RATHER THAN ON HEARTS.
   Drawn only once a deadline has actually expired, at the foot of the
   TRIBUTE column and in the heart colour, because the second miss tops the
   bar off to zero outright (`rules/cycles.js#miss`). It stays up between
   trials, so the frame `run.tribute` is null does not blink it away.

   ONE LINE OR TWO, measured against the same left-half budget the batch
   row uses and for the same reason: at the 200 px floor the warning on one
   line reaches the FAVOUR bars, and the warning is the half that matters. */
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
  /* A panel may already have drawn its own tooltip this frame
     (`view/ui/tooltip.js`'s `drawn.tooltip` is a SINGLE slot, per that
     file's own header: only one tooltip can be under the cursor at once).
     When it has, this world-hover tooltip must yield rather than overwrite
     it -- both read the same pointer position, and the panel's own grids sit
     visually on top of the world when the menu is open. */
  if (uiDrawn.tooltip) return;
  /* No HUD hitboxes of its own to check first (the one panel that used to
     supply them, `invPanel`, is retired -- see `docs/FINDINGS.md`), so this
     always falls straight through to `resolveHover`'s world-hover path:
     falling item, then machine, then bare tile. */
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

/* One tile reads one metre, measured from the SPAWN band's ground line — so
   depth is a fact about the world and not about which band you happen to be in.

   MEASURED AT THE FEET, `player.y + PH`. `player.y` is the TOP of the 16 px
   body, so measuring it put the reading two tiles above the ground the player
   is standing on and the spawn floor read `+2M` instead of `0M`
   (docs/PLAYTEST.md B4). THE DATUM IS UNCHANGED: `worldY(ref, floorTy)` is the
   same expression `model/run.js#placementCheck` gates `minDepth` on, per
   CLAUDE.md D9, and that one measures a TILE ROW rather than a body, so it has
   no `PH` to add and did not move. */
function depth(g, W, y) {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return;
  const datum = worldY(ref, ref.cfg.floorTy ?? 0);
  const d = Math.round((player.y + PH - datum) / ref.tile);
  const s = (d >= 0 ? d : '+' + -d) + 'M';
  const w = textWidth(s) + 8;
  panel(g, W - w - 6, y - 2, w, 11);
  /* `dim` IS LOAD-BEARING HERE (§2.3 #9): it says the reading is at or above
     the spawn datum, i.e. the '+32M'/'0M' case, where the number is a fact
     about the surface rather than about a descent. Left on the state tone
     deliberately; it is legible because `uiDim` was raised, and because this
     one sits inside `panel()` above. */
  drawText(g, s, W - w - 2, y, d > 0 ? UI.ink : UI.dim, 1, 1);
}

/* ---------- the band ruler's HUD mount ----------
   ANCHORED, NEVER HARDCODED (CLAUDE.md D8, whose own example of the failure is
   the mockup's FAVOUR panel overrunning its frame). Both ends of this ruler are
   measured rather than chosen:

     the TOP     is `boonStack`'s own return value -- the y just past whatever it
                 actually drew -- so the ruler starts under the depth readout and
                 under however many boon rows are live, and moves when they do.
     the BOTTOM  is the quickbar's REAL rect, read back out of
                 `view/ui/state.js#drawn` (it is drawn immediately before this),
                 not a copy of `view/ui/quickbar.js`'s arithmetic. Two panels
                 that must not overlap should share one number, and the one they
                 share is the rectangle one of them actually painted.

   NO NAMES AND NO FOOTER HERE (`labels` defaults false): the depth figure and
   the band name already exist top-right and in the overview's own footer, and
   D8's whole point is that a second copy of a fact is two panels restating one
   thing. What the HUD gains is the SHAPE -- how deep this run goes, and how far
   down it you are.

   Skipped outright when the gap is too short to read: a 20 px bar covering 416
   rows of world is a smear, not a scale. */
const HUD_RULER_MIN_H = 40;

function hudRuler(g, f, W, H, boonBottom) {
  const y = boonBottom + 6;
  const qb = uiDrawn.grids.find(gr => gr.id === 'quickbar');
  const bottom = (qb ? qb.y : H - 12) - 4;
  if (bottom - y < HUD_RULER_MIN_H) return;
  drawRuler(g, { id: 'hud-ruler', x: W - rulerWidth() - 2, y, h: bottom - y, vw: W, vh: H });
}

/* ---------- the timed-boon stack ----------
   Top-right, newest at top -- `boons.active` is append-order (grant order,
   never reordered on refresh, `model/boons.js`'s own header), so walking it
   backwards puts the most recently granted boon on top. Capped at 5 visible
   rows with a '+N' overflow line, because a HUD that grows without bound off
   a draft system that does not exist yet is a bug waiting for content.

   Nothing here is clickable (docs/DESIGN.md: "a boon is not a resource you
   spend; it is weather"). The bar's fill and the last-5-seconds flash derive
   ONLY from `f.t` (== `clock.t`) and the boon's own `left` -- never `rand()`,
   per CLAUDE.md's own record of the furnace flame bug this would otherwise
   repeat. Returns the y just past whatever it drew, so `drawHUD` can keep a
   debug panel clear of it. */
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

/* ---------- FAVOUR, D8, D-F, D1(decision I) ----------
   Right column, inserted into the boon stack's own anchor chain: `drawHUD`
   hands this `boonBottom + 3`, and THIS function's return (`favourBottom`)
   is what now reaches `hudRuler` and `debug` instead of `boonBottom` --
   skip that thread and either one draws straight through this panel.

   One `drawBar` per god in `data/cycles.js#ASKERS` (the closed set this
   table lets ask for anything, derived rather than listed there so a fifth
   cycle by a fourth god needs no edit here either). The display name comes
   from `data/gods.js#godName`, the same reader `view/ui/draft.js` uses, so
   a god named on a card and a god named on a bar cannot drift apart -- and
   a god with no row still reads as the id uppercased rather than blank.

   MASKED WITH THE SAME PREDICATE THE RULER OWNS (`view/ui/ruler.js#masked`,
   the ONE place CLAUDE.md D8 says that predicate may live), not a second
   one: a god is "known" once `run.favour[god] !== undefined`, i.e. dealt
   with at least once this run -- `rules/cycles.js#complete`/`#miss` both
   call `write.favour(cyc.god, ...)` unconditionally (`reward.favour` is
   documented "always present"; `punishment.favour` fires on every miss that
   has a punishment at all), so the FIRST resolution of any cycle a god asks
   for is what takes their mask off, win or lose.

   SCALED AGAINST THE TABLE'S OWN CEILING, not a made-up round number:
   `FAVOUR_MAX` is the sum of every shipped cycle's `reward.favour`, i.e.
   "every trial in this table went your way". A fixed guess would drift the
   moment a fifth cycle's reward changes; deriving it means this bar can
   never imply a ceiling the content does not actually have. Negative
   favour (a missed trial's punishment) clamps the BAR to empty without
   hiding the real number, which is still drawn as `valueText`. */
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

  /* THE BAR IS AS WIDE AS THE WIDEST NAME (or the mask), not a fixed small
     width -- `view/ui/bar.js` draws a bar's own value text beside the BAR at
     a y that sits inside the LABEL's own line above it (fine when the label
     is empty, as `burden`'s own bar's always is). A bar much narrower than
     its label ("HEPHAESTUS" is 59 px, a 30 px bar is not) put the value
     number hard against the label's own tail instead, reading as a floating
     exponent ("HEPHAESTUS<sup>3</sup>") -- caught by looking at the actual
     pixels, not by the arithmetic, which drew nothing overlapping either
     string. Matching the bar's width to the label removes that mismatch.

     THE PANEL'S OWN X still has to clear the WIDEST VALUE actually on
     screen this frame, or the first fix just moves the same collision to
     the viewport's right edge: with the bar already flush to `vw - 6`,
     `drawBar`'s own vw-clamp (step 1 of this phase) pulls a value text
     that has nowhere else to go back OVER the bar it was supposed to clear.
     `rowW` below is measured from what is actually being drawn, not
     guessed, so the reserved margin is exactly as wide as it needs to be
     and no wider. */
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

/* ---------- the dig queue's marks, docs/SPEC.md section 28 ----------
   Three states, and telling them apart is the whole feature:

     WORKED     the tile `rules/mining.js` is committed to. The X inside a
                1 px frame, primary ink. At most one per frame.
     IN REACH   a mark waiting inside `eff('reach')`. The X, primary ink.
     DEFERRED   a mark beyond reach. The X's four tips only, on the STATE
                tone. It resumes when the player walks over, so it is the
                same glyph gone sparse rather than a different one in the
                refusal colour -- `uiDim` already means "inactive, waiting"
                at every other site in this file.

   DENSITY CARRIES THE READ AND ALPHA DOES NOT. 4 px, 12 px and 40 px of
   opaque mark are three states at a glance on lit grass and on unlit rock
   alike; the same ladder drawn at 0.5 / 0.7 / 1.0 alpha lost the deferred
   state entirely over grass, measured at 7x on the spawn shelf.

   AN X, BECAUSE THE OTHER TWO WORLD OVERLAYS ARE NOT ONE. `reticle` below
   draws corner elbows and `drawFootprintGhost` fills the tile; three things
   that can coincide must not share a shape.

   REACH IS READ ONCE AND HANDED TO BOTH TESTS. `committedWithin` takes
   `reach` as a parameter rather than reading `eff` itself
   (`model/digqueue.js`'s own note) precisely so this pass and the rules step
   cannot measure against different numbers. */

/* Centre to centre in world px, squared, the formula `model/digqueue.js#d2`
   measures `nearestWithin` and `committedWithin` with -- inclusive at the
   boundary, as `d > reach * reach` there is. Mirrored rather than shared
   because that module exports no per-mark predicate; both sides read the same
   `eff('reach')`, so the two cannot disagree about the number even though they
   each apply it. */
function markInReach(m, cx, cy, reach) {
  const half = m.band.tile / 2;
  const dx = worldX(m.band, m.tx) + half - cx;
  const dy = worldY(m.band, m.ty) + half - cy;
  return dx * dx + dy * dy <= reach * reach;
}

/* The X, inset a pixel so it reads as a mark on the tile rather than a border
   of it. `tips` draws the four ends alone. A band's tile is 8 px everywhere
   today; under 4 px there is no room for a diagonal and the tile fills. */
function markGlyph(g, x, y, t, col, tips) {
  const n = t - 2;
  if (n < 2) { R(g, x, y, t, t, col); return; }
  if (tips) {
    R(g, x + 1,     y + 1,     1, 1, col); R(g, x + t - 2, y + 1,     1, 1, col);
    R(g, x + 1,     y + t - 2, 1, 1, col); R(g, x + t - 2, y + t - 2, 1, 1, col);
    return;
  }
  for (let i = 0; i < n; i++) {
    R(g, x + 1 + i,     y + 1 + i, 1, 1, col);
    R(g, x + t - 2 - i, y + 1 + i, 1, 1, col);
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
       here: reads never mutate (section 28.2). `markedAt` is the model's own
       staleness predicate, so this pass cannot invent a second answer. */
    if (!markedAt(m.band, m.tx, m.ty)) continue;

    const t = m.band.tile;
    const x = (worldX(m.band, m.tx) - f.cam.x) | 0;
    const y = (worldY(m.band, m.ty) - f.cam.y) | 0;
    if (x <= -t || y <= -t || x >= f.W || y >= f.H) continue;

    const worked = !!target && target.b === m.band && target.tx === m.tx && target.ty === m.ty;
    const near = worked || markInReach(m, c.x, c.y, reach);

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

/* ---------- the build ghost ----------
   Preview the ARMED pair's footprint at the aim reticle -- snapped to the
   grid, tinted by whether `model/run.js#placementCheck` (the SAME query
   `rules/placement.js#placeMachine` calls before ever touching the world)
   says the exact spot placing it now would land is legal, with the ONE-WORD
   reason drawn beside it when it is not. VIEW MAY NOT IMPORT RULES, so this
   reads a MODEL query and nothing else. The footprint is anchored EXACTLY the
   way `shell/main.js#applyIntents` anchors a real placement (bottom row at
   the aimed tile), so the preview can never show a spot the real placement
   would not also choose. See docs/DEVELOPER_GUIDE.md#one-decision-two-readers */
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

/* THE ONE PLACE A GHOST PUTS A WORD BESIDE ITSELF. Extracted
   when the feed preview below became a second caller: "the reason, in the
   ghost's own colour, one line above the top-left of what it is talking
   about, with a shadow so it survives being drawn over lit rock" is a single
   presentation decision and there is no version of this project where two
   ghosts should disagree about it.

   `below` (`feedPrompt`'s own third callsite) puts the line
   one row UNDER `y` instead -- `feedGhost`'s machine-anchored label and
   `feedPrompt`'s player-anchored one both fire in the same frame, and
   `handFeed.reach` is small enough (a tile or two) that the two subjects sit
   almost on top of each other on screen; stacking both labels above would
   print one over the other.

   CLAMPED TO THE VIEWPORT, per D8 and for the reason `cableGhost` below
   already states: a refusal drawn off an edge at a narrow base buffer is a
   refusal nobody reads. Inert for a ghost near the camera centre, which is
   where both callers' subjects almost always are -- the clamp is here for
   the machine at the screen edge, not for the common case. */
function ghostLabel(g, f, x, y, text, col, below = false) {
  const w = textWidth(text);
  const ly = below ? y + 2 : y - 8;
  drawText(g, text, Math.max(2, Math.min(x, f.W - w - 2)),
           Math.max(2, Math.min(ly, f.H - 10)), col, 1, 1, UI.shade);
}

/* ---------- the feed preview ----------
   THE FOURTH BRANCH OF `buildGhost` (docs/PLAN-phase16-interaction-model-v2.md
   §5 D16-E #3). With something armed and a machine under the reticle, LMB
   FEEDS rather than places (`shell/input.js`'s rule 2, above rule 3), so this
   is what the next press would actually do -- and before this the only
   feedback for it was four particles and a click AFTER the fact
   (`shell/notify.js`'s `'accept'` chips; there is still no `TEXT` row).

   ONE DECISION, TWO READERS, exactly as the footprint and cable ghosts
   already are: `model/machines.js#feedCheck` is the query
   `rules/machines.js#handOne` ENFORCES and this previews. `view` may not
   import `rules`, and `feedCheck` lives in `model`
   specifically so this preview would be legal rather than a second copy of
   the accept rule.

   AN OUTLINE, NOT A FILL, and the argument is `cableGhost`'s own about its
   corner brackets: a machine has art, a status badge and a buffer bar of its
   own, and a 35%-alpha slab over all three trades the information the player
   came for against the information they already have from the reticle.

   REACH IS NOT CHECKED HERE, DELIBERATELY, and `feedCheck`'s own header is
   the argument: reach is a fact about where the player's body is at the
   instant of a press, `model/machines.js#feedTarget` asks it exactly once,
   there, and a query that folded it in would be unusable for a ghost -- whose
   whole job is to answer for a machine the player has not walked to. So this
   states a property of the MACHINE AND THE PAIR ("it wants this, and it is 3
   of 8 full"), never a promise about this particular press. Walking closer
   never changes what it says.

   `have`/`cap` ARE THE MATCHED SELECTOR'S, not the machine's total, because
   the cap is per clause -- the furnace's 8-ore/2-fuel asymmetry is only
   expressible that way, and `feedCheck` returns them already resolved for
   whichever clause this pair landed in. Both are 0 on an 'IT DOES NOT WANT
   THAT' refusal (no clause was found to measure), which is why the refusal
   branch prints the reason instead of the numbers. */
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

/* THE FEED PROMPT: a reminder, at the PLAYER rather than the machine, that
   LMB is live right now. `feedGhost` above already answers "would this
   machine take it" from anywhere the reticle reaches, deliberately without
   checking reach (its header explains why); this answers the complementary
   question -- "is a press physically live this instant" -- which needs
   `model/machines.js#feedTarget`'s reach check, the same one `shell/input.js`
   asks before setting `cmd.feed`. Feeding is LMB, not a bound key (there is
   no keyboard key to name), so the label spells the button the way
   `view/ui/quickbar.js`'s legend already does ("LMB ACT").

   BELOW THE PLAYER'S FEET, not above their head -- `feedGhost`'s own label
   already occupies the row above the MACHINE, and at `handFeed.reach`'s
   small distance the player and the machine are close enough on screen that
   "one row above" would be the same row for both. */
function feedPrompt(g, f) {
  const x = (player.x - f.cam.x) | 0, y = (player.y + PH - f.cam.y) | 0;
  ghostLabel(g, f, x, y, 'LMB FEED', UI.good, true);
}

/* THE COLLECT PROMPT: the pickup-verb analogue of `feedPrompt` above, and the
   reason it exists is the same tutorial line `rules/tutorial.js`'s beat 2
   comment already spells out -- pickup has been opt-in since Phase 12b
   (docs/PLAN-phase12.md §3 D-E/D-F), so standing over the stock pickaxe (or
   any resting item) collects nothing on its own, and nothing else in the HUD
   said a press was live.

   `items`/`eff('pickupR')` mirror `rules/items.js#step`'s own `near()` gate
   exactly (distance from the player's centre, not the reticle -- collect has
   no aim), but that check is `rules` and `view` may not import it, so the
   handful of lines are repeated here rather than exported for one caller on
   each side of the wall.

   SILENT WHILE AUTO COLLECT IS ON: the reminder is for a press that has to
   happen, and with autocollect on, one never does.

   ABOVE THE PLAYER'S HEAD, not below -- the opposite of `feedPrompt`, so
   neither row is a lie if some future scene ever makes both prompts true in
   the same frame (an item resting beside a machine being fed). */
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

/* ---------- the miracle ghost ----------
   THE FIFTH BRANCH, and the one that closes a real hole rather than adding
   polish (docs/PLAN-phase16-interaction-model-v2.md §3.6 #2): an armed
   `phial` is `shell/input.js`'s RULE 1 -- it outranks feeding, placing and
   mining, so it silently converts LMB from "dig" to "spend a one-shot" -- and
   it was the ONE arming state that drew nothing at all. A mode that overrides
   every other verb and shows no pixel for it is the worst combination
   available.

   DRAWN IN `UI.relic`, THE DIVINE GOLD, and not in `UI.good`/`UI.heart`. The
   other two ghosts use green/red to mean "this placement is legal / is not",
   and a miracle has no legality to report: rule 1 fires wherever the reticle
   is valid. A third colour is the honest way to say "this is not that
   question", and gold is the colour a divine object already carries
   everywhere else in this HUD (see `UI.relic` above).

   A TILE FILL PLUS FOUR SPOKES. The fill is the same 35%-alpha single-tile
   idiom `drawFootprintGhost` uses for a tile-capable form, so the "here"
   reads identically to every other ghost; the spokes are what make it not
   look like a placement at a glance. Static geometry derived from `aim`
   alone -- no `clock.t` pulse and emphatically no `rand()` (invariant 7): a
   ghost that animated would make this file's own screenshots depend on when
   they were taken. */
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

/* ---------- the cable ghost ----------
   THE THIRD BRANCH OF `buildGhost`, and the same "one decision, two readers"
   arrangement the footprint ghost above already is: with a hub armed by the
   first `l` press (`shell/ui.js#ui.linkFrom`, handed over on the frame
   context because `view` may not import `shell`), this draws the cable the
   second press would create, tinted by `model/segments.js#linkCheck` -- THE
   SAME query `rules/placement.js#linkSegment` calls before it mutates
   anything. `view` may not import `rules`; `linkCheck` is a model query and
   reading it is what stops the ghost and the verb from ever disagreeing.

   FOUR THINGS ARE DRAWN, and each answers a different question:
     the armed end       WHICH hub is the gesture anchored to
     the cable           WHERE would it run, and is it legal (good/red)
     the reach limit     HOW FAR can this hub reach, when the answer is "not
                         that far" -- the cable is clipped there rather than
                         drawn to a point it could never reach
     the blocked sample  WHICH tile is in the way, from `linkCheck`'s own
                         `at` field, because "THE PATH IS BLOCKED" without a
                         position is a puzzle rather than an answer

   AIMING AT NOTHING IS A THIRD STATE, not a refusal. With no machine under
   the reticle there is no pair to check, so the cable is drawn DIM and no
   `why` is printed: this file states only refusals `linkCheck` actually
   returned, and inventing 'TOO FAR APART' for a bare point would be a second
   implementation of the rule. The reach clip still shows, because reach is a
   fact about the armed hub alone. */
function cableGhost(g, f) {
  const from = f.ui.linkFrom;
  /* THE FOOTPRINT CENTRE, which must stay the same point
     `model/segments.js#anchorOf` picks -- a ghost anchored anywhere else would
     preview a cable at an offset from the one the link actually creates. It is
     re-derived here rather than imported because it is two additions on a box
     `view` already holds, and `anchorOf` is private to the model's own
     geometry. */
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

  /* CLAMPED TO THE VIEWPORT, per D8: a refusal drawn off the right edge at a
     narrow base buffer is a refusal nobody reads, and the same clamp the
     tooltip and the panels already apply is the one to reuse rather than a
     hardcoded origin. */
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

  /* Preview the ARMED pair, if any, at the aim reticle -- the same
     footprint-tint idiom above, generalised to a
     single-tile footprint for a tile-capable form. `view` may not import
     `rules`, so a tile's own placement rule (`rules/placement.js#placeTile`'s
     "needs something to hang from") is not re-proven here; the one fact this
     CAN check without that import is whether the tile itself is currently
     clear, which is enough to warn against the common case (aiming at solid
     rock) without a second implementation of that rule. */
  const armed = f.ui.armedPlace;
  if (!armed) return;

  /* THE BRANCH ORDER BELOW IS `shell/input.js`'s LMB DISPATCH ORDER, and it
     has to be: a ghost that previewed a lower-priority rule than the one the
     press will actually fire is worse than no ghost, because it is confidently
     wrong. That file's rules, in its own numbering (docs/SPEC.md §23.2):
       1  an armed miracle always wins            -> `miracleGhost`
       2  a machine under the reticle, in reach   -> `feedGhost`
       3  open ground, something armed            -> the footprint ghosts
       4  otherwise mine                          -> no ghost
     `view` may not import `shell`, so this is a mirrored order rather than a
     shared one; it is the reason both lists are written out in full, each
     naming the other. */
  if (armed.form === F.phial) { miracleGhost(g, f); return; }

  /* `def.handFeed` IS PART OF THE TEST, not an afterthought -- the same first
     half of `model/machines.js#feedTarget`'s own two questions. A gear, an
     axle or a hub is a machine with no hand-feed clause at all, so rule 2
     cannot fire on it and the press falls through to rule 3; previewing a
     feed there would preview a rule that does not exist for that machine.
     `feedGhost` deliberately answers without the SECOND half of
     `feedTarget` -- reach -- for the reason it and `feedCheck` both state;
     `feedTarget(armed)` is called again just below, reach and all, purely to
     decide whether `feedPrompt` (the player-side reminder) is warranted. */
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

/* ---------- the bottom line ----------
   A transient toast (`view/fx.js#frontToast`, drained out of the journal by
   `shell/notify.js`) always wins -- it is a fact that just happened and it
   is more urgent than standing guidance. The FRONT of that queue and not the
   back: two facts can arrive in one frame and they are shown in the order they
   happened, which is the whole of `view/fx.js`'s toast queue. With none showing, the callout
   falls back to whichever SPEC section 5 beat the player has not finished
   yet (`model/tutorial.js#beat`, a read-only query, and
   `data/callouts.js#CALLOUTS`, indexed by it). Two indices are `null` and
   simply show nothing: 4 (beat 5 fires a frame later with no action in
   between) and 10 (cycle 2 paid -- the sheet is genuinely over there, see
   that file's own header).

   The two draw either side of the main panel; `drawHUD`'s own call site
   says why. */
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
  /* Queued, not overlapping: only one line is ever drawn, so a beat change
     cannot show two instructions at once. The fade is purely cosmetic --
     derived from `f.t` (== `clock.t`) plus the beat it last changed at,
     never a frame counter or `rand()` (CLAUDE.md invariant 7). */
  if (b !== calloutFade.beat) { calloutFade.beat = b; calloutFade.since = f.t; }
  bottomLine(g, f, W, H, text,
             Math.min(1, Math.max(0, (f.t - calloutFade.since) / CALLOUT_FADE_SECS)));
}

/* WRAPPED, BECAUSE THE PANEL CLAMPS AND `drawText` DOES NOT CLIP. The width
   below is capped at `W - 4`, but text drawn at `x + 6` runs as far as it
   likes, so a row wider than the viewport used to spill off the right edge.
   At the 200 px base buffer that was 8 of the 9 rows in `data/callouts.js`,
   which is how 'CLICK YOUR ORE, THEN THE ALTAR -- 10 COPPER' reached a
   player as '... THEN THE ALTAR -' with the quantity gone.

   `LINE_PITCH * n + 4` is 12 for one line, which is the single-row height
   this panel has always had, so nothing moves at the desktop buffer where
   every row already fits. */
const LINE_PITCH = 8;
const CALLOUT_PAD = 12;

/* Exported so `tools/check.mjs` section 8n can assert every
   `data/callouts.js` row fits at `core/canvas.js#BASE_W_MIN` using the same
   budget the renderer uses, rather than a second copy of these two numbers. */
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

/* HOW FAR DOWN THE CALLOUT MAY REACH (D8). It is centred and the quickbar is
   pinned right, so the two only meet when the text is wide enough to run
   under the strip -- which is what happens at the 200 px floor and not at
   the desktop buffer. Both neighbours' rectangles are read back out of
   `view/ui/state.js#drawn` (`drawQuickbar` runs earlier in `drawHUD`), never
   re-derived, and the callout lifts only where it actually overlaps one in
   x. A scene with room sits at `H - 4`; the widget grew downward from the
   old `H - 16` centre line when it stopped being a bare line of text, so
   every callout moved once and none moves again for want of clearance.

   The reserve above the quickbar's own rect is `view/ui/quickbar.js`'s
   `HAND_GAP` of 10 px plus 2 px of air: the IN HAND line lives in that gap
   and is not part of the grid's rectangle. Held whether or not a pair is
   armed, so the callout does not hop when one is. */
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

/* THE RESTART BUTTON, docs/PLAN-phase12.md §3 D-C: restart moved off `r`
   (now the crank/action hold, D-J) onto a real, discoverable control, since
   the key it lived on stopped meaning "restart" and a printed instruction
   naming a key that no longer does the thing is worse than no instruction at
   all. Sized from its own measured label (D8's "positioned by an anchored
   layout pass over measured text, never by hardcoded pixel origins"), and
   registered into `drawn.panels` under `'death-restart'` -- the identical
   idiom `view/ui/quickbar.js`'s hints-toggle already uses -- so
   `shell/input.js#onDeathRestart`'s hit-test finds what was actually drawn,
   never a second copy of this layout math. */
const RESTART_LABEL = 'BEGIN THE NEXT TORMENT';

/* THERE ARE TWO END-OF-RUN SCREENS AND ONE IMPLEMENTATION OF ONE.
   `deathScreen` and `winScreen` below differ only in their wash, their lines
   and the id their button records -- everything about the layout, the
   measured button and the `drawn.panels` registration is HERE, once, because
   a second copy of it is a second thing `shell/input.js`'s hit-test would
   have to be taught about separately. `id` is what makes the two hit-testable
   apart at all; the geometry it records is identical in shape either way. */
function endScreen(g, W, H, { wash, lines, id }) {
  g.globalAlpha = 0.78; R(g, 0, 0, W, H, wash); g.globalAlpha = 1;
  let y = (H >> 1) - 26;
  for (const [s, col, want] of lines) {
    /* A DOUBLE-SIZE HEADLINE DROPS TO SINGLE RATHER THAN OVERFLOWING, per D8
       ("positioned by an anchored layout pass over measured text") and its own
       warning that the mockup's overflow is a bug to fix and not a target to
       copy. `THE EAGLE COMES` is 164 px at scale 2 and fits the 200 px phone
       floor (`core/canvas.js#resize`); `THE GODS ARE ANSWERED` is 252 px and
       does not, and it clipped mid-word until this clause existed. Measured,
       so no line has to be kept short by hand. */
    const sc = want > 1 && textWidth(s, want) > W - 8 ? want - 1 : want;
    drawText(g, s, Math.max(4, (W - textWidth(s, sc)) >> 1), y, col, sc, 1);
    y += sc === 2 ? 22 : 13;
  }

  const bw = textWidth(RESTART_LABEL) + 8, bh = 11;
  const btn = drawPanel(g, { id, x: (W - bw) >> 1, y, w: bw, h: bh, vw: W, vh: H, alpha: 0.9 });
  drawText(g, RESTART_LABEL, btn.x + 4, btn.y + 2, UI.good, 1, 1);
}

/* Depth reached, in the SAME datum `depth()` above draws off and
   `model/run.js#placementCheck` gates on (CLAUDE.md D9) -- never a second
   arithmetic. `run.deepest` is the deepest `player.y`, the top of the body, so
   it takes `depth()`'s own `+ PH` for the same reason: two readings of the
   player's depth that differed by two tiles would be worse than either.
   Shared by both end screens. */
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

/* THE WIN SCREEN, docs/SPEC.md section 20.2. `run.won` is set once by
   `rules/cycles.js#ensureLiveCycle` the frame `run.cycle` passes the last
   shipped row, so this draws for the rest of the process's life and the run
   is over -- `shell/main.js#step` stops stepping, exactly as `run.dead`
   already stops most of it.

   NOT A SECOND UI MECHANISM: it is `endScreen` above with a different wash,
   different lines and the id `'win-restart'`, and `shell/input.js` hit-tests
   it through the same `drawn.panels` lookup the death button uses. Its two
   totals come from `tallyLines` above, which the death screen also draws. */
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
