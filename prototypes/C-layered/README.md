# C — layered core (RFC 04 as written)

Six layers, one legal direction of dependency, and a checker that fails the
build on an illegal edge. Content is flat frozen tables of literals in one
directory. Machine behaviour is one generic interpreter reading parameterised
flags off those rows. No `class` and no `this` anywhere in `src/`.

The review of the six RFCs put this design joint first on comprehensibility and
summarised it as *"the cheapest comprehensible design in the set is the most
boring one: flat frozen tables in one directory, every value a literal, plus a
build-time name resolver."* That is the property this prototype protects. It is
deliberately not clever.

```
prototypes/C-layered/
  src/
    core/    rng math pixels color                  imports: core
    data/    substances machines sources tuning     imports: core data
             trinkets world palette sfx             (in practice: nothing)
    model/   world tiles mining items machines      imports: core data model
             fields space run mods player aim
             journal epoch
    rules/   generate player mining items           imports: core data model
             machines fields place lift trinkets    (NOT rules, NOT view)
    view/    paint treatments hud scene overlays    imports: core data model
                                                    (NOT rules, no mutators)
    shell/   boot schedule main notify              imports: anything
  tools/     layers.mjs resolve.mjs check.mjs
```

`rules` and `view` are mutually forbidden siblings. `rules` modules may not
import each other either: each is a pure `step(dt)` over `model`, and the order
is stated once in `shell/schedule.js`. Notification flows *downward as data* —
`rules` pushes onto `model/journal.js` and `shell/notify.js` drains it.

**Size.** 43 files, 1,341 lines of code excluding comments, plus 523 lines of
tooling. The comments are load-bearing — two table headers carry the whole
content grammar — so the raw file count reads heavier than the code does.

**Verification.** `node tools/check.mjs` runs and all four sections are green:
0 layer violations across 143 import edges, every name in `data/` resolves,
`render()` does not move the mutation epoch, and thirteen content probes pass
including *tin smelts to an ingot* and *a hot kiln bakes 2 gravel into 1 brick*.
Every file passes `node --check`. None of that says anything about how the game
looks or feels — the drawing calls are stubs. It says the data paths join up.

---

## Reading order

Five files, in this order, and a newcomer can stop after two if all they want to
do is add content.

1. **`src/data/substances.js`** — the header block is the only documentation the
   content layer needs; below it, every value is a literal. Copper is the
   commented row and every other row is that shape.
2. **`src/data/machines.js`** — same again for machines. The header defines the
   entire vocabulary (`ports`, `buffer`, `catchBox`, `handFeed`, `servo`,
   `recipes`, `lift`, `emit`, `look`) in about forty lines.
3. **`src/rules/machines.js`** — the interpreter: 138 lines of code under a
   header that explains why it exists. No machine name, no substance name, no
   number. Read `step`, then `choose`, then
   `bind`, then `outputsOf`.
4. **`tools/layers.mjs`** — the rule table at the top *is* the architecture. If
   you only read one thing to know where a new file may live, read that table.
5. **`src/shell/schedule.js`** — the order the simulation runs in, with a line
   of reasoning per adjacent pair. There is nowhere else a step can hide.

`src/model/mods.js` is the sixth, and the only one whose problem statement is
worth reading in full before touching tunables.

## Adding a substance

`tin`, appended last, exactly as the brief asks.

**Files touched: 2.**

- `src/data/substances.js` — one row, 11 lines, at the end of the array. Rows are
  append-only so every existing tile id and therefore every save survives.
- `src/data/palette.js` — four entries (`snA`..`snD`), because tin is a new hue.
  Zero if you reuse an existing one.

**Zero engine files.** The furnace was not edited: its recipe binds `'#ore'` to
whichever ore is present and reads `smeltsTo` off that row, so tin smelts on the
first frame. The crusher was not edited: it accepts `'#ore'` by tag. `rules/
generate.js` iterates rows that have a `gen` block, so tin places itself.
`view/hud.js` filters rows with `item.hud`, so tin got a pocket slot.
`view/paint.js` reads `look`, so tin got a glint.

