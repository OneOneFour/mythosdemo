# B — composed objects (RFC 02 as written, hardened)

45 files, ~2,800 lines including comments. Skeleton for **code inspection**;
it is not a game and does not boot a canvas. Every file passes `node --check`.

**What is verified and what is not.** Every file parses, and every import
resolves. Beyond that, the sim half turned out to run headlessly, so the claims
in this README marked "verified" were checked by executing them: placing all
five machines, ticking 900 steps, watching the kiln bake `copper:brick` and the
furnace smelt `tin:ingot` from `$s` rows, watching the blood winch take two
hearts and raise its deck, running the director through two tribute cycles so
that a 192x512 band comes to coexist with the 128x384 one, round-tripping a save
of both bands through `JSON.parse`, and triggering each error message in the
table below. Nothing visual is verified —
`core/px.js` is a stub and there is no canvas. Nothing about performance is
claimed or measured.

This is the **control** in a three-way experiment. Prototype A composes RFC 02
with RFC 04's strict layering, which splits every component into a frozen data
row, a state record and a free function. This build keeps 02's actual
representation: **components are object literals with a `make(params)` factory,
they own their state and their tick, they `provide` and `need` named slots, and
`assemble()` resolves slots to direct references once at assembly time.** No
layers, no dependency checker, no `class`, no `extends`, no `new`.

What was hardened beyond the RFC, because the review named these as 02's four
AWKWARD cells (items 2, 3, 8, 21):

| review finding | what is here |
|---|---|
| item 3, saves — "component state on objects with methods is hard to snapshot" | `sim/save.js`. We serialise the **inputs to `assemble()`**, not the object graph. Verified round-trip. |
| item 2, run structure — "no run-structure concept" | `sim/run.js` + `data/cycles.js`. A 107-line director; `meta` / `run` / `world` split at the top level. |
| item 8, trinkets — all six RFCs missed the tunable store | `sim/tunables.js`. Base values + removable stacking modifiers by source. |
| RFC weakness 2 — "the slot mechanism is one requirement from an event bus" | Confronted in the long comment at the bottom of `comp/recipe.js`. Counters, not events; and the tripwire is named. |
| RFC weakness 1 — "grep gets worse" | Four mitigations in `sim/explain.js`, plus what remains unmitigated. |
| item 21, belts | **Not fixed.** The honest statement is in `world/tiles.js`. |

---

## Reading order

Five files, in this order. A newcomer should not need any others.

1. **`src/data/machines.js`** — the machines. A row lists its parts, so you can
   enumerate what a machine can do without opening another file. Read the
   `winch` / `bloodWinch` pair at the bottom: the diff between them is the
   blood winch.
2. **`src/sim/assemble.js`** — ~70 lines that turn a row into a live object.
   The only engine code you must understand, and it is never edited to add a
   machine.
3. **`src/data/substances.js`** and **`src/data/forms.js`** — the material
   model. `forms.js` opens with the one rule that decides whether a new thing
   is a substance or a form; read it before adding either.
4. **`src/comp/recipe.js`** — the only recipe engine, and the heat gate that
   carries three DESIGN items. Its closing comment is the observation rule that
   keeps slots from becoming an event bus.
5. **`src/comp/index.js`** — the whole slot graph as a comment. It answers the
   question no single file can: who provides `heat`, and who needs it.

Then, if you are looking for something specific: `sim/tunables.js` for any
gameplay number, `sim/save.js` for persistence, `world/tiles.js` for the
object/array boundary, `sim/explain.js` for "why did the furnace stop".

```
src/
  core/      palette.js rng.js px.js                    (draw calls stubbed)
  data/      substances.js forms.js recipes.js machines.js actors.js
             boons.js cycles.js bands.js
  comp/      index.js  footprint buffer catchbox handfeed recipe emitter
             burner bloodburner heatvent deck body pick inventory hearts
  sim/       assemble.js match.js step.js tables.js tunables.js
             save.js run.js boons.js explain.js
  world/     world.js tiles.js field.js hashgrid.js generate.js
  render/    chunks.js treatments.js looks.js hud.js
  main.js
```

---

## Adding a substance

`tin` was added last, to test the one-row claim. **Files touched: 1.**

```js
// data/substances.js — the whole diff
  tin: {
    name: 'TIN VEIN', hudOrder: 2, tags: ['metal'],
    forms: ['ore', 'gravel', 'ingot', 'brick'],
    tile: { solid: true, mine: { secs: 0.90, yields: { form: 'ore' } } },
    col:  { a: P.tinA, b: P.tinB, c: P.tinD },
    item: { mass: 1.10, col: P.tinC, col2: P.tinB },
    paint: [['grain'], ['edges'], ['glint', { col: P.tinC, n: 2 }]]
  },
```

