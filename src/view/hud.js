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
import { AIR, F, FORM, labelOf } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { SPAWN_BAND } from '../data/world.js';
import { TRINKET } from '../data/trinkets.js';
import { BOON } from '../data/boons.js';
import { aim } from '../model/aim.js';
import { boons } from '../model/boons.js';
import { eff, mods } from '../model/mods.js';
import { player } from '../model/player.js';
import { machineAt } from '../model/machines.js';
import {
  burdenFrac, burdenOf, hasPick, machineIdFor, placementCheck, run
} from '../model/run.js';
import { linkCheck, reachOf } from '../model/segments.js';
import { tileAt } from '../model/tiles.js';
import { bandOf, worldY } from '../model/world.js';
import { banner, toasts } from './fx.js';
import { resolveHover } from './hover.js';
import { stats as paintStats } from './paint.js';
import { drawBar } from './ui/bar.js';
import { drawMainPanel } from './ui/mainPanel.js';
import { drawQuickbar } from './ui/quickbar.js';
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
  burden(g, 6, 14, W);
  depth(g, W, 6);
  /* The timed-boon stack (Phase 4 STEP 5): BELOW the depth gauge just drawn
     (y 6), and its own bottom edge is handed to `debug()` so a debug panel
     (y 22 by default) never draws under it when both are on screen at once. */
  const boonBottom = boonStack(g, f, W, 19);
  reticle(g, f);
  buildGhost(g, f);
  drawQuickbar(g, f);
  /* THE MAIN PANEL DRAWS LAST, ON TOP OF EVERYTHING ELSE THIS FUNCTION
     PAINTS -- it is a window sitting over the permanent HUD, not a member of
     it, and it PAUSES NOTHING: the world above it keeps stepping every frame
     it is open. `view/ui/mainPanel.js` no-ops when `main` is not on the
     panel stack. */
  drawMainPanel(g, f);
  hint(g, W, H);
  if (f.flags.showDebug) debug(g, f, W, boonBottom);
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
   just past whatever it drew, so `drawHUD` can anchor the old inventory
   panel below it instead of a strip that no longer exists. */
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

/* Transient text, drained out of the journal by `shell/notify.js`. */
function hint(g, W, H) {
  const t = toasts[toasts.length - 1];
  if (!t) return;
  const w = Math.min(textWidth(t.text) + 12, W - 4);
  const x = Math.max(2, (W - w) >> 1);
  const y = H - 16;
  panel(g, x, y, w, 12, 0.78);
  drawText(g, t.text, x + 6, y + 3, UI.ink, 1, 1);
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

function deathScreen(g, W, H) {
  g.globalAlpha = 0.78; R(g, 0, 0, W, H, '#0a0206'); g.globalAlpha = 1;
  const ref = bandOf(SPAWN_BAND);
  const datum = ref ? worldY(ref, ref.cfg.floorTy ?? 0) : 0;
  const tile = ref ? ref.tile : 8;
  const lines = [
    ['THE EAGLE COMES', UI.heart, 2],
    [run.deathCause || 'UNKNOWN', UI.ink, 1],
    ['DEPTH REACHED ' + Math.max(0, Math.round((run.deepest - datum) / tile)) + 'M', UI.dim, 1],
    ['PRESS R TO BEGIN THE NEXT TORMENT', UI.dim, 1]
  ];
  let y = (H >> 1) - 26;
  for (const [s, col, sc] of lines) {
    drawText(g, s, Math.max(4, (W - textWidth(s, sc)) >> 1), y, col, sc, 1);
    y += sc === 2 ? 22 : 13;
  }
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
