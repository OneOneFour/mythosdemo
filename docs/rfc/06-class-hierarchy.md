# 06 — Class hierarchies with inheritance and polymorphism

## Core model

The game's nouns are **classes**, related by inheritance, and behaviour is
dispatched by **overriding methods**. The bet is narrower than "use OO": it is
that *declaration* inherits. `static` class fields are inherited through the
prototype chain, so a hierarchy deduplicates metadata as well as code. `Smelter`
declares once what it means to burn fuel — fuel port, burn clock, speed servo,
ignition sound, heat-tinted output — and `Furnace` is then **eight static fields
and no method bodies**. A kiln is another eight. The tax of writing a class is
paid once per *layer*, not once per machine.

Two independent roots, deliberately: `Substance` and `Structure`. No
`GameObject` above them — they share no state and no lifecycle, and a root that
exists to make the diagram symmetrical is a liability. A third small root,
`Body`, covers anything that moves.

The scale boundary is explicit: **class instances exist only for things a player
can point at individually** — ~15 machines, one player, ≤400 items. Everything
counted in thousands (49,152 tiles, fluid cells, chips) is a `Uint8Array` id
indexing a **flyweight**: one frozen `Substance` instance per material, shared
by every tile of it. Virtual dispatch on 12 singletons costs nothing; an object
per tile is indefensible, with numbers below.

```
Substance  (abstract, flyweight: one frozen instance per kind)
├── Air
├── Bedrock                        hard = Infinity — kills the -1 sentinel
├── Climbable                      ladder: !solid, climbable
└── Solid  (abstract)              solid = true, onMined spawns its drop
    ├── Soil        ├── Rock       ├── Timber
    └── Ore  (abstract)            smeltsTo, per-vein purity
        ├── Copper  └── Tin

Structure  (abstract)              footprint, placement rules, ports
├── Fixture                        altar, chest — no tick
├── Conveyance                     chute, lift stage
└── Machine  (abstract)            buffers + the sealed template tick()
    └── Processor                  solids in, solids out — base is sufficient
        ├── Crusher  ├── Washery = FluidConsumer(Processor)
        └── Smelter  (abstract)    fuel, burn clock, hot servo
            ├── Furnace  └── Kiln

Body  (abstract)                   ONE swept integrator, inherited
├── Item                           + Quality ref
└── Actor → Player                 + hearts, fall damage
```

Abstract is enforced, not documented: `if (new.target === Machine) throw`.

## Representation stance

**This design is CLASS-BASED with inheritance.** Content is a subclass whose
body is `static` fields only; engine behaviour lives in the base classes and is
reached by `super`. Substances are frozen flyweight singletons; machines are
per-placement instances.

**(a) One substance.** Copper — the material that today is defined twice
(`MAT` + `KIND`) and special-cased in the renderer at `paint.js:127`.

```js
// content/substances/copper.js
import { Ore } from '../../engine/substance.js';
import { P }   from '../../core/palette.js';

export class Copper extends Ore {
  static id     = 'copper';
  static name   = 'COPPER VEIN';
  static hard   = 0.95;              // seconds of pick time at power 1
  static drop   = 'copper';          // substance id; Registry.link() resolves it
  static yield  = 1;
  static smeltsTo = 'ingot';
  static order  = 10;                // HUD sort key — no names in hud.js
  static look   = {                  // read by render/, never imported by sim/
    use: 'OreLook', a: P.cuA, b: P.cuB, c: P.cuD,
    glint: P.veinA, glints: 2,       // <- paint.js:127, now a declaration
    item: { col: P.cuA, col2: P.cuC, size: 4 }
  };
}
```

**(b) The furnace.** Every behaviour is inherited from `Smelter`.

```js
// content/machines/furnace.js
import { Smelter } from '../../engine/smelter.js';
import { P }       from '../../core/palette.js';

export class Furnace extends Smelter {
  static id        = 'furnace';
  static name      = 'CRUDE FURNACE';
  static footprint = { tw: 3, th: 2 };
  static placement = ['clear', 'floor:2'];        // 2 of 3 columns need footing
  static ports     = [{ side: 'top', dir: 'in' }, { side: 'top', dir: 'out' }];
  static recipe    = { in: { copper: 2 }, out: { ingot: 1 }, secs: 4.0 };
  static fuel      = 'timber';
  static fuelSecs  = 8;
  static caps      = { copper: 4, timber: 2 };    // today's bare 4 and 2, named
  static handFeed  = true;
  static look      = { use: 'FurnaceLook', body: P.irC, fire: P.lavaB };
}
```

