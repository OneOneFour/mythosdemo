# 02 — Composed objects with behaviour components

## Core model

The game's nouns are objects, and capability comes from *composition*, not
inheritance. A machine is a plain object assembled from small behaviour
components — `Footprint`, `CatchBox`, `Buffer`, `Recipe`, `Burner`, `Emitter` —
each owning its own state and its own `tick`. A machine *type* is neither a
class nor a factory function: it is a table row naming components, and
`assemble()` (~30 lines, written once) turns the row into a live object. Logic
sits next to the data it operates on. The design turns on one boundary: **an
object exists where identity and per-instance behaviour exist.** The ~49,000
tiles and the fluid/heat cells are not objects; they are typed arrays whose
behaviour lives on a shared per-material descriptor composed from the same
aspect vocabulary. Two storage strategies, one explicit seam.

## Representation stance

**HYBRID — composed objects with plain-function behaviour above roughly 10³
instances, data-oriented typed arrays below it. There is no `class` keyword and
no `extends` anywhere in the proposal.**

Components are object literals with a `make(params)` factory returning a
per-host instance. No prototype chain, no `new`, no `super` — `this` is only
ever the component instance. Against the classical-hierarchy RFC the difference
is not cosmetic: an inheritance tree answers "what is this machine?" with one
position in a taxonomy, so every capability a subtype gains, its siblings
inherit or must suppress. Here a machine has *no type identity beyond its parts
list*: `crusher` is not a kind of `Machine`, it is the set `{Footprint, Buffer,
CatchBox, HandFeed, Recipe, Emitter}`. Capabilities intersect freely — a heated
washery is one more row, not a diamond — and no base class's growth is
everyone's problem. The cost: you cannot answer "what can a furnace do?" from
one file.

Functional purity is kept where the constraints demand it. Generation and
rendering are pure over `(world, seed)` and `(g, tile, data)`, read `hash2` not
`rand()`, and no component may draw.

### (a) A substance — `copper`

```js
// data/substances.js
// The only place the word "copper" appears in the codebase. Rock hardness,
// item mass, HUD colour and paint treatments are aspects of ONE row.
import { P } from '../core/palette.js';

export const SUB = {
  copper: {
    name: 'COPPER VEIN', hudOrder: 1,
    forms: ['ore', 'ingot', 'gravel', 'concentrate'],
    tile:  { solid: true, mine: { secs: 0.95, yields: { form: 'ore' } } },
    col:   { a: P.cuA, b: P.cuB, c: P.cuD },          // rock: light / base / dark
    item:  { mass: 1.00, col: P.cuA, col2: P.cuC },   // dropped-item swatch
    paint: [['grain'], ['edges'], ['glint', { col: P.veinA, n: 2 }]]
  },

  timber: {
    name: 'TIMBER', hudOrder: 4, forms: ['log'],
    tile:  { solid: true, mine: { secs: 0.35, yields: { form: 'log' } } },
    col:   { a: P.woodB, b: P.woodC, c: P.woodD },
    item:  { mass: 0.60, col: P.woodA, col2: P.woodC },
    paint: [['grain'], ['edges']]
  }
  // ... soil, grass, lime, granite, ladder, leaves, bedrock, water
};
```

### (b) The furnace

The row *is* the furnace: no `Furnace` class, no `placeFurnace()`, no
`furnace.js`.

```js
// data/machines.js
export const MACHINES = {
  furnace: {
    name: 'CRUDE FURNACE', size: [3, 2], footing: 2, sprite: 'furnace',
    parts: [
      ['Footprint', {}],
      ['Buffer',    { cap: { ore: 4, log: 2 } }],
      ['CatchBox',  { mouth: 'top', accepts: '*' }],
      ['HandFeed',  { pad: 10 }],
      ['Recipe',    { tag: 'smelter' }],
      ['Emitter',   { at: 'top', vy: -70 }]
    ]
  }
};
```

