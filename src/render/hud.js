import { R, VIEW, ctx } from '../core/canvas.js';
import { P, mix } from '../core/palette.js';
import { drawText, textWidth } from '../core/font.js';
import { TILE } from '../world/grid.js';
import { SURFACE_TY } from '../world/generate.js';
import { clock, run, view } from '../sim/state.js';
import { player } from '../sim/player.js';
import { BEATS } from '../sim/tutorial.js';
import { stats as sceneStats } from './scene.js';
import { stats as paintStats } from '../world/paint.js';


/* ============================================================
   HUD

   Drawn in the same pixel space as the world, using the 5x7 bitmap
   font. No fillText anywhere — mixed resolutions break the look.
   Panels clamp on narrow viewports, as they did in the mockup.
   ============================================================ */
export function drawHUD() {
  const W = VIEW.w, H = VIEW.h;
  const narrow = W < 300;

  hearts(6, 6);
  pockets(6, narrow ? 20 : 18);
  depth(W, 6);
  if (run.trial) trial(W, narrow);
  hint(W, H);
  if (view.showDebug) debug(W);
  if (run.dead) deathScreen(W, H);
  if (view.titleFade > 0 && !run.dead) title(W, H, view.titleFade);
}


function panel(x, y, w, h, a = 0.72) {
  ctx.globalAlpha = a; R(ctx, x, y, w, h, P.uiBack); ctx.globalAlpha = 1;
  R(ctx, x, y, w, 1, mix(P.uiBack, P.uiDim, 0.6));
}

/* --- five discrete hearts, per docs/SPEC.md --- */
function hearts(x, y) {
  for (let i = 0; i < run.maxHearts; i++) {
    const full = i < run.hearts;
    const hx = x + i * 9;
    const col = full ? '#d8433a' : '#2c2028';
    // 7x6 pixel heart
    R(ctx, hx,     y + 1, 2, 2, col);
    R(ctx, hx + 3, y + 1, 2, 2, col);
    R(ctx, hx,     y + 2, 5, 2, col);
    R(ctx, hx + 1, y + 4, 3, 1, col);
    R(ctx, hx + 2, y + 5, 1, 1, col);
    if (full) R(ctx, hx + 1, y + 1, 1, 1, '#ff8a7a');
  }
}

function pockets(x, y) {
  const kinds = [['copper', P.cuA], ['timber', P.woodA],
                 ['stone', P.limeB], ['ingot', '#ffd469']];
  let cx = x;
  for (const [k, col] of kinds) {
    const n = k === 'ingot' ? (run.inv.ingot || 0) : (run.inv[k] || 0);
    if (!n && k !== 'copper') continue;
    R(ctx, cx, y + 1, 4, 4, col);
    R(ctx, cx, y + 4, 4, 1, mix(col, '#000000', 0.4));
    drawText(ctx, String(n), cx + 6, y, P.ui, 1, 1);
    cx += 6 + textWidth(String(n)) + 6;
  }
  if (run.ladderStock) {
    R(ctx, cx, y + 1, 4, 4, P.woodC);
    drawText(ctx, String(run.ladderStock), cx + 6, y, P.uiDim, 1, 1);
  }
}

function depth(W, y) {
  const d = Math.max(0, Math.round((player.y - SURFACE_TY * TILE) / TILE));
  const s = d + 'M';                     // 1 tile reads as 1 metre
  const w = textWidth(s) + 8;
  panel(W - w - 6, y - 2, w, 11);
  drawText(ctx, s, W - w - 2, y, d > 0 ? P.ui : P.uiDim, 1, 1);
}

function trial(W, narrow) {
  const t = run.trial;
  const lines = [t.from + ' DEMANDS', t.have + '/' + t.need + ' ' + t.what];
  let w = 0; for (const l of lines) w = Math.max(w, textWidth(l));
  w += 10;
  const x = Math.max(6, Math.min(W - w - 6, (W - w) >> 1));
  const y = narrow ? 34 : 22;
  panel(x, y, w, 24, 0.8);
  drawText(ctx, lines[0], x + 5, y + 4, t.done ? '#9ad86a' : P.uiDim, 1, 1);
  drawText(ctx, lines[1], x + 5, y + 13, t.done ? '#9ad86a' : P.ui, 1, 1);
  if (!t.done) {
    const bw = w - 10, fill = (bw * t.have / t.need) | 0;
    R(ctx, x + 5, y + 22, bw, 1, '#2c2028');
    if (fill > 0) R(ctx, x + 5, y + 22, fill, 1, P.cuA);
  }
}

/* the current beat's instruction, plus transient toasts */
function hint(W, H) {
  let msg = '', col = P.uiDim;
  if (run.toastT > 0) { msg = run.toast; col = P.ui; }
  else {
    const b = BEATS[Math.min(run.beat, BEATS.length - 1)];
    msg = b.hint;
  }
  if (!msg) return;
  const w = textWidth(msg) + 12;
  const x = Math.max(2, (W - w) >> 1);
  const y = H - 16;
  panel(x, y, Math.min(w, W - 4), 12, 0.78);
  drawText(ctx, msg, x + 6, y + 3, col, 1, 1);
}

function debug(W) {
  const rows = [
    'FPS ' + (clock.dt > 0 ? Math.round(1 / clock.dt) : 0),
    'POS ' + Math.round(player.x) + ',' + Math.round(player.y),
    'VY ' + Math.round(player.vy),
    'GND ' + (player.onGround ? 'Y' : 'N') + ' LAD ' + (player.onLadder ? 'Y' : 'N'),
    'CHUNKS ' + sceneStats.chunksDrawn + ' PAINT ' + paintStats.painted,
    'BEAT ' + BEATS[Math.min(run.beat, BEATS.length - 1)].id
  ];
  let w = 0; for (const r of rows) w = Math.max(w, textWidth(r));
  panel(W - w - 12, 22, w + 10, rows.length * 9 + 6, 0.8);
  rows.forEach((r, i) => drawText(ctx, r, W - w - 7, 26 + i * 9, '#7fd0ff', 1, 1));
}

function deathScreen(W, H) {
  ctx.globalAlpha = 0.78; R(ctx, 0, 0, W, H, '#0a0206'); ctx.globalAlpha = 1;
  const lines = [
    ['THE EAGLE COMES', '#d8433a', 2],
    [run.deathCause, P.ui, 1],
    ['DEPTH REACHED ' + Math.round((run.deepest - SURFACE_TY * TILE) / TILE) + 'M', P.uiDim, 1],
    ['PRESS R TO BEGIN THE NEXT TORMENT', P.uiDim, 1]
  ];
  let y = (H >> 1) - 26;
  for (const [s, col, sc] of lines) {
    drawText(ctx, s, Math.max(4, (W - textWidth(s, sc)) >> 1), y, col, sc, 1);
    y += sc === 2 ? 22 : 13;
  }
}

function title(W, H, f) {
  ctx.globalAlpha = Math.min(1, f);
  const a = 'MYTHOS FACTORY', b = 'TORMENT I';
  drawText(ctx, a, Math.max(2, (W - textWidth(a, 2)) >> 1), (H >> 1) - 30, P.ui, 2, 2);
  drawText(ctx, b, Math.max(2, (W - textWidth(b)) >> 1), (H >> 1) - 8, P.uiDim, 1, 2);
  ctx.globalAlpha = 1;
}