**(c) A crusher, 1 ore → 2 gravel.** Twelve lines, zero method bodies.

```js
// content/machines/crusher.js
import { Processor } from '../../engine/machine.js';
import { P }         from '../../core/palette.js';

export class Crusher extends Processor {
  static id        = 'crusher';
  static name      = 'STAMP CRUSHER';
  static footprint = { tw: 2, th: 2 };
  static placement = ['clear', 'floor'];
  static ports     = [{ side: 'top', dir: 'in' }, { side: 'bottom', dir: 'out' }];
  static recipe    = { in: { copper: 1 }, out: { gravel: 2 }, secs: 1.6 };
  static caps      = { copper: 6 };
  static look      = { use: 'StampLook', body: P.irC, hammer: P.irA };
}
```

## Benchmark

### 1. Add a substance — `tin`

One new file, one appended manifest line. **Not one table row, and I will not
pretend otherwise** — accounting at the end of §2.

```js
// content/substances/tin.js
import { Ore } from '../../engine/substance.js';
import { P }   from '../../core/palette.js';

export class Tin extends Ore {
  static id = 'tin';  static name = 'TIN VEIN';  static hard = 0.70;
  static drop = 'tin';  static smeltsTo = 'pewter';  static order = 9;
  static look = { use: 'OreLook', a: P.irA, b: P.irB, c: P.irD,
                  glint: '#e8f0f4', glints: 3,
                  item: { col: P.irA, col2: P.irC, size: 4 } };
}
```

```js
// content/manifest.js          <- the only file engine and content share
export { Tin } from './substances/tin.js';
```

`Registry.link()` assigns byte ids in manifest order, resolves `drop`/`smeltsTo`
strings, freezes every instance, and derives the ingot substance plus its smelt
recipe from `smeltsTo` — so `tin` also gets a `Pewter` item, a HUD slot and a
furnace recipe with no further edits. `tools/check.mjs` `readdir`s `content/`
and fails if a file is missing from the manifest, which is the one thing a
runtime with no build step cannot do for itself.

### 2. Add machines — the sealed template tick

The base guarantees the order of operations, buffer accounting, and that no
randomness is consumed outside the injected rng. Subclasses fill hooks and are
**forbidden from overriding `tick`** — enforced in the constructor.

```js
// engine/machine.js
export class Machine extends Structure {
  static recipe = null;          // { in:{id:n}, out:{id:n}, secs }
  static ports  = [];
  static caps   = {};            // per-input buffer cap; default = 2x need

  #progress = 0;
  buf  = new Counter();          // id -> count; iterable, so the HUD needs no names
  made = 0; heat = 0;

  constructor(world, tx, ty) {
    super(world, tx, ty);
    if (new.target === Machine) throw new TypeError('Machine is abstract');
    if (Object.getOwnPropertyDescriptor(new.target.prototype, 'tick'))
      throw new TypeError(new.target.name + ' must not override tick()');
    world.index.add(this);
  }

  /* ---- the invariant tick. Never overridden. ---- */
  tick(dt) {
    this.intake();                                  // hook
    this.decay(dt);                                 // hook
    if (!this.canStart()) { this.#progress = 0; this.onStall(dt); return; }
    this.#progress += dt * this.speed();            // hook
    const secs = this.constructor.recipe.secs;
    if (this.#progress < secs) return;
    this.#progress -= secs;                         // carry, so dt never rounds off
    for (const [id, n] of Object.entries(this.constructor.recipe.in))
      this.buf.take(id, n);
    this.produce();                                 // hook
    this.made++;
    this.onProduced();                              // hook
  }

  /* ---- default hook bodies. A pure Processor overrides none of them. ---- */
  accepts(id) { return this.constructor.recipe.in[id] !== undefined; }

  intake() {                                        // gravity-fed catch box
    for (const it of this.world.index.itemsIn(this.x, this.y - 2, this.w, this.h + 2)) {
      if (!this.accepts(it.subId)) continue;
      const cap = this.constructor.caps[it.subId]
               ?? (this.constructor.recipe.in[it.subId] ?? 1) * 2;
      if (this.buf.get(it.subId) >= cap) continue;
      this.buf.add(it.subId, 1); this.onSwallow(it); it.destroy();
    }
  }
  decay() {}
  canStart() {
    for (const [id, n] of Object.entries(this.constructor.recipe.in))
      if (this.buf.get(id) < n) return false;
    return true;
  }
  speed() { return 1; }
  produce() {
    const mx = this.x + this.w / 2;
    for (const [id, n] of Object.entries(this.constructor.recipe.out))
      for (let i = 0; i < n; i++)
        this.world.spawnItem(mx, this.y - 4, id, this.qualityOf(id));
  }
  qualityOf() { return Quality.DEFAULT; }
  onSwallow() {} onStall() {} onProduced() {}
  get progress() { return this.#progress / this.constructor.recipe.secs; }
}

export class Processor extends Machine {}    // solids in, solids out
```

