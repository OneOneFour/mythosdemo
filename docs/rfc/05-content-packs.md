# 05 — Self-registering content packs over a minimal kernel

## Core model

One hard line. A **kernel** knows tiles, bands, bodies, fields,
machines-in-the-abstract, a tick schedule and integer-pixel drawing. **Content**
knows copper, furnaces, ladders, Zeus and the beat sheet. The kernel publishes
seven registration functions and six service namespaces; a pack is a module
exporting `{ id, requires, register(api) }`, and every named thing arrives through
those seven calls. Content imports the kernel, never the reverse, and one one-line
manifest names the Greek pack — so the target is `rm -rf src/packs/myth` plus that
line. A boon granting "a new production verb" is a pack activated mid-run, which
the design doc already demands.

## Representation stance

**DATA-ORIENTED.** Content is plain object literals passed to registration
functions; instance state is plain records over kernel-owned typed arrays; no
`class`, no `this`, no prototype, no inheritance, in kernel or pack. Functions do
appear in content — a paint rule, a system `tick`, a listener — but as *values
inside data*: a pack never subclasses a `Machine` or overrides a hook. The API
would tolerate a class-based pack; I commit to literals-plus-verbs because a
registration boundary is only worth having if content is *inspectable*, and seal
validates specs, dumps them to a golden file and bakes rule arrays. You cannot
diff a constructor.

All three artifacts, with all ceremony — which is per pack, not per substance:

```js
// src/packs/index.js — the only file in the repo that names Greek content.
import myth from './myth/pack.js';
export const MANIFEST = [myth];          // delete this line and the pack is gone

// src/main.js
import { boot } from './kernel/boot.js';
import { MANIFEST } from './packs/index.js';
boot(MANIFEST);                          // loadPacks -> seal -> newRun
```

```js
// src/packs/myth/pack.js
import substances from './substances.js';
import machines   from './machines.js';
import look       from './look.js';
import bands      from './bands.js';
import systems    from './systems/index.js';

export default {
  id: 'myth',
  requires: [],                          // topologically sorted before register
  register(api) {
    substances(api);                     // must precede machines: recipes
    machines(api);                       //   name substances by id
    look(api);
    bands(api);
    systems(api);
  }
};
```

Order inside `register()` is readability only — it cannot affect ids, tick order
or rng streams — and a mis-ordered pack fails at seal:
`myth:furnace: unknown substance "coper"`.

**(a) Substance — copper**, plus the three the other artifacts name.

```js
// src/packs/myth/substances.js
import { P } from './palette.js';

export const S = {};                     // handles, for hot loops and generation

export default function substances(api) {
  S.copper = api.defineSubstance({
    id: 'copper',
    label: 'COPPER VEIN',
    tags: ['ore', 'pocket', 'smeltable'],
    tile: { solid: true, hard: 0.95, drops: 'copper' },
    item: { size: 4, mass: 1.0, sfx: 'ore' },
    smelt: 'ingot',                                  // read by '@in.smelt'
    look: { base: P.cuB, hi: P.cuA, lo: P.cuD, treat: ['glint'],
            glint: P.veinA }
  });

  S.timber = api.defineSubstance({
    id: 'timber',
    label: 'TIMBER',
    tags: ['fuel', 'pocket'],
    tile: { solid: true, hard: 0.35, drops: 'timber' },
    item: { size: 4, mass: 0.8, sfx: 'breakSoft' },
    look: { base: P.woodC, hi: P.woodB, lo: P.woodD }
  });

  S.ingot = api.defineSubstance({
    id: 'ingot',
    label: 'INGOT',
    tags: ['pocket', 'refined'],
    item: { size: 4, mass: 1.4, sfx: 'ingot' },       // no tile: item-only
    look: { base: P.cuB, hi: P.cuA, lo: P.cuD, treat: ['shine'] }
  });

  S.gravel = api.defineSubstance({
    id: 'gravel',
    label: 'GRAVEL',
    tags: ['ore', 'pocket', 'bulk'],
    item: { size: 3, mass: 0.5, sfx: 'breakSoft' },
    look: { base: P.limeC, hi: P.limeB, lo: P.limeD }
  });
}
```

