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
   `pocketRows()` query still backs the full detail in the CHARACTER tab (`i`)
   and the old text inventory panel (`invPanel` below, `flags.showInv`'s
   existing gate). All that remains always-on is a compact burden bar, drawn
   with the SAME `view/ui/bar.js` primitive and the SAME three-colour rule the
   Character tab's own burden bar already uses (`view/ui/mainPanel.js#
   drawCharacterTab`) -- one fact about "how heavy am I", not a second
   implementation of it.
   ============================================================================

   Panels clamp on narrow viewports. Below roughly 240 px of base width the
   panels overlap and the depth gauge collides with anything centred; the clamps
   below are what stop that, and they were learned the hard way. Keep them.

   ============================================================================
   HOVER IS RESOLVED, NOT STORED. `view/hover.js#resolveHover` reads the pointer
   off the frame context and the model fresh every call; nothing here caches a
   result on a model record (ARCHITECTURE invariant 9). The one piece of state
   in THIS file, `pocketHits`/`hoverInfo` below, is `view`'s own scratch space
   for what it drew and found last frame -- the same idiom `view/paint.js`'s
   `stats` and `view/scene.js`'s `stats` already use for "what did the last
   render do", read back only by the test hook and never by another module's
   logic. It costs nothing the epoch check watches, because nothing here calls
   `model/epoch.js#bump`.
   ============================================================================ */

import { drawText, textWidth } from '../core/font.js';
import { R } from '../core/pixels.js';
import { mix } from '../core/palette.js';
import { AIR, F, FORM, labelOf, shortLabelOf } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { HAND_RECIPES } from '../data/recipes.js';
import { SPAWN_BAND } from '../data/world.js';
import { TRINKET } from '../data/trinkets.js';
import { BOON } from '../data/boons.js';
import { aim } from '../model/aim.js';
import { boons } from '../model/boons.js';
import { massOfPair, parseKey } from '../model/items.js';
import { eff, mods } from '../model/mods.js';
import { player } from '../model/player.js';
import {
  buildableMachines, burdenFrac, burdenOf, canCraft, hasPick, machineIdFor, placementCheck, pocketRows, run
} from '../model/run.js';
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

/* `view/hover.js#resolveHover` hit-tests against exactly these rectangles, so
   the old inventory panel and its tooltips cannot silently disagree about
   where an entry sits. Used to also carry the always-on strip's own
   rectangles (removed above); kept because `invPanel` below still needs a
   hover target and `tests/visual.spec.js`'s hover test still reads this
   array through `__mf.hits`. Rebuilt from scratch every `drawHUD` call --
   read, never relied on for anything but the next line's hover test and the
   test hook. */
export const pocketHits = [];

/* The BUILD list's own rectangles, in the SAME screen space `pocketHits`
   uses -- kept SEPARATE from that array rather than merged into it, because
   `view/hover.js#resolveHover` treats every entry of `hudHits` as a
   `{sub, form}` pair to describe, and a build row names a MACHINE, not a
   substance x form. Read by `buildGhost` below, in this same file, so
   nothing outside `view` ever needs to know this exists. */
const buildHits = [];

/* What a tooltip is showing right now, or `active:false`. The one thing this
   module exposes for introspection outside a draw call — see the header
   comment on why this is safe and `stats` in `view/paint.js` for the
   precedent. */
export const hoverInfo = { active: false, x: 0, y: 0, lines: null };

