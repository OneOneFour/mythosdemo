# 01 — Data-driven registry with pure functions

## Core model

Every noun — substance, recipe, machine, port, field, depth band, paint
treatment, sound — is a **row in a content table**. At boot one pure function
`compile(content)` turns those tables into a frozen `defs`: interned ids,
resolved references, expanded templates, and precomputed per-substance *plans*
(paint plan, drop, sound, recipe index). The bet: **the engine's vocabulary is
fixed and small** — tile, item, machine, port, field, layer — while content is
unbounded, so all growth happens in `content/`, where a mistake is a bad row
rather than a bad abstraction. Inert rows are what make it pay: the compiler
*derives* rows, so one ore row yields its ingot, smelt recipe, crush recipe,
HUD slot and paint plan.

## Representation stance

**DATA-ORIENTED, with functional systems. No classes, no `this`, no `new`.**
Content is inert JSON-shaped rows; behaviour is a closed set of top-level
functions shaped `system(world, defs, dt)`, keyed by a string on a row; mutable
state is plain records in `world`. One deliberate concession: systems mutate
`world` rather than returning a new one, because 60 Hz favours in-place
typed-array updates. "Pure" here means *no hidden state and no state on
the row*, not persistent immutability.

### (a) The `copper` substance

```js
// content/substances.js
{ id:'copper', name:'COPPER VEIN', tags:['ore','metal'],
  ramp:['#e0a066','#c07a40','#5c3416'],       // a / b / c
  glint:'#f0aa5e',                            // consumed by the tag:'ore' paint rule
  tile:{ solid:true, hard:0.95 },             // seconds-to-break at pick power 1
  item:{ size:4, tier:'raw', pin:true,        // pin: always shown in the HUD
         const:{ baseMass:8 },
         var:{ purity:0.40, temp:20, dmg:0 } },
  refine:{ via:'smelt', ratio:2, per:{ timber:1 }, secs:4.0 },
  sfx:{ break:'ore', pickup:'pickup' } }
```

That row replaces `MAT[5]`, `KIND.copper`, `KIND.ingot` (now derived),
`paint.js:127`, the `mining.js:63` sound compare, the `hud.js` pocket entry and
the furnace's recipe literals.

### (b) The furnace

```js
// content/machines.js
{ id:'furnace', name:'CRUDE FURNACE', behaviour:'converter',
  footprint:{ tw:3, th:2 }, occupy:'machine',
  place:{ clear:true, floorTiles:2,
          fail:{ clear:'NEEDS CLEAR SPACE', floorTiles:'THE FURNACE NEEDS A FLOOR' } },
  ports:[
    // face:'top' is the catch box. mouth is inset in tiles from the footprint
    // edge; grab:2 is how many px above the lip still counts as falling in.
    { id:'ore',  face:'top', mouth:{ x0:0, x1:3 }, grab:2,
      accept:{ tag:'ore' },   cap:4, hand:true },   // hand:true -> hand-feedable
    { id:'fuel', face:'top', mouth:{ x0:0, x1:3 }, grab:2,
      accept:{ tag:'fuel' },  cap:2, hand:true },
    { id:'out',  face:'top', eject:{ dx:'mid', dy:-4, vy:-70, spread:20 } }
  ],
  recipes:['smelt_*'],                 // derived per ore from each `refine` facet
  hand:{ reach:{ x:10, yUp:4, yDown:8 } },   // was the `near` box in structures.js
  fx:{ onAccept:'ignite', decay:0.7, idleFire:0.6, burst:{ n:10, col:'#ffd469' } },
  look:'furnace' }                     // key into content/looks.js; sim never reads it
```

The recipe is derived, not authored: `copper.refine` expands to
`{ id:'smelt_copper', in:{ copper:2, timber:1 }, out:{ copper_ingot:1 },
secs:4.0 }`; `timber`'s `tags:['fuel']` binds it to the `fuel` port.

### The one behaviour, in full

The only code (b) and (c) share, and the only code either needs — ~40 lines,
the *entire* machine runtime.

