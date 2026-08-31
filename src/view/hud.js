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
   below are what stop that, and they were learned the hard way. Keep them. */

import { drawText, textWidth } from '../core/font.js';
import { R } from '../core/pixels.js';
import { mix } from '../core/palette.js';
import { FORM, labelOf } from '../data/forms.js';
import { colour } from '../data/palette.js';
import { SUB } from '../data/substances.js';
import { SPAWN_BAND } from '../data/world.js';
import { TRINKET } from '../data/trinkets.js';
import { aim } from '../model/aim.js';
import { mods } from '../model/mods.js';
import { player } from '../model/player.js';
import { hasPick, pocketRows, run } from '../model/run.js';
import { bandOf, worldY } from '../model/world.js';
import { banner, toasts } from './fx.js';
import { stats as paintStats } from './paint.js';

const UI = {
  ink:    colour('ui'),
  dim:    colour('uiDim'),
  back:   colour('uiBack'),
  heart:  '#d8433a',
  hollow: '#2c2028',
  hi:     '#ff8a7a',
  good:   '#9ad86a',
  debug:  colour('watB')
};

export function drawHUD(g, f) {
  const { W, H } = f;
  const narrow = W < 300;

  hearts(g, 6, 6);
  pockets(g, 6, narrow ? 20 : 18);
  depth(g, W, 6);
  reticle(g, f);
  hint(g, W, H);
  if (f.flags.showDebug) debug(g, f, W);
  if (run.dead) deathScreen(g, W, H);
  else if (banner.fade > 0) title(g, W, H);
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

/* One swatch and one count per held pair. A pair the substance row flags
   `always` shows a zero, which is how the first minute has something to point
   at without a tutorial beat existing. */
function pockets(g, x, y) {
  let cx = x;
  for (const row of pocketRows()) {
    const l = SUB[row.sub].look;
    if (!l?.item) continue;
    const col = colour(l.item[0]);
    const n = String(row.n);
    R(g, cx, y + 1, 4, 4, col);
    R(g, cx, y + 4, 4, 1, mix(col, UI.back, 0.5));
    /* A tile-capable form is what a ladder is built from, so it is marked:
       the player needs to know which of their pockets can become a wall. */
    if (FORM[row.form].tile) R(g, cx + 1, y + 2, 2, 1, UI.back);
    drawText(g, n, cx + 6, y, row.n ? UI.ink : UI.dim, 1, 1);
    cx += 6 + textWidth(n) + 6;
  }
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
  if (!aim.valid || !aim.band || !run.hasPick || run.dead) return;
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
