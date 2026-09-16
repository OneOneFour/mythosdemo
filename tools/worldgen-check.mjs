// TIER 1 harness (docs/BUILD_PLAN.md "Phase 11 -- Harness"): worldgen
// PROPERTIES, over a seed sweep, node only -- no canvas, no DOM. `boot.newRun`
// needs neither (verified: `core/canvas.js#attach`/`resize`,
// `shell/audio.js#initAudio`, `shell/input.js#installInput` all guard on
// `typeof document/window/addEventListener`, and no-op without them), so this
// file, unlike `tools/check.mjs`, stubs nothing.
//
// tools/check.mjs calls `boot.newRun(seed)` with one hand-picked seed per
// staged scenario; tools/content.mjs is a pure content-table lint that never
// boots a world. Neither can host "does worldgen itself hold up over hundreds
// of seeds", so this file exists standalone for that one question, run via
// `npm run check:worldgen` and chained into `npm run test` (not into the fast
// `npm run check` a developer runs after every edit -- see the timing note at
// the bottom).
//
// PRINTS THE FAILING SEED ON EVERY FAILURE, per the plan's own words: "a
// worldgen bug you cannot reproduce is a worldgen bug you cannot fix."
//
// EXCLUDED ON PURPOSE: tier monotonicity (tools/content.mjs:358-373 already
// proves it, statically, over the content tables -- a live re-check here
// would just be a second implementation of the same assertion).
// See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves

import { S, SUB } from '../src/data/substances.js';
import { AIR } from '../src/data/forms.js';
import { BANDS } from '../src/data/world.js';
import * as boot from '../src/shell/boot.js';
import { bands } from '../src/model/world.js';
import { solidAt, subAt, tileAt, skyExposedAt, baseChargeAt } from '../src/model/tiles.js';
/* THE ONE `view` IMPORT, and property 10 is what it is for. The number the
   renderer actually stops the sky at, read from the module that defines it
   rather than recomputed here. `view/paint.js` needs no canvas to import --
   `core/canvas.js#offscreen` is only called from `chunkCanvas`. */
import { skyBottomTy } from '../src/view/paint.js';

let failures = 0;
const fail = m => { console.error('  FAIL  ' + m); failures++; process.exitCode = 1; };
const ok   = m => console.log('  ok    ' + m);

/* ============================================================
   CONSTANTS DUPLICATED FROM src/rules/generate.js
   ------------------------------------------------------------
   None of these are exported (they are worldgen's own interpreter constants,
   not content data), so there is no way to import them; they are re-typed
   here, verified against the source read on 2026-09-01, and MUST be
   re-verified by hand if src/rules/generate.js's own numbers ever move --
   this file cannot notice that drift on its own. `RELIEF` is the one
   exception: it is read live off `data/world.js`'s own `relief` strata row
   below, which is real content the generator reads too, rather than a second
   copy of a number generate.js only has as a fallback default. ---- */
const SHELF    = 9;   // rules/generate.js#SHELF -- half-width of the flat spawn shelf
const SAFE_R   = 24;  // rules/generate.js#SAFE_R -- radius the first two minutes live in
const STEP_BIG = 2;   // rules/generate.js#STEP_BIG -- max permitted step outside SAFE_R
const STEP_GAP = 12;  // rules/generate.js#STEP_GAP -- min columns between two big steps
const HOLLOW_ROOF = 2; // rules/generate.js#HOLLOW_ROOF -- rock rows required over a hollow

const SEEDS = Number(process.env.WORLDGEN_SEEDS) || 200;

/* ---- THE TWO COPPER BILLS THE FIRST TWO MINUTES OWE, in UNITS.
   `TRIAL_COPPER` is docs/SPEC.md section 5 beat 3 / section 18.4's cycle-1
   row: "First Trial: deliver 10 raw copper". `FURNACE_COPPER` is section 13's
   build bill for `furnace` (12 `copper/ore` + 6 `timber/log`), which is what
   the same hole has to pay for next. Typed here rather than read off
   `data/machines.js` on purpose: section 5's beat sheet is the thing being
   asserted, and it names a NUMBER, not a machine -- if the furnace's bill
   ever changes, whether the tutorial still fits is a design question that
   should surface as a failing assertion here and be answered deliberately,
   not tracked silently. ---- */
