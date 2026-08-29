import { CX, H, R, ctx, glow, lineTo } from '../core/canvas.js';
import { drawText, textWidth } from '../core/font.js';
import { P } from '../core/palette.js';
import { hash2 } from '../core/rng.js';
import { carts, chips, clock, drops, impacts } from '../sim/state.js';
import { CAGES, MINES, PILES, STATIONS } from '../world/layout.js';

export function drawPiles(cy) {
  for (const p of PILES) {
    const y = p.y - cy;
    if (y < -30 || y > H + 20) continue;
    if (p.crate) drawCrateStack(p, y); else drawHeap(p, y);
    if (p.n >= p.cap) {
      const tag = 'FULL';
      const tx = p.x - textWidth(tag) / 2;
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(clock.t * 4);
      drawText(ctx, tag, tx, y - p.maxH - 11, '#e06a5a');
      ctx.globalAlpha = 1;
    }
  }
}

export function drawHeap(p, y) {
  if (p.n <= 0) return;
  const frac = p.n / p.cap;
  const rows = Math.max(1, Math.ceil(frac * p.maxH));
  for (let r = 0; r < rows; r++) {
    const half = (p.w / 2) * (1 - r / (rows + 0.6));
    for (let i = -half; i <= half; i++) {
      const px = (p.x + i) | 0;
      if (hash2(px, (p.y + r) | 0) < 0.14) continue;      // ragged edge
      R(ctx, px, y - 3 - r, 1, 1, hash2(px, r * 7) < 0.32 ? p.col2 : p.col);
    }
  }
}

export function drawCrateStack(p, y) {
  for (let i = 0; i < p.n; i++) {
    const col = i % 2, row = (i / 2) | 0;
    const bx = p.x + col * 8, by = y - 4 - row * 7;
    R(ctx, bx, by, 7, 6, P.cuC);
    R(ctx, bx, by, 7, 1, P.cuA);
    R(ctx, bx + 2, by + 2, 3, 3, p.col);
  }
}

export function drawCarts(cy) {
  for (const c of carts) {
    const y = c.y - cy;
    if (y < -8 || y > H + 8) continue;
    R(ctx, c.x - 3, y - 4, 7, 4, P.irC);                  // tub
    R(ctx, c.x - 3, y - 4, 7, 1, P.irB);
    R(ctx, c.x - 2, y - 5, 5, 1, c.col);                  // heaped load
    R(ctx, c.x - 2, y, 2, 2, P.irD);                      // wheels
    R(ctx, c.x + 1, y, 2, 2, P.irD);
  }
}

export function drawDrops(cy) {
  for (const d of drops) {
    const y = d.y - cy;
    if (y < -30 || y > H + 10) continue;
    if (d.streak) {
      const len = Math.min(16, (d.vy * 0.035) | 0);
      for (let k = 1; k <= len; k++) {
        ctx.globalAlpha = 0.42 * (1 - k / (len + 1));
        R(ctx, d.x + (k & 1), y - k, Math.max(1, d.size - 1), 1, d.col);
      }
      ctx.globalAlpha = 1;
    }
    R(ctx, d.x, y, d.size, d.size, d.col);
    R(ctx, d.x, y, 1, 1, '#fff3d0');
  }
}

export function drawChips(cy) {
  for (const c of chips) {
    const y = c.y - cy;
    if (y > -6 && y < H + 6) R(ctx, c.x, y, 1, 1, c.col);
  }
}

export function drawImpacts(cy) {
  for (const im of impacts) {
    const y = im.y - cy;
    if (y < -24 || y > H + 24) continue;
    const p = 1 - im.life / im.max;
    if (im.type === 'lava') {
      glow(ctx, im.x, y, 8 + (1 - p) * 26, P.lavaA, 0.75 * (1 - p));
      const r = 3 + p * 20;
      for (let a = 0; a < 12; a++) {
        const th = a / 12 * 6.283;
        R(ctx, im.x + Math.cos(th) * r, y + Math.sin(th) * r * 0.35, 2, 1,
          p < 0.4 ? '#fff2c0' : P.lavaB);
      }
    } else if (im.type === 'burst') {
      const r = 2 + p * 8;
      for (let a = 0; a < 7; a++) {
        const th = a / 7 * 6.283;
        R(ctx, im.x + Math.cos(th) * r, y + Math.sin(th) * r, 1, 1, im.col);
      }
    } else {
      ctx.globalAlpha = 1 - p;
      const r = 2 + p * 9;
      R(ctx, im.x - r, y - 1, r * 2, 1, im.col);
      R(ctx, im.x - (r >> 1), y - 3, r, 1, im.col);
      ctx.globalAlpha = 1;
    }
  }
}

export function drawStations(cy) {
  for (const s of STATIONS) {
    const y = s.y - cy, top = s.y - s.h - cy;
    if (y < -50 || top > H + 40) continue;
    if (s.liquid) {                                       // working fluid
      const lw = s.w - 8, lh = Math.max(3, s.h - 12);
      const bx = s.x + 4, by = top + 6;
      R(ctx, bx, by, lw, lh, s.liquid);
      R(ctx, bx, by - 1 + Math.round(Math.sin(clock.t * 2.4 + s.x)), lw, 2, '#ffffff');
      if (!s.starved)
        for (let i = 0; i < (s.hot ? 6 : 4); i++) {
          const ph = (clock.t * (s.hot ? 1.5 : 0.9) + i * 0.31 + s.x * 0.01) % 1;
          R(ctx, bx + 2 + ((hash2(i, s.x) * (lw - 4)) | 0), by + lh * (1 - ph), 2, 2, '#ffffff');
        }
      glow(ctx, s.x + s.w / 2, top + s.h / 2, 20, s.liquid,
           (s.starved ? 0.12 : 0.34) + 0.06 * Math.sin(clock.t * 3 + s.x));
    }
    if (s.fire > 0.05) {                                  // firebox flare
      R(ctx, s.x + 5, y - 3, s.w - 10, 3, P.lavaB);
      glow(ctx, s.x + s.w / 2, y - 1, 16, P.lavaB, s.fire * 0.5);
    }
    if (s.starved) {
      const tag = 'STARVED';
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock.t * 3);
      drawText(ctx, tag, s.x + s.w / 2 - textWidth(tag) / 2, top - 11, '#e0a24a');
      ctx.globalAlpha = 1;
    }
  }
}