**If you typo it, you find out at the edit.** `node tools/check.mjs` section 1
was run against a deliberately broken tin row and printed:

```
  substances.tin: look.base "snX" is not a palette key
  substances.tin: tagged 'ore' but has no smeltsTo — a furnace would swallow it forever
  machines.furnace.recipes[0]: outFrom: substance "tin" can satisfy "#ore" but has no "smeltsTo"
```

That second line is the one that matters. The review found that RFC 04's furnace
would silently swallow a new ore into a buffer no recipe consumed. Name checking
alone does not catch that, so the resolver checks *reachability*: any substance a
port will accept must have a recipe that can consume it.

`grep -rn tin src/` finds the row, the palette keys, and nothing else.

## Adding a machine

`kiln` — `2 gravel -> 1 brick` — written last, by copying the crusher row and
changing literals.

**Files touched: 1 engine-relevant, 1 test.**

- `src/data/machines.js` — one row. Nine values differ from the crusher: `id`,
  `name`, the `accepts` selector, the `cap` selector, the recipe's `in`, `out`
  and `secs`, the pip selector, and four colour keys.
- `tools/check.mjs` — a probe, so the claim is verified rather than asserted. Not
  required to make the kiln work.

`gravel` and `brick` already existed as rows (the crusher produces gravel; brick
is in the required substance set), so no substance edit was needed. No new
palette keys: brick's clay hues were already there.

One line in the kiln row is *not* a copy of the crusher, and it is the field
seam the brief asks for: `needs:{ heat:{ min:30 } }`. A kiln bakes only in a hot
cell, so it wants to sit in a furnace's plume — which is DESIGN item 5 arriving
as a consequence rather than as a feature. Delete that line and it bakes cold.
The probe asserts both halves: a cold kiln produces nothing, and the same kiln
with 60 units of heat produces exactly one brick.

## The blood winch

`data/machines.js` row `bloodWinch`, two recipes:

```js
recipes:[
  { in:{ '#fuel':1 }, out:{}, secs:6.0 },                  // honest fuel
  { in:{ heart:1 }, from:'vital', out:{}, secs:6.0 }        // the terms
]
```

`from:` names a row in `data/sources.js` — *where an input is drawn from* — and
that is the whole mechanism. The interpreter asks the source how many it has and
tells it to spend; it never learns whether that was a log or a heart. Recipes are
tried in order, so the winch behaves like an ordinary fuelled lift while you have
timber and only starts eating you when you have run dry. The trap is expressed as
**row order**, not as a special case in code.

What it does *not* require, and this is the part RFC 04 got wrong: there is no
`blood` substance, health is not mirrored into the inventory, `model/run.js` does
not change shape, and the HUD still draws five hearts. The review called 04's
only route "a design decision smuggled in as an implementation trick"; this is
not that. `run.hearts` is spent through `runw.spendHearts`, which refuses to
reach zero — a property of hearts, so it lives on the `vital` source row where
every future blood-fuelled thing inherits it.

The lift itself is unaware. A recipe with `out:{}` banks a **charge**;
`rules/lift.js` spends charges to turn a drum. Five stages are five rows placed
at five level pairs, each with its own deck (CLAUDE.md invariant 4).

**What it cost.** Two things, both engine code, both paid once:

1. `data/sources.js` exists at all, with `count`/`spend` as inline pure
   functions on the row and a narrow injected api defined in
   `rules/machines.js`. Three rows.
2. `bind()` in the interpreter grew a two-branch case: a source with
   `units:'substance'` binds a selector to a concrete substance, one with
   `units:'named'` binds to a declared unit string. About ten lines.

That is cheaper than RFC 02's answer in one respect and dearer in another, and
the difference is worth being precise about. Adding a fifth *machine* is a row
in both designs. Adding a fifth *source of capability* — mana, a ley line,
Charon's goodwill — is a new self-contained file in 02 and, here, a row plus a
possible branch in `bind`. See `## What fought me`.

## Tunables