const TRIAL_COPPER   = 10;
const FURNACE_COPPER = 12;

/* Copper units within a 5-break dig, per seed -- the FLOOR is asserted per
   seed in property 3; this collects the distribution so the sweep can print
   the CEILING too (docs/SPEC.md §19.7: an absurdly rich guaranteed vein ends
   cycle 1 in fifteen seconds, and only a max can show that). */
const veinUnits = [];

/* ============================================================
   SHARED GEOMETRY HELPERS, over the LIVE band records `boot.newRun` just
   built -- nothing here re-implements worldgen; everything asks the same
   model queries the game itself uses (`solidAt`, `subAt`, `skyExposedAt`).
   ============================================================ */

const surfaceCfg = BANDS.find(b => b.id === 'surface');
const SPAWN_TX = surfaceCfg.spawnTx;
const FLOOR_TY = surfaceCfg.floorTy;
const RELIEF = surfaceCfg.strata.find(r => r.kind === 'relief').amp;
const DIP = surfaceCfg.strata.find(r => r.kind === 'relief').dip ?? 0;

/* A `dip` OF 0 MAKES PROPERTY 10 VACUOUS, so it fails here instead. That
   property's whole job is to catch `view/paint.js#skyBottomTy` reading the
   wrong field name, and at `dip` 0 the right answer and the wrong answer are
   both `floorTy`. Lower the dip deliberately and this line is the one that
   says what stops being checked. */
if (DIP <= 0) fail(`the surface relief row declares dip ${DIP}; property 10 cannot tell a correct skyBottomTy from a broken one below 1`);

/* The topmost solid row of a column, scanning from the sky down -- the same
   query `rules/generate.js#firstSolid` makes for the hollow-roof rule, asked
   here from OUTSIDE that file, against the tiles it actually wrote.
   TIMBER IS SKIPPED: a tree trunk (`rules/generate.js#KINDS.trees`) is grown
   UP from the height map's own ground line, strictly AFTER the relief and
   step passes have already fixed it, so a trunk is decoration standing ON
   the surface, not the surface itself. Counting a trunk's top tile as the
   "ground" would read every tree as a 3-5 tile cliff the step rule never
   produced and never has to obey -- exactly the wrong-thing-measured mistake
   CLAUDE.md warns about, confirmed by first running this file naively and
   getting a STEP failure at nearly every seed. */
function groundRow(b, tx) {
  for (let ty = 0; ty < b.th; ty++)
    if (solidAt(b, tx, ty) && subAt(b, tx, ty) !== S.timber) return ty;
  return b.th;
}

/* A carved room, not the open sky: solid material once, air now, with no
   clear path up to true sky above it. Sky-exposed air is an ordinary hillside
   or valley and must not be mistaken for a hollow. */
function isHollowTile(b, tx, ty) {
  return tileAt(b, tx, ty) === AIR && !skyExposedAt(b, tx, ty);
}

const bandOf = id => bands.find(b => b.id === id);

/* ============================================================
   PROPERTY 9's REACHABILITY GRAPH: surface + topsoil stacked as one graph.
   ------------------------------------------------------------
   Both bands are the same width at 8 px/tile (data/world.js), so column `tx`
   in one is the SAME world column as `tx` in the other, and the surface
   band's own bottom row is the world pixel row directly above the topsoil
   band's own row 0 (surface origin.y 320 + 56*8 = 768 = topsoil's origin.y).
   That is what makes "one more edge, at the seam" the whole of stitching two
   separately-allocated tile arrays into one connectivity graph, rather than
   a coordinate transform. `astral` carries no ore and sits above spawn, not
   below it, so it is left out of this graph on purpose. ============================================================ */
