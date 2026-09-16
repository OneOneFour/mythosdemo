/* WORLDGEN PROPERTIES over a seed sweep. Node only, and it stubs NOTHING:
   `boot.newRun` needs no canvas and no DOM, because `core/canvas.js#attach`
   and `#resize`, `shell/audio.js#initAudio` and `shell/input.js#installInput`
   all guard on `typeof document/window/addEventListener` and no-op without
   them.

   `tools/check.mjs` boots one hand-picked seed per staged scenario and
   `tools/content.mjs` never boots a world at all, so neither can host "does
   worldgen hold up over hundreds of seeds". Run by `npm run check:worldgen`
   and chained into `npm run test`, but deliberately NOT into the fast
   `npm run check` -- see the timing note at the bottom of this file.

   EVERY FAILURE PRINTS ITS SEED: a worldgen bug you cannot reproduce is a
   worldgen bug you cannot fix.

   Tier monotonicity is excluded on purpose. `tools/content.mjs` already
   proves it statically over the content tables, and a live re-check here
   would be a second implementation of the same assertion. */

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

/* CONSTANTS DUPLICATED FROM `rules/generate.js`, which exports none of them
   -- they are worldgen's own interpreter constants, not content. Re-typed
   here against the source as of 2026-09-01, and they MUST be re-verified by
   hand if generate.js's numbers move; this file cannot notice that drift.
   `RELIEF` is the exception and is read live off `data/world.js`'s own
   `relief` row, which is content the generator reads too. */
const SHELF    = 9;   // rules/generate.js#SHELF -- half-width of the flat spawn shelf
const SAFE_R   = 24;  // rules/generate.js#SAFE_R -- radius the first two minutes live in
const STEP_BIG = 2;   // rules/generate.js#STEP_BIG -- max permitted step outside SAFE_R
const STEP_GAP = 12;  // rules/generate.js#STEP_GAP -- min columns between two big steps
const HOLLOW_ROOF = 2; // rules/generate.js#HOLLOW_ROOF -- rock rows required over a hollow

const SEEDS = Number(process.env.WORLDGEN_SEEDS) || 200;

/* THE TWO COPPER BILLS THE FIRST TWO MINUTES OWE, in units: the First
   Trial's ten raw copper, then the furnace's own build bill, which the same
   hole has to pay for next. Typed here rather than read off
   `data/machines.js` on purpose -- the beat sheet names a NUMBER, so if the
   furnace's bill changes, whether the tutorial still fits should surface as
   a failure here and be answered deliberately. */
const TRIAL_COPPER   = 10;
const FURNACE_COPPER = 12;

/* Copper units within a 5-break dig, per seed. The FLOOR is asserted per seed
   in property 3; this collects the distribution so the sweep can print the
   CEILING too -- an absurdly rich guaranteed vein ends cycle 1 in fifteen
   seconds, and only a max can show that. */
const veinUnits = [];

/* SHARED GEOMETRY HELPERS, over the LIVE band records `boot.newRun` just
   built. Nothing here re-implements worldgen: everything asks the same model
   queries the game itself uses. */

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

/* The topmost solid row of a column, scanning from the sky down -- the query
   `rules/generate.js#firstSolid` makes for the hollow-roof rule, asked from
   OUTSIDE that file against the tiles it wrote.

   TIMBER IS SKIPPED: a trunk grows UP from the height map's ground line,
   strictly after the relief and step passes fixed it, so it stands ON the
   surface rather than being it. Counting a trunk's top tile as ground reads
   every tree as a 3-5 tile cliff the step rule never produced -- which is
   what a naive first run of this file reported, at nearly every seed. */
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

/* THE REACHABILITY GRAPH: surface and topsoil stacked as one graph. Both
   bands are the same width at 8 px/tile, so column `tx` in one is the SAME
   world column as `tx` in the other, and surface's bottom row sits directly
   above topsoil's row 0 (origin.y 320 + 56*8 = 768 = topsoil's origin.y).
   That is why stitching two separately-allocated tile arrays into one
   connectivity graph is one extra edge at the seam rather than a coordinate
   transform. `astral` carries no ore and sits above spawn, so it is out. */
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
   default `rules/mining.js`'s own gate uses.

   A TIER-BLIND FLOOD FILL WOULD PASS TRIVIALLY: every strata substance
   carries a finite `tile.hard`, so "diggable, ignoring tier" is true of every
   in-bounds tile by construction. The meaningful claim is that an ore body of
   tier T is reachable using nothing HARDER than T -- a copper vein must never
   need a detour through granite, which would be a T1 player unable to reach a
   T1 reward. So reachability is graded PER ORE BODY, at its own tier. */
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

