/* Worldgen properties over a seed sweep; every failure prints its seed. Node
   only and nothing is stubbed: the canvas, audio and input entry points
   `boot.newRun` reaches all guard on `typeof document/window`. */

import { S, SUB } from '../src/data/substances.js';
import { AIR } from '../src/data/forms.js';
import { BANDS } from '../src/data/world.js';
import * as boot from '../src/shell/boot.js';
import { bands } from '../src/model/world.js';
import { solidAt, subAt, tileAt, skyExposedAt, baseChargeAt } from '../src/model/tiles.js';
/* The row the renderer stops the sky at, read from the module that defines it
   rather than recomputed here. `view/paint.js` imports cleanly in Node:
   `core/canvas.js#offscreen` is only called from `chunkCanvas`. */
import { skyBottomTy } from '../src/view/paint.js';

let failures = 0;
const fail = m => { console.error('  FAIL  ' + m); failures++; process.exitCode = 1; };
const ok   = m => console.log('  ok    ' + m);

/* Re-typed from `rules/generate.js`, which exports none of them, and not
   noticed by this file if they drift there. `RELIEF` is the exception, read
   live off `data/world.js`'s own `relief` row. */
const SHELF    = 9;   // rules/generate.js#SHELF -- half-width of the flat spawn shelf
const SAFE_R   = 24;  // rules/generate.js#SAFE_R -- radius the first two minutes live in
const STEP_BIG = 2;   // rules/generate.js#STEP_BIG -- max permitted step outside SAFE_R
const STEP_GAP = 12;  // rules/generate.js#STEP_GAP -- min columns between two big steps
const HOLLOW_ROOF = 2; // rules/generate.js#HOLLOW_ROOF -- rock rows required over a hollow

const SEEDS = Number(process.env.WORLDGEN_SEEDS) || 200;

/* The two copper bills the first two minutes owe, in units: the first trial's
   ten raw copper, then the furnace's build bill. Duplicated rather than read
   off `data/machines.js`, so a change to either bill fails here. */
const TRIAL_COPPER   = 10;
const FURNACE_COPPER = 12;

/* Copper units within a 5-break dig, per seed. The floor is asserted per
   seed; this collects the distribution so the sweep can print the ceiling. */
const veinUnits = [];

const surfaceCfg = BANDS.find(b => b.id === 'surface');
const SPAWN_TX = surfaceCfg.spawnTx;
const FLOOR_TY = surfaceCfg.floorTy;
const RELIEF = surfaceCfg.strata.find(r => r.kind === 'relief').amp;
const DIP = surfaceCfg.strata.find(r => r.kind === 'relief').dip ?? 0;

/* At `dip` 0 the right and the wrong answer for `skyBottomTy` are both
   `floorTy`, so the sky-floor property below cannot tell them apart. */
if (DIP <= 0) fail(`the surface relief row declares dip ${DIP}; the sky-floor property cannot tell a correct skyBottomTy from a broken one below 1`);

/* The topmost solid row of a column, skipping timber: a trunk grows up from
   the ground line after the relief and step passes, so counting its top tile
   reads every tree as a 3-5 tile cliff the step rule never produced. */
function groundRow(b, tx) {
  for (let ty = 0; ty < b.th; ty++)
    if (solidAt(b, tx, ty) && subAt(b, tx, ty) !== S.timber) return ty;
  return b.th;
}

/* A carved room rather than open sky: air with no clear path up to true sky.
   Sky-exposed air is an ordinary hillside or valley. */
function isHollowTile(b, tx, ty) {
  return tileAt(b, tx, ty) === AIR && !skyExposedAt(b, tx, ty);
}

const bandOf = id => bands.find(b => b.id === id);

/* Surface and topsoil as one connectivity graph. Same width at 8 px/tile, so
   `tx` is the same world column in both, and surface's last row sits directly
   above topsoil's row 0 (origin.y 320 + 56*8 = 768): one extra edge. */
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
/* Packed node key. The column stride is the widest band, so row `ty` in the
   last column cannot collide with row `ty + 1` in an early one. */