**(b) The furnace.** All four required behaviours are declarative, because
in-ports have exactly three sources: `bodies`, `inventory`, a named field.

```js
// src/packs/myth/machines.js
export default function machines(api) {
  api.defineMachine({
    id: 'furnace',
    label: 'CRUDE FURNACE',
    size: [3, 2],                                     // tiles
    footing: 2,                                       // needs >= 2 solid below
    ports: {
      in: [
        // The mouth. A catch box one tile above the body, full width: anything
        // falling in is swallowed for free. This is the whole game in a port.
        { at: [0, -1], w: 3, h: 1,
          from: 'bodies',
          accepts: ['copper', 'timber'],
          cap: { copper: 4, timber: 2 } },

        // Hand-feeding. Stand adjacent and it draws from your pockets, capped
        // at the same buffer, at 8 units/s so it looks like feeding not teleport.
        { at: [-2, -1], w: 7, h: 3,
          from: 'inventory', of: 'player', rate: 8,
          accepts: ['copper', 'timber'],
          cap: { copper: 4, timber: 2 } }
      ],
      out: [
        // The ingot pops out of the mouth and falls, like everything else.
        { at: [1, -1], eject: [0, -70], spread: 20 }
      ]
    },
    recipes: [
      { in: { copper: 2, timber: 1 }, out: { ingot: 1 }, secs: 4.0 }
    ],
    look: 'box',                                      // a registered paint rule
    pips: ['copper', 'timber'],                       // in-world buffer readout
    heat: { emit: 40, whileWorking: true }            // ignored until the field lands
  });
```

**(c) The crusher**, over the `#ore` tag, so it takes anything tagged `ore`.

```js
  api.defineMachine({
    id: 'crusher',
    label: 'CRUSHER',
    size: [2, 2],
    footing: 2,
    ports: {
      in:  [{ at: [0, -1], w: 2, h: 1, from: 'bodies',
              accepts: ['#ore'], cap: 4 }],
      out: [{ at: [1, 2], eject: [0, -60], spread: 30 }]   // spits out the bottom
    },
    recipes: [{ in: { '#ore': 1 }, out: { gravel: 2 }, secs: 1.6 }],
    look: 'box',
    pips: ['#ore']
  });
}
```

**What else the crusher touches, plainly:** one substance row for `gravel`, if it
does not exist yet. Nothing else — no kernel file, no paint rule (`look: 'box'` is
already registered), no placement code (the build system iterates
`api.machines.iter('placeable')`), no HUD entry (the inventory row iterates
`pocket`), no sound row. Weakness 1 prices the other side.

## Benchmark

### The kernel API surface — the actual contribution

```js
// kernel/api.js — the entire published surface. A pack receives this object
// as register(api) and imports nothing else from the kernel.
export const api = {
  // ---- registration: 7 hooks. All 7 at boot; the starred 4 also at runtime.
  defineSubstance,   // *(spec) -> handle { id, n, tags, tile, item, look }
  defineMachine,     // *(spec) -> handle
  defineEntityType,  // *(spec) -> handle
  definePaintRule,   // *(id, draw(g, cell))
  defineField,       //  (spec) -> handle { get, add, active }
  defineSystem,      //  (spec) -> void
  defineBand,        //  (spec) -> handle { tw, th, origin }

  // ---- services: touch the live world, register nothing.
  tiles,    // get/set/damage/solidAt/climbAt, by handle or string id
  bodies,   // spawn/kill/near(aabb)/forEach — owns the ONLY integrator
  fields,   // by-id access to registered scalar fields
  inv,      // Uint32Array indexed by substance id, + add/take/count
  events,   // on(name, {order, fn}) over a CLOSED set of 6 kernel events
  draw,     // R, lineTo, noiseFill, walk, glow, text — integer pixels only
  rng,      // a per-system stream, injected. Never a module-global.
  cfg       // frozen: TILE, CHUNK, FIXED_DT, PHASES
};
```