function neighboursOf(gridBands, node) {
  const { bi, tx, ty } = node;
  const b = gridBands[bi];
  const out = [];
  if (ty > 0) out.push({ bi, tx, ty: ty - 1 });
  if (ty < b.th - 1) out.push({ bi, tx, ty: ty + 1 });
  if (tx > 0) out.push({ bi, tx: tx - 1, ty });
  if (tx < b.tw - 1) out.push({ bi, tx: tx + 1, ty });
  if (bi === 0 && ty === b.th - 1) out.push({ bi: 1, tx, ty: 0 });
  if (bi === 1 && ty === 0) out.push({ bi: 0, tx, ty: gridBands[0].th - 1 });
  return out;
}
/* PACKED NODE KEY, and the column stride is DERIVED. It was the literal 1000
   against a 128-column world; at 1,024 columns (`tx` up to 1023) row `ty`
   column 1023 and row `ty + 1` column 23 collided, so a flood fill marked a
   node visited that it had never reached and the sealed-ore property was
   quietly answering about the wrong tile. */
const KEY_STRIDE = Math.max(...BANDS.map(b => b.tw));
const KEY_BAND = 1e7;
{
  const deepest = Math.max(...BANDS.map(b => b.th));
  if (deepest * KEY_STRIDE + KEY_STRIDE > KEY_BAND)
    fail(`keyOf: ${deepest} rows x ${KEY_STRIDE} columns overflows the ${KEY_BAND} band slot`);
}
const keyOf = n => n.bi * KEY_BAND + n.ty * KEY_STRIDE + n.tx;

/* TIER OF A TILE A PLAYER WOULD HAVE TO DIG THROUGH: `tile.tier ?? 1`, the
   same default `rules/mining.js`'s own gate uses. Tier is a PROGRESSION gate
   (a stronger tool always reaches everything a weaker one does -- the
   monotonicity content.mjs's own assertion 9 already proves), never a
   permanent wall: every real strata substance carries a FINITE `tile.hard`
   (verified by inspection of data/substances.js -- only the AIR/BEDROCK
   sentinels in model/tiles.js are Infinity, and neither is ever the byte a
   `blobs`/`vein`/`layer` row writes). So "diggable, ignoring tier" is true
   for every in-bounds tile in this game today BY CONSTRUCTION, which would
   make a tier-blind flood fill pass always, trivially, telling nobody
   anything -- CLAUDE.md's own warning against a test that measures the wrong
   thing. The MEANINGFUL claim -- and the one the plan's own example
   ("sealed inside an adamant shell") is actually about -- is that an ore body
   of tier T must be reachable using nothing HARDER than tier T itself: a
   copper vein (tier 1) must never require a detour through granite (tier 2)
   or adamant (tier 3) to reach, because that would be a T1 player unable to
   reach a T1 reward. So reachability below is graded PER ORE BODY, at that
   body's own tier, not at the maximum tier the game ever reaches. */
const tierOf = sub => SUB[sub].tile?.tier ?? 1;

function reachableAtTier(gridBands, start, tier, cache) {
  if (cache[tier]) return cache[tier];
  const seen = new Set([keyOf(start)]);
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    for (const nb of neighboursOf(gridBands, queue[qi])) {
      const k = keyOf(nb);
      if (seen.has(k)) continue;
      const b = gridBands[nb.bi];
      const byte = tileAt(b, nb.tx, nb.ty);
      if (byte !== AIR && tierOf(subAt(b, nb.tx, nb.ty)) > tier) continue;
      seen.add(k);
      queue.push(nb);
    }
  }
  return (cache[tier] = seen);
}

/* Every maximal same-substance blob in a band, by 8-connectivity -- a
   cruciform ore cluster's arms (rules/generate.js#star, `DIRS`) are diagonal
   past the first four, so 4-connectivity would slice one vein into several
   "bodies" that are visually and mechanically one. */
function oreComponents(b, oreSub) {
  const visited = new Uint8Array(b.tw * b.th);
  const comps = [];
  for (let ty = 0; ty < b.th; ty++) {
    for (let tx = 0; tx < b.tw; tx++) {
      const i = ty * b.tw + tx;
      if (visited[i]) continue;
      if (subAt(b, tx, ty) !== oreSub) { visited[i] = 1; continue; }
      visited[i] = 1;
      const cells = [{ tx, ty }];
      const stack = [[tx, ty]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= b.tw || ny < 0 || ny >= b.th) continue;
          const ni = ny * b.tw + nx;
          if (visited[ni]) continue;
          visited[ni] = 1;
          if (subAt(b, nx, ny) !== oreSub) continue;
          cells.push({ tx: nx, ty: ny });
          stack.push([nx, ny]);
        }
      }
      comps.push(cells);
    }
  }
  return comps;
}

