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

   PASS ORDER: void, then per band (sky, then chunks), then depletion, machines,
   items, player, chips, field overlay, darkness, fog of war, atmosphere, debug,
   HUD. Anything that reads as lighting comes after everything it lights.
   See docs/DEVELOPER_GUIDE.md#pass-order-and-darkness */

import { drawText } from '../core/font.js';
import { blend, mix } from '../core/palette.js';
import { R, glow, lineTo } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { colour } from '../data/palette.js';
import { FIELDS } from '../data/world.js';
import { fieldAt, hasField } from '../model/fields.js';
import { items } from '../model/items.js';
import { machines } from '../model/machines.js';
import { progressAt, workAt } from '../model/mining.js';
import { eff } from '../model/mods.js';
import { PH, PW, player } from '../model/player.js';
import { hasPick, run } from '../model/run.js';
import { bandAt, bands, chunkPx, heightPx, lightAt, seenAt, widthPx } from '../model/world.js';
import { chips, drawChips } from './fx.js';
import { drawHUD } from './hud.js';
import { drawOverview } from './overview.js';
import { beginFrame, chunkCanvas, effChargeAt, effHardAt, paintItem, paintMachine } from './paint.js';

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
  pitLip: colour('limeD')
};

export const stats = { chunksDrawn: 0, bandsDrawn: 0 };

/* `f` is the frame context assembled by `shell/main.js`:
     { cam:{x,y}, t, dt, frame, W, H, flags }
   Passed in rather than imported, because the clock and the camera are devices'
   business and `view` may not import `shell`.
   See docs/DEVELOPER_GUIDE.md#the-frame-context */
export function render(g, f) {
  const { cam, W, H } = f;
  cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);
  beginFrame();

  R(g, 0, 0, W, H, INK.void);
  stats.chunksDrawn = 0; stats.bandsDrawn = 0;

  /* THE MAP OVERVIEW IS A DIFFERENT RENDER PATH, NOT A CAMERA TRICK, and as of
     Phase 9 it is a different FILE: `view/overview.js`, which owns its own
     scale, scroll, zoom, band ruler and metadata layers. It used to be
     `drawMap`, thirty-seven lines in this file; the extraction is recorded in
     that file's own header. Nothing past this point (sky, chunks, machines,
     items, the walking player sprite, fields, fog, atmosphere, the HUD)
     executes while the map is open -- the map is a full substitute frame, not
     an overlay on top of the ordinary one. */
  if (f.flags.showMap) { drawOverview(g, f); return; }

  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    stats.bandsDrawn++;
    drawSky(g, b, f);
    drawChunks(g, b, cam, W, H);
  }

  /* Terrain paint, so it runs with the terrain: a machine, an item or the
     player standing in front of a worked-out vein must cover the cue, and
     darkness and fog (both later) must dim and hide it exactly as they do the
     rock it sits on. */
  drawDepletion(g, f);

  for (const m of machines)
    paintMachine(g, m, (m.box.x - cam.x) | 0, (m.box.y - cam.y) | 0, f.t);

  drawItems(g, f);
  drawPlayer(g, f);
  drawChips(g, cam, W, H);
  drawFields(g, f);
  drawDarkness(g, f);
  drawFog(g, f);
  atmosphere(g, f);

  if (f.flags.showGrid)   overlay(g, cam, W, H, player.band?.tile ?? 8, INK.grid, 0.16);
  if (f.flags.showChunks) overlay(g, cam, W, H, player.band ? chunkPx(player.band) : 128, INK.chunk, 0.5);

  drawHUD(g, f);
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

/* ---------- sky ----------
   A band's `look.sky` is the colour above its ground line and `look.tint` is
   what the rock below is made of. A band whose `floorTy` is 0 (the deep ones)
   has no sky region at all and every function below costs it nothing.

   QUANTISED, NOT INTERPOLATED. This was one `createLinearGradient` from `sky`
   to `sky`-mixed-with-`tint`, which is a smooth 24-bit ramp in a game whose
   every other pixel comes off a named palette (SPEC section 6). It is now a
   fixed number of discrete bands, so the sky is a stack of tones you could name
   rather than a continuous blend, and it gains the two things a two-stop ramp
   cannot express: a DEEPER ZENITH (the sky's own colour pushed toward `aquA`,
   because the top of the sky is further from the sun than the horizon is) and a
   PALE HAZE where it meets the ground.

   The haze is anchored in PIXELS above the horizon rather than as a fraction of
   the sky, because what it has to sit behind is the terrain silhouette: Phase 7
   gives the surface band relief of `amp` tiles, so the hilltops stand well above
   `floorTy` and the haze has to reach up past them or it only ever shows in the
   valleys. It reaches as far as `HAZE_PX` and no further, so a tall sky is not
   all haze.

   THE RAMP IS BUILT ONCE PER BAND, not per frame: it depends on nothing but the
   band's own two colour names and its own sky height, all three constant for the
   life of a run. */
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
  const y0 = Math.max(0, top), y1 = Math.min(H, horizon);
  if (y1 <= y0) return;

  const ramp = skyRamp(b);
  const step = (horizon - top) / SKY_STEPS;
  for (let i = 0; i < SKY_STEPS; i++) {
    const ya = Math.max(y0, Math.round(top + step * i));
    const yb = i === SKY_STEPS - 1 ? y1 : Math.min(y1, Math.round(top + step * (i + 1)));
    if (yb > ya) R(g, 0, ya, W, yb - ya, ramp[i]);
  }

  drawClouds(g, b, f, top, horizon, y0, y1);
}

