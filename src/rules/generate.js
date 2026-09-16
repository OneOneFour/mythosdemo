/* LAYER rules — WORLDGEN. Reads the `strata` array off a `data/world.js` row
   and writes tiles. Imports `core`, `data`, `model`, and no other `rules`
   module; its place in the boot order is stated in `shell/boot.js`.

   Generation is `rules` and not `model` because "where does a copper blob go"
   is a decision. `model/world.js` allocates the array; this file decides what
   is in it.

   THE KIND TABLE IS THE WHOLE FILE. `data/world.js` exports `STRATA_KINDS`,
   and the assertion at the bottom fails at IMPORT if a kind has no handler
   here, so a typo'd kind is a build error rather than a silently missing vein.
   A layer, a vein or an ore field costs one row in `data/world.js`; a new KIND
   costs a handler here, once.

   ALL RANDOMNESS THROUGH `rand()`, in a fixed traversal order: bands in
   declaration order, strata rows in row order, columns left to right. A run is
   bit-reproducible from its seed only because that order is fixed here rather
   than emergent. `hash2` is deliberately used NOWHERE below, even where a
   positional hash would be convenient -- it is stateless, so it would hand
   every seed the identical hills and the identical strata fingers. */

import { clamp } from '../core/math.js';
import { rand, randInt, randRange } from '../core/rng.js';
import { NATIVE } from '../data/forms.js';
import { S, SUB } from '../data/substances.js';
import { BANDS, STRATA_KINDS } from '../data/world.js';
import { eff } from '../model/mods.js';
import { write as tw, solidAt, subAt } from '../model/tiles.js';
import { inBounds } from '../model/world.js';

/* Half-width in tiles of the guaranteed flat shelf around the spawn column.
   The first two minutes must not depend on the seed. EVERY pass honours it --
   the relief map pins these columns to the band's own `floorTy`, and `trees`
   and `hollows` refuse them outright.

   9 rather than 6, because 13 columns is not enough to stand on and place a
   3x2 furnace at arm's length once the ground either side undulates: the aim
   reticle reaches 3.2 tiles and the footprint is three wide. 19 columns is. */
const SHELF = 9;

/* Fraction of a layer's top row that is carved away in a band with NO relief
   row, so a flat stratum boundary reads as ground rather than as a ruled line.
   One tile deep only: any more and `floorTy` stops meaning what
   `data/world.js` says it means. */
const LIP = 0.35;

/* Four passes build a landform: a trend octave places the uplands and
   lowlands, raised-cosine summits sit on top, two 1-2-1 passes smooth the
   float profile, and a clamp to the row's own budget flattens the extremes.
   Then the shelf is pinned, the relief blended either side, and the step pass
   sweeps outward.

   DO NOT GO BACK TO SUMMING OCTAVES. The three-octave sum this replaced
   changed direction 37 to 52 times per 128 columns and read as sawtooth. */

/* Tiles between trend lattice points. 40 gives a lattice point every 40
   columns, so the trend is one broad feature per two or three screens. */
const TREND_PERIOD = 40;

/* How much of the relief budget the trend claims either way from its own
   centre line. The summits spend the rest, and they need the room -- at 0.3 a
   trend high under a tall summit hit the clamp on most seeds, and a clamped
   summit is a mesa. */
const TREND_SHARE = 0.20;

/* Tiles of world per summit, so a wider band gets more hills rather than
   wider ones. 1,024 columns gives 51 summits. */
const HILL_SPACING = 20;

/* Summit height in tiles, never under `HILL_LOW` and never over `HILL_SHARE`
   of the row's own upward budget. The hop clears a summit under 3 tiles, so
   one would read as the per-column noise this pass exists to remove. */
const HILL_LOW = 3;
const HILL_SHARE = 0.72;

/* Half-width per tile of summit height, and the factor the draw may widen it
   by. A raised cosine `h/2 * (1 + cos(pi x / w))` has maximum slope
   `pi h / 2w`, so `w >= (pi/2) h` is exactly what a summit needs to hold the
   1-tile-per-column limit `rules/player.js#moveX`'s auto-step imposes, and
   1.6 rounds pi/2 up. The step pass below therefore backstops a summit rather
   than shaping it, which is why a hill survives it recognisably. */
const HILL_SLOPE = 1.6;
const HILL_WIDE  = 1.8;

const SMOOTH_PASSES = 2;
const RELIEF = 6;        // tiles above `floorTy` a relief row declaring no `amp` gets
const FADE   = 36;       // rows below the ground line at which relief reaches 0
const BLEND  = 10;       // columns either side of the shelf the relief fades in over