/* Every substance a `blobs` or `vein` strata row ever places -- derived from
   the content table rather than hardcoded, so a fifth ore added to
   data/world.js is covered the day it is written, with no edit here. */
const ORE_SUBS = [...new Set(
  BANDS.flatMap(b => (b.strata || [])
    .filter(r => r.kind === 'blobs' || r.kind === 'vein')
    .map(r => S[r.sub]))
)];

/* ---- CONTENT PER SCREEN, in cells per 10,000 tiles of the band.
   Aggregated over the whole sweep rather than asserted per seed, because one
   seed's scatter is noisy and the claim is about the world a player walks
   through. docs/SPEC.md section 16.5 holds the measured means; these floors
   are 80% of them, so an accidental thinning fails and ordinary seed
   variation does not.

   THIS IS THE PROPERTY PHASE 6e DID NOT HAVE. Widening every band from 128 to
   1,024 columns against an absolute `count` left the same content in eight
   times the rock, and every property in this file stayed green, because each
   one is a floor on a total or a reachability claim and none of them was a
   density. `dens` (attempts per 10,000 window tiles) makes the dilution
   impossible by construction; this makes a thinning visible. ---- */
const DENSITY_FLOOR = {
  'surface/copper': 71, 'surface/air': 173,
  'topsoil/copper': 61, 'topsoil/tin': 49,
  'topsoil/granite': 34, 'topsoil/adamant': 21, 'topsoil/air': 767
};
const density = {};        // 'band/thing' -> cells summed over the sweep
const bandTiles = {};      // band id -> tiles summed over the sweep

/* Every band/substance pair a `blobs` or `vein` row places, and every band
   with a `hollows` row, so a fifth ore cannot be added without a floor to go
   with it. Restricted to the bands property 7's full-band scan visits, since
   that scan is what does the counting -- a key for a band it never walks
   would divide by an undefined tile total. */
const COUNTED_BANDS = ['surface', 'topsoil'];
const DENSITY_KEYS = [
  ...new Set(BANDS.filter(b => COUNTED_BANDS.includes(b.id)).flatMap(b => b.strata
    .filter(r => r.kind === 'blobs' || r.kind === 'vein')
    .map(r => `${b.id}/${r.sub}`))),
  ...BANDS.filter(b => COUNTED_BANDS.includes(b.id) &&
                       b.strata.some(r => r.kind === 'hollows')).map(b => `${b.id}/air`)
];
for (const k of DENSITY_KEYS)
  if (DENSITY_FLOOR[k] === undefined)
    fail(`DENSITY -- data/world.js places "${k}" but no floor is declared for it here`);

/* ============================================================
   ONE SEED'S WORTH OF PROPERTY CHECKS, run against `bands` as `boot.newRun`
   just left them.
   ============================================================ */
