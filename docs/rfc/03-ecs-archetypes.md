# 03 — ECS-lite with archetypes and parallel typed arrays

## Core model

Two stores and a rule for which store a thing goes in. **The tile field** is a
*field*: dense, positionally addressed, uniform — all 49,152 cells have
identical properties, and a cell has no identity that survives its coordinates.
**The ECS** is a *sparse heterogeneous set*: entities are integer handles
indexing parallel typed arrays, components *are* those arrays, systems are plain
functions over an entity mask. The boundary rule, stated once so it stays
adjudicable: **a thing is an entity iff it carries identity that outlives its
position.** Granite at (12,40) is fully described by
coordinate plus field values; break it and it does not move, it ceases. An
item, a pocketed stack, a machine, a mining action, a monster each persists
while its position changes, and each carries a *different* property set from its
neighbours. That difference is the point: the ECS exists so the property set can
vary per entity without any container, serialiser, reset path or renderer
knowing which properties exist.

### The engine

```js
// src/ecs/ecs.js — the whole engine
export const MAX_ENT = 4096;
const REG = [];                                   // component descriptors, bit order

export function component(name, Kind = Float32Array, width = 1, def = 0) {
  if (REG.length >= 31) throw new Error('component budget exhausted');
  const c = { name, bit: 1 << REG.length, width, def, Kind,
              data: new Kind(MAX_ENT * width) };
  REG.push(c); return c;
}
export const registry = () => REG;
export const maskOf   = (...cs) => cs.reduce((a, c) => a | c.bit, 0);

export const world = { mask: new Uint32Array(MAX_ENT), gen: new Uint16Array(MAX_ENT),
                       top: 0, free: [], count: 0, field: null };

/* A recycled index carries stale values — the classic free-list bug. spawn()
   and add() both write declared defaults, so it cannot happen. */
function clearSlot(i, c) {
  const b = i * c.width;
  for (let k = 0; k < c.width; k++) c.data[b + k] = c.def;
}
export function spawn(bits) {
  const i = world.free.length ? world.free.pop() : world.top++;
  for (const c of REG) if (bits & c.bit) clearSlot(i, c);
  world.mask[i] = bits; world.count++;
  return i | (world.gen[i] << 20);                // handle = index | generation<<20
}
export const ix       = h => h & 0xFFFFF;
export const handleOf = i => i | (world.gen[i] << 20);
export const alive    = h => world.gen[ix(h)] === (h >>> 20) && world.mask[ix(h)] !== 0;

export function kill(h) {
  const i = ix(h); if (!world.mask[i]) return;
  world.mask[i] = 0; world.gen[i] = (world.gen[i] + 1) & 0xFFF;
  world.free.push(i); world.count--;
}
export function add(i, c) { world.mask[i] |= c.bit; clearSlot(i, c); }
export const has = (i, c) => (world.mask[i] & c.bit) !== 0;

/* Queries iterate ASCENDING INDEX, always: any system calling rand() depends
   on that for determinism. */
export function each(q, fn) {
  const m = world.mask;
  for (let i = 0; i < world.top; i++) if ((m[i] & q) === q) fn(i);
}
```

"Archetype" here means **a named mask that doubles as a spawn template**, not
archetype-chunked storage (rejected below).

```js
// src/ecs/components.js — adding a property is adding a line
export const Pos     = component('Pos',     Float64Array, 2);   // x,y — integrated
export const Vel     = component('Vel',     Float32Array, 2);
export const Body    = component('Body',    Float32Array, 2);   // w,h
export const Sub     = component('Sub',     Uint16Array);       // index into SUB[]
export const Stack   = component('Stack',   Uint16Array, 1, 1);
export const Mass    = component('Mass',    Float32Array, 1, 1);
export const Purity  = component('Purity',  Float32Array, 1, 1);
export const Frag    = component('Frag',    Float32Array);
export const Temp    = component('Temp',    Float32Array, 1, 20);
export const Asleep  = component('Asleep',  Uint8Array);        // skip integrate
export const Carried = component('Carried', Uint8Array);        // in pockets, no Pos
export const Next    = component('Next',    Int32Array);        // spatial bucket link
export const Foot    = component('Foot',    Uint16Array, 4);    // tx,ty,tw,th
export const Kind    = component('Kind',    Uint16Array);       // index into TYPES[]
export const Prog    = component('Prog',    Float32Array, 2);   // secs, fire
export const Buf     = component('Buf',     Uint16Array, 8);    // 4 x (sub, count)
export const DigAt   = component('DigAt',   Int32Array);        // tile index
export const DigSec  = component('DigSec',  Float32Array);      // SECONDS, not a byte
export const Fall    = component('Fall',    Float64Array);      // y left the ground

// src/ecs/archetypes.js
export const ITEM    = maskOf(Pos, Vel, Body, Sub, Stack, Mass, Purity, Frag, Temp);
export const MACHINE = maskOf(Pos, Foot, Kind, Buf, Prog);
export const DIG     = maskOf(DigAt, DigSec);
export const Q_FALL  = maskOf(Pos, Vel, Body, Fall);   // player, items, monsters
```