```js
// sim/machines.js
import { itemsNear } from './index.js';
import { makeItem } from './items.js';
import { play } from '../core/sfx.js';

export const BEHAVIOUR = { converter };            // closed map; one entry today

export function stepMachines(world, defs, dt) {
  for (const m of world.machines) BEHAVIOUR[defs.mach[m.def].behaviour](world, defs, m, dt);
}

function converter(world, defs, m, dt) {
  const D = defs.mach[m.def];
  m.fx = Math.max(0, m.fx - dt * D.fx.decay);

  /* --- catch box: every 'top' port with an accept filter swallows fallers --- */
  for (const port of D.inPorts) {
    for (const it of itemsNear(world.index, m.box)) {
      if (!inMouth(m, port, it) || !defs.match(defs.sub[it.sub], port.accept)) continue;
      if ((m.buf[port.id] || 0) >= port.cap) continue;
      m.buf[port.id] = (m.buf[port.id] || 0) + 1;
      m.heldPurity[port.id] = it.purity;             // item identity survives intake
      world.remove(it);
      if (!m.fx) play(D.fx.onAccept, world.t);
      m.fx = 1;
    }
  }

  /* --- hand-feeding: stand adjacent and it draws from your pockets --- */
  if (D.hand && nearPlayer(world, m, D.hand.reach))
    for (const port of D.inPorts) {
      if (!port.hand || (m.buf[port.id] || 0) >= port.cap) continue;
      const id = pickFromInv(world.run.inv, defs, port.accept);   // first matching stack
      if (id && world.spend(id, 1)) m.buf[port.id] = (m.buf[port.id] || 0) + 1;
    }

  /* --- run the first satisfiable recipe --- */
  const r = D.recipeRows.find(r => canRun(defs, D, m, r));
  if (!r) { m.prog = 0; return; }
  m.prog += dt;
  m.fx = Math.max(m.fx, D.fx.idleFire);
  if (m.prog < r.secs) return;
  m.prog = 0;
  for (const [sub, n] of r.inPairs) m.buf[D.portFor[sub]] -= n;
  for (const [sub, n] of r.outPairs)
    for (let k = 0; k < n; k++) emit(world, defs, m, D.outPort, sub);
  m.made++;
}
```

`canRun`, `inMouth`, `nearPlayer`, `pickFromInv` and `emit` are ~30 further
lines of arithmetic with no substance names. Placement is one generic
`placeMachine(world, defs, defId, tx, ty)` driven by `D.place`.

### (c) The crusher — declaration only

```js
// content/machines.js — append one row
{ id:'crusher', name:'CRUSHER', behaviour:'converter',
  footprint:{ tw:2, th:2 }, occupy:'machine',
  place:{ clear:true, floorTiles:2 },
  ports:[ { id:'in',  face:'top', mouth:{ x0:0, x1:2 }, grab:2,
            accept:{ tag:'ore' }, cap:6, hand:true },
          { id:'out', face:'bottom', eject:{ dx:'mid', dy:2, vy:-40, spread:24 } } ],
  recipes:['crush_*'],
  fx:{ onAccept:'breakHard', decay:1.4, idleFire:0, burst:{ n:4, col:'#c5beaa' } },
  look:'crusher' }
```

```js
// content/recipes.js — one template row, already present, covers every ore
tmpl({ id:'crush_$ore', over:{ $ore:'tag:ore' }, in:{ $ore:1 },
       out:{ gravel:2 }, secs:1.6 })
```

**What else must be touched, plainly:** `gravel` needs a substance row, and
`content/looks.js` needs a `crusher` entry *only if* you want something other
than the default machine body — the generic `R(body); R(lip); pips-per-buffer`
draw already works from `footprint` and `ports`. Nothing in `defs/`, `sim/`,
`world/`, `render/` changes. Total: **two content rows, zero engine lines.**

## Benchmark

### 1. Add a substance

`MAT` and `KIND` merge. A row has **facets** — `tile`, `item`, `refine` (the
`DESIGN.md` compression tiers); an absent facet means that form does not exist.

```js
// content/substances.js — the ONLY edit to add tin
{ id:'tin', name:'TIN VEIN', tags:['ore','metal'],
  ramp:['#c9cdd2','#9aa1a8','#6c7278'],        // a / b / c, as MAT has today
  tile:{ solid:true, hard:1.10 },              // seconds-to-break, float
  item:{ size:4, tier:'raw', const:{ baseMass:7 },
         var:{ purity:0.35, temp:20, dmg:0 } },
  refine:{ via:'smelt', ratio:4, per:{ timber:1 }, secs:4.5 } }
```

Derived from that row alone:

- `tile.breaksTo` defaults to `self` when an `item` facet exists, so mining tin
  drops tin. No `drop:` column, no `KIND` row.