```js
// data/recipes.js — patterns with one binding, $s, over the substance.
// This single row smelts copper, tin and anything else with an `ingot` form.
export const RECIPES = [
  { tag: 'smelter', secs: 4.0,
    in:  [{ form: 'ore', sub: '$s', n: 2 }, { sub: 'timber', n: 1 }],
    out: [{ form: 'ingot', sub: '$s', n: 1 }] },

  { tag: 'crush', secs: 1.6,
    in:  [{ form: 'ore', sub: '$s', n: 1 }],
    out: [{ form: 'gravel', sub: '$s', n: 2 }] },

  { tag: 'wash', secs: 2.4, 
    in:  [{ form: 'gravel', sub: '$s', n: 2 }, { fluid: 'water', n: 1 }],
    out: [{ form: 'concentrate', sub: '$s', n: 1 }] }
];
```

The components it names. Each is ~20-40 lines, written once, and knows no
substance names.

```js
// comp/footprint.js — occupies tiles, validates placement, registers in the index
export const Footprint = {
  id: 'Footprint', provides: ['footprint'],
  make(p, T) { return {
    tw: T.size[0], th: T.size[1], footing: T.footing,
    x: 0, y: 0, w: 0, h: 0,
    link(host, world) {
      this.x = host.tx * TILE;   this.y = host.ty * TILE;
      this.w = this.tw * TILE;   this.h = this.th * TILE;
      world.index.add(host, this.x, this.y, this.w, this.h);
    },
    valid(host, world) {
      for (let j = 0; j < this.th; j++)
        for (let i = 0; i < this.tw; i++)
          if (!world.tiles.isAir(host.tx + i, host.ty + j)) return 'NEEDS CLEAR SPACE';
      let f = 0;
      for (let i = 0; i < this.tw; i++)
        if (world.tiles.isSolid(host.tx + i, host.ty + this.th)) f++;
      return f >= this.footing ? null : 'NEEDS A FLOOR';
    }
  }; }
};
```

```js
// comp/buffer.js — the only place a machine's contents live
import { match } from '../sim/match.js';

export const Buffer = {
  id: 'Buffer', provides: ['buffer'],
  make(p) { return {
    cap: p.cap, slots: [],                       // [{ sub, form, n }]
    capFor(q) { return this.cap[q.form] ?? this.cap['*'] ?? 0; },
    count(q)  { let n = 0; for (const s of this.slots) if (match(q, s)) n += s.n; return n; },
    room(q)   { return this.count({ form: q.form }) < this.capFor(q); },
    put(q, n = 1) {
      const s = this.slots.find(s => s.sub === q.sub && s.form === q.form);
      if (s) s.n += n; else this.slots.push({ sub: q.sub, form: q.form, n });
    },
    take(q, n = 1) {                             // returns the concrete slot, or null
      const s = this.slots.find(s => match(q, s) && s.n >= n);
      if (!s) return null;
      s.n -= n;
      if (s.n === 0) this.slots.splice(this.slots.indexOf(s), 1);
      return s;
    },
    tick(dt, host) { host.look.buffer = this.slots; }   // data; the renderer draws pips
  }; }
};
```

```js
// comp/catchbox.js — "material that falls in is free"
export const CatchBox = {
  id: 'CatchBox', provides: ['catch'], needs: ['buffer', 'footprint'],
  make(p) { return {
    accepts: p.accepts, mouth: p.mouth,
    link(host) { this.buf = host.slots.buffer; this.fp = host.slots.footprint; },
    tick(dt, host, world) {
      const f = this.fp;
      world.index.each(f.x, f.y - 2, f.w, f.h + 2, e => {      // spatial query, not a scan
        if (e.tag !== 'item') return;
        if (!match(this.accepts, e) || !this.buf.room(e)) return;
        this.buf.put(e, 1);
        world.burst(e.x, e.y, 4, SUB[e.sub].item.col);
        world.kill(e);
        host.look.ingest = 0.2;
      });
    }
  }; }
};
```