## The premature-ECS objection

The prior research pass is right on the facts: the hot data is already
structure-of-arrays and not entity-shaped, the entity-shaped things number in
the low hundreds, and ECS throughput wins appear three orders of magnitude
higher. **This RFC makes no performance claim.** Grading on speed, reject it.

The claim is *schema uniformity*, and it is falsifiable — name a feature, count
the engine nouns it adds. Load-bearing fall damage: sum `Mass` over `Carried`;
one query, no new noun. Fragile cargo: one array, and every falling thing
inherits the threshold at once because there is one integrator. Monsters:
`Pos|Vel|Body|Health|Appetite`, and they fall, collide, take fall damage and get
swallowed by furnace mouths for free. Compare `structures.js:52`, which *must*
name `'copper'` and `'timber'`: a container whose shape does not admit unknown
substances cannot be written generically. All 13 hardcoded references are that
failure.

## Representation stance

**DATA-ORIENTED.** Zero classes, zero methods, zero `this`. But it splits
across two axes here, and the split is what to understand before choosing it:

- **Authored content is plain readable data tables** — nested objects, rows you
  read top to bottom, the grain `CLAUDE.md` asks for.
- **Runtime state is indexed parallel typed arrays.** `Pos.data[e * 2]` where
  the code today says `it.x`. The honest cost, and not small: every sim line
  gets noisier, an entity has no printable form, and a reader must know
  `Buf.data[e*8 + s*2]` is a slot's substance. It buys
  property-set-varies-per-entity and, at this scale, nothing else.
- **Behaviour is functional** — transforms over arrays; no inheritance, no
  polymorphism, no dispatch. Machine behaviour is table lookup, not a subclass.

Class-based nowhere. If the owner wants runtime state to read like the tables
do, this paradigm is wrong and RFC 03 should lose on that basis alone.

## Three artifacts, complete

### (a) The substance table, and `copper`

`MAT` (`world/tiles.js`) and `KIND` (`sim/items.js`) merge into one row per
substance — the only place a substance is defined.

