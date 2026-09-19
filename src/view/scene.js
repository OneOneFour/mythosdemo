/* view layer — the frame: composes the passes and owns nothing but the order
   they happen in. `render()` performs no model writes -- nothing here imports a
   `write` namespace, and `model/epoch.js`'s counter is asserted not to move
   across a call to it.

   Bands lie in one shared world-pixel space, so more than one can be on screen
   and this loop draws every band the viewport touches; the camera is a window
   onto world pixels and there is no current band.

   Pass order: void, then per band (sky, then chunks), then the live-tile
   overlay, machines, items, player, chips, field overlay, darkness, fog of war,
   atmosphere, debug, HUD. Lighting comes after everything it lights. */

import { drawText } from '../core/font.js';
import { blend, mix } from '../core/palette.js';
import { R, glow, lineTo } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { colour } from '../data/palette.js';
import { FIELDS } from '../data/world.js';
import { fieldAt, hasField } from '../model/fields.js';
import { activeCount as growingCount, growingAt, stageAt } from '../model/growth.js';
import { items } from '../model/items.js';
import { machines } from '../model/machines.js';
import { progressAt, workAt } from '../model/mining.js';
import { eff } from '../model/mods.js';
import { PH, PW, player } from '../model/player.js';
import { hasPick, run } from '../model/run.js';
import { bandAbove, bandBelow, bands, chunkPx, heightPx, lightAt, seenAt, widthPx } from '../model/world.js';
import { chips, drawChips } from './fx.js';
import { drawHUD } from './hud.js';
import { drawOverview } from './overview.js';
import { drawMenu, menuOpen } from './ui/menu.js';
import { beginFrame, chunkCanvas, effChargeAt, effHardAt, paintItem, paintMachine, skyBottomTy } from './paint.js';

const INK = {
  void:   colour('abyC'),
  cloud:  colour('cloudA'),
  cloudLo: colour('cloudC'),
  /* The far cumulus sits in the haze, so its body is the cloud tone already
     pulled toward the sky's pale end. */
  cloudFar: mix(colour('cloudB'), colour('skyHi'), 0.35),
  cloudUnder: colour('cloudB'),
  /* The two ends the sky ramp reaches for beyond a band's own `look.sky`: a
     deeper blue overhead, a pale dust at the horizon. */
  zenith: colour('aquA'),
  haze:   colour('cloudB'),
  skin:   '#d8a878',
  tunicA: '#b8433a',
  tunicB: '#8d2f29',
  hair:   '#3a2416',
  eye:    '#1a1014',
  haft:   colour('woodB'),
  head:   colour('irA'),
  hurt:   '#ff4a4a',
  heat:   colour('hot'),
  grid:   colour('watB'),
  chunk:  '#ff7fd0',
  fog:    colour('abyA'),
  /* A worked-out deposit: pale rock dust over the ore's own colour, and a dark
     notch where each unit came out. */
  dust:   colour('limeC'),
  pit:    colour('abyA'),
  pitLip: colour('limeD'),
  /* A seedling: the canopy's own three greens, so a growing seed reads as the
     plant it becomes, plus the darkest wood tone for the seed itself. */
  seed:   colour('woodD'),
  stem:   colour('vdC'),
  leaf:   colour('vdB'),
  leafHi: colour('vdA'),
  /* The arrival's shaft of light. `ichor` is read from the palette rather than
     off the altar's row, so no machine name reaches this file. */
  shaft:  colour('ichor'),
  shaftHi: colour('cloudA')
};

/* What the last `render()` drew. `tint` is the depth-tint alpha per screen row,
   written by the same loop that issues the rects; pair an index with `cam.y` for
   the world row it covers. A reused buffer, replaced only on a resize. */
export const stats = { chunksDrawn: 0, bandsDrawn: 0, tint: new Float64Array(0) };

let tintBuf = new Float64Array(0);
const tintRows = h => (tintBuf.length === h ? tintBuf : (tintBuf = new Float64Array(h)));

/* `f` is the frame context assembled by `shell/main.js`:
     { cam:{x,y}, t, dt, frame, W, H, flags }
   Passed in rather than imported, because `view` may not import `shell`. */