Six closed events, so kernel emissions stay greppable: `tile:broken`,
`tile:placed`, `body:rest`, `machine:input`, `machine:output`, `run:reset`.

**Numeric ids.** The grid stores a byte, so registration must intern names — not
by a counter, which would make bytes load-order-dependent. `air` pins to 0,
`bedrock` to 1, and `seal()` sorts the rest lexicographically into 2..191, so ids
are a pure function of the *set* registered, not the order. 192..255 is a
**dynamic block** assigned in activation order for runtime packs; activation goes
into `run.packLog`, part of the seeded run, so it replays. A save stores
`'copper'`, never a byte.

### 1. Add a substance — one call, no other file edited

```js
// packs/myth/substances.js
S.tin = api.defineSubstance({
  id: 'tin', label: 'TIN VEIN',
  tags: ['ore', 'pocket', 'smeltable'],
  tile: { solid: true, hard: 0.80, drops: 'tin', vein: { from: 60, rarity: 0.4 } },
  item: { size: 4, mass: 0.9, sfx: 'ore' },
  smelt: 'tin_ingot',
  look: { base: P.irC, hi: P.irA, lo: P.irD, treat: ['glint'] }
});
```

No furnace edit, because its recipe is written over tags with one derived output:

```js
recipes: [{ in: { '#smeltable': 2, '#fuel': 1 }, out: { '@in.smelt': 1 }, secs: 4.0 }]
```

`#tag` = any substance carrying that tag; `@in.smelt` reads the `smelt:` field of
what was consumed. Caveat: an ore *and* its ingot is two substances, hence two
rows. Four graded hardcodings die here — `tile` (was `MAT`), `item` (was `KIND`),
`look`, and `item.sfx` for `mining.js:63`.

### 2. Add machines — no engine code

The crusher is above; the washery adds a fluid input.

```js
api.defineMachine({
  id: 'washery', label: 'WASHERY', size: [3, 2], footing: 3,
  ports: { in:  [{ at: [0, -1], w: 3, accepts: ['gravel'], cap: 8 },
                 { at: [0, 0], field: 'water', rate: 1.0, cap: 4 }],
           out: [{ at: [1, 2], eject: [0, -60] }] },
  recipes: [{ in: { gravel: 2, '~water': 1 }, out: { concentrate: 1 }, secs: 3.0 }],
  look: 'box', pips: ['gravel', '~water']
});
```

Three sigils, no more: `#tag`, `~field`, `@derived`. **How the kernel ticks a
machine it has never heard of** — one driver over data:

```js
// kernel/machines.js — the only code that ticks a machine.
export function tickMachines(dt) {
  for (const m of machines) {                     // sealed array, sorted by id
    const spec = specs[m.type];
    for (const p of spec.ports.in) {
      if (p.field) { m.buf[p.field] += fields.drain(m, p, dt); continue; }
      for (const e of bodies.near(m.aabb(p))) {   // bucket query, not a scan
        if (!accepts(p, e.sub) || m.count(e.sub) >= p.cap) continue;
        m.take(e.sub); bodies.kill(e); events.emit('machine:input', m, e.sub);
      }
    }
    const r = select(spec.recipes, m.buf);         // first satisfied recipe
    if (!r) { m.prog = 0; continue; }
    m.prog += dt;                                  // seconds, float, fixed dt
    if (m.prog < r.secs) continue;
    m.prog -= r.secs; consume(m, r);
    for (const [sub, n] of resolve(r.out, m.lastIn))
      for (let i = 0; i < n; i++) bodies.spawn(sub, spec.ports.out[0], m);
    events.emit('machine:output', m, r);
  }
}
```

