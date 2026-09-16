/* LAYER view — THE FRAME. Composes the passes and owns nothing but the order
   they happen in. Imports `core`, `data` and READ-ONLY `model` queries.

   `render()` PERFORMS NO MODEL WRITES, AND THAT IS PROVABLE.
   The static half: `tools/layers.mjs` forbids `view -> rules`, and nothing here
   imports a `write` namespace. The dynamic half: `model/epoch.js` counts every
   mutation, and the check tool asserts the counter does not move across a call
   to this function. Two partial nets where a type system would give one
   guarantee — stated honestly rather than claimed as proof.

   BANDS ARE LAID OUT IN ONE SHARED WORLD-PIXEL SPACE, so more than one can be
   on screen at once and this loop draws every band the viewport touches. There
   is no "current band" in the renderer; the camera is a window onto world
   pixels and the band a thing belongs to is a property of the thing.

   PASS ORDER: void, then per band (sky, then chunks), then the LIVE-TILE
   overlay (depletion and growth, one pass — see `drawLiveTiles`), machines,
   items, player, chips, field overlay, darkness, fog of war, atmosphere, debug,
   HUD. Anything that reads as lighting comes after everything it lights.
*/

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
  /* The far cumulus layer sits IN the haze, so its body is the cloud tone
     already pulled toward the sky's pale end -- distance desaturates, and the
     alternative (the same white at a lower alpha) reads as a hole. */
  cloudFar: mix(colour('cloudB'), colour('skyHi'), 0.35),
  cloudUnder: colour('cloudB'),
  /* The two ends the sky ramp reaches for beyond a band's own `look.sky`: a
     deeper blue overhead, a pale dust at the horizon. Both named palette
     entries, mixed rather than inlined, per the palette convention. */
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
  /* A worked-out deposit: pale rock dust over the ore's own colour, and a
     dark notch where each unit came out. See `drawDepletion`. */
  dust:   colour('limeC'),
  pit:    colour('abyA'),
  pitLip: colour('limeD'),
  /* A seedling: the CANOPY's own three greens (`view/treatments.js#canopy`'s
     `vdC`/`vdB`/`vdA` defaults) so a growing seed reads as the same plant as
     the crown it becomes, plus the darkest wood tone for the seed itself --
     a seed is not a leaf. See `seedling`. */
  seed:   colour('woodD'),
  stem:   colour('vdC'),
  leaf:   colour('vdB'),
  leafHi: colour('vdA'),
  /* The arrival's shaft of light. `ichor` is the divine tone the altar's own
     `look.halo` already names, read from the palette rather than off the row
     so no machine reaches this file. The white is the hot centre of the
     shaft and the dust falling down it. See `drawArrival`. */
  shaft:  colour('ichor'),
  shaftHi: colour('cloudA')
};

/* What the last `render()` drew. `tint` is the depth-tint alpha per SCREEN row,
   written by the same loop that issues the rects, so the record cannot disagree
   with the pixels. Pair an index with `cam.y` for the world row it covers. A
   REUSED buffer, replaced only when the viewport height changes. */
export const stats = { chunksDrawn: 0, bandsDrawn: 0, tint: new Float64Array(0) };

let tintBuf = new Float64Array(0);
const tintRows = h => (tintBuf.length === h ? tintBuf : (tintBuf = new Float64Array(h)));

