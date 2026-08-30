# A — slots and layers

RFC 04's layering and enforcement, organised around RFC 02's named slots, with
one promotion: **the named slot is the primary organising principle**, not one
feature of a component system.

Everything connects through a slot. The furnace, the crusher, the kiln, the
winch, the blood winch, the heat field and the tunable store are all wired the
same way, and the property the reviewer called "the strongest single argument in
the whole document set" — that `Burner` and `BloodBurner` provide the same
`heat` slot from unrelated sources and no consumer can tell — is the mechanism
the architecture is built on rather than a bonus that falls out of it.

51 files, 2,442 lines including comments; the comments are roughly a third of it.
`tools/layers.mjs` is 297 lines, of which ~60 are RFC 04's direction check and
the rest is the resolution pass.

```
prototypes/A-slots-and-layers/
  README.md
  tools/
    layers.mjs      the build gate: dependency direction + name resolution
    epoch.mjs       proves render() does not touch the model
    smoke.mjs       exercises the six factual claims this README makes
  src/
    core/           rng.js  color.js  pixels.js
    data/           slots.js  parts.js  substances.js  recipes.js  machines.js
                    tunables.js  trinkets.js  bands.js  palette.js
    model/          slots.js  machines.js  world.js  tiles.js  mining.js  items.js
                    fields.js  run.js  player.js  mods.js  space.js  journal.js
                    epoch.js
    rules/          machines.js  mining.js  player.js  items.js  fields.js  place.js
      parts/        footprint.js  buffer.js  catchbox.js  handfeed.js  recipe.js
                    emitter.js  burner.js  bloodburner.js  hotservo.js
                    heatemit.js  deck.js
    view/           paint.js  treatments.js  hud.js  overlays.js
    shell/          main.js  boot.js  schedule.js  input.js  audio.js
```

The layers, and the only legal direction of dependency:

| layer | may import | holds |
|---|---|---|
| `core` | `core` | arithmetic. No game concepts. |
| `data` | `core` `data` | frozen tables. Every value a literal or a selector string. |
| `model` | `core` `data` `model` | plain state records + `write` namespaces. No methods on records. |
| `rules/parts` | `core` `data` `model` | one free function per capability. May not import each other. |
| `rules` | `core` `data` `model` `rules/parts` | `step(dt)` drivers. May not import each other. |
| `view` | `core` `data` `model` | drawing. May not name a model `write`. |
| `shell` | anything | loop, boot, input, audio device. Nothing may import it. |

`node tools/layers.mjs` enforces every row of that table plus
seven groups of resolution checks (labelled (a)-(g) in the file), and exits 1
on a violation. It currently reports:

```
  ok   51 files, 142 import edges
  ok   dependency direction clean (0/0)
  ok   6 slots, 11 parts, 5 machines, 10 substances resolve
```

---

## Reading order

Five files, in this order. Nothing before them.

1. **`src/data/slots.js`** — the six slot names, each with its record contract
   (`fields`), the subset the provider writes every tick (`out`), and its
   mutating verbs (`ops`). This is the whole architecture in 96 lines. The
   comment at the top states the one consequence everything else depends on: a
   consumer never learns which part filled the slot.
2. **`src/data/parts.js`** — the eleven capabilities, each a row saying which
   slots it provides and needs. Read `Burner` and `BloodBurner` next to each
   other.
3. **`src/data/machines.js`** — the five machines, each a parts list. You can
   tell what a machine does from its row without opening another file. Read the
   `winch` and `bloodWinch` rows next to each other; the diff between them is
   the point of the design.
4. **`src/rules/parts/recipe.js`** — the only recipe engine. It names no
   machine, no substance and no number, and its two optional slots (`heat?`,
   `servo?`) are where the design pays.
5. **`src/rules/machines.js`** — the driver: the table binding part names to
   part functions, and a nine-line `step`. After this the shape of the whole
   sim is known.

Then, if you are changing content: `data/substances.js`, `data/recipes.js`,
`data/tunables.js`. If you are changing behaviour: the file in `rules/parts/`
named after the part. If you are wondering what is allowed:
`tools/layers.mjs`'s `MAY` table.

---

## Adding a substance

`tin` was written last, and it touched **one file, one row**:

- `src/data/substances.js` — the `tin` row (the last row in the file).

That one row bought: a mineable tile at `hard: 1.10`; a carryable item with a
mass; a HUD swatch at pocket order 7; three paint treatments; a `gen` block
worldgen will place; acceptance by the crusher and by the furnace (both via
`'#ore'`); and **a tin ingot out of the furnace with no edit to the furnace
row**, because the smelt recipe's output is `'@smeltsTo'` and tin's row declares
`smeltsTo: 'ingot'`.

Verified: `node tools/smoke.mjs` puts 2 tin and 1 timber in the furnace's buffer
and prints `furnace produced 1, items on the ground: ingot`.

**Two honest caveats.**

- Tin needed no palette entry because it reuses the iron greys (`irA`, `irB`,
  `irD`, `limeA`). A substance wanting a new hue costs three names in
  `data/palette.js` — a second file, same layer, no engine code.
- The claim "one row" is only true because `'@smeltsTo'` exists. RFC 04 as
  written has no output-side selector, so tin would be swallowed by the
  furnace's `'#ore'` port into a buffer no recipe consumes, and accumulate
  forever. That is the ~10 lines the reviewer priced; they are in
  `rules/parts/recipe.js` (`outputs()`) and in `tools/layers.mjs`, which fails
  the build if a substance matching an `'@field'` recipe's tag does not declare
  the field:

  ```
  data/recipes.js 'smelt': substance 'tin' matches '#ore' but declares no
  'smeltsTo', so it would be consumed and produce nothing
  ```

  That message is real output, produced by deleting `smeltsTo` from the tin row
  and running the tool. It is the silent trap the review found in both RFC 04
  and RFC 06, closed statically.

---

## Adding a machine

The kiln (`2 gravel -> 1 brick`, and it bakes) was written last, by copying the
crusher row. It touched **four files: three content rows and three palette
names.** Counting honestly:

| file | edit | avoidable? |
|---|---|---|
| `src/data/substances.js` | the `brick` row | no — brick is a new substance |
| `src/data/recipes.js` | the `bake` row | no — a new production verb |
| `src/data/machines.js` | the `kiln` row | no |
| `src/data/palette.js` | `brickA/B/C` | **yes** — reuse `cuC`/`cuD` and this file is untouched |

Zero engine files. Nothing in `model/`, `rules/`, `view/`, `shell/` or `tools/`.
Everything the kiln needed already existed for something else: `Burner` for the
winch, `CatchBox` and `Emitter` for the furnace and crusher, `HeatEmit` for the
winches. `grep -rn kiln src/` finds one row in `data/machines.js` (plus prose in
comments).

The kiln row, in full:

```js
{ id: 'kiln', name: 'KILN', tw: 2, th: 2,
  parts: [
    ['Footprint', { footing: 2 }],
    ['Buffer',    { cap: { gravel: 6, '#fuel': 2 } }],
    ['CatchBox',  { mouth: 'top', slack: 2, accepts: ['gravel', '#fuel'] }],
    ['Burner',    { fuel: '#fuel', secs: 8 }],
    ['Recipe',    { tag: 'bake' }],
    ['HeatEmit',  { field: 'heat', rate: 30 }],
    ['Emitter',   { at: 'bottom', vy: 10 }]
  ],
  look: { body: 'brickB', trim: 'brickA', base: 'brickC', fire: true,
          pips: [{ sel: 'gravel', row: 0 }, { sel: '#fuel', row: 1 }] } }
```

"Bakes" is a first-class concept here rather than a recipe ingredient: the
`bake` row declares `heat: 0.2`, the `Burner` part supplies it from any
`'#fuel'`, and fuel burns over *time* rather than being consumed per output —
which matters, because DESIGN item 1 is about fuel burned at the lifter and RFC
04's `'#fuel':1` recipe input quietly models a different mechanic.

**Where a typo lands.** All five of these are real tool output:

```
data/machines.js kiln: unknown part 'Burnr'
data/machines.js kiln.HeatEmit: needs slot 'heat' and no part provides it
data/machines.js kiln: recipe 'bake' requires heat and this machine has no heat provider
data/substances.js brick: unknown treatment 'glowe' — add a row to view/treatments.js
data/recipes.js 'bake': gates on field 'water' which no band in data/bands.js declares
```