**Override 1 — `Smelter`.** Fuel is a whole behaviour, declared once and
inherited by every smelter. This is the layer that makes `Furnace` free.

```js
// engine/smelter.js
export class Smelter extends Processor {
  static fuel     = null;        // substance id
  static fuelSecs = 6;
  static hotBonus = 1.38;        // CLAUDE.md's 38% servo, as a class constant
  fuelLeft = 0;

  accepts(id)  { return super.accepts(id) || id === this.constructor.fuel; }
  decay(dt)    { this.fuelLeft = Math.max(0, this.fuelLeft - dt);
                 this.heat     = Math.max(0, this.heat - dt * 0.7); }
  canStart() {
    if (!super.canStart()) return false;
    if (this.fuelLeft <= 0) {
      if (this.buf.get(this.constructor.fuel) < 1) return false;
      this.buf.take(this.constructor.fuel, 1);
      this.fuelLeft = this.constructor.fuelSecs;
      this.world.emit('ignite', this.x, this.y);
    }
    this.heat = 1;
    return true;
  }
  speed()      { return this.constructor.hotBonus; }
  qualityOf()  { return Quality.of({ temp: 900, purity: this.inPurity() }); }
}
```

**Override 2 — the washery,** which needs a fluid input and therefore does
**not** fit single inheritance. The escape hatch is a subclass factory:

```js
// engine/mixins/fluid.js  — used sparingly, and it is composition in a mask
export const FluidConsumer = Base => class extends Base {
  static fluids = {};                     // { water: { from:'bottom', per:1 } }
  accepts(id) { return super.accepts(id) || this.constructor.fluids[id] !== undefined; }
  intake() {
    super.intake();                                       // solids, unchanged
    for (const [id, spec] of Object.entries(this.constructor.fluids)) {
      const want = spec.per * 2 - this.buf.get(id);
      if (want <= 0) continue;
      const got = this.world.field(id).drain(this.portTiles(spec.from), want);
      if (got > 0) this.buf.add(id, got);
    }
  }
};
```

```js
// content/machines/washery.js
import { Processor }     from '../../engine/machine.js';
import { FluidConsumer } from '../../engine/mixins/fluid.js';

export class Washery extends FluidConsumer(Processor) {
  static id        = 'washery';
  static footprint = { tw: 3, th: 2 };
  static placement = ['clear', 'floor'];
  static recipe    = { in: { gravel: 2, water: 1 }, out: { concentrate: 1 }, secs: 3.0 };
  static fluids    = { water: { from: 'bottom', per: 1 } };
  static look      = { use: 'SluiceLook' };
}
```

**Is a subclass engine code?** *The crusher is not; the washery partly is.*

- The test that matters is not "did you write code" but "did you **edit shared
  code**". A new file plus a one-line manifest append is additive; two authors
  adding two machines touch disjoint files and never merge-conflict, which a
  single shared table cannot claim.
- By that test the crusher passes cleanly — 12 statics, no method bodies,
  nothing in `engine/` changed. So do the furnace, a kiln, a chest, a chute.
- The washery **fails**, structurally rather than accidentally. `FluidConsumer`
  is ~15 lines of engine code that must exist first. I would write it up front
  with the field seam, and it is then reused by the still, cooling tower and
  pump — but at grading time, "no engine code" is not true for the washery.
