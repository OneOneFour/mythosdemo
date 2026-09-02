/* LAYER rules — WORLDGEN. Reads the `strata` array off a `data/world.js` row and
   writes tiles. Imports `core`, `data`, `model`. Imports no other `rules`
   module; its place in the boot order is stated in `shell/boot.js`.

   WHY GENERATION IS A `rules` MODULE AND NOT A `model` ONE: "where does a
   copper blob go" is a decision, and `model` owns the number and the query
   while `rules` owns the decision and the consequence. `model/world.js`
   allocates the array; this file decides what is in it. See
   docs/DEVELOPER_GUIDE.md#bands-and-worldgen

   THE KIND TABLE IS THE WHOLE FILE. `data/world.js` declares strata rows by
   `kind`, exports `STRATA_KINDS`, and the assertion at the bottom fails at
   import if a kind has no handler here. So a row with a typo'd kind is a build
   error rather than a silently missing vein — which is the failure the previous
   generator had, where an unknown row was skipped without a word.

   Adding a LAYER, a VEIN or an ORE FIELD costs one row in `data/world.js`.
   Adding a new KIND costs a handler here, once. That trade is the same one
   `rules/machines.js` makes, and it is deliberate.

   ALL RANDOMNESS THROUGH `rand()`, in a fixed traversal order: bands in
   declaration order, strata rows in row order, columns left to right. A run is
   therefore bit-reproducible from its seed (ARCHITECTURE invariant 7), and that
   property is only true because the order is fixed here rather than emergent.
   `hash2` is deliberately NOT used anywhere below even where a positional hash
   would be convenient: it is stateless, so it would hand every seed the
   identical hills and the identical strata fingers. docs/ARCHAEOLOGY.md section
   7 makes the same point about the passes this file's relief and contact work
   were ported from.

   THE LOCKED NUMBERS ARE docs/SPEC.md SECTION 16. Change them there first. */

import { clamp } from '../core/math.js';
import { rand, randInt, randRange } from '../core/rng.js';
import { NATIVE } from '../data/forms.js';
import { S, SUB } from '../data/substances.js';
import { STRATA_KINDS } from '../data/world.js';
import { eff } from '../model/mods.js';
import { write as tw, solidAt, subAt } from '../model/tiles.js';
import { inBounds } from '../model/world.js';

/* Half-width in tiles of the guaranteed flat shelf around the spawn column.
   The first two minutes must not depend on the seed: a ragged lip or a tree
   where the player wakes is the difference between "walk" and "fall". EVERY
   pass in this file honours it — the relief map pins these columns to the
   band's own `floorTy`, and `trees` and `hollows` refuse them outright.

   9, not the 6 it was while the whole surface was flat, and the number is a
   port: the flat prototype's own `FLAT_LO`/`FLAT_HI` were `SPAWN_TX ± 9`
   ("guaranteed level ground", docs/ARCHAEOLOGY.md section 2.2). Once the
   ground either side of the shelf actually undulates, 13 columns is not
   enough to stand on and place a 3x2 furnace at arm's length -- which is
   docs/SPEC.md section 5's own beat 6 -- because the aim reticle reaches 3.2
   tiles and the footprint is three wide. 19 columns is. */
const SHELF = 9;

/* Fraction of a layer's top row that is carved away, so a stratum boundary
   reads as ground rather than as a ruled line. One tile deep only: any more and
   `floorTy` stops meaning what `data/world.js` says it means. */
const LIP = 0.35;

/* ---------- surface relief ----------

   Three octaves of value noise over a lattice drawn from `rand()`, summed:
   a landform, hills, and roughness. `[period in tiles, amplitude in tiles]`.

   The amplitudes are HALF the ±4 / ±2 / ±1 docs/BUILD_PLAN.md names, and the
   whole map is biased downward by `RELIEF / 2`, for one reason worth stating
   plainly: relief may only go UP from a band's `floorTy`, never below it.
   `view/paint.js#paintChunk` treats an AIR tile at `ty >= floorTy` as
   EXCAVATED and paints it dark cavity texture; a valley floor below `floorTy`
   would therefore fill the open sky above it with cave shading. Anchoring the
   base row as the lowest ground keeps `floorTy` meaning what every other
   reader (`shell/boot.js`'s spawn, the depth datum in `view/hud.js` and
   `model/run.js`, that sky test) already assumes, and the resulting total
   relief is the 6 tiles / 48 px BUILD_PLAN's own justification asks for. */
