# 04 — Layered core with an enforced dependency direction

## Core model

The disease is not a missing abstraction, it is a missing *direction*. I measured
today's graph: **83 internal import edges across 19 files, of which 16 are
illegal** under the layering below — 5 upward (`rules` reaching for the audio
device), 10 sideways (`view` reaching into `rules` for `aim`, `structures`,
`surface`, `BEATS`, `player`), 1 cycle (`scene.js ⇄ hud.js`). Every hardcoding
complaint in the brief sits on one of those edges: `paint.js:127` can
string-compare `'copper'` only because the renderer may import the gameplay
table. So: six layers, one legal direction, and **a checker that fails the build
on an upward or sideways edge**.

```
core    rng, math, pixel ops, font, colour mixing        -> core
data    substances, machines, palette, bands, tuning     -> core data
model   tile store, entity store, fields, run, journal   -> core data model
rules   mining, physics, machine tick, worldgen, director-> core data model
view    paint, scene, hud, overlays                      -> core data model
shell   loop, input, audio device, boot, schedule        -> anything
```

Three rules do the work:

1. **`rules` and `view` are siblings and may not import each other** — this
   forces `aim`, `structures`, `surface` and the tutorial's `progress` into
   `model`, where the renderer may legitimately read them.
2. **`rules` modules may not import each other either.** Each is a pure
   `step(dt)` over `model`, ordered once in `shell/schedule.js`.
3. **Mutators are not importable by `view`.** Each `model` module exports queries
   plus one `export const write = {...}`; `view` may name neither `write` nor
   `import * as` on a model module. Both are regexable.

Notification — toasts, sounds, "a tile broke" — flows *downward as data*: `rules`
pushes onto `model.journal` and `shell` drains it. Nothing calls upward.

## Representation stance

**Data-oriented: content is frozen plain-object tables, state is typed arrays and
plain objects, behaviour is free functions. No `class` and no `this` anywhere in
`src/`.** The line: nothing in `data` or `model` has methods, nothing in `rules`
has state. Where a definition needs logic rather than a number it carries an
**inline pure function written in the data file itself**, taking an injected
narrow API, so the logic sits inside the semantic thing without `data` importing
anything. The layering would tolerate classes inside `model`; I decline them
because a class instance is not inspectable, serialisable or diffable, and a
roguelike with seeds and saves wants all three.

### (a) `copper` — layer: `data`

```js
// src/data/substances.js
// One row is the whole of a substance: physics, item identity, appearance,
// sound and where worldgen places it. Nothing outside this file names 'copper'.
export const SUBSTANCES = [
  { id:'air',     name:'AIR',     tile:{ solid:false } },
  { id:'bedrock', name:'BEDROCK', tile:{ solid:true, hard:Infinity },
                                  look:{ base:'abyC' } },
  // ...
  { id:'copper',
    name:'COPPER VEIN',
    tags:['ore', 'mineable'],

    tile:{ solid:true,
           hard:0.95,              // seconds to break at pick power 1
           drop:'copper' },

    item:{ label:'COPPER', size:4, mass:1.0,
           hud:{ order:1, always:true } },

    look:{ base:'cuB', hi:'cuA', lo:'cuD',           // rock tones
           item:['cuA', 'cuC'],                      // dropped-item tones
           treatments:[ { fn:'glint', col:'veinA', n:2 } ],
           sfx:{ break:'ore', pickup:'pickup' } },

    gen:{ blobs:{ fromTy:38, chance:0.25, depthBias:0.6,
                  r:[1.6, 3.8], count:90 },
          guaranteed:[ { near:'spawn', dy:8, r:3.1 } ] } }
];

// Derived indices, built once and frozen. `mix()` never runs on a hot path again.
export const S     = Object.freeze(Object.fromEntries(SUBSTANCES.map((s, i) => [s.id, i])));
export const SUB   = Object.freeze(SUBSTANCES.map(Object.freeze));
export const byTag = Object.freeze(SUBSTANCES.reduce((m, s, i) => {
  for (const t of s.tags || []) (m[t] ||= []).push(i);
  return m;
}, {}));
```

### (b) The furnace — layer: `data` (definition) + `rules` (one shared interpreter)