/* CONTENT PER SCREEN, in cells per 10,000 tiles of the band. Aggregated over
   the whole sweep rather than asserted per seed: one seed's scatter is noisy
   and the claim is about the world a player walks through. Each floor is 80%
   of the measured mean, so an accidental thinning fails and ordinary seed
   variation does not.

   NO OTHER PROPERTY HERE IS A DENSITY, which is how a band widening from 128
   to 1,024 columns against an absolute `count` once left the same content in
   eight times the rock with this whole file green. */
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

/* One seed's worth of property checks, against `bands` as `boot.newRun` just
   left them. */
function checkSeed(seed) {
  const surface = bandOf('surface'), topsoil = bandOf('topsoil');
  const gridBands = [surface, topsoil];

  /* 2. spawn shelf: flat, >= 9 tiles half-width, centred on spawn. */
  {
    const want = groundRow(surface, SPAWN_TX);
    let bad = -1;
    for (let tx = SPAWN_TX - SHELF; tx <= SPAWN_TX + SHELF; tx++)
      if (groundRow(surface, tx) !== want) { bad = tx; break; }
    if (bad >= 0)
      fail(`seed ${seed}: SHELF -- column ${bad} sits at row ${groundRow(surface, bad)}, spawn row is ${want} (shelf spans ${SPAWN_TX - SHELF}..${SPAWN_TX + SHELF})`);
  }

  /* 3. the guaranteed copper vein: present within a 5-break dig, and rich
     enough -- in UNITS, not cells, since a deposit tile yields `tile.charge`
     of them. Summed through `model/tiles.js#baseChargeAt`, the query mining
     reads; base charge, not `eff('richness')`, because a boon cannot exist
     at t=0.

     Three things the budget does not count: arriving AT the vein, mining
     THROUGH copper once arrived, and any column outside `SHELF` -- open air
     is free and the sky is one connected region, so an unpenned flood digs
     its five breaks anywhere in the world. */
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
      fail(`seed ${seed}: VEIN UNITS -- only ${units} copper unit(s) in ${copper.size} cell(s) within a 5-tile dig from spawn; the First Trial needs ${TRIAL_COPPER}`);
    else if (units < TRIAL_COPPER + FURNACE_COPPER)
      fail(`seed ${seed}: VEIN UNITS -- ${units} copper unit(s) within a 5-tile dig covers the ${TRIAL_COPPER}-copper first trial but not the ${FURNACE_COPPER} more the furnace bill wants (${TRIAL_COPPER + FURNACE_COPPER} total)`);
  }

  /* 4. within SAFE_R of spawn, no adjacent-column fall > 5 tiles. */
  {
    let worst = 0, worstAt = -1;
    for (let tx = Math.max(0, SPAWN_TX - SAFE_R); tx < Math.min(surface.tw - 1, SPAWN_TX + SAFE_R); tx++) {
      const d = Math.abs(groundRow(surface, tx + 1) - groundRow(surface, tx));
      if (d > worst) { worst = d; worstAt = tx; }
    }
    if (worst > 5) fail(`seed ${seed}: SAFE FALL -- column ${worstAt}->${worstAt + 1} steps ${worst} tiles within SAFE_R of spawn (budget 5)`);
  }

  /* 5. adjacent columns differ by <= 1, big steps rare and far. */
  {
    let bigSteps = 0;
    for (let tx = 0; tx < surface.tw - 1; tx++) {
      const d = Math.abs(groundRow(surface, tx + 1) - groundRow(surface, tx));
      if (d <= 1) continue;
      bigSteps++;
      if (d > STEP_BIG)
        fail(`seed ${seed}: STEP -- column ${tx}->${tx + 1} steps ${d} tiles, over STEP_BIG (${STEP_BIG})`);
      /* THE OUTWARD COLUMN ONLY, because that is the column
         `rules/generate.js#stepPass` tests as it assigns it. The inward
         column of a big step therefore sits at the SAFE_R+1 boundary by
         construction, and a both-ends test here flagged it on every seed with
         a big step anywhere near spawn -- a stricter check than the generator
         ever promised. */
      const outer = Math.abs(tx - SPAWN_TX) > Math.abs(tx + 1 - SPAWN_TX) ? tx : tx + 1;
      if (Math.abs(outer - SPAWN_TX) <= SAFE_R + 1)
        fail(`seed ${seed}: STEP -- a ${d}-tile step at column ${tx}->${tx + 1} has its outward column inside SAFE_R+1 of spawn`);
    }
    const budget = Math.ceil((surface.tw - 1) / STEP_GAP);
    if (bigSteps > budget)
      fail(`seed ${seed}: STEP FREQUENCY -- ${bigSteps} big steps over ${surface.tw - 1} columns, budget ${budget} (1 per ${STEP_GAP})`);
  }

  /* 6. surface height stays inside the declared relief budget. */
  {
    let worstOver = 0, worstAt = -1;
    for (let tx = 0; tx < surface.tw; tx++) {
      const row = groundRow(surface, tx);
      /* BOTH BOUNDS ARE THE RELIEF ROW'S OWN, read off the content the
         generator reads: `amp` rows of hilltop above floorTy, `dip` rows of
         valley floor below it. Nothing is hardcoded here, because a hardcoded
         bound is a second copy of a number `data/world.js` owns. */
      const over = Math.max(FLOOR_TY - RELIEF - row, row - (FLOOR_TY + DIP));
      if (over > worstOver) { worstOver = over; worstAt = tx; }
    }
    if (worstOver > 0)
      fail(`seed ${seed}: RELIEF -- column ${worstAt} at row ${groundRow(surface, worstAt)} is ${worstOver} tile(s) outside [floorTy-${RELIEF}, floorTy+${DIP}]`);
  }

  /* 7 & 8. every hollow in surface and topsoil: roofed, and in surface clear
     of the spawn shelf and its SAFE_R. One scan over both bands, because
     `rules/generate.js`'s `onShelf`/`nearSpawn` guards apply one predicate to
     every hollow whatever strata row carved it -- the spawn column, the
     tutorial shaft and the guaranteed vein are one geometric exclusion in the
     code, not three. */
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

  /* 9. every ore body is reachable, AT ITS OWN TIER. */
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

  /* 10. the air over a valley floor has sky behind it. `skyBottomTy` is the
     row both the sky ramp and the cut-rock test stop at, and it finds the
     relief row by the literal string `'relief'` and reads the literal field
     `dip`. Spell either wrong and it quietly returns `floorTy`, every valley
     floor wears black again, and nothing else anywhere moves -- so this
     asserts the number AND the terrain it has to cover. */
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
  /* 1. DETERMINISM: same seed, twice, byte-identical `mat` and `seen` in
     every band. Isolated to worldgen's own output -- right after
     `newRun(seed)`, before any play -- unlike `tools/check.mjs`'s
     determinism probes, which run scripted gameplay on top. Mining progress
     is not compared because `model/mining.js`'s sparse Map is empty on both
     sides here. `seen` is, because `revealRows` at the end of `newRun` is
     deterministic state too. */
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

