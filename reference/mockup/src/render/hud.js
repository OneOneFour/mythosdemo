import { H, R, W, ctx, glow } from '../core/canvas.js';
import { drawText, textWidth } from '../core/font.js';
import { P } from '../core/palette.js';
import { clock, drops } from '../sim/state.js';
import { BANDS, SURFACE_Y, WORLD_H, bandAt } from '../world/config.js';
import { CAGES } from '../world/layout.js';


/* ============================================================
   HUD — pixel panels, all fake
   ============================================================ */
export function panel(x, y, w, h) {
  ctx.globalAlpha = 0.82; R(ctx, x, y, w, h, P.uiBack); ctx.globalAlpha = 1;
  R(ctx, x, y, w, 1, P.uiDim); R(ctx, x, y + h - 1, w, 1, P.uiDim);
  R(ctx, x, y, 1, h, P.uiDim); R(ctx, x + w - 1, y, 1, h, P.uiDim);
  R(ctx, x + 1, y + 1, 2, 1, P.ui); R(ctx, x + 1, y + 1, 1, 2, P.ui);
  R(ctx, x + w - 3, y + h - 2, 2, 1, P.ui); R(ctx, x + w - 2, y + h - 3, 1, 2, P.ui);
}

export function bar(x, y, w, frac, col, back = '#241f1a') {
  R(ctx, x, y, w, 3, back);
  R(ctx, x, y, Math.max(0, Math.min(w, (w * frac) | 0)), 3, col);
}

export const QUOTA = [
  { name: 'DIVINE PLATE',  have: 14, need: 20, col: '#e6d9a8' },
  { name: 'BOTTLED AMBROSIA', have: 1, need: 3, col: '#b06fe0' },
  { name: 'REFINED ICHOR', have: 0,  need: 2, col: P.ichor }
];

export const FAVOUR = [
  { name: 'ZEUS',        v: 0.62, col: '#ecebee' },
  { name: 'POSEIDON',    v: 0.34, col: '#57abda' },
  { name: 'HEPHAESTUS',  v: 0.81, col: '#ff8c22' },
  { name: 'HADES',       v: 0.12, col: '#a06fd6' }
];

export const BOONS = [
  { n: 'COUNTERWEIGHT',  d: 'LIFT COST -18%', col: '#ecebee' },
  { n: 'BLOOD WINCH',    d: 'NO FUEL / DRAWS BLOOD', col: '#c04a4a' },
  { n: 'COLD SLUSH TAP', d: 'COOLANT +2 / MIN', col: '#8ed2f2' }
];