function checkSeed(seed) {
  const surface = bandOf('surface'), topsoil = bandOf('topsoil');
  const gridBands = [surface, topsoil];

  /* ---- 2. spawn shelf: flat, >= 9 tiles half-width, centred on spawn ---- */
  {
    const want = groundRow(surface, SPAWN_TX);
    let bad = -1;
    for (let tx = SPAWN_TX - SHELF; tx <= SPAWN_TX + SHELF; tx++)
      if (groundRow(surface, tx) !== want) { bad = tx; break; }
    if (bad >= 0)
      fail(`seed ${seed}: SHELF -- column ${bad} sits at row ${groundRow(surface, bad)}, spawn row is ${want} (shelf spans ${SPAWN_TX - SHELF}..${SPAWN_TX + SHELF})`);
  }

  /* ---- 3. the guaranteed copper vein: present, within a 5-tile dig, and
     RICH ENOUGH -- measured in UNITS, not in cells.
     "Reaching" a tile means standing next to it, ready to strike it -- the
     beat sheet's own words are "dig down 5 tiles ... mine 6 copper", so the
     fifth break delivers the player TO the vein and the sixth is the first
     one spent ON it. Counting entry into the copper tile itself against the
     5-break budget (the first version of this check did exactly that) fails
     seeds where the vein sits precisely 5 breaks deep, which is the depth
     `data/world.js`'s own `dy:6` comment says it is GUARANTEED to reach --
     so that first version was measuring the wrong thing (CLAUDE.md's own
     recorded mistake), not finding a real bug.

     WHY UNITS AND NOT CELLS. A deposit tile yields
     `tile.charge` units (copper 4), so "is there a copper CELL down there"
     no longer answers the question docs/SPEC.md section 5 beat 3 and
     section 13 actually ask, which is for a QUANTITY: 10 raw copper for the
     first trial and 12 more for the furnace bill. A cells-based check would
     under-count what is really available by a factor of `charge` and would
     go on passing while the delivered amount fell under 10 -- exactly the
     silent-pass this file's own header warns about. So the copper found is
     summed through `model/tiles.js#baseChargeAt`, the same query mining
     itself reads, and the two floors are asserted separately so a failure
     says WHICH promise broke.

     A COPPER EDGE IS FREE. Only NON-copper rock spends the 5-break budget:
     once the dig has arrived, mining through the vein is the reward, not
     part of the cost of reaching it. Every cell of a 6-cell cruciform vein
     is therefore counted, which is what makes 24 the floor rather than 4.
     Base charge, not `eff('richness')`: this asserts what worldgen laid
     down, and a `richness` boon cannot exist at t=0 of a fresh run.

     THE FLOOD IS PENNED TO THE SPAWN SHELF, and it has to be. Open air costs
     nothing, the start node is the air above the spawn tile, and the sky over
     the whole band is one connected air region -- so an unpenned flood walks
     the surface for free to any column in the world and then spends its five
     breaks there. At 128 columns that inflated the figure; at 1,024 it
     inflated it eightfold and the median read 36 units against the 24 the
     guaranteed vein actually supplies. Penning it to `SHELF` is what makes
     this "a 5-tile dig on the flat ground at spawn", which is what
     docs/SPEC.md section 5 beat 3 promises. ---- */
  {
    const start = { bi: 0, tx: SPAWN_TX, ty: FLOOR_TY - 1 };
    const seen = new Map([[keyOf(start), 0]]);
    const queue = [[start, 0]];
    const copper = new Map();               // tile key -> its units, deduped
    for (let qi = 0; qi < queue.length; qi++) {
      const [node, cost] = queue[qi];
      if (seen.get(keyOf(node)) < cost) continue;      // already relaxed cheaper
      for (const nb of neighboursOf(gridBands, node)) {
        if (Math.abs(nb.tx - SPAWN_TX) > SHELF) continue;
        const b = gridBands[nb.bi];
        const byte = tileAt(b, nb.tx, nb.ty);
        const isAir = byte === AIR;
        const sub = isAir ? -1 : subAt(b, nb.tx, nb.ty);
        const isCopper = sub === S.copper;
        if (!isAir && !isCopper && tierOf(sub) > 1) continue;   // stock pick only
        const nc = cost + (isAir || isCopper ? 0 : 1);
        if (nc > 5) continue;
        const k = keyOf(nb);
        if (isCopper) copper.set(k, baseChargeAt(b, nb.tx, nb.ty));
        if (seen.has(k) && seen.get(k) <= nc) continue;
        seen.set(k, nc);
        queue.push([nb, nc]);
      }
    }
    let units = 0;
    for (const u of copper.values()) units += u;
    veinUnits.push(units);
    if (!copper.size)
      fail(`seed ${seed}: VEIN -- no copper reachable within a 5-tile dig from spawn (${SPAWN_TX},${FLOOR_TY})`);
    else if (units < TRIAL_COPPER)
      fail(`seed ${seed}: VEIN UNITS -- only ${units} copper unit(s) in ${copper.size} cell(s) within a 5-tile dig from spawn; docs/SPEC.md section 5 beat 3 promises ${TRIAL_COPPER}`);
    else if (units < TRIAL_COPPER + FURNACE_COPPER)
      fail(`seed ${seed}: VEIN UNITS -- ${units} copper unit(s) within a 5-tile dig covers the ${TRIAL_COPPER}-copper first trial but not the ${FURNACE_COPPER} more docs/SPEC.md section 13's furnace bill wants (${TRIAL_COPPER + FURNACE_COPPER} total)`);
  }

  /* ---- 4. within SAFE_R of spawn, no adjacent-column fall > 5 tiles ---- */
  {
    let worst = 0, worstAt = -1;
    for (let tx = Math.max(0, SPAWN_TX - SAFE_R); tx < Math.min(surface.tw - 1, SPAWN_TX + SAFE_R); tx++) {
      const d = Math.abs(groundRow(surface, tx + 1) - groundRow(surface, tx));
      if (d > worst) { worst = d; worstAt = tx; }
    }
    if (worst > 5) fail(`seed ${seed}: SAFE FALL -- column ${worstAt}->${worstAt + 1} steps ${worst} tiles within SAFE_R of spawn (budget 5)`);
  }

  /* ---- 5. adjacent columns differ by <= 1, big steps rare and far ---- */
  {
    let bigSteps = 0;
    for (let tx = 0; tx < surface.tw - 1; tx++) {
      const d = Math.abs(groundRow(surface, tx + 1) - groundRow(surface, tx));
      if (d <= 1) continue;
      bigSteps++;
      if (d > STEP_BIG)
        fail(`seed ${seed}: STEP -- column ${tx}->${tx + 1} steps ${d} tiles, over STEP_BIG (${STEP_BIG})`);
      /* `rules/generate.js#stepPass`'s own "room" test looks at ONE column at
         a time -- the OUTWARD one it is currently assigning -- not at both
         ends of the transition it produces, so the inward column of a big
         step is always exactly at the SAFE_R+1 boundary by construction
         (confirmed by first running this file with a both-ends test, which
         flagged that boundary column on every seed containing a big step
         anywhere near it). Mirroring the OUTWARD-column-only test here is
         what makes this the same check stepPass makes, not a stricter one it
         never promised. */
      const outer = Math.abs(tx - SPAWN_TX) > Math.abs(tx + 1 - SPAWN_TX) ? tx : tx + 1;
      if (Math.abs(outer - SPAWN_TX) <= SAFE_R + 1)
        fail(`seed ${seed}: STEP -- a ${d}-tile step at column ${tx}->${tx + 1} has its outward column inside SAFE_R+1 of spawn`);
    }
    const budget = Math.ceil((surface.tw - 1) / STEP_GAP);
    if (bigSteps > budget)
      fail(`seed ${seed}: STEP FREQUENCY -- ${bigSteps} big steps over ${surface.tw - 1} columns, budget ${budget} (1 per ${STEP_GAP})`);
  }

  /* ---- 6. surface height stays inside the declared relief budget ---- */
  {
    let worstOver = 0, worstAt = -1;
    for (let tx = 0; tx < surface.tw; tx++) {
      const row = groundRow(surface, tx);
      /* BOTH BOUNDS ARE THE RELIEF ROW'S OWN, read off the same content the
         generator reads -- `amp` rows of hilltop above floorTy and `dip` rows
         of valley floor below it. The lower bound used to be a hardcoded
         `floorTy + 1`, as room for the one-row ragged lip carve; wave 6 phase
         6c stopped carving that in any band with a height map, and the ground
         row then never reached floorTy + 1 on any of 200 seeds. */
      const over = Math.max(FLOOR_TY - RELIEF - row, row - (FLOOR_TY + DIP));
      if (over > worstOver) { worstOver = over; worstAt = tx; }
    }
    if (worstOver > 0)
      fail(`seed ${seed}: RELIEF -- column ${worstAt} at row ${groundRow(surface, worstAt)} is ${worstOver} tile(s) outside [floorTy-${RELIEF}, floorTy+${DIP}]`);
  }

  /* ---- 7 & 8. every hollow in surface + topsoil: roofed, and (in surface)
     clear of the spawn shelf and its SAFE_R -- one scan, both bands, since
     `rules/generate.js`'s own guards (`onShelf`/`nearSpawn`) apply the
     identical predicate to every hollow regardless of which strata row
     carved it, so the spawn column, the tutorial shaft (the same column,
     dug by hand) and the guaranteed vein (6 rows under it, r <= 3.6, always
     inside SAFE_R) are one geometric exclusion in the code, not three -- and
     that is what this checks, once, rather than three times over. ---- */
  for (const b of gridBands) {
    bandTiles[b.id] = (bandTiles[b.id] ?? 0) + b.tw * b.th;
    for (let ty = 0; ty < b.th; ty++) {
      for (let tx = 0; tx < b.tw; tx++) {
        /* Property 11's tally rides along on this scan rather than adding a
           second pass over 380,000 tiles per seed. */
        if (tileAt(b, tx, ty) !== AIR) {
          const id = SUB[subAt(b, tx, ty)].id;
          const k = `${b.id}/${id}`;
          if (DENSITY_FLOOR[k] !== undefined) density[k] = (density[k] ?? 0) + 1;
        }
        if (!isHollowTile(b, tx, ty)) continue;
        density[`${b.id}/air`] = (density[`${b.id}/air`] ?? 0) + 1;
        const roof = ty - groundRow(b, tx);
        if (roof < HOLLOW_ROOF)
          fail(`seed ${seed}: HOLLOW ROOF -- ${b.id} (${tx},${ty}) has only ${roof} rock row(s) above it, need ${HOLLOW_ROOF}`);
        if (b.id === 'surface') {
          const dx = tx - SPAWN_TX, dy = ty - FLOOR_TY;
          if (Math.abs(dx) <= SHELF)
            fail(`seed ${seed}: HOLLOW/SHELF -- surface (${tx},${ty}) is a hollow on the spawn shelf (|dx|<=${SHELF})`);
          else if (dx * dx + dy * dy <= SAFE_R * SAFE_R)
            fail(`seed ${seed}: HOLLOW/SAFE_R -- surface (${tx},${ty}) is a hollow within SAFE_R of spawn`);
        }
      }
    }
  }

  /* ---- 9. every ore body is reachable, AT ITS OWN TIER ---- */
  {
    const start = { bi: 0, tx: SPAWN_TX, ty: FLOOR_TY - 1 };
    const cache = {};
    for (const oreSub of ORE_SUBS) {
      const tier = tierOf(oreSub);
      for (const b of gridBands) {
        const bi = gridBands.indexOf(b);
        for (const comp of oreComponents(b, oreSub)) {
          const reach = reachableAtTier(gridBands, start, tier, cache);
          const ok2 = comp.some(c => reach.has(keyOf({ bi, tx: c.tx, ty: c.ty })));
          if (!ok2) {
            const c0 = comp[0];
            fail(`seed ${seed}: ORE SEALED -- ${SUB[oreSub].id} (tier ${tier}) body of ${comp.length} tile(s) at ${b.id} (${c0.tx},${c0.ty}) is unreachable at its own tier`);
          }
        }
      }
    }
  }

  /* ---- 10. the air over a valley floor has sky behind it ----
     `view/paint.js#skyBottomTy` is the one row BOTH the sky ramp
     (`view/scene.js#drawSky`) and the cut-rock test (`view/paint.js#excavated`)
     stop at, and it finds this band's relief row by the literal string
     `'relief'` and reads the literal field `dip`. Nothing else ties the two
     together. Spell either wrong and `skyBottomTy` quietly returns `floorTy`,
     every valley floor wears the black band `INK.void` again, and no other
     assertion anywhere moves -- so this one asserts the number AND the terrain
     it has to cover. ---- */
  {
    const want = FLOOR_TY + DIP;
    const got = skyBottomTy(surface);
    if (got !== want)
      fail(`seed ${seed}: SKY FLOOR -- skyBottomTy is ${got}, but the relief row declares floorTy ${FLOOR_TY} + dip ${DIP} = ${want}`);
    let worst = -1, worstAt = -1;
    for (let tx = 0; tx < surface.tw; tx++) {
      const row = groundRow(surface, tx);
      if (row > worst) { worst = row; worstAt = tx; }
    }
    if (worst > got)
      fail(`seed ${seed}: SKY FLOOR -- column ${worstAt}'s ground is row ${worst}, ${worst - got} row(s) below the deepest row the sky reaches (${got})`);
  }
}