Nothing else. Verified by running it: the furnace smelted `tin:ingot` and the
kiln baked `copper:brick` from the same two recipe rows, because both bind `$s`.
`data/forms.js`, `data/recipes.js`, `render/hud.js` and `render/treatments.js`
were not touched — the HUD loops over what you carry and the painter loops over
the row's `paint` list.

The one thing to know first is the rule at the top of `data/forms.js`: a
substance is an *element*, and anything holdable is substance × form. The review
found this exact ambiguity ("brick is not a form of gravel") and noted nothing
caught it. It is now stated in one place, and `sim/tables.js` enforces half of
it — a recipe producing a form no substance declares throws at boot.

## Adding a machine

The kiln was written **last**, by copying the crusher row. **Files touched: 5,
of which 4 are data tables and the 5th is optional.**

1. `data/forms.js` — one row (`brick`), plus the `bakeable` tag on `gravel`.
2. `data/substances.js` — `'brick'` appended to three `forms` lists.
3. `data/recipes.js` — one row, copied from `crush`, with `hot: true` added.
4. `data/machines.js` — one row, copied from `crusher`, with `Burner` added.
5. `render/looks.js` — one stub art entry. **Optional**: setting
   `look: 'furnace'` on the row would have made this 4 files, which is how
   `bloodWinch` reuses the `winch` look and needs no art of its own.

No engine file was touched. No `if` was added anywhere. The kiln's `Burner`,
`CatchBox`, `HandFeed`, `Recipe`, `HeatVent` and `Emitter` are the same
instances the other machines use.

```js
// data/machines.js — the crusher with four values changed and one part added
  kiln: {
    name: 'KILN', size: [2, 2], footing: 2, look: 'kiln',
    parts: [
      ['Footprint', {}],
      ['Buffer',    { cap: { gravel: 8, log: 2 } }],
      ['CatchBox',  { mouth: 'top', accepts: { tag: 'bakeable' } }],
      ['HandFeed',  { pad: 10 }],
      ['Burner',    { fuel: { tag: 'fuel' }, secs: 8 }],   // <- "bakes"
      ['Recipe',    { tag: 'bake' }],
      ['HeatVent',  { at: 'top', watts: 22 }],
      ['Emitter',   { at: 'bottom', vy: 10 }]
    ]
  },
```

**Does a typo fail near the edit?** Verified by running each case:

| mistake | message |
|---|---|
| `['Burnr', {}]` | `kiln: unknown component Burnr` |
| `Recipe` with no `Buffer` in the row | `kiln.Recipe needs slot buffer` |
| `{ tag: 'bak' }` | `kiln.Recipe: no RECIPES row has tag bak` |
| two parts providing `heat` | `kiln: two components provide slot heat (Burner and BloodBurner)` |
| `bake` recipe but no substance has a `brick` form | `RECIPES.bake: no substance declares a brick form, so $s can never bind. Add it to the substance's forms list in data/substances.js.` |
| **kiln row with the `Burner` forgotten** | `MACHINES.kiln: recipe 'bake' is hot: true but no part provides heat — add a Burner (or a BloodBurner) to this row.` |

The last row is a hole I found by testing and had to close. `Recipe` declares
`heat?` **optional** — it must, or the crusher could not exist — so a kiln with
no burner satisfies every `needs`, places happily and silently never bakes.
`assemble()` cannot catch it, because whether heat is required is a property of
the *recipe pool*, not of the component. So `sim/tables.js` joins the two tables
at boot instead. That check is 6 lines and it is the single most valuable thing
in this build for the cold-open test.

