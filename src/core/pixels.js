/* LAYER core — integer-pixel drawing primitives.
   Depends only on `core/rng.js`. May be imported by every layer.

   Every coordinate is floored HERE, so there is no path to a sub-pixel
   anywhere in the renderer. Nothing in this file knows what it is drawing:
   these take a 2D context and numbers, never a substance or a machine.

   Ported near-verbatim from the previous codebase's `core/canvas.js`, split out
   from the viewport so that a headless tool can import the drawing helpers
   without touching `document`. */

import { mulberry } from './rng.js';

/* Minimum size 1: a rect rounded to zero width is a silent missing pixel. */
export const R = (g, x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
};

/* Bresenham. Used for ladders, cables and the depth gauge. */
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

/* Speckle a rect from a local generator seeded by the caller. Seeded and not
   `rand()`, so a repaint consumes no run randomness — ARCHITECTURE invariant 7. */
export function noiseFill(g, x0, y0, w, h, cols, density, seed, blk = 1) {
  const r = mulberry(seed);
  for (let y = y0; y < y0 + h; y += blk)
    for (let x = x0; x < x0 + w; x += blk)
      if (r() < density) R(g, x, y, blk, blk, cols[(r() * cols.length) | 0]);
}

/* A drunken downward walk. Cracks, roots and mineral seams are this. */
export function walk(g, x, y, len, col, seed, dxBias = 0, thick = 1) {
  const r = mulberry(seed);
  for (let i = 0; i < len; i++) {
    R(g, x, y, thick, thick, col);
    y += r() < 0.72 ? 1 : 0;
    x += (r() < 0.5 + dxBias ? 1 : -1) * (r() < 0.3 ? 2 : 1);
  }
}

/* The one non-integer effect in the project, and it is additive light rather
   than geometry, so it cannot produce a half-pixel edge. */
export function glow(g, x, y, r, col, a = 0.5) {
  if (!(r > 0)) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