- `refine` + the `tiers` table (`raw 1:1, ingot 4:1, plate 12:1, essence 60:1`)
  emits a **derived substance** `tin_ingot` from the `ingot` archetype, and a
  **derived recipe** `smelt_tin`.
- `tags:['ore']` matches the crush template (§2) and ore-glint paint rule (§3);
  `item.tier` places it in the HUD order (§8); `sfx` defaults by hardness band,
  deleting `mining.js:63`'s hardcoded threshold.

### 2. Add machines

The crusher is in **stance (c)**. The washery is the interesting half, needing
a fluid input:

```js
// content/machines.js
{ id:'washery', name:'WASHERY', behaviour:'converter',
  footprint:{ tw:3, th:2 }, occupy:'machine',
  place:{ clear:true, floorTiles:2 },
  ports:[ { id:'ore', face:'top',    accept:{ id:'gravel' }, cap:8 },
          { id:'wet', face:'side',   accept:{ field:'water' }, cap:2.0 },
          { id:'out', face:'bottom', eject:{ vy:-30 } } ],
  recipes:['wash'] }
```

```js
// content/recipes.js
{ id:'wash', in:{ gravel:2 }, use:{ water:0.5 }, out:{ concentrate:1 }, secs:3.0 }
```

`accept:{ field:'water' }` is the only new *engine* concept either machine
needs: one branch in `converter`, reading a port's level from `m.buf` or from
`fieldAt` (§7). `behaviour` is a key into a **closed map** whose single entry,
`converter`, covers furnace, crusher, washery and altar sink (`out:{}`); the
second, `pump`, lands with fields, which is why the map is not speculative. A
behaviour is added only when a machine *cannot* be expressed as ports + recipe.

### 3. Data-driven painting

`paint.js` keeps ~7 **primitives** (`fill`, `grain`, `speck`, `edge`, `fringe`,
`cracks`, `glow`) and loses every decision. Rules are data, matched by a
four-clause grammar — `id`, `tag`, `facet`, `depth`:

```js
// content/paint.js
{ when:{ solid:true }, layer:'fill',  col:'ramp.b' },
{ when:{ solid:true }, layer:'grain', lo:0.16, hi:0.90, colLo:'ramp.c', colHi:'ramp.a' },
{ when:{ solid:true }, layer:'edge',  faces:'exposed' },
{ when:{ tag:'ore' },  layer:'speck', n:2, col:'ramp.glint' },   // ← was `if (M.id==='copper')`
{ when:{ facet:'glow' }, layer:'glow', r:'glow.r', col:'glow.col', a:0.35 }
```

Matching happens **once, at compile**: `compile()` walks substances × rules and
bakes an ordered array of closures, colours already resolved.

```js
defs.plan[S.copper] === [ fill('#c07a40'), grain(...), edge(...), speck(2,'#f0aa5e') ]
// paint.js hot loop, in full:
for (const f of defs.plan[m]) f(g, px, py, tx, ty);
```

Every colour in a plan is a boot-time literal, which also kills the audit's
`mix()`-per-`fillRect` finding. Adding "this material glows" is one field on the
row (`glow:{ r:10, col:'#ffd97a' }`); the rule already exists. `darkAt()`'s four
hardcoded bands become `voidCol` on band rows.

### 4. Configurable world

```js
// content/bands.js
export const BANDS = [
  { id:'tutorial', tw:128, th:384, tile:8, chunk:16, gen:'surface',
    voidCol:'#2b1e12', strata:[{to:'+7',sub:'soil'},{to:120,sub:'lime'},{to:'end',sub:'granite'}] },
  { id:'abyss', tw:192, th:640, tile:8, chunk:16, gen:'caverns', voidCol:'#1a1520', strata:[/*…*/] }
];
// world/grid.js — allocation moves from module scope into a function
export function makeGrid({ tw, th, tile, chunk }) {
  const cx = Math.ceil(tw/chunk), cy = Math.ceil(th/chunk);
  return { tw, th, tile, chunk, cx, cy, w:tw*tile, h:th*tile,
           mat:new Uint8Array(tw*th), dirty:new Uint8Array(cx*cy) };
}
// sim/state.js
export const world = { grid:null, band:null, machines:[], items:[], index:null, fields:{} };
```

Every accessor takes the grid: `tileAt(g,tx,ty)`. Out of bounds returns
`S.bedrock`, a real row, so the `-1` sentinel and its seven special cases die
with it.

### 5. Where mining lives