export function render(g, f) {
  const { cam, W, H } = f;
  cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);
  beginFrame();

  R(g, 0, 0, W, H, INK.void);
  stats.chunksDrawn = 0; stats.bandsDrawn = 0;
  stats.tint = tintRows(H); stats.tint.fill(0);

  /* The menu outranks the map: the game boots into the menu, and a `showMap`
     left set by a previous run would otherwise take the whole frame. */
  const menu = menuOpen(f);

  /* The map overview is a full substitute frame rather than an overlay, in its
     own file with its own scale, scroll, zoom, ruler and layers: nothing past
     this point executes while it is open. */
  if (f.flags.showMap && !menu) { drawOverview(g, f); return; }

  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    stats.bandsDrawn++;
    drawSky(g, b, f);
    drawChunks(g, b, cam, W, H);
  }

  /* With the terrain, so anything standing in front of a worked-out vein covers
     the cue, and darkness and fog dim it exactly as they do the rock. */
  drawLiveTiles(g, f);

  /* Read once and used twice, in two passes that must agree about which
     machine is arriving and how far through it is. */
  const arriving = arrivalOf();

  for (const m of machines) {
    const sx = (m.box.x - cam.x) | 0, sy = (m.box.y - cam.y) | 0;
    if (arriving && arriving.m === m) rising(g, m, sx, sy, f, arriving.p);
    else paintMachine(g, m, sx, sy, f.t);
  }

  drawItems(g, f);
  drawPlayer(g, f);
  drawChips(g, cam, W, H);
  drawFields(g, f);
  drawDarkness(g, f);
  drawFog(g, f);
  atmosphere(g, f);
  /* After `atmosphere`, or a shaft of light is dimmed by the tint and the
     vignette it is meant to cut through. */
  if (arriving) drawArrival(g, f, arriving);
  drawSlip(g, f);

  if (f.flags.showGrid)   overlay(g, cam, W, H, player.band?.tile ?? 8, INK.grid, 0.16);
  if (f.flags.showChunks) overlay(g, cam, W, H, player.band ? chunkPx(player.band) : 128, INK.chunk, 0.5);

  /* The menu stands instead of the HUD, not over it, and owns
     `view/ui/state.js#drawn` for the frame: it calls `resetDrawn()` itself. */
  if (menu) drawMenu(g, f); else drawHUD(g, f);
}

/* A belt too steep to grip, marked over every tile of the run. After the fog
   and the tint: a warning the player cannot read is not a warning. The bob is
   derived from `f.t` and the tile, so the frame stays pure. */
function drawSlip(g, f) {
  const { cam } = f;
  for (const m of machines) {
    if (!m.slip || !seenAt(m.band, m.tx, m.ty)) continue;
    const bob = Math.sin(f.t * 5 + hash2(m.tx, m.ty) * 6.283) > 0 ? 1 : 0;
    drawText(g, '!', (m.box.x + m.box.w / 2 - 2 - cam.x) | 0,
             (m.box.y - 9 - bob - cam.y) | 0, INK.hurt, 1, 1, INK.fog);
  }
}

const visible = (b, cam, W, H) =>
  b.origin.x < cam.x + W && b.origin.x + widthPx(b) > cam.x &&
  b.origin.y < cam.y + H && b.origin.y + heightPx(b) > cam.y;

/* The visible tile range of one band, half-open and clamped to its own grid.
   Four passes walk it -- depletion, fields, darkness, fog -- none of which can go
   through the chunk cache, since each renders a live condition. */
function tileWindow(b, cam, W, H) {
  const t = b.tile;
  return {
    x0: Math.max(0, Math.floor((cam.x - b.origin.x) / t)),
    x1: Math.min(b.tw, Math.ceil((cam.x + W - b.origin.x) / t)),
    y0: Math.max(0, Math.floor((cam.y - b.origin.y) / t)),
    y1: Math.min(b.th, Math.ceil((cam.y + H - b.origin.y) / t))
  };
}

/* A band's `look.sky` is the colour above its ground line and `look.tint` the
   rock below. Quantised into discrete steps, with the haze anchored in pixels
   above the horizon, since it sits behind hilltops well above `floorTy`. */
