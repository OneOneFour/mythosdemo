import { R, VIEW, ctx, glow, lineTo } from '../core/canvas.js';
import { P, mix } from '../core/palette.js';
import { hash2 } from '../core/rng.js';
import { CHUNKS_X, CHUNKS_Y, CHUNK, CHUNK_PX, TILE, WORLD_H, WORLD_W } from '../world/grid.js';
import { chunkAt } from '../world/paint.js';
import { SURFACE_TY, surface } from '../world/generate.js';
import { cam, chips, clock, items, run, view } from '../sim/state.js';
import { PH, PW, player } from '../sim/player.js';
import { KIND } from '../sim/items.js';
import { aim } from '../sim/mining.js';
import { structures } from '../sim/structures.js';
import { altar, pickup } from '../sim/tutorial.js';
import { drawHUD } from './hud.js';


/* ============================================================
   RENDER

   Sky, then chunk blits, then entities, then atmosphere, then HUD.
   Everything is drawn in world pixels offset by the camera; the
   canvas is upscaled nearest-neighbour by CSS.
   ============================================================ */
export const stats = { chunksDrawn: 0 };

export function render() {
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const W = VIEW.w, H = VIEW.h;

  drawSky(cx, cy, W, H);
  drawChunks(cx, cy, W, H);
  drawStructures(cx, cy);
  drawPickup(cx, cy);
  drawAltar(cx, cy);
  drawItems(cx, cy);
  drawPlayer(cx, cy);
  drawChips(cx, cy);
  drawAim(cx, cy);
  depthTint(cy, W, H);
  vignette(W, H);
  if (view.showGrid)   drawGrid(cx, cy, W, H);
  if (view.showChunks) drawChunkBounds(cx, cy, W, H);
  drawHUD();
}