/* `f` is the frame context assembled by `shell/main.js`:
     { cam:{x,y}, t, dt, frame, W, H, flags }
   Passed in rather than imported, because the clock and the camera are devices'
   business and `view` may not import `shell`.
*/
export function render(g, f) {
  const { cam, W, H } = f;
  cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);
  beginFrame();

  R(g, 0, 0, W, H, INK.void);
  stats.chunksDrawn = 0; stats.bandsDrawn = 0;
  stats.tint = tintRows(H); stats.tint.fill(0);

  /* THE MENU OUTRANKS THE MAP. The game boots into the menu, and a `showMap`
     left set by a previous run would otherwise take the whole frame and the
     menu would never be seen. */
  const menu = menuOpen(f);

  /* THE MAP OVERVIEW IS A DIFFERENT RENDER PATH, NOT A CAMERA TRICK, and a
     different FILE, which owns its own scale, scroll, zoom, ruler and layers.
     Nothing past this point executes while the map is open -- it is a full
     substitute frame, not an overlay on the ordinary one. */
  if (f.flags.showMap && !menu) { drawOverview(g, f); return; }

  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    stats.bandsDrawn++;
    drawSky(g, b, f);
    drawChunks(g, b, cam, W, H);
  }

  /* Terrain paint, so it runs with the terrain: a machine, an item or the
     player standing in front of a worked-out vein (or a seedling) must cover
     the cue, and darkness and fog (both later) must dim and hide it exactly
     as they do the rock it sits on. */
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
  /* AFTER `atmosphere`, for the reason the machine halo inside it is: a shaft
     of light dimmed by the depth tint and the vignette it is supposed to cut
     through reads as a grey smear. */
  if (arriving) drawArrival(g, f, arriving);

  if (f.flags.showGrid)   overlay(g, cam, W, H, player.band?.tile ?? 8, INK.grid, 0.16);
  if (f.flags.showChunks) overlay(g, cam, W, H, player.band ? chunkPx(player.band) : 128, INK.chunk, 0.5);

  /* THE MENU STANDS INSTEAD OF THE HUD, not over it: hearts, the depth gauge
     and the journal read as clutter through a dimmed backdrop, and the menu
     owns `view/ui/state.js#drawn` for the frame -- it calls `resetDrawn()`
     itself, exactly as `drawHUD` does. */
  if (menu) drawMenu(g, f); else drawHUD(g, f);
}

const visible = (b, cam, W, H) =>
  b.origin.x < cam.x + W && b.origin.x + widthPx(b) > cam.x &&
  b.origin.y < cam.y + H && b.origin.y + heightPx(b) > cam.y;

/* THE VISIBLE TILE RANGE OF ONE BAND, half-open, clamped to its own grid.
   Four passes below walk it -- depletion, fields, darkness, fog -- because
   none of them can go through the chunk cache (each renders a LIVE condition
   over a canvas that caches only the static rock). Each used to carry its own
   copy of this arithmetic, three of them commented as being "the identical
   tile-range math" one of the others uses; a clamp that is wrong is now wrong
   in one place. `visible()` above stays the cheaper FIRST test at every call
   site: an off-screen band should cost one rectangle compare, not four
   divisions and a loop that immediately does not run. */
function tileWindow(b, cam, W, H) {
  const t = b.tile;
  return {
    x0: Math.max(0, Math.floor((cam.x - b.origin.x) / t)),
    x1: Math.min(b.tw, Math.ceil((cam.x + W - b.origin.x) / t)),
    y0: Math.max(0, Math.floor((cam.y - b.origin.y) / t)),
    y1: Math.min(b.th, Math.ceil((cam.y + H - b.origin.y) / t))
  };
}

/* A band's `look.sky` is the colour above its ground line and `look.tint` is
   the rock below. A band whose `floorTy` is 0 has no sky region and every
   function below costs it nothing.

   QUANTISED, NOT INTERPOLATED: discrete bands rather than a 24-bit ramp, so
   the sky is a stack of tones you could name, and it gains a DEEPER ZENITH
   and a PALE HAZE that a two-stop ramp cannot express. The haze is anchored
   in PIXELS above the horizon, because it sits behind a terrain silhouette
   whose hilltops stand well above `floorTy`. Built once per BAND. */
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

  /* THE SKY REACHES THE SKYLINE, NOT THE HORIZON. Relief may put a valley
     floor below the ground line and the air over it is sky-exposed, so the
     backdrop there is sky rather than void. ONE RECT, NOT ONE PER COLUMN --
     the rows below the horizon are a single tone, so a per-column skyline
     would save only fill area opaque rock covers anyway. */
  const hz = Math.max(y0, y1);
  if (y2 > hz) R(g, 0, hz, W, y2 - hz, ramp[SKY_STEPS - 1]);

  drawClouds(g, b, f, top, horizon, y0, y1);
}

/* THREE LAYERS, AND WHAT MAKES THEM READ AS THREE IS THAT EVERYTHING VARIES
   TOGETHER -- size, speed, parallax and opacity must agree, or one layer of
   same-sized puffs is a texture rather than depth.

   `par` is how much of the CAMERA's HORIZONTAL motion the layer does not
   take, and it is HORIZONTAL ONLY: the camera's vertical motion is falling
   and climbing, and a cloud lagging downward out of its sky region would draw
   over the band above's rock. The drift is `f.t`, never `rand()`. */
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
      /* The base line is placed in the room LEFT OVER after the cloud's own
         height, so a tall cumulus cannot poke out of the top of its band's sky
         and over the rock of the band above. `y` then selects within that room
         rather than within the whole region. */
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