const SKY_STEPS = 14;
const HAZE_PX = 56;
const skyRamps = new Map();

function skyRamp(b) {
  let ramp = skyRamps.get(b.cfg.id);
  if (!ramp) {
    const l = b.cfg.look || {};
    const sky = colour(l.sky ?? 'abyB');
    const zenith = blend(sky, INK.zenith, 0.42);
    const dust = blend(sky, colour(l.tint ?? 'abyC'), 0.34);
    const haze = blend(dust, INK.haze, 0.45);
    const skyPx = Math.max(1, (b.cfg.floorTy ?? 0) * b.tile);
    /* Where zenith->sky becomes sky->haze. */
    const brk = 1 - Math.min(0.6, HAZE_PX / skyPx);
    ramp = [];
    for (let i = 0; i < SKY_STEPS; i++) {
      const u = i / (SKY_STEPS - 1);
      ramp.push(u < brk ? blend(zenith, sky, u / brk)
                        : blend(sky, haze, (u - brk) / Math.max(0.001, 1 - brk)));
    }
    skyRamps.set(b.cfg.id, ramp);
  }
  return ramp;
}

function drawSky(g, b, f) {
  const { cam, W, H } = f;
  const top = b.origin.y - cam.y;
  const horizon = b.origin.y + (b.cfg.floorTy ?? 0) * b.tile - cam.y;
  const floor = b.origin.y + skyBottomTy(b) * b.tile - cam.y;
  const y0 = Math.max(0, top), y1 = Math.min(H, horizon), y2 = Math.min(H, floor);
  if (y2 <= y0) return;

  const ramp = skyRamp(b);
  const step = (horizon - top) / SKY_STEPS;
  for (let i = 0; i < SKY_STEPS; i++) {
    const ya = Math.max(y0, Math.round(top + step * i));
    const yb = i === SKY_STEPS - 1 ? y1 : Math.min(y1, Math.round(top + step * (i + 1)));
    if (yb > ya) R(g, 0, ya, W, yb - ya, ramp[i]);
  }

    /* The sky reaches the skyline, not the horizon: relief may put a valley
       floor below the ground line and the air over it is sky-exposed. One rect,
       since the rows below the horizon are a single tone. */
  const hz = Math.max(y0, y1);
  if (y2 > hz) R(g, 0, hz, W, y2 - hz, ramp[SKY_STEPS - 1]);

  drawClouds(g, b, f, top, horizon, y0, y1);
}

/* `par` is how much of the camera's horizontal motion a layer does not take,
   and it is horizontal only: a cloud lagging downward out of its sky region
   would draw over the band above's rock. The drift is `f.t`, never `rand()`. */
const CLOUDS = [
  { n: 7,  par: 0.74, w: [40, 80], speed: 1.4, alpha: 0.42, y: [0.04, 0.40] },
  { n: 10, par: 0.52, w: [22, 44], speed: 3.2, alpha: 0.62, y: [0.18, 0.66] },
  { n: 12, par: 0.30, w: [10, 22], speed: 6.4, alpha: 0.85, y: [0.40, 0.94] }
];

function drawClouds(g, b, f, top, horizon, y0, y1) {
  const { cam, W } = f;
  const span = widthPx(b) + 400;
  const skyH = Math.max(1, horizon - top);

  for (let k = 0; k < CLOUDS.length; k++) {
    const L = CLOUDS[k];
    const drift = 1 - L.par;
    g.globalAlpha = L.alpha;
    for (let i = 0; i < L.n; i++) {
      const s = i * 7 + k * 101 + b.ord * 977;
      const w = (L.w[0] + hash2(s, 31) * (L.w[1] - L.w[0])) | 0;
      const x = (((hash2(s, 11) * span + f.t * L.speed) % span) - 200
                 + (b.origin.x - cam.x) * drift) | 0;
        /* The base line sits in the room left over after the cloud's own height,
           so a tall cumulus cannot poke out of the top of its band's sky. */
      const tall = cloudHeight(w);
      const room = Math.max(1, skyH - tall);
      const yb = top + tall
               + (L.y[0] + hash2(s, 17) * (L.y[1] - L.y[0])) * room;
      if (yb < y0 || yb > y1 || x < -w - 8 || x > W + 8) continue;
      cloud(g, x, yb | 0, w, s, k);
    }
    g.globalAlpha = 1;
  }
}

