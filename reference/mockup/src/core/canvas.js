import { mulberry } from './rng.js';
import { buildWorld, world } from '../world/build.js';
import { layoutContent } from '../world/layout.js';


/* ============================================================
   UNDERGROUND MYTHOS FACTORY — non-interactive visual mockup
   Rendered at low internal resolution, upscaled nearest-neighbour.
   Nothing simulates anything. It is all for looking at.
   ============================================================ */
export const cv  = document.getElementById("stage");

export const ctx = cv.getContext("2d", { alpha: false });


/* ---------- pixel scaling ---------- */
export let SCALE = 3, W = 480, H = 380;


// Sizes the canvas and fixes the shaft centre. Does NOT build the world:
// buildWorld() depends on the content tables, so the caller must run
// resize() -> layoutContent() -> buildWorld() in that order.
export function resize() {
  SCALE = Math.max(2, Math.min(6, Math.round(window.innerHeight / 400)));
  W = Math.max(200, Math.ceil(window.innerWidth  / SCALE));
  H = Math.max(200, Math.ceil(window.innerHeight / SCALE));
  cv.width = W; cv.height = H;
  cv.style.width  = (W * SCALE) + "px";
  cv.style.height = (H * SCALE) + "px";
  ctx.imageSmoothingEnabled = false;
  CX = Math.round(W * 0.52);
}

export let CX = 240;                    // centre of the main elevator shaft


/* ---------- small drawing helpers (integer pixels only) ---------- */
export const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); };

export function lineTo(g, x0, y0, x1, y1, c, thick = 1) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  g.fillStyle = c;
  for (;;) {
    g.fillRect(x0, y0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = err << 1;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
  }
}

export function noiseFill(g, x0, y0, w, h, cols, density, seed, blk = 1) {
  const rng = mulberry(seed);
  for (let y = y0; y < y0 + h; y += blk) {
    for (let x = x0; x < x0 + w; x += blk) {
      if (rng() < density) R(g, x, y, blk, blk, cols[(rng() * cols.length) | 0]);
    }
  }
}

export function walk(g, x, y, len, col, seed, dxBias = 0, thick = 1) {
  const rng = mulberry(seed);
  for (let i = 0; i < len; i++) {
    R(g, x, y, thick, thick, col);
    y += rng() < 0.72 ? 1 : 0;
    x += (rng() < 0.5 + dxBias ? 1 : -1) * (rng() < 0.3 ? 2 : 1);
  }
}

export function glow(g, x, y, r, col, a = 0.5) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