/* A FLAT BASE AND A LUMPY TOP, in two tones, which is the whole silhouette of a
   fair-weather cumulus and the reason the old three-rect puff read as a stack of
   bricks: it had neither. `y` is the cloud's BASE line and the shape grows
   upward from it, so a layer's vertical band means "how high the bases sit".
   The underside takes the darker tone because `LIGHT` comes from above; there is
   no second decision about that here.

   The lumps are DOMES rather than rectangles. A rectangle on a slab is what the
   first attempt drew and it read as a step, not a cloud -- and a cumulus is
   mostly defined by the roundness of its top against the flatness of its base. */
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

/* terrain */
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

/* TWO CUES, ONE PASS, AND THAT IS A REQUIREMENT: both walk the visible tile
   window of every visible band for one answer each, so two functions would
   walk it twice per frame. The cases are MUTUALLY EXCLUSIVE by construction,
   so their order is arbitrary.

   BOTH ARE OVERLAYS AND NOT CHUNK BAKES: a chunk canvas caches STATIC ROCK
   and these are LIVE conditions whose writers bump the epoch, never a chunk
   version. DEPLETION NEEDS TWO CUES, because a wash is invisible on granite
   and a notch on adamant, and the wash also mutes every `glint` pip at once.
   QUANTISED PER UNIT. No `rand()` and no model write. */

/* Alpha of the dust wash when a tile is one unit short of gone. Scaled by
   `spent / charge` below, so a charge-4 copper tile washes at 0.11 / 0.22 /
   0.33 over its three visible steps and never reaches this value -- the tile
   at full wash is the tile that has already broken. */
const DUST_MAX = 0.44;

function drawLiveTiles(g, f) {
  const { cam, W, H } = f;
  /* HOISTED OUT OF EVERY LOOP, and both halves matter. `anyGrowing` is a
     `Map.size` read, so with nothing planted -- which is the state of every
     run until the player fells a whole tree and chooses to plant the seed --
     the growth case below costs exactly one comparison for the entire frame
     rather than a `Map.has` per visible tile. `growTotal` is the one `eff()`
     call the case needs, and it is read once per frame rather than once per
     seedling so that two seedlings on screen can never be measured against
     different totals within one frame. */
  const anyGrowing = growingCount() > 0;
  const growTotal = anyGrowing ? eff('treeGrowSecs') : 0;

  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    const t = b.tile;
    const { x0, x1, y0, y1 } = tileWindow(b, cam, W, H);

    for (let ty = y0; ty < y1; ty++)
      for (let tx = x0; tx < x1; tx++) {
        /* case 2: a planted seed. Guarded on the hoisted size read
           above, then on a `Map.has` -- the same "ask the sparse map first,
           pay for the substance lookups afterwards" cull the depletion case
           below uses, for the same reason. `growingAt` and not
           `grownAt() > 0`: a seed planted this substep has zero seconds on it
           and must still draw at stage 0, which is exactly the read
           `model/growth.js` exports both queries to distinguish. */
        if (anyGrowing && growingAt(b, tx, ty)) {
          seedling(g, b.origin.x + tx * t - cam.x, b.origin.y + ty * t - cam.y,
                   t, stageAt(b, tx, ty, growTotal));
          continue;
        }

        /* THE CULL IS A MAP LOOKUP, and it is the cheapest one available: a
           tile with no accumulated work cannot be spent, whatever it is made
           of, and `dig.work` holds an entry only for tiles something has
           actually hit. So the substance lookups and the `eff()` call below
           are paid for a handful of tiles per frame rather than for the four
           thousand a viewport holds. */
        if (workAt(b, tx, ty) <= 0) continue;

        const charge = effChargeAt(b, tx, ty);
        if (charge <= 1) continue;                  // not a deposit: nothing to spend
        const d = progressAt(b, tx, ty, effHardAt(b, tx, ty), charge);
        /* UNITS ALREADY OUT OF THE GROUND, FLOORED WITH NO EPSILON so it can
           never claim a unit the rule has not dropped. Capped ONE SHORT of
           `charge`, because the last unit IS the break -- without the cap the
           frame between "work reached total" and "the rule cleared the tile"
           flashes a fully spent tile. */
        const spent = Math.min(charge - 1, Math.floor(d * charge));
        if (spent < 1) continue;

        const sx = b.origin.x + tx * t - cam.x, sy = b.origin.y + ty * t - cam.y;

        g.globalAlpha = DUST_MAX * spent / charge;
        R(g, sx, sy, t, t, INK.dust);
        g.globalAlpha = 1;

        /* ONE NOTCH PER UNIT TAKEN OUT. 2x2 with a lit lower lip, because
           `core/pixels.js#LIGHT` comes from above and the floor of a hollow is
           the part of it that catches light -- the same one declaration
           `view/paint.js`'s top faces and cliff faces read. Inset by a pixel
           so a notch never touches the tile edge and reads as a bite out of
           the seam instead. */
        for (let k = 0; k < spent; k++) {
          const nx = 1 + ((hash2(tx * 17 + k * 31, ty * 13 + 5) * (t - 3)) | 0);
          const ny = 1 + ((hash2(ty * 17 + k * 31, tx * 13 + 9) * (t - 3)) | 0);
          R(g, sx + nx, sy + ny, 2, 2, INK.pit);
          R(g, sx + nx, sy + ny + 2, 2, 1, INK.pitLip);
        }
      }
  }
}

