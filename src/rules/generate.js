/* rules layer — worldgen. Reads the `strata` array off a `data/world.js` row and
   writes tiles; `model/world.js` allocates the array and this file decides
   what is in it.

   `KINDS` below is keyed by strata kind, and the assertion at the bottom throws
   at import if `data/world.js#STRATA_KINDS` names one with no handler here.

   All randomness goes through `rand()` in a fixed traversal order: bands in
   declaration order, strata rows in row order, columns left to right. `hash2`
   appears nowhere below — it is stateless, so it would hand every seed the
   identical hills and the identical strata fingers. */

import { clamp } from '../core/math.js';
import { rand, randInt, randRange } from '../core/rng.js';
import { NATIVE } from '../data/forms.js';
import { S, SUB } from '../data/substances.js';
import { BANDS, STRATA_KINDS } from '../data/world.js';
import { eff } from '../model/mods.js';
import { write as tw, solidAt, subAt } from '../model/tiles.js';
import { inBounds } from '../model/world.js';

/* Half-width in tiles of the guaranteed flat shelf around the spawn column;
   the relief map pins it to the band's own `floorTy`, and `trees` and
   `hollows` refuse it. 9 gives the 19 columns that standing at the 3.2-tile
   aim reach and placing a 3-wide footprint needs. */
const SHELF = 9;

/* Fraction of a layer's top row carved away in a band with no relief row, so a
   flat stratum boundary reads as ground rather than a ruled line. One tile
   deep only, or `floorTy` stops meaning what `data/world.js` says it does. */
const LIP = 0.35;

/* Four passes build a landform: a trend octave places the uplands and
   lowlands, raised-cosine summits sit on top, two 1-2-1 passes smooth the
   float profile, and a clamp to the row's budget flattens the extremes. */
/* Not a sum of octaves: three summed octaves change direction 37 to 52 times
   per 128 columns, which reads as sawtooth. */

/* Tiles between trend lattice points, so the trend is one broad feature per
   two or three screens. */
const TREND_PERIOD = 40;

/* How much of the relief budget the trend claims either way from its own
   centre line; the summits spend the rest. At 0.3 a trend high under a tall
   summit hits the clamp on most seeds, and a clamped summit is a mesa. */
const TREND_SHARE = 0.20;

/* Tiles of world per summit, so a wider band gets more hills rather than wider
   ones. 1,024 columns gives 51 summits. */
const HILL_SPACING = 20;

/* Summit height in tiles, never under `HILL_LOW` nor over `HILL_SHARE` of the
   row's own upward budget. The hop clears a summit under 3 tiles, which would
   read as the per-column noise this pass exists to remove. */
const HILL_LOW = 3;
const HILL_SHARE = 0.72;

/* Half-width per tile of summit height, and the factor the draw may widen it
   by. A raised cosine has maximum slope `pi h / 2w`, so `w >= (pi/2) h` holds
   the one-tile-per-column limit the auto-step imposes; 1.6 rounds pi/2 up. */
const HILL_SLOPE = 1.6;
const HILL_WIDE  = 1.8;

const SMOOTH_PASSES = 2;
const RELIEF = 6;        // tiles above `floorTy` a relief row declaring no `amp` gets
const FADE   = 36;       // rows below the ground line at which relief reaches 0
const BLEND  = 10;       // columns either side of the shelf the relief fades in over

/* The hop clears exactly one tile and `rules/player.js#moveX`'s auto-step is
   gated on `onGround || onLadder`, so adjacent columns differ by at most one
   tile — except a descent away from spawn, which may drop `STEP_BIG` no more
   often than every `STEP_GAP` columns and never inside `SAFE_R` of spawn. */
const STEP_BIG = 2;
const STEP_GAP = 12;
const SAFE_R   = 24;     // tiles around spawn where the first two minutes live

/* How far a per-column bias may push the upper material's probability ramp.
   Without it the ramp dithers into static; with it the same column keeps
   winning several rows running and the boundary grows fingers. */
const CONTACT_BIAS = 0.45;