The row owns every furnace-specific fact, including the two behaviours named in
the brief: `catchBox` (swallow material falling through the mouth) and `handFeed`
(draw from the player's pockets while adjacent). Both are parameterised flags,
not code, because their *shape* is shared with every future machine.

```js
// src/data/machines.js
export const MACHINES = [
  { id:'furnace', name:'CRUDE FURNACE',
    tw:3, th:2, footing:2,                 // 3x2 tiles, needs 2 solid tiles under it

    ports:[ { side:'top', mode:'in',  accepts:['#ore', '#fuel'] },
            { side:'top', mode:'out' } ],

    buffer:{ cap:{ '#ore':4, '#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },     // items falling into the mouth are free
    handFeed:{ reach:10, from:['#ore', '#fuel'] },

    recipes:[ { in:{ copper:2, timber:1 }, out:{ ingot:1 }, secs:4.0 } ],

    // The one place a furnace needs logic rather than a number: the servo from
    // CLAUDE.md's throughput model. Pure, inline, in the definition itself.
    boost:(m, api) => api.fill(m, '#ore') > 0.55 ? 1.38 : 1,

    look:{ body:'irC', trim:'irB', base:'irD', fire:true,
           pips:[ { tag:'#ore', row:0 }, { tag:'#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } }
];
```

```js
// src/rules/machines.js — the ONLY code that ticks a machine. Contains no
// machine name, no substance name and no number. Free functions over `model`.
import { MACHINES } from '../data/machines.js';
import { S } from '../data/substances.js';
import { machines, fill, write as mw } from '../model/machines.js';
import { itemsNear, write as iw } from '../model/items.js';
import { invCount, write as rw } from '../model/run.js';
import { playerBox } from '../model/player.js';
import { write as fw, fieldAt } from '../model/fields.js';
import { push } from '../model/journal.js';
import { matches, overlaps } from '../model/space.js';

const api = { fill, fieldAt };            // the narrow surface a definition may use

export function step(dt) {
  for (const m of machines) {
    const def = MACHINES[m.def];
    if (def.catchBox) catchFalling(m, def);
    if (def.handFeed) handFeed(m, def);
    for (const p of def.ports)
      if (p.mode === 'fluidIn') fw.drain(p.field, m.mouth[p.side], p.rate * dt);
    produce(m, def, dt);
  }
}

/* --- catch box: anything falling through the mouth is swallowed for free --- */
function catchFalling(m, def) {
  const mouth = m.mouth[def.catchBox.mouth];
  for (const i of itemsNear(mouth, def.catchBox.slack)) {
    if (!accepts(def, i.sub) || full(m, def, i.sub)) continue;
    mw.take(m, i.sub, 1);
    iw.remove(i);
    push('accept', m, i.sub);              // shell turns this into sound + chips
  }
}

/* --- hand feeding: stand next to it and it draws from your pockets --- */
function handFeed(m, def) {
  if (!overlaps(playerBox(), m.box, def.handFeed.reach)) return;
  for (const sel of def.handFeed.from)
    for (const sub of matches(sel))
      if (!full(m, def, sub) && invCount(sub) > 0 && rw.spend(sub, 1)) {
        mw.take(m, sub, 1);
        push('accept', m, sub);
      }
}

/* --- run a recipe: first one whose inputs are all present --- */
function produce(m, def, dt) {
  const r = def.recipes.find(r => satisfied(m, r));
  if (!r) { m.prog = 0; return; }
  m.prog += dt * (def.boost ? def.boost(m, api) : 1);
  if (m.prog < r.secs) return;
  m.prog -= r.secs;
  for (const [sel, n] of Object.entries(r.in)) mw.consume(m, sel, n);
  for (const [sub, n] of Object.entries(r.out))
    for (let k = 0; k < n; k++) iw.spawnAt(m.mouth.out, S[sub]);
  m.made++;
  push('produce', m, r);
}

/* --- selector helpers: '#tag' or a bare substance id, resolved via model/space --- */
const accepts   = (def, sub) => def.ports.some(p => p.mode === 'in'
                    && p.accepts.some(sel => matches(sel).includes(sub)));
const capOf     = (def, sub) => Object.entries(def.buffer.cap)
                    .find(([sel]) => matches(sel).includes(sub))?.[1] ?? 0;
const full      = (m, def, sub) => mw.count(m, sub) >= capOf(def, sub);
const satisfied = (m, r) => Object.entries(r.in).every(([sel, n]) => mw.count(m, sel) >= n)
                    && (!r.fluid || Object.entries(r.fluid)
                         .every(([f, v]) => m.fluid[f] >= v));
```

### (c) The crusher — layer: `data`, and nothing else

```js
// src/data/machines.js — appended. No rules, view, model or shell edit.
{ id:'crusher', name:'CRUSHER',
  tw:2, th:2, footing:2,
  ports:[ { side:'top',    mode:'in', accepts:['#ore'] },
          { side:'bottom', mode:'out' } ],
  buffer:{ cap:{ '#ore':6 } },
  catchBox:{ mouth:'top', slack:2 },
  recipes:[ { in:{ '#ore':1 }, out:{ gravel:2 }, secs:1.6 } ],
  look:{ body:'irD', trim:'irB', base:'basC', shake:true,
         pips:[ { tag:'#ore', row:0 } ],
         sfx:{ accept:'breakHard', produce:'breakSoft' } } }
```

Plainly: the crusher needs **one other row**, because `gravel` is not yet
content — a substance, not engine code, same shape as (a):

```js
// src/data/substances.js — appended
{ id:'gravel', name:'GRAVEL', tags:['crushed'],
  item:{ label:'GRAVEL', size:3, mass:0.6, hud:{ order:4 } },
  look:{ item:['limeB', 'limeD'], sfx:{ pickup:'pickup' } } }
```

No `tile` block, so gravel can never be a wall: an absent block is a declaration.
`#ore` means the crusher eats copper *and* tin without naming either. Two rows,
zero engine lines.

## Benchmark

### 1. Add a substance — one row

`MAT` and `KIND` merge into one array; index is still the tile id byte. A row may
omit any block, and `rules/generate.js` iterates rows with a `gen` block, so an
ore places itself without worldgen naming it.

```js
// data/substances.js — adding tin is this row and nothing else
{ id:'tin', name:'TIN VEIN',
  tags:['ore','mineable'],
  tile: { solid:true, hard:1.10, drop:'tin' },
  item: { label:'TIN', size:3, mass:1.0, hud:{ order:3 } },
  look: { base:'cuC', hi:'irA', lo:'irD', item:['irA','irC'],
          treatments:[{ fn:'glint', col:'veinA', n:2 }],
          sfx:{ break:'breakHard', pickup:'ore' } },
  gen:  { blobs:{ fromTy:60, chance:0.18, r:[1.6,3.8], perBand:70 } } }
```

Caveat: a new hue means two entries in `data/palette.js` — second file, same
layer, no engine code.

### 2. Add machines — no engine code

Furnace and crusher rows, and the interpreter, are above. The washery adds a
fluid input and is still a row:

```js
// data/machines.js — appended
{ id:'washery', name:'WASHERY', tw:3, th:2, footing:3,
  ports:[ { side:'top',   mode:'in', accepts:['gravel'] },
          { side:'left',  mode:'fluidIn', field:'water', rate:0.5 },
          { side:'right', mode:'out' } ],
  buffer:{ cap:{ gravel:6 }, fluid:{ water:2.0 } },
  recipes:[ { in:{ gravel:2 }, fluid:{ water:0.4 },
              out:{ concentrate:1 }, secs:3.0 } ],
  look:{ body:'aquB', trim:'watC', pips:[ { tag:'gravel', row:0 } ] } }
```

`fluidIn` and the `fluid` clause are already served by the two lines calling
`fw.drain()` and testing `m.fluid`: the seam is wired before any fluid exists.
`placeFurnace()` becomes `rules/place.js` reading `tw/th/footing`;
`structures.js` is deleted.

### 3. Data-driven painting

`view/treatments.js` is a table of small pure functions keyed by name. "This
glows" is a row there plus a name in a substance row: no paint function edited,
zero substance names in `view/paint.js`.

```js
// view/treatments.js
import { R, glow } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { COL } from '../data/palette.js';

export const TREAT = {
  glint(g, c, p) {                       // c = { px, py, tx, ty, tile }
    for (let k = 0; k < (p.n || 2); k++)
      R(g, c.px + (hash2(c.tx + k * 13, c.ty * 5) * 8 | 0),
           c.py + (hash2(c.ty + k * 7,  c.tx * 3) * 8 | 0), 1, 1, COL[p.col]);
  },
  glow(g, c, p) { glow(g, c.px + 4, c.py + 4, p.r || 10, COL[p.col], p.a || 0.35); },
  banded(g, c, p) { /* ... */ }
};

// view/paint.js — the only line that used to say `if (M.id === 'copper')`
for (const t of L.treatments) TREAT[t.fn](g, cell, t);
```

### 4. Configurable world — `model` owns allocation

```js
// data/world.js
export const BANDS = [
  { id:'tutorial', tw:128, th:384, tile:8, chunk:16, surfaceTy:26, spawnTx:42 },
  { id:'aquifer',  tw:192, th:512, tile:8, chunk:16, surfaceTy:0,  fields:['water'] }
];

// model/world.js — no module-scope dimension constants anywhere
export const world = { tw:0, th:0, tile:8, chunk:16, cx:0, cy:0,
                       mat:null, dmg:null, dirty:null, epoch:0 };

export const write = {
  allocate(band) {
    Object.assign(world, band);
    world.cx = Math.ceil(band.tw / band.chunk);
    world.cy = Math.ceil(band.th / band.chunk);
    world.mat   = new Uint8Array(band.tw * band.th);
    world.dirty = new Uint8Array(world.cx * world.cy).fill(1);
    world.epoch++;
  }
};

export const idx = (tx, ty) => ty * world.tw + tx;     // reads the object
export const inBounds = (tx, ty) => tx >= 0 && tx < world.tw && ty >= 0 && ty < world.th;
```

`newRun()` calls `write.allocate(BANDS[0])`, so world size is a runtime value and
a second band is a row plus a call. Out-of-bounds `tileAt()` returns **bedrock**,
not `-1`, deleting seven special-cases and the `MAT[-1]` throw.

### 5. Where mining lives

`rules/mining.js`; `model/tiles.js` keeps storage and queries only. That
placement *is* the truncation fix: progress leaves the tile store, so nothing
pressures it into a byte.

```js
// model/mining.js
export const dig = { work: null };                 // Float32Array, seconds applied
export const write = {
  alloc(n) { dig.work = new Float32Array(n); },
  add(i, secs) { return (dig.work[i] += secs); },
  clear(i) { dig.work[i] = 0; }
};
export const progressAt = (i, hard) => Math.min(1, dig.work[i] / hard);
```

The rule breaks the tile when `work >= hard`, both in seconds: granite takes
exactly 2.40 s, with no `/255` left to round.

### 6. Item identity

**Array-of-objects, two hidden classes.** Eight monomorphic hot slots
`{x, y, vx, vy, sub, rest, age, mod}`; `mod` stays `null` until an item deviates.
Shared properties live on the substance row, so `mass` and `fragility` cost
nothing per item:

```js
export const massOf  = it => it.mod?.mass  ?? SUB[it.sub].item.mass;
export const tempOf  = it => it.mod?.temp  ?? 0;
```

Adding a property is a row field plus an accessor; the container's shape never
changes. Not SoA — at 400 items "add a property" would mean "add an array" — and
the accessors let `model` switch later with no `rules` edit.

### 7. Fluid and heat seam

`model/fields.js`: one `Float32Array` per named field sized from the band cfg,
plus an **active set** (`Int32Array` ring + `Uint8Array` mask, O(1) push and
dedup). `rules/fields.js` walks only that set, re-activating the 4-neighbourhood
of any cell it moves past epsilon. It deliberately **does not reuse the
chunk-dirty machinery**: those canvases cache *static rock* at ~4,300 `fillRect`
each, and a flood front would thrash them into the hitch the audit found. Fields
draw as a viewport-culled overlay in `view/overlays.js`, while `view/cache.js`
separately gains a repaint budget and LRU cap from `data/tuning.js` — that cache
lives in `view` because `model` may not know rendering exists.

### 8. HUD inventory from data

```js
// view/hud.js
const ROWS = SUBSTANCES.filter(s => s.item?.hud)
                       .sort((a, b) => a.item.hud.order - b.item.hud.order);
for (const s of ROWS) {
  const n = inv(s.id);
  if (!n && !s.item.hud.always) continue;
  swatch(cx, y, COL[s.look.item[0]]);
  drawText(ctx, String(n), cx + 6, y, P.ui, 1, 1);
  cx += 12 + textWidth(String(n));
}
```

### 9. Entity spatial indexing

`model/space.js`: a uniform 32 px bucket grid, `Int32Array` heads plus a `next`
chain over the item array, no per-frame allocation. `model/items.js` rebuckets on
write, machines insert port AABBs at placement, `itemsNear(rect)` visits 4–9
buckets. Plus `awake`/`asleep` lists: resting items are neither integrated nor
tested against mouths, waking only on a tile write beneath them or a machine
pulling, so the `O(structures × items)` rescan disappears.

### 10. The three bugs, by construction

- **Granite 2.40 s.** Float32 seconds in `model/mining.js` (§5); `check` asserts
  break time for every mineable substance at `dt ∈ {1/30, 1/60, 1/240}` against
  `tile.hard`, parametrised from the table so it cannot drift.
- **20 tiles lethal at any framerate.** `shell/main.js` runs a fixed 1/120 s
  accumulator, so `rules` never see a variable dt, and impact speed comes from
  distance fallen — `v = min(TERMINAL, sqrt(2·g·(y − fallFrom)))` — not a
  per-frame `max(vy)` sample. Hearts become a function of geometry only.
- **No tunnelling.** One swept query, `model/collide.js sweep(aabb, dx, dy)`,
  used by *both* the player and item rules — today items integrate ad hoc, which
  is why only they tunnel. At 1/120 s a terminal-velocity item travels 3.3 px
  against an 8 px tile; `check` fuzzes 8 offsets × 3 dt values, asserting zero.

## Enforcement — `tools/layers.mjs`

~60 lines, no dependencies, ~10 ms, section 0 of `npm run check` so it fails
before anything is imported.

```js
// tools/layers.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const MAY = {                                  // layer -> layers it may import
  core:  ['core'],
  data:  ['core', 'data'],
  model: ['core', 'data', 'model'],
  rules: ['core', 'data', 'model'],            // NOT rules: siblings talk via model
  view:  ['core', 'data', 'model', 'view'],
  shell: ['core', 'data', 'model', 'rules', 'view', 'shell']
};
const RULES_MAY_IMPORT_RULES = false;
const IMPORT = /(?:import|export)\s+(?:([\s\S]*?)\s+from\s+)?['"](\.[^'"]+)['"]/g;

const SRC = resolve('src');
const layerOf = f => f.split('/')[0];
const walk = d => readdirSync(d).flatMap(e => {
  const p = join(d, e);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

let bad = [], edges = [];
for (const file of walk(SRC)) {
  const from = relative(SRC, file), fl = layerOf(from);
  const src = readFileSync(file, 'utf8');
  for (const [, clause = '', spec] of src.matchAll(IMPORT)) {
    const to = relative(SRC, resolve(dirname(file), spec));
    if (to.startsWith('..')) continue;                       // vendor/
    const tl = layerOf(to);
    edges.push([from, to]);
    if (!MAY[fl].includes(tl))
      bad.push(`${from} -> ${to}   [${fl} may not import ${tl}]`);
    if (fl === 'rules' && tl === 'rules' && !RULES_MAY_IMPORT_RULES)
      bad.push(`${from} -> ${to}   [rules modules must talk through model]`);
    if (fl === 'view' && tl === 'model') {
      if (/\bwrite\b/.test(clause)) bad.push(`${from} -> ${to}   [view imported a mutator]`);
      if (/^\s*\*\s+as\b/.test(clause)) bad.push(`${from} -> ${to}   [view namespace-imported model]`);
    }
  }
}
// intra-layer cycles: plain DFS over the edge list collected above.
// This is the rule that would have caught scene.js <-> hud.js.
function cycles(edges) {
  const g = new Map(), out = [], seen = new Set();
  for (const [a, b] of edges) (g.get(a) ?? g.set(a, []).get(a)).push(b);
  const walkFrom = (n, stack) => {
    const i = stack.indexOf(n);
    if (i >= 0) return out.push(stack.slice(i).concat(n));
    if (seen.has(n)) return;
    seen.add(n);
    for (const m of g.get(n) ?? []) walkFrom(m, stack.concat(n));
  };
  for (const n of g.keys()) walkFrom(n, []);
  return out;
}
bad.push(...cycles(edges).map(c => `cycle: ${c.join(' -> ')}`));

const BUDGET = Number(process.env.LAYER_BUDGET ?? 0);        // ratchets to 0 during migration
if (bad.length > BUDGET) {
  console.error(`\nlayer violations: ${bad.length} (budget ${BUDGET})`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`  ok   dependency direction clean (${bad.length}/${BUDGET})`);
```

I ran this logic against today's `src/` before writing this RFC: **16
violations**, listed at the top. `LAYER_BUDGET` is the migration device: starts
at 16, only ratchets down, so no step can add an edge.

Two things imports cannot show, each with its own net:

**"`view` never mutates `model`" — dynamic guard.** Every mutator bumps one
counter, asserted unchanged across a render:

```js
// model/epoch.js  ->  bumped by every write.* in model
export const meta = { epoch: 0 };
// tools/check.mjs
const e0 = model.meta.epoch; render();
if (model.meta.epoch !== e0) fail('render() mutated the model');
```

With the existing "rendering consumes no randomness" invariant the renderer
becomes provably swappable: `check` already renders every depth band, and now
proves those renders are side-effect-free.

**String-keyed indirection — resolution pass.** The same tool loads `data/` and
asserts every treatment name, recipe substance, tag, port field and palette key
resolves, so a dangling name fails the build instead of throwing at depth 300.
Non-authoritative second net: an oxlint `no-restricted-imports` block mirroring
`MAY`, purely for editor underlines. If the pinned oxlint lacks that rule nothing
is lost — `tools/layers.mjs` is what CI runs, and a rule nobody checks is a
comment.

## Directory layout

```
src/
  core/    rng.js  math.js  pixels.js  font.js  color.js
  data/    palette.js  substances.js  machines.js  world.js  tuning.js
           beats.js  sfx.js
  model/   world.js  tiles.js  mining.js  items.js  machines.js  fields.js
           space.js  collide.js  run.js  aim.js  journal.js  epoch.js
  rules/   generate.js  player.js  mining.js  items.js  machines.js
           fields.js  place.js  director.js
  view/    paint.js  treatments.js  cache.js  scene.js  overlays.js  hud.js
  shell/   main.js  boot.js  schedule.js  input.js  audio.js
tools/     layers.mjs  check.mjs  serve.mjs  build.mjs
```

## Migration path

Every step ends green and drops `LAYER_BUDGET` a notch. Steps 1–6 are pure moves.

| # | step | LOC touched | budget |
|---|---|---|---|
| 1 | `tools/layers.mjs` + rule table, report mode, wired into `check` | +60 new, 3 | 16 |
| 2 | split `core/palette.js` -> `core/color.js` + `data/palette.js`; merge `MAT`+`KIND` -> `data/substances.js` with re-export shims | ~130 | 16 |
| 3 | `model/world.js` with injected dims; `grid.js` -> `model/tiles.js`; allocate in `newRun()`; add `bedrock`, delete the `-1` sentinel (7 sites) | ~100 | 14 |
| 4 | move progress to `model/mining.js` Float32; `damage()` -> `rules/mining.js` — **granite bug dies** | ~50 | 14 |
| 5 | move `items`, `structures`, `aim`, `surface`, tutorial `progress` into `model`; rewrite imports in `scene.js`/`hud.js`; move `stats` out of `scene.js` — **cycle dies** | ~120 | 4 |
| 6 | `model/journal.js` + `write` namespaces; `rules` stop importing `core/sfx` and each other; `shell/audio.js` drains | ~90 | **0, locked** |
| 7 | `data/machines.js` + `rules/machines.js` interpreter; delete `structures.js`; add crusher + washery rows | +140 / −92 | 0 |
| 8 | fixed timestep in `shell/main.js`; `model/collide.js sweep()` shared by player and items; analytic impact speed — **fall + tunnel bugs die** | ~70 | 0 |
| 9 | `view/treatments.js`, data-driven paint and HUD; baked colour ramp | ~90 | 0 |
| 10 | `model/space.js` + awake/asleep; `model/fields.js` + overlay; repaint budget and LRU in `view/cache.js` | ~150 | 0 |

Steps 1–6 are ~490 LOC of moves with **no player-visible change** — the honest
cost of this paradigm. Baselines fail from step 2 (expected per the brief);
`npm run check` is the gate.

## What this is bad at

**1. It invites anaemic data plus procedural rules — the exact complaint — and my
escape hatch is the weak point.** A generic interpreter over rows is still "logic
separate from the semantic thing coding it". Inline pure functions in the row,
like the furnace's `boost`, buy locality by giving something up: a `data` file
containing functions is no longer serialisable or diffable as content, and is
where logic hides from a checker that only reads imports. Declining classes also
declines the one thing they are good at here — `class Furnace { tick() {} }` puts
a whole furnace in one place with no interpreter to read alongside it. If the
game wants forty inline hooks rather than five, a class-based RFC should win.
Weigh artifact (b) against the class version before believing me.

**2. The ceremony is real and front-loaded.** "No `rules -> rules`" is clean but
pushes transient coupling into `model` as state — `aim`, `progress.dug`,
`journal`, wake queues — so `model/` drifts toward a god-object with nine
`newRun()` reset obligations, a *new* class of determinism bug in a codebase
already bitten by three. One gameplay field can touch four layers where today it
touches one, and steps 1–6 buy the player nothing.

**3. Cross-cutting concerns fight the model, and the hatches are where bugs will
live.** Sound, toasts and the tutorial director are inherently "everything talks
to me". Draining a journal in `shell` means events are seen a frame late,
ordering between consumers is implicit rather than a call stack, and a missed
drain loses feedback silently instead of throwing. `play('pick')` is worse
architecture and better debugging.

**4. The checker sees imports, not behaviour.** It cannot see a typed array
written through a query-returned reference, a `globalThis` leak, or a string key
resolving to the wrong thing, and the epoch guard only covers writes through
`write.*`. Two partial nets where a type system would give one guarantee, and I
cannot have a type system.

**5. Layering fixes none of the performance findings by itself.** The O(n·m)
scan, the unbudgeted repaint and the never-evicting cache are ordinary work in
steps 9–10; layering only makes it obvious *where* it belongs. Do not credit the
paradigm for it.

## Rejected alternatives

- **ECS.** 400 items, one machine type, a tile grid that is not an entity. A
  component store plus scheduler is a second dependency graph for zero call sites
  I lack, and it never answers which direction things may point.
- **A class per machine (`class Crusher extends Machine`).** Appealing —
  behaviour beside the semantic thing — and it fails benchmark 2 outright: a
  washery is a new subclass, i.e. engine code, and multi-input recipes become
  overridden `canRun()` methods hardcoding ingredient names one layer above where
  they sit today.
- **A registry / event bus.** Solves hardcoding, does nothing for direction, and
  destroys the property I am buying: a bus lets any module reach any other and is
  invisible to static checking, so I could not fail the build.
- **Ranking `view` below `rules`.** One linear order, no sibling rule, `scene.js`
  keeps importing `aim`. Rejected because the renderer then stays coupled to
  gameplay, which is how `paint.js:127` happened; the sibling rule is the
  load-bearing half.
- **TypeScript project references, or ESLint `import/no-restricted-paths`.** Both
  express `MAY` more rigorously; TypeScript needs a build step (constraint 2) and
  ESLint is far heavier than sixty lines of Node.
- **Leave it flat and delete the bad edges by hand.** Honest at this size,
  rejected because nothing prevents the next edge: an unenforced convention here
  decayed once already (`input.js` rotted until `check` imported it).