/* A flat base and a lumpy top in two tones. `y` is the cloud's base line and the
   shape grows upward, so a layer's vertical band means how high the bases sit;
   the underside is the darker tone, since `LIGHT` comes from above. */
const cloudHeight = w => Math.max(4, (w * 0.26) | 0) * 2;

function cloud(g, x, y, w, s, layer) {
  const h = Math.max(3, (w * 0.26) | 0);
  const body = layer === 0 ? INK.cloudFar : INK.cloud;
  const under = layer === 0 ? INK.cloudLo : INK.cloudUnder;

  R(g, x, y - h, w, h, body);

  const lumps = Math.max(2, Math.min(5, Math.round(w / 15)));
  for (let i = 0; i < lumps; i++) {
    const lw = Math.max(4, ((w / lumps) * (0.95 + hash2(s + i, 9) * 0.55)) | 0);
    const lx = x + (((w - lw) * (i / (lumps - 1))) | 0);
    dome(g, lx, y - h, lw, 2 + ((hash2(s + i, 13) * h) | 0), body);
  }

  const u = Math.max(1, (h / 3) | 0);
  R(g, x, y - u, w, u, under);
}

/* A stepped half-ellipse, one integer row at a time. No `arc` and no fill
   path: a canvas curve would antialias its own edge. */
function dome(g, x, yb, w, h, col) {
  for (let j = 0; j < h; j++) {
    const k = (j + 0.5) / h;
    const cw = Math.max(2, Math.round(w * Math.sqrt(Math.max(0, 1 - k * k))));
    R(g, x + ((w - cw) >> 1), yb - 1 - j, cw, 1, col);
  }
}

function drawChunks(g, b, cam, W, H) {
  const px = chunkPx(b);
  const ox = b.origin.x - cam.x, oy = b.origin.y - cam.y;
  const c0x = Math.max(0, Math.floor(-ox / px));
  const c1x = Math.min(b.cx - 1, Math.floor((W - ox) / px));
  const c0y = Math.max(0, Math.floor(-oy / px));
  const c1y = Math.min(b.cy - 1, Math.floor((H - oy) / px));

  for (let cy = c0y; cy <= c1y; cy++)
    for (let cx = c0x; cx <= c1x; cx++) {
      const canvas = chunkCanvas(b, cx, cy);
      if (!canvas) continue;                    // headless: no offscreen surface
      g.drawImage(canvas, (ox + cx * px) | 0, (oy + cy * px) | 0);
      stats.chunksDrawn++;
    }
}

/* Two cues, one pass: both walk the visible tile window of every visible band,
   and the cases are mutually exclusive. Both are overlays rather than chunk
   bakes, since a chunk canvas caches static rock. No `rand()`, no model write. */

/* Alpha of the dust wash when a tile is one unit short of gone. Scaled by
   `spent / charge` below, so a charge-4 copper tile washes at 0.11 / 0.22 / 0.33
   and never reaches this value -- full wash is the tile that already broke. */
const DUST_MAX = 0.44;