Note the second and third lines: mistyping `Burner` does not just report the
typo, it reports the two *consequences* — `HeatEmit` loses its input and the
`bake` recipe becomes unreachable. A machine that would silently never run is a
build failure.

**Adding a new capability is the expensive path, and it is three files.** If the
kiln had needed something no part provides, the cost is: a row in
`data/parts.js`, a file in `rules/parts/`, and one line in the `PART_FN` table
in `rules/machines.js`. Forgetting either of the last two throws at import,
naming the part. RFC 02 charges one file for this; see *What fought me*.

---

## The blood winch

CLEAN, and it is one row.

```js
{ id: 'winch', name: 'WINCH STAGE', tw: 2, th: 3,
  parts: [ ['Footprint', {…}], ['Buffer', {…}], ['CatchBox', {…}],
           ['Burner', { fuel: '#fuel', secs: 6 }],
           ['HeatEmit', {…}], ['Deck', { span: 96 }] ] },

{ id: 'bloodWinch', name: 'BLOOD WINCH', tw: 2, th: 3,
  parts: [ ['Footprint', {…}],
           ['BloodBurner', { secs: 6, hearts: 1 }],
           ['HeatEmit', {…}], ['Deck', { span: 96 }] ] }
```

The complete diff: `Buffer` and `CatchBox` deleted, because health is not an
item and there is nothing to catch; `Burner` replaced by `BloodBurner`.
`HeatEmit` and `Deck` are carried over verbatim and both keep working — the deck
ascends on blood, and the winch still warms the shaft it stands in.

Why it costs nothing: `rules/parts/deck.js` asks the heat slot exactly one
question, `need.heat.hot`, and it has no way to ask what filled it. Neither does
`rules/parts/recipe.js`, so blood can bake bricks. Untouched by this feature:
`model/machines.js` (assembly is generic over parts), `model/slots.js` (`heat`
has no ops), `data/substances.js` (**health does not become a substance**),
`data/recipes.js`, `view/`, `shell/`, `tools/`.

`rules/parts/bloodburner.js` is 51 lines, 22 of which are the comment explaining
what it does not touch.

Verified: `node tools/smoke.mjs` prints

```
   winch      deck 32.9px  heat.hot=true  (fuel: timber)
   bloodWinch deck 31.5px  heat.hot=true  (fuel: hearts 3 -> 1, 4 paid)
```

**One limit worth naming.** `BloodBurner` declares `needs: []`, so it has no
buffer and no footprint of its own, which means it cannot draw a fuel gauge or
throw sparks from a mouth. That is correct — there is no fuel and no mouth — but
it means `host.look.fire` and the row's `cursed: true` flag are the only signal
the player gets that they are being drained. Whether that reads clearly enough
is a design question; the architecture has nothing to say about it.

**A limit that is architectural.** A slot holds exactly one record
(`model/machines.js` throws on a double-provide). So a machine cannot have two
heat sources — a hybrid winch that burns timber *and* blood is not expressible
without introducing a multi-slot (`heat[]`), which would change the shape of
`need` for every consumer. Five independent lift stages are five machines, so
CLAUDE.md invariant 4 is unaffected; but DESIGN's "cooling tower plus burner"
shapes should be checked against this before committing.

---

## Tunables

`data/tunables.js` is the answer to DESIGN item 8, the row the reviewer found
all six RFCs had missed. The rule is blunt: **if a boon might change it, it is a
row in that table and nowhere else.** There is not one numeric literal left in
`rules/player.js`.

The worked example, four files, none of them engine code:

```js
// data/tunables.js
'walk': 60,

// data/trinkets.js
{ id: 'winged_sandals', name: 'WINGED SANDALS', god: 'hermes',
  mods: [{ tunable: 'walk', mul: 1.15 }] },

// anywhere in rules/  (here, rules/player.js)
player.vx = (c.right - c.left) * stat('walk');

// when the boon is drafted, in shell/ or rules/director.js
write.grant('winged_sandals');
```

`model/mods.js` keeps modifiers **by source id**, so three trinkets touching
`walk` compose and any one of them can be revoked exactly. Base values are never
mutated, so `data/` stays frozen and diffable.