```js
// src/data/substances.js
import { P } from '../core/palette.js';

export const SUBSTANCES = {
  air:     { name:'AIR',     solid:false, hard:0 },
  bedrock: { name:'BEDROCK', solid:true,  hard:0,               // world boundary
             tint:['#000000','#000000','#000000'], paint:['flat'] },

  timber:  { name:'TIMBER',  itemName:'TIMBER', solid:true, hard:0.35, drop:'timber',
             tint:[P.woodB, P.woodC, P.woodD], paint:['grain','edges','cracks'],
             item:{ size:4, mass:0.6, purity:1, fragility:0, temp:20 },
             fuel:{ heat:40, secs:6 } },

  copper: {
    name:     'COPPER VEIN',          // as rock, in the HUD's tile readout
    itemName: 'COPPER',               // as an item, in pockets
    solid:    true,
    hard:     0.95,                   // SECONDS to break at pick power 1
    drop:     'copper',
    tint:     [P.cuA, P.cuB, P.cuD, P.veinA],   // [lit, base, shadow, accent]
    paint:    ['grain', 'edges', 'glint', 'cracks'],
    item:     { size:4, mass:1.0, purity:0.4, fragility:0, temp:20 },
    vein:     { fromTy:34, toTy:384, count:90, r:[1.6, 3.8], rich:0.6 },
    sfx:      { hit:'pick', break:'ore', pickup:'pickup' },
    smelt: {                          // 2 copper + 1 timber -> 1 ingot, 4.0s
      per: 2, with: { timber: 1 }, secs: 4.0,
      out: { id:'ingot', name:'COPPER INGOT', itemName:'INGOT', solid:false,
             tint:[P.cuA, P.cuB, P.cuC], paint:['grain'],
             item:{ size:4, mass:3.2, purity:1.0, fragility:0, temp:900 } }
    }
  },

  gravel: { name:'GRAVEL', itemName:'GRAVEL', solid:true, hard:0.25, drop:'gravel',
            tint:[P.limeB, P.limeC, P.limeD], paint:['grain','edges'],
            item:{ size:3, mass:0.9, purity:0.15, fragility:0, temp:20 } }
};

/* ---- load-time registration ----------------------------------------------
   Assigns tile ids by insertion order, mints nested smelt outputs so an ingot
   needs no second row, and turns every smelt clause into a recipe. Names are
   resolved to indices exactly once, here — never on a hot path.            */
export const SUB = [];                       // tile id -> substance row
export const S   = {};                       // 'copper' -> tile id

function register(id, row) {
  if (S[id] !== undefined) throw new Error('duplicate substance: ' + id);
  const s = { id, i: SUB.length, tint: ['#000000'], item: {}, paint: [], ...row };
  SUB.push(s); S[id] = s.i;
  if (row.smelt) register(row.smelt.out.id, row.smelt.out);
  return s;
}
for (const id in SUBSTANCES) register(id, SUBSTANCES[id]);

/* Smelting recipes belong to the SUBSTANCE, not the machine: any machine with
   role 'smelter' inherits all of them, so adding tin gives every furnace a
   tin recipe with no machine edit. */
export const SMELT_RECIPES = SUB.filter(s => s.smelt).map(s => ({
  in:   { [s.id]: s.smelt.per, ...s.smelt.with },
  out:  { [s.smelt.out.id]: 1 },
  secs: s.smelt.secs
}));

export const solidOf = i => SUB[i].solid === true;
export const hardOf  = i => SUB[i].hard;
```

`paint` names are bound at boot by `bindTreatments(SUB)`, so a typo fails at
boot rather than mid-repaint and `data/` never imports `render/`.

### (b) The furnace

```js
// src/data/machines.js
import { S, SMELT_RECIPES } from './substances.js';
import { P } from '../core/palette.js';

export const MACHINES = {
  furnace: {
    name:  'CRUDE FURNACE',
    tw: 3, th: 2,                 // footprint, tiles
    floor: 2,                     // needs >= 2 solid tiles beneath
    slots: 4, cap: 4,             // 4 distinct substances, 4 units each
    role:  'smelter',             // inherits every substance's smelt clause
    handFeed: true,               // draws from pockets when the player is adjacent
    fire: { decay: 0.7, onFeed: 1.0, running: 0.6 },
    look: { body:[P.basB, P.basA, P.basC], paint:['mBody','mMouth','mFire'] },
    ports: [
      { at:[0, 0, 3, 1], kind:'catch', lip:2 },              // the mouth
      { at:[1, -1],      kind:'eject', vy:-70, vxJitter:20 } // ingots pop out
    ]
  }
};

/* ---- load-time registration: names -> indices, role recipes folded in ---- */
const compile = r => ({ secs: r.secs,
  in:    Object.entries(r.in    || {}).map(([k, n]) => [S[k], n]),
  out:   Object.entries(r.out   || {}).map(([k, n]) => [S[k], n]),
  fluid: Object.entries(r.fluid || {}) });

export const TYPES = [];  export const MK = {};
for (const id in MACHINES) {
  const t = { id, i: TYPES.length, slots:4, cap:4, floor:1, fire:{decay:1},
              ports:[], recipes:[], ...MACHINES[id] };
  t.recipes = [...t.recipes, ...(t.role === 'smelter' ? SMELT_RECIPES : [])]
              .map(compile);
  TYPES.push(t); MK[id] = t.i;
}
```

Buffers are four `(substance, count)` pairs in one `Uint16Array` component —
one named layout, identical for every machine:

```js
// src/systems/buffer.js
// Buf.data[e*8 + slot*2]     = substance id + 1   (0 = slot empty)
// Buf.data[e*8 + slot*2 + 1] = units held
const find = (e, sub) => {
  const b = e * 8;
  for (let s = 0; s < 4; s++) if (Buf.data[b + s * 2] === sub + 1) return b + s * 2;
  return -1;
};
export function bufPut(e, t, sub, n) {              // -> units actually accepted
  let k = find(e, sub);
  if (k < 0) { const b = e * 8;
    for (let s = 0; s < t.slots; s++)
      if (!Buf.data[b + s * 2]) { k = b + s * 2; Buf.data[k] = sub + 1; break; } }
  if (k < 0) return 0;
  const took = Math.min(t.cap - Buf.data[k + 1], n);
  if (took > 0) Buf.data[k + 1] += took;
  return Math.max(0, took);
}
export const bufHas = (e, sub, n) => { const k = find(e, sub);
  return k >= 0 && Buf.data[k + 1] >= n; };
export function bufTake(e, sub, n) { const k = find(e, sub);
  Buf.data[k + 1] -= n; if (!Buf.data[k + 1]) Buf.data[k] = 0; }
```

Placement writes catch-port tiles into `f.catchE`, making item→machine O(1)
instead of `O(items × machines)`:

```js
// src/systems/place.js
export function place(f, typeId, tx, ty) {
  const t = TYPES[typeId];
  for (let j = 0; j < t.th; j++) for (let i = 0; i < t.tw; i++)
    if (matAt(f, tx + i, ty + j) !== S.air) { toast('NEEDS CLEAR SPACE'); return 0; }
  let footing = 0;
  for (let i = 0; i < t.tw; i++) if (solidAt(f, tx + i, ty + t.th)) footing++;
  if (footing < t.floor) { toast(`THE ${t.name} NEEDS A FLOOR`); return 0; }

  const h = spawn(MACHINE), e = ix(h);
  Pos.data[e * 2] = tx * f.tile;  Pos.data[e * 2 + 1] = ty * f.tile;
  Foot.data[e * 4] = tx; Foot.data[e * 4 + 1] = ty;
  Foot.data[e * 4 + 2] = t.tw; Foot.data[e * 4 + 3] = t.th;
  Kind.data[e] = typeId;
  for (const p of t.ports) if (p.kind === 'catch')
    for (const ti of portTiles(f, e, t, p)) f.catchE[ti] = h;
  toast(t.name + ' PLACED');
  return h;
}
```

Three generic systems — **all** the machine behaviour in the project,
replacing `structures.js` entirely:

```js
// src/systems/machine.js
const accepts = (t, sub) => t.recipes.some(r => r.in.some(([s]) => s === sub));

/* --- catch box: driven from the item, one integer lookup, no scan --------- */
export function tickCatch(f) {
  each(maskOf(Pos, Sub, Stack), e => {
    const h = f.catchE[tileOf(f, Pos.data[e * 2], Pos.data[e * 2 + 1])];
    if (!h || !alive(h)) return;
    const m = ix(h), t = TYPES[Kind.data[m]];
    if (!accepts(t, Sub.data[e])) return;
    const took = bufPut(m, t, Sub.data[e], Stack.data[e]);
    if (!took) return;                          // full: the item simply rests there
    if (!Prog.data[m * 2 + 1]) play('ignite', clock.t);
    Prog.data[m * 2 + 1] = t.fire.onFeed;
    burst(Pos.data[e * 2], Pos.data[e * 2 + 1], SUB[Sub.data[e]].tint[0], 4);
    if ((Stack.data[e] -= took) <= 0) kill(handleOf(e));
  });
}

/* --- hand-feeding: no substance names, no bare caps ---------------------- */
export function tickHandFeed(f) {
  const px = Pos.data[playerE * 2], py = Pos.data[playerE * 2 + 1];
  each(MACHINE, m => {
    const t = TYPES[Kind.data[m]];
    if (!t.handFeed || !nearFootprint(f, m, t, px, py, 10, 8)) return;
    for (const r of t.recipes) for (const [sub, need] of r.in) {
      const c = carriedOf(sub);                 // a Carried entity, or 0
      if (!c) continue;
      const took = bufPut(m, t, sub, Math.min(need, Stack.data[c]));
      if (took && (Stack.data[c] -= took) <= 0) kill(handleOf(c));
    }
  });
}

/* --- production ---------------------------------------------------------- */
export function tickMachines(dt, f) {
  each(MACHINE, e => {
    const t = TYPES[Kind.data[e]];
    Prog.data[e * 2 + 1] = Math.max(0, Prog.data[e * 2 + 1] - dt * t.fire.decay);
    const r = t.recipes.find(r => ready(e, t, r, f));
    if (!r) { Prog.data[e * 2] = 0; return; }
    Prog.data[e * 2] += dt;
    Prog.data[e * 2 + 1] = Math.max(Prog.data[e * 2 + 1], t.fire.running);
    if (Prog.data[e * 2] < r.secs) return;
    Prog.data[e * 2] -= r.secs;                 // carry the remainder: no drift
    for (const [sub, n] of r.in)    bufTake(e, sub, n);
    for (const [fl,  n] of r.fluid) f[fl].draw(portTile(f, e, t, 'fluid'), n);
    for (const [sub, n] of r.out)   eject(f, e, t, sub, n);
  });
}
function ready(e, t, r, f) {
  for (const [sub, n] of r.in)    if (!bufHas(e, sub, n)) return false;
  for (const [fl,  n] of r.fluid) if (f[fl].v[portTile(f, e, t, 'fluid')] < n)
                                    return false;
  return true;
}
function eject(f, e, t, sub, n) {
  const p = t.ports.find(p => p.kind === 'eject'), [ox, oy] = p.at, tl = f.tile;
  for (let k = 0; k < n; k++)
    spawnItem(f, sub, (Foot.data[e * 4] + ox) * tl + tl / 2,
                      (Foot.data[e * 4 + 1] + oy) * tl + tl / 2,
                      (rand() - 0.5) * (p.vxJitter || 0), p.vy);
}
```

### (c) The crusher — 1 ore -> 2 gravel

```js
// added to MACHINES in src/data/machines.js. Nothing else.
crusher: {
  name: 'CRUSHER',
  tw: 2, th: 2, floor: 2,
  slots: 2, cap: 6,
  handFeed: true,
  fire: { decay: 1.4, onFeed: 0.5, running: 0.3 },
  look: { body:[P.irC, P.irB, P.irD], paint:['mBody','mMouth','mGrind'] },
  ports: [
    { at:[0, 0, 2, 1], kind:'catch', lip:2 },
    { at:[0, 2],       kind:'eject', vy:10, vxJitter:30 }    // spits out the bottom
  ],
  recipes: [ { in:{ copper:1 }, out:{ gravel:2 }, secs:1.6 } ]
}
```

**What else the crusher touches, plainly:** the `gravel` substance row above,
and nothing more — no engine code, no system edit, no renderer edit
(`look.paint` uses the same treatment registry as tile painting), no HUD edit,
no serialisation edit.

## Benchmark

**1. Add a substance.** One row shaped like `copper` above. Consumers are
generic: `vein` feeds a generator looping substances that have one, `smelt`
folds into `SMELT_RECIPES`, `item` becomes component defaults, `paint`/`tint`
become treatments, table order becomes HUD order. The `bedrock` row makes
out-of-bounds `tileAt()` return a real substance, deleting the `-1` sentinel.

**2. Add machines.** Shown above. The washery adds only
`{ at:[0,1], kind:'fluid', fluid:'water', draw:0.4 }` and
`recipes:[{ in:{gravel:2}, fluid:{water:0.5}, out:{concentrate:1}, secs:3.0 }]`;
`ready()` already checks fluid and `tickMachines` already draws it.

**3. Data-driven painting.** `hud.js:57-62`'s hardcoded names go the same way.