const OCT = [[48, 2], [16, 1], [5, 0.5]];

const RELIEF = 6;        // tiles of relief above the base ground line, max
const FADE   = 36;       // rows below the ground line at which relief reaches 0
const BLEND  = 3;        // columns either side of the shelf the relief fades in over

/* TRAVERSABILITY. The hop clears exactly one tile (docs/SPEC.md section 2) and
   `rules/player.js#moveX`'s auto-step is gated on `onGround || onLadder`, so a
   two-tile rise is a wall, not a hill. Adjacent columns therefore differ by at
   most ONE tile, with a single exception: a DESCENT away from spawn may drop
   `STEP_BIG`, no more often than every `STEP_GAP` columns and never inside
   `SAFE_R` of spawn. Down is free, so walking out is never blocked; walking
   back up a two-tile face wants a dig or a ladder, which is the premise. */
const STEP_BIG = 2;
const STEP_GAP = 12;
const SAFE_R   = 24;     // tiles around spawn where the first two minutes live

/* ---------- the contact zone ----------
   How far a per-column bias may push the upper material's probability ramp.
   Without it the ramp dithers into TV static; with it, the same column keeps
   winning several rows in a row and the boundary grows fingers. */
const CONTACT_BIAS = 0.45;

/* ---------- hollows ----------
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

/* ---------- ore ----------
   Cruciform, not round: a centre cell plus 4-8 arms. Arms beyond the first
   four are diagonal, so a big cluster reads as a star and a small one as a
   plus sign. `ORE_LONG` is the radius above which an arm may be two cells
   long, `ORE_FAT` the radius above which arms grow a shoulder. */
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const ORE_LONG = 2.4;
const ORE_FAT  = 2.8;

/* ---------- the kind table ---------- */