/* ---------- sky and clouds ---------- */
function drawSky(cx, cy, W, H) {
  const horizon = SURFACE_TY * TILE - cy;
  if (horizon <= 0) { R(ctx, 0, 0, W, H, '#0a0810'); return; }
  const g = ctx.createLinearGradient(0, Math.min(0, -cy), 0, Math.max(1, horizon + 40));
  g.addColorStop(0, P.skyHi); g.addColorStop(1, mix(P.skyLo, P.limeA, 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.max(1, Math.min(H, horizon + 40)));
  if (horizon < H) R(ctx, 0, horizon + 40, W, H - horizon - 40, '#0a0810');

  // distant clouds, drifting
  for (let i = 0; i < 18; i++) {
    const sp = 2 + (i % 4) * 1.6;
    const x = ((hash2(i, 2001) * (WORLD_W + 260) + clock.t * sp) % (WORLD_W + 260)) - 130 - cx * 0.35;
    const y = 14 + hash2(i, 2003) * (SURFACE_TY * TILE - 60) - cy * 0.55;
    if (y < -30 || y > H || x < -60 || x > W + 60) continue;
    ctx.globalAlpha = 0.55;
    puff(ctx, x | 0, y | 0, (14 + hash2(i, 2007) * 26) | 0, P.cloudA);
    ctx.globalAlpha = 1;
  }
}

export function puff(g, x, y, w, col) {
  const h = Math.max(3, (w * 0.34) | 0);
  R(g, x, y, w, h, col);
  R(g, x + (w * 0.2 | 0), y - (h * 0.6 | 0), (w * 0.5) | 0, h, col);
  R(g, x + (w * 0.55 | 0), y - (h * 0.3 | 0), (w * 0.3) | 0, h, mix(col, P.cloudC, 0.3));
}


/* ---------- terrain ---------- */
function drawChunks(cx, cy, W, H) {
  const c0x = Math.max(0, Math.floor(cx / CHUNK_PX));
  const c1x = Math.min(CHUNKS_X - 1, Math.floor((cx + W) / CHUNK_PX));
  const c0y = Math.max(0, Math.floor(cy / CHUNK_PX));
  const c1y = Math.min(CHUNKS_Y - 1, Math.floor((cy + H) / CHUNK_PX));
  stats.chunksDrawn = 0;
  for (let ccy = c0y; ccy <= c1y; ccy++)
    for (let ccx = c0x; ccx <= c1x; ccx++) {
      ctx.drawImage(chunkAt(ccx, ccy), ccx * CHUNK_PX - cx, ccy * CHUNK_PX - cy);
      stats.chunksDrawn++;
    }
}


/* ---------- entities ---------- */
function drawItems(cx, cy) {
  for (const it of items) {
    const x = (it.x - cx) | 0, y = (it.y - cy) | 0;
    if (x < -8 || x > VIEW.w + 8 || y < -8 || y > VIEW.h + 8) continue;
    const K = KIND[it.kind], s = K.size;
    R(ctx, x - (s >> 1), y - (s >> 1), s, s, K.col);
    R(ctx, x - (s >> 1), y + (s >> 1) - 1, s, 1, K.col2);
    R(ctx, x - (s >> 1), y - (s >> 1), 1, 1, mix(K.col, '#ffffff', 0.5));
    if (K.shiny && Math.sin(clock.t * 4 + it.x) > 0.6)
      R(ctx, x + (s >> 1) - 1, y - (s >> 1), 1, 1, '#fff6d6');
  }
}

function drawPlayer(cx, cy) {
  const p = player;
  if (run.dead) return;
  const x = (p.x - cx) | 0, y = (p.y - cy) | 0;
  // blink while invulnerable so a hit is legible
  if (run.invuln > 0 && ((clock.t * 14) | 0) % 2 === 0) return;

  const skin = '#d8a878', tunicA = '#b8433a', tunicB = '#8d2f29';
  const step = p.walkPhase ? (Math.sin(p.walkPhase) > 0 ? 1 : 0) : 0;

  R(ctx, x + 1, y + 10, 3, 6, tunicB);                 // legs
  R(ctx, x + 4, y + 10, 3, 6 - step, tunicB);
  R(ctx, x, y + 4, PW, 7, tunicA);                     // torso
  R(ctx, x, y + 4, PW, 1, mix(tunicA, '#ffffff', 0.3));
  R(ctx, x + 2, y, 5, 5, skin);                        // head
  R(ctx, x + 2, y, 5, 1, '#3a2416');                   // hair
  R(ctx, x + (p.face > 0 ? 5 : 2), y + 2, 1, 1, '#1a1014');   // eye

  if (run.hasPick) {                                   // the pick, held out front
    const hx = x + (p.face > 0 ? PW : -1), hy = y + 6;
    const sw = p.digAnim ? 1 : 0;
    lineTo(ctx, hx, hy + sw, hx + p.face * 4, hy - 3 + sw * 4, P.woodB);
    R(ctx, hx + p.face * 4, hy - 4 + sw * 4, 2, 2, P.irA);
  }
  if (p.hurtFlash > 0) {
    ctx.globalAlpha = p.hurtFlash * 0.7;
    R(ctx, x - 1, y - 1, PW + 2, PH + 2, '#ff4a4a');
    ctx.globalAlpha = 1;
  }
}

function drawChips(cx, cy) {
  for (const c of chips) {
    const x = (c.x - cx) | 0, y = (c.y - cy) | 0;
    if (x < 0 || x > VIEW.w || y < 0 || y > VIEW.h) continue;
    R(ctx, x, y, 1, 1, c.col);
  }
}

function drawStructures(cx, cy) {
  for (const s of structures) {
    const x = (s.x - cx) | 0, y = (s.y - cy) | 0;
    if (x < -40 || x > VIEW.w + 40 || y < -40 || y > VIEW.h + 40) continue;
    R(ctx, x, y, s.w, s.h, P.irC);                        // body
    R(ctx, x, y, s.w, 2, P.irB);
    R(ctx, x + 1, y + 1, s.w - 2, 2, '#1a1014');          // mouth
    R(ctx, x, y + s.h - 2, s.w, 2, P.irD);
    // hopper lip, to read as a catch box
    R(ctx, x - 2, y - 1, 2, 3, P.irB);
    R(ctx, x + s.w, y - 1, 2, 3, P.irB);
    const fire = Math.max(s.fire, s.prog > 0 ? 0.5 : 0);
    if (fire > 0.02) {
      const f = 3 + ((Math.sin(clock.t * 9) + 1) * 1.5 * fire) | 0;
      R(ctx, x + 2, y + s.h - 2 - f, s.w - 4, f, Math.random() < 0.5 ? P.lavaB : P.lavaA);
      glow(ctx, x + s.w / 2, y + s.h - 2, 12 + fire * 8, P.lavaB, 0.4 * fire);
    }
    // buffer readout as pips, so the machine's state is visible in-world
    for (let i = 0; i < s.buf.copper; i++) R(ctx, x + 1 + i * 3, y + 4, 2, 2, P.cuA);
    for (let i = 0; i < s.buf.timber; i++) R(ctx, x + 1 + i * 3, y + 7, 2, 2, P.woodA);
  }
}

function drawPickup(cx, cy) {
  if (pickup.taken) return;
  const bob = Math.sin(pickup.bob) * 1.6;
  const x = (pickup.tx * TILE + 2 - cx) | 0;
  const y = (pickup.ty * TILE + bob - cy) | 0;
  if (x < -20 || x > VIEW.w + 20 || y < -20 || y > VIEW.h + 20) return;
  lineTo(ctx, x, y + 8, x + 3, y, P.woodB);              // haft
  R(ctx, x + 1, y - 2, 5, 2, P.irA);                     // head
  R(ctx, x + 1, y - 1, 5, 1, P.irC);
  glow(ctx, x + 3, y + 2, 12 + Math.sin(pickup.bob * 1.3) * 3, '#ffe9a8', 0.4);
}

function drawAltar(cx, cy) {
  if (!altar.risen) return;
  const h = (10 * altar.rise) | 0;
  const x = (altar.tx * TILE - 4 - cx) | 0;
  const base = altar.ty * TILE + TILE;
  const y = (base - h - cy) | 0;
  // shaft of light
  const lg = ctx.createLinearGradient(0, Math.max(0, y - 200), 0, y + 10);
  lg.addColorStop(0, 'rgba(255,246,214,0)');
  lg.addColorStop(1, `rgba(255,246,214,${0.30 * altar.rise})`);
  ctx.fillStyle = lg; ctx.fillRect(x - 6, Math.max(0, y - 200), 28, Math.min(VIEW.h, y + 10));
  if (h > 0) {
    R(ctx, x, y, 16, h, P.marbleB);
    R(ctx, x, y, 16, 2, P.marbleA);
    R(ctx, x - 2, y, 20, 2, P.marbleA);
    R(ctx, x + 2, y + 2, 12, h - 2, P.marbleC);
    R(ctx, x + 4, y + 3, 8, 2, mix(P.marbleC, '#000000', 0.4));   // the offering bowl
  }
  glow(ctx, x + 8, y, 18 + Math.sin(altar.glow * 2) * 4, '#ffe9a8', 0.35 * altar.rise);
}

function drawAim(cx, cy) {
  if (!aim.valid || !run.hasPick) return;
  const x = (aim.tx * TILE - cx) | 0, y = (aim.ty * TILE - cy) | 0;
  ctx.globalAlpha = 0.75;
  const col = '#ffe9a8';
  R(ctx, x, y, 2, 1, col);         R(ctx, x, y, 1, 2, col);
  R(ctx, x + TILE - 2, y, 2, 1, col); R(ctx, x + TILE - 1, y, 1, 2, col);
  R(ctx, x, y + TILE - 1, 2, 1, col); R(ctx, x, y + TILE - 2, 1, 2, col);
  R(ctx, x + TILE - 2, y + TILE - 1, 2, 1, col);
  R(ctx, x + TILE - 1, y + TILE - 2, 1, 2, col);
  ctx.globalAlpha = 1;
}


/* ---------- atmosphere ---------- */
function depthTint(cy, W, H) {
  const mid = cy + H / 2;
  const surf = SURFACE_TY * TILE;
  if (mid < surf + 40) return;
  const d = Math.min(1, (mid - surf) / (WORLD_H - surf));
  ctx.globalAlpha = 0.10 + d * 0.42;
  R(ctx, 0, 0, W, H, d < 0.4 ? '#1a1208' : '#05040a');
  ctx.globalAlpha = 1;
}

function vignette(W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32,
                                     W / 2, H / 2, Math.max(W, H) * 0.76);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawGrid(cx, cy, W, H) {
  ctx.globalAlpha = 0.16; ctx.fillStyle = '#7fd0ff';
  for (let x = -(cx % TILE); x < W; x += TILE) ctx.fillRect(x, 0, 1, H);
  for (let y = -(cy % TILE); y < H; y += TILE) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
}

function drawChunkBounds(cx, cy, W, H) {
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff7fd0';
  for (let x = -(cx % CHUNK_PX); x < W; x += CHUNK_PX) ctx.fillRect(x, 0, 1, H);
  for (let y = -(cy % CHUNK_PX); y < H; y += CHUNK_PX) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
}