```js
// src/render/treatments.js — a registry; adding a material never edits it
export const TREATMENTS = {
  grain (g, px, py, tx, ty, s)    { /* today's hash loop, over s.tint */ },
  edges (g, px, py, tx, ty, s, f) { /* today's exposed-face code */ },
  cracks(g, px, py, tx, ty, s, f) { /* reads the Dig set, not a tile byte */ },
  glint (g, px, py, tx, ty, s, f) {
    for (let k = 0; k < 2; k++) {
      const hx = (hash2(tx + k * 13, ty * 5) * f.tile) | 0;
      const hy = (hash2(ty + k * 7,  tx * 3) * f.tile) | 0;
      R(g, px + hx, py + hy, 1, 1, s.tint[3] || s.tint[0]);
    }
  },
  glow  (g, px, py, tx, ty, s)    { glow(g, px+4, py+4, s.glowR||5, s.tint[0], .35); }
};
export function bindTreatments(rows) {
  for (const s of rows) s.paintFns = s.paint.map(n => {
    const fn = TREATMENTS[n];
    if (!fn) throw new Error(`${s.id}: no treatment "${n}"`);
    return fn;
  });
}
// paintTile, entire:
for (const fn of s.paintFns) fn(g, px, py, tx, ty, s, f);
```

`paint.js:127`'s `if (M.id === 'copper')` is now `'glint'` in copper's row.
Adding the *treatment* `glow` is one new function with none edited; applying it
to obsidian is one word in a row. Treatments take only `hash2(coords)`,
substance data and field values — never `rand()` — so `render()` consumes no
randomness and repaint is idempotent, which makes the chunk cache safe to
evict.

**4. Configurable world.**

```js
// src/field/field.js — no module-scope allocation, no fixed world size
export function makeField({ tw, th, tile = 8, chunk = 16, fluids = [] }) {
  const cx = Math.ceil(tw / chunk), cy = Math.ceil(th / chunk);
  const f = { tw, th, tile, chunk, w: tw * tile, h: th * tile, cx, cy,
    mat:    new Uint8Array(tw * th),
    dirty:  new Uint8Array(cx * cy), dirtyQ: [],       // budgeted repaints
    catchE: new Int32Array(tw * th),                   // tile -> machine handle
    bucket: new Int32Array(tw * th),                   // spatial index heads
    idx: (x, y) => y * tw + x,
    inB: (x, y) => x >= 0 && x < tw && y >= 0 && y < th };
  for (const n of fluids)
    f[n] = { v: new Float32Array(tw * th), act: new Int32Array(tw * th),
             hot: new Uint8Array(tw * th), n: 0, draw: null };
  return f;
}
// src/data/bands.js
export const BANDS = [
  { id:'tutorial', tw:128, th:384, gen:'tutorial', fluids:['water'] },
  { id:'abyss',    tw: 96, th:512, gen:'abyss',    fluids:['water','heat'] }
];
```

The seam is `world.field`, set by `newRun(seed, band)`; modules importing
`WORLD_TW` today take `f` as a parameter (~40 call sites).

**5. Where mining lives.** `src/systems/mining.js`. Damage is not a property of
rock, it is state of an *in-progress action* with a lifetime and an owner, so a
damaged tile gets a sparse `DIG` entity (`DigAt` = tile index, `DigSec` =
`Float32` seconds). `grid.dmg`'s 49KB always-almost-zero array and its 1/255
quantisation both go.

**6. Item identity.** Structure-of-arrays, one dense typed array per property
indexed by entity id: `Mass`/`Purity`/`Frag`/`Temp` are `Float32Array(4096)` =
16KB each, `Pos` is `Float64Array(4096*2)` = 64KB, twenty components under 1MB.
Adding `viscosity` is one line, and critically **no container changes shape** —
`Stack`, `Carried` and `Buf` hold handles or `(substance, count)` pairs, never
property lists.

**7. Fluid/heat seam.** Per-cell scalars, so by the boundary rule they stay
*outside* the ECS, beside `mat`: `f.water.v`, `f.heat.v`, an active-cell ring
(`act`) and a membership byte (`hot`) so idle regions cost nothing. They reuse
the chunk-dirty machinery for **nothing** — coupling one cell's change to a
chunk repaint is ~4,300 `fillRect`, the hitch the audit found. Fluids draw as a
per-frame overlay; only a material change dirties. The ECS↔field bridge is two
sites: machine ports, and `Temp` entities sampling `f.heat.v`.

**8. HUD inventory**, ordered and coloured from the substance table.

