/* core layer — integer-pixel drawing primitives. Depends only on
   `core/rng.js`, touches no `document`, and floors every coordinate here, so
   no caller can reach a sub-pixel. */

import { mulberry } from './rng.js';

/* Shared light direction in canvas axes (y-down), pointing the way light
   travels, so the sun is up and to the left and a surface whose outward normal
   opposes it is lit. Integer components keep shading a comparison. */
export const LIGHT = Object.freeze({ x: 1, y: 1, fromX: -1, fromY: -1 });

/* Minimum size 1: a rect rounded to zero width is a silent missing pixel. */
export const R = (g, x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
};

/* Bresenham. */
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

/* Speckle a rect from a local generator seeded by the caller, so a repaint
   consumes none of the run's `rand()` stream. */
export function noiseFill(g, x0, y0, w, h, cols, density, seed, blk = 1) {
  const r = mulberry(seed);
  for (let y = y0; y < y0 + h; y += blk)
    for (let x = x0; x < x0 + w; x += blk)
      if (r() < density) R(g, x, y, blk, blk, cols[(r() * cols.length) | 0]);
}

/* A drunken downward walk from a caller-seeded generator; cracks, roots and
   mineral seams. */
export function walk(g, x, y, len, col, seed, dxBias = 0, thick = 1) {
  const r = mulberry(seed);
  for (let i = 0; i < len; i++) {
    R(g, x, y, thick, thick, col);
    y += r() < 0.72 ? 1 : 0;
    x += (r() < 0.5 + dxBias ? 1 : -1) * (r() < 0.3 ? 2 : 1);
  }
}

/* Additive radial light, the one non-integer draw here; it shifts no
   geometry. Leaves `g`'s composite, alpha and fill as it found them. */
export function glow(g, x, y, r, col, a = 0.5) {
  if (!(r > 0)) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