/* ---------- clouds ----------
   THREE LAYERS, AND WHAT MAKES THEM READ AS THREE IS THAT EVERYTHING VARIES
   TOGETHER. A single layer of same-sized puffs at one parallax factor is a
   texture; depth needs size, speed, parallax and opacity to agree. So: large
   slow cumulus far back, hazy and barely moving with the camera; a middle band;
   small fast wisps near the ground, opaque and sliding past.

   `par` is how much of the CAMERA's HORIZONTAL motion the layer does not take:
   1 pins a cloud to the screen (infinitely far), 0 pins it to the world (in the
   same plane as the rock). Horizontal only, and that is deliberate rather than
   unfinished — walking is where parallax is legible, while the camera's vertical
   motion is falling and climbing, and a cloud that lagged DOWNWARD out of its
   band's own sky region would either pop out at the edge or, worse, draw over
   the band above's rock. Clouds are world-anchored in y. `y` is the layer's
   vertical band as a fraction of the sky region, which is what keeps the big
   slow ones up top.

   DETERMINISTIC, and the drift is `f.t` and never `rand()`: two draws of one
   frame must be identical (ARCHITECTURE invariant 7). Every shape parameter
   comes from a per-cloud positional hash, so a cloud keeps its own silhouette as
   it crosses the sky instead of reshuffling every frame. */
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

/* A stepped half-ellipse, one integer row at a time. No `arc`, no fill path: a
   canvas curve would antialias its own edge, which is the one thing SPEC
   section 6 forbids outright. */
function dome(g, x, yb, w, h, col) {
  for (let j = 0; j < h; j++) {
    const k = (j + 0.5) / h;
    const cw = Math.max(2, Math.round(w * Math.sqrt(Math.max(0, 1 - k * k))));
    R(g, x + ((w - cw) >> 1), yb - 1 - j, cw, 1, col);
  }
}

/* ---------- terrain ---------- */
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

/* ---------- depletion ----------
   HOW SPENT A DEPOSIT IS (Phase 14c, docs/PLAN-phase14-mining-and-drops.md
   D14-G). Since Phase 14b a `deposit` tile yields `tile.charge` units before
   it is gone, so a copper wall you have half worked looks exactly like a fresh
   one -- you have to swing at a tile to find out whether there is anything
   left in it. This pass is the answer.

   IT IS AN OVERLAY AND NOT A CHUNK BAKE, for the reason
   `model/world.js`'s own band record states twice, once for `seen` and once
   for `light`: A CHUNK CANVAS CACHES THE STATIC ROCK TEXTURE, and depletion is
   a LIVE condition. `model/mining.js#write.add` bumps the epoch and never a
   chunk version, so a cue painted in `paintTile` would only ever be as fresh
   as the last time something else in that chunk happened to invalidate it --
   i.e. it would show what was true several swings ago, which is worse than
   showing nothing. (That is not a hypothesis: it is exactly what the crack
   marks in the bake do today, parked with a repro in docs/FINDINGS.md.)

   TWO CUES, BECAUSE ONE OF THEM ALWAYS READS BADLY SOMEWHERE. A pale wash
   alone is nearly invisible on granite (already a light grey) and a dark notch
   alone is nearly invisible on adamant (already near-black), so a spent tile
   gets both: the wash carries the read on the dark rows, the notches carry it
   on the light ones, and on copper -- warm mid-tone with a bright `glint` --
   both land. NO SUBSTANCE NAME IS INVOLVED (this file, like `view/paint.js`,
   names none): the cue is keyed on `charge`, so any future deposit row gets it
   for free and nothing else gets it at all.

   The wash also does the thing D14-G asks for without having to know how the
   glint was drawn: a `glint` pip is one bright pixel baked into the chunk, and
   pale dust laid over the tile MUTES every pip in it at once. Reproducing
   `view/treatments.js#glint`'s own pip coordinates here to over-paint them one
   by one was the first design and was rejected -- it is a second copy of a
   positional formula, and the two would drift the first time either changed.

   QUANTISED PER UNIT, not continuous: `spent / charge`, so the wash steps
   visibly the instant a unit falls out and holds still while the next one is
   being worked. Same argument `drawDarkness` below makes for its three fixed
   alpha steps, and the fractional remainder is deliberately not drawn here at
   all -- that is the crack's job (`view/paint.js#paintTile`, `unitProgressAt`).

   NO `rand()` AND NO MODEL WRITE (invariants 7 and 9). Notch positions come
   from `hash2` of the tile's own coordinates, so they sit still between frames
   and two draws of one frame are identical; the only model calls are
   `workAt` / `progressAt` and the two `view/paint.js` helpers, all reads.

   READS `model/mining.js` AND, THROUGH `view/paint.js`, `model/tiles.js`.
   D14-G names those two modules and no others. The hardness and charge
   helpers live in `paint.js` rather than being inlined twice because the crack
   in the bake and the cue here must never disagree about which numbers the
   rule mined the tile by -- see `effHardAt` / `effChargeAt` there. A
   same-layer `view -> view` import is legal and this file already had one. */