/* THREE DISCRETE SILHOUETTES, NOT A CONTINUOUS INTERPOLATION. At 8 px a tile
   there are about six usable rows, so a continuous height spends most of 180
   seconds not visibly changing and then changes by one pixel.

   IT DRAWS OVER WHAT THE BAKE PUT THERE: a `timber/seed` tile has no form
   `look`, so it is painted as a timber cube, which at this scale reads as
   turned earth. STRICTLY INSIDE ITS OWN TILE, because the pixel-scope
   assertion in the visual suite is what proves this pass does anything. */

/* Fractions of `treeGrowSecs` at which the silhouette steps up. Two numbers
   for three stages, in thirds, so "roughly a third grown" in a test or an
   acceptance walkthrough means exactly stage 1. */
const SEED_STAGES = [1 / 3, 2 / 3];

function seedling(g, sx, sy, t, stage) {
  const cx = sx + (t >> 1) - 1;              // 2 px wide, centred, integer
  const base = sy + t - 1;                   // the tile's own bottom row

  /* STAGE 0 -- A SEED IN THE GROUND. Two pixels, sitting on the bottom row,
     with a single lit pixel above them: it has to be visible at a glance
     across a cavern and it must not look like a plant yet. */
  if (stage < SEED_STAGES[0]) {
    R(g, cx, base - 1, 2, 2, INK.seed);
    R(g, cx, base - 2, 1, 1, INK.leafHi);
    return;
  }

  /* STAGE 1 -- A SHOOT. A 1 px stem three rows tall with one leaf either
     side of its top, which is the smallest arrangement that reads as
     deliberately a plant rather than as a smudge. */
  if (stage < SEED_STAGES[1]) {
    R(g, cx, base - 3, 1, 4, INK.stem);
    R(g, cx - 1, base - 3, 1, 1, INK.leaf);
    R(g, cx + 1, base - 3, 1, 1, INK.leafHi);
    return;
  }

  /* STAGE 2 -- A SAPLING. The stem reaches most of the tile and carries two
     tiers of leaves, the upper pair wider than the lower, so the silhouette
     broadens toward the top the way the canopy it is about to become does.
     `t - 2` rows rather than `t`, so the sprite never touches the tile's top
     edge and cannot read as joined to whatever is in the tile above. */
  const h = Math.max(4, t - 2);
  R(g, cx, base - h + 1, 1, h, INK.stem);
  R(g, cx - 2, base - h + 2, 2, 1, INK.leaf);
  R(g, cx + 1, base - h + 2, 2, 1, INK.leafHi);
  R(g, cx - 1, base - h + 4, 1, 1, INK.leaf);
  R(g, cx + 1, base - h + 4, 1, 1, INK.leaf);
}

/* entities */
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

/* fields
   Fields do NOT go through the chunk cache. Those canvases exist to avoid
   repainting static rock; a heat plume changes every frame and would thrash
   them. So this is a viewport-culled pass that reads `fieldAt` and nothing else,
   and fog of war (below) is the same shape of pass for the same reason: a
   permanent bit per tile is still a LIVE read every frame, because the chunk
   canvas it would otherwise sit on caches the static rock underneath, not
   whether the player has earned the right to see it.
*/
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

/* TWO SEPARATE FACTS, ONE PASS EACH. `drawFog` hides a tile NEVER seen; this
   renders how lit one is RIGHT NOW, so a torch burning out darkens a
   remembered room without erasing the memory. Runs BEFORE fog, the one pass
   allowed to win outright. QUANTISED to three fixed alpha steps, and
   `DARK_ALPHA[0]` is close to opaque so a seen tile reads as
   remembered-but-dark rather than as fog.

   NOT ADDITIVE: the machine-fire glow paints with `'lighter'` and is gated on
   `seenAt`, because additive light shines through an opaque fog rect under
   it. This SUBTRACTS with ordinary alpha. */
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