/* TRAVERSABILITY. The hop clears exactly one tile and
   `rules/player.js#moveX`'s auto-step is gated on `onGround || onLadder`, so a
   two-tile rise is a wall, not a hill. Adjacent columns therefore differ by at
   most ONE tile, with a single exception: a DESCENT away from spawn may drop
   `STEP_BIG`, no more often than every `STEP_GAP` columns and never inside
   `SAFE_R` of spawn. Down is free, so walking out is never blocked; walking
   back up a two-tile face wants a dig or a ladder, which is the premise. */
const STEP_BIG = 2;
const STEP_GAP = 12;
const SAFE_R   = 24;     // tiles around spawn where the first two minutes live

/* the contact zone
   How far a per-column bias may push the upper material's probability ramp.
   Without it the ramp dithers into TV static; with it, the same column keeps
   winning several rows in a row and the boundary grows fingers. */
const CONTACT_BIAS = 0.45;

/* hollows
   Rows of rock that must remain between a hollow's ceiling and the top of the
   solid column above it. A hollow that breaches the surface is a hole, and a
   hole is not a secret. Two rows is also what keeps `model/tiles.js#
   skyExposedAt` honest: a hollow that reached a band's row 0 would make the
   tiles below it read as sky-exposed and grow grass on a cave floor. */
const HOLLOW_ROOF = 2;

/* A hollow is wider than it is tall by this factor — a room, not a chimney. */
const HOLLOW_ASPECT = 1.5;

/* Fraction of a lined hollow's wall cells that get an ore cluster stamped
   into the rock behind them. */
const HOLLOW_VEIN = 0.14;

/* ore
   Cruciform, not round: a centre cell plus 4-8 arms. Arms beyond the first
   four are diagonal, so a big cluster reads as a star and a small one as a
   plus sign. `ORE_LONG` is the radius above which an arm may be two cells
   long, `ORE_FAT` the radius above which arms grow a shoulder. */
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const ORE_LONG = 2.4;
const ORE_FAT  = 2.8;

/* `dens` is ATTEMPTS PER 10,000 TILES of the row's own window. A density
   rather than a count, because an absolute count is diluted by every widening
   -- the same ore in eight times the rock is an eighth of the ore per screen,
   and content per screen is what a player experiences. */
const attempts = (b, top, bot, dens) => Math.round(dens * (bot - top) * b.tw / 1e4);

/* the kind table */