/* Rows of rock that must remain between a hollow's ceiling and the top of the
   solid column above it. Two also keeps `model/tiles.js#skyExposedAt` honest —
   a hollow reaching row 0 would grow grass on a cave floor. */
const HOLLOW_ROOF = 2;

/* A hollow is wider than it is tall by this factor — a room, not a chimney. */
const HOLLOW_ASPECT = 1.5;

/* Fraction of a lined hollow's wall cells that get an ore cluster stamped
   into the rock behind them. */
const HOLLOW_VEIN = 0.14;

/* Arm directions for `star`: the first four orthogonal, the rest diagonal, so a
   small cluster is a plus sign and a big one a star. `ORE_LONG` is the radius
   above which an arm may be two cells long, `ORE_FAT` above which arms grow a
   shoulder. */
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const ORE_LONG = 2.4;
const ORE_FAT  = 2.8;

/* `dens` is attempts per 10,000 tiles of the row's own window. A density
   rather than a count, so widening a band does not dilute the ore per
   screen. */
const attempts = (b, top, bot, dens) => Math.round(dens * (bot - top) * b.tw / 1e4);

const KINDS = {

  /* Writes no tiles: fills `ctx.off`, the signed row offset every later pass in
     this band shifts its declared boundaries by. Must be declared first in a
     band's `strata`; a band without this row is flat. */
  relief(b, row, ctx) { ctx.off = heightmap(b, row); },

  /* A solid band of one element across the full width, boundaries following
     `ctx.off`. The top row gets the ragged lip by default; `lip:false` opts out
     a layer given its own `fromTy`, whose top row is not the top of the world
     and would otherwise get air pockets punched along the seam. */
  /* Two adjacent layers cannot part company: a boundary's offset is a function
     of the declared row, so the upper row's `toTy` and the lower row's
     `fromTy` resolve to the identical shifted row. */
  layer(b, row, ctx) {
    const sub = S[row.sub];
    for (let tx = 0; tx < b.tw; tx++) {
      const top = Math.max(0, row.fromTy + shift(ctx, b, tx, row.fromTy));
      const bot = Math.min(b.th, row.toTy + shift(ctx, b, tx, row.toTy));
      for (let ty = top; ty < bot; ty++) {
        /* `!ctx.off` is "this band is flat". The carve is an independent coin
           flip per column, so over a height map it can land beside a raised
           column and leave a two-tile face the hop cannot clear. */
        if (ty === top && row.lip !== false && !ctx.off &&
            !onShelf(b, tx) && rand() < LIP) continue;
        tw.set(b, tx, ty, sub, NATIVE);
      }
    }
  },

  /* A strata boundary is a band `thick` tiles deep where the two materials
     interdigitate: a probability ramp plus a per-column bias, so the result is
     blocky fingers rather than static. `at` is the declared boundary row, and
     `thick` comes off the row, so a gradational and a sharp seam are numbers. */
  contact(b, row, ctx) {
    const up = S[row.upper], lo = S[row.lower];
    const half = (row.thick ?? 4) / 2;
    const bias = correlated(b.tw);
    for (let tx = 0; tx < b.tw; tx++) {
      const at = row.at + shift(ctx, b, tx, row.at);
      const top = Math.max(0, Math.round(at - half));
      const bot = Math.min(b.th, Math.round(at + half));
      for (let ty = top; ty < bot; ty++) {
        /* 1 at the top of the band, ~0 at the bottom, pushed either way by
           the column's own bias — which is what grows a finger. */
        const p = clamp((at + half - ty) / (2 * half) + bias[tx] * CONTACT_BIAS, 0, 1);
        tw.set(b, tx, ty, rand() < p ? up : lo, NATIVE);
      }
    }
  },

  /* Air carved out of solid rock, after the strata and before the ore. Density
     rises with depth, and the shape is a short random walk stamping a squashed
     disc, so a hollow is blobby rather than rectangular. */
  /* Built as a cell list, then judged, then written, so one that fails
     `hollowOk` was never carved rather than backfilled. Nothing marks a hollow
     hidden: it is unseen because `b.seen` is false and unlit. */
  hollows(b, row, ctx) {
    const top = Math.max(0, row.fromTy), bot = Math.min(b.th, row.toTy);
    if (bot <= top) return;
    const margin = Math.ceil(row.r[1]);
    const tries = attempts(b, top, bot, row.dens);
    for (let n = 0; n < tries; n++) {
      const cx = randInt(0, b.tw - 1);
      const cy = clamp(
        top + Math.floor((bot - top) * Math.pow(rand(), row.bias ?? 1)),
        top + margin, bot - margin - 1);
      const cells = hollowCells(b, cx, cy, row);
      if (!hollowOk(b, cells, top, bot)) continue;
      let lo = b.th, hi = 0;
      for (const c of cells) { tw.clear(b, c.tx, c.ty); if (c.ty < lo) lo = c.ty; if (c.ty > hi) hi = c.ty; }
      /* `floor`/`height` are recorded, not acted on; the spawn guard in
         `hollowOk` is what keeps a deep hollow away from spawn. */
      const h = { cx, cy, cells, top: lo, floor: hi, height: hi - lo + 1, line: -1 };
      /* The deepest declared lining row whose window holds this hollow claims
         it, so the ore is graded by depth rather than by which row is declared
         first. `blobs` reads the flag. */
      if (rand() < eff('hollowOre'))
        b.cfg.strata.forEach((r, i) => {
          if (r.kind === 'blobs' && r.line && cy >= r.fromTy && cy < r.toTy) h.line = i;
        });
      ctx.hollows.push(h);
    }
  },

  /* Scattered cruciform clusters, each at a random column and row inside the
     declared window. `star()` is asked for solid cells only, so a carved room
     stays a room. `line:true` also lines the walls of the hollows this row
     claimed above. */
  blobs(b, row, ctx) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    if (bot <= top) return;
    const tries = attempts(b, top, bot, row.dens);
    for (let n = 0; n < tries; n++) {
      const cx = randInt(0, b.tw - 1);
      const cy = randInt(top, bot - 1);
      star(b, cx, cy, randRange(row.r[0], row.r[1]), sub, true);
    }
    if (!row.line) return;
    for (const h of ctx.hollows) if (h.line === ctx.i) lineWalls(b, h, row, sub);
  },

  /* One guaranteed cluster at a named landmark, `n` stars deep so an unlucky
     arm roll cannot thin it away. `near:'spawn'` resolves here rather than in
     `data/world.js`, since spawn is a fact about the band record. Unlike
     `blobs`, this writes into air as well as rock. */
  vein(b, row) {
    const { cx, cy } = veinAt(b, row);
    star(b, cx, cy, row.r, S[row.sub]);
    for (let n = 1; n < (row.n ?? 1); n++)
      star(b, cx + randInt(-2, 2), cy + randInt(0, 2), row.r * 0.8, S[row.sub]);
  },

  /* Standing trunks, grown up from whatever surface a column has.
     `fromTy`/`toTy` is the window a trunk's base may sit in, not the extent of
     the trunk, so with relief the window has to span every height the map can
     produce. */
  trees(b, row) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    const stand = row.grove ? groves(b, row.grove.spacing, row.grove.spread) : null;
    for (let tx = 0; tx < b.tw; tx++) {
      /* One draw per column whether or not it is in a grove, so the mask moves
         trees without moving the rest of the seed's draw sequence. `rand()` is
         never 1, so a chance of 0 always skips. */
      if (rand() >= (!stand || stand[tx] ? row.chance : 0)) continue;
      if (onShelf(b, tx)) continue;                  // never in front of spawn
      let base = -1;
      for (let ty = top; ty < bot; ty++) if (solidAt(b, tx, ty)) { base = ty; break; }
      if (base < 0) continue;
      const h = randInt(row.height[0], row.height[1]);
      for (let k = 1; k <= h; k++) tw.set(b, tx, base - k, sub, NATIVE);
    }
  }
};