```js
const rows = new Map();
each(maskOf(Carried, Sub, Stack), e =>
  rows.set(Sub.data[e], (rows.get(Sub.data[e]) || 0) + Stack.data[e]));
for (const s of SUB)
  if (rows.has(s.i) || s.alwaysShow) swatch(s.tint[0], rows.get(s.i) || 0);
```


**9. Entity spatial indexing.** Three mechanisms, none a scan. (a)
`f.catchE[tile]`, written at placement — one integer per item per frame, so
item→machine is O(items). (b) Per-tile bucket lists (`f.bucket` heads plus
`Next`), maintained on move. (c) **Sleep is a mask bit**: a resting item gains
`Asleep` and leaves the falling query, so `structures.js`'s rescan is not
expressible. The mask *is* the activity index.

**10. The three bugs, by construction.**

- *Granite 2.40s.* `DigSec` is `Float32` seconds — no byte to truncate, so the
  "faster on slower machines" artifact is impossible.
- *A 20-tile drop is lethal at any framerate.* Today `p.wasAir` samples `vy`
  before the final partial step, under-reading peak velocity by up to `GRAV*dt`
  (5.33 px/s at 60fps) — hence 4 hearts. The rule: **discrete outcomes derive
  from integrated quantities, never per-frame samples.** Hearts come from fall
  *distance* via `v = sqrt(2*GRAV*h)` — framerate-independent by algebra.
- *No tunnelling.* One `integrate` system serves everything with `Pos|Vel|Body`,
  sub-stepping so no step exceeds `tile/2`, with a swept scan along the
  segment. There is no second collision implementation to disagree with it,
  which is today's root cause.

### Determinism, reset, serialisation

```js
// src/ecs/ecs.js
export function resetEcs() {
  for (const c of registry()) c.data.fill(c.def);      // every field, mechanically
  world.mask.fill(0); world.gen.fill(0);
  world.top = 0; world.count = 0; world.free.length = 0;
}
export const snapshot = () => ({
  seed: run.seed, band: run.band, top: world.top, free: world.free.slice(),
  mask: world.mask.subarray(0, world.top), gen: world.gen.subarray(0, world.top),
  comp: Object.fromEntries(registry().map(c =>
          [c.name, c.data.subarray(0, world.top * c.width)])) });

// src/app/boot.js — the whole of newRun()
export function newRun(seed, band = BANDS[0]) {
  run.seed = seed; run.band = band.id; run.t = 0;
  run.dead = false; run.deathCause = ''; run.beat = 0;
  seedRng(seed);                                 // reproducible from the seed alone
  resetEcs();
  world.field = makeField(band);
  clock.t = 0; clock.dt = 0; clock.frame = 0;
  generate(world.field, GENERATORS[band.gen], seed);
  spawnPlayer(world.field, SITE.spawn);
  resetTutorial();
}
```

The registry *is* the enumeration of mutable sim state, so "a field survived a
restart" is not expressible — better than today's hand-listed `newRun()`, which
already lost `run.ladderStock` (lazy at `mining.js:94`, absent from `state.js`).
Three determinism rules: queries iterate ascending index; the free list is LIFO,
so allocation is a pure function of history; any system calling `rand()` must use
`each()`. The harness checks the last by counting `rng.next` across `render()`.
**ECS helps decisively on serialisation** — the four disagreeing `run` schemas
collapse because there is no run schema, only a registry. Cost: typed arrays do
not JSON-serialise.

## Directory layout

```
src/
  core/       canvas, palette, font, rng, sfx          (unchanged)
  ecs/        ecs.js  components.js  archetypes.js     (~180 lines total)
  data/       substances.js  machines.js  bands.js  generators.js
  field/      field.js  fluid.js  index.js  gen.js
  systems/    integrate.js  mining.js  machine.js  buffer.js  place.js
              carry.js  tutorial.js
  render/     scene.js  chunk.js  treatments.js  hud.js
  app/        boot.js  loop.js  input.js  state.js   (clock, cam, view, run)
```

## Migration path

Each step lands with `npm run check` green.