/* THE CEILING IS PRINTED, NOT ASSERTED. The floor is a promise and so it is a
   failure; "too rich" is a pacing judgement with no locked number behind it.
   Printing it makes the margin visible -- 24 units against a 22-unit bill is
   2 spare, worth seeing in the log rather than rediscovering. */
if (veinUnits.length) {
  const s = [...veinUnits].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  console.log(`  ..  vein copper UNITS within a 5-break dig: min ${s[0]}, median ` +
              `${s[s.length >> 1]}, mean ${mean.toFixed(1)}, max ${s[s.length - 1]} ` +
              `(floor ${TRIAL_COPPER} + ${FURNACE_COPPER} = ${TRIAL_COPPER + FURNACE_COPPER})`);
}

/* 11. CONTENT PER SCREEN. */
for (const k of DENSITY_KEYS) {
  const bandId = k.slice(0, k.indexOf('/'));
  const per = (density[k] ?? 0) * 1e4 / bandTiles[bandId];
  const floor = DENSITY_FLOOR[k];
  console.log(`  ..  ${k}: ${per.toFixed(1)} cells per 10,000 tiles (floor ${floor})`);
  if (per < floor)
    fail(`DENSITY -- ${k} is ${per.toFixed(1)} cells per 10,000 tiles of the band, under this file's floor of ${floor}`);
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