- The deeper concession: **a class body is a Turing-complete surface and a table
  row is not.** Nothing in the language stops a content author writing an
  imperative `produce()` that reaches into the grid. Data-driven designs are
  *enforceably* declarative; this one is declarative by discipline. I convert
  discipline into checks: an oxlint `no-restricted-imports` rule barring
  `content/` from importing `world/`, `render/` or `sim/`; content receives a
  narrow `WorldFacade` (`spawnItem`/`setTile`/`emit`/`field`) rather than the
  grid; and `npm run check` fails if a `content/` class declares any prototype
  method outside `{ onMined, qualityOf, onProduced }`. A real fence, still a
  fence rather than a wall.

### 3. Data-driven painting — Bridge, not `Material#paint`

The obvious OO move is `Substance#paint(g, …)`, and I reject it: it makes `sim/`
import canvas primitives, so the renderer cannot be swapped and a headless tick
must stub `g`. Instead a **parallel hierarchy** in `render/`, linked by the
substance's declared `static look`. Physics inherits down one tree, appearance
down another, neither importing the other.

```js
// render/looks/ore.js
export class OreLook extends PlainLook {
  tile(g, px, py, tx, ty, dmg) {
    super.tile(g, px, py, tx, ty, dmg);            // base tone, grain, edges, cracks
    for (let k = 0; k < this.glints; k++) {
      const hx = (hash2(tx + k * 13, ty * 5) * TILE) | 0;
      const hy = (hash2(ty + k * 7,  tx * 3) * TILE) | 0;
      R(g, px + hx, py + hy, 1, 1, this.glint);
    }
  }
}
// render/looks/glow.js — a new treatment: one file, one index line
export class GlowLook extends PlainLook {
  tile(g, px, py, tx, ty, d) { super.tile(g, px, py, tx, ty, d);
    glow(g, px + 4, py + 4, this.radius, this.col, 0.5); }
}
// render/looks/index.js
export const LOOKS = { PlainLook, OreLook, GlowLook, GrassLook, LadderLook };
```

At boot, one look per substance: `looks[S.byte] = new LOOKS[S.look.use](S.look)`.
`paintChunk` calls `looks[m].tile(...)` and contains no material name and no
`if`. Making lava glow is `static look = { use:'GlowLook', col:P.lavaA, radius:10 }`
— no paint function edited. `darkAt`'s four hardcoded bands become a `STRATA`
data table, not a class; not everything should be a class.

### 4. Configurable world — instantiability is the cure for module-scope config

```js
// engine/world.js
export class World {
  constructor({ tw, th, tile = 8, chunk = 16, seed }) {
    this.tw = tw; this.th = th; this.tile = tile; this.chunk = chunk;
    this.cw = Math.ceil(tw / chunk); this.ch = Math.ceil(th / chunk);
    this.mat   = new Uint8Array(tw * th);
    this.mine  = new Uint16Array(tw * th);      // MILLISECONDS of pick time
    this.dirty = new RepaintQueue(this.cw * this.ch);
    this.index = new SpatialHash(this, 16);
    this.fields = new Map(); this.rng = mulberry(seed);
  }
  idx(tx, ty) { return ty * this.tw + tx; }
  at(tx, ty)  { return this.inB(tx, ty) ? this.mat[this.idx(tx, ty)] : BEDROCK_ID; }
  sub(tx, ty) { return SUB[this.at(tx, ty)]; }   // flyweight, never null, never -1
}
const band1 = new World({ tw: 128, th: 384, seed });
const band2 = new World({ tw:  96, th: 512, seed: seed ^ 1 });   // the seam
```

`Bedrock` as a real registered flyweight at `hard = Infinity` deletes the `-1`
sentinel and its seven special cases; `sub()` always returns an object with
methods.

### 5. Where mining lives — double dispatch

The **pick** knows how hard it hits; the **material** knows what it becomes.

