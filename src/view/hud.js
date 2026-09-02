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

import { drawText, textWidth } from '../core/font.js';
import { R, lineTo } from '../core/pixels.js';
import { mix } from '../core/palette.js';
import { AIR, byHudOrder, F, FORM, labelOf } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { SPAWN_BAND } from '../data/world.js';
import { TRINKET } from '../data/trinkets.js';
import { BOON } from '../data/boons.js';
import { ASKERS, CYCLES } from '../data/cycles.js';
import { S } from '../data/substances.js';
import { aim } from '../model/aim.js';
import { boons } from '../model/boons.js';
import { eff, mods } from '../model/mods.js';
import { player } from '../model/player.js';
import { machineAt } from '../model/machines.js';
import {
  burdenFrac, burdenOf, cycleRow, hasPick, machineIdFor, placementCheck, run,
  tributeHave
} from '../model/run.js';
import { linkCheck, reachOf } from '../model/segments.js';
import { beat } from '../model/tutorial.js';
import { tileAt } from '../model/tiles.js';
import { bandOf, worldY } from '../model/world.js';
import { CALLOUTS } from '../data/callouts.js';
import { banner, toasts } from './fx.js';
import { resolveHover } from './hover.js';
import { stats as paintStats } from './paint.js';
import { drawBar } from './ui/bar.js';
import { drawMainPanel } from './ui/mainPanel.js';
import { drawPanel } from './ui/panel.js';
import { drawQuickbar } from './ui/quickbar.js';
import { drawRuler, masked, roman, rulerWidth } from './ui/ruler.js';
import { drawn as uiDrawn, resetDrawn as resetUiDrawn } from './ui/state.js';

const UI = {
  ink:    colour('ui'),
  dim:    colour('uiDim'),
  back:   colour('uiBack'),
  heart:  '#d8433a',
  hollow: '#2c2028',
  hi:     '#ff8a7a',
  good:   '#9ad86a',
  /* BURDEN's warning colour, past the soft cap (D3/D4) -- see below. */
  amber:  '#e0a030',
  debug:  colour('watB'),
  /* The pocket strip's one accent colour: a relic's frame, and nothing else.
     `ichor` is already the divine-gold `data/palette.js` name a trinket's own
     `look.item` uses (see `bellows` in `data/substances.js`), so a trinket's
     border and a trinket's swatch read as the same material rather than the
     HUD inventing a second "this is special" colour. */
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
  tribute(g, 6, burdenBottom, W);
  depth(g, W, 6);
  /* The timed-boon stack (Phase 4 STEP 5): BELOW the depth gauge just drawn
     (y 6). FAVOUR (Phase 10c) is inserted directly under it, in the SAME
     anchor chain: `favourBottom`, not `boonBottom`, is what now reaches
     `hudRuler` and `debug`, or FAVOUR would draw through whichever of them
     ran next. */
  const boonBottom = boonStack(g, f, W, 19);
  const favourBottom = favour(g, W, boonBottom + 3);
  reticle(g, f);
  buildGhost(g, f);
  drawQuickbar(g, f);
  /* THE BAND RULER, RIGHT EDGE, COMPACT (docs/BUILD_PLAN.md Phase 9 section 3).
     One widget, two contexts: `view/overview.js` mounts the same function full
     height with band names and a footer, and this is the other mount. Drawn
     AFTER the quickbar on purpose -- it measures the quickbar's real rect out of
     `view/ui/state.js#drawn` to know where to stop -- and BEFORE the main panel,
     which is a window over the permanent HUD and must cover it. */
  hudRuler(g, f, W, H, favourBottom);
  /* THE MAIN PANEL DRAWS LAST, ON TOP OF EVERYTHING ELSE THIS FUNCTION
     PAINTS -- it is a window sitting over the permanent HUD, not a member of
     it, and it PAUSES NOTHING: the world above it keeps stepping every frame
     it is open. `view/ui/mainPanel.js` no-ops when `main` is not on the
     panel stack. */
  drawMainPanel(g, f);
  hint(g, f, W, H);
  if (f.flags.showDebug) debug(g, f, W, favourBottom);
  if (run.dead) deathScreen(g, W, H);
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
   until now: TRIBUTE (Phase 10c, below) is what actually reads it. */
function burden(g, x, y, W) {
  const cap = eff('burden'), soft = eff('burdenSoft'), frac = burdenFrac();
  const locked = frac >= 1;
  const col = locked ? UI.heart : frac >= soft ? UI.amber : UI.good;

  const bar = drawBar(g, {
    id: 'hud-burden', x, y, w: 50, h: 3, frac, fillColour: col, vw: W,
    valueText: `${burdenOf().toFixed(1)} / ${cap.toFixed(0)} T`
  });

  let by = bar.y + bar.h;
  if (locked) {
    drawText(g, 'TOO HEAVY TO CLIMB', x, by + 2, UI.heart, 1, 1);
    by += 9;
  }
  return by + 2;
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

function tribute(g, x, y, W) {
  if (!run.tribute) return y;
  const cyc = cycleRow();
  if (!cyc) return y;

  drawText(g, 'TRIBUTE ' + roman(run.cycle - 1), x, y, UI.ink, 1, 1);
  let ry = y + 8;

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
      label: labelOf(d.so, d.fo), valueText: `${h} / ${d.n}`
    });
    ry = bar.y + bar.h + TRIBUTE_ROW_GAP;
  }

  const aggFrac = need > 0 ? have / need : 0;
  const agg = drawBar(g, {
    id: 'tribute-progress', x, y: ry, w: TRIBUTE_BAR_W, h: 3, frac: aggFrac, vw: W,
    valueText: Math.round(aggFrac * 100) + '%'
  });
  ry = agg.y + agg.h + TRIBUTE_ROW_GAP;

  if (run.tribute.left !== null) {
    const secs = Math.max(0, Math.ceil(run.tribute.left));
    drawText(g, ((secs / 60) | 0) + ':' + String(secs % 60).padStart(2, '0'), x, ry, UI.dim, 1, 1);
    ry += 9;
  }

  return ry + 2;
}

