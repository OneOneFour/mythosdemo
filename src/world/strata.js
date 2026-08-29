import { CX, R, W, lineTo, noiseFill, walk } from '../core/canvas.js';
import { drawText, textWidth } from '../core/font.js';
import { P, mix } from '../core/palette.js';
import { hash2 } from '../core/rng.js';
import { SURFACE_Y, WORLD_H } from './config.js';


/* --- heavens --- */
export function drawHeavens(g) {
  for (let y = 0; y < 300; y++) {
    const t = y / 300;
    const c = mix(P.skyHi, P.skyLo, Math.pow(t, 0.7));
    R(g, 0, y, W, 1, c);
  }
  // distant temples on cloudbank
  const temples = [[0.10, 168, 42, 24], [0.30, 150, 30, 18], [0.52, 132, 54, 30],
                   [0.74, 156, 34, 20], [0.90, 174, 44, 26]];
  for (const [fx, ty, tw, th] of temples) temple(g, (W * fx) | 0, ty, tw, th);
  // cloudbank
  for (let i = 0; i < 90; i++) {
    const rx = hash2(i, 7), ry = hash2(i, 13), rr = hash2(i, 29);
    puff(g, (rx * (W + 120) - 60) | 0, (150 + ry * 150) | 0, (16 + rr * 34) | 0,
         rr < 0.4 ? P.cloudB : P.cloudA);
  }
  for (let i = 0; i < 40; i++) {
    const rx = hash2(i, 51), ry = hash2(i, 67), rr = hash2(i, 71);
    puff(g, (rx * (W + 120) - 60) | 0, (250 + ry * 70) | 0, (14 + rr * 26) | 0, P.cloudC);
  }
  // divine shaft of light down the middle
  const grd = g.createLinearGradient(0, 0, 0, 300);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(CX - 46, 0, 92, 300);
}

export function puff(g, x, y, r, c) {
  R(g, x - r, y - (r >> 1), r * 2, r, c);
  R(g, x - ((r * 0.7) | 0), y - r, (r * 1.4) | 0, r, c);
  R(g, x - r - 4, y - 2, r * 2 + 8, (r * 0.5) | 0, c);
}

export function temple(g, x, y, w, h) {
  R(g, x - w / 2 - 3, y + h, w + 6, 3, P.marbleC);      // stylobate
  R(g, x - w / 2, y + 6, w, h - 6, P.marbleB);
  for (let i = 0; i <= w; i += 5) R(g, x - w / 2 + i, y + 6, 2, h - 6, P.marbleA);
  R(g, x - w / 2 - 2, y + 2, w + 4, 5, P.marbleA);      // architrave
  for (let i = 0; i < h / 2; i++)                        // pediment
    R(g, x - (w / 2) + i * (w / h) + 2, y + 2 - i, w - i * 2 * (w / h) - 4, 1, P.marbleB);
}


/* --- surface --- */
export function drawSurface(g) {
  R(g, 0, 300, W, 40, P.skyLo);
  R(g, 0, SURFACE_Y - 6, W, 8, P.grassA);
  R(g, 0, SURFACE_Y + 2, W, 4, P.grassB);
  R(g, 0, SURFACE_Y + 6, W, 10, P.soil);
  noiseFill(g, 0, SURFACE_Y - 6, W, 22, [P.grassC, P.grassB], 0.14, 991);
  for (let x = 0; x < W; x += 2)                          // grass tufts
    if (hash2(x, 3) < 0.30) R(g, x, SURFACE_Y - 8, 1, 2, P.grassA);
  // olive trees
  for (let i = 0; i < 14; i++) {
    const x = (hash2(i, 101) * W) | 0;
    if (Math.abs(x - CX) < 70) continue;
    oliveTree(g, x, SURFACE_Y - 7, 8 + ((hash2(i, 103) * 6) | 0));
  }
  digSite(g, CX - 118, SURFACE_Y - 6);
}

export function oliveTree(g, x, y, s) {
  R(g, x, y - s, 2, s, P.woodC);
  const cols = [P.grassB, P.grassA, P.grassC];
  for (let i = 0; i < 26; i++) {
    const a = hash2(x + i, 17) * 6.283, r = hash2(x + i, 19) * s * 0.8;
    R(g, x + 1 + Math.cos(a) * r, y - s - 2 + Math.sin(a) * r * 0.7, 2, 2,
      cols[(hash2(x + i, 23) * 3) | 0]);
  }
}