```js
// sim/tools/pick.js
export class Pick {
  static power = 1; static reach = 3.2;
  strike(world, tx, ty, dt) {
    const s = world.sub(tx, ty), need = s.type.hard * 1000;   // ms, absolute
    if (!(need > 0) || !isFinite(need)) return null;
    const i = world.idx(tx, ty);
    const ms = world.mine[i] + dt * 1000 * this.constructor.power;
    if (ms < need) { world.mine[i] = ms; world.dirty.mark(tx, ty); return null; }
    world.mine[i] = 0; world.set(tx, ty, AIR_ID);
    s.onMined(world.facade, tx, ty, this);      // polymorphic: material decides
    return s;
  }
}
// engine/substance.js
class Solid extends Substance {
  onMined(w, tx, ty) { const T = this.type;
    for (let i = 0; i < T.yield; i++) w.spawnItem(tx, ty, T.drop, this.quality(tx, ty)); }
}
class Ore extends Solid { quality(tx, ty) { return Quality.of({ purity: veinPurity(tx, ty) }); } }
class Timber extends Solid { onMined(w, tx, ty) { super.onMined(w, tx, ty); w.topple(tx, ty - 1); } }
```

`world/grid.js` becomes pure storage — `damage()` leaves it entirely. Defensible
because the two decisions have two different owners and neither is storage.

### 6. Item identity — one class, interned quality

`Item` is a **single class with no subclasses**: item behaviour varies by
*substance*, not per item, so the subclass axis already exists on `Substance`
(Type Object). Identity lives in an **immutable interned value object** — the
flyweight applied a second time.

```js
// engine/quality.js
export class Quality {
  static #pool = new Map();
  constructor(f) {
    this.mass = f.mass ?? 1;  this.purity = f.purity ?? 1;
    this.temp = f.temp ?? 20; this.integrity = f.integrity ?? 1;
    Object.freeze(this);
  }
  static of(f) {
    const t = Math.round((f.temp ?? 20) / 25) * 25;      // quantised, so interning terminates
    const k = `${f.mass ?? 1}|${(f.purity ?? 1).toFixed(2)}|${t}|${f.integrity ?? 1}`;
    let q = Quality.#pool.get(k);
    if (!q) Quality.#pool.set(k, q = new Quality({ ...f, temp: t }));
    return q;
  }
  with(f)         { return Quality.of({ ...this, ...f }); }
  get shatterV()  { return 160 + this.integrity * 240; }
  static DEFAULT = Quality.of({});
}
```

**Memory layout:** a pre-allocated pool of ≤400 `Item` objects, each with the
same eight numeric fields plus `subId` and a `qual` pointer — one monomorphic
hidden class, ~56 B each, ~22 KB total, zero allocation during play. A typical
frame has under ten distinct `Quality` objects alive. Adding `fragility` is one
field and one default in `Quality`; `Item`'s shape never changes.

### 7. Fluid and heat seam — a base with two real subclasses

```js
export class Field {
  constructor(w) { this.cells = new Float32Array(w.tw * w.th); this.active = new Set(); }
  step(dt) { for (const c of this.active) if (!this.sweep(c, dt)) this.active.delete(c); }
  flow()   { throw new Error('abstract'); }          // (hi, lo, upward) -> transfer
}
export class HeatField  extends Field { flow(hi, lo, up) { return (hi - lo) * (up ? 0.6 : 0.25); } }
export class WaterField extends Field { flow(hi, lo, up) { return up ? 0 : (hi - lo) * 0.5 + hi * 0.3; } }
```

Buoyancy and bottom-up flooding are the *same* template with two kernels — two
implementations on day one, not speculative generality. It does **not** reuse
`world.dirty`: field cells change every tick without changing a pixel. `Field`
owns its active set and pokes the repaint queue only when a cell crosses a
visual quantum (`(v * 8) | 0` changes). `RepaintQueue` drains ≤3 chunks/frame,
on-screen first — also the fix for the audit's unbudgeted 66,000-`fillRect`
frame.

### 8. HUD inventory

`run.inv` is an `Inventory` holding `Map<subId, count>`. `pockets()` iterates
`inv.top(4)` (sorted by `Substance.order`) and takes each swatch from
`looks[id].item`. No substance name appears in `render/hud.js`.

### 9. Spatial index

`SpatialHash`, 16-tile buckets. Items register on bucket change; machines
register their footprint's buckets once at placement. Two item lists — `falling`
(integrated) and `resting` (bucketed only, never integrated) — so `intake()`
queries `index.itemsIn(footprint)` and the O(structures × items) rescan of
resting items disappears.