Anything outside that envelope — a lift stage, the blood winch — registers a
`defineEntityType` with its own tick. Keeping the escape valve outside the spec
stops the spec becoming a language.

### 3. Data-driven painting, pure and randomness-free

```js
// packs/myth/look.js — every visual treatment in the game.
api.definePaintRule('glint', (g, c) => {            // was paint.js:127
  for (let k = 0; k < 2; k++)
    R(g, c.px + (c.hash(k * 13) * 8 | 0), c.py + (c.hash(k * 7 + 1) * 8 | 0),
      1, 1, c.sub.look.glint || P.veinA);
});

api.definePaintRule('glow', (g, c) => {             // a NEW treatment
  R(g, c.px + 2, c.py + 2, 4, 4, c.sub.look.hi);
  c.emitLight(6, c.sub.look.hi);                    // deferred to the scene pass
});
```

"This material glows" is then `treat: ['glint', 'glow']` on one row. Purity is by
*capability*: the cell context offers `c.hash(k)` — positional, stable per tile —
and no rng handle to reach for, and oxlint bans `rand` under `kernel/paint.js`
and `packs/**/look.js`.

### 4. Configurable world

```js
api.defineBand({ id: 'surface', tw: 128, th: 384, origin: 0,   gen: surfaceGen });
api.defineBand({ id: 'abyss',   tw:  96, th: 512, origin: 384, gen: abyssGen });
```

`seal()` allocates `Uint8Array(tw*th)` per band, so world size is injected data.
Reads outside every band return `bedrock`, deleting the `-1` sentinel and its 7
special cases.

### 5. Where mining lives

`packs/myth/systems/pick.js`, a content system: it owns reach, aim, tool power,
chips and sound, and calls `api.tiles.damage(tx, ty, seconds, power)`. The kernel
owns the wound table and emits `tile:broken`; the pack spawns the drop.
Hardness-to-time is world-model arithmetic; what a pick *is* is design. Today's
`damage()` in the storage module is why progress became a byte.

### 6. Item identity

**SoA hot core plus a sparse copy-on-write override map.** `Float32Array
x, y, vx, vy`, `Uint16Array type`, `Uint8Array flags`, by slot, plus a `Uint32`
generation counter for stable handles. Defaults live on the substance row
(`item: { mass, fragility, purity, temp }`); only deviating items get a
`Map<handle, {…}>` entry, so a new property is one field on one row.

### 7. Fluid and heat seam

```js
api.defineField({ id: 'heat',  kind: 'f32', diffuse: 0.14, buoyancy: -0.6 });
api.defineField({ id: 'water', kind: 'f32', diffuse: 0.30, buoyancy:  1.0 });
```

One `Float32Array` per chunk, allocated **lazily**, plus an active-chunk set;
`fields.add()` wakes that chunk and its neighbours, and a chunk sleeps below an
epsilon delta. It reuses the chunk grid but *not* the paint-dirty flag: a rule
declaring `reads: ['heat']` tells the kernel which field writes also dirty
paint.

### 8. HUD from data

`for (const s of api.inv.iter('pocket'))`, drawn with `s.look.hi`; adding tin
makes tin appear. The panel is a pack system in the `hud` phase, because five
hearts and a metre gauge are myth-pack decisions.

### 9. Spatial index

A uniform bucket grid keyed by chunk, in `kernel/bodies.js`. Awake bodies
re-bucket on move; **resting bodies sit in a static bucket, never re-bucketed or
re-scanned**. The driver issues one `bodies.near(portAABB)` per in-port, so the
O(structures x items) rescan is gone structurally — no content code can iterate
the body pool at all.

### 10. The three bugs, fixed by construction