`sim/mine.js`, calling `rules/dig.js`. Grid is storage (`get`/`set`/`dirty`);
mining is a verb an actor applies, so it belongs to sim, and the drop is a
registry lookup, not a branch. **Dig progress is session state, not tile
state**: `world.dig = Map<tileIdx, floatSeconds>`, cleared on tile change —
which is what fixes bug 10a.

### 6. Item identity

Array-of-structs, one plain object per item, **key order fixed by the compiled
row** so V8 keeps a single hidden class:

```js
export const makeItem = (defs, sub, x, y, vx, vy) =>
  ({ x, y, vx, vy, sub, rest:0, age:0, ...defs.sub[sub].item.var });
```

`item.const` (`size`, `baseMass`, `tier`) is read through `defs`, never copied;
`item.var` (`purity`, `temp`, `dmg`, later `fragility`) is spread per instance
with row defaults. Adding a property is **one field on a substance row and zero
engine edits** — nothing enumerates the identity fields. Layout: AoS, ~13 slots
× ≤400 items; escape hatch is SoA columns above ~2,000.

### 7. Field seam

```js
// content/fields.js   (ships EMPTY; the seam costs nothing when unused)
{ id:'water', solver:'cellular',  flow:'down', maxPerTile:1.0, viscosity:0.28 },
{ id:'heat',  solver:'diffusive', flow:'up',   diffuse:0.22, decay:0.02 }
// sim/fields.js
export function stepFields(world, defs, dt) {
  for (const f of defs.fields) {
    const st = world.fields[f.id];
    if (!st.active.size) continue;                    // idle regions cost zero
    SOLVER[f.solver](world, f, st, dt);               // two solvers, closed set
  }
}
```
Each field owns `{ v:Float32Array, active:Set<idx>, chunkActive:Uint16Array }`.
Fields **do not reuse `grid.dirty`** (geometry repaints now, a field at a
throttled cadence); they mark `field.dirty` and feed a **new repaint queue** —
LRU, per-frame chunk budget — which also fixes the audit's unbudgeted repaint
and never-evicting cache.

### 8. HUD inventory

`defs.hudOrder`, computed at compile: substances with an `item` facet, sorted by
`tier` then id, `pin:true` shown at zero. `hud.js` iterates it. Zero substance
names in `render/`.

### 9. Spatial index

A uniform bucket grid reusing `chunk = 16`: `index.bucket[c] = [items]`.
Machines insert port AABBs at placement and never move; resting items are
inserted once and removed only on state change, killing the audit's rescan.
Item→machine becomes one bucket lookup and ≤4 AABB tests per *moving* item.

### 10. The three bugs

- **Granite 2.40s.** Progress is float seconds in a `Map`, compared against
  `hard` in seconds: no byte to truncate, no `×255`, and `grid.dmg` is deleted
  so the artifact cannot return. `rules/dig.js` gets a node test against the
  SPEC table.
- **20-tile drop is lethal at any framerate.** `rules/fall.js` derives hearts
  from *fall height*, not sampled velocity:
  `hearts(h) = floor((sqrt(2*GRAV*h) − 160)/32)`. Height is exact position
  data, so dt-independence is algebraic, not lucky.
- **No tunnelling.** One `sweep(box, dx, dy, solidFn)` in `sim/sweep.js`, used
  by player, items and any future entity: three callers, one implementation, no
  second integrator to get wrong. `check.mjs` asserts all 8 sub-pixel offsets.

## Directory layout

```
src/
  content/   substances.js tiers.js recipes.js machines.js fields.js
             paint.js bands.js sounds.js runschema.js      ← all data, imports nothing
  defs/      compile.js  match.js  validate.js             ← content -> frozen defs
  core/      canvas.js palette.js font.js rng.js sfx.js    ← unchanged
  rules/     dig.js fall.js recipe.js                      ← pure, DOM-free, unit-tested
  world/     grid.js generate.js paint.js
  sim/       state.js sweep.js index.js player.js mine.js
             items.js machines.js fields.js tutorial.js
  render/    scene.js entities.js hud.js
  main.js input.js
```

Dependency rule, lintable by grep: `content/` imports nothing, `rules/` imports
only `core/`, `sim/` never imports `render/`.

## Migration path

Each step ends green on `npm run check`; nothing is stop-the-world.

1. **`defs/compile.js` + `content/substances.js`.** Merge `MAT`/`KIND`, keeping
   `export const MAT = defs.tileTable` as a shim. ~200 new, ~30 touched.