export function digSite(g, x, y) {
  R(g, x - 4, y - 1, 46, 3, P.soil);                     // spoil heap
  for (let i = 0; i < 30; i++)
    R(g, x - 6 + hash2(i, 5) * 50, y - 3 - hash2(i, 9) * 3, 2, 2,
      hash2(i, 11) < 0.5 ? P.soil : P.ochreC);
  // timber headframe
  R(g, x + 6,  y - 22, 2, 22, P.woodB);
  R(g, x + 30, y - 22, 2, 22, P.woodB);
  R(g, x + 4,  y - 24, 30, 3, P.woodA);
  lineTo(g, x + 8, y - 21, x + 30, y - 3, P.woodC, 1);
  lineTo(g, x + 30, y - 21, x + 8, y - 3, P.woodC, 1);
  R(g, x + 16, y - 27, 8, 4, P.woodA);                   // winch housing
  R(g, x + 18, y - 30, 4, 3, P.irC);
  for (let i = 0; i < 5; i++) R(g, x + 36, y - 20 + i * 4, 8, 2, P.woodB); // ladder
}


/* --- limestone --- */
export function drawLimestone(g) {
  const y0 = 356, y1 = 640;
  R(g, 0, y0, W, y1 - y0, P.limeB);
  for (let y = y0; y < y1; y += 1) {
    const t = (y - y0) / (y1 - y0);
    R(g, 0, y, W, 1, mix(P.limeA, P.limeC, t * 0.8));
  }
  noiseFill(g, 0, y0, W, y1 - y0, [P.limeA, P.limeC], 0.10, 12, 2);
  noiseFill(g, 0, y0, W, y1 - y0, [P.limeD], 0.03, 13, 1);
  // bedding planes
  for (const by of [382, 410, 448, 496, 540, 588, 622]) {
    R(g, 0, by, W, 1, P.limeD);
    for (let x = 0; x < W; x += 3) if (hash2(x, by) < 0.4) R(g, x, by + 1, 3, 1, P.limeC);
  }
  // hairline fractures
  for (let i = 0; i < 26; i++)
    walk(g, (hash2(i, 211) * W) | 0, y0 + 12 + hash2(i, 213) * 250, 16 + hash2(i, 217) * 34,
         P.limeD, i * 31 + 5);
  friezeBand(g, 472);
  for (let i = 0; i < 5; i++) cave(g, (hash2(i, 301) * W) | 0, 400 + hash2(i, 307) * 200,
                                  18 + hash2(i, 311) * 22, 10 + hash2(i, 313) * 10, P.limeD, P.limeC, i);
}

export function friezeBand(g, y) {
  const TILE = ['11111111','10000100','10111101','10100101','10101101','10100001','11111111'];
  for (let x = -((CX) % 8); x < W; x += 8) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++)
      if (TILE[r][c] === '1') R(g, x + c, y + r, 1, 1, hash2(x, r) < 0.3 ? P.limeD : P.limeC);
  }
  R(g, 0, y - 2, W, 1, P.limeA); R(g, 0, y + 8, W, 1, P.limeA);
}


/* --- ochre --- */
export function drawOchre(g) {
  const y0 = 640, y1 = 1010;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    R(g, 0, y, W, 1, mix(P.ochreA, P.ochreD, Math.pow(t, 0.85)));
  }
  noiseFill(g, 0, y0, W, y1 - y0, [P.ochreB, P.ochreC], 0.16, 41, 2);
  noiseFill(g, 0, y0, W, y1 - y0, [P.ochreD, P.ochreA], 0.06, 43, 1);
  for (const by of [664, 700, 748, 806, 866, 928, 982]) {
    R(g, 0, by, W, 1, P.ochreD);
    for (let x = 0; x < W; x += 4) if (hash2(x, by) < 0.5) R(g, x, by - 1, 4, 1, P.ochreB);
  }
  // copper veins — the branching orange threads
  for (let i = 0; i < 22; i++) {
    const sx = (hash2(i, 401) * W) | 0, sy = y0 + 14 + hash2(i, 403) * 330;
    const len = 30 + hash2(i, 407) * 70, bias = hash2(i, 409) < 0.5 ? -0.12 : 0.12;
    walk(g, sx, sy, len, P.veinC, i * 17 + 1, bias, 2);
    walk(g, sx, sy, len, P.veinB, i * 17 + 1, bias, 1);
    walk(g, sx + 1, sy, len * 0.55, P.veinA, i * 17 + 2, bias, 1);
  }
  // ore pockets
  for (let i = 0; i < 16; i++)
    orePocket(g, (hash2(i, 501) * W) | 0, y0 + 24 + hash2(i, 503) * 320, i);
  for (let i = 0; i < 7; i++) cave(g, (hash2(i, 601) * W) | 0, y0 + 40 + hash2(i, 607) * 300,
                                  20 + hash2(i, 611) * 26, 12 + hash2(i, 613) * 12, P.ochreD, P.ochreC, i + 9);
}