**Greppability.** `grep -rn kiln src/` → 13 hits in 7 files: 4 in
`data/machines.js` (the row and its comment), 2 in `data/recipes.js`, 2 in
`sim/tables.js` (the validator's worked example), 1 in `render/looks.js`, 1 in
`data/boons.js` (the boon that grants it), and 3 in `comp/burner.js` /
`comp/recipe.js` — comments explaining that the kiln is why `Burner` exists.
Every hit is somewhere you would want to look, but note that a third of them are
prose: greppability here is partly a property of how much I commented, not only
of the structure. `grep -rn Burner src/` → the component, both providers, every
row that mounts one, and the slot graph in `comp/index.js`.

## The blood winch

The review found 02 uniquely CLEAN here. This is the demonstration.

`comp/burner.js` declares `provides: ['heat']` and satisfies itself from a
`Buffer`. `comp/bloodburner.js` declares `provides: ['heat']` and satisfies
itself from `world.player.slots.hearts`. `comp/deck.js` declares
`needs: ['heat']` and calls `this.heat.hot()`.

```js
  winch:      parts: [Footprint, Buffer, CatchBox, Burner,  Deck]
  bloodWinch: parts: [Footprint,                   BloodBurner, Deck]
```

That is the entire feature. Verified by placing both and dumping them with
`sim/explain.js`:

```
bloodWinch #6 at 30,18
  tick order: Footprint -> BloodBurner -> Deck
  slots:
    footprint  <- Footprint
    heat       <- BloodBurner        (Burner, in the timber winch)
    deck       <- Deck
  Deck needs footprint, heat
  heat: LIT from BloodBurner
```

Then ticked for 15 s: the player's hearts went 5 → 3, the deck ascended, and
`Deck` contains no branch that could have noticed. Untouched to support it:
`comp/deck.js`, `comp/recipe.js`, `sim/assemble.js`, `data/substances.js`,
`render/hud.js`. Player health did not become a substance, an inventory row or a
recipe input.

Why it works, in one sentence: **capability is keyed to a slot, not to a type or
a recipe shape**, and `heat` names what a thing *does*, so a second way of doing
it is a peer rather than a subclass or a special case.

The seam, stated: `BloodBurner` reaches across hosts into
`world.player.slots.hearts`. It is the only cross-host reach in the set besides
`HandFeed`, it is legal because `world` is a tick argument, and it means a blood
winch in a headless replay with no player must handle a missing player. It does,
by staying cold.

## Tunables

`sim/tunables.js`, 87 lines. `BASE` holds every gameplay number that was an
`export const` in `sim/player.js` (`WALK`, `HOP`, `CLIMB`, `SAFE_V`, `HEART_V`,
`GRAV`, `TERMINAL`, `PICK_POWER`), plus `machine.rate`, `lift.up`/`lift.down`
and `field.heat.decay`. Material hardness has **no key**: its base comes from
the substance row and is passed in, so adding a substance adds no tunable.

```
base declared     BASE.walk = 60                          tunables.js
trinket applies   TRINKETS.sandals.mods = [{key:'walk', mul:1.15}]   data/boons.js
                  equip() -> addMod('sandals', 'walk', {mul:1.15})   sim/boons.js
consumer reads    this.vx = ... * stat('walk')             comp/body.js
```

Verified: `[60, 69, 60]` — before equip, with the trinket, after dropping it.
Modifiers are tagged with the trinket's id as their **source**, which is what
makes them removable and is the flaw the review found in RFC 06's writable
statics. `hard.*` is a one-level wildcard, so `adamantTip` softens every
material with one modifier; `machine.rate` divides `Recipe.secs`; `fall.safe`
takes an `add`, not a `mul`.

Machine rates and hardness are in the same mechanism, as the brief required.
`render/hud.js` reads `stat('walk')` through the same call the physics uses, so
the number on screen cannot disagree with the number in the sim.

## What I stubbed

Leaves only, never structure:

- **Draw calls.** `core/px.js` `R()`/`drawText()`/`mix()` are no-ops, and every
  `render/looks.js` entry is empty. Art is out of scope; the `look` contract and
  the dispatch are not.
- **Collision resolution.** `comp/body.js` has the real ≤1 px sweep loop under a
  real fixed accumulator; the four-corner test at the bottom is one line.
- **Item integration.** `sim/step.js` gives items a three-line landing test
  rather than hosting `Body` on each of 400 items. Flagged in place: this is a
  real seam where two integrators could drift, and the RFC's claim that items
  share the player's collision code is only true if you pay a slot table per
  item.
- **Worldgen.** `world/generate.js` lays flat strata and scatters the band's
  declared veins. It exists only to prove band config is consumed.
- **Chunk canvas cache, repaint budget, LRU.** `render/chunks.js` has the queue
  and the budget parameter; the canvas cache is absent.
- **Sleeping items** (`tiles.set` waking a column) — the hook is the comment in
  `world/tiles.js` `set()`.
- **Deck cargo handoff** between lift stages, which needs the chute components
  this build does not have. `Deck.load` exists so the save shape is right.
- **Aim from the mouse**, the depth gauge, tribute/favour panels, narrow-viewport
  clamps.

Deliberately **not built, on the RFC's own weakness 6** (a component with no
consumer is a defect): `FluidPort` and a water `Field`, the `IDENT` interning,
belts, monsters beyond one `ACTORS` row. `Burner` *did* ship, because it has two
consumers — the kiln's recipe and the winch's deck.