```js
// comp/handfeed.js — stand adjacent and it draws from your pockets.
// It asks the Recipe what it wants; it names no substance.
export const HandFeed = {
  id: 'HandFeed', needs: ['buffer', 'footprint', 'recipe'],
  make(p) { return {
    pad: p.pad ?? 10,
    link(host) {
      this.buf = host.slots.buffer; this.fp = host.slots.footprint;
      this.rec = host.slots.recipe;
    },
    tick(dt, host, world) {
      const f = this.fp, body = world.player.slots.body, inv = world.player.slots.inventory;
      if (!body.overlaps(f.x - this.pad, f.y - 4, f.w + this.pad * 2, f.h + 12)) return;
      for (const q of this.rec.wants())
        if (this.buf.room(q) && inv.take(q, 1)) this.buf.put(q, 1);
    }
  }; }
};
```

```js
// comp/recipe.js — the only recipe engine. Selects by tag, binds $s, runs the clock.
import { RECIPES } from '../data/recipes.js';
import { bindAll, expand, resolve } from '../sim/match.js';

export const Recipe = {
  id: 'Recipe', provides: ['recipe'], needs: ['buffer', 'heat?', 'fluid?'],
  make(p) { return {
    tag: p.tag, prog: 0, cur: null, bind: null, made: 0,
    link(host) {
      this.buf  = host.slots.buffer;
      this.heat = host.slots.heat  || null;
      this.fl   = host.slots.fluid || null;
      this.emit = host.slots.emit;
      this.pool = RECIPES.filter(r => r.tag === this.tag);
    },
    // concrete inputs this machine would accept next; drives HandFeed and the HUD
    wants() {
      const out = [];
      for (const r of this.pool)
        for (const q of r.in) out.push(...expand(q, this.buf));
      return out;
    },
    tick(dt, host, world) {
      if (!this.cur) {
        for (const r of this.pool) {
          const b = bindAll(r.in, this.buf, this.fl);     // null if inputs absent
          if (b) { this.cur = r; this.bind = b; break; }
        }
        if (!this.cur) { this.prog = 0; host.look.busy = 0; return; }
      }
      if (this.cur.heat && !(this.heat && this.heat.hot())) { host.look.busy = 0; return; }
      this.prog += dt;
      host.look.busy = this.prog / this.cur.secs;
      if (this.prog < this.cur.secs) return;
      for (const q of this.cur.in)  this.buf.take(resolve(q, this.bind), q.n);
      for (const q of this.cur.out) this.emit.push(resolve(q, this.bind));
      this.prog = 0; this.cur = null; this.made++;
    }
  }; }
};
```

```js
// comp/emitter.js — output leaves as a falling item, never as an inventory credit
const MOUTH = {
  top:    f => ({ x: f.x + f.w / 2, y: f.y - 4 }),
  bottom: f => ({ x: f.x + f.w / 2, y: f.y + f.h + 2 }),
  left:   f => ({ x: f.x - 3,       y: f.y + f.h / 2 }),
  right:  f => ({ x: f.x + f.w + 3, y: f.y + f.h / 2 })
};

export const Emitter = {
  id: 'Emitter', provides: ['emit'], needs: ['footprint'],
  make(p) { return {
    at: p.at, vx: p.vx ?? 0, vy: p.vy ?? 0, queue: [],
    link(host) { this.fp = host.slots.footprint; },
    push(q) { this.queue.push(q); },
    tick(dt, host, world) {
      while (this.queue.length) {
        const q = this.queue.shift(), m = MOUTH[this.at](this.fp);
        for (let k = 0; k < q.n; k++)
          world.spawnItem(m.x, m.y, q, this.vx + (rand() - 0.5) * 20, this.vy);
        host.look.emit = 0.25;
      }
    }
  }; }
};
```

```js
// comp/burner.js — fuel separated from reagent. Unused by the furnace (whose
// timber is a reagent); it exists for the kiln, and is the clearest example
// of two components on one host communicating.
export const Burner = {
  id: 'Burner', provides: ['heat'], needs: ['buffer'],
  make(p) { return {
    fuel: p.fuel, span: p.secs, lit: 0,
    link(host) { this.buf = host.slots.buffer; },        // direct reference, resolved once
    tick(dt, host, world) {
      this.lit = Math.max(0, this.lit - dt);
      if (this.lit <= 0 && this.buf.take(this.fuel, 1)) this.lit = this.span;
      host.look.fire = this.lit > 0 ? Math.min(1, this.lit / this.span) : 0;
    },
    hot() { return this.lit > 0; }
  }; }
};
```