export function orePocket(g, x, y, s) {
  for (let i = 0; i < 6; i++) {
    const ox = (hash2(s + i, 701) * 10 - 5) | 0, oy = (hash2(s + i, 703) * 8 - 4) | 0;
    R(g, x + ox - 1, y + oy - 1, 4, 4, P.veinC);
    R(g, x + ox, y + oy, 2, 2, P.veinA);
  }
}

export function cave(g, x, y, w, h, dark, edge, s) {
  for (let i = 0; i < h; i++) {
    const t = i / h, span = (w * Math.sqrt(1 - Math.pow(t * 2 - 1, 2))) | 0;
    R(g, x - span / 2, y + i - h / 2, span, 1, dark);
  }
  for (let i = 0; i < 18; i++)                            // rubble floor
    R(g, x - w / 2 + hash2(s + i, 801) * w, y + h / 2 - 2 - hash2(s + i, 803) * 2, 2, 2, edge);
}


/* --- aquifer --- */
export function drawAquifer(g) {
  const y0 = 1010, y1 = 1330;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    R(g, 0, y, W, 1, mix(P.aquA, P.aquC, Math.pow(t, 0.8)));
  }
  noiseFill(g, 0, y0, W, y1 - y0, [P.aquB, P.aquC], 0.17, 71, 2);
  noiseFill(g, 0, y0, W, y1 - y0, [P.watD], 0.02, 73, 1);
  R(g, 0, y0, W, 2, P.aquC);
  // the flooded shelf: a wide bright water table
  const shelf = 1108;
  R(g, 0, shelf, W, 46, P.watD);
  R(g, 0, shelf, W, 3, P.watB);
  R(g, 0, shelf + 3, W, 6, P.watC);
  noiseFill(g, 0, shelf, W, 46, [P.watC, P.watB], 0.10, 77, 2);
  // submerged pillars
  for (let i = 0; i < 9; i++) {
    const x = (hash2(i, 901) * W) | 0;
    if (Math.abs(x - CX) < 26) continue;
    R(g, x, shelf - 2, 5, 62, P.aquC);
    R(g, x, shelf - 2, 2, 62, P.aquB);
  }
  for (let i = 0; i < 5; i++) cave(g, (hash2(i, 907) * W) | 0, 1240 + hash2(i, 911) * 70,
                                  22 + hash2(i, 913) * 20, 12, P.aquC, P.aquB, i + 20);
}


/* --- basalt & brine --- */
export function drawBasalt(g) {
  const y0 = 1330, y1 = 1740;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    R(g, 0, y, W, 1, mix(P.basA, P.basD, Math.pow(t, 0.7)));
  }
  noiseFill(g, 0, y0, W, y1 - y0, [P.basB, P.basC], 0.20, 131, 2);
  noiseFill(g, 0, y0, W, y1 - y0, [P.basD], 0.07, 133, 1);
  R(g, 0, y0, W, 2, P.basD);
  // glowing seams
  for (let i = 0; i < 20; i++) {
    const sx = (hash2(i, 1001) * W) | 0, sy = y0 + 16 + hash2(i, 1003) * 360;
    walk(g, sx, sy, 24 + hash2(i, 1007) * 48, P.lavaD, i * 23 + 3, hash2(i, 1009) - 0.5, 2);
    walk(g, sx, sy, 18 + hash2(i, 1011) * 30, P.lavaC, i * 23 + 4, hash2(i, 1009) - 0.5, 1);
  }
  // lava lake, mirrored off the concept art
  const lake = 1652;
  R(g, 0, lake, W, 40, P.lavaD);
  R(g, 0, lake, W, 5, P.lavaB);
  R(g, 0, lake + 2, W, 3, P.lavaA);
  noiseFill(g, 0, lake + 5, W, 34, [P.lavaC, P.lavaB], 0.12, 137, 2);
  // basalt columns
  for (let i = 0; i < 12; i++) {
    const x = (hash2(i, 1101) * W) | 0;
    if (Math.abs(x - CX) < 30) continue;
    const h = 20 + hash2(i, 1103) * 40;
    R(g, x, lake - h, 6, h, P.basC);
    R(g, x, lake - h, 2, h, P.basB);
    R(g, x, lake - h, 6, 2, P.basA);
  }
  // brine pools
  for (const [bx, bw] of [[0.14, 40], [0.80, 52]]) {
    const x = (W * bx) | 0;
    R(g, x, 1500, bw, 8, '#7e8a2c'); R(g, x, 1500, bw, 3, '#a8b93c');
  }
}