## What fought me

**1. Optional slots defeat the slot checker exactly where it matters most.**
This is the sharpest thing I found. The whole comprehensibility case for 02 is
"a table typo throws at assembly naming what you typed". But the crusher has no
heat and the kiln does, from the *same* `Recipe` component, so `heat` must be
declared `heat?`. The consequence: the most likely kiln mistake — forgetting the
`Burner` — passes every check `assemble()` can perform and produces a machine
that places, looks fine and never runs. I only found it because I tested it. The
fix is real but it is *outside* the mechanism: a join between `MACHINES` and
`RECIPES` in `sim/tables.js`. Generalised, that means **any conditional
requirement has to be re-expressed in a validator**, and the validator is
hand-written per condition. Two or three more conditional slots and
`sim/tables.js` becomes the place the real rules live, which is the opposite of
what the parts list promised.

**2. Serialisation came out clean, but only after inverting the question.**
Trying to snapshot component instances is as bad as the review says: methods,
`this.buf` cross-references, a `cur` pointing at a shared `RECIPES` row. The
insight that fixed it is that you do not have to — you serialise the *inputs to
`assemble()`* and let `assemble()` be the deserialiser. Methods and
cross-references are then rebuilt rather than transported. Verified:
`f2.slots.catch.buf === f2.slots.buffer` is `true` after a JSON round-trip, and
buffer contents, recipe progress, craft counts, hearts, deck position, trinket
modifiers, RLE'd tiles and active heat cells all survive. 16 KB for a band.