/* Apply every strata row of a band, in row order. The band's tile array is
   freshly allocated and therefore all air when this is called, so there is no
   clear step. */
/* `ctx` is this band's generation scratch and dies with the call: the height
   map one pass computes and four later ones read, the hollow records the ore
   pass reads, and the index of the row being applied. */
export function generate(b) {
  const ctx = { off: null, hollows: [], i: 0 };
  b.cfg.strata.forEach((row, i) => { ctx.i = i; KINDS[row.kind](b, row, ctx); });
  unsealOreBodies(b);
}

/* `star()` overwrites whatever a cell held, so a later higher-tier row can box
   in an earlier lower-tier ore tile — about 2.5% of seeds. Scoped to
   `metal`-tagged substances: plain rock inside a higher tier is ordinary. */
/* `reachesAir` floods through tiles already diggable at this ore's own tier,
   the same claim the worldgen property test makes, so the two cannot disagree.
   When it says no, `carvePathToStone` carves unrestricted to open air. */
function unsealOreBodies(b) {
  for (let ty = 0; ty < b.th; ty++) {
    for (let tx = 0; tx < b.tw; tx++) {
      const sub = subAt(b, tx, ty);
      if (sub < 0 || !SUB[sub].tags?.includes('metal')) continue;
      const tier = SUB[sub].tile?.tier ?? 1;
      if (!reachesAir(b, tx, ty, tier)) carvePathToStone(b, tx, ty);
    }
  }
}

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/* Flood-fill from `(sx, sy)` through tiles that are air, or solid at or below
   `maxTier`, returning true the instant an air tile is found. Capped at the
   band's tile count, so unsealed ore pays only for a small local search. */