/* --- abyss --- */
export function drawAbyss(g) {
  const y0 = 1740, y1 = 2180;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    R(g, 0, y, W, 1, mix(P.abyA, P.abyC, Math.pow(t, 0.6)));
  }
  noiseFill(g, 0, y0, W, y1 - y0, [P.abyB, '#221c2e'], 0.13, 171, 2);
  R(g, 0, y0, W, 2, P.abyC);
  // violet veins
  for (let i = 0; i < 16; i++) {
    const sx = (hash2(i, 1201) * W) | 0, sy = y0 + 20 + hash2(i, 1203) * 390;
    walk(g, sx, sy, 26 + hash2(i, 1207) * 44, P.vio, i * 29 + 7, hash2(i, 1209) - 0.5, 1);
  }
  // titan ribcages
  ribs(g, (W * 0.74) | 0, 1900, 62, 78, 1);
  ribs(g, (W * 0.20) | 0, 2060, 46, 58, 2);
  // stalactite fringe
  for (let x = 0; x < W; x += 3) {
    const d = (hash2(x, 1301) * 10) | 0;
    if (d > 2) R(g, x, y0 + 2, 2, d, P.abyC);
  }
  // fungal clumps
  for (let i = 0; i < 30; i++) {
    const x = (hash2(i, 1401) * W) | 0, y = y0 + 30 + hash2(i, 1403) * 400;
    R(g, x, y, 3, 2, '#2f6b63'); R(g, x + 1, y - 1, 1, 1, '#59b3a4');
  }
}

export function ribs(g, x, y, w, h, s) {
  R(g, x, y - h / 2, 3, h, P.boneD);                      // spine
  for (let i = 0; i < 7; i++) {
    const yy = y - h / 2 + 6 + i * (h / 7.4);
    const sp = w * (0.55 + 0.45 * Math.sin((i / 7) * Math.PI));
    for (let k = 0; k < sp; k++) {
      const cur = Math.pow(k / sp, 2) * 16;
      R(g, x - k, yy + cur, 2, 2, P.boneD);
      R(g, x + 3 + k, yy + cur, 2, 2, P.bone);
    }
  }
}


/* --- gates of hades --- */
export function drawHades(g) {
  const y0 = 2180, y1 = WORLD_H;
  R(g, 0, y0, W, y1 - y0, P.hadA);
  noiseFill(g, 0, y0, W, y1 - y0, ['#141126', '#0d0a18'], 0.09, 211, 2);
  R(g, 0, y0, W, 2, '#050409');
  // the gate
  const gx = CX, gy = 2380;
  R(g, gx - 74, gy - 96, 148, 96, '#0c0a16');
  for (let i = 0; i < 8; i++) {                            // gate columns
    const x = gx - 68 + i * 19;
    R(g, x, gy - 92, 8, 92, P.hadB);
    R(g, x, gy - 92, 3, 92, P.hadC);
    R(g, x - 1, gy - 96, 10, 5, P.hadC);
  }
  R(g, gx - 78, gy - 104, 156, 9, P.hadB);
  R(g, gx - 78, gy - 104, 156, 3, P.hadC);
  R(g, gx - 82, gy, 164, 5, P.hadB);
  // the queue of shades, receding
  for (let i = 0; i < 64; i++) {
    const x = (hash2(i, 1501) * W) | 0;
    const y = gy + 18 + ((i % 8) * 9) + hash2(i, 1503) * 6;
    if (y > y1 - 6) continue;
    const dim = 0.35 + hash2(i, 1507) * 0.5;
    g.globalAlpha = dim * 0.5;
    R(g, x, y, 2, 6, P.shade); R(g, x, y - 2, 2, 2, P.shade);
    g.globalAlpha = 1;
  }
  drawTextCentered(g, 'NO CARGO FEE', 2500, 'rgba(120,140,165,0.35)');
}

export function drawTextCentered(g, s, y, col, sc = 1) {
  drawText(g, s, (W - textWidth(s, sc)) / 2, y, col, sc);
}