/* The tooltip itself. `resolveHover` does the actual hit-testing and content
   lookup, entirely from the pointer and the model; this just lays out
   whatever it returns and remembers it in `hoverInfo` for the test hook. */
function tooltip(g, f) {
  /* The Phase 5b panel may already have drawn its own tooltip this frame
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
  lines.forEach((l, i) => drawText(g, l, bx + 4, by + 3 + i * 8, i === 0 ? UI.ink : UI.dim, 1, 1));
}

/* One tile reads as one metre, measured from the SPAWN band's ground line — so
   depth is a fact about the world and not about which band you happen to be in. */
function depth(g, W, y) {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return;
  const datum = worldY(ref, ref.cfg.floorTy ?? 0);
  const d = Math.round((player.y - datum) / ref.tile);
  const s = (d >= 0 ? d : '+' + -d) + 'M';
  const w = textWidth(s) + 8;
  panel(g, W - w - 6, y - 2, w, 11);
  drawText(g, s, W - w - 2, y, d > 0 ? UI.ink : UI.dim, 1, 1);
}

/* ---------- the band ruler's HUD mount (Phase 9 section 3) ----------
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

/* ---------- the timed-boon stack, Phase 4 STEP 5 ----------
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
    const flashing = a.left > 0 && a.left <= 5;
    const flash = flashing && ((f.t * 6) | 0) % 2 === 0;

    /* POLISH: the SHORT name here -- the boon timer stack is the exact
       fixed-width, right-anchored row named as clipping-prone ("FORGE OF
       HEPHAESTUS"). Falls back to the full name for a boon with no `short`
       given yet, same as `shortLabelOf` does for a substance/form pair. */
    const label = b.short || b.name;
    const secs = Math.max(0, Math.ceil(a.left));
    const timeStr = ((secs / 60) | 0) + ':' + String(secs % 60).padStart(2, '0');
    const barW = 24;
    const w = 6 + textWidth(label) + 4 + barW + 4 + textWidth(timeStr) + 4;
    const x = Math.max(2, W - w - 6);

    R(g, x, y, 4, 4, UI.relic);                              // a god's gift, same accent a trinket's border uses
    drawText(g, label, x + 6, y - 1, flash ? UI.heart : UI.ink, 1, 1);
    const barX = x + 6 + textWidth(label) + 4;
    R(g, barX, y, barW, 3, UI.hollow);
    R(g, barX, y, Math.round(barW * frac), 3, flash ? UI.heart : UI.good);
    drawText(g, timeStr, barX + barW + 4, y - 1, UI.dim, 1, 1);

    y += BOON_ROW_H;
  }

  if (overflow > 0) {
    const s = '+' + overflow;
    drawText(g, s, Math.max(2, W - textWidth(s) - 6), y - 1, UI.dim, 1, 1);
    y += BOON_ROW_H;
  }

  return y;
}