function reachesAir(b, sx, sy, maxTier) {
  const key = (x, y) => y * b.tw + x;
  const seen = new Set([key(sx, sy)]);
  const q = [[sx, sy]];
  const cap = b.tw * b.th;
  while (q.length && seen.size < cap) {
    const [x, y] = q.shift();
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(b, nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!solidAt(b, nx, ny)) return true;
      const nsub = subAt(b, nx, ny);
      if (nsub >= 0 && (SUB[nsub].tile?.tier ?? 1) <= maxTier) { seen.add(k); q.push([nx, ny]); }
      else seen.add(k);
    }
  }
  return false;
}

/* Shortest path from `(sx, sy)` to the nearest air tile, through any tile
   regardless of tier — this carves rather than checks. Every tile on the path
   becomes `stone` except the destination, already air, and `(sx, sy)` itself,
   the ore tile this repairs around. */
function carvePathToStone(b, sx, sy) {
  const key = (x, y) => y * b.tw + x;
  const parent = new Map();
  const seen = new Set([key(sx, sy)]);
  const q = [[sx, sy]];
  let target = null;
  while (q.length && !target) {
    const [x, y] = q.shift();
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(b, nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      parent.set(k, [x, y]);
      if (!solidAt(b, nx, ny)) { target = [nx, ny]; break; }
      q.push([nx, ny]);
    }
  }
  if (!target) return;                            // no air anywhere in the band

  let [x, y] = parent.get(key(target[0], target[1]));
  while (!(x === sx && y === sy)) {
    tw.set(b, x, y, S.stone, NATIVE);
    [x, y] = parent.get(key(x, y));
  }
}

/* One octave of value noise, `amp` tiles either way, smoothstepped between
   lattice points `period` tiles apart. The lattice is drawn from `rand()`. */
function octave(tw, period, amp) {
  const n = Math.ceil(tw / period) + 2;
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) k[i] = randRange(-amp, amp);
  const out = new Float64Array(tw);
  for (let tx = 0; tx < tw; tx++) {
    const p = tx / period, i = p | 0, f = p - i;
    const s = f * f * (3 - 2 * f);                    // smoothstep: no creases
    out[tx] = k[i] * (1 - s) + k[i + 1] * s;
  }
  return out;
}

/* The signed per-column row offset of the ground line from the band's own
   `floorTy`, negative up because a tile row grows downward: `-row.amp` at a
   hilltop to `+row.dip` at a valley floor. */
/* Pass order is fixed. Trend, summits, smooth and clamp shape the profile;
   then the shelf is pinned, the relief blended either side of it, and the step
   pass walks outward so nothing leaves a face the player cannot climb. */