function drawLiveTiles(g, f) {
  const { cam, W, H } = f;
  /* Hoisted: `anyGrowing` is a `Map.size` read, so with nothing planted the
     growth case costs one comparison for the whole frame, and `growTotal` is
     read once so two seedlings cannot be measured against different totals. */
  const anyGrowing = growingCount() > 0;
  const growTotal = anyGrowing ? eff('treeGrowSecs') : 0;

  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    const t = b.tile;
    const { x0, x1, y0, y1 } = tileWindow(b, cam, W, H);

    for (let ty = y0; ty < y1; ty++)
      for (let tx = x0; tx < x1; tx++) {
          /* `growingAt` rather than `grownAt() > 0`: a seed planted this substep
             has zero seconds on it and must still draw at stage 0. */
        if (anyGrowing && growingAt(b, tx, ty)) {
          seedling(g, b.origin.x + tx * t - cam.x, b.origin.y + ty * t - cam.y,
                   t, stageAt(b, tx, ty, growTotal));
          continue;
        }

          /* The cull is a map lookup: `dig.work` holds an entry only for a tile
             something has hit, so the substance lookups and the `eff()` call
             below are paid for a handful of tiles rather than thousands. */
        if (workAt(b, tx, ty) <= 0) continue;

        const charge = effChargeAt(b, tx, ty);
        if (charge <= 1) continue;                  // not a deposit: nothing to spend
        const d = progressAt(b, tx, ty, effHardAt(b, tx, ty), charge);
          /* Units already out of the ground, floored with no epsilon and capped
             one short of `charge`: the last unit is the break, and without the
             cap one frame flashes a fully spent tile. */
        const spent = Math.min(charge - 1, Math.floor(d * charge));
        if (spent < 1) continue;

        const sx = b.origin.x + tx * t - cam.x, sy = b.origin.y + ty * t - cam.y;

        g.globalAlpha = DUST_MAX * spent / charge;
        R(g, sx, sy, t, t, INK.dust);
        g.globalAlpha = 1;

          /* One notch per unit taken out: 2x2 with a lit lower lip, since
             `core/pixels.js#LIGHT` comes from above, and inset by a pixel so a
             notch never touches the tile edge. */
        for (let k = 0; k < spent; k++) {
          const nx = 1 + ((hash2(tx * 17 + k * 31, ty * 13 + 5) * (t - 3)) | 0);
          const ny = 1 + ((hash2(ty * 17 + k * 31, tx * 13 + 9) * (t - 3)) | 0);
          R(g, sx + nx, sy + ny, 2, 2, INK.pit);
          R(g, sx + nx, sy + ny + 2, 2, 1, INK.pitLip);
        }
      }
  }
}

/* Three discrete silhouettes rather than a continuous interpolation: at 8 px a
   tile there are about six usable rows, so a continuous height spends most of
   180 seconds not visibly changing. Strictly inside its own tile. */

/* Fractions of `treeGrowSecs` at which the silhouette steps up: two numbers for
   three stages, in thirds. */
const SEED_STAGES = [1 / 3, 2 / 3];

function seedling(g, sx, sy, t, stage) {
  const cx = sx + (t >> 1) - 1;              // 2 px wide, centred, integer
  const base = sy + t - 1;                   // the tile's own bottom row

  /* Stage 0 -- a seed in the ground: two pixels on the bottom row with a single
     lit pixel above them. */
  if (stage < SEED_STAGES[0]) {
    R(g, cx, base - 1, 2, 2, INK.seed);
    R(g, cx, base - 2, 1, 1, INK.leafHi);
    return;
  }

  /* Stage 1 -- a shoot: a 1 px stem three rows tall with one leaf either side of
     its top. */
  if (stage < SEED_STAGES[1]) {
    R(g, cx, base - 3, 1, 4, INK.stem);
    R(g, cx - 1, base - 3, 1, 1, INK.leaf);
    R(g, cx + 1, base - 3, 1, 1, INK.leafHi);
    return;
  }

  /* Stage 2 -- a sapling: the stem reaches most of the tile and carries two
     tiers of leaves, the upper pair wider. `t - 2` rows, so the sprite never
     touches the tile's top edge and cannot read as joined to the tile above. */
  const h = Math.max(4, t - 2);
  R(g, cx, base - h + 1, 1, h, INK.stem);
  R(g, cx - 2, base - h + 2, 2, 1, INK.leaf);
  R(g, cx + 1, base - h + 2, 2, 1, INK.leafHi);
  R(g, cx - 1, base - h + 4, 1, 1, INK.leaf);
  R(g, cx + 1, base - h + 4, 1, 1, INK.leaf);
}

function drawItems(g, f) {
  const { cam, W, H } = f;
  for (const it of items) {
    const x = (it.x - cam.x) | 0, y = (it.y - cam.y) | 0;
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    paintItem(g, it, x, y, f.t);
  }
}