console.log(`\nworldgen properties over seeds 1..${SEEDS} (WORLDGEN_SEEDS to change)`);
const t0 = Date.now();

for (let seed = 1; seed <= SEEDS; seed++) {
  /* ---- 1. DETERMINISM: same seed, twice, byte-identical mat/seen, every
     band. Isolated to worldgen's OWN output -- right after `newRun(seed)`,
     before any play -- unlike tools/check.mjs's determinism probes, which
     run 10,000 scripted substeps of gameplay on top. There is no separate
     per-tile "damage" array to compare: `model/mining.js` holds mining
     progress in a sparse Map keyed by tile, and it is empty immediately
     after `newRun` (nothing has been struck yet) on both sides of this
     comparison, by the same `digw.clearAll()` `newRun` always runs -- so
     comparing it would prove nothing this `mat`/`seen` comparison does not
     already prove more directly. `seen` is included because
     `revealRows(home, floorTy+8)` at the end of `newRun` is itself
     deterministic worldgen-adjacent state, not because it is terrain. ---- */
  boot.newRun(seed);
  const snap1 = bands.map(b => ({ id: b.id, mat: sumBytes(b.mat), seen: sumBytes(b.seen) }));
  boot.newRun(seed);
  const snap2 = bands.map(b => ({ id: b.id, mat: sumBytes(b.mat), seen: sumBytes(b.seen) }));
  for (let i = 0; i < snap1.length; i++) {
    if (snap1[i].mat !== snap2[i].mat)
      fail(`seed ${seed}: DETERMINISM -- band "${snap1[i].id}" mat differs between two newRun(${seed}) calls`);
    if (snap1[i].seen !== snap2[i].seen)
      fail(`seed ${seed}: DETERMINISM -- band "${snap1[i].id}" seen differs between two newRun(${seed}) calls`);
  }

  checkSeed(seed);
}