function heightmap(b, row) {
  const up = row.amp ?? RELIEF;
  const down = row.dip ?? 0;

  /* Height above `floorTy` in tiles, float and unrounded until the clamp:
     rounding between the trend and the summits would quantise every flank to
     one staircase. */
  const h = new Float64Array(b.tw);
  const reach = (up + down) * TREND_SHARE;
  const trend = octave(b.tw, TREND_PERIOD, reach);
  /* Centred so a trend minimum carrying no summit lands on the valley floor,
     which is what makes `dip` the number it claims to be. */
  for (let tx = 0; tx < b.tw; tx++) h[tx] = reach - down + trend[tx];

  summits(h, b.tw, up);
  for (let n = 0; n < SMOOTH_PASSES; n++) smooth(h, b.tw);

  const off = new Int16Array(b.tw);
  for (let tx = 0; tx < b.tw; tx++) off[tx] = -Math.round(clamp(h[tx], -down, up));

  const sx = b.cfg.spawnTx;
  if (sx !== undefined)
    for (let tx = 0; tx < b.tw; tx++) {
      const d = Math.abs(tx - sx);
      if (d <= SHELF) { off[tx] = 0; continue; }                     // the shelf
      if (d > SHELF + BLEND) continue;
      /* Smoothstepped: a linear ramp out of a flat shelf holds one slope for
         its whole width and renders as a flight of stairs, where an S-curve
         leaves the shelf flat, steepens, then settles into the landform. */
      const k = (d - SHELF) / (BLEND + 1);
      off[tx] = Math.round(off[tx] * k * k * (3 - 2 * k));
    }

  const anchor = sx ?? 0;
  stepPass(off, b.tw, clamp(anchor + SHELF, 0, b.tw - 1), +1, anchor);
  stepPass(off, b.tw, clamp(anchor - SHELF, 0, b.tw - 1), -1, anchor);
  return off;
}

/* `tw / HILL_SPACING` raised-cosine summits, in tiles of height. The three
   draws per summit run centre, height, width, and that order is fixed: seed
   reproducibility depends on it. */
/* Each summit takes one column at random from its own slice of the band, so
   spacing reads as irregular where a uniform scatter left one seed in three
   with a 70-column dead plain. A summit the band edge clips is kept. */
function summits(h, tw, up) {
  const n = Math.max(1, Math.round(tw / HILL_SPACING));
  const tall = Math.max(HILL_LOW, up * HILL_SHARE);
  for (let k = 0; k < n; k++) {
    const lo = Math.round(k * tw / n), hi = Math.round((k + 1) * tw / n) - 1;
    const cx = randInt(lo, Math.max(lo, hi));
    const hh = randRange(HILL_LOW, tall);
    const w = Math.max(1, Math.round(hh * HILL_SLOPE * randRange(1, HILL_WIDE)));
    for (let dx = -w; dx <= w; dx++) {
      const tx = cx + dx;
      if (tx < 0 || tx >= tw) continue;
      h[tx] += hh * 0.5 * (1 + Math.cos(Math.PI * dx / w));
    }
  }
}

/* A per-column mask of where trees may stand: one grove centre per slice of
   `spacing` columns, at a random column inside it, covering `spread` either
   side. Mirrors `summits`, so slicing keeps the spacing irregular. */
/* A centre landing on the spawn shelf is pushed clear rather than filtered;
   deleting the grove column by column would leave no timber within reach of
   spawn. */
function groves(b, spacing, spread) {
  const mask = new Uint8Array(b.tw);
  const n = Math.max(1, Math.round(b.tw / spacing));
  const sx = b.cfg.spawnTx;
  for (let k = 0; k < n; k++) {
    const lo = Math.round(k * b.tw / n), hi = Math.round((k + 1) * b.tw / n) - 1;
    let cx = randInt(lo, Math.max(lo, hi));
    if (sx !== undefined && Math.abs(cx - sx) <= SHELF + spread)
      cx = sx + (cx < sx ? -1 : 1) * (SHELF + spread + 1);
    for (let tx = Math.max(0, cx - spread), e = Math.min(b.tw - 1, cx + spread); tx <= e; tx++)
      mask[tx] = 1;
  }
  return mask;
}