The brief's three-part demonstration, all verified by
`tools/check.mjs` section 3a:

```js
// src/data/tuning.js — the base value, frozen, never written
{ id:'walk', kind:'value', base:60, unit:'px/s', note:'ground speed' },

// src/data/trinkets.js — the boon
{ id:'winged-sandals', name:'WINGED SANDALS', god:'hermes',
  mods:[ { key:'walk', mul:1.15 } ] },

// src/rules/player.js — the consumer
const walk = eff('walk');            // 60 without it, 69.00 with it
```

`eff(id, scope)` in `src/model/mods.js` is the only reader, and the resolution:

- **`data/tuning.js` holds the design.** Frozen. `walk` is 60 because a designer
  chose 60, and nothing may ever overwrite that, so it can always be recovered.
- **`model/mods.js` holds the run.** A list of `{src, key, mul|add}` rows copied
  out of `data/trinkets.js`, cleared by `newRun()`, keyed by trinket id so that
  *losing* a trinket removes exactly its own rows. Writing a static field cannot
  do that; the review flagged it as RFC 06's trap.
- **`eff = (base + Σ add) × Π mul`**, in that fixed order, so two trinkets in
  either draft order give the same number. That is a determinism requirement in a
  game with seeds and saves, not a nicety.

Hardness and machine rates use the same mechanism, with the base living on the
data row where there are as many as there are rows. A `kind:'scale'` tunable is
the 1.0 a trinket bends, and `scope` says what may follow a dot:

```js
{ key:'hard.tin',      mul:0.5  }    // one material softer
{ key:'rate.furnace',  mul:1.25 }    // one machine faster
{ key:'fallSafe',      add:40   }    // five more feet of forgiveness
```

The store is unbypassable, and that is enforced rather than hoped for:
`tools/layers.mjs` fails the build if any file except `model/mods.js` imports
`data/tuning.js`. Without that rule, one lazy call site reading the constant
directly would silently opt out of every trinket in the game, and nobody would
notice for a month.

## What I stubbed

Leaves, never structure. Every one of these is marked `STUBBED LEAF` at the site.

- **`core/pixels.js`** — `R`, `glow` and `drawText` forward to `fillRect` and
  the 5x7 glyph table is not reproduced. Art and visuals are out of scope.
- **`view/scene.js`** — the offscreen chunk canvases, the repaint budget and the
  LRU cap. The *invalidation* is real (`stale()`), because that is the part with
  an architectural consequence; see `## What fought me`.
- **`rules/player.js`** and **`rules/items.js`** — single-shot integration
  rather than a swept one. `model/collide.js sweep()` shared by both, which RFC
  04 specifies, is not built. Player physics is out of scope.
- **`rules/generate.js`** — layers and blobs read the rows' numbers and write
  tiles; the noise is one `rand()` per candidate, and `gen.guaranteed` and
  `gen.trees` are declared by rows and not consumed. Worldgen is out of scope.
- **`rules/fields.js`** — no diffusion, per the brief. Storage, the active set,
  decay, the overlay and the recipe gate are all real; the transport step is a
  comment saying where the upward bias goes.
- **`shell/notify.js`** — the ZzFX call and the toast queue. `data/sfx.js` holds
  names with `null` parameter arrays.
- **Input, the tutorial director, tribute cycles, carts and chutes** — omitted.
  `shell/main.js` declares the `cmd` shape the schedule is written against and
  nothing fills it.

## What fought me

**1. The blood winch is where flags-on-rows loses to composed slots, and it is
close.** My `from:'vital'` solves the brief's actual question — is fuel generic?
— without minting a substance, and I think it is a better answer than the one
RFC 04 shipped. But be clear about what it is: `data/sources.js` is a **closed
three-row table whose rows contain code**, and `bind()` in the interpreter has a
branch on `units`. RFC 02's `BloodBurner` *provides* the same `heat` slot from a
different source and is a new file that nothing else knows about. Mine is a new
row plus, potentially, an edit to a shared function. For the fourth machine my
design is cheaper; for the fourth *kind of capability* 02's is, and DESIGN has
at least three more of those in it (ichor, favour, suspicion). That is the
honest trade and I do not think the ceremony of components would have paid for
itself at four machines — but at twenty capabilities it would.

