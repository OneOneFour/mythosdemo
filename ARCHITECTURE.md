# Architecture

How this codebase is organised, and why. Written before the code it describes,
so it governs rather than documents.

The reasoning behind these choices is in `docs/rfc/` — six competing proposals,
a graded review, three built prototypes and a final code review. This file is
the conclusion. If you disagree with something here, read the review first;
most objections were already argued.

---

## 1. Six layers, one legal direction

```
core     pure utilities. Depends on nothing.
  |      rng, palette, bitmap font, integer-pixel ops, canvas/viewport
  v
data     content definitions. Frozen tables. No logic, no state.
  |      substances, forms, machines, recipes, tuning, trinkets, boons, world
  v
model    world state and queries. Owns numbers. Makes no decisions.
  |      bands, tiles, mining, items, machines, fields, player, run, mods,
  |      journal, epoch, aim
  +----------------+
  v                v
rules            view      siblings. MUTUALLY FORBIDDEN.
mechanics        rendering + HUD. Reads model, never mutates it.
  |                |
  +----------------+
  v
shell    the loop, input, boot, wiring, devices. Depends on everything.
```

**Nothing may import upward.** `view` may never mutate `model`. `model` may
never know rendering exists. `rules` and `view` may never import each other.

`rules` modules are siblings and **do not import one another** — their order is
stated once, in `shell/schedule.js`, so "what runs before what" is one readable
list rather than an emergent property of the import graph.

This is enforced, not requested. See section 8.

### Why direction, and not just tidiness

The old codebase's problems were all symptoms of dependencies pointing every
way at once. `world/grid.js` (storage) contained the mining mechanic.
`world/paint.js` (rendering) string-compared a material id. `sim/structures.js`
reached into the player, the tile grid, the item list, the toast queue *and*
the audio device. `sim/mining.js` imported the **tutorial**. Once direction is
fixed, most hardcoding has nowhere left to hide: a renderer that cannot import
gameplay cannot special-case `'copper'`.

## 2. Where does a thing go? Two rules, and they answer almost everything

**Rule 1 — `model` owns the number and the query. `rules` owns the decision and
the consequence.**

Storage has the lifetime of the world; a decision has the lifetime of a frame.
Mining progress is a number that persists, so it lives in `model/mining.js`.
"Has this tile broken, and what drops" is a per-frame decision, so it lives in
`rules/mining.js`.

This is not cosmetic. Mining progress used to live in the tile-storage module,
and that is *why* it was stored as a byte in the material array — which made
hard material permanently unmineable above a threshold framerate. Bad placement
produced a real bug.

**Rule 2 — a substance is an element. Anything you can hold is substance x
form.**

If a new thing has no element of its own, it is a **form** of the element it
came from, not a new substance. A brick is fired copper gravel, and stays
copper. So `gravel`, `ingot` and `brick` are forms; `copper`, `tin` and
`timber` are substances.

Consequences:
- one `smelt` recipe covers every ore that will ever exist
- adding `tin` adds no row to `forms.js` at all
- a tin ingot differs from a copper ingot automatically, rather than needing a
  hand-written row that someone will forget

The cost, stated: every held thing is a `{sub, form}` pair rather than one id,
so tile-capable forms need packing into the one byte a tile stores. And
`grep ingot` finds a form rather than a thing.

## 3. Content is data. Behaviour is a generic interpreter.

A machine is a **row**, not a class and not a function. `rules/machines.js` is
the only code that ticks a machine, and it contains no machine name, no
substance name and no magic number. It reads parameterised keys off the row:
`ports`, `buffer`, `catchBox`, `handFeed`, `recipes`, `servo`, `emit`, `lift`.

So adding a machine is adding values, and the interpreter never learns a new
noun. Adding a *behaviour nothing has yet* does cost engine code — a new key
and a branch in the interpreter. That trade is deliberate: adding content
happens constantly, adding unprecedented behaviour rarely.

Appearance is data too. A row carries `look`, and **no machine or substance
name appears anywhere in `view/`.**

## 4. Notification flows downward, as data

`rules` never calls `play()` or `toast()`. It pushes a row onto
`model/journal.js`; `shell/notify.js` drains it once a frame and turns rows
into sound, particles and text.

That is what lets the dependency direction be a rule rather than a hope — audio
is a device, devices live in `shell`, and a call from `rules` to `shell` would
be an upward edge.

**Cost, paid where it is stated:** a drained event is seen one frame late,
ordering between two consumers is implicit rather than a call stack, and a
`shell` that forgets to drain loses feedback silently instead of throwing.
Measured, the allocation cost is 0.49 microseconds per frame at a worst-case
13 events per frame — 0.003% of a 60fps budget. The latency is the real cost,
not the throughput. It is acceptable for sound and chips; it would not be for
anything needing same-frame response.

## 5. Tunables: frozen design, mutable run

Split by name, because a god's boon must be able to change walk speed and
`export const WALK = 60` is read-only to importers.