/* One 1-2-1 pass over the profile, in place, holding both end columns.
   Consumes no randomness, and keeps a single-column spike out of the rounded
   result. */
function smooth(h, tw) {
  let prev = h[0];
  for (let tx = 1; tx < tw - 1; tx++) {
    const cur = h[tx];
    h[tx] = (prev + 2 * cur + h[tx + 1]) / 4;
    prev = cur;
  }
}

/* Sweeps outward from the shelf, never toward it, so the shelf and its blend
   are this pass's fixed point rather than something it can smooth away.
   `d > 0` is the ground descending as you walk away from spawn. */
function stepPass(off, tw, from, dir, anchor) {
  let prev = off[from], lastBig = -Infinity;
  for (let tx = from + dir; tx >= 0 && tx < tw; tx += dir) {
    let d = off[tx] - prev;
    /* `SAFE_R + 1`, not `SAFE_R`: a step is a face BETWEEN two columns, and
       both of them have to be outside the radius for the face to be. */
    const room = Math.abs(tx - anchor) > SAFE_R + 1 && Math.abs(tx - lastBig) >= STEP_GAP;
    if (d > (room ? STEP_BIG : 1)) d = room ? STEP_BIG : 1;
    else if (d < -1) d = -1;                        // a rise outward is never big
    off[tx] = prev + d;
    if (d > 1) lastBig = tx;
    prev = off[tx];
  }
}

/* The row a boundary declared at `ty` actually occupies in column `tx`. Relief
   fades linearly to nothing `FADE` rows below the band's ground line, so the
   deep strata inherit no surface wobble. */
function shift(ctx, b, tx, ty) {
  if (!ctx.off) return 0;
  const k = 1 - (ty - (b.cfg.floorTy ?? 0)) / FADE;
  return k <= 0 ? 0 : Math.round(ctx.off[tx] * Math.min(1, k));
}

/* Per-column noise in [-1,1], smoothed against its neighbours. One draw per
   column, in column order, like everything else here. */
function correlated(tw) {
  const j = new Float64Array(tw);
  for (let tx = 0; tx < tw; tx++) j[tx] = rand() * 2 - 1;
  const out = new Float64Array(tw);
  for (let tx = 0; tx < tw; tx++)
    out[tx] = (j[Math.max(0, tx - 1)] + 2 * j[tx] + j[Math.min(tw - 1, tx + 1)]) / 4;
  return out;
}

/* The candidate cells of one hollow: a short random walk, stamping a squashed
   disc at each step. `core/pixels.js#walk` is a drawing helper in screen
   pixels and is not reused here. */
function hollowCells(b, cx, cy, row) {
  const seen = new Set();
  const cells = [];
  let x = cx, y = cy;
  for (let s = 0, n = randInt(row.steps[0], row.steps[1]); s < n; s++) {
    const r = randRange(row.r[0], row.r[1]), rr = r * r, ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy * HOLLOW_ASPECT * HOLLOW_ASPECT > rr) continue;
        const tx = x + dx, ty = y + dy, k = ty * b.tw + tx;
        if (seen.has(k)) continue;
        seen.add(k);
        cells.push({ tx, ty });
      }
    x += randInt(-2, 2);
    y += randInt(-1, 1);
  }
  return cells;
}

/* Every reason a candidate hollow is thrown away whole. */
function hollowOk(b, cells, top, bot) {
  const solidTop = new Map();
  for (const c of cells) {
    if (!inBounds(b, c.tx, c.ty) || c.ty < top || c.ty >= bot) return false;
    /* A candidate touching air already carved would merge with it, and two
       merged hollows are a fall twice as long as the row's size key allows.
       Out of bounds reads bedrock, so the band edge needs no special case. */
    if (!solidAt(b, c.tx, c.ty) ||
        !solidAt(b, c.tx - 1, c.ty) || !solidAt(b, c.tx + 1, c.ty) ||
        !solidAt(b, c.tx, c.ty - 1) || !solidAt(b, c.tx, c.ty + 1)) return false;
    /* The shelf columns carry the tutorial shaft and the guaranteed vein, and
       nothing within `SAFE_R` of the spawn tile may kill. */
    if (onShelf(b, c.tx) || nearSpawn(b, c.tx, c.ty)) return false;
    if (!solidTop.has(c.tx)) solidTop.set(c.tx, firstSolid(b, c.tx));
    if (c.ty - solidTop.get(c.tx) < HOLLOW_ROOF) return false;      // the ceiling rule
  }
  return cells.length > 0;
}