export function drawCages(cy) {
  const bx = CX + 4;                                      // cages ride the right half
  for (const c of CAGES) {
    // chain from this stage's drum down to the cage
    for (let yy = c.top + 8; yy < c.y; yy += 4) {
      const sy = yy - cy;
      if (sy < -4 || sy > H) continue;
      R(ctx, bx + 7, sy, 2, 3, P.irB);
      R(ctx, bx + 6, sy + 1, 4, 1, P.irA);
    }
    const y = c.y - cy;
    if (y < -40 || y > H + 40) continue;
    R(ctx, bx, y, 18, 3, P.irC);
    R(ctx, bx, y, 18, 1, P.irA);
    R(ctx, bx + 1, y + 3, 2, 14, P.irB);
    R(ctx, bx + 15, y + 3, 2, 14, P.irB);
    R(ctx, bx, y + 15, 18, 4, P.woodA);
    R(ctx, bx, y + 19, 18, 2, P.woodC);
    R(ctx, bx + 3, y + 19, 12, 4, P.irD);                 // burner
    R(ctx, bx + 4, y + 20, 10, 2, c.dir < 0 ? P.lavaB : P.lavaD);
    if (c.dir < 0) glow(ctx, bx + 9, y + 21, 17, P.lavaB, 0.42);
    for (let i = 0; i < c.load; i++) {
      const cx2 = bx + 2 + (i % 2) * 5, cy2 = y + 9 - ((i / 2) | 0) * 4;
      R(ctx, cx2, cy2, 4, 4, P.cuC);
      R(ctx, cx2, cy2, 4, 1, P.cuA);
    }
    // counterweight on the left half, moving opposite
    const cw = c.top + (c.bot - c.top) - (c.y - c.top);
    const cwy = cw - cy;
    if (cwy > -12 && cwy < H + 12) {
      R(ctx, CX - 20, cwy, 6, 10, P.irD);
      R(ctx, CX - 20, cwy, 6, 2, P.irB);
    }
  }
}

export function drawMines(cy) {
  for (const m of MINES) {
    const y = m.y - cy;
    if (y < -50 || y > H + 50) continue;
    const fx = m.x + m.dir * 10;
    for (let s = 0; s < m.stage; s++) {
      let cxp = fx, cyp = y + 2 - 3 + s * 2;
      for (let k = 0; k < 6 + s * 2; k++) {
        R(ctx, cxp, cyp, 1, 1, 'rgba(0,0,0,0.45)');
        cxp += m.dir; cyp += hash2(m.x + s, k) < 0.5 ? 1 : -1;
      }
    }
    if (m.manual) drawMiner(m, y); else drawArm(m, y);
    if (m.flash > 0) glow(ctx, fx, y + 2, 11, '#fff2c0', m.flash * 2.2);
  }
}

export function drawArm(m, y) {
  const px = m.x, py = y, a = m.ang, d = m.dir;
  R(ctx, px - 2, py - 6, 4, 13, P.irC);
  R(ctx, px - 2, py - 6, 4, 1, P.irA);
  const ex = px + Math.cos(a) * 8 * d, ey = py + Math.sin(a) * 8;
  const tx = ex + Math.cos(a + 0.75) * 8 * d, ty = ey + Math.sin(a + 0.75) * 8;
  lineTo(ctx, px, py, ex | 0, ey | 0, P.irB, 2);
  lineTo(ctx, px + 1, py + 4, ex | 0, ey | 0, P.cuC, 1);
  lineTo(ctx, ex | 0, ey | 0, tx | 0, ty | 0, P.irC, 2);
  R(ctx, ex - 1, ey - 1, 3, 3, P.irA);
  R(ctx, tx - 1, ty - 1, 3, 3, P.irA);
}

export function drawMiner(m, y) {
  drawFigure(ctx, m.x - 3, y - 9, clock.t);
  const a = m.ang, d = m.dir;
  const hx = m.x + 4 * d, hy = y - 2;
  const tx = hx + Math.cos(a) * 10 * d, ty = hy + Math.sin(a) * 10;
  lineTo(ctx, hx, hy, tx | 0, ty | 0, P.woodB, 1);
  R(ctx, tx - 1, ty - 1, 3, 2, P.irA);
}

export function drawFigure(g, x, y, t) {
  const bob = Math.sin(t * 2.2) < 0 ? 0 : 1;
  y -= bob;
  R(g, x + 2, y, 3, 3, '#c9a37e');
  R(g, x + 2, y - 1, 3, 1, '#3b2a1c');
  R(g, x + 1, y + 3, 5, 5, '#8e8b80');
  R(g, x, y + 4, 1, 3, '#c9a37e');
  R(g, x + 6, y + 4, 1, 3, '#c9a37e');
  R(g, x + 1, y + 8, 2, 3, '#c9a37e');
  R(g, x + 4, y + 8, 2, 3, '#c9a37e');
}