const KINDS = {

  /* THE PER-COLUMN HEIGHT MAP. Writes no tiles: it fills `ctx.off`, the signed
     row offset every later pass in this band shifts its declared boundaries
     by. Must be declared FIRST in a band's `strata` (a `layer` row read before
     this one would simply generate flat, not throw), and a band without this
     row is flat, which is what `astral` and `topsoil` want. */
  relief(b, row, ctx) { ctx.off = heightmap(b, row); },

  /* A solid band of one element across the full width, its top and bottom
     boundaries following `ctx.off`. The bulk of every band is one of these.
     `fromTy` is the ground line when it is the topmost layer, which is why the
     top row gets the ragged lip BY DEFAULT -- `lip:false` opts a row out, for
     a stratum boundary that sits underground and was never exposed to open
     sky. Without that flag, giving a band's stone layer its own `fromTy` (to
     sit under a shallow soil cap, say) would punch random air pockets along
     the seam, because the lip check does not know "top of my own range" from
     "top of the world". RELIEF DOES NOT RESURRECT THAT BUG: the lip is still
     the one top row of the row's own range and still opt-out per row; all the
     height map changes is WHICH row that is, per column.

     Two adjacent layers cannot part company, because a boundary's offset is a
     function of the DECLARED row (`shift()`), so the upper row's `toTy` and
     the lower row's `fromTy` resolve to the identical shifted row. */
  layer(b, row, ctx) {
    const sub = S[row.sub];
    for (let tx = 0; tx < b.tw; tx++) {
      const top = Math.max(0, row.fromTy + shift(ctx, b, tx, row.fromTy));
      const bot = Math.min(b.th, row.toTy + shift(ctx, b, tx, row.toTy));
      for (let ty = top; ty < bot; ty++) {
        /* `!ctx.off`: in a band WITH a height map the lip has already been
           folded into it, one row deep, at this same probability -- see
           `heightmap()`. Carving it twice would put back the two-tile face the
           step rule exists to forbid. */
        if (ty === top && row.lip !== false && !ctx.off &&
            !onShelf(b, tx) && rand() < LIP) continue;
        tw.set(b, tx, ty, sub, NATIVE);
      }
    }
  },

  /* THE CONTACT ZONE. A strata boundary is not a line: it is a band `thick`
     tiles deep where the two materials interdigitate in blocky fingers. Ported
     in effect from the flat prototype's two `hash2` flip windows
     (docs/ARCHAEOLOGY.md section 2.2), re-expressed as the new strata kind
     section 7 of that file recommends: a probability ramp rather than a flat
     35% chance, `rand()` rather than `hash2`, and a per-column bias so the
     result is fingers rather than static.

     `at` is the DECLARED boundary row — the same number the lower layer's
     `fromTy` carries — and `thick` is content's, not the interpreter's, so a
     gradational soil/stone seam and a sharp granite/adamant one are two rows
     with two numbers rather than two code paths.

     The consequence is deliberate: a shaft through a contact hits alternating
     hardness, so the dig slows and speeds unpredictably. Do not smooth it. */
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
     the ore. Density rises with depth (`bias` < 1 skews the centre draw toward
     `toTy`); shape is a short random walk stamping a squashed disc at each
     step, so a hollow is blobby rather than rectangular.

     NOTHING HERE MARKS A HOLLOW AS HIDDEN, and nothing should. A hollow is
     unseen because `b.seen` is false, dark because `rules/light.js` says so,
     and un-flooded because `rules/reveal.js#passB` will not enqueue past its
     first ring without light. Carve the air; those three make it a discovery.

     A hollow is built as a cell list, then judged, then written — "backfilled
     entirely" (BUILD_PLAN's ceiling rule) is therefore "never carved", which
     is the same world and one pass fewer. */
  hollows(b, row, ctx) {
    const top = Math.max(0, row.fromTy), bot = Math.min(b.th, row.toTy);
    if (bot <= top) return;
    const margin = Math.ceil(row.r[1]);
    for (let n = 0; n < row.count; n++) {
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

  /* Scattered cruciform clusters: ore fields. `count` attempts, each at a
     random column and a row inside the declared window. ORE NEVER FILLS A
     HOLLOW — `star()` is asked for solid cells only, so a carved room stays a
     room. `line:true` additionally lines the walls of the hollows this row
     claimed above. */
  blobs(b, row, ctx) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    if (bot <= top) return;
    for (let n = 0; n < row.count; n++) {
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

  /* Standing trunks, grown UP from whatever surface a column happens to have.
     `fromTy`/`toTy` is the window a trunk's BASE may sit in, not the extent of
     the trunk: a 5-tall tree on a 4-row window is a tree, not an error. With
     relief the ground line moves, so the window has to span every height the
     map can produce — see the `trees` row's own comment in `data/world.js`.

     Trees are the only timber above ground, so this loop is still the ladder
     supply — but at one remove since Phase 14a: a felled `log` is feedstock
     only (CLAUDE.md D12), and `data/recipes.js#peg_rungs` turns 2 of them into
     4 `timber/rung`, which is the tile-capable form that actually places. The
     claim this comment used to make — that `log` was "the only tile-capable
     form in the game" — was already false when `rung`, `stair` and `gravel`
     existed. See `data/forms.js`. */
  trees(b, row) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    for (let tx = 0; tx < b.tw; tx++) {
      if (rand() >= row.chance) continue;
      if (onShelf(b, tx)) continue;                  // never in front of spawn
      let base = -1;
      for (let ty = top; ty < bot; ty++) if (solidAt(b, tx, ty)) { base = ty; break; }
      if (base < 0) continue;
      const h = randInt(row.height[0], row.height[1]);
      for (let k = 1; k <= h; k++) tw.set(b, tx, base - k, sub, NATIVE);
    }
  }
};

/* ---------- the one entry point ---------- */

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

/* ---------- ore reachability repair ---------- */

/* `star()` (below) OVERWRITES whatever a cell already held, with no memory of
   what used to be there -- correct for a `blobs` row painting over plain rock,
   but it means a LATER, higher-tier row (declared later in `data/world.js`,
   applied later above) can box in an EARLIER, lower-tier ore tile by
   overwriting its neighbours without ever touching the ore tile itself.
   `tools/worldgen-check.mjs`'s reachability property found this for real: a
   copper or tin tile (tier 1) sealed by granite or adamant (tier 2/3), in
   ~2.5% of seeds -- unreachable by the tool that can mine every OTHER copper
   or tin tile in the world.

   Scoped to `tags:['metal']` substances specifically, not every solid tile:
   plain rock (`stone`/`granite`/`soil`) surrounded by a higher tier is the
   ordinary, expected shape of a deposit and not a defect -- it is the ORE the
   player is guaranteed a tool-appropriate path to, per docs/SPEC.md section
   12's tier gate, that this repairs.

   A ONE-HOP FIX WAS TRIED FIRST AND WAS NOT ENOUGH: opening a single
   neighbour to `stone` fixed 4 of the 5 seeds this was found in, but the
   5th had a shell more than one tile thick, and a plain "is my immediate
   neighbour clear" check has no way to know that -- the neighbour it opened
   was itself still sealed, one layer removed. `reachesAir` below is the
   HONEST version of that same question: a real flood-fill through tiles
   already diggable at this ore's own tier, exactly the claim the property
   test itself checks, so this can never again believe a tile is unsealed
   when the checker would disagree. When it says no, `carvePathToStone` runs
   a SECOND, unrestricted flood-fill (through any tile, any tier) to find the
   nearest existing open air and carves every tile of that shortest path down
   to plain tier-1 `stone` -- a real, contiguous, always-diggable corridor,
   not a hope that one opened cell happens to lead somewhere. */
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

/* ---------- relief ---------- */

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

/* The signed per-column offset of the ground line, 0 (the band's own
   `floorTy`) down to `-amp`. In order, and the order is the point: sum the
   octaves, clamp, pin the shelf flat, fade the relief in either side of it,
   then walk outward enforcing the step rule so nothing the fade or the noise
   produced can leave a face the player cannot climb. */
function heightmap(b, row) {
  const amp = row.amp ?? RELIEF;
  const off = new Int16Array(b.tw);
  const sum = new Float64Array(b.tw);
  for (const [period, a] of OCT) {
    const o = octave(b.tw, period, a * amp / RELIEF);
    for (let tx = 0; tx < b.tw; tx++) sum[tx] += o[tx];
  }
  for (let tx = 0; tx < b.tw; tx++)
    off[tx] = clamp(Math.round(sum[tx] - amp / 2), -amp, 0);

  /* THE RAGGED LIP, MOVED INTO THE MAP. `layer()` carves `LIP` of its top row
     away per column, and still does in a band with no relief row -- but a
     random one-tile carve laid ON TOP of a height map is exactly what breaks
     the step rule: a carved column beside a raised one is a two-tile face, and
     the hop clears one. Folding the same probability and the same one-row
     depth in HERE keeps the look identical (that column's top tile is still
     air over soil) and lets the step pass below see it. */
  for (let tx = 0; tx < b.tw; tx++) if (rand() < LIP) off[tx] += 1;

  const sx = b.cfg.spawnTx;
  if (sx !== undefined)
    for (let tx = 0; tx < b.tw; tx++) {
      const d = Math.abs(tx - sx);
      if (d <= SHELF) off[tx] = 0;                                   // THE SHELF
      else if (d <= SHELF + BLEND)                                   // and its blend,
        off[tx] = Math.round(off[tx] * (d - SHELF) / (BLEND + 1));   // so it is not a plateau
    }

  const anchor = sx ?? 0;
  stepPass(off, b.tw, clamp(anchor + SHELF, 0, b.tw - 1), +1, anchor);
  stepPass(off, b.tw, clamp(anchor - SHELF, 0, b.tw - 1), -1, anchor);
  return off;
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

/* ---------- hollows ---------- */

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
    /* THE SPAWN SHELF IS SACRED, and so is what hangs off it: the shelf
       columns carry the tutorial shaft and (via `near:'spawn'`) the guaranteed
       vein, and `SAFE_R` around the spawn tile is where docs/SPEC.md section 3
       promises nothing can kill. A hollow is a fall in the dark; neither gets
       one. */
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

/* ---------- shared shapes ---------- */

/* CRUCIFORM ORE. A centre cell plus 4-8 arms of length 1-2, orthogonals
   first, so a small cluster is a plus sign and a big one a star: the same
   species at every size, and no two identical. `r` is the same `r:[min,max]`
   draw the round disc this replaced used, so tier sizing stayed content.

   docs/ARCHAEOLOGY.md section 2.4: the disc was NOT a regression from
   anything, it was the shape from the mockup onward, and cruciform ore has
   never existed here. This is new generation, not a port.

   `onlySolid` keeps ore out of a carved hollow. `hash2` would give every seed
   the identical arms (invariant 7's other half), so the variation is `rand()`. */
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

/* ---------- coverage, asserted at import ----------
   `data/world.js` exports `STRATA_KINDS` for exactly this. A content row naming
   a kind nothing implements used to be skipped in silence; now it cannot be
   committed. This is the cheap half of `tools/resolve.mjs`, paid at import. */
for (const kind of STRATA_KINDS)
  if (typeof KINDS[kind] !== 'function')
    throw new Error(`generate: no handler for strata kind "${kind}"`);