/* THE ONE HARD RULE: an unrevealed tile is opaque REGARDLESS OF WHAT IS
   THERE, so it draws AFTER everything that could leak a hint and BEFORE the
   machine-fire glow, which is gated on `seenAt` itself. `seenAt` is the ONLY
   model call here.

   VIEWPORT-CULLED and RUN-MERGED. `tx <= x1` walks one sentinel column past
   the visible edge, never drawn, so a run still open at the edge flushes
   without a second copy of the flush logic. */
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

/* THE DEPTH TINT IS WORLD-ANCHORED: a row's alpha is a function of its place
   in the band stack and nothing else, so the same rock reads the same whatever
   the camera does. A frame-wide alpha off the camera centre stepped the whole
   screen 0.055 -> 0.440 the frame it crossed world-Y 768.

   Adjacent bands ramp over `TINT_SPAN` world px centred on the seam, half
   painted by each side. 32 px is 3 units of 255 per row across the widest
   ambient gap, under the ~5 where a row reads as an edge. */
const TINT_SPAN = 32;
const TINT_HALF = TINT_SPAN / 2;

const ambOf = b => b.cfg.look?.ambient ?? 1;

/* One rect per run of equal alpha, so a band interior costs one and a ramp row
   costs one each. Writes `stats.tint` from the same loop.
   ASSUMES `cam` is already integer (`render` rounds it) and leaves
   `globalAlpha` at 1. A band shorter than TINT_SPAN would have its two ramps
   meet; the `else` resolves that toward the upper seam, and no shipped band is
   under 320 px. */
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

/* atmosphere
   The world-anchored depth tint, then a vignette on top, because the frame edge
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

  /* A machine's halo is light and therefore belongs after the tint, or it would
     be dimmed by the dark it is supposed to push back -- which is also why it
     runs after `drawFog`, not before, and why it is gated on `seenAt` even
     though `drawFog` already ran: `glow` paints with `globalCompositeOperation
     'lighter'`, so it would ADD light straight through an opaque fog rect
     instead of being hidden by it. An active furnace's fire behind fog must
     not out itself by lighting the fog from within. */
  for (const m of machines) {
    if (!(m.fire > 0.02) || !seenAt(m.band, m.tx, m.ty)) continue;
    glow(g, m.box.x + m.box.w / 2 - cam.x, m.box.y + m.box.h - 2 - cam.y,
         12 + m.fire * 8, INK.heat, 0.4 * m.fire);
  }
}

/* `rules/cycles.js` stamps `run.arrival` with the world position and instant
   the director put a machine down. Both passes read that stamp, so neither
   knows WHICH machine arrived and no machine name reaches this file.

   TIME COMES FROM `run.t`, the same fixed accumulator the stamp was taken
   from, so the presentation runs the same length at 30 and 144 fps and it
   ENDS. Variety comes from `hash2` of the arrival's own position. Gated on
   the arrival being on screen. */

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

/* The machine climbing out of its own footprint, drawn in the machines pass
   in place of the ordinary `paintMachine` call. Clipped to its own base --
   which stands on the band floor -- so the part still underground is hidden
   by the ground instead of drawn in front of it. `save`/`restore` balance
   across the one painted call. */
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
   falling through it, and a flare where it lands.
   Screen px throughout; entered with `globalAlpha` at 1 and left at 1. */
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
     so two arrivals in different places scatter differently and the same
     arrival scatters the same way on every repaint. */
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

/* A one-line band label. THE WORST CONTRAST CASE IN THE GAME: drawn straight
   onto rendered terrain with no panel and nothing to back against, so it takes
   both the secondary body tone and `drawText`'s shadow argument.

   IT CURRENTLY HAS NO CALLER -- exported, and nothing in `src/`, `tools/` or
   `tests/` invokes it, so the band name is not on screen today. Wiring it back
   is a HUD-layout decision about which anchor it hangs from. */
export function bandLabel(g, f) {
  const b = player.band;
  if (!b) return;
  drawText(g, b.name, 6, f.H - 26, colour('uiInk2'), 1, 1, colour('uiShade'));
}

/* Chips are drawn from `view/fx.js`; re-exported so `shell` has one import for
   the whole draw surface and does not have to know how the passes are split. */
export { chips };