const KINDS = {

  /* THE PER-COLUMN HEIGHT MAP. Writes no tiles: it fills `ctx.off`, the signed
     row offset every later pass in this band shifts its declared boundaries
     by. Must be declared FIRST in a band's `strata` (a `layer` row read before
     this one would simply generate flat, not throw), and a band without this
     row is flat, which is what `astral` and `topsoil` want. */
  relief(b, row, ctx) { ctx.off = heightmap(b, row); },

  /* A solid band of one element across the full width, boundaries following
     `ctx.off`. `fromTy` is the ground line when it is the topmost layer, which
     is why the top row gets the ragged lip BY DEFAULT and `lip:false` opts a
     row out -- without that flag, a stone layer given its own `fromTy` punches
     random air pockets along the seam, because the lip check cannot tell "top
     of my own range" from "top of the world".

     Two adjacent layers cannot part company, because a boundary's offset is a
     function of the DECLARED row, so the upper row's `toTy` and the lower
     row's `fromTy` resolve to the identical shifted row. */
  layer(b, row, ctx) {
    const sub = S[row.sub];
    for (let tx = 0; tx < b.tw; tx++) {
      const top = Math.max(0, row.fromTy + shift(ctx, b, tx, row.fromTy));
      const bot = Math.min(b.th, row.toTy + shift(ctx, b, tx, row.toTy));
      for (let ty = top; ty < bot; ty++) {
        /* A band with a height map gets no lip, which is what `!ctx.off`
           tests. The carve is an independent coin flip per column, so over a
           height map it lands beside a raised column and leaves a two-tile
           face the hop cannot clear. A flat band still wants it, so a stratum
           boundary there reads as ground rather than as a ruled line. */
        if (ty === top && row.lip !== false && !ctx.off &&
            !onShelf(b, tx) && rand() < LIP) continue;
        tw.set(b, tx, ty, sub, NATIVE);
      }
    }
  },

  /* THE CONTACT ZONE. A strata boundary is not a line but a band `thick` tiles
     deep where the two materials interdigitate in blocky fingers: a
     probability ramp rather than a flat chance, `rand()` rather than `hash2`,
     and a per-column bias, so the result is fingers rather than static.

     `at` is the DECLARED boundary row and `thick` is content's rather than the
     interpreter's, so a gradational seam and a sharp one are two rows with two
     numbers rather than two code paths. A shaft through a contact hits
     alternating hardness, so the dig slows and speeds. Do not smooth it. */
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

  /* HIDDEN HOLLOWS: air carved out of solid rock, after the strata and before
     the ore. Density rises with depth, and the shape is a short random walk
     stamping a squashed disc, so a hollow is blobby rather than rectangular.

     NOTHING HERE MARKS A HOLLOW AS HIDDEN, and nothing should: it is unseen
     because `b.seen` is false, dark because `rules/light.js` says so, and
     un-flooded because `reveal.js#passB` will not enqueue past its first ring
     without light. Built as a cell list, then judged, then written, so
     "backfilled entirely" is "never carved". */
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
      /* `floor`/`height` are recorded, not acted on: a hollow deeper than the
         safe fall hurts whoever drops into it, which is wanted — the spawn
         guard in `hollowOk` is what keeps it out of the first two minutes. */
      const h = { cx, cy, cells, top: lo, floor: hi, height: hi - lo + 1, line: -1 };
      /* MAKE DISCOVERY PAY. One flag on the carve record; the ore pass reads
         it. The DEEPEST declared lining row whose window holds this hollow
         claims it, so the jackpot is graded by depth rather than by which ore
         happens to be declared first. */
      if (rand() < eff('hollowOre'))
        b.cfg.strata.forEach((r, i) => {
          if (r.kind === 'blobs' && r.line && cy >= r.fromTy && cy < r.toTy) h.line = i;
        });
      ctx.hollows.push(h);
    }
  },

  /* Scattered cruciform clusters: ore fields, each at a random column and a
     random row inside the declared window. ORE NEVER FILLS A HOLLOW —
     `star()` is asked for solid cells only, so a carved room stays a room.
     `line:true` additionally lines the walls of the hollows this row claimed
     above. */
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

  /* One guaranteed cluster at a named landmark, `n` stars deep so the first
     vein is unmistakable and cannot be thinned to nothing by an unlucky arm
     roll. `near:'spawn'` is resolved HERE and not in `data/world.js`, because
     "where is spawn" is a fact about the band record and a content row should
     not have to know it. Unlike `blobs` this one writes into air as well as
     rock: the guarantee is the whole point of the row. */
  vein(b, row) {
    const { cx, cy } = veinAt(b, row);
    star(b, cx, cy, row.r, S[row.sub]);
    for (let n = 1; n < (row.n ?? 1); n++)
      star(b, cx + randInt(-2, 2), cy + randInt(0, 2), row.r * 0.8, S[row.sub]);
  },

  /* Standing trunks, grown UP from whatever surface a column has.
     `fromTy`/`toTy` is the window a trunk's BASE may sit in, not the extent of
     the trunk, so a 5-tall tree on a 4-row window is a tree rather than an
     error. With relief the ground line moves, so the window has to span every
     height the map can produce.

     Trees are the only timber above ground, so this is the ladder supply at
     one remove: a felled `log` is feedstock only, and `peg_rungs` turns 2 into
     4 `timber/rung`, which is the form that places. */
  trees(b, row) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    const stand = row.grove ? groves(b, row.grove.spacing, row.grove.spread) : null;
    for (let tx = 0; tx < b.tw; tx++) {
      /* One draw per column whether the column is in a grove or not, so the
         mask moves trees around without moving the rest of the seed's draw
         sequence. `rand()` is never 1, so a chance of 0 always skips. */
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

/* the one entry point */

/* Apply every strata row of a band, in row order. The band's tile array is
   freshly allocated (and therefore all AIR) when this is called, so there is no
   clear step: `shell/boot.js` allocates and then generates, once.

   `ctx` is this band's generation scratch and dies with the call: the height
   map one pass computes and the next four read, the hollow records the ore
   pass reads, and the index of the row being applied. It is NOT stored on the
   band record — `b` is `model` state, and worldgen has no business growing a
   field on it that nothing outside this file would ever read. */
export function generate(b) {
  const ctx = { off: null, hollows: [], i: 0 };
  b.cfg.strata.forEach((row, i) => { ctx.i = i; KINDS[row.kind](b, row, ctx); });
  unsealOreBodies(b);
}

/* ore reachability repair */

/* `star()` OVERWRITES whatever a cell held, so a LATER, higher-tier row can
   box in an EARLIER, lower-tier ore tile without touching the ore tile
   itself. Measured at about 2.5% of seeds. Scoped to `metal`-tagged
   substances, not every solid tile, because plain rock surrounded by a higher
   tier is the ordinary shape of a deposit.

   `reachesAir` floods through tiles already diggable at this ore's own tier,
   the same claim the property test checks, so this cannot believe a tile is
   unsealed when the checker would disagree. When it says no,
   `carvePathToStone` fills unrestricted to the nearest open air. */
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

/* Flood-fill from `(sx,sy)` through tiles that are already air, or solid at
   or below `maxTier` -- the exact reachability claim
   `tools/worldgen-check.mjs`'s property test makes. Returns true the instant
   an air tile is found. Bounded generously (the size of the largest band) so
   a seed with no sealed ore anywhere pays for exactly the small local search
   its own geometry needs, never a fixed worst case. */
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

/* Shortest path from `(sx,sy)` to the nearest air tile, through ANY tile
   regardless of tier -- this is the carving pass, not a reachability check,
   so it is allowed to cross rock `reachesAir` above would have refused.
   Carves every tile on that path to `stone` except the destination air tile
   itself (already open; writing to it would do nothing) and `(sx,sy)`
   (the ore tile -- this repairs its surroundings, not the ore). */
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
  if (!target) return; // no air anywhere in the band at all -- cannot happen in practice

  let [x, y] = parent.get(key(target[0], target[1]));
  while (!(x === sx && y === sy)) {
    tw.set(b, x, y, S.stone, NATIVE);
    [x, y] = parent.get(key(x, y));
  }
}