2. **Grid injection.** `makeGrid(cfg)`, `world.grid`, accessors take `g`,
   `bedrock` replaces `-1`. ~110 rewritten.
3. **Mining moves.** `damage()` → `sim/mine.js`, float `Map` progress, delete
   `grid.dmg`. ~60 LOC. *Bug 10a closed.*
4. **`rules/fall.js` + `sim/sweep.js`.** ~70 LOC. *Bugs 10b, 10c closed.*
5. **Paint plans.** Primitives, compiler, `content/paint.js`; delete the copper
   branch and `darkAt`. ~200 LOC.
6. **Machines + spatial index.** Furnace becomes a row; structures.js 92 → ~70
   generic. ~250 LOC.
7. **HUD order + run schema.** `newRun()` becomes `resetTo(run, RUN_SCHEMA)`,
   which structurally forbids a field surviving a restart (constraint 6) and
   collapses the four disagreeing `run` declarations. ~50 LOC.
8. **Field seam**, `FIELDS = []`. ~120 LOC, inert until a row is added.

~750 new lines, ~350 rewritten, against 1,889 existing.

## What this is bad at

1. **The compiler becomes the second-hardest file in the repo, and it is not
   content.** Derived rows, templates and plan baking mean a malformed row
   surfaces inside `compile.js`, far from the edit — the classic data-driven
   failure mode. Mitigation is real work I am costing in: `defs/validate.js`
   with per-row messages plus `--dump-defs` on `check.mjs`, ~320 LOC existing
   purely to make data safe. On a 1,889-line game, a visible tax.
2. **"Just add a row" holds maybe 60% of the time.** Of the additions
   foreseeable from `FUTURE_IDEAS.md` and `DESIGN.md`, seven are pure data.
   Five are not: fluid ports need `pump`; fragile cargo needs a landing rule
   *and* a cushioned-descent verb; monster aggro needs an emitter; miracles
   need terrain-edit primitives — each adding a registry column too. The engine
   does not stop learning nouns; it learns them rarely.
3. **Control flow is no longer readable in one place.** Today you grep
   `furnace` and read 92 lines that tell you everything. After this it is a row,
   a behaviour shared with three machines, a port grammar and a recipe index,
   and understanding one machine means inspecting compiled state at runtime. A
   real regression for a newcomer, tolerable only if the dev overlay gets built.
4. **The predicate grammar is an inner platform in embryo.** `{tag:'ore'}` is
   fine; the pressure to add `{or:[…]}`, then ranges, then arithmetic is real,
   and the end state is a bad query language. Policy: four clause kinds; a fifth
   needs two independent callers. It will be tested within a month.
5. **The identity/presentation split is a judgement call, not a clean seam.**
   `ramp`, `glint` and `name` sit in the substance row (identity) with
   treatments in `content/paint.js` (presentation), because benchmark 1 forbids
   a second file edit. A purist would say a ramp is appearance and I have
   leaked it. I accept the leak knowingly: two fields, and `sim/` never reads
   them. Relatedly, compiling at boot bakes colours and plans, so without a
   `?recompile` hook, rebalancing gets slower than today.

## Rejected alternatives

- **ECS with component storage.** Its win is heterogeneous entity composition;
  this game has two entity kinds, ≤400 instances, and a tile grid that already
  indexes the world. Archetypes would be exactly the speculative generality
  marked against.
- **Classes with inheritance** (`Furnace extends Machine`). Every machine
  becomes a file, the recipe graph fragments across subclasses, and content
  stops being inspectable or serialisable data.
- **Inline `tick(m, dt)` closures on machine rows.** Shorter than a behaviour
  map, but rows become un-validatable and `content/` gains engine code. Named
  keys into a closed map instead, so behaviours are countable by grep.
- **Event bus between systems.** Implicit ordering threatens
  bit-reproducibility (constraint 5) and maximises weakness 3. Systems run in a
  fixed order in `main.js`.
- **Appearance columns inside the substance row.** Treatments key on *facets*
  (`tag:'ore'`), not ids, so appearance has a different cardinality to physics;
  and the headless harness can run with `defs.plan` absent, making the seam
  testable rather than claimed.
- **Machines as pure tiles.** Tempting for free indexing and destructibility,
  but a `Uint8` tile cannot hold buffers and progress. Adopted *partially* as
  occupancy stamping, taking the collision and repaint wins without the state
  problem.