/* ---------- FAVOUR, Phase 10c / D8, D-F, D1(decision I) ----------
   Right column, inserted into the boon stack's own anchor chain: `drawHUD`
   hands this `boonBottom + 3`, and THIS function's return (`favourBottom`)
   is what now reaches `hudRuler` and `debug` instead of `boonBottom` --
   skip that thread and either one draws straight through this panel.

   One `drawBar` per god in `data/cycles.js#ASKERS` (the closed set this
   table lets ask for anything, derived rather than listed there so a fifth
   cycle by a fourth god needs no edit here either). No display-name table
   existed anywhere before this -- `data/boons.js`/`data/trinkets.js` key a
   god by id and never had to print one in English -- so `GOD_NAME` below is
   presentation, not content, and lives in this file for that reason.

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
const GOD_NAME = { hephaestus: 'HEPHAESTUS', athena: 'ATHENA', poseidon: 'POSEIDON' };
const FAVOUR_MAX = CYCLES.reduce((s, c) => s + (c.reward.favour || 0), 0);
const FAVOUR_ROW_GAP = 2;

function favour(g, W, startY) {
  if (!ASKERS.length) return startY;

  const rows = ASKERS.map(god => {
    const known = run.favour[god] !== undefined;
    const n = run.favour[god] ?? 0;
    return {
      god, known,
      label: masked(GOD_NAME[god] || god.toUpperCase(), known),
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
      frac: r.frac, label: r.label, valueText: r.valueText
    });
    y = bar.y + bar.h + FAVOUR_ROW_GAP;
  }
  return y;
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
    drawText(g, why, x, y - 8, UI.heart, 1, 1);
  }
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
             Math.max(2, Math.min(y1 - 4, f.H - 10)), UI.heart, 1, 1);
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

/* A transient toast (`toasts`, drained out of the journal by
   `shell/notify.js`) always wins -- it is a fact that just happened and it
   is more urgent than standing guidance. With none showing, this falls back
   to whichever SPEC §5 beat the player has not finished yet
   (`model/tutorial.js#beat`, Phase 8a's read-only query, and
   `data/callouts.js#CALLOUTS`, indexed by it). Beats 5-6 are `null` rows
   (Phase 10's altar/furnace gift, not fired yet) and simply show nothing. */
const CALLOUT_FADE_SECS = 0.4;
const calloutFade = { beat: -1, since: 0 };

function hint(g, f, W, H) {
  const last = toasts[toasts.length - 1];
  let text, fadeAlpha = 1;
  if (last) {
    text = last.text;
  } else {
    const b = beat(run);
    text = CALLOUTS[b];
    if (!text) return;
    /* Queued, not overlapping: only one line is ever drawn, so a beat change
       cannot show two instructions at once. The fade is purely cosmetic --
       derived from `f.t` (== `clock.t`) plus the beat it last changed at,
       never a frame counter or `rand()` (CLAUDE.md invariant 7). */
    if (b !== calloutFade.beat) { calloutFade.beat = b; calloutFade.since = f.t; }
    fadeAlpha = Math.min(1, Math.max(0, (f.t - calloutFade.since) / CALLOUT_FADE_SECS));
  }
  const w = Math.min(textWidth(text) + 12, W - 4);
  const x = Math.max(2, (W - w) >> 1);
  const y = H - 16;
  panel(g, x, y, w, 12, 0.78 * fadeAlpha);
  g.globalAlpha = fadeAlpha;
  drawText(g, text, x + 6, y + 3, UI.ink, 1, 1);
  g.globalAlpha = 1;
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

function deathScreen(g, W, H) {
  g.globalAlpha = 0.78; R(g, 0, 0, W, H, '#0a0206'); g.globalAlpha = 1;
  const ref = bandOf(SPAWN_BAND);
  const datum = ref ? worldY(ref, ref.cfg.floorTy ?? 0) : 0;
  const tile = ref ? ref.tile : 8;
  const lines = [
    ['THE EAGLE COMES', UI.heart, 2],
    [run.deathCause || 'UNKNOWN', UI.ink, 1],
    ['DEPTH REACHED ' + Math.max(0, Math.round((run.deepest - datum) / tile)) + 'M', UI.dim, 1]
  ];
  let y = (H >> 1) - 26;
  for (const [s, col, sc] of lines) {
    drawText(g, s, Math.max(4, (W - textWidth(s, sc)) >> 1), y, col, sc, 1);
    y += sc === 2 ? 22 : 13;
  }

  const bw = textWidth(RESTART_LABEL) + 8, bh = 11;
  const btn = drawPanel(g, {
    id: 'death-restart', x: (W - bw) >> 1, y, w: bw, h: bh, vw: W, vh: H, alpha: 0.9
  });
  drawText(g, RESTART_LABEL, btn.x + 4, btn.y + 2, UI.good, 1, 1);
}

function title(g, W, H) {
  g.globalAlpha = Math.min(1, banner.fade);
  drawText(g, banner.text, Math.max(2, (W - textWidth(banner.text, 2)) >> 1),
           (H >> 1) - 30, UI.ink, 2, 2);
  drawText(g, banner.sub, Math.max(2, (W - textWidth(banner.sub)) >> 1),
           (H >> 1) - 8, UI.dim, 1, 2);
  g.globalAlpha = 1;
}

function panel(g, x, y, w, h, a = 0.72) {
  g.globalAlpha = a; R(g, x, y, w, h, UI.back); g.globalAlpha = 1;
  R(g, x, y, w, 1, mix(UI.back, UI.dim, 0.6));
}

/* Exported so a future tribute panel and the pocket strip cannot drift apart on
   how a pair is named. `labelOf` builds "COPPER INGOT" from two rows; nothing
   hand-writes it. */
export const pairLabel = (sub, form) => labelOf(sub, form);