export function drawHUD(cy) {
  const mid = cy + H / 2;
  const band = bandAt(mid);
  const depth = Math.max(0, Math.round((mid - SURFACE_Y) * 0.8));

  /* layout decisions for narrow viewports */
  const gaugeW = W < 260 ? 40 : 52;
  const gaugeX = W - gaugeW - 6;
  const stackPanels = W < 240;                       // favour drops below tribute
  const maxBoons = Math.max(0, Math.min(BOONS.length,
                    Math.floor((gaugeX - 12) / 62)));

  /* tribute panel, top left */
  const pw = 104, ph = 58;
  panel(6, 6, pw, ph);
  drawText(ctx, 'CYCLE 4 TRIBUTE', 11, 11, P.ui);
  R(ctx, 11, 20, pw - 10, 1, P.uiDim);
  QUOTA.forEach((q, i) => {
    const y = 24 + i * 11;
    R(ctx, 11, y + 1, 3, 3, q.col);
    drawText(ctx, q.name.slice(0, 13), 17, y, q.have >= q.need ? '#7fd36b' : P.ui);
    const s = q.have + '/' + q.need;
    drawText(ctx, s, 6 + pw - 4 - textWidth(s), y, q.have >= q.need ? '#7fd36b' : P.uiDim);
  });
  const remain = 0.42 + 0.02 * Math.sin(clock.t * 0.6);
  bar(11, 52, pw - 16, remain, remain < 0.2 ? '#c04a4a' : '#c9a34a');

  /* favour panel — top right, or stacked underneath on narrow screens */
  const fw = 96, fh = 50;
  const fx = stackPanels ? 6 : W - fw - 6;
  const fy = stackPanels ? 6 + ph + 4 : 6;
  panel(fx, fy, fw, fh);
  drawText(ctx, 'FAVOUR', fx + 5, fy + 5, P.ui);
  R(ctx, fx + 5, fy + 14, fw - 10, 1, P.uiDim);
  FAVOUR.forEach((f, i) => {
    const y = fy + 18 + i * 7;
    const known = f.name !== 'HADES' || cy > 1600;
    drawText(ctx, known ? f.name : '????????', fx + 5, y, known ? P.ui : P.uiDim);
    bar(fx + 56, y + 2, 34, known ? f.v : 0, f.col);
  });

  /* boon hand, bottom left */
  const by = H - 44;
  BOONS.slice(0, maxBoons).forEach((b, i) => {
    const x = 6 + i * 62;
    panel(x, by, 58, 38);
    R(ctx, x + 2, by + 2, 54, 12, '#1a1622');
    R(ctx, x + 24, by + 5, 6, 6, b.col);
    glow(ctx, x + 27, by + 8, 12, b.col, 0.34);
    drawText(ctx, b.n.slice(0, 9), x + 4, by + 17, P.ui);
    const words = b.d.split(' ');
    let line = '', ly = by + 26;
    for (const wd of words) {
      if (textWidth(line + ' ' + wd) > 50) { drawText(ctx, line, x + 4, ly, P.uiDim); line = wd; ly += 7; }
      else line = line ? line + ' ' + wd : wd;
    }
    drawText(ctx, line, x + 4, ly, P.uiDim);
  });

  /* depth gauge, right edge */
  const gx = gaugeX, gy0 = 66, gyH = Math.max(40, H - 120);
  panel(gx, gy0, gaugeW, gyH + 26);
  drawText(ctx, 'DEPTH', gx + 5, gy0 + 5, P.ui);
  const trackX = gx + 8, trackY = gy0 + 16;
  R(ctx, trackX, trackY, 2, gyH, '#241f1a');
  BANDS.forEach((b) => {
    const f0 = b.y0 / WORLD_H, f1 = b.y1 / WORLD_H;
    const y = trackY + gyH * f0, hh = Math.max(2, gyH * (f1 - f0));
    R(ctx, trackX, y, 2, hh, bandColour(b.name));
    const active = mid >= b.y0 && mid < b.y1;
    drawText(ctx, b.act, trackX + 5, y + hh / 2 - 3, active ? P.ui : P.uiDim);
  });
  const mk = trackY + gyH * (mid / WORLD_H);
  R(ctx, trackX - 3, mk - 1, 8, 3, P.ui);
  R(ctx, trackX - 5, mk, 2, 1, P.ui);
  drawText(ctx, band.name.slice(0, 8), gx + 5, gy0 + gyH + 18, P.ui);
  drawText(ctx, depth + 'M', gx + 5, gy0 + gyH + 10, P.uiDim);

  /* suspicion, bottom right — rises with depth */
  const sus = Math.max(0, Math.min(1, (mid - 1500) / 900));
  const sw = 92, sx = Math.max(6, W - sw - 6), sy = H - 20;
  if (W >= 200) {
    panel(sx, sy, sw, 14);
    drawText(ctx, 'SUSPICION', sx + 4, sy + 4, sus > 0.7 ? '#c04a4a' : P.ui);
    bar(sx + 58, sy + 5, 30, sus, sus > 0.7 ? '#c04a4a' : '#c9a34a');
  }

  /* throughput readout, bottom centre — dropped if it would collide */
  const ore = 12 + ((Math.sin(clock.t * 0.7) * 3) | 0);
  const fuel = 68 + ((Math.sin(clock.t * 0.4) * 6) | 0);
  const rising = CAGES.filter(c => c.dir < 0 && c.wait <= 0).length;
  const lift = rising + '/' + CAGES.length + ' RISING';
  let tp = 'ORE ' + ore + '/MIN   LIFT ' + lift + '   FUEL ' + fuel + '%';
  if (textWidth(tp) > W - 210) tp = 'LIFT ' + lift + '   FUEL ' + fuel + '%';
  if (textWidth(tp) <= W - 210) drawText(ctx, tp, (W - textWidth(tp)) / 2, H - 12, P.uiDim);
}

export function bandColour(n) {
  return { 'THE HEAVENS': P.cloudA, 'THE DIG SITE': P.grassA, 'PALE LIMESTONE': P.limeA,
           'OCHRE STRATA': P.ochreA, 'THE AQUIFER': P.watC, 'BASALT & BRINE': P.lavaB,
           'THE ABYSS': P.vio, 'GATES OF HADES': P.hadC }[n] || P.ui;
}

export function drawTitle(a) {
  ctx.globalAlpha = a * 0.72; R(ctx, 0, 0, W, H, '#07060a'); ctx.globalAlpha = 1;
  const sc = W < 340 ? 2 : 3;
  const l1 = 'UNDERGROUND', l2 = 'MYTHOS FACTORY', l3 = 'A GRAVITY-FED ROGUELIKE';
  ctx.globalAlpha = a;
  drawText(ctx, l1, (W - textWidth(l1, sc, sc)) / 2, H / 2 - 32, '#c9a34a', sc, sc);
  drawText(ctx, l2, (W - textWidth(l2, sc, sc)) / 2, H / 2 - 32 + 7 * sc + 6, P.ui, sc, sc);
  R(ctx, (W - 120) / 2, H / 2 + 14 + 7 * sc, 120, 1, P.uiDim);
  drawText(ctx, l3, (W - textWidth(l3)) / 2, H / 2 + 22 + 7 * sc, P.uiDim);
  ctx.globalAlpha = 1;
}