/* Alpha of the dust wash when a tile is one unit short of gone. Scaled by
   `spent / charge` below, so a charge-4 copper tile washes at 0.11 / 0.22 /
   0.33 over its three visible steps and never reaches this value -- the tile
   at full wash is the tile that has already broken. */
const DUST_MAX = 0.44;

function drawDepletion(g, f) {
  const { cam, W, H } = f;
  for (const b of bands) {
    if (!visible(b, cam, W, H)) continue;
    const t = b.tile;
    const { x0, x1, y0, y1 } = tileWindow(b, cam, W, H);

    for (let ty = y0; ty < y1; ty++)
      for (let tx = x0; tx < x1; tx++) {
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
        /* UNITS ALREADY OUT OF THE GROUND, derived from the same 0..1 read
           D14-G names rather than from a second division, and FLOORED WITH NO
           EPSILON so it can never claim a unit the rule has not actually
           dropped: `progressAt` is `work / (hard * charge)`, so `d * charge`
           lands within an ulp of `rules/mining.js`'s own
           `Math.floor(work / hard)` and errs low rather than high. A tile
           sitting exactly ON a unit boundary is measure-zero -- work
           accumulates in `dt * pickPower` increments -- and being one frame
           late with the cue is invisible where being one unit early would be
           a lie.

           Capped one short of `charge` for the same reason
           `model/mining.js#unitsCrossed` caps itself there: the last unit IS
           the break, and a tile at full charge is a tile that no longer
           exists. Without the cap the single frame between "work reached
           total" and "the rule cleared the tile" would flash a fully spent
           tile. */
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

/* ---------- entities ---------- */
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

/* ---------- fields ----------
   Fields do NOT go through the chunk cache. Those canvases exist to avoid
   repainting static rock; a heat plume changes every frame and would thrash
   them. So this is a viewport-culled pass that reads `fieldAt` and nothing else,
   and fog of war (below) is the same shape of pass for the same reason: a
   permanent bit per tile is still a LIVE read every frame, because the chunk
   canvas it would otherwise sit on caches the static rock underneath, not
   whether the player has earned the right to see it.
   See docs/DEVELOPER_GUIDE.md#view-cache-invalidation */
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

/* ---------- darkness ----------
   Two separate facts, one pass each: `drawFog` below hides a tile that has
   NEVER been seen, regardless of what is actually there -- that is memory,
   `model/world.js#b.seen`, permanent and one-way. This pass renders the OTHER
   fact, `b.light` -- how lit a tile is RIGHT NOW -- for tiles that already
   passed the fog test, so a torch burning out darkens a remembered room
   without erasing the memory of it. Runs after terrain, machines, items, the
   player, chips and the field overlay (everything it should darken has
   already been painted) and BEFORE `drawFog`, which is the one pass allowed
   to win outright -- an unseen tile must stay opaque regardless of light.

   QUANTISED to three fixed alpha steps over the tile's own painted colour,
   not a gradient: a torch is a prerequisite for reading detail, not a mood
   dial. `DARK_ALPHA[0]` is deliberately close to opaque -- both "a seen tile
   reads as remembered-but-dark, not as fog" (some of the true colour still
   shows through, where fog shows none) and "an ore vein is indistinguishable
   from rock below light ~4" (that same small remainder swamps a two-pixel
   glint) are true at once because 6% of a distinct base colour still reads as
   "differs from flat fog" while looking, at a glance, like plain dark rock.

   ROW-RUN COALESCED exactly like `drawFog` below: one wide rect per
   contiguous run of tiles sharing a bucket, not one rect per tile.

   NOT ADDITIVE. The existing machine-fire glow in `atmosphere()` paints with
   `globalCompositeOperation:'lighter'` and is gated on `seenAt` for a stated
   reason: additive light would shine straight through an opaque fog rect
   painted UNDER it. This pass is the opposite direction -- it SUBTRACTS
   brightness with ordinary alpha compositing, runs entirely before `drawFog`,
   and touches only tiles `seenAt` already allows -- so there is no matching
   way for it to leak information about an unseen tile from the other side. */
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

/* ---------- fog of war ----------
   The one hard rule this pass exists to enforce: an unrevealed tile is opaque
   REGARDLESS OF WHAT IS ACTUALLY THERE, so it draws AFTER terrain, machines,
   items, the player, chips and the field overlay -- everything that could
   possibly leak a hint about ground the player has not earned the right to
   see -- and BEFORE `atmosphere`'s machine-fire glow, which is gated on
   `seenAt` itself for the same reason (see below).

   `seenAt` IS THE ONLY MODEL CALL HERE. This file never calls
   `model/world.js#write.reveal` -- that write lives in `rules/reveal.js`,
   and `view` importing a `write` namespace at all is exactly what the
   epoch-unchanged-across-a-render check exists to catch.

   VIEWPORT-CULLED through the shared `tileWindow` every live tile pass uses,
   and RUN-MERGED: a freshly spawned band the player has barely explored is
   otherwise dozens of 8 px squares wide per row, so this walks
   each row once and paints one wide rect per contiguous run of unseen tiles
   instead. `tx <= x1` (not `<`) walks one extra "virtual" column past the
   visible edge purely as a sentinel that is never itself drawn (`hidden` is
   forced false there), so a run still open at the edge of the screen flushes
   without a second copy of the flush logic after the loop. */
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

/* ---------- atmosphere ----------
   Depth tint from the band under the camera's centre: its `look.ambient` is how
   much light the row claims reaches it. A vignette on top, because the frame
   edge is where the eye leaks out. */
function atmosphere(g, f) {
  const { cam, W, H } = f;
  const b = bandAt(cam.x + W / 2, cam.y + H / 2);
  const amb = b?.cfg.look?.ambient ?? 1;
  if (amb < 0.98) {
    g.globalAlpha = Math.min(0.55, (1 - amb) * 1.1);
    R(g, 0, 0, W, H, INK.void);
    g.globalAlpha = 1;
  }
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

function overlay(g, cam, W, H, pitch, col, alpha) {
  g.globalAlpha = alpha; g.fillStyle = col;
  for (let x = -(((cam.x % pitch) + pitch) % pitch); x < W; x += pitch) g.fillRect(x, 0, 1, H);
  for (let y = -(((cam.y % pitch) + pitch) % pitch); y < H; y += pitch) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
}

/* A one-line band label, so the seam between two bands is legible while the
   world is still this thin. `drawText` and not `fillText`, always.

   THE WORST CONTRAST CASE IN THE GAME, and the one the Phase 13a acceptance
   test is written about: it is drawn straight onto rendered terrain with NO
   panel, no backing block and nothing else near it to back against, so it
   takes both halves of that phase's fix -- the secondary body tone
   (`uiInk2`; it encodes nothing, it was grey only to sit quietly) AND
   `drawText`'s shadow argument, which is the branch of §2.4's rule for a site
   with nothing to be backed against.

   CAVEAT, FOUND WHILE DOING THAT AND NOT FIXED HERE: this function currently
   has NO CALLER. It is exported and nothing in `src/`, `tools/` or `tests/`
   invokes it, so the band name is not on screen at all today and the recolour
   above is latent. Wiring it back into the draw order is a HUD-layout
   decision (which anchor, whose bottom edge, D8) and is out of a
   contrast-only phase's scope; see docs/FINDINGS.md. */
export function bandLabel(g, f) {
  const b = player.band;
  if (!b) return;
  drawText(g, b.name, 6, f.H - 26, colour('uiInk2'), 1, 1, colour('uiShade'));
}

/* Chips are drawn from `view/fx.js`; re-exported so `shell` has one import for
   the whole draw surface and does not have to know how the passes are split. */
export { chips };