const firstSolid = (b, tx) => {
  for (let ty = 0; ty < b.th; ty++) if (solidAt(b, tx, ty)) return ty;
  return b.th;
};

/* Stamps ore clusters centred on wall cells, asked for solid cells only, so
   the ore is embedded in the rock face rather than floating in the room. */
function lineWalls(b, h, row, sub) {
  const wall = h.cells.filter(c =>
    solidAt(b, c.tx - 1, c.ty) || solidAt(b, c.tx + 1, c.ty) ||
    solidAt(b, c.tx, c.ty - 1) || solidAt(b, c.tx, c.ty + 1));
  if (!wall.length) return;
  const n = Math.max(2, Math.round(wall.length * HOLLOW_VEIN));
  for (let k = 0; k < n; k++) {
    const c = wall[randInt(0, wall.length - 1)];
    star(b, c.tx, c.ty, randRange(row.r[0], row.r[1]), sub, true);
  }
}

/* A centre cell plus 4-8 arms of length 1-2, orthogonals first. `r` is the
   row's own `r:[min,max]` draw, so tier sizing stays content. */
/* `onlySolid` keeps ore out of a carved hollow. The arm variation is `rand()`:
   `hash2` would give every seed the identical arms. */
function star(b, cx, cy, r, sub, onlySolid = false) {
  const put = (tx, ty) => {
    if (!inBounds(b, tx, ty)) return;
    if (onlySolid && !solidAt(b, tx, ty)) return;
    tw.set(b, tx, ty, sub, NATIVE);
  };
  put(cx, cy);
  const arms = clamp(Math.round(r * 2), 4, DIRS.length);
  for (let i = 0; i < arms; i++) {
    const [dx, dy] = DIRS[i];
    const len = randInt(1, r > ORE_LONG ? 2 : 1);
    for (let k = 1; k <= len; k++) put(cx + dx * k, cy + dy * k);
    if (r > ORE_FAT && rand() < 0.5)                  // a shoulder, so a fat
      put(cx + dx + (dy ? 1 : 0), cy + dy + (dx ? 1 : 0));   // vein reads fat
  }
}

/* Where a `near:'spawn'` vein lands. One expression, so the hollow guard and
   the vein cannot disagree about it. */
const veinAt = (b, row) => ({
  cx: row.near === 'spawn' && b.cfg.spawnTx !== undefined ? b.cfg.spawnTx : (b.tw >> 1),
  cy: (b.cfg.floorTy ?? 0) + (row.dy ?? 0)
});

const onShelf = (b, tx) =>
  b.cfg.spawnTx !== undefined && Math.abs(tx - b.cfg.spawnTx) <= SHELF;

/* Within `SAFE_R` tiles of the spawn tile, measured from `floorTy`. */
const nearSpawn = (b, tx, ty) => {
  const sx = b.cfg.spawnTx;
  if (sx === undefined) return false;
  const dy = ty - (b.cfg.floorTy ?? 0), dx = tx - sx;
  return dx * dx + dy * dy <= SAFE_R * SAFE_R;
};

/* A content row naming a kind nothing implements throws at import rather than
   silently generating no vein. */
for (const kind of STRATA_KINDS)
  if (typeof KINDS[kind] !== 'function')
    throw new Error(`generate: no handler for strata kind "${kind}"`);

/* A row declaring `count` instead of `dens` would read `row.dens` as
   undefined, scatter zero clusters and leave a band of bare rock that every
   worldgen property still passes. */
for (const b of BANDS)
  for (const row of b.strata)
    if (row.count !== undefined)
      throw new Error(`generate: ${b.id} "${row.kind}" row declares count ${row.count}; use dens (attempts per 10,000 window tiles)`);