```js
// comp/index.js — the registry assemble() resolves names against
export const COMPONENTS = { Footprint, Buffer, CatchBox, HandFeed, Recipe,
                            Emitter, Burner, FluidPort, Body, Pick, Inventory };
```

```js
// sim/assemble.js — engine code, written once, never edited to add a machine
export function assemble(typeId, tx, ty, world) {
  const T = MACHINES[typeId];
  const host = { tag: 'machine', type: typeId, tx, ty, id: world.nextId++,
                 look: {}, slots: {}, parts: [] };
  for (const [name, p] of T.parts) {
    const C = COMPONENTS[name];
    if (!C) throw new Error(typeId + ': unknown component ' + name);
    const c = C.make(p, T);
    for (const s of C.provides || []) host.slots[s] = c;
    host.parts.push([C, c]);
  }
  for (const [C, c] of host.parts)
    for (const s of C.needs || [])
      if (!s.endsWith('?') && !host.slots[s])
        throw new Error(typeId + '.' + C.id + ' needs slot ' + s);
  host.parts.sort(bySlotDependency);            // deterministic tick order
  for (const [, c] of host.parts) c.link && c.link(host, world);
  const bad = host.slots.footprint.valid(host, world);
  if (bad) { toast(bad); return null; }
  world.machines.push(host);
  return host;
}
```

Components communicate through **declared slots resolved at assembly into direct
references** — no per-tick lookup, no event bus. `assemble()` sorts
topologically by slot, so tick order is deterministic (required for seed
reproducibility), and a table typo throws at assembly rather than silently doing
nothing.

### (c) A crusher — 1 ore → 2 gravel

```js
// data/machines.js — added to MACHINES
  crusher: {
    name: 'CRUSHER', size: [2, 2], footing: 2, sprite: 'crusher',
    parts: [
      ['Footprint', {}],
      ['Buffer',    { cap: { ore: 6, gravel: 6 } }],
      ['CatchBox',  { mouth: 'top', accepts: { form: 'ore' } }],
      ['HandFeed',  { pad: 10 }],
      ['Recipe',    { tag: 'crush' }],
      ['Emitter',   { at: 'bottom', vy: 10 }]
    ]
  },
```

Everything the crusher needs beyond that row, plainly: **one `RECIPES` row**
(the `crush` row above) and, if it should not look like a generic box, **one
function in `render/sprites.js`** keyed `crusher`. No engine code, no new
component, no `if` anywhere. The washery is a third row plus
`['FluidPort', { field: 'water', side: 'left', rate: 1.5 }]` — the one genuinely
new component.

## Benchmark

**1. Add a substance — one row.** A substance is an *element*; what you hold is
`substance × form`, and `FORMS` is a five-row table of size, label and mass
multiplier. `tin` gets a vein, ore, ingot, gravel and concentrate from one row,
and the wildcard smelter recipe covers it.

```js
// data/substances.js
  tin: {
    name: 'TIN VEIN', hudOrder: 2,
    forms: ['ore', 'ingot', 'gravel', 'concentrate'],
    tile:  { solid: true, mine: { secs: 0.90, yields: { form: 'ore' } } },
    col:   { a: '#cfd6d8', b: '#a4aeb2', c: '#6e777b' },
    item:  { mass: 1.10, col: '#dfe6e8', col2: '#8b9599' },
    paint: [['grain'], ['edges'], ['glint', { col: '#e8f0f2', n: 2 }]]
  },
```

```js
// data/forms.js — tin edits nothing here
export const FORMS = {
  ore:         { label: '',       size: 4, massK: 1.0, hudOrder: 1 },
  gravel:      { label: 'GRAVEL', size: 3, massK: 0.5, hudOrder: 2 },
  ingot:       { label: 'INGOT',  size: 4, massK: 1.6, shiny: true, hudOrder: 3 },
  concentrate: { label: 'CONC',   size: 3, massK: 0.8, hudOrder: 4 },
  log:         { label: 'TIMBER', size: 4, massK: 1.0, hudOrder: 5 }
};
```

**2. Add machines.** See *Representation stance* (b) and (c) above.