### 10. The three bugs, by construction

- **Granite 2.40s.** The stored quantity is **dimensionful milliseconds**, not a
  fraction of hardness, so hardness cannot divide into the storage quantum.
  `need = 2400` exactly; `Uint16` holds 65.5 s and the registry asserts
  `hard < 60`. Byte truncation has nowhere left to live.
- **20-tile drop lethal at any framerate.** `Body#land()` derives impact
  analytically from distance fallen — `sqrt(2·g·h)` — so the integrator never
  enters the damage formula and `dt` cannot change the answer.
- **No tunnelling.** There is **exactly one integrator**, in `Body`, swept at
  ≤4 px per substep, inherited by both `Item` and `Actor`. Today `items.js` and
  `player.js` each have their own; that divergence *is* the bug, and a shared
  base class makes it unrepresentable.

```js
// engine/body.js
export class Body {
  static MAX_STEP = 4;                                    // px = TILE / 2
  integrate(dt) {
    const d = Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt;
    const n = Math.max(1, Math.ceil(d / Body.MAX_STEP)), h = dt / n;
    for (let k = 0; k < n; k++) {
      this.stepX(this.vx * h);
      if (this.stepY(this.vy * h)) { this.land(); break; }
    }
  }
  land() { this.onLand(Math.sqrt(2 * GRAV * Math.max(0, this.y - this.fellFrom)));
           this.fellFrom = this.y; }
  onLand() {}
}
export class Actor extends Body { onLand(v) { if (v > 160) hurt(fallHearts(v)); } }
export class Item  extends Body { onLand(v) { if (v > this.qual.shatterV) this.shatter(); } }
```

## Directory layout

```
src/
  core/            canvas, palette, font, rng, counter, pool     (unchanged)
  engine/          world.js  registry.js  substance.js  body.js
                   structure.js  machine.js  smelter.js  quality.js
                   field.js  spatialhash.js  repaintqueue.js
                   facade.js       mixins/fluid.js
  content/         manifest.js                <- only file both sides touch
    substances/    air soil grass lime copper tin granite timber ladder gravel
    machines/      furnace crusher washery chute lift
  sim/             simulation.js (tick order)  actors/player.js  tools/pick.js
                   generate.js  tutorial.js
  render/          scene.js  hud.js  paint.js  looks/{plain,ore,glow,grass,...}
  main.js
```

## Migration path

Each step lands on its own, with `npm run check` and the determinism screenshot
between. Steps 1–3 are independent of everything else.

1. **`Substance` hierarchy + registry**, merging `MAT` and `KIND` into one
   authoritative class per material; keep `export const MAT = SUB` as a compat
   alias so nothing else moves yet. Register `Bedrock`, delete the `-1` sentinel
   at seven sites. *~200 new, ~50 touched.*
2. **`Body` base**; move `Item` and `player` onto it. Fixes bugs 2 and 3.
   *~90 new; items.js 90→55, player.js 198→150.*
3. **Millisecond mining + `Pick` + `onMined`.** Fixes bug 1; `damage()` leaves
   `grid.js`. *~70 new, grid.js −22, mining.js −25.*
4. **`World` instance.** Widest blast radius: `WORLD_TW` → `world.tw` across ten
   files. De-risk by shipping `export const world = new World({...})` first so
   call sites migrate lazily. *~160 touched, mechanical.*
5. **`Structure`/`Machine`/`Processor`/`Smelter`**; port the furnace; add the
   crusher. *structures.js 92 → base 130 + furnace 15 + crusher 12.*
6. **`SpatialHash` + `RepaintQueue`.** *~120 new.*
7. **`looks/` Bridge hierarchy.** *paint.js 158 → 85 + looks/ ~140.*
8. **`Quality` interning + `Inventory`**, then `Field`/`HeatField`/`WaterField`
   as a seam with no gameplay attached. *~180 new.*

Nothing here is a stop-the-world rewrite; step 4 touches many files but touches
them shallowly.

## What this is bad at

