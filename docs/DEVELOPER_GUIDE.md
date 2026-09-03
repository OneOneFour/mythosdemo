# Developer guide

**Draft — pending review.** Synthesised from design-rationale prose currently
living in `src/` comments (see `docs/COMMENT_AUDIT.md`). Once accepted, the
source blocks marked `3` in that audit get replaced with one-line pointers into
this file.

Read `ARCHITECTURE.md` first. That file states the rules; this one tells you how
to get a specific job done inside them. `docs/SPEC.md` holds the locked numbers,
`docs/DESIGN.md` the game reasoning.

Every pattern below has a canonical example already in the repo. Copy the
example; do not re-derive the pattern.

---

## Contents

- [Before you start: which layer, which file](#before-you-start)
- [Adding a substance](#adding-a-substance)
- [Adding a form](#adding-a-form)
- [Selectors](#selectors)
- [Adding a recipe](#adding-a-recipe)
- [Hand-recipe declaration order](#hand-recipe-declaration-order)
- [Adding a machine](#adding-a-machine)
- [A machine is a held item](#a-machine-is-a-held-item)
- [Mirrored machine pairs](#mirrored-machine-pairs)
- [Variants are nearly free](#variants-are-nearly-free)
- [Charges and honest fuel](#charges-and-honest-fuel)
- [Non-item inputs](#non-item-inputs)
- [Light emitters](#light-emitters)
- [Placed miners](#placed-miners)
- [When a machine needs its own rules module](#when-a-machine-needs-its-own-rules-module)
- [The four gift tiers](#the-four-gift-tiers)
- [Tools are relic substances](#tools-are-relic-substances)
- [The tunable pipeline](#the-tunable-pipeline)
- [Notification and the journal](#notification-and-the-journal)
- [Bands and worldgen](#bands-and-worldgen)
- [Colour and appearance](#colour-and-appearance)
- [Where does state go?](#where-does-state-go)
- [Cross-module mutable state](#cross-module-mutable-state)
- [One decision, two readers](#one-decision-two-readers)
- [Duplication across a layer boundary](#duplication-across-a-layer-boundary)
- [Module-local perf caches](#module-local-perf-caches)
- [View cache invalidation](#view-cache-invalidation)
- [Pass order and darkness](#pass-order-and-darkness)
- [Record what you drew](#record-what-you-drew)
- [Widget primitives](#widget-primitives)
- [Input intents](#input-intents)
- [The frame context](#the-frame-context)
- [The frame loop and determinism](#the-frame-loop-and-determinism)
- [The rules order](#the-rules-order)
- [Buffers and pockets](#buffers-and-pockets)
- [Run state and RUN_SCHEMA](#run-state-and-run_schema)
- [Layer rules that will fail your build](#layer-rules-that-will-fail-your-build)
- [Checkers: what each one proves](#checkers-what-each-one-proves)
- [Writing tests](#writing-tests)
- [The test hook](#the-test-hook)

---

## Before you start

Two questions answer most placement decisions.

**Is it a number/query, or a decision/consequence?** `model` owns storage and
queries; `rules` owns decisions and their consequences. Storage has the lifetime
of the world; a decision has the lifetime of a frame. Mining progress is a
number that persists → `model/mining.js`. "Has this tile broken and what drops"
is a per-frame decision → `rules/mining.js`.

That split is not cosmetic. Progress once lived in the tile-storage module,
which is *why* it was a byte in the same array as the material, which made
granite (2.4 s) permanently unmineable above 106 fps — i.e. on any 120 Hz
display. See the header of `src/rules/mining.js`.

**Is it an element, or a shape an element takes?** A substance is an element.
Anything you can hold is substance × form. If a new thing has no element of its
own it is a *form* of the element it came from. A brick is fired copper gravel
and stays copper.

Then: **most requests are data changes.** If you are about to edit a `rules`
module to add content, stop and check whether a row can express it.

---

## Adding a substance

One row in `src/data/substances.js`. **Rows are append-only** — the index is
half the tile-id byte, so appending keeps every existing id (and therefore every
save) valid. Append at the end even when a thematic neighbour exists; see
`auger` (`substances.js:199`), appended last rather than beside `pick`.

Canonical examples:

| you want | copy |
|---|---|
| an ore | `copper` (`substances.js:64`) — and `tin` (`:81`) is the proof it costs one row |
| bulk rock | `stone` (`:108`) |
| a harder rock behind a tool gate | `granite` (`:177`) |
| a tool | `auger` (`:204`) |
| a trinket | `bellows` (`:126`) |
| a miracle | `chasm` (`:241`) |
| a machine item | the machine-substance block (`:264` onward) |

Row keys:

- `tags` — free strings. `#metal` in a selector means "any row tagged metal".
- `tile` — **present means the element can exist in the grid as native rock;
  absent means it never can. Absence is a declaration, not an omission.**
  - `hard` — **seconds** to break at pick power 1. Never a 0..255 byte.
  - `drops` — the *form* mining yields. The substance is always itself, which is
    why one `smelt` row covers every ore that will ever exist.
  - `tier` — optional, absent means 1. A **separate gate** from `hard`: `hard` is
    how long a legal swing takes, `tier` is whether a swing is legal at all.
    Monotonic against `hard` by convention and by `tools/content.mjs` assertion 9.
- `item` — present means it can be carried, in whichever forms permit it.
  - `mass` — base mass in talents; the form multiplies it.
  - `hud.order` — position in the pocket strip.
  - `tool` — optional `{tier, power}`. See [Tools are relic substances](#tools-are-relic-substances).
- `look` — appearance, and **nothing but `view/` reads it**. See
  [Colour and appearance](#colour-and-appearance).

Adding tin added **no** row to `forms.js`, `recipes.js` or `machines.js`. If
your new element needs a row in any of those, re-read
[Adding a form](#adding-a-form) — you may be adding a form, not an element.

A trinket, a miracle and a machine item all get a substance row for the same
reason: **they refine from nothing — the thing IS the element, singular and
unique.** They then cross into a *shared* form (`relic`, `phial`, `rig`), so the
tile-byte stride cost is paid once for the whole category rather than per god or
per machine.

Run `npm run check` — section 1b (`tools/content.mjs`) will tell you if the new
substance is unreachable, massless, or breaks tier monotonicity.

---

## Adding a form

One row in `src/data/forms.js`. A form is a *shape* an element takes.

- `subTags` — **which substance tags may take this form. This is the whole
  crossing rule** (`crossable()`, `forms.js:230`). `ingot` requires `metal`,
  which is why there is no stone ingot and no row anywhere saying so. `relic`
  requires `relic`, `phial` requires `miracle` — that separation is deliberate,
  so a miracle can never satisfy a `#relic` selector by accident.
- `massK` — multiplies the substance's base mass.
- `tags` — matched by selectors exactly as substance tags are. Pick these
  carefully: `plate` carries `refined`, so `press` had to select `#ingot`
  instead or a press would eat its own output (`recipes.js:177`).
- `tile` — present means a **placed** unit of this form is a terrain tile.
  `rung`, `stair` and `block` are the three that have one; placing a rung or a
  stair is how a ladder is built, and placing a block is how a hole is filled
  back in. `hardK` multiplies the substance hardness when placed. **A machine
  is not this** — see below.
- **A form is either feedstock or buildable, never both** (CLAUDE.md D12). A
  form with a `tile` block may not also be named by a recipe's `in:`, a
  machine's `handFeed.from`, or a tribute demand. `gravel` and `log` both
  broke that and both lost their `tile` block in Phase 14a; `block` and
  `rung`/`stair` are their buildable counterparts, reached through
  `recipes.js#pack` and `#peg_rungs`. `docs/SPEC.md` §19.
- `climbK` — optional per-form climb multiplier; only `stair` sets it.
- `hudOrder` — append rather than renumber.

Two traps:

1. **No `tile` block on `rig`, on purpose.** A machine is placed as a multi-tile
   *structure* through `rules/placement.js#placeMachine`, never as grid terrain.
   Do not copy `block`'s `tile` block onto a structure form.
2. **Mass conservation is linted.** `tools/content.mjs` assertion 6 caught
   `brand` at `massK:0.5`, because `kindle` turns one log into three brands and
   3 × 0.5 exceeds the log's 1.0 (`forms.js:111`).

Adding a form costs one byte of tile-id stride for every substance: at the
twelve forms shipped today the stride is 13, the highest packable ordinal
(`adamant`, 8) packs to 117 of 255, and `PACKABLE_LIMIT` is 18. The guard in
`data/forms.js` fails the build rather than wrapping silently.

**A form is the cheap thing here; a tile-capable substance is not appendable at
all.** `SUB.length` is already past `PACKABLE_LIMIT`, so appending a row with a
`tile` block throws at import — such a row must be *inserted* below the limit.
`docs/SPEC.md` §15 carries the arithmetic.

---

## Selectors

One grammar, one implementation (`forms.js:263`), so the machine interpreter,
the catch box and the resolver cannot disagree about what "any ore" means.

`subPart` `/` `formPart`, where each part is `*`, a bare id, or `#tag`. A
missing form part means "any form".

| selector | means |
|---|---|
| `*/#ore` | any element in any ore-tagged form (smelt's input) |
| `*/#fuel` | any element in any fuel-tagged form |
| `copper/ingot` | exactly copper ingots |
| `timber` | timber in any form |
| `#metal/gravel` | crushed metal, whichever metal |

`expand(sel)` returns every legal pair a selector covers. **Use it to prove a
selector is not empty** — an empty selector is the failure that lets a substance
pile up in a buffer no recipe consumes. Do not hand-roll a string check; that
mistake is recorded in CLAUDE.md and `tools/content.mjs:107` says so at the call
site.

---

## Adding a recipe

One row in `src/data/recipes.js`, or inline on a machine row. Both are the same
shape; `recipesOf()` resolves either. **Named** rows are for transformations
more than one machine performs; **inline** rows are for a machine's own private
behaviour (the lift's fuel row, the belt's, the brazier's).

```
in     { selector: units }
from   which data/sources.js row the inputs come from. Default 'buffer'.
needs  { field: { min, max } } gate on a scalar field at the machine.
secs   seconds per run at rate 1.0, before servo and the `rate` tunable.
out    output clauses, or [] to bank a charge instead.
         { sub, form, n }      literal output
         { subFrom, form, n }  the substance that satisfied the named input clause
hand   true if a PLAYER may also run this exact row
```

**The one smelt row.** `smelt` (`recipes.js:169`) covers every ore that will
ever exist because its input is a selector and its output takes the substance
from whatever satisfied that input. The mechanism: every `spend` through the
source api returns the concrete `{sub, form}` pair actually taken
(`rules/machines.js:62`), and `subFrom` names that pair's substance. Adding tin
needs no row here, and a tin ingot differs from a copper one automatically.

The reference prototype's defect: two ores both declared `smeltsTo:'ingot'`
against a single `ingot` row, so a tin ingot was byte-identical to a copper one.

**`hand:true` is a flag, never a second row.** Hand-crafting runs the *same
frozen object* a machine names, at the same `secs`, spending and producing
exactly what the machine would. A person can do a furnace's job, just not five
furnaces' worth at once. A duplicated row with different numbers would quietly
break that promise the first time someone tuned one and forgot the other. Two
checks assert the object identity: `tools/content.mjs` assertion 7 statically,
`tools/check.mjs:693` live.

`HAND_RECIPES` is derived once at the bottom of `recipes.js` so
`view/hud.js`'s CRAFT list and `rules/crafting.js#choose` cannot disagree about
which rows have the flag.

**Machine-build recipes** additionally gate on the grant tier: `model/run.js:380`
derives "is this recipe known" from the recipe's own `out` clause — a literal
`sub` in `rig` form whose substance resolves in `data/machines.js#M` names its
own gate by construction. A future machine-build recipe is covered with no edit
there.

---

## Hand-recipe declaration order

**`rules/crafting.js#choose` fires the first `HAND_RECIPES` row whose inputs are
fully held. First match wins; there is no menu.** So wherever a bigger bill's
condition holds, a smaller bill sharing the same materials is trivially also
satisfied — and the smaller one, if declared first, starves the bigger one
forever.

The rule: **declare the stronger (larger, more specific) bill first; the weakest
bill in the file must be last.**

The worked collisions, all recorded at their own rows:

| pair | resolution |
|---|---|
| `peg_rungs` / `kindle` — both fire off `timber/log` alone | `peg_rungs` requires **2** logs (not the planned 1) and is declared first. Holding 1 log falls through to `kindle`. (`recipes.js:197`) |
| `daedalan` / `auger` — identical input keys, 4 vs 1 logs | `daedalan` declared first. Holding 4+ yields a stair; 1-3 falls through to the auger. (`recipes.js:255`) |
| machine bills ⊃ ordinary recipes | the whole machine-build block is declared **before** `smelt`/`press`/`peg_rungs`/`kindle`/`daedalan`/`auger`, with a pairwise containment table at `recipes.js:52` |
| `hearth` (2 plate) ⊂ every other plate recipe | declared after every plate row, after even `auger` (`recipes.js:279`) |
| `pack` (5 `#bulk/gravel`) — no containment either way | declared **absolute last**, after `hearth`. Position is not forced by containment but by who loses the overlap: declared early it would starve `brazier`/`crank`/`gear`/`belt_r` for any player carrying 5+ rubble. See the row's own derivation. |

A tie that cannot be broken by quantity cannot be shipped at all: `kiln_divine`
has no build recipe precisely because its bill would be bit-identical to
`furnace`'s, and `choose()` would deterministically always produce the furnace
(`substances.js:333`). This is also why `belt_r`/`belt_l` share one substance
rather than getting two identical bills.

**Nothing checks this automatically.** `tools/content.mjs` is a content-graph
lint, not a hand-craft-priority one. When you add a `hand:true` row, check it
pairwise against every other one for input containment, and record the result in
the row's comment the way the existing rows do.

---

## Adding a machine

One row in `src/data/machines.js`. The interpreter that runs it,
`src/rules/machines.js`, contains **no machine name, no substance name and no
magic number** — every one of those is a literal in `data/`. If you find
yourself opening `rules/machines.js` to add a machine, you are in the wrong
file.

The full key reference lives in the header of `data/machines.js` and stays
there; that is the row's own documentation. What matters here is the shape of
the trade:

- **Adding a machine is adding values.** The interpreter never learns a new noun.
- **Adding a behaviour nothing has yet costs engine code** — a new key and a
  branch in the interpreter. That trade is deliberate: adding content happens
  constantly, adding unprecedented behaviour rarely.
- If the behaviour is not expressible as a key at all, the honest question is
  whether it wants a `rules` module of its own. See
  [When a machine needs its own rules module](#when-a-machine-needs-its-own-rules-module).

Copy the nearest row. `furnace` (`machines.js:112`) is the commented one, and
every machine is that shape with different literals.

Practical notes that are easy to get wrong:

- **Buffer caps carry twice the recipe's demand.** `smelt` spends 4 ore / 1 fuel,
  so the furnace caps at 8 / 2 — an asymmetric *cap*, not an asymmetric ratio of
  cap to demand (`machines.js:123`). `press` follows the same rule.
- **`recipes` are tried in order, and the order is the design.** The lift lists
  timber before hearts, so the winch behaves like an ordinary fuelled lift right
  up until you run dry (`machines.js:159`). That trap is row order, not a
  special case in the interpreter.
- **`servo` is what keeps buffers bounded.** Without it a small surplus reaches
  FULL over about twenty minutes (`rules/machines.js:241`).
- **`catchBox` is the thesis of the game in one flag** — material that falls in
  is free, so placing a machine under a vein beats placing it on the surface.
- **`footing` is checked per column under the whole footprint**, regardless of
  height, which is why `belt`'s `footing:4` at `th:1` needed no code change.
- **A `look` colour name that does not resolve fails at import**
  (`machines.js:497`), not at paint time with a black box at depth 300.
- **`look.sfx` may name an existing sound row.** No dedicated sound is a new
  machine's data to invent; `press` and `belt` both borrow `ignite`/`ingot`.
- Rows are append-only: the index is the id a save stores.

Then add its build recipe and substance — see below — and place it in
`data/grants.js` (`STARTING_MACHINES` or a `GRANTS` row).

---

## A machine is a held item

A granted machine is not a material bill spent at the moment of placement. It is
a **held `<machine-id>/rig` pair**, built by an ordinary `hand:true` recipe and
spent one unit at placement.

Four coordinated edits:

1. **`data/substances.js`** — one row, id reusing the machine's own id.
   `item.mass` is the machine's full bill summed via `model/items.js#massOfPair`
   (never hand-computed). No `tile` block, no `look.base/hi/lo`; only
   `look.item`, borrowing the machine's own swatches so a held machine reads as
   a smaller version of the thing it becomes. See the block at
   `substances.js:245`.
2. **`data/forms.js#rig`** — nothing to do; the shared form already exists. Do
   **not** give it a `tile` block.
3. **`data/recipes.js`** — a `hand:true` row producing exactly one
   `<id>/rig`, placed correctly in the declaration order (see
   [Hand-recipe declaration order](#hand-recipe-declaration-order)).
4. **`data/grants.js`** — the machine id in `STARTING_MACHINES` or a `GRANTS`
   row, or nothing will ever be able to place it.

The queries are already generic: `model/run.js#machineHeldSub` names which
substance a machine places from, `placementCheck` checks
`invCount(that, F.rig) > 0` after every structural refusal, and
`rules/placement.js#placeMachine` spends exactly one unit only once every other
check has passed — so a refused placement never touches the pockets.

`rules/placement.js#deconstruct` is the exact inverse: a machine proven **empty**
(`m.buf` has no keys and `m.charges === 0`) gives its own `rig` back as a
falling item. A machine still holding anything refuses with a reason, so nobody
discovers ore has vanished along with the machine holding it.

---

## Mirrored machine pairs

`belt_r`/`belt_l`, `talos_head`/`talos_head_l`, `cyclops_maw`/`cyclops_maw_l`.

Each `_l` row is a `variantOf` overriding only the facing key (`belt.dir` or
`mine.facing`). The pair shares **one** substance and **one** build recipe (the
base row's own id), and `model/run.js#machineIdFor` resolves the held pair to a
concrete machine id off `player.face` (±1) at the moment of placement — "aim
decides", the same rule mining already lives by.

Two reasons this is not optional:

- Two substances would need two hand recipes with a **bit-identical bill**, an
  unbreakable `choose()` tie that would starve one of them forever with no
  float-management workaround.
- Tile-byte stride economy: one substance row, not two.

`model/run.js:217` derives the mirrored set from that *shape* — `variantOf` plus
a `belt`-or-`mine` facing override — rather than a hand-maintained list, so a
future mirrored pair added the same way needs no edit there.

---

## Variants are nearly free

`kiln_divine` (`machines.js:145`) is the furnace row with four keys overridden: a
new id, a new name, a new look, and nothing mechanical at all. It is twice as
fast because `data/tuning.js` carries one line, `rate.kiln_divine: 2.0`.

Total cost of a variant: a six-line row plus one tuning row. No engine code
learned the word "kiln", and a `rate.furnace` trinket still stacks
multiplicatively on top without either knowing the other exists.

**Use `variantOf` only when nothing mechanical changes.** `press` is not a
variant of `furnace` despite the family resemblance, because it runs a
genuinely different recipe with a different input shape — it earns its own row
rather than hiding a second machine's worth of change inside `variantOf`
(`machines.js:203`).

Variant expansion is a **shallow** merge on purpose (`machines.js:478`): a
variant that wants to change one port restates the whole `ports` array, which is
legible where a deep array merge is not.

---

## Charges and honest fuel

A recipe with `out:[]` consumes its inputs and produces nothing liftable. It
banks a **charge** on the machine record instead (`rules/machines.js:196`).

Three machines use this identically — the lift stage, the belt, the brazier —
and nothing in the codebase can tell one machine's charge from another's, or a
charge bought with timber from one bought with a heart. That indirection is why
the blood winch needs no code of its own: the winch's second recipe pays a heart
for a charge, and `rules/lift.js` only ever asks whether a charge exists.

Consumers:

| machine | what a charge buys |
|---|---|
| lift stage | one turn of the drum, ascending only (`rules/lift.js:62`) |
| belt | exactly one item delivered off the belt's end (`rules/belts.js`) |
| brazier | keeps `m.running` true, which is what `light.whileRunning` reads |

For a fuel-charge recipe, `m.running` stays true for as long as the buffer holds
at least one charge's worth — so `light:{level, whileRunning:true}` means "lit
while fuelled" for free, with no new key.

---

## Non-item inputs

`src/data/sources.js` is **the one file in `data/` where a row carries code.**
Read the price note at the bottom of its header before adding a row.

A recipe input clause names its source with `from:`, defaulting to `'buffer'`:

```js
{ in:{ 'timber/log':1 } }         // from the machine's buffer
{ in:{ heart:1 }, from:'vital' }  // from the player's body
```

That one word is what makes a non-item fuel *content* instead of engine code.
`rules/machines.js` never learns where an input came from: it calls
`SOURCES[from].count(...)` and `.spend(...)`, and each row answers for itself.

`count`/`spend` are pure functions over an **injected narrow api** defined in
exactly one place, `rules/machines.js:47`. That object is the entire surface a
`data/` row may touch, which is what keeps `data` importing nothing. Adding a
line to it widens what content can reach, so the list is short on purpose and
every entry has a caller today.

Two subtleties:

- `buffered`/`pocketed` count the **largest single matching pair**, not the sum
  across pairs, because a recipe input is satisfied by one pair (a derived
  output takes its substance from the pair that satisfied it). Two copper ore
  and one tin ore do not smelt into one ingot of anything. Buffer *fullness* —
  what the servo and the HUD pips read — is the sum, and that is
  `model/machines.js#count`. Two different questions, two answers.
- `units:'named'` tells the interpreter the input keys are bare unit names, not
  selectors, which is why health is never mirrored into the inventory and the
  HUD keeps drawing five hearts.

Refusals that are properties of the *resource* live on the source row, not on
the machine: `vital` refuses to spend the last heart, so any future
blood-fuelled thing inherits that for free (`sources.js:63`).

**The price, stated plainly:** this file is not serialisable or diffable, and a
dangling reference inside one of these closures is invisible to
`tools/resolve.mjs`, which reads names and not bodies. Three rows is worth it.
Thirty would mean the architecture chose wrong.

---

## Light emitters

`light: { level, whileRunning }` on a machine row. `rules/light.js:86` reads it
exactly like every other interpreter key — **no machine name appears there.**

- `level` is a number, or the literal string `'max'`.
- `'max'` is a sentinel meaning "read `eff('lightMax')` at tick time". `data/`
  may not import `data/tuning.js` (only `model/mods.js` may), so a row that
  needs to *track* a tunable rather than state a constant says the word and lets
  the interpreter resolve it. Use this idiom for any future data row that needs
  a live tunable.
- `whileRunning` absent or false means the machine emits whenever it exists;
  true gates it on `m.running`.

`brazier` (`machines.js:325`) is fuelled and therefore `whileRunning:true`;
`hearth` (`:354`) has no `recipes` at all, so `m.running` never goes true and
its `light:{level:'max'}` with no `whileRunning` means "lit as long as it
exists" — a fixture that never expires.

`hearth` also carries an `in:{}` / `secs:Infinity` recipe that can never
complete. That exists **only** so the generic fire-glow look (gated on
`m.running`) reads as lit with no interpreter change. Do not mistake it for a
mechanic.

---

## Placed miners

`mine: { facing, tier, tiles, secs }`.

**The rate is not a row key at all.** `rules/machines.js:277` computes
`eff('pickPower') × bestHandToolPower()` — the exact same two numbers
`rules/mining.js#step` reads when a player swings. `bestHandToolPower` scans
every substance's `item.tool` block and never names the auger, so "mines at
exactly the T2 hand rate" is true by construction rather than because two
authors copied a literal.

Only two things vary between tiers:

- `tier` — the **gate**: which `tile.tier` it may bite at all, scaled by
  `eff('toolTier', <substance>)` exactly as a hand tool is.
- `tiles` — the **width**: how tall a face it reaches. Topmost unbroken tile
  first, so a taller face is reach, not simultaneity. Automation buys
  parallelism and nothing else.

`secs` is how many seconds of active chewing one buffered fuel unit lasts,
independent of any tile's hardness. A smaller `secs` is a **thirstier** machine,
not a faster one. Fuel drains with time spent chewing, never per tile broken.

`minDepth` keeps a machine out of reach until a shaft is deep enough. Derive it
from the strata rows of the material it is for, not from a round number — see
`cyclops_maw` (`machines.js:433`), and note the catch-22 it avoids: a machine
that can only be built from the one material it alone can mine could never get
built, so its bill is priced a tier shallower. `tools/content.mjs` assertion 14
keeps that a proven fact rather than an eyeballed one.

---

## When a machine needs its own rules module

The interpreter turns inputs into outputs. Two mechanics do not fit that shape
and each has its own sibling module instead of a new interpreter key:

- **`rules/lift.js`** — a stage moves a *position* vertically while charged.
- **`rules/belts.js`** — the same thing turned ninety degrees.
  `rules/belts.js:1` documents the reasoning: a belt turns a position into a
  later position with the *same* substance and form throughout, which is a shape
  `out` clauses cannot express and should not be made to.

Both still take their **power** through the ordinary interpreter — the honest-fuel
`out:[]` recipe — so the sibling module only ever spends charges the generic
`produce()` path banked.

The test for "does this need a module": can a key on a row express it, and would
that key have more than one user? If not, and the behaviour is positional or
otherwise not a transform, write the sibling module and state its place in
`shell/schedule.js`.

`rules` modules **may not import one another**. If your new module needs a
helper another rules module has, either re-derive it locally (see
[Duplication across a layer boundary](#duplication-across-a-layer-boundary)) or
push the shared part down into `model`.

---

## The four gift tiers

`docs/DESIGN.md` names four. All four are content-only additions; none has
tier-specific code beyond one small `rules` file.

| tier | data | rules | run state | what it changes |
|---|---|---|---|---|
| **Trinket** (passive) | `data/trinkets.js` | `rules/trinkets.js` | `run.inv` + `run.equipped` | a number, via `mods` |
| **Boon** (timed) | `data/boons.js` | `rules/boons.js` | `model/boons.js#active` | a number, for N seconds |
| **Miracle** (one-shot) | `data/miracles.js` | `rules/miracles.js` | `run.inv` | the world, once |
| **Grant** (machine) | `data/grants.js` | `rules/grants.js` | `run.granted` | what may be placed |

Shared idioms:

- **Every tier's `draftable()` returns the same shape**, so one draft panel can
  offer all four without knowing which is which — and so a debug key granting
  `draftable()[0]` repeatedly walks the whole table instead of handing out the
  same thing forever.
- **A gift arrives as a falling item, never a direct credit** (invariant 5).
  `rules/trinkets.js#grant` and `rules/miracles.js#grant` both toss it at the
  player's feet.
- **A missing id throws**, because `tools/resolve.mjs` has already proved every
  id in `data/` resolves. That is a programming error, not a content error.

**Trinkets and miracles are substances.** A trinket refines from nothing — it IS
the element — so `data/substances.js` gives it a row and `data/forms.js#relic`
is the one form it may take. "Does the player have it" is then exactly
`invCount(sub, F.relic)`, the same question asked of a lump of ore. A miracle is
the identical trick with `phial`, kept a separate form specifically so it can
never satisfy a `#relic` selector.

**`run.equipped` is a selection over `run.inv`, not a second list.** A
fixed-length array of substance ordinals (or `null`), capped by
`eff('trinketSlots')`. A modifier is active only on the **intersection** of
equipped and held. `run.trinkets` used to be a second inventory beside `run.inv`
and the two could disagree about whether the player had a thing; it was deleted.

**`step()` on the modifier tiers is a SYNC, not an event.** Both
`rules/trinkets.js#step` and `rules/boons.js#step` rebuild `model/mods.js`'s
rows from scratch every frame, looping the **content table** rather than the
active list. So losing a trinket turns its modifier off and empties its slot for
free, with no `unequip()` call anywhere needing to have been made; and an
expiring newer boon hands an older, suppressed one its true effect back with no
code needing to remember it was ever overridden.

**Boon conflicts.** `conflictsWith: [{ id, mode }]` — when both the named boon
and this one would be active, the **older** of the two (earlier in grant order)
is either `'suppress'`ed (its rows removed entirely) or `'invert'`ed
(`mul → 1/mul`, `add → -add`). Only a *later* boon may act on an earlier one.
The two shipped examples are the canonical reference:
`poseidon-flood` suppressing `hephaestus-forge` (`data/boons.js:50`) and
`ares-frenzy` inverting `athena-focus` (`:65`) — the second being a trap, since
a player holding both is worse off than holding neither.
`tools/content.mjs` assertion 10 lints these: never self-referential, and where
both directions are declared their modes must agree. One-directional rivalry is
accepted design, not a bug.

**Rows are keyed by source.** `rules/boons.js` keys every row `'boon:' + id`, so
the boon tier and the trinket tier can never remove each other's rows regardless
of which `step` runs first.

---

## Tools are relic substances

Not a new table. The stock pickaxe and the adamant auger are both ordinary
`relic`-tagged rows in `data/substances.js`, and `item.tool: {tier, power}` is
the only thing that marks one as a tool.

- `tier` is compared against a tile's `tile.tier` in `rules/mining.js`'s gate,
  scaled by `eff('toolTier', <substance struck>)` so a boon can lend a tier
  without touching mining speed.
- `power` multiplies `eff('pickPower')` in exactly the one place `hard` is also
  applied, so a trinket cannot be read around.
- `model/run.js#bestTool()` is a **straight scan of `run.inv`, not a cached
  field** — a field that can disagree with the pockets is a field that will.
  Ties keep the first found; content never ships two tools at one tier.
- `hasPick()` is `bestTool() !== null`, so any tool satisfies "may this player
  dig at all".

Adding a hand tool therefore raises every placed miner's rate the same day it
raises a swinging player's, with no edit in `rules/`
(`rules/machines.js:292`).

---

## The tunable pipeline

Three files, and the split exists because a god's boon must be able to change
walk speed while `export const WALK = 60` is read-only to importers.

```
data/tuning.js    the DESIGN. Frozen. Never written. Base values.
model/mods.js     the RUN. A list of {src, key, mul, add}, cleared by newRun().
eff(id, scope)    the ONLY way to read either.
```

**No file except `model/mods.js` may import `data/tuning.js`.**
`tools/layers.mjs` fails the build on any other importer, which is what makes
the store unbypassable rather than merely conventional. Without that rule one
lazy call site would silently opt out of every trinket in the game and nobody
would notice for a month.

**Order of application is fixed**, so draft order cannot change a number:

```
eff = (base + sum of all matching `add`) × product of all matching `mul`
```

A mod key matches `(id, scope)` if it equals `id` — the unscoped form applies to
every scope — or if it equals `id.scope`. So `hard` softens every material and
`hard.stone` softens one, and **both stack**.

Two kinds of row, differing only in what `base` means:

- `kind:'value'` — the number itself. `eff('walk')` is 60, or 69 with sandals.
- `kind:'scale'` — a multiplier on a literal that lives on a data row, because
  there are as many of those as there are rows. Hardness lives on the substance
  and recipe `secs` on the machine; this table holds the 1.0 a trinket bends.
  `scope` names what may follow a dot.
- `scoped` — per-scope **base** overrides for a scale row. This is what makes a
  variant machine faster purely by tuning: `rate.kiln_divine` has base 2.0 while
  every other machine has base 1.0, and a trinket still stacks on top.

Reading:

- `eff(id, scope)` for a value.
- `scaled(id, scope, literal)` when the literal lives on a data row — call sites
  read better as `scaled('hard', 'stone', row.tile.hard)` than as a
  multiplication.
- `explain(...)` answers "why is my walk speed 71". The debug overlay and the
  Character tab both read it rather than the raw `{key, mul, add}`.
- **`eff` throws on an unknown id**, because the resolver already proved every
  key in `data/` resolves. A missing tunable is a programming error.

Writing: nobody writes `tuning.js`. Rows go into `model/mods.js` keyed by `src`
— the trinket or `'boon:' + id` — so removing one removes exactly its own rows.
That is the half a static field cannot express: `WALK *= 1.15` cannot be told
apart from the base value once applied.

**A tunable key named by any `data/` row is checked.** `tools/content.mjs`
assertion 8 walks any data row with a `mods` array and resolves the key *and*
its scope; `tools/check.mjs:286` runs the quicker first-dot version.

Where a tunable belongs vs. a row literal: if only one reader exists and the
thing it describes is not a machine or a substance, a tunable is the right home
— `brandLight` exists because the brand is a substance × form pair, not a
machine, so a `machines.js` literal had nowhere to live (`tuning.js:120`).

`shell/ui.js#scrollOf` reuses the same flat-key trick for a different purpose:
`panel:grid` as one string key rather than a nested object, so there is one map,
one key shape and nothing to keep in sync.

---

## Notification and the journal

**`rules` never calls `play()` or `toast()`.** It pushes a row onto
`model/journal.js`; `shell/notify.js` drains the queue once a frame and turns
rows into sound, chips and text.

That is what lets the dependency direction be a rule rather than a hope: audio
is a device, devices live in `shell`, and a call from `rules` to `shell` would be
an upward edge — precisely the edge `tools/layers.mjs` refuses.

**A journal row is a FACT, not an instruction.** `kind` is a bare string, `at` is
world px or null, `data` is whatever the consumer needs. Deliberately untyped:
the moment a row says "play this sound", the queue has become a call stack with
extra steps.

To add an audible event:

1. Push `{ kind, at, data }` from the `rules` module where the fact happens.
2. Add `kind → sound name` to `KIND_SFX` in `data/sfx.js`. **A kind with no
   entry there is silent on purpose** — not every fact is audible.
3. If it deserves a line of text, add it to `TEXT` in `shell/notify.js`. Most
   kinds should not: a toast for every pickaxe strike is noise.
4. Chip counts are cosmetic and live in `shell/notify.js`, not on a content row
   — a designer tuning copper should not have to think about sparks.

A machine row may override its own sound: `look.sfx` names sounds for the
`accept` and `produce` slots, which is how the divine kiln rings differently and
the winch groans — with no machine name in `shell/notify.js` and no new kind.

**Rate limiting.** `data/sfx.js#MIN_GAP` is content; `shell/audio.js` enforces
it, measured in *simulated* seconds so a paused tab cannot bank a hundred
strikes. For a *text* refusal with no sound to gap, rate-limit at the push site
instead — a scalar when there is only one of the thing (`rules/mining.js:50`,
one pick), a `WeakMap` when there can be several (`rules/machines.js:318`,
several stalled miners), or a transient side table keyed by object identity
(`rules/items.js:51`, refused pickups).

**Reading without draining.** `model/journal.js#peek()` is a non-destructive
read; draining twice is the bug it exists to avoid. `shell/main.js:480` uses it
to detect a finished hand-craft — reading a signal that already exists rather
than inventing one. Note how it tells the two `'produce'` shapes apart:
`rules/crafting.js` pushes `{sub, form, made}` with no `def`,
`rules/machines.js` pushes `{def, made}` with no `sub`.

**The cost, paid where it is stated:** a drained event is seen one frame late,
ordering between two consumers is implicit rather than a call stack, and a
`shell` that forgets to drain loses feedback silently instead of throwing.
`drain()` warns past 512 rows, which is the cheapest available smoke alarm.
Measured allocation cost is 0.49 µs/frame. **The latency is the real cost.** It
is fine for sound and chips; it is wrong for anything needing a same-frame
response.

---

## Bands and worldgen

**A band is a row in `data/world.js`, not a module constant.** World size is not
fixed at import and the tile arrays are not allocated at import — that was the
single biggest structural blocker in the old code and is why more than one depth
band was impossible.

`model/world.js` allocates from the row at run time, more than one band is
resident at once, and **every tile query takes the band record as its first
argument.** Threading `b` costs about one extra parameter on forty call sites and
buys three coexisting bands, a lift that travels between two of them, and a
world size `newRun()` gets a say in. Band ordinals are never assumed to be zero.

**Two coordinate spaces, and only `model/world.js` converts between them:**

- **world px** — absolute, shared by every band. The camera and the lift live
  here. `origin` is a band's offset in this space.
- **band tiles** — band-local, `0..tw-1` / `0..th-1`. Every tile query lives here.

`origin` is in **pixels, not tiles**, because a tile offset is meaningless
between two bands whose `tile` sizes differ — and `tile` is per-band precisely so
a band may differ. Anything deriving a shared scale must read the smallest
`tile` any band declares rather than assuming 8 (see `view/scene.js#drawMap`).

Band rows carry `fields` (a band with no `heat` row simply has no heat, and a
machine emitting into a field the band lacks is a **build** error), `strata`
(worldgen instructions by `kind`) and `look` (band-scale appearance, `view/` the
only reader).

**Worldgen is a `rules` module** (`rules/generate.js`) because "where does a
copper blob go" is a decision: it consumes the run's random stream, depends on
tunables, and has the lifetime of one boot. `model/world.js` allocates the
array; `rules/generate.js` decides what is in it.

- **The kind table is the whole file.** Adding a layer, a vein or an ore field
  costs one row in `data/world.js`. Adding a new **kind** costs a handler here,
  once. `data/world.js` exports `STRATA_KINDS` and an assertion at the bottom of
  `generate.js` fails at import if a kind has no handler — a typo'd kind is a
  build error rather than a silently missing vein, which is the failure the
  previous generator had.
- **All randomness through `rand()`, in a fixed traversal order**: bands in
  declaration order, strata rows in row order, columns left to right. A run is
  bit-reproducible from its seed *only because* that order is fixed here rather
  than emergent. Use `rand()` and not `hash2()` for anything that should differ
  between seeds — a cluster rim from `hash2` would be identical between two
  seeds at the same coordinates (`generate.js:126`).
- **`lip:false` opts a stratum row out of the ragged-edge carve.** Without it, a
  stratum boundary that sits underground gets treated as an exposed surface and
  punched full of random air pockets, because the lip check cannot tell "top of
  my own range" from "top of the world" (`world.js:64`, `generate.js:49`).
- **The spawn shelf** (`SHELF` in `generate.js`) guarantees a flat patch, so the
  first two minutes cannot depend on the seed. Anything planted at boot — the
  pickaxe, the brand — goes inside it.

---

## Colour and appearance

**No substance name and no machine name appears anywhere in `view/`.** Everything
drawn comes from a `look` block: `base`/`hi`/`lo` for rock, `item` for a dropped
unit, `body`/`trim`/`base`/`fire`/`pips` for a machine, and `treatments` for
anything a colour triple cannot say. `view/paint.js:191` marks the line that used
to read `if (M.id === 'copper')`.

**Two palette files.** `core/palette.js` holds the hex, because mixing two
colours is arithmetic. `data/palette.js` re-exports it as the checked *name set*
that a `look` row may use, and `tools/resolve.mjs` fails the build on a name that
is not in it. Add a named entry — art-direction aliases in `data/`, new hex in
`core/` — rather than inlining hex at a call site.

**Three ink tones, and one of them is not a body tone.** Text in `view/` picks
from exactly three names, and picking the wrong one deletes information rather
than just looking wrong:

| name | role | use it for |
|---|---|---|
| `ui` | primary | a label, a heading, line 0 of a tooltip |
| `uiInk2` | secondary body | de-emphasised text that must still READ: a bar's value, a tooltip's body, a stat row, a key hint, a column header |
| `uiDim` | **state** | dim *means* something: unknown/masked, UNFUELLED/IDLE, a toggle that is off, an inactive tab, an empty placeholder |

`uiDim` was raised in Phase 13a (4.16:1 → 6.16:1 against `uiBack`) rather than
retired, because ten sites encode state in dim-vs-ink and are enumerated in
`docs/PLAN-phase13.md` §2.3. **A blanket `uiDim → ui` sweep passes
`npm run check` and every screenshot test, and silently deletes all ten.** If
text looks too grey, the question is whether that grey is saying something.

**`uiShade` is a 1 px text shadow**, `core/font.js#drawText`'s optional 8th
argument (and `view/ui/bar.js`'s `shadow` option, which forwards it). The rule
for when to use it, so it does not become taste:

- text **inside a panel** gets no shadow — the panel is the backing.
- text with **no panel but something adjacent already backed** gets a backing
  rect, extending `view/ui/ruler.js`'s and `view/overview.js`'s existing idiom.
- text with **no panel and nothing to back it against** gets the shadow. That
  is the always-on HUD bars (BURDEN, TRIBUTE, FAVOUR), the boon rows, the
  build/cable-ghost refusals, the title banner, and `view/scene.js#bandLabel`
  — which is written that way but **has no caller today**, so nothing draws
  it. Measured: `uiInk2` on lit sky with no backing is 1.73:1; with a shadow
  under it, 15.72:1.

The shadow pass is a **complete second string traversal**, so a shadowed
string costs two `fillStyle` writes, not two per pixel. Never move it inside
the glyph loop. `textWidth` is deliberately unaffected — every anchored layout
pass measures with it.

**Treatments** (`view/treatments.js`) are how "this material glints" became a row
edit:

```js
// data/substances.js
look: { treatments: [{ fn:'glint', col:'veinA', n:2 }] }
// view/paint.js
for (const t of look.treatments) TREAT[t.fn](g, cell, t)
```

Contract: `(g, cell, p)` where `cell` is `{px, py, tx, ty, tile}` and `p` is the
row's own parameter object. **They may use `hash2` and must not use `rand`** — a
repaint must not mutate anything, not even an RNG cursor, or a screenshot would
depend on how many times the frame had been drawn. An `fn` name that is not a key
in `TREAT` fails the resolver at build time.

Per-machine draw functions were considered and rejected, because they make "add a
machine" always cost a render edit.

Two rendering gotchas worth knowing before you add art:

- **`skyExposedAt` is "true sky", a full walk to the top of the band's grid** —
  not "the tile above is air", which a tunnel ceiling also satisfies. Grass on a
  cave roof was exactly the bug it exists to prevent. It is expensive per tile
  and is only called from the cached chunk-paint pass; never call it in a loop
  over a band (`rules/reveal.js:102` and `rules/light.js:164` both walk down per
  column instead).
- **The generic "exposed face" highlight fires for any open neighbour**,
  including cave ceilings — correct for lighting, wrong for grass. That is why
  `soil`'s `hi` is a plain soil tone and the green cap is a separate,
  sky-gated treatment (`substances.js:148`).

---

## Where does state go?

The layer rules push some state to non-obvious homes. The precedents:

| state | lives in | because |
|---|---|---|
| the aim reticle (`model/aim.js`) | `model` | `rules/mining.js` writes it and `view/hud.js` reads it — a datum with a writer and a reader in two mutually forbidden layers has to live where both can reach |
| the player record (`model/player.js`) | `model` | `view` must draw it and may not import `rules`. Only the hitbox is here; every physics *number* is a tunable |
| presentation timers (`player.hurt`, `walkPhase`) | `model` | `view` reads them, `rules` writes them |
| chips, toasts, the title fade (`view/fx.js`) | `view` | not a world fact, so `model` would owe it a `newRun()` reset for something screenshots do not depend on; `view` may not import `shell`, so `shell` could not hold it. `shell/notify.js` emits, `shell/main.js` steps, `view/scene.js` draws |
| which panel is open, drag payload, search string (`shell/ui.js`) | `shell` | facts about the **session**, not the world. `rules` never reads them, and nothing needs to survive a restart. Handed to `view` through the frame context |
| hover (`view/hover.js`) | nowhere | one writer and one reader, both this file's caller, so it is a **return value** recomputed every frame. Caching it on a model record would be a `view` write to `model` |
| a perf cache | module-local | see [Module-local perf caches](#module-local-perf-caches) |

**Anything on `run` resets for free.** A scalar there costs nothing and satisfies
invariant 8; `run.craftProgress` and `run.brandLeft` are both scalars for the
same reason — a player has one pair of hands and there is only ever one craft or
one lit brand. The alternative for `brandLeft` was module-scoped state in
`rules/light.js` with no `newRun()` hook to clear it: a field that survives a
restart, which invariant 8 exists to forbid.

**A Map is for when there can be several.** `model/mining.js` keeps a Map
because several tiles can be part-dug at once — and it is a Map rather than a
`Float32Array(tw*th)` because that array form is 196 KB resident to describe
three tiles.

---

## Cross-module mutable state

**ES module bindings are read-only for importers.** Any scalar written in one
module and read in another must live on an **object** and be mutated by
property. That is why `clock.t`, `cam.y`, `stage.ctx`, `rng`'s generator,
`flags.showInv` and `cmd.*` are all properties rather than bare `let`.

Do not "simplify" these back. `core/rng.js:32` and `shell/input.js:32` both
state the convention at the point where it looks unnecessary.

The same reasoning is why `data/tuning.js` cannot simply be patched by a boon,
and therefore why [the tunable pipeline](#the-tunable-pipeline) exists at all.

---

## One decision, two readers

`view` may not import `rules`. So whenever the renderer needs the *same* yes/no a
rule enforces, the decision moves down into `model` as a query and both layers
call it. One implementation, two readers, neither keeping a second copy of the
checks.

The canonical case is `model/run.js#placementCheck` (`:267`):

- `rules/placement.js#placeMachine` calls it and turns `false` into a journal row
  plus the actual mutation.
- `view/hud.js#buildGhost` calls it and turns `false` into a tinted footprint
  with the one-word `why` drawn beside it.

Note the check **order** is part of the contract: footprint, footing, depth,
then (for a lift stage) shaft reach, then affordability last — so a placement
that cannot happen for a structural reason never has to answer "and could you
even pay for it".

The same move: `model/run.js#canCraft` and `pocketsHave` exist so the CRAFT
panel can grey out an unaffordable recipe with no `rules` import. `canCraft` is
deliberately *weaker* than `rules/crafting.js#choose`, which must also find one
concrete pair per clause — related, deliberately not the same code, and the
comment says which is display and which is a decision.

Also of this shape: **one mapping, two readers.**
`view/ui/quickbar.js#digitOf` (drawing the glyph) and `#slotForDigit`
(`shell/input.js`'s digit handler) index the *same* array, so "press 3" and "the
slot showing 3" cannot silently disagree.

---

## Duplication across a layer boundary

Sometimes the fix above is unavailable: `rules` siblings may not import one
another, and a `model` query may not import `rules` at all. In those cases the
project **duplicates the arithmetic deliberately and says so at both sites.**

Current instances:

| fact | copies |
|---|---|
| lift shaft-reach arithmetic | `model/run.js:311` and `rules/lift.js#reaches` |
| `HARD_BREAK` (0.5 s, selects a break sound) | `rules/mining.js:46` and `rules/machines.js:389` |
| "largest single matching pair" over a ledger | `rules/machines.js#best`, `rules/crafting.js#bestPocketed` (`:33`), `model/run.js#pocketsHave`, `view/ui/mainPanel.js:486` |
| granting a boon from a miracle | `rules/miracles.js:52` calls `model/boons.js#write.grant` directly rather than `rules/boons.js#grant` |

The bar for accepting a copy: it is a handful of lines, it has no independent
"correct" answer that could drift meaningfully, and **both sites name the other**.
If it grows past that, push the shared part down into `model`.

---

## Module-local perf caches

A cache that carries no gameplay meaning and is read by nobody else stays
module-local in the `rules` file that owns it — **keyed by the band object, not
by `b.ord`**.

`rules/reveal.js:66` and `rules/light.js:127` are the two instances, and both
state the same reason: `model/world.js#write.allocate` always hands out a fresh
band object, so `b === lastBand` is already false the instant a run restarts.
There is no reset call to wire up or forget, and invariant 8 is satisfied
structurally rather than by discipline.

If you add one, key it the same way and reset any held reference on an
early-return path so a band going away cannot leave a stale pointer.

---

## View cache invalidation

`view` may not write to `model`, so **it cannot clear a dirty flag.**
Invalidation is therefore a **version counter that only goes up**:

- `model/world.js` bumps `b.ver[chunk]` on every tile write.
- `view/paint.js` remembers the version it last painted per chunk.

The epoch assertion is what forced this, and it is a better scheme than the flag
it replaced — two viewports could not share one flag.

Two consequences to respect:

- **A tile on a chunk edge bumps its neighbour's version too**, because edge
  shading bleeds across the seam (`model/tiles.js:123`).
- **Live, per-frame data must not bump `ver` at all.** Chunk canvases cache
  *static rock*; a heat front, a fog bit or a light level would re-cache them
  every frame and thrash the repaint. Heat (`model/fields.js`), fog
  (`b.seen`) and light (`b.light`) therefore all draw as **viewport-culled
  overlay passes** in `view/scene.js` instead.
- A signal that has no tile write behind it needs its own counter:
  `b.lightVer` exists because a brazier lighting up or running dry never touches
  a tile byte, and `write.setLight` fires per *tile* so it cannot double as the
  signal (`model/world.js:66`).

Repaint budget: a **first** paint is never budgeted (a chunk with no canvas has
nothing stale to show) but a **re**-paint is, so walking a long tunnel while
digging cannot stack forty bakes into one frame (`view/paint.js:41`).

---

## Pass order and darkness

`view/scene.js#render` composes the passes and owns nothing but their order:

```
void → per band (sky, chunks) → depletion → machines → items → player → chips
     → field overlay → darkness → fog of war → atmosphere → debug → HUD
```

The governing rule: **anything that reads as lighting comes after everything it
lights.** Four specific constraints fall out of it, and each is easy to break:

1. **Fog draws after the field overlay**, not merely near it. Fog hides a tile
   *regardless of what is actually there*, and a heat glow is one more thing
   that is actually there.
2. **Darkness runs before fog**, which is the one pass allowed to win outright:
   an unseen tile must stay opaque regardless of light. Darkness *subtracts*
   with ordinary alpha and only touches tiles `seenAt` already allows.
3. **The machine halo is gated on `seenAt` even though `drawFog` already ran**,
   because it composites with `'lighter'` and would add light straight *through*
   an opaque fog rect. An active furnace behind fog must not out itself by
   lighting the fog from within (`view/scene.js:452`).
4. **The depletion cue runs with the terrain, not with the overlays.** It is
   paint on a rock tile, so a machine, an item or the player standing in front
   of a worked-out vein must cover it, and darkness and fog must dim and hide
   it exactly as they do the rock underneath.

`drawDepletion` is why a part-spent deposit reads as part-spent (Phase 14c,
D14-G). It cannot be baked into the chunk canvas for the same reason `seen` and
`light` cannot: **the bake caches the static rock texture, and depletion is a
live condition.** `model/mining.js#write.add` bumps the epoch and never a chunk
version, so a cue drawn in `paintTile` would show what was true several swings
ago — which is exactly what the *crack* marks in the bake do today, a real
pre-existing bug with a browser-verified repro in `docs/FINDINGS.md` (14c #1).
Four live tile passes — depletion, fields, darkness, fog — therefore share one
viewport cull, `view/scene.js#tileWindow`.

`seen` and `light` are **two different facts**: `seen` is memory (permanent,
one-way, `rules/reveal.js` owns it); `light` is a current condition that goes
down as well as up (`rules/light.js` owns it). A torch burning out darkens a
remembered room without erasing the memory of it.

Both fog and darkness are **row-run coalesced** — one wide rect per contiguous
run, not one rect per tile — and fog walks one extra virtual sentinel column past
the visible edge so a run still open at the screen edge flushes without a second
copy of the flush logic.

The **map overview** is a different render path, not a camera trick: it reads the
tile grid directly at ~1 px/tile and returns before every normal pass, because no
chunk bitmap is the right resolution for it. It also freezes the run — guarded
inside `shell/main.js#step()` so the headless hook honours it too.

---

## Record what you drew

The project-wide idiom for anything clickable or hoverable: **`view` draws and
records the rectangles it drew; `shell` hit-tests them and calls `rules`.** Never
the reverse, and `view` never sees the dispatch.

- `view/hud.js#pocketHits` / `#hoverInfo` — the original instance.
- `view/ui/state.js#drawn` — the widget layer's version (`panels`, `tabs`,
  `grids`, `tooltip`, plus per-grid recipe-id side tables). Rebuilt every draw,
  never relied on across frames; `resetDrawn()` is called once per HUD frame.
- `shell/main.js#applyUiIntents` (`:255`) — the dispatcher.

Rules for using it:

- **Hit-test in the space the rects were recorded in.** That is screen space
  (pre-camera). `shell/input.js:322` and `main.js:255` both do the conversion
  the same way, with `cam` standing in for it.
- **Use the cam snapshot, not the live one.** `render()` rounds `cam` in place
  before drawing, and `updateCamera()` eases it again immediately after — so the
  live `cam` by the time the dispatcher runs can differ from the one that
  produced `drawn` by more than a pixel. `shell/main.js:556` snapshots it once,
  right after the rounding that matters.
- **One frame of lag is accepted.** The dispatcher reads last frame's `drawn`.
  Invisible at any real frame rate, and the alternative is `view` calling back
  into `shell`.
- **Overlays read back absolute rects rather than recomputing geometry.** A
  slot's highlight border (`view/ui/slot.js:59`) draws against the exact
  rectangle `drawGrid` already returned. Callers never recompute geometry
  `drawGrid` settled.
- **A leaf primitive does not push into `drawn` itself.** `slot.js` does not,
  because every caller is already a container recording the slot's content
  alongside its own geometry — one record per slot, not two.

---

## Widget primitives

`src/view/ui/` — `panel`, `tabs`, `grid`, `slot`, `bar`, `tooltip`, plus
`state.js`. Same-layer imports between them are legal.

Contracts:

- **Every primitive takes `vw`/`vh` and clamps to it.** Below roughly 240 px of
  base width an unclamped panel overlaps the depth gauge and anything centred;
  `view/hud.js`'s header records learning that the hard way. The phone floor
  `core/canvas.js#resize` enforces is 200 px.
- **A generic widget must not learn game meaning.** `bar.js` takes a fraction
  and a colour *name*; the caller resolves the amber-past-soft-cap /
  red-at-hard-cap rule through `eff()` itself. `slot.js` takes a resolved hex
  swatch, because looking one up would mean importing `data/substances.js` into
  a file that must contain no substance name.
- **There is no `clip()` in this project's canvas vocabulary.** The headless 2d
  stub in `tools/check.mjs` does not implement it, so a real clip would pass in a
  browser and throw in `npm run check`. Consequences:
  - `grid.js` snaps scrolling to whole **rows**, so every drawn slot is fully
    inside the grid's bounds and nothing needs clipping.
  - `tabs.js` **drops** a tab that would bleed past the boundary rather than
    truncating it, because drawn text is never clipped — a truncated tab would
    paint its full label past the boundary while claiming a narrower hit rect.
    The first tab is the one exception: one slightly overrunning tab beats none.
- **Shrink to fit, and report what you actually drew.** `grid.js` derives its
  width from `cols × cell` and *reduces* the column count when it cannot fit, and
  returns the actual count. Reporting a clamped `w` while still looping the full
  `cols` would draw slots the returned rect claims are not there — exactly the
  layout/hit-test disagreement the `pocketHits` idiom exists to prevent.
- **Names clip; don't truncate at runtime.** `short` is authored data on the
  substance/form/boon row, and `shortLabelOf`/`shortNameOf` fall back to the full
  name when a row has none. Slicing a full name to fit would either cut a word
  mid-letter or need clipping machinery. Use short names in narrow fixed-width
  rows: bill-of-materials lines, inline tooltip references, the boon timer stack.

---

## Input intents

`shell/input.js` exports three objects, all mutated by property:

- **`cmd`** — the per-frame command set the rules read. `dig`, `craft`,
  `action` (the crank hold, `r` — renamed from `turn`/`f` in Phase 12d,
  docs/PLAN-phase12.md §3 D-J), `collect` (`c`) and the movement keys are
  **holds**; `hop` and `place` are **edge-triggered**. `dig` and `miracle`
  are no longer bound to any key (Phase 12d retired `x`/`j` and `v` outright
  — mining and using a held miracle are both reached through the unified LMB
  dispatch below instead) but `cmd.dig` itself is kept, deliberately, since
  it is the standard test-harness idiom for triggering mining without a
  real, coordinate-correct mouse event — see `tests/visual.spec.js`'s many
  `__mf.cmd.dig = true` sites. `cmd.miracle` was removed outright: nothing,
  not even a test, still read it.
  **Pickup is opt-in.** `rules/items.js` collects only while its `collect`
  hold is true, and `shell/main.js#step` supplies that as
  `ui.autoCollect || cmd.collect` — the same "which device or preference
  asked is a shell question" merge `digging` already uses. `ui.autoCollect`
  (the Character tab's AUTO COLLECT row) is therefore **input state, not a
  presentation toggle**, and `shell/boot.js#newRun` resets it to `false` on
  every run: it gates what enters `run.inv`, which moves burden and climb
  speed, so a sticky one would make two runs from the same seed diverge
  (invariant 8, D13-A / docs/PLAN-phase13.md §4.3). Set it from a test with
  `setAutoCollect(bool)` and read it back off `__mf.ui.autoCollect`.
- **`wants`** — one-shot requests to the shell, not movement (drafting).
  Restart moved off `wants.restart`/any key entirely in Phase 12d, onto a
  real, clickable death-screen button (D-C) — see below.
- **`flags`** — presentation toggles, passed to `view` through the frame context
  because `view` may not import `shell`.

**LMB is one unified, contextual verb, resolved once at `pointerdown`**
(docs/PLAN-phase12.md §3 D-A, §4.4): an armed miracle always fires; else an
armed placeable over open ground places; else it mines. Decided ONCE per
press, not every frame of a held one, specifically so a continuous hold
cannot flip meaning mid-press. RMB still deconstructs a machine under the
reticle, else places — a harmless, redundant second path to the same place
outcome LMB's own rule 2 also reaches.

**Edge-triggering is not optional for anything destructive or launching.** A held
space bar that re-launched every frame turned a one-tile hop into flight; a held
place key emptied the pockets into a wall in half a second. `q` (drop) and
`Backspace` (deconstruct) use the same `*Held` latch idiom for the same reason.
`clearEdges()` runs once per frame **after** the rules have read them, which is
why the latch lives in `shell/input.js` and not on the key state.

**Above 120 Hz a frame can run zero substeps.** So:
- `applyIntents()` runs once per real **animation frame**, not per substep, and
  each branch self-clears the flag it consumed (`main.js:113`).
- `cmd.hop` may only be cleared once a substep has actually run, or a hop is
  erased before physics ever sees it (`main.js:593`).

**The open panel stack captures input.** While `shell/ui.js#top()` is open, the
pointer handlers route to `cmd.uiClick`/`uiRight`/`uiDown`/`uiWheel` instead of
`mouse`/`place`, so a click meant for a slot can never also dig or place through
to the world underneath. Exceptions are hit-tested explicitly because they are
drawn with no panel open: the quickbar's legend toggle
(`shell/input.js:322`), and the death-screen restart button
(`onDeathRestart`, docs/PLAN-phase12.md §3 D-C) — checked first of all,
before the map and the panel-stack routing, since a click on it means
"restart", full stop, never a same-press mine or place at whatever the
reticle happens to be aimed at underneath the screen it covers. Both
register their rect into `view/ui/state.js#drawn.panels` (the SAME
`drawPanel` idiom every hit-testable rect in this project uses) rather than
duplicating the layout math on the input side.

`uiClick`/`uiRight` are **edge** (cleared every frame regardless of button
state — a held pointer fires no repeat event, so that still leaves exactly one
true frame per press). `uiDown` is a **hold**, because a drag needs "is the
button still down", which an edge flag cannot answer. `uiWheel` accumulates
between clears so a fast scroll is not dropped.

**The search field pre-empts every other binding in the file** (`:141`), or a
typed search string would also walk the player into a wall. Unrecognised keys
inside it are swallowed rather than passed through — including `i`, now a
fully retired key with no other meaning, still typeable as a literal search
character.

**Adding a key**: check the full `KEYS` table *and* every `if (k === ...)` in the
file first — see `.claude/brain/notes.md` for the current inventory. Gate a
"spawn something from nothing" key behind `flags.showDebug`; do **not** gate a
key that consumes something the player already holds.

---

## The frame context

`view` may not import `shell`, so everything a draw needs is handed in as one
reused object built in `shell/main.js:55`:

```
{ cam:{x,y}, t, dt, frame, W, H, flags, mouse:{x,y,has}, ui }
```

- One object, reused — allocating a fresh one sixty times a second is waste.
- `mouse` is **world px**, same space as `cam`, so `view/hover.js` can test world
  content directly and subtract `cam` itself for anything in screen space.
- `ui` is `shell/ui.js`'s live state object, read-only to `view`, passed through
  exactly as `flags` is.

If `view` needs a new fact from `shell`, add a field here. Do not import.

---

## The frame loop and determinism

**A fixed 1/120 s step, and not for performance.** No `rules` module ever sees a
variable dt. That is what lets fall damage, mining time and machine throughput
be functions of the world rather than of the display: a tile takes exactly its
stated seconds at 30 fps and at 144 fps, and a 5-tile drop measures 40 px either
way.

The accumulator is capped, so a tab backgrounded for a minute does not simulate a
minute in one frame and teleport the player through the floor.

The journal drains once per **frame**, not per substep: sound is a frame-rate
phenomenon, the simulation is not.

The determinism checklist, when you add anything:

1. **All randomness through `rand()`**, in a fixed traversal order.
2. **Rendering consumes no randomness.** Derive animation from `clock.t` plus a
   position hash (`hash2`). A `rand()` call in a draw path breaks seed sharing,
   replay and screenshot testing at once — the furnace flame did exactly this.
   `view/fx.js` carries its *own* generator, seeded from a constant, precisely
   because chips are emitted per frame.
3. **`newRun()` resets everything.** A field surviving a restart is a determinism
   bug. Add the field to `RUN_SCHEMA` or to a model module with a `clear()` that
   `shell/boot.js` calls.
4. **No `Date.now()`, no wall clock in a rule.** `shell/audio.js` gaps sounds by
   `clock.t` for this reason.
5. **Time is compared in the same unit it is stored in.** Hardness is seconds and
   progress is seconds; there is no `/255` anywhere and therefore no framerate at
   which anything becomes unbreakable.

**Boot order is load-bearing** and is written down in `shell/boot.js:1` as a
numbered list with what breaks if you move each line, because it cannot be
inferred from the import graph. Getting it wrong throws during boot and renders
nothing at all.

---

## The rules order

`rules` modules may not import each other. The cost is that ordering must be
written down somewhere explicit; the benefit is that **`src/shell/schedule.js`
IS the simulation** — there is no other place a step can hide, and reordering
the game is reordering one array. In the previous codebase the order was an
emergent property of the import graph, and `sim/mining.js` imported the tutorial
to get it.

`schedule.js:1` carries a justification for **every adjacent pair**. Do not add a
step without adding yours; do not reorder without updating the affected pairs.
The recurring argument is **freshness** — a fact produced this frame should be
visible to whatever consumes it this frame:

- `mining before light` — a tile broken now can open a path for light now.
- `light before reveal` — Pass B gates on `lightAt()`, so it must read this
  frame's field.
- `items before belts` — a belt drags what just landed.
- `items before machines` — a catch box is checked against fresh positions, and
  `items` is what rebuilt the spatial index.
- `belts before machines` — a belt that dragged an item into a mouth this frame
  must be caught this frame. (`rules/belts.js:91` re-indexes the item grid itself
  after moving anything, precisely so nothing downstream sees a stale position.)
- `trinkets`/`boons before machines` — a rate modifier that turned on now should
  apply to this frame's recipe tick.
- `fields last` — emissions made now decay from next frame, so a recipe gate sees
  the heat just poured in.

Two notes on the list's history worth preserving: `reveal` **moved** from just
after `player` when Pass B gained its light gate, and the parenthetical record of
that move is why it did not simply acquire a second contradictory comment. And
`belts before crafting` states its accepted cost explicitly — a completed craft's
output waits one extra frame for its first gravity step.

The run clock is ticked first and is not a rule: `run.t` is a number, not a
decision, and no `rules` module may claim ownership of the frame.

Event-shaped rules (`grant`, `draftable`, `use`) are re-exported from
`schedule.js:162` rather than added to `STEPS`, because putting them in the array
would be a lie about when they happen.

---

## Buffers and pockets

Both a machine buffer (`m.buf`) and the player's pockets (`run.inv`) are
`{ 'sub/form': units }` — keyed by the pair string from
`model/items.js#parseKey`/`keyOf`.

**This is the slower representation, chosen on purpose.** A buffer is the thing
you read while debugging a stuck factory, and `{ 'copper/ore': 3 }` answers the
question that `[0,0,3,0]` does not (`model/items.js:28`).

Consequences to remember:

- "Do I have enough" over a **selector** is not a single lookup. Every reader
  wants the **largest single matching pair**, not the sum — see
  [Non-item inputs](#non-item-inputs) for why, and
  [Duplication across a layer boundary](#duplication-across-a-layer-boundary)
  for the four places that arithmetic lives.
- Buffer **fullness** (the servo, the HUD pips) *is* the sum:
  `model/machines.js#count` / `#fill`.
- `capOf`'s selector expansion is memoised per selector, and `fuelSelectorOf` per
  definition, because both are called per machine per frame. Selectors come from
  frozen data, so the caches are bounded by the content.
- Buffer insertion order is the tiebreak in `takeBuffered` — stable and therefore
  deterministic, but **not** a design statement about which ore is preferred.

An item is a `{sub, form}` pair plus a mass, and that is all it is. Purity,
fragility and temperature are deliberately absent: a field nothing reads is a
field that will be wrong when something finally does. Keep the record
monomorphic — ten fixed slots, `mod` null until an item deviates from its rows.

---

## Run state and RUN_SCHEMA

`src/model/run.js` holds two records, and which one a field belongs in is decided
by one question: **does a death erase it?**

- **`run`** — hearts, pockets, granted machines, equipped trinkets, the tribute
  clock, the seed. `write.reset()` restores every field from `RUN_SCHEMA`.
- **`meta`** — what outlives the run: run count, deepest depth ever, gods met.
  `finishRun` is the only writer.

**Every field a `newRun()` must reset is declared once, in `RUN_SCHEMA`, and
reset mechanically.** The previous codebase disagreed with itself about the shape
of `run` in four places, with three fields other modules had each invented; that
class of bug is what a schema is for.

When you add a field:

- Add it to `RUN_SCHEMA` with a scalar or primitive default.
- **An array or object default on the frozen template must be rebuilt in
  `reset()`**, not referenced — a shared mutable reference would be one array
  every run shared. `inv`, `granted`, `equipped` and `known` all do this.
- If `reset()` needs a tunable (e.g. `eff('trinketSlots')`), remember
  `mods.write.clear()` has already run by then, per `shell/boot.js`'s
  load-bearing order.
- Write it through a `write.*` function so `model/epoch.js#bump()` fires.

There is deliberately **no save string** yet. The split is in the shape so adding
one is a serialiser and not a refactor: a save is `meta` plus `run.seed` plus
`run.inv` (a drafted trinket lives there too), and replaying it reproduces every
number because randomness is seeded and modifiers are a list. Keep new fields
plain-serialisable — arrays of ids, not `Set`s — for the same reason
`run.known` is an array.

---

## Layer rules that will fail your build

`tools/layers.mjs` runs as section 0 of `npm run check` with `LAYER_BUDGET = 0`,
which may only ever go down. It fails on:

1. **Any upward edge.** `core → data → model → {rules, view} → shell`.
2. **`rules` importing `view`, or `view` importing `rules`.** Siblings, mutually
   forbidden.
3. **`rules` importing `rules`.** The order lives in `shell/schedule.js`. One
   declared exception: a driver may bind leaf helpers from a sub-directory below
   itself.
4. **Anything but `model/mods.js` importing `data/tuning.js`.**

Not checked by the layer tool but enforced elsewhere or by convention:

- **`view` never mutates `model`.** `model/epoch.js` bumps on every write and
  `tools/check.mjs` section 2 asserts the counter is unchanged across a
  `render()`. Honest limit: that covers writes going through `write.*`, which is
  all of them by convention and none of them by proof.
- **No substance or machine name anywhere in `view/`.**
- **No `fillText`, ever.** Use `drawText` with the 5×7 bitmap font.
- **No runtime dependencies.** `src/` plus `vendor/`, nothing else.
- **No `localStorage`/`sessionStorage`** — they fail in some embed contexts.
- `tools/` is outside the scanned graph, so a build tool importing `src/data` and
  `src/model` directly is fine.

---

## Checkers: what each one proves

| command | proves | blind to |
|---|---|---|
| `npm run check` §0 `tools/layers.mjs` | dependency direction and the tuning-import rule | whether the design makes sense |
| §1 `tools/resolve.mjs` | every string key in `data/` resolves — substance id, form, recipe tag, tunable, palette name, field name, strata kind | whether the value is right |
| §1b `tools/content.mjs` | the content tables are self-consistent: 14 assertions (see below) | anything dynamic |
| §2 purity | `render()` performs no model writes and consumes no randomness | anything visual |
| §3/§4 behaviour | hardness at 8 framerates, the fall table, a 7,200-frame collision fuzz, determinism (twice in-process, once in a fresh process), `newRun()` resetting everything, mass conservation over a 10,000-substep fuzz, hand==machine identity, T2==T3 rate equality, break-even depth ordering, burden affecting only ascent, light behaviour, every band rendering | appearance |
| `npm run test:visual` | appearance *changing*, real-browser boot errors, dev/dist parity | whether the art is any good |
| `npm run lint` | unused and undefined identifiers | everything else |

`tools/content.mjs`'s assertions, in order: (1) every selector expands and every
literal output pair is legal; (2) masses finite and positive; (3) machine cost
keys parse to holdable pairs; (4) every cost key is **transitively** reachable
from a mined pair; (5) no orphan recipe outputs, scoped to declared pairs; (6) no
recipe produces more mass than it consumes unless tagged `transmute`; (7) every
`hand:true` recipe is object-identical to what a machine names; (8) every tunable
key any `data/` mods row names resolves, scope included; (9) `tile.tier` is
monotonic against `hard`; (10) `conflictsWith` ids and modes are real, never
self-referential, and agree where both directions are declared; (11) every
miracle is a holdable substance × `phial`; (12) every drop row is valid; (13)
every trinket is a holdable substance × `relic`; (14) depth gates are monotonic.

Two things to reuse rather than reinvent when adding a check:

- **`data/forms.js#expand(sel)`** is the purpose-built selector validator. An
  empty result is exactly the failure that lets a substance pile up in a buffer
  no recipe consumes. A hand-rolled string check was written first and was
  strictly worse.
- **The reachability fixpoint** (`content.mjs:150`) is shared by assertions 4 and
  5. It resolves `subFrom` against substances *already reachable* using
  `matches()` against the reachable set, never `expand()`'s full crossable scan —
  which is what keeps `adamant/ingot` out of the set by construction rather than
  by exemption.

**What none of them can do:** they check direction and names, not sense. They
will not notice an unreachable recipe path a human would spot, a machine with no
way to be fed, a wrong number, or a hand-recipe priority collision.

---

## Writing tests

`tests/visual.spec.js` is both the screenshot suite and the place
state-asserted end-to-end flows live. The recurring lessons, all learned the hard
way:

- **A screenshot cannot tell "it worked" from "it always looked like this."**
  Every mechanic test reads state back through `__mf`. A screenshot proves
  appearance has not *changed*; that is all.
- **Take feature screenshots in pairs.** An unlit and a lit shaft are two
  separately-baselined images, so a regression making lighting a no-op must
  change one of them against its own baseline rather than merely looking
  plausible beside the other.
- **Never hardcode a click coordinate.** A click at (400, 300) fails on the phone
  project, whose base buffer is 200×422. Locate the target rect from
  `__mf.hits`/`__mf.ui()` — the same rectangles the renderer actually drew — or
  drive input through the keyboard or the model.
- **Do not trust natural worldgen.** Hand-carve the terrain you need: clear a
  rectangle, force the floor solid, write a *known* substance where you will
  probe. A test that only ever finds rock nearby reports "refused" as if it were
  "did not work" — and several tests in this file did exactly that before it was
  caught.
- **Isolate the mechanism from physics.** For fog and light, teleport with
  `model/player.js#write.move`/`write.band` and call the rule's `step()` directly.
  An 800-tile teleport lands the player inside solid rock, and a real substep
  there starts collision resolution that has nothing to do with the claim.
- **`settle()` advances `clock.t` but not `stepFx`**, so the 2.6 s opening title
  is still up — and `drawHUD` draws the title card *instead of* the tooltip while
  `banner.fade > 0`. Any hover test must decay it first.
- **Fog will swallow a terrain test.** `__mf.revealAll()` exists for exactly the
  tests that park the camera somewhere the player never walked.
- **Under `?test=1` there is no RAF loop**, so `page.mouse.click()` fires
  down+up with zero time between them and `cmd.uiClick` is never processed.
  Insert `__mf.frames(1)` between `down()` and `up()` — that is what `realClick`
  does. A right-click additionally needs a frame between *move* and *down*,
  because `aim` is only resolved inside `step()`.
- **The first real pointer event flips aim resolution to the cursor**
  (`cmd.hasMouse`), so a real click's aim lands wherever the panel sits over the
  world. Move the mouse, let one frame resolve `__mf.aim`, *then* carve the site
  there.
- **Watch `MAGNET_DELAY` (0.35 s ≈ 42 substeps).** Dropped material sitting at
  the player's feet gets picked straight back up. A drop burst must stay under it;
  a test that needs material to *stay* dropped must leave margin.
- **Tick queue-like things in small batches.** One `frames(1400)` call holds
  `cmd.craft` for the whole window and over-crafts past what was queued;
  `tickCraftQueue()` runs once per real animation frame in real play.
- **`__mf.give` is a legitimate substitution**, not a cheat: it arranges a
  scenario without spending the frame budget re-proving mining and pickup that
  other tests already cover end to end. Say so in the test.
- **Baselines are bit-exact (`maxDiffPixels: 0`) because the renderer is
  deterministic by construction. Do not raise that threshold to make a test
  pass.** A nonzero diff is either a regression or an intended change; in the
  second case run `npm run test:visual:update` and say in the commit why the
  pixels moved.

---

## The test hook

`shell/main.js#installTestHook`, installed only under `?test=1`, where the RAF
loop does not start. Everything on `__mf` is inert outside that flag.

| member | purpose |
|---|---|
| `newRun(seed)` | fresh world inside the page block |
| `frames(n)` | advance n substeps at a fixed dt, then draw once |
| `hold(keys, n)` | hold a command set for n substeps; edge commands release after the first |
| `draw()` | render without stepping (a substep would move the camera out from under `mouseAt`) |
| `mouseAt(sx, sy)` | move the pointer to a **screen** pixel with no DOM event |
| `intent(name, args)` | locate a target rect from `ui()` and drive a UI click through it |
| `give(sub, form, n)` | credit the pockets directly, bypassing mining and pickup |
| `revealAll()` | test-only fog escape hatch |
| `hits` / `hover` | the rectangles and tooltip content the HUD actually drew |
| `ui()` | a **getter** merging `shell/ui.js`'s session state with `view/ui/state.js#drawn` |

`ui()` is composed in `shell` rather than `view` because it merges two layers
that may not import each other, and it is a getter rather than a snapshot so
every read reflects the last `draw()`.

`frames()` runs `applyIntents()` once per substep rather than once per call —
safe because each branch self-clears what it consumed, so an intent set by one
key event fires exactly once across the whole call, as it would in one real
frame.
