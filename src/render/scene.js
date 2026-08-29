import { H, R, W, ctx, glow } from '../core/canvas.js';
import { P } from '../core/palette.js';
import { hash2 } from '../core/rng.js';
import { drawCages, drawCarts, drawChips, drawDrops, drawImpacts, drawMines, drawPiles, drawStations } from './entities.js';
import { drawHUD, drawTitle } from './hud.js';
import { cam, clock, drips, dust, smoke, view } from '../sim/state.js';
import { world } from '../world/build.js';
import { LAVA_Y, WATER_Y } from '../world/config.js';
import { EYES, FALLS, LAVAFALLS } from '../world/layout.js';
import { puff } from '../world/strata.js';

export function render() {
  const cy = Math.round(cam.y);
  ctx.drawImage(world, 0, cy, W, H, 0, 0, W, H);

  for (const f of FALLS) {
    if (f.y + f.h < cy - 20 || f.y > cy + H + 20) continue;
    fallColumn(f, cy, [P.watD, P.watC, P.watB, P.watA], 90);
  }
  const shelfY = WATER_Y - cy;
  if (shelfY > -60 && shelfY < H)
    for (let i = 0; i < 3; i++) {
      const yy = shelfY + 1 + i * 2, off = Math.sin(clock.t * 1.4 + i * 1.9) * 5;
      for (let x = 0; x < W; x += 6)
        R(ctx, x + ((off + Math.sin(x * 0.3 + clock.t * 2) * 2) | 0), yy, 3, 1,
          i === 0 ? P.watA : P.watB);
    }

  for (const f of LAVAFALLS) {
    if (f.y + f.h < cy - 20 || f.y > cy + H + 20) continue;
    fallColumn(f, cy, [P.lavaD, P.lavaC, P.lavaB, P.lavaA], 34);
    glow(ctx, f.x, f.y + f.h - cy, 26, P.lavaB, 0.5 + 0.12 * Math.sin(clock.t * 3));
  }
  const lakeY = LAVA_Y - cy;
  if (lakeY > -60 && lakeY < H) {
    for (let i = 0; i < 4; i++) {
      const yy = lakeY + i * 2, off = Math.sin(clock.t * 0.8 + i * 2.2) * 8;
      for (let x = 0; x < W; x += 5)
        R(ctx, x + ((off + Math.sin(x * 0.2 + clock.t * 1.4) * 3) | 0), yy, 3, 1,
          i < 2 ? P.lavaA : P.lavaB);
    }
    glow(ctx, W / 2, lakeY + 8, W * 0.75, '#ff6a10', 0.3 + 0.05 * Math.sin(clock.t * 2.2));
  }

  drawStations(cy);
  drawPiles(cy);
  drawMines(cy);
  drawCarts(cy);
  drawCages(cy);
  drawDrops(cy);
  drawImpacts(cy);
  drawChips(cy);

  for (const e of EYES) {
    const y = e.y - cy;
    if (y < -10 || y > H + 10) continue;
    if (Math.sin(clock.t * 0.9 + e.ph) > -0.2) {
      R(ctx, e.x, y, e.s, e.s, e.hue);
      R(ctx, e.x + e.s * 3, y, e.s, e.s, e.hue);
      glow(ctx, e.x + e.s * 2, y, 14 + e.s * 3, e.hue, 0.3);
    }
  }

  for (const s of smoke) {
    const y = s.y - cy;
    if (y < -20 || y > H + 20) continue;
    ctx.globalAlpha = Math.max(0, Math.min(0.5, s.life * 0.22));
    R(ctx, s.x - s.r, y - s.r, s.r * 2, s.r * 2, '#1c1720');
    ctx.globalAlpha = 1;
  }
  for (const d of dust)  { const y = d.y - cy; if (y > -4 && y < H + 4) R(ctx, d.x, y, 1, 1, d.col); }
  for (const d of drips) { const y = d.y - cy; if (y > -4 && y < H + 4) R(ctx, d.x, y, 1, 1, P.watA); }

  if (cy < 320)
    for (let i = 0; i < 26; i++) {
      const sp = 3 + (i % 4) * 2.5;
      const x = ((hash2(i, 2001) * (W + 200) + clock.t * sp) % (W + 200)) - 100;
      const y = 120 + hash2(i, 2003) * 190 - cy;
      if (y < -40 || y > H) continue;
      ctx.globalAlpha = 0.5;
      puff(ctx, x | 0, y | 0, (12 + hash2(i, 2007) * 22) | 0, P.cloudA);
      ctx.globalAlpha = 1;
    }

  ambient(cy);
  vignette();
  if (view.showGrid) grid();
  drawHUD(cy);
  if (view.titleFade > 0) drawTitle(view.titleFade);
}

export function fallColumn(f, cy, cols, speed) {
  const yTop = f.y - cy;
  for (let i = 0; i < f.h; i++) {
    const y = yTop + i;
    if (y < 0 || y >= H) continue;
    const wob = Math.round(Math.sin(i * 0.24 + clock.t * 2.2 + f.x) * 1.2);
    const band = ((i * 0.7 + clock.t * speed) | 0) % 4;
    R(ctx, f.x - f.w / 2 + wob, y, f.w, 1, cols[band]);
  }
}

export function ambient(cy) {
  const mid = cy + H / 2;
  let col = null, a = 0;
  if (mid > 1010 && mid <= 1330)      { col = '#123048'; a = 0.16; }
  else if (mid > 1330 && mid <= 1740) { col = '#3a0c0c'; a = 0.2;  }
  else if (mid > 1740 && mid <= 2180) { col = '#05040a'; a = 0.34; }
  else if (mid > 2180)                { col = '#020104'; a = 0.46; }
  if (col) { ctx.globalAlpha = a; R(ctx, 0, 0, W, H, col); ctx.globalAlpha = 1; }
  if (cy < 460) {
    const g2 = ctx.createLinearGradient(0, 0, 0, Math.max(1, 460 - cy));
    g2.addColorStop(0, 'rgba(255,246,214,0.30)');
    g2.addColorStop(1, 'rgba(255,246,214,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, Math.max(0, 460 - cy));
  }
}

export function vignette() {
  const g2 = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3,
                                      W / 2, H / 2, Math.max(W, H) * 0.78);
  g2.addColorStop(0, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
}

export function grid() {
  ctx.globalAlpha = 0.14; ctx.fillStyle = '#7fd0ff';
  for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
}