/* relief */

/* One octave of value noise, `amp` tiles either way, smoothstepped between
   lattice points `period` tiles apart. The lattice is drawn from `rand()`, so
   two seeds get two landscapes. */
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

/* The signed per-column ROW offset of the ground line from the band's own
   `floorTy`, NEGATIVE UP, because a tile row grows downward. The range runs
   from `-row.amp` at a hilltop to `+row.dip` at a valley floor.

   Pass order is fixed and both halves of it matter. Trend, summits, smooth
   and clamp shape the profile; then the shelf is pinned, the relief is
   blended in either side of it, and the step pass walks outward so nothing
   the blend or the noise produced leaves a face the player cannot climb. */
function heightmap(b, row) {
  const up = row.amp ?? RELIEF;
  const down = row.dip ?? 0;

  /* `h` holds height above `floorTy` in tiles, float and unrounded until the
     clamp. Rounding between the trend and the summits would quantise every
     flank to one staircase and put the jitter back. */
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
      if (d <= SHELF) { off[tx] = 0; continue; }                     // THE SHELF
      if (d > SHELF + BLEND) continue;
      /* The blend is smoothstepped. A linear ramp out of a flat shelf holds
         one slope for its whole width and renders as a flight of stairs,
         where an S-curve leaves the shelf flat, steepens in the middle and
         settles into the landform, which renders as the foot of a slope. */
      const k = (d - SHELF) / (BLEND + 1);
      off[tx] = Math.round(off[tx] * k * k * (3 - 2 * k));
    }

  const anchor = sx ?? 0;
  stepPass(off, b.tw, clamp(anchor + SHELF, 0, b.tw - 1), +1, anchor);
  stepPass(off, b.tw, clamp(anchor - SHELF, 0, b.tw - 1), -1, anchor);
  return off;
}

/* `tw / HILL_SPACING` raised-cosine summits, in tiles of height. The three
   draws per summit run centre, height, width, and THAT ORDER IS FIXED because
   seed reproducibility depends on it.

   Each takes one column at random from its OWN slice of the band, so spacing
   still reads as irregular while a uniform scatter left one seed in three with
   a 70-column dead plain. A summit the band edge clips is kept as drawn. */
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

/* groves */

/* A per-column mask of where trees may stand: one grove centre per slice of
   `spacing` columns, at a random column inside it, covering `spread` either
   side. Mirrors `summits`, so the slice keeps spacing irregular.

   TREES COME IN STANDS BECAUSE A TRUNK IS A WALL, and the free ground between
   two stands is the distance a walker covers. A centre landing on the spawn
   shelf is PUSHED CLEAR rather than filtered -- deleting such a grove column
   by column would leave the first two minutes with no timber in reach. */
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
   Consumes no randomness, and it is what keeps a single-column spike out of
   the rounded result. */