const KEY_STRIDE = Math.max(...BANDS.map(b => b.tw));
const KEY_BAND = 1e7;
{
  const deepest = Math.max(...BANDS.map(b => b.th));
  if (deepest * KEY_STRIDE + KEY_STRIDE > KEY_BAND)
    fail(`keyOf: ${deepest} rows x ${KEY_STRIDE} columns overflows the ${KEY_BAND} band slot`);
}
const keyOf = n => n.bi * KEY_BAND + n.ty * KEY_STRIDE + n.tx;

/* Tier of a tile to dig through, defaulting as `rules/mining.js`'s own gate
   does. Reachability is graded per ore body at its own tier; tier-blind, every
   strata substance carries a finite `tile.hard` and the fill is vacuous. */
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

/* Every maximal same-substance blob in a band, by 8-connectivity: a cruciform
   cluster's arms (rules/generate.js#star, `DIRS`) are diagonal past the first
   four, so 4-connectivity would slice one vein into several bodies. */
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

/* Every substance a `blobs` or `vein` strata row places, derived from the
   content table so a fifth ore in data/world.js needs no edit here. */
const ORE_SUBS = [...new Set(
  BANDS.flatMap(b => (b.strata || [])
    .filter(r => r.kind === 'blobs' || r.kind === 'vein')
    .map(r => S[r.sub]))
)];

/* Content per screen, in cells per 10,000 tiles of the band, summed over the
   whole sweep rather than asserted per seed. Each floor is 80% of the measured
   mean, so an accidental thinning fails and seed variation does not. */
const DENSITY_FLOOR = {
  'surface/copper': 71, 'surface/air': 173,
  'topsoil/copper': 61, 'topsoil/tin': 49,
  'topsoil/granite': 34, 'topsoil/adamant': 21, 'topsoil/air': 767
};
const density = {};        // 'band/thing' -> cells summed over the sweep
const bandTiles = {};      // band id -> tiles summed over the sweep