**3. Data-driven painting.** `paint.js:127`'s `if (M.id === 'copper')` is the
`['glint', {...}]` row. The painter has one loop and no material names:

```js
// render/chunks.js — the only tile paint loop
for (const [name, params] of sub.paint)
  TREAT[name](g, px, py, tx, ty, sub.col, params || EMPTY, world);
```

```js
// render/treatments.js — a registry. A new treatment is a new entry.
export const TREAT = {
  grain(g, px, py, tx, ty, C) { /* hash2 speckle, as today */ },
  edges(g, px, py, tx, ty, C, p, world) { /* exposed-face lighting, as today */ },
  glint(g, px, py, tx, ty, C, p) {
    for (let k = 0; k < (p.n || 2); k++) {
      const hx = (hash2(tx + k * 13, ty * 5) * TILE) | 0;
      const hy = (hash2(ty + k * 7,  tx * 3) * TILE) | 0;
      R(g, px + hx, py + hy, 1, 1, p.col);
    }
  },
  glow(g, px, py, tx, ty, C, p) {            // NEW: 4 lines, no paint fn edited
    R(g, px + 2, py + 2, TILE - 4, TILE - 4, p.col);
    world.lights.push({ x: tx * TILE + 4, y: ty * TILE + 4, r: p.r, col: p.col });
  }
};
```

Treatments read `hash2(tx, ty)`, never `rand()`, so rendering consumes no
randomness. Substances name them; only `render/` can call them.

**4. Configurable world.** Module constants become a constructed instance;
`world` is the third `tick` argument, which is why that signature exists:

```js
// world/world.js
export function createWorld(cfg) {
  const w = { cfg,
    tiles:  new TileStore(cfg.tw, cfg.th, cfg.chunk || 16),
    fields: {}, index: new HashGrid(cfg.tw, cfg.th, 4),
    items: [], machines: [], mining: new Map(), lights: [], nextId: 1, acc: 0 };
  for (const k of cfg.fields || []) w.fields[k] = new Field(cfg.tw, cfg.th);
  GENERATORS[cfg.gen](w, cfg.seed);
  return w;
}
// main.js
const band = createWorld({ tw: 128, th: 384, gen: 'tutorialBand',
                           seed: run.seed, fields: ['heat', 'water'] });
```

A deeper band is another `createWorld({ tw: 192, th: 512, gen: 'lava' })`.
Out-of-bounds reads return a real `bedrock` row, deleting the `-1` sentinel and
its seven special-case sites.

**5. Where mining lives.** A `Pick` component on the miner, reading the `mine`
aspect off the material descriptor. Mining is a verb of the agent doing it, not
a property of storage; the material declares only cost and yield. Progress is
**float seconds on the pick**, so the `Uint8Array` truncation behind granite's
4.25s is gone by construction.

```js
// comp/pick.js
tick(dt, host, world) {
  if (!host.cmd.dig) { this.secs = 0; world.mining.delete(host.id); return; }
  const { tx, ty } = aimOf(host, world);
  if (tx !== this.tx || ty !== this.ty) { this.tx = tx; this.ty = ty; this.secs = 0; }
  const sub = world.tiles.subAt(tx, ty), m = sub.tile.mine;
  if (!m) return;
  this.secs += dt * this.power;
  world.mining.set(host.id, { tx, ty, f: this.secs / m.secs });   // renderer reads this
  if (this.secs >= m.secs) {
    world.tiles.set(tx, ty, AIR);
    world.spawnItem(tx * TILE + 4, ty * TILE + 4, yieldOf(m.yields, sub));
    this.secs = 0;
  }
}
```

`world.mining` holds one entry per active miner; the crack overlay reads it.
That also deletes the 49 KB `dmg` array.

**6. Item identity.** One object per item, hot shape created in one place so
the engine keeps a single hidden class:

```js
// { tag:'item', sub, form, n, x, y, vx, vy, rest, age, props }  ~104 B incl. header
export const IDENT = new Map();
export function ident(o) {                      // { purityK, tempC, wear }
  const k = o.purityK + '|' + o.tempC + '|' + o.wear;
  let r = IDENT.get(k); if (!r) IDENT.set(k, r = Object.freeze(o));
  return r;
}
export const massOf = it => SUB[it.sub].item.mass * FORMS[it.form].massK
                          * (it.props ? it.props.purityK : 1);
```