- **Granite 2.40s.** The 8-bit damage array is gone. A `Map<tileIndex, seconds>`
  wound table — single digits of wounded tiles at a time — accumulates float
  seconds, breaking at `acc >= sub.tile.hard`. Same unit in and out.
- **20-tile drop lethal at any framerate.** The kernel is the only integrator, runs
  on a fixed `cfg.FIXED_DT = 1/120` accumulator, and records `body.impactV` from
  the pre-resolution velocity of the colliding substep. The heart table stays
  content, reading a number it cannot get wrong.
- **No tunnelling.** One swept integrator, 1 px max per substep, over *every* body
  including items — which today integrate themselves with a raw `y += vy*dt`.

### Honest score on "delete the pack"

Delete `src/packs/myth/` and its manifest line: the kernel boots, seals two
substances, allocates no band, ticks no systems, renders black plus the debug
overlay. *Working and empty*, not *playable* — the player is content, because a
1x2 hitbox, 60 px/s, five hearts and a ladder verb are all design. Making the
claim true needs `packs/dev/`, ~120 lines: one band, one substance, a free body
with dig and place. A recommendation of this RFC, not a side-effect.

## Directory layout

```
src/
  kernel/
    api.js        the published surface; the only kernel module packs import
    registry.js   define*, seal(), sorted id assignment, validation
    tiles.js      bands, chunks, dirty bits, float wound table
    bodies.js     fixed-step swept integrator + bucket index
    machines.js   the one declarative machine driver
    fields.js     scalar fields, active sets
    schedule.js   phases, systems, per-system rng streams, run reset
    paint.js      chunk painter; dispatches baked per-substance rule lists
    draw.js       R/lineTo/noiseFill/walk/glow + 5x7 font
    boot.js       loadPacks(manifest), loadPackAtRuntime(pack)
  packs/
    index.js      THE MANIFEST — the one file that names the myth pack
    myth/
      pack.js       register(api)
      palette.js    colours are content; the kernel knows no colour names
      substances.js machines.js look.js bands.js
      systems/      pick.js body.js tutorial.js hud.js altar.js
  main.js         boot kernel, load manifest, RAF loop (~40 lines)
```

**The tutorial** becomes `defineSystem({ id: 'myth.tutorial', phase: 'script',
order: 10, state: () => ({ beat: 0, dug: 0, … }), tick })`. Its nine beats stay a
table; it listens on `tile:broken` rather than `mining.js` importing
`notedDig()`; its state comes from a factory, so `run:reset` rebuilds it — killing
the audit's "run schema declared in four disagreeing places". **A boon** is
`loadPackAtRuntime(kiln)`: an id from the dynamic block, no kernel flag.

## Determinism

Five hazards, five answers. (1) Ids sorted at seal, never a counter. (2) Fixed
phases, integer `order`, ties by id string — never registration order. (3) No
global `rand()`: each system's `tick` gets a stream derived
`mulberry(hash(seed, systemId))`, so one pack drawing more numbers cannot shift
another's sequence. (4) Maps are registration-ordered, so registries freeze into
arrays at seal. (5) A harness test boots the manifest shuffled and asserts an
identical 60-second state hash.

## Migration path

Independently shippable; LOC touched estimated.

0. Harness first: state hash + golden registry dump. ~60 new.
1. `kernel/registry.js`, `api.js`, `packs/index.js`; the pack calls
   `defineSubstance` and seal *generates* today's `MAT`/`KIND`, so nothing else
   changes. ~250 new, ~40 touched. Game byte-identical.
2. Tiles into the kernel: bands, `bedrock`, float wound table. Kills the `-1`
   sentinel at 7 sites, fixes granite. ~180.
3. Paint rules; glint/cavity/cracks to `look.js`; repaint budget, LRU. ~200.
4. `kernel/bodies.js`: swept fixed-step integrator + bucket index; items become
   entity types. Fixes tunnelling, fall damage, the O(n·m) scan. ~260.