- `data/tuning.js` — the **design**. Frozen. Never written. Base values.
- `model/mods.js` — the **run**. A list of `{src, key, mul, add}` rows, keyed by
  the trinket that applied them, cleared by `newRun()`.
- `eff(id, scope)` — the only way to read either. `(base + sum of add) x
  product of mul`, in fixed order so draft order cannot change a number.

**No file except `model/mods.js` may import `data/tuning.js`.** The layer
checker enforces that, which makes the store unbypassable rather than merely
conventional. A scoped key narrows to a substance or a machine id, so
`rate.kiln_divine` speeds one machine and `hard.granite` softens one material.

This is why a variant machine is free: give it its own id, add one tuning row,
and a trinket still stacks multiplicatively on top without either knowing the
other exists.

## 6. Bands: the world is not a global

```
ASTRAL / HEAVENLY   minor gods. Reachable.
SURFACE             spawn.
TOPSOIL             first digging band.
```

A band carries its own dimensions, tile size and strata, from `data/world.js`.
World size is **not** a module constant and the tile arrays are **not**
allocated at import — that was the single biggest structural blocker in the old
code, and it is why multiple depth bands were impossible.

Band ordinals are never assumed to be zero. A band is a value passed to a
query, not an ambient global.

Three bands exist from the start because the game's thesis needs a destination:
**down is free, up is expensive.** Digging into topsoil is free; the lift to the
astral band is not. Without somewhere above the surface to deliver to, the
asymmetry is an assertion rather than a mechanic.

## 7. What was rejected, and why

Read `docs/rfc/00-REVIEW.md` and `docs/rfc/00-FINAL-REVIEW.md` for the full
argument. In brief:

- **Class hierarchies with inheritance.** Joint *best* on readability — one file
  per thing is the most greppable layout proposed. Rejected on coverage: single
  inheritance cannot supply two orthogonal capabilities, so a machine that is
  both a burner and a fluid handler does not fit the tree. 15 of 22 design
  goals landed non-clean.
- **Named slots as the primary mechanism.** The most elegant single idea in the
  set, and it uniquely solved a lifter fuelled by the player's health. Rejected
  because promoting it required splitting every part into three files in three
  directories, which cost more comprehensibility than the elegance bought, and
  because optional slots defeat their own checker: a machine missing a required
  provider passes every check and silently never runs.
- **ECS with parallel typed arrays.** Conceded its own performance case — the
  hot data is 49,000 tiles which are not entity-shaped, and entities number in
  the hundreds. Reads as `Pos.data[e*2]` on every line, against the grain.
- **A kernel plus self-registering content packs.** Best in the set at granting
  machines mid-run. Rejected as speculative generality: one content pack, no
  second one planned, and registration adds indirection to the most common kind
  of edit.
- **A compiler that derives rows from rows.** Elegant — one ore row yielding its
  ingot, recipes, HUD slot and paint plan. Rejected for 320 lines of engine code
  existing only to make data safe, failures landing far from the edit, and the
  loss of being able to grep a name and find the thing.
- **Per-machine draw functions.** Rejected because it makes "add a machine"
  always cost a render edit.

## 8. Enforcement — a rule nobody checks is a comment

`tools/layers.mjs` parses every import in `src/`, resolves it to a layer, and
fails on any illegal edge: upward, sibling-to-sibling between `rules` and
`view`, `rules` importing `rules`, or anything but `model/mods.js` importing
`data/tuning.js`. `LAYER_BUDGET` is 0 and may only ever go down.

`tools/resolve.mjs` proves every string key in `data/` resolves to something —
a substance id, a form, a recipe tag, a tunable, a palette name — at build time,
so a typo fails before import rather than at runtime.

An epoch assertion proves `render()` performs no model writes: `model` bumps a
counter on every mutation, and the check asserts the counter is unchanged across
a render.

**What enforcement cannot do:** it checks direction and names, not sense. It
will not notice that a recipe is unreachable, that a machine has no way to be
fed, or that a number is wrong. Behavioural probes in `tools/check.mjs` cover
some of that; a human covers the rest.

## 9. Invariants

1. The tile grid is the only source of truth for terrain. Never a second
   collision model.
2. World coordinates are absolute per band. Resizing the window moves the
   camera and nothing else.
3. A dig repaints its chunk, not the world.
4. Down is free, up is expensive. Falling is fast and costs hearts; climbing is
   half walk speed and costs material; the lift only ascends with a lit burner.
5. Mined material becomes a falling item, never a direct inventory credit.
   Machines are catch boxes: material that falls in is free.
6. Health is five discrete hearts. No partials, no regeneration, no respawn.
7. A run is bit-reproducible from its seed. All randomness through `rand()`;
   **rendering consumes none.**
8. `newRun()` resets everything. A field that survives a restart is a
   determinism bug.
9. Integer pixels only. No `fillText`.
10. No runtime dependencies. Dev tooling is a separate question and is allowed.