export function drawHUD(g, f) {
  const { W, H } = f;

  /* Phase 5b: the widget layer's own scratch space is rebuilt once per HUD
     frame, the same place `pocketHits.length = 0` below already resets this
     file's own equivalent -- see `view/ui/state.js`'s header. */
  resetUiDrawn();

  hearts(g, 6, 6);
  const burdenBottom = burden(g, 6, 14, W);
  pocketHits.length = 0;
  /* The panel opens a fixed gap below the burden bar. It used to open below
     wherever the pocket STRIP actually ended (the strip wrapped onto a
     second row once enough distinct pairs were held) -- now that the strip
     is gone, `burden()`'s own return value (which already accounts for the
     lockout line growing it) is the only thing that needs measuring. */
  /* Phase 5b: `'i'` toggles `flags.showInv` AND `shell/ui.js#toggle('main')`
     TOGETHER (Phase 5a's own wiring, see `shell/input.js`'s comment at the
     `'i'` handler) -- so with the new tabbed window shipped, this OLD panel
     would otherwise draw directly on top of it every time either opens,
     which is exactly what it looked like before this guard was added. Its
     POCKETS and CRAFT sections are superseded by the new CHARACTER and
     CRAFTING tabs; its BUILD section (the only thing with no equivalent
     yet) moved into the new LOGISTICS tab instead (`view/ui/mainPanel.js`),
     which is why 1-9 still places the same machine either way -- that gate
     is `flags.showInv` in `shell/input.js`, unchanged and still true
     whenever this text panel WOULD have drawn. See docs/FINDINGS.md. */
  if (f.flags.showInv && !f.ui.stack.includes('main')) {
    pocketHits.push(...invPanel(g, f, burdenBottom + 4));
  } else {
    buildHits.length = 0;                 // panel closed: nothing to hover
  }
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

/* The full inventory, toggled by `i` (`shell/input.js#flags.showInv`). Same
   data source the CHARACTER tab's grid uses (`pocketRows()`), filtered to
   what is actually HELD -- a zero-count teaching slot has nothing to list a
   mass or a count for. `massOfPair` is a `model/items.js` query, not a render
   decision: the mass of a copper ingot is a fact about the world, not about
   how it is drawn. */
/* A build cost or a hand-recipe's inputs, as one readable line. `exact`
   clauses (a machine's `cost`) are literal `sub/form` keys, so `labelOf`
   builds a real name out of them; a recipe's `in` clauses are SELECTORS
   (star-slash-hash-ore, see the grammar comment in `data/forms.js`), which
   name no single substance until one is chosen, so those fall back to the
   selector's own form/tag word instead. Either way this is
   presentation text, not a second selector-matching implementation --
   `model/run.js#canAfford`/`canCraft` already decided the yes/no this only
   labels. */
function billOf(clauses, exact) {
  const parts = [];
  for (const k in clauses) {
    const n = clauses[k];
    if (exact) {
      const { sub, form } = parseKey(k);
      /* POLISH: SHORT names here -- this is exactly the "narrow crafting
         grid" style bill-of-materials line the abbreviation was made for,
         a fixed-width panel row that a full name ("12 COPPER ORE+6 TIMBER
         LOG") can run past. */
      parts.push(`${n} ${shortLabelOf(sub, form)}`);
    } else {
      const raw = k.includes('/') ? k.slice(k.indexOf('/') + 1) : k;
      parts.push(`${n} ${(raw[0] === '#' ? raw.slice(1) : raw).toUpperCase()}`);
    }
  }
  return parts.length ? parts.join('+') : 'FREE';
}

function invPanel(g, f, top) {
  const { W, H } = f;
  const rows = pocketRows().filter(r => r.n > 0);

  /* BUILD lists every machine this run may place, `model/run.js#canPlace`'s
     own set, in GRANTED order -- see `buildableMachines`. CRAFT lists every
     `hand:true` recipe (`data/recipes.js#HAND_RECIPES`). Numbering BUILD's
     rows is what `shell/input.js`'s 1-9 keys read against; CRAFT has no
     number because `rules/crafting.js#choose` always picks the first one the
     player can afford, not a menu selection. */
  const machines = buildableMachines();
  const recipes = HAND_RECIPES;
  const machLines = machines.map((m, i) => `${i + 1} ${m.name} ${billOf(m.cost, true)}`);
  const craftLines = recipes.map(r => `${r.name} ${billOf(r.in, false)}`);
  const lineH = 9;

  /* Width fits the longest NAME alone, clamped to the viewport -- a relic's
     full name ("BELLOWS OF THE FORGE RELIC") is longer than count-and-mass
     could ever be squeezed onto the same line as at any viewport width
     without the two overlapping, which is why they get their own indented
     line below the name instead of a right-aligned column. Two lines per
     pocket entry, always, rather than only when a name is long: a fixed row
     shape is one thing to get right instead of a per-row branch that is only
     exercised by whichever item happens to have the longest name. BUILD and
     CRAFT rows get one line each -- a name plus a short bill of materials
     does not run as long as a relic's full name does. */
  const w = Math.min(
    Math.max(
      textWidth('POCKETS'), textWidth('BUILD'), textWidth('CRAFT'), 60,
      ...rows.map(r => textWidth(labelOf(r.sub, r.form))),
      ...machLines.map(l => textWidth(l)), ...craftLines.map(l => textWidth(l))
    ) + 8,
    W - 12
  );
  const lines = 1 + (rows.length ? rows.length * 2 : 1)             // POCKETS
              + 1 + (machLines.length ? machLines.length : 1)       // BUILD
              + 1 + (craftLines.length ? craftLines.length : 1);    // CRAFT
  const h = lines * lineH + 8;
  const x = (W - w) >> 1, y = Math.min(top, H - h - 4);
  const hits = [];

  panel(g, x, y, w, h, 0.88);
  let ry = y + 4;
  drawText(g, 'POCKETS', x + 4, ry, UI.ink, 1, 1);
  ry += lineH;

  if (!rows.length) {
    drawText(g, 'EMPTY', x + 4, ry, UI.dim, 1, 1);
    ry += lineH;
  } else for (const row of rows) {
    const label = labelOf(row.sub, row.form);
    const n = 'x' + row.n;
    const m = massOfPair(row.sub, row.form).toFixed(1);
    const hitTop = ry - 1;

    drawText(g, label, x + 4, ry, UI.ink, 1, 1);
    ry += lineH;
    drawText(g, n, x + 8, ry, UI.dim, 1, 1);
    drawText(g, m, x + 8 + textWidth(n) + 6, ry, UI.dim, 1, 1);
    ry += lineH;

    hits.push({ x, y: hitTop, w, h: lineH * 2, sub: row.sub, form: row.form });
  }

  /* BUILD. Greyed by `afford` rather than hidden -- a machine the player
     cannot yet pay for is still something worth planning a haul toward.
     Each row's own rectangle is captured into `buildHits`, the SAME idiom
     `pocketHits` above already uses for the pockets, so `buildGhost` can
     hit-test the pointer against exactly what got drawn rather than a
     second copy of this layout math. */
  drawText(g, 'BUILD', x + 4, ry, UI.ink, 1, 1);
  ry += lineH;
  buildHits.length = 0;
  if (!machLines.length) { drawText(g, 'NOTHING GRANTED', x + 4, ry, UI.dim, 1, 1); ry += lineH; }
  else machines.forEach((m, i) => {
    drawText(g, machLines[i], x + 4, ry, m.afford ? UI.ink : UI.dim, 1, 1);
    buildHits.push({ x, y: ry - 1, w, h: lineH, id: m.id });
    ry += lineH;
  });

  /* CRAFT. Marked `UI.good` when craftable right now, so the panel answers
     "what can I make" at a glance -- the same colour the reticle uses for a
     legal placement. */
  drawText(g, 'CRAFT', x + 4, ry, UI.ink, 1, 1);
  ry += lineH;
  if (!craftLines.length) { drawText(g, 'NONE', x + 4, ry, UI.dim, 1, 1); ry += lineH; }
  else recipes.forEach((r, i) => {
    drawText(g, craftLines[i], x + 4, ry, canCraft(r.in) ? UI.good : UI.dim, 1, 1);
    ry += lineH;
  });

  return hits;
}

/* The tooltip itself. `resolveHover` does the actual hit-testing and content
   lookup, entirely from the pointer and the model; this just lays out
   whatever it returns and remembers it in `hoverInfo` for the test hook. */
function tooltip(g, f) {
  /* The Phase 5b panel may already have drawn its own tooltip this frame
     (`view/ui/tooltip.js`'s `drawn.tooltip` is a SINGLE slot, per that
     file's own header: only one tooltip can be under the cursor at once).
     When it has, this older invPanel tooltip must yield rather than
     overwrite it -- both read the same pointer position, and the new
     panel's own grids sit visually on top of the old one when both are
     somehow reachable at once. */
  if (uiDrawn.tooltip) return;
  const info = resolveHover(f, pocketHits);
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

/* ---------- the build ghost (Phase 3, `docs/BUILD_PLAN.md`) ----------
   Hover a row of the open BUILD panel with the pointer and its footprint
   previews at the aim reticle -- snapped to the grid, tinted by whether
   `model/run.js#placementCheck` (the SAME query `rules/placement.js#
   placeMachine` calls before ever touching the world) says the exact spot
   the digit would place it is legal, with the ONE-WORD reason drawn beside
   it when it is not. VIEW MAY NOT IMPORT RULES, so this reads a MODEL query
   and nothing else -- the identical move `canAfford`'s own greyed-out BUILD
   row already made. The footprint is anchored EXACTLY the way
   `shell/main.js#applyIntents` anchors a real placement (bottom row at the
   aimed tile), so the preview can never show a spot the real placement would
   not also choose. */
/* The tinted footprint itself, factored out so the OLD BUILD-menu-hover ghost
   and the NEW armed-pair ghost below (Part 1, click-to-arm placement) share
   one implementation of "paint this footprint, ok-green or refused-red, with
   the one-word reason beside it" rather than two copies of the same loop. */
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

function buildGhost(g, f) {
  if (!aim.valid || !aim.band) return;

  if (f.flags.showInv && f.mouse?.has) {
    const sx = f.mouse.x - f.cam.x, sy = f.mouse.y - f.cam.y;
    const hover = buildHits.find(h => sx >= h.x && sx < h.x + h.w && sy >= h.y && sy < h.y + h.h);
    const def = hover && MACH[M[hover.id]];
    if (def) {
      const tx = aim.tx, ty = aim.ty - def.th + 1;
      const check = placementCheck(aim.band, hover.id, tx, ty);
      drawFootprintGhost(g, f, aim.band, tx, ty, def.tw, def.th, check.ok, check.why);
      return;
    }
  }

  /* Part 1 (click-to-arm placement): preview the ARMED pair, if any, at the
     aim reticle -- the same footprint-tint idiom above, generalised to a
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