function drawPlayer(g, f) {
  if (run.dead) return;
  const p = player;
  const x = (p.x - f.cam.x) | 0, y = (p.y - f.cam.y) | 0;
  /* Blink while invulnerable, so a hit is legible. Derived from the clock, not
     from a counter this function would have to advance. */
  if (run.invuln > 0 && ((f.t * 14) | 0) % 2 === 0) return;

  const step = p.walkPhase ? (Math.sin(p.walkPhase) > 0 ? 1 : 0) : 0;
  R(g, x + 1, y + 10, 3, 6, INK.tunicB);                    // legs
  R(g, x + 4, y + 10, 3, 6 - step, INK.tunicB);
  R(g, x, y + 4, PW, 7, INK.tunicA);                        // torso
  R(g, x, y + 4, PW, 1, mix(INK.tunicA, INK.cloud, 0.3));
  R(g, x + 2, y, 5, 5, INK.skin);                           // head
  R(g, x + 2, y, 5, 1, INK.hair);
  R(g, x + (p.face > 0 ? 5 : 2), y + 2, 1, 1, INK.eye);     // eye

  if (hasPick()) {                                          // held out front
    const hx = x + (p.face > 0 ? PW : -1), hy = y + 6;
    const sw = p.digging ? 1 : 0;
    lineTo(g, hx, hy + sw, hx + p.face * 4, hy - 3 + sw * 4, INK.haft);
    R(g, hx + p.face * 4, hy - 4 + sw * 4, 2, 2, INK.head);
  }
  if (p.hurtFlash > 0) {
    g.globalAlpha = p.hurtFlash * 0.7;
    R(g, x - 1, y - 1, PW + 2, PH + 2, INK.hurt);
    g.globalAlpha = 1;
  }
}

/* Fields do not go through the chunk cache: those canvases avoid repainting
   static rock and a heat plume changes every frame. Fog below is the same shape
   of pass -- the canvas caches the rock, not the right to see it. */
function drawFields(g, f) {
  const { cam, W, H } = f;
  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    for (const name of FIELDS) {
      if (!hasField(b, name)) continue;
      const t = b.tile;
      const { x0, x1, y0, y1 } = tileWindow(b, cam, W, H);
      for (let ty = y0; ty < y1; ty++)
        for (let tx = x0; tx < x1; tx++) {
          const v = fieldAt(b, name, tx, ty);
          if (v < 0.5) continue;
          g.globalAlpha = Math.min(0.45, v / 120);
          R(g, b.origin.x + tx * t - cam.x, b.origin.y + ty * t - cam.y, t, t, INK.heat);
          g.globalAlpha = 1;
        }
    }
  }
}

/* `drawFog` hides a tile never seen; this renders how lit one is right now, so a
   torch burning out darkens a remembered room. Runs before fog and subtracts
   with ordinary alpha: additive light shines through the fog rect under it. */
const DARK = colour('abyC');
const DARK_ALPHA = [0.94, 0.55, 0.22];   // level 0-4 / 5-9 / 10-14 (>= lightMax: none)

function darkBucket(level, max) {
  if (level >= max) return -1;
  if (level <= 4) return 0;
  if (level <= 9) return 1;
  return 2;
}

function drawDarkness(g, f) {
  const { cam, W, H } = f;
  const max = eff('lightMax');
  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    const t = b.tile;
    const { x0, x1, y0, y1 } = tileWindow(b, cam, W, H);

    for (let ty = y0; ty < y1; ty++) {
      let run = -1, cur = -1;
      for (let tx = x0; tx <= x1; tx++) {
        const bucket = tx < x1 && seenAt(b, tx, ty) ? darkBucket(lightAt(b, tx, ty), max) : -1;
        if (bucket === cur) continue;
        if (cur >= 0) {
          g.globalAlpha = DARK_ALPHA[cur];
          R(g, b.origin.x + run * t - cam.x, b.origin.y + ty * t - cam.y,
            (tx - run) * t, t, DARK);
          g.globalAlpha = 1;
        }
        run = tx; cur = bucket;
      }
    }
  }
}

/* An unrevealed tile is opaque regardless of what is there, so this draws after
   everything that could leak a hint and before the fire glow, which is gated on
   `seenAt`. `tx <= x1` walks a sentinel column past the edge so a run flushes. */