`props` is `null` for the common case; non-default identity is an interned frozen
record shared by every item that agrees, so 300 items of 0.8-pure copper share
one. Adding `fragility` is a field on the record plus a reader; the container
shape never changes. 400 items × ~104 B ≈ 42 KB.

**7. Fluid and heat seam.** `world.fields.heat` / `.water` are `Field` objects:
a `Float32Array` of values, an `Int32Array` ring of active cell indices, a
`Uint8Array` membership mask. `Field.tick` visits only active cells; one whose
delta falls below epsilon deactivates, re-waking neighbours on change, so idle
regions cost zero. It deliberately **does not reuse chunk-dirty**: a chunk
repaint is ~4,300 `fillRect` and a flowing field changes every frame, so fields
draw as a per-frame overlay over the cached blit, bounded by `Field.active`.
Separately the chunk queue gets a per-frame budget and LRU eviction — the
audit's cave-in hitch and 12 MB leak.

**8. HUD inventory.** No substance names in `render/hud.js`:

```js
for (const s of inv.stacks().sort(byHudOrder)) {
  swatch(SUB[s.sub].item.col, FORMS[s.form].shiny);
  num(s.n);
}
```

**9. Entity spatial indexing.** `world.index` is a uniform hash grid on 4-tile
cells. Machines register footprint cells at placement; moving items update on
cell change. `CatchBox` queries a few cells instead of today's 400 × 20 = 8,000
pair checks per frame. Resting items move to a `sleepers` bucket keyed by tile
column, woken only by `tiles.set()` there — the other half of the audit finding.

**10. The three bugs, by construction.**

- **Granite 2.40s** — no per-tile byte exists; see point 5.
- **A 20-tile drop is lethal at any framerate** — `Body` records `fromY` on
  ground-leave and hearts derive from *geometric tiles fallen* against the
  `docs/SPEC.md` table, not a velocity sample. Velocity drives the flash only.
- **No tunnelling** — `Body` is the only code that moves anything and sweeps
  ≤1 px per axis step, under a fixed 1/120 s accumulator, so maximum travel per
  tick is 3.3 px in four steps. Items inherit the player's collision routine
  because they share the component; today they have a worse copy, which is the
  actual cause.

```js
const FIXED = 1 / 120;
export function step(world, dt) {
  world.acc = Math.min(0.25, world.acc + dt);
  while (world.acc >= FIXED) { tickOnce(world, FIXED); world.acc -= FIXED; }
}
```

## Directory layout

```
src/
  core/          canvas, palette, font, rng, sfx        (unchanged)
  data/          substances.js forms.js recipes.js machines.js
  comp/          index.js footprint.js buffer.js catchbox.js handfeed.js
                 recipe.js emitter.js burner.js fluidport.js body.js
                 pick.js inventory.js
  world/         world.js tiles.js field.js hashgrid.js generate.js
  sim/           assemble.js step.js match.js player.js tutorial.js state.js
  render/        scene.js chunks.js treatments.js sprites.js overlays.js hud.js
  main.js
```

## Migration path

Each step lands alone and is checkable by the existing harness.

1. **`createWorld(cfg)`** — grid module state becomes an instance, threaded as a
   parameter. Pure refactor; screenshots bit-identical. *~180 LOC.*
2. **Merge `MAT` + `KIND`** into `substances.js` + `forms.js` behind a
   `MAT`-shaped shim. *~120 LOC.*
3. **Extract `Body`; fixed timestep.** Player and items both host it. Fixes bugs
   2 and 3; both become unit tests. *~200 LOC.*
4. **Extract `Pick`**; delete `grid.damage()` and `dmg`. Fixes bug 1. *~90 LOC.*
5. **`assemble.js` + `match.js` + seven components.** The furnace becomes a row;
   `sim/structures.js` is deleted. Crusher and washery follow. *~260 LOC net.*
6. **Hash grid + sleepers.** *~120 LOC.*
7. **Declarative treatments.** Splits `paint.js` into `chunks.js` +
   `treatments.js`; screenshots move. *~170 LOC.*