5. Machine driver; the furnace becomes a declaration. ~150; `structures.js` gone.
6. Schedule + per-system streams; pick, tutorial, HUD become pack systems. ~300.
7. `defineField` + the heat/water seam, registered and unused. ~150 new.
8. `packs/dev/`, the shuffled-manifest test, a CI job deleting the pack. ~140 new.

Steps 1–4 deliver most of the benchmark; 5–8 are where the paradigm earns its
keep.

## What this is bad at

**1. One implementation, and a tax on the commonest edit.** There is one content
pack and no second scheduled. Roughly 900 kernel lines — registry, schedule, id
sealing, sigil resolution, validation — exist only to serve a boundary with one
thing on the far side, and a plain "move it into `src/data/` tables" refactor
passes benchmarks 1–4 for a fraction of that. Content editing is also the *most
common* edit here: today a substance is one row in an array you can see; here it
is a `defineSubstance` call plus a sealing contract, a tag vocabulary and a
manifest — charged on every content change forever, to buy a capability
explicitly out of scope for this milestone. The dev pack and boons are
recommendations, not commitments in the repo. If one pack is all there will ever
be, this design is over-built and should be scored down. The side-by-side
artifacts make the tax visible and I will not argue it away. My only defence is
that scaffolding is per-pack and constant while the wins are per-machine and
linear — an argument that is *false* at one pack and one machine.

**2. Behaviour becomes hard to locate.** `grep -rn copper src/` still works, but
"why did this machine stop" resolves to a generic driver 400 lines from any
mention of a furnace, and a stack trace in `tickMachines` names no machine.
Jump-to-definition dies for anything referenced by string: `look: 'box'`,
`'#smeltable'`, `treat: ['glint']`. The mitigations — pack-attributed seal errors,
a `?packs=1` registration overlay, the golden dump — are each more machinery paid
to undo a legibility loss the architecture caused.

**3. A larger determinism surface, policed by convention.** Four of my five
answers are rules the kernel must *police*, not facts it can *guarantee*. A pack
that captures a registry array during `register`, iterates a `Map` in a tick,
reads `Date.now()`, or registers a substance lazily breaks seeded reproduction
silently, surfacing as a screenshot diff weeks later. A monolith with one call
site cannot do that. The shuffled-manifest test is the only real defence.

**4. Runtime registration creates a persistence obligation.** A save must carry
`run.packLog` and re-seal identically, and pack-version skew against an old save
is a new bug class. Out of scope here, but this design is why it exists.

**5. Declarative machines cost interpretation.** Sigil resolution and recipe
scanning per tick is free at ten machines, probably not at two thousand; the fix
is compiling specs to closures at seal — more machinery, worse traces.

## Rejected alternatives

**Plain data tables in `src/data/`, no registration.** The honest competitor, and
cheaper: benchmarks 1–4 in maybe 300 lines. Rejected for one reason — the
dependency arrow stays backwards. The renderer still imports the substance table,
so content cannot arrive at runtime and a boon becomes an `if` inside the engine.
Registration inverts the arrow; tables cannot.

**Filesystem or `import()`-scanned discovery.** Needs a directory listing or a
build step, breaks the single-file bundle, makes load order filesystem-dependent.
An explicit manifest array is static and diffable. Likewise **ids from a
registration counter**: reordering the manifest would silently change the world
and invalidate saves.

**Predicate paint rules (`when: sub => sub.tile.hard > 1`).** Cannot be baked, so
they run per tile per repaint. Opt-in `treat` strings bake to one array per
substance.

**An ECS with component registration as the primary axis.** Components generalise
*entity shape*; this game's variety is overwhelmingly tiles, recipes and looks.
The SoA body core borrows the storage idea, not the framework.

**A JSON/DSL beat sheet interpreted by the kernel.** The beats' conditions are
arbitrary predicates over game state; a DSL expressive enough is a programming
language with worse errors. Hence a content system in JS.