function drawFog(g, f) {
  const { cam, W, H } = f;
  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    const t = b.tile;
    const { x0, x1, y0, y1 } = tileWindow(b, cam, W, H);

    for (let ty = y0; ty < y1; ty++) {
      let run = -1;
      for (let tx = x0; tx <= x1; tx++) {
        const hidden = tx < x1 && !seenAt(b, tx, ty);
        if (hidden) { if (run < 0) run = tx; continue; }
        if (run < 0) continue;
        R(g, b.origin.x + run * t - cam.x, b.origin.y + ty * t - cam.y,
          (tx - run) * t, t, INK.fog);
        run = -1;
      }
    }
  }
}

/* The depth tint is world-anchored: a row's alpha is a function of its place in
   the band stack alone. Adjacent bands ramp over `TINT_SPAN` world px centred on
   the seam; 32 px is 3 units of 255 per row, under the ~5 that reads as an edge. */
const TINT_SPAN = 32;
const TINT_HALF = TINT_SPAN / 2;

const ambOf = b => b.cfg.look?.ambient ?? 1;

/* One rect per run of equal alpha, writing `stats.tint` from the same loop.
   Assumes `cam` is already integer (`render` rounds it) and leaves
   `globalAlpha` at 1; the `else` resolves a band shorter than `TINT_SPAN`. */
function depthTint(g, f) {
  const { cam, W, H } = f;
  const rows = stats.tint;

  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    const top = b.origin.y, bot = top + heightPx(b);
    const own = ambOf(b);
    const up = bandAbove(b), dn = bandBelow(b);
    const upA = up ? ambOf(up) : own, dnA = dn ? ambOf(dn) : own;
    const y0 = Math.max(0, top - cam.y), y1 = Math.min(H, bot - cam.y);

    let runY = y0, runA = -1;
    for (let sy = y0; sy <= y1; sy++) {
      let a = -1;
      if (sy < y1) {
        const wy = cam.y + sy;
        let amb = own;
        if (up && wy < top + TINT_HALF)       amb = upA + (own - upA) * ((wy - top + TINT_HALF) / TINT_SPAN);
        else if (dn && wy >= bot - TINT_HALF) amb = own + (dnA - own) * ((wy - bot + TINT_HALF) / TINT_SPAN);
        /* 1/510 is half an 8-bit quantum, so a row under it cannot change a
           composited pixel and is recorded as the 0 it draws as. */
        a = Math.min(0.55, (1 - amb) * 1.1);
        if (a <= 1 / 510) a = 0;
        rows[sy] = a;
      }
      if (a === runA) continue;
      if (runA > 0) {
        g.globalAlpha = runA;
        R(g, 0, runY, W, sy - runY, INK.void);
      }
      runY = sy; runA = a;
    }
  }
  g.globalAlpha = 1;
}

/* The world-anchored depth tint, then a vignette on top, because the frame edge
   is where the eye leaks out. */
function atmosphere(g, f) {
  const { cam, W, H } = f;
  depthTint(g, f);
  const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32,
                                     W / 2, H / 2, Math.max(W, H) * 0.76);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  /* A halo is light, so it comes after the tint and after `drawFog`, and is
     still gated on `seenAt`: `glow` paints with `'lighter'` and would add
     straight through an opaque fog rect instead of being hidden by it. */
  for (const m of machines) {
    if (!(m.fire > 0.02) || !seenAt(m.band, m.tx, m.ty)) continue;
    glow(g, m.box.x + m.box.w / 2 - cam.x, m.box.y + m.box.h - 2 - cam.y,
         12 + m.fire * 8, INK.heat, 0.4 * m.fire);
  }
}

/* `rules/cycles.js` stamps `run.arrival` with the position and instant a machine
   was put down, and both passes read that stamp, so no machine name reaches this
   file. Time comes from `run.t`, so it runs the same length at any framerate. */

const MOTES = 36;

/* The machine is out of the ground by 70% of the window, so the light
   outlives the motion and has something to fade over. */
const RISE_FRAC = 0.7;

/* Fast out of the floor, slow into place. */
const easeOut = p => 1 - (1 - p) ** 3;