/* Every band/substance pair a `blobs` or `vein` row places, plus `air` for a
   band with a `hollows` row. Restricted to the bands the full-band hollow scan
   walks, since a key for any other band has no tile total to divide by. */
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

  /* Spawn shelf: flat, SHELF tiles either side of spawn. */
  {
    const want = groundRow(surface, SPAWN_TX);
    let bad = -1;
    for (let tx = SPAWN_TX - SHELF; tx <= SPAWN_TX + SHELF; tx++)
      if (groundRow(surface, tx) !== want) { bad = tx; break; }
    if (bad >= 0)
      fail(`seed ${seed}: SHELF -- column ${bad} sits at row ${groundRow(surface, bad)}, spawn row is ${want} (shelf spans ${SPAWN_TX - SHELF}..${SPAWN_TX + SHELF})`);
  }

  /* The guaranteed copper vein: present within a 5-break dig and rich enough, in
     units rather than cells, since a deposit tile yields `tile.charge` of them.
     Base charge and not `eff('richness')`, since no boon exists at t=0. */
  {
    const start = { bi: 0, tx: SPAWN_TX, ty: FLOOR_TY - 1 };
    const seen = new Map([[keyOf(start), 0]]);
    const queue = [[start, 0]];
    const copper = new Map();               // tile key -> its units, deduped
    for (let qi = 0; qi < queue.length; qi++) {
      const [node, cost] = queue[qi];
      if (seen.get(keyOf(node)) < cost) continue;      // already relaxed cheaper
      for (const nb of neighboursOf(gridBands, node)) {
        /* Penned to the shelf: air is free and the sky is one connected
           region, so an unpenned flood digs its five breaks anywhere. */
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

  /* No adjacent-column fall over 5 tiles within SAFE_R of spawn. */
  {
    let worst = 0, worstAt = -1;
    for (let tx = Math.max(0, SPAWN_TX - SAFE_R); tx < Math.min(surface.tw - 1, SPAWN_TX + SAFE_R); tx++) {
      const d = Math.abs(groundRow(surface, tx + 1) - groundRow(surface, tx));
      if (d > worst) { worst = d; worstAt = tx; }
    }
    if (worst > 5) fail(`seed ${seed}: SAFE FALL -- column ${worstAt}->${worstAt + 1} steps ${worst} tiles within SAFE_R of spawn (budget 5)`);
  }

  /* Adjacent columns differ by <= 1; big steps rare and far from spawn. */
  {
    let bigSteps = 0;
    for (let tx = 0; tx < surface.tw - 1; tx++) {
      const d = Math.abs(groundRow(surface, tx + 1) - groundRow(surface, tx));
      if (d <= 1) continue;
      bigSteps++;
      if (d > STEP_BIG)
        fail(`seed ${seed}: STEP -- column ${tx}->${tx + 1} steps ${d} tiles, over STEP_BIG (${STEP_BIG})`);
      /* The outward column only, because that is the column
         `rules/generate.js#stepPass` tests as it assigns it; the inward column
         sits on the SAFE_R+1 boundary by construction. */
      const outer = Math.abs(tx - SPAWN_TX) > Math.abs(tx + 1 - SPAWN_TX) ? tx : tx + 1;
      if (Math.abs(outer - SPAWN_TX) <= SAFE_R + 1)
        fail(`seed ${seed}: STEP -- a ${d}-tile step at column ${tx}->${tx + 1} has its outward column inside SAFE_R+1 of spawn`);
    }
    const budget = Math.ceil((surface.tw - 1) / STEP_GAP);
    if (bigSteps > budget)
      fail(`seed ${seed}: STEP FREQUENCY -- ${bigSteps} big steps over ${surface.tw - 1} columns, budget ${budget} (1 per ${STEP_GAP})`);
  }

  /* Surface height stays inside the declared relief budget. */
  {
    let worstOver = 0, worstAt = -1;
    for (let tx = 0; tx < surface.tw; tx++) {
      const row = groundRow(surface, tx);
      /* Both bounds are the relief row's own: `amp` rows of hilltop above
         floorTy, `dip` rows of valley floor below it. */
      const over = Math.max(FLOOR_TY - RELIEF - row, row - (FLOOR_TY + DIP));
      if (over > worstOver) { worstOver = over; worstAt = tx; }
    }
    if (worstOver > 0)
      fail(`seed ${seed}: RELIEF -- column ${worstAt} at row ${groundRow(surface, worstAt)} is ${worstOver} tile(s) outside [floorTy-${RELIEF}, floorTy+${DIP}]`);
  }

  /* Every hollow in surface and topsoil: roofed, and in surface clear of the
     spawn shelf and its SAFE_R. One scan over both bands, since
     `rules/generate.js`'s `onShelf`/`nearSpawn` are one geometric exclusion. */
  for (const b of gridBands) {
    bandTiles[b.id] = (bandTiles[b.id] ?? 0) + b.tw * b.th;
    for (let ty = 0; ty < b.th; ty++) {
      for (let tx = 0; tx < b.tw; tx++) {
        /* The density tally rides along rather than adding a second pass
           over 380,000 tiles per seed. */
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

  /* Every ore body is reachable at its own tier. */
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

  /* The air over a valley floor has sky behind it. `skyBottomTy` finds its row by
     the literal string `'relief'` and the literal field `dip`; spell either wrong
     and it returns `floorTy` and every valley floor wears black. */
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
  /* Same seed twice, byte-identical `mat` and `seen` in every band, taken
     right after `newRun` and before any play. Mining progress is not compared
     because `model/mining.js`'s sparse Map is empty on both sides here. */
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

/* The ceiling is printed, not asserted: the floor is a promise, while "too
   rich" is a pacing judgement with no locked number behind it. */
if (veinUnits.length) {
  const s = [...veinUnits].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  console.log(`  ..  vein copper UNITS within a 5-break dig: min ${s[0]}, median ` +
              `${s[s.length >> 1]}, mean ${mean.toFixed(1)}, max ${s[s.length - 1]} ` +
              `(floor ${TRIAL_COPPER} + ${FURNACE_COPPER} = ${TRIAL_COPPER + FURNACE_COPPER})`);
}

/* Content per screen, against the floors declared above. */
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

/* FNV-1a rolling checksum; order-sensitive, so a transposition inside a band
   is caught too. */
function sumBytes(arr) {
  let h = 2166136261;
  for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
