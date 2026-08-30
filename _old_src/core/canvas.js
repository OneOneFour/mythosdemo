import { mulberry } from './rng.js';


/* ============================================================
   VIEWPORT

   The one structural departure from the mockup: the world has its
   own fixed coordinate space and the canvas is only a window onto
   it. Resizing changes VIEW, never the world.
   ============================================================ */
export const cv  = typeof document !== 'undefined' ? document.getElementById('stage') : null;
export const ctx = cv ? cv.getContext('2d', { alpha: false }) : null;

/* Base resolution in world pixels. VIEW.w/h are how much world is
   visible; SCALE is the nearest-neighbour upscale factor. */
export const VIEW = { w: 320, h: 180, scale: 3 };

export function resize() {
  const iw = (typeof window !== 'undefined' ? window.innerWidth  : 1600) || 1600;
  const ih = (typeof window !== 'undefined' ? window.innerHeight : 900)  || 900;
  VIEW.scale = Math.max(2, Math.min(6, Math.round(ih / 400)));
  VIEW.w = Math.max(200, Math.ceil(iw / VIEW.scale));
  VIEW.h = Math.max(180, Math.ceil(ih / VIEW.scale));
  if (!cv) return;
  cv.width = VIEW.w; cv.height = VIEW.h;
  cv.style.width  = (VIEW.w * VIEW.scale) + 'px';
  cv.style.height = (VIEW.h * VIEW.scale) + 'px';
  ctx.imageSmoothingEnabled = false;
}


/* ---------- offscreen canvases (chunks, sprite sheets) ---------- */
export function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { canvas: c, g };
}


/* ---------- integer-pixel drawing helpers ----------
   Every coordinate is floored here so there is no path to a
   sub-pixel anywhere in the renderer. */
export const R = (g, x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
};

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
  for (let y = y0; y < y0 + h; y += blk)
    for (let x = x0; x < x0 + w; x += blk)
      if (rng() < density) R(g, x, y, blk, blk, cols[(rng() * cols.length) | 0]);
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
  if (!(r > 0)) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