const ms = Date.now() - t0;
console.log(`  ..  ${SEEDS} seeds in ${ms} ms (${(ms / SEEDS).toFixed(2)} ms/seed)`);

/* THE CEILING, PRINTED AND NOT ASSERTED. The floor is a promise
   (docs/SPEC.md section 5 beat 3) and so it is a failure; "the vein is too
   rich" is a judgement about pacing with no locked number behind it, so it is
   a printed figure a human reads. Printing it is what makes the tightness of
   the margin visible -- 24 against a 22-unit bill is 2 spare, and that is
   worth seeing in the log rather than rediscovering. */
if (veinUnits.length) {
  const s = [...veinUnits].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  console.log(`  ..  vein copper UNITS within a 5-break dig: min ${s[0]}, median ` +
              `${s[s.length >> 1]}, mean ${mean.toFixed(1)}, max ${s[s.length - 1]} ` +
              `(floor ${TRIAL_COPPER} + ${FURNACE_COPPER} = ${TRIAL_COPPER + FURNACE_COPPER})`);
}

/* ---- 11. CONTENT PER SCREEN. ---- */
for (const k of DENSITY_KEYS) {
  const bandId = k.slice(0, k.indexOf('/'));
  const per = (density[k] ?? 0) * 1e4 / bandTiles[bandId];
  const floor = DENSITY_FLOOR[k];
  console.log(`  ..  ${k}: ${per.toFixed(1)} cells per 10,000 tiles (floor ${floor})`);
  if (per < floor)
    fail(`DENSITY -- ${k} is ${per.toFixed(1)} cells per 10,000 tiles of the band, under the ${floor} docs/SPEC.md section 16.5 holds`);
}

if (!failures) ok(`${SEEDS} seeds, 0 violations -- determinism, shelf, vein units, safe fall, ` +
                  `step rule, relief budget, sky floor, hollow roof, hollow exclusion, ore reachability, ` +
                  `content per screen`);
else console.log(`\n  ${failures} FAILURE(S) over ${SEEDS} seeds`);

/* Cheap rolling checksum, the same idiom tools/check.mjs#sumBytes uses --
   order-sensitive, so a transposition inside a band is caught too. */
function sumBytes(arr) {
  let h = 2166136261;
  for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
