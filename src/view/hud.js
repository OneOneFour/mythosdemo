/* LAYER view — THE HUD. Drawn in the same pixel space as the world using the
   5x7 bitmap font. Imports `core`, `data` and READ-ONLY `model` queries.

   NO `fillText` ANYWHERE (invariant 9). Mixing an antialiased system font into
   a nearest-neighbour upscale breaks the look immediately, and it is the first
   thing that creeps back in, so the rule is absolute.

   ============================================================================
   THE POCKET STRIP NAMES NOTHING. The previous HUD hardcoded four substance
   names and a fifth special case; this one draws `run.pocketRows()`, which is a
   model query sorted by the one ordering rule in `data/forms.js`. Appending
   `tin` gave it a slot. Appending a `brick` form would give it another. The
   colour comes from the substance's `look.item`, so a new element arrives with
   its own swatch and no edit here.
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
import { FORM, labelOf } from '../data/forms.js';
import { colour } from '../data/palette.js';
import { HAND_RECIPES } from '../data/recipes.js';
import { SUB } from '../data/substances.js';
import { SPAWN_BAND } from '../data/world.js';
import { TRINKET } from '../data/trinkets.js';
import { aim } from '../model/aim.js';
import { massOfPair, parseKey } from '../model/items.js';
import { mods } from '../model/mods.js';
import { player } from '../model/player.js';
import { buildableMachines, canCraft, hasPick, pocketRows, run } from '../model/run.js';
import { bandOf, worldY } from '../model/world.js';
import { banner, toasts } from './fx.js';
import { resolveHover } from './hover.js';
import { stats as paintStats } from './paint.js';

const UI = {
  ink:    colour('ui'),
  dim:    colour('uiDim'),
  back:   colour('uiBack'),
  heart:  '#d8433a',
  hollow: '#2c2028',
  hi:     '#ff8a7a',
  good:   '#9ad86a',
  debug:  colour('watB'),
  /* The pocket strip's one accent colour: a relic's frame, and nothing else.
     `ichor` is already the divine-gold `data/palette.js` name a trinket's own
     `look.item` uses (see `bellows` in `data/substances.js`), so a trinket's
     border and a trinket's swatch read as the same material rather than the
     HUD inventing a second "this is special" colour. */
  relic:  colour('ichor')
};

/* `view/hover.js#resolveHover` hit-tests against exactly these rectangles, so
   the strip/panel and their tooltips cannot silently disagree about where an
   entry sits. Rebuilt from scratch every `drawHUD` call -- read, never relied
   on for anything but the next line's hover test and the test hook. */
export const pocketHits = [];

/* What a tooltip is showing right now, or `active:false`. The one thing this
   module exposes for introspection outside a draw call — see the header
   comment on why this is safe and `stats` in `view/paint.js` for the
   precedent. */
export const hoverInfo = { active: false, x: 0, y: 0, lines: null };

export function drawHUD(g, f) {
  const { W, H } = f;
  const narrow = W < 300;

  hearts(g, 6, 6);
  const stripHits = pockets(g, 6, narrow ? 20 : 18, W);
  pocketHits.length = 0;
  pocketHits.push(...stripHits);
  /* The panel opens BELOW wherever the strip actually ended, not a fixed y --
     the strip wraps onto a second row once enough distinct pairs are held, and
     a fixed offset would let the panel overlap it exactly the way CLAUDE.md's
     own "narrow panel" mistake describes. */
  if (f.flags.showInv) {
    const top = stripHits.reduce((m, h) => Math.max(m, h.y + h.h + 4), narrow ? 30 : 28);
    pocketHits.push(...invPanel(g, f, top));
  }
  depth(g, W, 6);
  reticle(g, f);
  hint(g, W, H);
  if (f.flags.showDebug) debug(g, f, W);
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

/* One swatch, one name and one count per held pair. A pair the substance row
   flags `always` shows a zero, which is how the first minute has something to
   point at without a tutorial beat existing.

   Wraps to a second row rather than running off the edge of a narrow viewport
   -- CLAUDE.md's own list of past mistakes here is exactly "a panel that
   overlaps at 200 px wide", and a name is much wider than the swatch-plus-count
   this strip used to be. Returns the rectangle it drew for every entry, so
   `view/hover.js` can hit-test the SAME layout instead of a second copy of
   this x/y math. */
function pockets(g, x, y, maxW) {
  const hits = [];
  let cx = x, cy = y;
  for (const row of pocketRows()) {
    const s = SUB[row.sub];
    const l = s.look;
    if (!l?.item) continue;
    const col = colour(l.item[0]);
    const label = labelOf(row.sub, row.form);
    const n = String(row.n);
    const lw = textWidth(label), nw = textWidth(n);
    /* A gap of a full glyph cell (6 px) between the name and the count -- 3 px
       read as "ORE0" with no space at all once the label stopped being a bare
       swatch, which is illegible at this font size. */
    const w = 6 + lw + 6 + nw + 3;

    if (cx > x && cx + w > maxW - 4) { cx = x; cy += 8; }

    /* A relic (a trinket, the starting pick) is a unique held THING, not a
       stack of material -- ARCHITECTURE's substance x form split means it
       lands in this same strip with no code path of its own, so the border is
       the only thing that stops it reading as "ore, ore, mystery ore" the
       moment one enters the pockets. `tags.includes('relic')` is the same test
       `data/forms.js#crossable` uses to decide the `relic` form may cross it. */
    const relic = s.tags?.includes('relic');
    if (relic) R(g, cx - 1, cy, 6, 6, UI.relic);
    R(g, cx, cy + 1, 4, 4, col);
    R(g, cx, cy + 4, 4, 1, mix(col, UI.back, 0.5));
    /* A tile-capable form is what a ladder is built from, so it is marked:
       the player needs to know which of their pockets can become a wall. */
    if (FORM[row.form].tile) R(g, cx + 1, cy + 2, 2, 1, UI.back);

    drawText(g, label, cx + 6, cy, UI.dim, 1, 1);
    drawText(g, n, cx + 6 + lw + 6, cy, row.n ? UI.ink : UI.dim, 1, 1);

    hits.push({ x: cx - 1, y: cy - 1, w: w, h: 8, sub: row.sub, form: row.form });
    cx += w + 5;
  }
  return hits;
}

/* The full inventory, toggled by `i` (`shell/input.js#flags.showInv`). Same
   data source as the strip (`pocketRows()`), filtered to what is actually
   HELD -- the strip's zero-count teaching slots have nothing to list a mass
   or a count for. `massOfPair` is a `model/items.js` query, not a render
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
      parts.push(`${n} ${labelOf(sub, form)}`);
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
     cannot yet pay for is still something worth planning a haul toward. */
  drawText(g, 'BUILD', x + 4, ry, UI.ink, 1, 1);
  ry += lineH;
  if (!machLines.length) { drawText(g, 'NOTHING GRANTED', x + 4, ry, UI.dim, 1, 1); ry += lineH; }
  else machines.forEach((m, i) => {
    drawText(g, machLines[i], x + 4, ry, m.afford ? UI.ink : UI.dim, 1, 1);
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

function debug(g, f, W) {
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
  panel(g, W - w - 12, 22, w + 10, rows.length * 9 + 6, 0.8);
  rows.forEach((r, i) => drawText(g, r, W - w - 7, 26 + i * 9, UI.debug, 1, 1));
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