The residue is a **discipline, not a guarantee**. Every component must declare
`persist: [...]` or a `save`/`load` pair; `assemble()` refuses to make one that
declares neither, so *forgetting entirely* is a boot error. But declaring an
**incomplete** list is silent, and it stays silent until a player reloads. I put
`persist` immediately above the `make()` that creates the fields so they are read
together. That is mitigation, not a fix, and it is the one place where 02's
"components own their state" genuinely costs something that a plain-data
representation (prototype A's split) would not pay.

**3. Slots stayed slots, but I can now name the exact price.** RFC 02 predicted
`CatchBox` → `Burner` would want a notification. It did not, in the end: tick
order is topologically sorted, so `Burner` polling the buffer it already holds a
direct reference to loses nothing. The pressure came from somewhere else —
`HeatVent` needs to know a craft *finished*, which is an occurrence, not a state.
The answer is a monotonic counter (`Recipe.made`) and a shadow copy on the
observer (`HeatVent.seen`), written up as an explicit rule at the bottom of
`comp/recipe.js`. Eight lines, no dispatch, determinism intact.

What it cannot do: **carry a payload**. "A craft finished" is expressible; "a
craft of 1.4 kg of tin finished, at this position" is not. Where a payload is
needed I used a bounded queue with exactly one drainer (`Emitter.queue`) — and I
will say plainly that *that is a one-hop event channel*. It is only not a bus
because ownership is 1:1, which `assemble()` enforces by refusing two providers
of a slot. The tripwire is a second drainer, and I know where it is: DESIGN item
17's suspicion meter wants to observe every item crossing a depth threshold, and
no host owns that. The honest answer there is a per-step journal in `sim/step.js`
— which is a bus, scoped to one file, with one reader. So: slots held, and I can
see the requirement that ends them.

**4. `grep` is genuinely worse and I could only partly fix it.** Four
mitigations, honestly ranked in `sim/explain.js`: named tick functions
(`recipeTick`, not `Object.tick`, so stack traces and profiles name components —
free, and I would ship it in any component design); a
`PROVIDES/NEEDS/PERSISTS/TUNABLES` header on every `comp/` file, so
`grep -A2 "PROVIDES: heat"` answers the question the slot graph makes important;
the full slot graph as a comment in `comp/index.js`; and `explainHost()`, which
dumps tick order, wiring and the exact recipe stall reason.

What remains: those make the **static** structure greppable. Nothing makes the
**dynamic** path greppable. You still cannot discover by reading that `Recipe`
pushing into `Emitter` is what makes an ingot appear in the world — you have to
know the slot names. And the `comp/index.js` graph is hand-maintained, so it can
go stale; `explainHost()` is generated from the live object, which is why the
comment says to believe the function. Needing that function at all is, as the RFC
says, an admission.

**5. The `$s` binder is greedy and I left it that way.** `bindAll` takes the
first matching stack. With one hole and two-clause recipes that is exact; with
copper *and* tin in a buffer and a recipe whose second clause needs the other
element, it can refuse a craft that was satisfiable. Fixing it is backtracking
search. No row in `RECIPES` needs one, so the failure is documented at the point
of failure in `sim/match.js` rather than solved.

**6. Where the belts go is still unanswered.** 2,000 conveyor tiles as hosts
with parts is ~16,000 objects — the wrong side of the object boundary by an order
of magnitude. They belong in `world/tiles.js` as arrays, which means a second
paradigm sitting next to the first, exactly as RFC 02's weakness 3 predicts. I
did not build it and I did not pretend it away; the statement is in
`world/tiles.js`. This build shows both sides of the boundary (~49,000 tiles and
~49,000 heat cells as typed arrays; ~20 machines, 2 actors and ~400 items as
objects) and states the rule, but the rule has to be re-argued every time
someone wants per-tile state, which is 02's weakness 4 and is still true here.

**7. Items sit awkwardly on the boundary.** An item has identity (it has a
position and can be caught) but no parts. Making it a host costs a slot table
and a parts array per item, 400 times, to reuse `Body`. I made items plain
records with a fixed shape and gave `sim/step.js` its own three-line integrator
— which reintroduces, in miniature, exactly the two-integrators problem the RFC
claimed component reuse would delete. Flagged in place.

## Faithfulness

Faithful to RFC 02 on everything the experiment is testing: object-literal
components with `make(params)` returning per-host state, components owning their
own `tick`, `provide`/`need` named slots, `assemble()` resolving slots to direct
references at assembly, deterministic topological tick order, table typos
throwing with the identifier you typed, no `class`/`extends`/`new`, the
substance × form model with one `$s` binding, treatments-as-data, `createWorld(cfg)`,
mining on a `Pick` component, the field with an active set, the hash grid, and
the ~10³ object boundary with both sides present.

Declared deviations:

1. **`assemble(table, typeId, at, world)`** takes the table as its first
   argument, where the RFC hard-codes `MACHINES`. This is what lets the player
   and monsters be rows in `data/actors.js` assembled by the same function, and
   it costs one parameter. It also returns `{ host, err }` instead of calling
   `toast()`, because `sim/` should not talk to the HUD.
2. **Every component must declare `persist` or `save`/`load`**, enforced in
   `assemble()`. Not in the RFC — added because the review's item-3 critique is
   correct and this is what makes it a boot error rather than a shipped bug.
3. **`sim/tables.js` makes validation eager**, where the RFC validates at
   placement. A machine nobody has placed is exactly the row a newcomer edits,
   so lazy validation misses the cold-open case. It also holds the
   `hot`-needs-`heat` join described above, which the mechanism cannot express.
4. **`sim/tunables.js`, `sim/run.js`, `data/cycles.js`, `data/boons.js`,
   `sim/boons.js`** are all additions. The RFC contains no tunable store and no
   run structure; those are the review's items 8 and 2.
5. **`render/looks.js` is keyed by a `look` string**, not by machine id as the
   RFC's `render/sprites.js` is. Taken from the review's suggestion (RFC 06's
   Bridge idea): it lets `winch` and `bloodWinch` share art, so a boon machine
   can need no art at all.
6. **`sim/explain.js` exists as a text function**, where the RFC proposed a
   debug overlay. Same admission, no rendering.
7. **Not built, deliberately** (and the RFC's weakness 6 says so): `FluidPort`,
   a water field, `IDENT` interning. `Burner` shipped because it has two
   consumers.
8. **Recipe rows carry an `id`.** The RFC's rows have only a `tag`. A save must
   name an in-flight recipe stably, and a pool index would break when rows are
   reordered.
9. **No dependency/layer checker.** The review recommends bolting on 04's
   `tools/layers.mjs`; my brief assigns that to another prototype, and adopting
   it would blur the comparison. Not present, by instruction.

## Is this better than `src/` as it stands?

On comprehensibility: `src/sim/structures.js` today is 92 lines: one `FURNACE`
constant, a `placeFurnace()`, and a 46-line `updateStructures()` with the catch
box, the recipe, the fire and the emit interleaved. Adding a crusher means a second
`placeX` and a second branch in the update loop. Here the crusher is a table row
and the kiln is a table row copied from it. Against that, "why did the furnace
stop" went from 46 contiguous readable lines to a row, four component files and
a slot graph — which is the trade, and it is why `sim/explain.js` exists.

On future coverage: `paint.js:127`'s `if (M.id === 'copper')`, `hud.js:57`'s four
hardcoded substances, `WORLD_TW` as a module constant, mining progress in the
tile store, and every player tunable as `export const` are all gone by
construction rather than by discipline. The last of those is the one that
unblocks a third of DESIGN's reward economy.