| # | Step | LOC touched |
|---|---|---|
| 1 | `ecs/` engine, component registry, archetype masks. No callers. | +180 new, 0 touched |
| 2 | `chips` → ECS. Lowest-stakes 40 entities; proves the loop. | ~60 |
| 3 | `items` → ECS with `Sub|Stack|Mass|Purity|Frag|Temp`. Item identity exists. | ~120 |
| 4 | Merge `MAT`+`KIND` → `data/substances.js`; add `bedrock`; delete the `-1` sentinel. | ~90 |
| 5 | `DIG` entities; delete `grid.dmg`. **Granite bug closed**, with a timing test. | ~50 |
| 6 | Swept `integrate`; player adopts it. **Tunnelling and fall-damage bugs closed.** | ~110 |
| 7 | `data/machines.js` + the three generic systems. Delete `structures.js` (-92). Crusher and washery land as rows. | ~150 |
| 8 | Treatment registry; repaint budget + LRU eviction; `mix()` precomputed. | ~130 |
| 9 | `makeField(cfg)`; kill module-scope world size (~40 sites). Last, because 2-8 shrink the set of files touching the grid. | ~180 |
| 10 | Fluid/heat arrays, active cells, overlay pass, washery's water port. | ~120 |

≈1,190 lines of 1,889. Steps 1-6 are the whole bug-fix payload and stand alone.

## What this is bad at

1. **The performance argument does not exist, and performance is what ECS is
   for.** n≈500, and the 49,152-cell field — the actual hot data — is
   deliberately excluded, so typed arrays buy nothing measurable. The plan lives
   or dies on how many `DESIGN.md` features get built; if the answer is "two",
   this is over-engineering and criterion 4 should sink it.
2. **Runtime state becomes unreadable.** `Pos.data[e*2]` instead of `it.x`, on
   every sim line, forever. The authored tables get *better*, the runtime gets
   worse, and no version of this paradigm avoids that.
3. **Debugging gets materially worse.** `console.log(it)` prints an item today;
   under ECS you print `37` and hand-assemble. A `dump(e)` walking the registry
   is a tool you must maintain, and a trace inside generic `tickMachines()`
   names the *system*, not the *kind of thing*.
4. **Free list and generation counters are a bug factory.** `gen<<20` handles
   and default-writing in `spawn`/`add` close the two stale-handle variants I
   can name; I expect the first post-migration bugs in the ones I cannot.
   Today's `items.splice(i,1)` cannot have this class of bug at all.
5. **A hand-rolled ECS grows into a library you maintain.** 180 lines becomes
   500 the first time a system spawns while iterating and needs a deferred
   command buffer — `tickCatch` already kills mid-iteration.
6. **The hybrid boundary is a judgement call, and judgement calls drift.**
   Someone will want a tile with identity — a machine built from tiles, a pipe
   network — and must pick a side. The rule above makes that argument
   adjudicable, not unnecessary.

## Rejected alternatives

- **Tiles as entities.** 196KB of mask alone, a 49k-iteration query per system
  per frame for static rock, and the loss of positional addressing every
  algorithm here depends on. Indefensible.
- **Archetype-chunked storage** (Flecs/Bevy-style: dense per-archetype chunks,
  entities migrating on component add). Correct at 100k entities; at 500 it is
  ~300 lines of bookkeeping for zero gain.
- **Chunk-as-entity for the field** (each 16×16 chunk an entity with
  `Materials|Dirty|Water`). The closest call: it makes the chunk the unit of
  query — right for painting, wrong for per-cell physics — and interposes an
  entity layer in front of a `Uint8Array`.
- **bitecs / miniplex / Flecs-wasm.** bitecs is the closest fit but is a runtime
  dependency whose API churned across 0.3→0.4; wasm needs a fetch.
- **Sparse-set-per-component (EnTT style).** Better when components are rare,
  but two arrays and an indirection each; at MAX_ENT=4096 a dense
  `Float32Array` is 16KB, so sparsity buys nothing.
- **Classes for machines and items** (`class Furnace extends Machine`). The axis
  the owner is asking about, so plainly: a hierarchy puts a furnace's behaviour
  in the furnace, which reads beautifully for one machine and then forces
  `Crusher`/`Washery` subclasses re-implementing the same catch/buffer/tick
  loop, with drift between them. It also makes item identity a
  constructor-signature change every time a property is added.
- **Just fix the three bugs.** `grid.dmg` → `Float32Array`, fall damage from
  distance, sub-step the item integrator: ~60 lines, all three closed, no
  architecture. Take this if the RFC is rejected.