function arrivalOf() {
  const a = run.arrival;
  if (!a) return null;
  const secs = eff('altarRiseSecs');
  const p = secs > 0 ? (run.t - a.t) / secs : 1;
  if (!(p >= 0) || p >= 1) return null;
  const m = machines.find(mm => mm.box.x === a.x && mm.box.y === a.y);
  return m ? { m, p } : null;
}

/* The machine climbing out of its own footprint, drawn in the machines pass in
   place of the ordinary `paintMachine` call. Clipped to its own base, so the
   part still underground is hidden by the ground. `save`/`restore` balance. */
function rising(g, m, sx, sy, f, p) {
  const drop = Math.round((1 - easeOut(Math.min(1, p / RISE_FRAC))) * m.box.h);
  if (drop <= 0) { paintMachine(g, m, sx, sy, f.t); return; }
  g.save();
  g.beginPath();
  g.rect(0, 0, f.W, Math.max(0, sy + m.box.h));
  g.clip();
  paintMachine(g, m, sx, sy + drop, f.t);
  g.restore();
}

/* The sky darkening a notch, a shaft of light down onto the machine, dust
   falling through it, and a flare where it lands. Screen px throughout; entered
   with `globalAlpha` at 1 and left at 1. */
function drawArrival(g, f, { m, p }) {
  const { cam, W, H } = f;
  const base = (m.box.y + m.box.h - cam.y) | 0;
  const cx = (m.box.x + m.box.w / 2 - cam.x) | 0;
  /* Half-widths at the top of the viewport and at the machine's base. */
  const hi = Math.max(2, (m.box.w * 0.4) | 0), lo = Math.max(3, m.box.w);
  if (base <= 0 || cx + lo < 0 || cx - lo >= W) return;

  /* In over the first eighth, hold, then out. */
  const env = p < 0.12 ? p / 0.12 : p > 0.65 ? (1 - p) / 0.35 : 1;
  const bot = Math.min(base, H);

  g.globalAlpha = env * 0.22;
  R(g, 0, 0, W, H, INK.void);

  for (let y = 0; y < bot; y++) {
    const u = y / base;
    const hw = (hi + (lo - hi) * u) | 0;
    g.globalAlpha = env * (0.06 + 0.2 * u);
    R(g, cx - hw, y, hw * 2, 1, INK.shaft);
  }

  g.globalAlpha = env * 0.45;
  R(g, cx - 1, 0, 3, bot, INK.shaftHi);

    /* Dust falling with the light. `seed` is the arrival's own world position,
       so the same arrival scatters identically on every repaint. */
  const seed = m.box.x * 7 + m.box.y;
  for (let k = 0; k < MOTES; k++) {
    const y = (((hash2(seed, k) + p * 1.7) % 1) * base) | 0;
    if (y < 0 || y >= bot) continue;
    const hw = (hi + (lo - hi) * (y / base)) | 0;
    const x = (cx + (hash2(k, seed) * 2 - 1) * hw) | 0;
    if (x < 0 || x >= W) continue;
    g.globalAlpha = env * (0.35 + 0.5 * hash2(k, seed + 1));
    R(g, x, y, 1, 1, INK.shaftHi);
  }

  g.globalAlpha = 1;
  glow(g, cx, base, 8 + 26 * env, INK.shaft, 0.5 * env);
}

function overlay(g, cam, W, H, pitch, col, alpha) {
  g.globalAlpha = alpha; g.fillStyle = col;
  for (let x = -(((cam.x % pitch) + pitch) % pitch); x < W; x += pitch) g.fillRect(x, 0, 1, H);
  for (let y = -(((cam.y % pitch) + pitch) % pitch); y < H; y += pitch) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
}

/* A one-line band label, drawn straight onto rendered terrain with nothing to
   back against, so it takes the secondary body tone and `drawText`'s shadow.
   TODO(rob): nothing calls this -- hang it off a HUD anchor or delete it. */
export function bandLabel(g, f) {
  const b = player.band;
  if (!b) return;
  drawText(g, b.name, 6, f.H - 26, colour('uiInk2'), 1, 1, colour('uiShade'));
}

/* Chips are drawn from `view/fx.js`; re-exported so `shell` has one import for
   the whole draw surface. */
export { chips };