Scoping is what keeps the table small. `stat(name, scope)` multiplies the
unscoped stack by a scoped one, so "kilns 50% faster" is
`{ tunable: 'machine.rate', scope: 'bake', mul: 1.5 }` and **adding the kiln
added no tunable row**. The same mechanism carries material hardness
(`stat('mine.hardness', 'granite')` — Gaia's Patience softens granite alone) and
machine rates (`secsFor(row.secs, row.tag)` in `rules/parts/recipe.js`).

Verified output:

```
   walk base                 60
   + winged_sandals x1.15    69.00
   + thinned_ichor x1.30     89.70   fall.safe 120
   - winged_sandals          78.00
   forge_bellows scoped:     bake 1.5, smelt 1
```

Two checks keep it honest, both real tool output:

```
rules/player.js: stat('climbb') — no such row in data/tunables.js
data/trinkets.js forge_bellows: scope 'baek' is neither a recipe tag nor a
  substance id, so this modifier can never apply
```

The second one matters more than it looks: a mis-scoped modifier is otherwise
completely silent — the boon is granted, the HUD shows it, and it does nothing
for the rest of the run.

---

## What I stubbed

Leaves only. Nothing structural.

| stub | file | why |
|---|---|---|
| `R()`, `drawText()` | `core/pixels.js` | two-line canvas calls. Stubbing them keeps `view/` importable in Node, which is what lets `tools/epoch.mjs` run a real render. |
| crack geometry | `view/paint.js` | art. |
| field overlay draw | `view/overlays.js` | art. The seam — an overlay stage that exists at all — is the part being evaluated. |
| field diffusion | `rules/fields.js` | out of scope by instruction. Storage, the active set, `add`/`drain`/`at` and the recipe's `field` gate are all real. |
| swept AABB integrator | `rules/player.js`, `rules/items.js` | a correctness matter, not an architecture one. |
| worldgen | `shell/boot.js` | out of scope. `gen` blocks on substance rows are real and are what a generator would iterate. |
| aim | `rules/mining.js` | one line of trigonometry. |
| bucket grid | `model/space.js` | `near()` is linear. The seam is that every part goes through it. |
| audio synth | `shell/audio.js` | out of scope. The journal drain and the mapping table are real. |
| input listeners | `shell/input.js` | out of scope. |

Not stubbed, and load-bearing: `data/` entirely, `model/slots.js`,
`model/machines.js` (assembly, rewiring, snapshot/restore), `model/mods.js`, all
eleven `rules/parts/`, `rules/machines.js`, `tools/layers.mjs`.

Also out of scope by instruction and therefore absent: the tutorial state
machine, `rules/director.js` (tribute cycles), monsters, the lift's cargo
handling beyond the deck's motion.

---

## What fought me

The commission asked one question above all others: does splitting each RFC 02
component into a frozen row in `data/`, a plain record in `model/`, and a free
function in `rules/` preserve 02's slot ergonomics or destroy them?

**Answer: preserved for readers, taxed for writers, and improved in two places
I did not expect.** In detail, worst first.

**1. Adding a new capability went from one file to three places, and that is the
real cost.** In RFC 02 a component is one file containing its parameters, its
state and its behaviour; you write it and add its name to one registry. Here it
is a row in `data/parts.js`, a file in `rules/parts/`, and a line in the
`PART_FN` table in `rules/machines.js`. Criterion 3 calls "what happens when you
need a behaviour nothing else has" the only genuinely contested axis, and on that
axis this composition is measurably worse than 02 alone: three edits in three
directories against one file plus a registry line. Both failures throw at
import, naming the part, so it is not *dangerous* — it is friction, charged every
time the vocabulary grows. Adding *content* is unaffected, and content edits
outnumber capability edits heavily, which is why I think the trade is right; but
it is a trade, not a free lunch.

**2. The record is one flat namespace, so a part's parameters and its live
outputs can collide.** `HotServo` wants `defaults: { mult: 1.38 }` because
`mult` is what the number means to an author — but `mult` is also the `servo`
slot's output field, and the merge order is slot fields, then `state`, then
`defaults`, then the machine row's params. The parameter would overwrite the
field's initial value and then the first cold tick would overwrite the parameter.
This cannot happen in RFC 02, where the parameter lives in the `make(p)` closure
and the output on `this` — two namespaces. My resolution is a naming rule
(`boost` in, `mult` out), split `fields` into contract-plus-`out` in
`data/slots.js` so the rule is expressible, and a check in `tools/layers.mjs`.
Cost: one concept more in the slot table, and a rule to remember. The note is
preserved in `rules/parts/hotservo.js` at the point of failure. This is the
clearest single place where the split made slots less pleasant to write.

**3. Three parallel structures where 02 had one.** 02's `assemble()` produces
one thing: a host whose `slots` map points at live components. Here I need
`host.parts` (the serialisable state), `host.slots` (the index), and
`host.wired` (the resolved `need` maps in tick order), because putting resolved
references inside the records would make them cyclic and destroy the property
I was buying. `rewire()` is ~50 lines that RFC 02 does not need. It is
mechanical and only assembly touches it, but "read one file to understand a
machine" now means reading `assemble` *and* `rewire`.

**4. Reading a field is not the same as calling a method, and the difference is
tick order.** In 02, `this.heat.hot()` is computed when asked. Here
`need.heat.hot` is whatever the provider last wrote, so correctness depends on
providers ticking before consumers. `rewire()` sorts by slot dependency and
`tools/smoke.mjs` prints the resolved order, so it is deterministic and
inspectable — but an invariant that used to be carried by the call is now
carried by a sort function, and a future part that both provides and consumes
the same slot would need a cycle error rather than just working. There is one
visible symptom: `Emitter` provides `emit` so it ticks *before* `Recipe`, which
means finished output appears one frame late. Deterministic, harmless, and
slightly wrong-feeling. (02's topological sort has the same property.)

**5. "`rules` may not import `rules`" is not true as RFC 04 states it, and I had
to weaken it.** A machine driver must know the part functions, so something must
import eleven modules that all live in `rules`. My resolution is a sub-layer:
`rules/parts/*` sits *below* `rules/*`, may not import each other, and is
dispatched from a table in the one driver that binds it. The `MAY` table says so
explicitly and the checker enforces it. This is strictly weaker than 04's
headline claim, and I would rather state it than let the table imply otherwise.

**6. The sibling rule pushes shared helpers into `model` as state, which is
04's own weakness 2 and I felt it.** `view` may not import `rules`, so the crack
overlay cannot call `crackAt()` in `rules/mining.js`; it reads
`progressAt()` from `model/mining.js` instead. Correct, and it is exactly what
stopped `view/paint.js` from reaching the gameplay table — but the general effect
is that anything two layers want becomes state in `model`, and `model/` is
already 13 files, most with a `newRun()` reset obligation. `shell/boot.js` lists
eight allocate/reset calls by hand. That will drift; the fix is RFC 01's
`resetTo(run, SCHEMA)`, which I did not build.

**7. One real bug the split caused, found by running the code.** A band row
declares `fields: ['heat']` (a list of *names*) and `write.allocate` builds the
band record with `{...cfg}` and then set `fields` to the allocated *storage*.
Same word, two meanings, silently overwritten. It threw on the first boot. Fixed
by naming them differently (`fieldNames` vs `fields`). The general hazard is
that spreading a frozen `data` row into a mutable `model` record makes every row
key a reserved word in the record, and nothing checks for that. Worth a rule I
have not written.

**And the two improvements, which I did not anticipate.**

- **The blood winch got *cleaner*, not just as clean.** Moving a slot's verbs
  from the provider's methods to `model/slots.js`, keyed by slot name, means two
  providers of `buffer` cannot disagree about what `take` means, and a consumer
  holding a record needs nothing from the provider at all. In 02 the contract is
  duck-typed; here `data/slots.js` declares it and the tool checks both
  directions. Promoting the slot from a component feature to the organising
  principle is what made that possible.
- **RFC 02's weakest DESIGN cell is fixed.** Item 3 (saves) is AWKWARD for 02
  because its components hold methods and resolved cross-references
  (`this.buf = host.slots.buffer`), so snapshotting needs every component to
  declare its persistent fields. Here `host.parts` is plain records and
  everything else is rebuilt by `rewire()`, so a save is
  `{ id, def, tx, ty, parts }`. Verified: `tools/smoke.mjs` round-trips four
  live machines through `JSON.parse(JSON.stringify(...))` and the kiln's output
  count survives.

**Speculative generality I am willing to be marked on.** The `servo` slot has
one provider (`HotServo`) and one consumer; I kept it because CLAUDE.md
specifies the servo as a mechanic and because a boon's rate modifier is the
obvious second provider, but it is the thinnest slot in the table.
`data/bands.js` has three rows and only one is used. `model/space.js` is a seam
around a linear scan.

---

## Faithfulness

Declared deviations from the two source RFCs, in descending order of size.

**From RFC 02.**

1. **No `class`, no `this`, no closures.** Components become `data/parts.js` +
   plain records + free functions. This is the commissioned change, and its
   consequences are section 1–4 above.
2. **Slot verbs moved from the provider to the slot** (`model/slots.js`). RFC 02
   puts `put`/`take` on `Buffer`'s instance. Deviation, and an improvement — see
   above.
3. **`substance × form` dropped for flat substances.** The brief lists `ingot`,
   `gravel` and `brick` as substances, so I followed the brief. The
   consequence is that 02's `$s` binding becomes `'@smeltsTo'` — a field read on
   the bound substance rather than a form substitution. Same one-row property,
   less expressive: 02's `FORMS` gives you `tin ingot` distinct from
   `copper ingot` for free, and here both smelt to the same generic `ingot`. If
   DESIGN item 4's five refinement tiers need per-substance identity at every
   tier, `forms` should come back, and it composes cleanly with everything here.
4. **`IDENT` interning dropped**, per the reviewer (premature at 400 items).
   `item.mod` is `null` until an item deviates.
5. **`FluidPort` not built.** 02's own weakness 6 says it should not ship before
   a second consumer. The `fluidIn` seam is a recipe `field` clause instead.
6. **`wants()` reduced.** `HandFeed` iterates the recipe pool's input selectors
   directly rather than running 02's candidate-expansion inference. Less clever,
   same behaviour for the content that exists.
7. **`Burner` kept, against 02's own advice**, because it has three consumers
   here (kiln, winch, blood winch) rather than zero.

**From RFC 04.**

1. **`rules` may not import `rules` is weakened to a sub-layer rule.** Section 5
   above. This is the most significant deviation from 04.
2. **Inline `boost:(m, api) => …` functions in `data/` removed**, per the
   reviewer, replaced by the named `HotServo` part. 04's own weakness 1
   identifies inline functions as the hole in its checker.
3. **The output-side recipe selector added** (`'@field'`). Without it 04's
   benchmark 1 is false. Section *Adding a substance*.
4. **`model/world.js` is a Map of bands, not a mutated singleton.** 04 is
   AWKWARD on DESIGN item 18 for exactly that reason. The price is that every
   tile and field query takes the band record as its first argument — one extra
   parameter everywhere, paid on every call site forever. I judged item 18
   (Tartarus, a third act reached by descending) worth it; if the owner disagrees
   the singleton is a smaller codebase.
5. **`model/mining.js` is a `Map`, not a `Float32Array`**, per the reviewer:
   196 KB resident to hold three numbers.
6. **The resolution pass is much larger than 04 describes.** 04 promises "every
   treatment name, recipe substance, tag, port field and palette key resolves".
   `tools/layers.mjs` also checks slot contracts, part/slot satisfaction per
   machine row, parameter/output-field collisions, `stat()` call sites against
   `data/tunables.js`, trinket scopes, unreachable heat recipes, and `'@field'`
   outputs against every substance the input tag matches. That last one is the
   check whose absence made both 04 and 06 fail benchmark 1 silently.
7. **`LAYER_BUDGET` kept as an env var** but it is 0 and there is nothing to
   ratchet — this is a new tree, not a migration. Left in because it costs two
   lines and the migration is the real project.
8. **04's `data/tuning.js` is `data/tunables.js` and does a different job.** 04
   uses it for render budgets; here it is the modifier store's base table, which
   is the reviewer's R2.

**Not from either RFC, and declared as additions:** `data/slots.js` and
`data/tunables.js` / `data/trinkets.js` / `model/mods.js`. Neither source RFC has
a slot vocabulary as a first-class table, and neither has any tunable store at
all.