There is also a hole I did not close: `look.pips` takes substance selectors, so
the winch can draw a pip row for its timber and **cannot draw one for hearts**.
The machine that eats you has no machine-level UI saying so. Fixing it means
teaching `look.pips` about named units, which is a third place the
substance/unit distinction leaks. Left visible rather than papered over.

**2. Anaemic rows plus a procedural interpreter is the repo owner's original
complaint and I have not made it go away.** RFC 04 concedes this as its weakness
1, and it is true here: to know what the furnace does you read a row and then you
read `rules/machines.js`. Three things reduce the damage and none removes it.
The row is the shorter half. The row is *exhaustive* — there is no second place
furnace behaviour can hide, which is not true of a class with four ancestors.
And where a flag genuinely cannot carry the logic, the escape hatch exists and
is confined: `data/sources.js`, three rows, with the price written at the bottom
of the file.

That price is real and I want it stated rather than mentioned. A file in `data/`
that contains functions **is no longer serialisable, diffable or shippable as
content**. Every other table here could be JSON: dumped for a modder, diffed
between two builds to explain a balance change, hashed for a determinism test.
`sources.js` cannot. Worse, `tools/resolve.mjs` reads names and not function
bodies, so a dangling reference inside one of those closures is invisible to the
one net this design is proudest of. Three rows was judged worth it. Thirty would
mean this architecture chose wrong and a design that puts behaviour on the
semantic object should win, and I would rather write that sentence now than
defend the position later.

I also went the other way once, deliberately. RFC 04 put the throughput servo in
the furnace row as `boost:(m, api) => api.fill(m,'#ore') > 0.55 ? 1.38 : 1`. I
replaced it with `servo:{ over:0.55, mult:1.38 }`, because a servo has a *shape*
shared by every machine and a declarative flag is greppable, checkable and
diffable where a closure is none of the three. The hatch is for behaviour with no
shape. If it starts absorbing behaviour that has one, the checker cannot see it.

**3. `model/` drifts toward a god object, exactly as RFC 04 predicted.** Twelve
files, and `shell/boot.js` has nine reset obligations that are hand-listed and
will be forgotten. `model/aim.js` exists for one reason: the HUD draws the
reticle, and `view` may not import `rules`. Three lines of state, a `newRun()`
obligation and a whole file, to hold a transient that morally belongs to the
mining rule. Multiply that by tutorial progress, camera shake, hover targets and
the surface silhouette and the shape of the problem is clear. I think the trade
is right — the alternative is the renderer importing gameplay, which is how
`paint.js:127` happened — but it is a trade and not a free win.

**4. Threading the band through every query is noise I chose on purpose.** The
review found that RFC 04's `model/world.js` allocates into a mutated singleton,
which blocks DESIGN item 18: Tartarus below Hades, reached by descending, needs
two bands resident. So `bands` is an array and every tile query takes the band
first: `tileAt(b, tx, ty)`. That is one extra parameter on roughly forty call
sites, and it is the single ugliest thing about reading this code. The
alternative was discovering the problem in act three.

**5. The enforcement made the design better once, which surprised me.** The
epoch guard says `render()` must not move the mutation counter. But the chunk
cache has to know which chunks changed, and the obvious mechanism — `view` clears
a dirty flag after repainting — is a write. Rather than exempt it, I changed
`model` to keep a per-chunk **version counter that only goes up**, and `view`
keeps its own map of "the version I last painted". Better invalidation, no
write, and the friction is what found it. That is the strongest argument in this
prototype for enforcement over convention, and I did not expect it to come from
the renderer.

**6. The resolver is a second place to edit when the *vocabulary* grows.**
Adding content touches one file. Adding a *flag* touches three: the row, the
interpreter, and `tools/resolve.mjs`, which has to learn what the new flag
promises or the safety net has a hole in exactly the shape of the newest
feature. `outFrom` needed ~15 lines of resolver. That is a genuine ongoing tax,
it is invisible until you forget to pay it, and no other design in the set has
this particular cost because no other design has the net.