8. **`Field` + `FluidPort` + overlay pass + chunk budget/LRU.** *~200 LOC.*

Steps 1–4 preserve behaviour apart from the bug fixes, so the risky work (5, 7)
starts from a codebase whose invariants are already asserted.

## What this is bad at

1. **Deep, generic call chains.** `dt` reaches a `Recipe` through
   `step → tickOnce → host.parts → c.tick`, every frame between nameless
   machinery. Today "why did the furnace stop?" is 92 contiguous lines; after
   this it is a table row, four component files, then the slot graph. Grep gets
   worse. I would ship a debug overlay dumping a host's parts and slots — but
   needing that tool admits the code stopped being self-evident.
2. **The slot mechanism is one requirement from becoming an event bus.**
   `CatchBox` ingesting fuel and `Burner` lighting is already
   component-notifies-component, resolved here by making `Burner` *poll*. That
   works at seven components and feels forced at fourteen. Honest prediction:
   someone adds `host.emit()` within five more machine types, at which point
   this is quietly a worse ECS. The tripwire is a component that needs to
   *observe* rather than *read*.
3. **It does not scale to what a factory game grows into.** A furnace is ~8
   objects and ~8 closures; twenty machines is nothing. Two thousand conveyor
   tiles is 16,000 objects with poor locality, and belts are where this genre
   goes next. They would need a field/array system — a second paradigm alongside
   this one, arriving as a surprise rather than a decision.
4. **The object boundary is asymmetric and will be re-litigated.** Material
   behaviour is a shared descriptor with no per-instance state; machine
   behaviour is per-instance. Two mental models for where logic lives. Every
   feature wanting per-tile state — a wet tile, a growing crystal — arrives as
   pressure to make tiles objects. The right answer is another `Field`, but the
   rule must be re-argued each time.
5. **Keeping draw out of the objects costs something real.** Components write
   declarative `host.look` and never draw, which preserves renderer
   swappability — but the furnace flame is 15 lines of bespoke pixel work that
   does not reduce to data, so `render/sprites.js` keeps a `{ furnace: fn,
   crusher: fn }` map keyed by machine id. Better on the render side than in the
   sim, but "add a machine with no engine code" is strictly true only of its
   *behaviour*.
6. **Components with one consumer.** `FluidPort` and the `heat` slot exist to
   prove the field seam, speculative until the washery lands — hence step 8.
   `Burner` is worse: nothing uses it until a second heat-driven machine exists,
   and it should not ship before one does.
7. **`wants()` is a small inference engine.** Keeping `HandFeed` free of
   hardcoded `'copper'`/`'timber'` costs a recipe-to-candidate expansion that is
   subtle and easy to make quadratic. Not free.

## Rejected alternatives

- **A classical inheritance hierarchy (`Machine → Smelter → Furnace`).** Closest
  to the owner's phrasing, and it fails on machine three: the crusher wants a
  catch box and no heat, the washery a fluid port and no heat, a heated washery
  both branches. Suppressing inherited capability is the smell; composition
  removes the base class that causes it.
- **An object per tile.** 49,152 objects at ~80 B is ~4 MB, and the paint loop
  touches every tile in a chunk, so pointer-chasing lands on the one hot path
  here. Decisively: once mining progress moves to the `Pick`, a tile has no
  per-instance state but its material id — nothing for an object to own.
- **Archetype ECS.** Better above ~10k entities. Here there are ~400 items and
  ~20 machines; the entity/component/system split costs a query layer and a
  storage layer to buy locality a 42 KB array does not need.
- **An event bus from day one.** Direct slot references cost nothing at runtime,
  fail loudly on a typo, and keep tick order deterministic — which a bus does
  not, and determinism is a hard constraint.
- **Scripted machines (behaviour trees, coroutines).** Needs an interpreter and
  per-frame evaluation, and puts logic in strings. A parts list is already a
  declarative program with a native evaluator.
- **A general pattern language for recipes.** One binding, `$s`, no conditions.
  The matcher is ~40 lines and buys "one smelter recipe covers every ore";
  anything richer is a rules engine.