function smooth(h, tw) {
  let prev = h[0];
  for (let tx = 1; tx < tw - 1; tx++) {
    const cur = h[tx];
    h[tx] = (prev + 2 * cur + h[tx + 1]) / 4;
    prev = cur;
  }
}

/* Sweep OUTWARD from the shelf, never toward it, so the flat shelf and its
   blend are the fixed point of this pass rather than something it can smooth
   away. `d > 0` is the ground descending as you walk away from spawn. */
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

/* The row a boundary DECLARED at `ty` actually occupies in column `tx`.
   Relief fades linearly to nothing `FADE` rows below the band's ground line,
   so a hillside exposes the same banding a shaft does while the deep strata
   (`data/world.js`'s adamant band at row 220) inherit no surface wobble. */
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

/* hollows */

/* The candidate cells of one hollow: a short random walk, stamping a squashed
   disc at each step. `core/pixels.js#walk` is a DRAWING helper in screen
   pixels and is deliberately not reused here. */
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
    /* ONE HOLLOW IS ONE ROOM. A candidate that touches air already carved
       would merge with it, and two merged hollows are a room twice as tall as
       either -- which is a fall twice as long as the size key on the strata row
       says it can be. Out of bounds reads BEDROCK, which is solid, so the band
       edge needs no special case. */
    if (!solidAt(b, c.tx, c.ty) ||
        !solidAt(b, c.tx - 1, c.ty) || !solidAt(b, c.tx + 1, c.ty) ||
        !solidAt(b, c.tx, c.ty - 1) || !solidAt(b, c.tx, c.ty + 1)) return false;
    /* THE SPAWN SHELF IS SACRED, and so is what hangs off it: the shelf columns
       carry the tutorial shaft and the guaranteed vein, and `SAFE_R` around
       the spawn tile is where nothing may kill. A hollow is a fall in the
       dark. */
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

/* THE VEIN HUGS THE VOID. Stamp ore clusters centred on wall cells, asked for
   solid cells only, so the ore is embedded in the rock face rather than
   floating in the room. Found by falling into the dark, and it pays. */
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

/* shared shapes */

/* CRUCIFORM ORE. A centre cell plus 4-8 arms of length 1-2, orthogonals
   first, so a small cluster is a plus sign and a big one a star -- the same
   species at every size and no two identical. `r` is the same `r:[min,max]`
   draw the round disc used, so tier sizing stays content.

   `onlySolid` keeps ore out of a carved hollow. `hash2` would give every seed
   the identical arms, so the variation is `rand()`. */
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
    if (r > ORE_FAT && rand() < 0.5)                     // a shoulder, so a fat
      put(cx + dx + (dy ? 1 : 0), cy + dy + (dx ? 1 : 0));  // vein reads as fat
  }
}

/* Where a `near:'spawn'` vein lands. One expression, so the hollow guard and
   the vein itself cannot disagree about it. */
const veinAt = (b, row) => ({
  cx: row.near === 'spawn' && b.cfg.spawnTx !== undefined ? b.cfg.spawnTx : (b.tw >> 1),
  cy: (b.cfg.floorTy ?? 0) + (row.dy ?? 0)
});

const onShelf = (b, tx) =>
  b.cfg.spawnTx !== undefined && Math.abs(tx - b.cfg.spawnTx) <= SHELF;

/* Within the first two minutes' own radius of the spawn tile. */
const nearSpawn = (b, tx, ty) => {
  const sx = b.cfg.spawnTx;
  if (sx === undefined) return false;
  const dy = ty - (b.cfg.floorTy ?? 0), dx = tx - sx;
  return dx * dx + dy * dy <= SAFE_R * SAFE_R;
};

/* `data/world.js` exports `STRATA_KINDS` for exactly this, so a content row
   naming a kind nothing implements cannot be committed. The cheap half of the
   content lint, paid at import. */
for (const kind of STRATA_KINDS)
  if (typeof KINDS[kind] !== 'function')
    throw new Error(`generate: no handler for strata kind "${kind}"`);

/* `count` was the absolute number of attempts a `blobs` or `hollows` row
   bought, and `dens` replaced it. A leftover `count` would read `row.dens` as
   undefined, scatter zero clusters and leave a band of bare rock that every
   worldgen property still passes, so the stale field is a build error. */
for (const b of BANDS)
  for (const row of b.strata)
    if (row.count !== undefined)
      throw new Error(`generate: ${b.id} "${row.kind}" row declares count ${row.count}; use dens (attempts per 10,000 window tiles)`);