## Faithfulness

Deviations from RFC 04, all deliberate.

1. **Added an output-side recipe selector (`outFrom`).** The review verified two
   benchmark failures in 04 and this is the first: 04's furnace wrote
   `out:{ ingot:1 }` as a literal with no output selector anywhere, so adding
   `tin` did not produce a tin ingot — the furnace *swallowed* tin, via
   `accepts:['#ore']`, into a buffer no recipe consumed, and it accumulated
   forever. `outFrom:{ input:'#ore', field:'smeltsTo', n:1 }` binds the input
   selector to the substance that actually satisfied it and reads the output off
   that row. One furnace row, every ore that will ever exist. This also turns
   DESIGN item 4 (refinement tiers) from AWKWARD — 04 needed one hand-written
   recipe per (substance × tier) — into a `refinesTo` field beside `smeltsTo`.
   I went further than the review's "~10 lines of engine code" and taught
   `tools/resolve.mjs` to prove reachability, so the silent-swallow failure mode
   is a build error and not a lesson.
2. **Built the tunable store (`data/tuning.js` + `model/mods.js`).** DESIGN
   item 8; RFC 04 had nothing, and the review noted 04's frozen `data/` forces
   the modifier layer into the right place without building it. Added the
   enforced import rule so it cannot be bypassed.
3. **`model/mining.js` is a `Map`, not a `Float32Array(tw*th)`.** The review's
   objection is right: 196 KB resident to describe the three tiles currently
   being hit. Same float seconds, same absence of a truncation bug.
4. **`model/world.js` keeps an array of bands, and queries take the band.**
   04 allocated into a singleton, which the review found blocks item 18.
5. **The servo is a declarative flag, not an inline function.** The review said
   to discard 04's inline `boost` and I agree for anything with a shape; the
   inline-function hatch survives only in `data/sources.js`, where it buys the
   blood winch. Reasons and price in `## What fought me`, item 2.
6. **`matches()` lives in `data/substances.js`, not `model/space.js`.** It is
   pure and it operates on the substance table, and putting it in `data` lets
   `tools/resolve.mjs` use the same implementation the game does. One selector
   grammar, one implementation, no DOM needed to check it.
7. **Per-chunk version counters instead of dirty flags** (see `## What fought
   me`, item 5).
8. **`tools/layers.mjs` grew four rules** beyond 04's table: no `class`, no
   `this`, per-file import rules (`data/tuning.js` may only be imported by
   `model/mods.js`; `view` may not import `rand`), and comments are stripped
   before matching so a commented-out import is not an edge. 145 lines, of which
   the rule table is the first thirty and the rest is a file walk and a DFS.
9. **`tools/resolve.mjs` is its own file**, not "the same tool", so the layer
   check can run before any module is imported and still be section 0.
10. **Not built, though 04 specifies them:** `model/collide.js sweep()`,
    `rules/director.js`, `data/beats.js`, the cache LRU and repaint budget. The
    first is a bug fix the brief puts out of scope; the rest are content systems
    with no bearing on the questions being graded.

## Where DESIGN pushes back

The review marked 04 AWKWARD on items 4, 8, 12 and 18. Items 4 and 8 are now
clean (`outFrom`; `model/mods.js`), 18 is addressed (band array), and 12 is
better but not free (`from:'vital'`; see above). Two honest residuals:

- **Item 9, machines granted mid-run.** `MACHINES` is frozen at import, so a
  boon machine must already have its row in the table and be gated by a
  run-scoped `granted` set. A genuinely new row appearing at runtime is not
  possible here, and I would not unfreeze the table to get it — frozen content
  is the property everything else in this design is buying.
- **Item 21, belts and pipes at scale.** Chutes as tiles in `model/tiles.js`
  plus a `rules/` transport pass is the obvious path and nothing blocks it, but
  no proposal in the set solves belt-scale routing well and this one does not
  either.