1. **The diamond arrives on schedule, and I can name the casualties.** Of the
   machines `docs/DESIGN.md` implies, four need two orthogonal capabilities
   single inheritance cannot supply: the **washery** (Processor +
   FluidConsumer), the **still** (FluidConsumer + FluidProducer + Burner), the
   **cooling tower** (FluidConsumer + HeatEmitter, and *no recipe at all*, so it
   inherits `Machine`'s buffer/progress template as dead weight), and the **lift
   stage** (Structure + Burner + Conveyance). The blood winch — a Burner whose
   fuel is a player resource, not an item — fits nowhere. My answer is mixin
   factories, at which point I have components with extra ceremony and worse
   ergonomics than RFC 02 gets directly. The honest version of my case is that
   inheritance wins on the first ten machines and loses on the next ten.
2. **Content can do anything a class can do.** The crusher is a declaration
   because I wrote it that way, not because the language forbids otherwise. The
   decay path is visible in this repo's own history: `structures.js` reached 92
   lines by growing exactly the special cases a subclass body invites.
   `Crusher#produce()` grows one condition, `Washery` copies it, the base gains
   a flag to serve both, and two years on `Machine` is 400 lines of hooks with
   one caller each. Lint and `npm run check` slow that; they do not prevent it.
3. **The base accretes hooks.** `#private` fields correctly stop subclasses
   reaching into base internals — which is precisely why every new variation
   needs a *new named hook on the base*. `intake`, `decay`, `canStart`, `speed`,
   `produce`, `accepts`, `qualityOf`, `onSwallow`, `onStall`, `onProduced`
   already exist, several with one override in sight. That is speculative
   generality arriving by accretion, and the brief marks it against — correctly.
4. **The paradigm covers about a third of the codebase.** Grid, fields, chips
   and the item pool are typed arrays and pooled structs; substances are frozen
   singletons; only ~15 machines and one player are conventional instances. A
   reviewer looking for one uniform mental model will not find it, and "classes
   for kinds, arrays for instances" is a rule the next contributor must be told.
5. **Instance state is a determinism hazard.** Fields are declared in subclass
   bodies, where reset logic cannot see them — exactly the mistake
   `spawnPlayer()` already carries a comment about. Mitigation is construct-only
   (`new Simulation(seed)` discards the whole graph; nothing is ever "reset")
   plus a harness assertion that two `newRun(1337)` hash identically. A
   table-driven design has nowhere to hide state; mine has a place and relies on
   a test to police it.

## Rejected alternatives

- **A `GameObject`/`Thing` root over everything.** Nothing useful to put in it;
  `Substance` and `Structure` share no state and no lifecycle. Rejected as a
  diagram serving itself.
- **`Substance#paint(g, …)`** — the canonical OO move. Rejected on the
  renderer-swap criterion: it drags canvas into `sim/` and forces a headless
  tick to stub a graphics context. Bridge instead, at the cost of two
  hierarchies to keep in step and one extra indirection per tile paint.
- **An object per tile.** 49,152 instances × ~48 B ≈ 2.4 MB plus GC churn plus
  pointer-chasing in every sweep, to gain dispatch on data that is identical for
  every tile of a material. Flyweight singletons give the same polymorphism for
  12 objects.
- **A subclass per item (`CopperOreItem`).** Rejected: variation is by substance,
  not by item, and 400 live instances across 12 subclasses buys nothing over one
  class plus a flyweight pointer. Type Object instead.
- **Mutable per-item property bags.** Rejected: megamorphic shapes, and a
  `{mass, purity, temp}` literal per item at 400 items × 60 fps is 24,000
  allocations/s. Interned immutable `Quality` instead — whose own weak point is
  continuously varying temperature, which is why `temp` is quantised to 25° and
  why a future heat-soaked item may need an opt-out to a copy-on-write instance.
- **Prototype-chain OO (`Object.create` + delegation).** Identical semantics,
  worse tooling, and it forfeits `#private`, `static` inheritance and
  `new.target` — the three features the whole design leans on.
- **`get footprint()` instance getters for machine metadata.** Rejected: the
  placement ghost must know a crusher's footprint *before* a crusher exists.
  Class questions get `static` answers; instance getters are kept only for
  derived per-instance values like `get progress()`.
- **Mixins as the primary mechanism.** That is RFC 02's design and it is a
  coherent one. Here mixins are the escape hatch only, and their presence in my
  own washery is the strongest single argument against my own paradigm.
