# 00 — Final review of the three skeleton architectures

Reviewer's grounding: `prototypes/BRIEF.md`, `docs/rfc/REVIEW-CRITERIA.md`,
`docs/rfc/00-REVIEW.md`, RFCs 02 and 04 in full, `docs/DESIGN.md`, all three
prototypes read as source, and the current `src/`. Every numeric claim below was
either re-measured or produced by mutating a copy of the prototype and running
its own tooling; those are marked **verified**. Claims I could not settle are
marked **uncertain** rather than smoothed over.

Per the brief: no judgement here concerns bugs, framerate, performance or
visuals, and incompleteness the brief declared out of scope is not penalised.

**Verdict up front: synthesis, not rejection.** All three clear the DESIGN.md bar
(A 18/4/0, B 20/2/0, C 19/3/0 — the failing threshold was more than 5 non-CLEAN).
The recommendation is **C's structure and enforcement, plus B's `substance × form`
content model, plus C's `from:`/`sources.js` answer to the blood winch, and
explicitly *not* A's three-way part split.** Reasoning in §G.

---

## Correction to the shared premise

**`src/` is 19 files / 2,068 lines, not 16 modules / 1,889.** (`find src -name
'*.js' | xargs wc -l`.) All three prototypes inherit the brief's figure. Verified.
It changes no conclusion but flatters every ratio slightly.

Two other things have moved since `00-REVIEW.md` was written, and they matter for
grading:

- **The granite truncation bug is already fixed in `src/`.** `world/grid.js:38-39`
  now stores `prog: new Float32Array(...)` in seconds and `damage()` at
  `grid.js:96-110` compares seconds to seconds, with a 10-line comment naming the
  old defect. So "mining lives in the tile storage module" is now a *placement*
  complaint only, not a bug. All three prototypes still fix the placement.
- **`CLAUDE.md`'s "Where to look" tree does not match `src/`.** It names
  `world/layout.js`, `excavate.js`, `strata.js`, `build.js`, `bootstrap.js`; none
  exist. This is out of scope for the review but the winning commission should
  update it, because it is the first file a newcomer reads and it currently
  misdirects them.

---

## A. Verifying the claims

### A.1 Adding the kiln — mentions vs required edits

Raw `grep -rn kiln src/` counts, **verified**: A = 12 lines across **9 files**,
B = 13 lines across **7 files**, C = 3 lines across **1 file**. The prompt's
9/7/1 reproduces exactly.

Separating the two questions:

| | files that *mention* kiln | of which pure prose | files a dev **must edit** | as shipped |
|---|---|---|---|---|
| **A** | 9 | 5 (`data/parts.js:74`, `data/recipes.js:33-38`, `data/trinkets.js:19`, `data/tunables.js:16,20`, `rules/parts/burner.js:5`, `rules/parts/recipe.js:92`) | **3** | 4 |
| **B** | 7 | 3 (`comp/burner.js:9,18`, `comp/recipe.js:19`, `sim/tables.js:47,58`) | **4** | 5–6 |
| **C** | 1 | 2 of the 3 lines are the row's own comment | **1** | 1 |

Detail, checked against code:

- **A claims 4 files.** True and honestly itemised: `data/substances.js` (the
  `brick` row, `substances.js:74-84`), `data/recipes.js` (the `bake` row,
  `recipes.js:42-46`), `data/machines.js` (the row, `machines.js:49-60`), and
  `data/palette.js` (3 `brick*` hues, which A itself marks **avoidable**). So the
  honest number is **3 required**. The ninth mention, `shell/boot.js:59`
  (`place('kiln', 50, 30)`), is demo placement, not a requirement.
- **B claims 5 files, 4 data + 1 optional.** True but **understated by one**.
  Required: `data/forms.js` (the `brick` form + `bakeable` tag on `gravel`,
  `forms.js:22,24`), `data/substances.js` (append `'brick'` to three `forms`
  lists), `data/recipes.js:29-31`, `data/machines.js:52-63`. `render/looks.js:27`
  is genuinely optional. Not counted: `data/boons.js:47` — `main.js:41` refuses to
  place anything not in `session.run.granted`, so making the kiln reachable needs
  either a `MACHINE_BOONS` row or an edit to the granted list. Honest number:
  **4 required, 5 to make it appear in the game, 6 with art.**
- **C claims 1 engine-relevant file plus 1 test probe.** True, with the
  precondition C states: `gravel` and `brick` already exist as substance rows
  (`substances.js:120,126`). Adding the kiln from scratch in C would be 2 files.
  The 1-file result is real and not an accounting trick — it follows from a
  structural choice, that **C keeps recipes inline in the machine row** while A and
  B route them through a tag into a separate `RECIPES` table.

That structural choice is the single largest comprehensibility difference in the
set, and it is worth pricing. In A and B, "add a machine with a new verb" is two
files that must agree, with the agreement carried by a string (`tag: 'bake'`). In
C it is one file, and the recipe is three lines below the `accepts` selector it has
to match. **And in all three builds, the tag-keyed pool has exactly zero cases of
cross-machine reuse** — A: `smelt`/`crush`/`bake`, one machine each; B: identical.
An indirection with no second consumer is criterion 5's definition of a defect.

### A.2 Adding `tin` — A and C claim 1 file

- **A: verified true, 1 file.** `data/substances.js:89-99`. The row reuses existing
  hues (`irA`, `irB`, `irD`, `limeA`), so no palette edit. A's smoke run confirms
  the consequence: `furnace produced 1, items on the ground: ingot` with no furnace
  edit. A also declares the palette caveat for substances wanting a new hue.
- **C: claims 2 files and ships 2** — `data/substances.js:139-149` plus four
  `snA..snD` entries in `data/palette.js`. Claim true; would be 1 with reused hues.
- **B: claims 1 file, and that is false as shipped.** `data/substances.js:36-44`
  references `P.tinA`, `P.tinB`, `P.tinC`, `P.tinD`, all four of which are new
  entries in `core/palette.js:5`. B's README says "Nothing else." That is a second
  file, and it is the only one of the three claims that does not match what
  shipped. Small, but A and C both volunteered exactly this caveat and B did not.

So the one-row claim holds in all three; the honest range is **1–2 files**, and the
difference is which hues the author chose rather than anything architectural.

Both A and C also close the trap the prior review found in RFC 04 — an ore
swallowed by `accepts:['#ore']` into a buffer nothing consumes. **Verified** in C:
deleting `smeltsTo` from the tin row makes `tools/resolve.mjs` print
`substances.tin: tagged 'ore' but has no smeltsTo — a furnace would swallow it
forever`. A's equivalent is `tools/layers.mjs:220-228`. B avoids the trap
structurally: `$s` binds a substance and `{form:'ingot', sub:'$s'}` derives the
output, so there is nothing to forget.

### A.3 A's finding that "`rules` may not import `rules`" is false as stated

**The finding is real; the attribution is wrong.**

Real: a machine driver must bind eleven part functions, and in A they all live
under `rules/`. `rules/machines.js:20-30` imports eleven `rules/parts/*` modules.
Under 04's table as written that is eleven violations.

Wrong: **C proves the rule holds intact.** `node tools/layers.mjs` in C reports
`dependency direction clean (0/0, 143 edges)` with `RULES_MAY_IMPORT_RULES = false`
and `grep -rn "^import" C-layered/src/rules/*.js` finds **zero** rules→rules
edges — **verified**. So the rule is not false as RFC 04 states it. It is
*incompatible with a part-function vocabulary*, which is a cost of A's composition,
not a defect in RFC 04. A's own §5 of "What fought me" is more accurate than its
summary claim: it says "a machine driver must know the part functions, so something
must import eleven modules that all live in `rules`."

**Is the weakening honest or a loophole? Honest.** The sub-layer is declared in the
`MAY` table (`layers.mjs:34-42`), `rules/parts` is denied itself
(`'rules/parts': ['core','data','model']` — no `rules/parts` entry), `layerOf`
resolves the two-segment prefix first (`layers.mjs:50-54`), and the dispatch is a
table not a reference. The property 04 was buying — a `rules` module is a pure
`step(dt)` over `model` and cannot reach a sibling — survives for the drivers, and
parts genuinely cannot reach each other. It is a smaller claim, stated as a smaller
claim, and enforced. Not a loophole.

But it is a cost that only A pays, and C's clean 0/0 with the rule intact is the
better evidence about which design fits the constraint.

### A.4 C's claim: the kiln needed one row plus nine changed literals

**Verified true, and the count is honest.** Diffing `machines.js:92-107` (crusher)
against `machines.js:155-171` (kiln): `id`, `name`, the `accepts` selector, the
`cap` selector, the recipe's `in`, `out` and `secs`, the pip selector, and four
`look` colour keys — plus one line that is *not* a copy,
`needs:{ heat:{ min:30 } }`. That is 9 changed values and 1 added line, exactly as
stated. `tools/check.mjs` probes both halves and both pass.

One consequence worth naming, because it is a design difference and not just an
implementation one: **C's kiln has no burner and no fuel.** It bakes on ambient
field heat, so it must sit in a furnace's plume. That is a defensible and arguably
better reading of "bakes" — it makes DESIGN item 5 (buoyant heat) arrive as a
consequence rather than a feature — but it means C does not demonstrate
fuel-burned-over-time anywhere except the winch, where the review's
"fuel burned *at the lifter*" requirement actually lives. A demonstrates both.

### A.5 Verification quality, since all three make execution claims

- **C is the only prototype with a regression-capable harness.** `tools/check.mjs`
  has an `ok(name, cond, extra)` helper, a `fails` array and a non-zero exit
  (`check.mjs:70-71`). **Verified**: deleting the kiln's heat gate produced
  `failed: 1 / FAIL a cold kiln does not bake`, exit 1.
- **A's `tools/smoke.mjs` is a printer, and says so** — "not a test harness, a
  claim receipt" (`smoke.mjs:2`). It contains one `throw` and no assertions. It
  makes A's claims cheap to *read* but it will not fail a future regression.
  `tools/layers.mjs` and `tools/epoch.mjs` do assert and do exit 1.
- **B ships no tooling at all** — no `tools/`, no `.mjs`, no `package.json`.
  That is within its brief ("B was not asked to") and B declares the absence of a
  layer checker under Faithfulness 9. But it means B's execution claims are not
  reproducible from what shipped. I reproduced the important ones myself with a
  scratch driver: the kiln bakes `copper:brick` (4 crafts from 8 gravel — 2→1
  confirmed), `snapshot()` round-trips through `JSON.parse` at **15,825 bytes**
  (B claims "16 KB"), and `k2.slots.catch.buf === k2.slots.buffer` is `true` after
  restore. **B's claims check out.** Against criterion 7's "honest verification",
  the ranking is C > A > B.

---

## B. The cross-prototype safety test

The test, applied concretely: **a machine declares a heat-gated recipe and omits
its heat provider. Does each prototype catch it, and when?**

### B — caught at boot, by a hand-written table join

**Verified.** Deleting `['Burner', { fuel: { tag: 'fuel' }, secs: 8 }]` from
`data/machines.js:59` and calling `checkTables()`:

```
data tables:
  MACHINES.kiln: recipe 'bake' is `hot: true` but no part provides `heat`
  -- add a Burner (or a BloodBurner) to this row.
```

Exactly the promised message. The mechanism cannot catch it —
`comp/recipe.js:24` declares `needs: ['buffer','emit','heat?']`, and it *must*,
or the crusher cannot exist — so `sim/tables.js:66-70` joins `MACHINES` against
`RECIPES` at boot. B's own analysis of this is correct and is the most valuable
paragraph in any of the three READMEs.

### A — caught at build time, by the same kind of hand-written join

**Verified.** Deleting the `Burner` row from A's kiln:

```
violations: 2 (budget 0)
  data/machines.js kiln.HeatEmit: needs slot 'heat' and no part provides it
  data/machines.js kiln: recipe 'bake' requires heat and this machine has no heat provider
```

The first line is incidental — it fires only because A's kiln happens to mount
`HeatEmit`, whose `needs: ['footprint','heat']` is mandatory. Deleting *both*
parts isolates the real check: `tools/layers.mjs:189-194` still fires with
`recipe 'bake' requires heat and this machine has no heat provider`. **Verified.**

So A has the identical hole in the mechanism — `data/parts.js:58` declares
`needs: ['buffer','emit','heat?','servo?']` and `rules/parts/recipe.js:44` returns
`'COLD'` forever when `need.heat` is null — and closes it with the same kind of
hand-written join. **A's advantage over B is one step earlier and one degree
better**: it fires before any module is imported rather than at boot, and it
reports the *consequences* of the typo, not just the typo. B's fires at boot, which
in practice is the same edit-test cycle.

Both are outside the mechanism. Both are hand-written per condition. B's warning
generalises to A verbatim: "any conditional requirement has to be re-expressed in a
validator, and the validator is hand-written per condition."

### C — the failure mode does not exist in this shape, and the analogue is caught by name but not by scope

C has no provider parts, so there is nothing to forget. Heat is a *field* value
read at the machine's tile (`rules/machines.js:179-187`). The three analogues:

1. **Gate on a field name nothing declares.** **Caught, verified**:
   `machines.kiln.recipes[0]: needs field "smoke" is not declared by any band`
   (`resolve.mjs:156-159`).
2. **Gate deleted, so the kiln bakes cold.** Caught only by C's own content probe
   — **verified**, `FAIL a cold kiln does not bake`. That is a test, not a
   mechanism, and it exists because the author wrote it.
3. **Gate on a field that exists in *some other* band.** **Not caught — a real
   hole, verified.** Changing the kiln's gate to `needs:{ water:{ min:30 } }`
   passes `resolve.mjs` with `ok every name resolves`, because `FIELDS`
   (`data/world.js:40`) is the *union* over all bands and only the `aquifer` band
   declares `water`. `fieldAt` returns 0 for a missing field
   (`model/fields.js:54-58`), so a kiln in the surface band silently never bakes.
   Only the hand-written probe caught it (`FAIL a hot kiln bakes ... items none`).

   This directly contradicts `data/world.js:16-18`: "a machine emitting into a
   field the band does not have is a build error, not a silent no-op —
   `tools/resolve.mjs` checks it." It checks the union, not the band. **The same
   union hole exists in A** (`layers.mjs:230-232`), where A's `bake` row already
   gates on `field:{ water:{ max:0.1 } }` and a band with no water reads 0 and
   passes. A *declares* that direction of the hole (`recipes.js:38-40`, "a clause
   about a field a band does not have is inert rather than an error") but neither
   prototype catches the `min` direction, which is the silent one.

### The conclusion I draw from this test

The interesting result is not the scoreboard, it is that **all three needed a
hand-written validator for a conditional requirement, and none of them got it from
the mechanism.** A's slot contracts in `data/slots.js` do not close the hole — the
optional-slot problem is identical, and A's fix is the same shape as B's, just
earlier. C's flags-on-rows avoids the specific shape by not having providers at
all, and pays for it with the union-scope hole instead.

So on this axis: **A ≈ B > C on the specific test** (both catch it, A earlier), and
**C > A ≈ B on the generalisation** (C has one class of conditional gate to
validate; A and B have one per optional slot, forever). None of the three can claim
its mechanism makes silent failure unrepresentable, and the honest framing for the
commission is: *a resolution pass with hand-written cross-table joins is a
permanent, recurring tax, and it is worth paying.* C names this exactly, as its
"What fought me" item 6 — "adding a *flag* touches three: the row, the interpreter,
and `tools/resolve.mjs` ... it is invisible until you forget to pay it."

---

## C. The DESIGN.md coverage matrix

All 22 items × 3 prototypes. **CLEAN** = a path with no new engine mechanism
beyond what the prototype already specifies. **AWKWARD** = implementable but needs
a mechanism the prototype lacks, fights its grain, or costs boilerplate per
instance. **BLOCKED** = requires changing something the prototype declares fixed.
`Δ02` / `Δ04` compare against the prior review's cell for the source RFC.

### Economy and progression

| item | A (slots+layers) | B (composed) | C (layered) |
|---|---|---|---|
| **1** Cost of ascension | CLEAN — `item.mass` on rows; `Burner` at the lifter; `lift.up/down` are tunable *names* | CLEAN — `mass × FORMS.massK`; ratios are recipe in/out counts (=02) | CLEAN — `mass`; `lift:{span,up,down}` + a charge economy spends fuel at the winch |
| **2** Tribute cycles | CLEAN — declared out of scope; `run.cycle`, `journal` and a bands Map exist, and a new `rules/director.js` is the architecture's normal move | **CLEAN, and the only one built** — `sim/run.js` (107-line director) + `data/cycles.js`; meta/run/world split. **Δ02: AWKWARD → CLEAN** | CLEAN — same as A; declared not built |
| **3** Torments, run vs meta | CLEAN — `run` + `META` (`model/run.js:26`); machine snapshot is `{id,def,tx,ty,parts}` and JSON round-trips. **Δ02: AWKWARD → CLEAN** | CLEAN — `sim/save.js` serialises the *inputs to* `assemble()`; verified 15,825 B round-trip. **Δ02: AWKWARD → CLEAN**, with a declared residue: an incomplete `persist` list is silent | CLEAN — `RUN_SCHEMA` (borrowing RFC 01's `resetTo`) + plain records; no `META` and no save built, but nothing blocks either |
| **4** Refinement tiers | **AWKWARD** — `forms` dropped, so five tiers × N ores is N×5 substance rows each with tile/item/look. **Declared** ("if item 4 needs per-substance identity, forms should come back"). **Δ02: CLEAN → AWKWARD** | **CLEAN** — `substance × form`; `FORMS` already has 5 rows; `$s` covers every substance at every tier. Best in the set (=02) | **AWKWARD** — `outFrom` removes the *machine* edit but not the row explosion, and C's own content proves the collapse: `tin.smeltsTo:'ingot'`, so a tin ingot **is** a copper ingot. C claims this item "is now clean"; **undeclared overclaim** |

### Fields and physics

| item | A | B | C |
|---|---|---|---|
| **5** Buoyant heat | CLEAN — `model/fields.js` + active set + `HeatEmit` part + a recipe `field:` clause | CLEAN — `world/field.js` + `HeatVent` + `band:[lo,hi]` | CLEAN — `emit:[{field,at,rate}]` as a flag + `needs:{heat:{min}}` |
| **6** Bottom-up flooding | CLEAN — bands declare `water`; a `field:` clause reads it. `FluidPort` deliberately not built | CLEAN — a second `Field`; a fluid component is one file | CLEAN — `mode:'fluidIn'` + `fw.drain` already wired (`rules/machines.js:57-59`) |
| **7** Failure states | CLEAN — per-machine failure is a new part (3 edits); cross-cutting is a new `rules/` module | CLEAN — one self-contained component each; composition's genuine strength (=02) | CLEAN — thermal runaway and flood are already `needs:{field:{max}}`; cave-in and wrath are new `rules/` modules |
| **8** **Trinkets** | **CLEAN** — `data/tunables.js` + `model/mods.js`, source-keyed, scoped, revocable; **every `stat()` call site and every trinket scope checked statically**. **Δ04: AWKWARD → CLEAN** | **CLEAN** — `sim/tunables.js`, source-keyed, `hard.*` wildcard; HUD reads through the same call as the sim. **Δ02: AWKWARD → CLEAN** | **CLEAN** — `data/tuning.js` + `model/mods.js`, fixed `(base+Σadd)×Πmul` order, **and `tools/layers.mjs` fails the build if any file but `model/mods.js` imports the base table**. **Δ04: AWKWARD → CLEAN** |
| **9** Machines granted mid-run | AWKWARD — `MACH` is frozen at import; a boon machine must pre-exist and be gated by a `granted` set (not built) | CLEAN — no boot compile of ids; `MACHINES` is a plain object, `assemble()` works at any time, and `run.granted` + `MACHINE_BOONS` are built (=02) | AWKWARD — frozen `MACHINES`; **declared honestly**, and C says it would not unfreeze the table to fix it |
| **10** Miracles | CLEAN — `model/tiles.js write.*` from a new `rules/` module | CLEAN — `world.tiles.set` + a plain function | CLEAN — same as A |
| **11** Mutually hostile boons | CLEAN — `field:{heat:{min,max}}` ships; two bounds is the documented Dionysus case | CLEAN — `band:[lo,hi]` ships | CLEAN — `needs:{heat:{min,max}}` ships |
| **12** **Blood winch** | **CLEAN** — one row; `BloodBurner` provides the same `heat` record; verified `hearts 3 → 1, deck 31.5px`. `Deck` untouched | **CLEAN** — the source design's strongest cell, preserved intact and verified via `explainHost` | **CLEAN** — `from:'vital'` + `data/sources.js`; verified (hearts 5→4, charge banked, last heart refused, row order = the trap). Health never becomes a substance and the HUD is untouched. **Δ04: AWKWARD → CLEAN.** Declared price: one `data/` file holding code, plus ~10 lines in `bind()` |

### Monsters and the Hades act

| item | A | B | C |
|---|---|---|---|
| **13** Emission-driven aggro | CLEAN — `HeatEmit` generalises to noise/light (one part each) | CLEAN — a `Noise` component on any host; monsters are `ACTORS` rows through the same `assemble()` | CLEAN — `emit:[{field:'noise'}]` needs *zero* new mechanism for the emission half |
| **14** Monsters attack logistics, ride the lift | **AWKWARD** — A's parts/slots vocabulary is **machine-only**: there is no actor table and `model/player.js` is a plain record, so a `Rider` capability has nowhere to mount. **Undeclared narrowing vs RFC 02** | **CLEAN** — `data/actors.js` uses the same `assemble()`; `Body`/`Pick`/`Inventory`/`Hearts` are ordinary components; "rides the lift" is a `Rider` row. Best in the set | CLEAN — a new `model/actors.js` + `rules/monsters.js` is C's normal idiom; boilerplate, obvious home, no closed map |
| **15** Ichor | CLEAN — a named field (`bands.js:29` already declares `ichor`) + a part | CLEAN — a producer component; `FluidPort` deliberately deferred | CLEAN — `fluidIn` port + `fw.add` |
| **16** Hades wants mass | CLEAN — `mass` on rows; a sink is a row with an empty `out` | CLEAN — a `Sink` component | CLEAN — `out:{}` banks a charge and the row's comment names the Hades spoil sink explicitly |
| **17** Suspicion / concealment | CLEAN — `run.suspicion` exists and `model/journal.js` is a real rules→shell channel many rules may push to | **AWKWARD, self-declared and the sharpest admission in the set** — "no host owns" a downward-tonnage observer; the honest answer is a per-step journal, "which is a bus". **Δ02: CLEAN → AWKWARD** | CLEAN — `model/journal.js` + one `model/suspicion.js` read by many rules; `view` may legally read model state |
| **18** Tartarus | CLEAN — `model/world.js` is a Map of bands; three band rows with `origin`, one of them `tartarus`. **Δ04: AWKWARD → CLEAN** | CLEAN — `createWorld(cfg)` returns instances; two bands verified coexisting (=02) | CLEAN — bands array, band-first queries. **Δ04: AWKWARD → CLEAN.** Declared cost: one extra parameter on ~40 call sites, "the single ugliest thing about reading this code" |

### Infrastructure the mockup had and the game still needs

| item | A | B | C |
|---|---|---|---|
| **19** Staged lift | CLEAN — `Deck` part, five rows placed five times, ascends only while `heat.hot` | CLEAN — `comp/deck.js`, same | CLEAN — `lift:{span,up,down}` flag + `rules/lift.js` spending charges |
| **20** Piles with backpressure | CLEAN — `cap` per selector (`{'#ore':4,'#fuel':2}`); `CatchBox` refuses when full | CLEAN — `cap` per form; the asymmetry is expressible | CLEAN — `cap` per selector |
| **21** Chutes, carts, pipes at scale | AWKWARD — no answer; tiles + a transport pass is the path | AWKWARD — self-declared; 2,000 belts as hosts is 16,000 objects | AWKWARD — self-declared; tiles + a `rules/` pass, unbuilt |
| **22** Fog of war | CLEAN — `view/overlays.js` exists | CLEAN — trivially addable, **but `world/field.js:24` claims "render/ has an overlays stage" and there is no such file**. Small undeclared inaccuracy | CLEAN — `view/overlays.js` + per-chunk version counters instead of dirty flags |

### Tally

| | CLEAN | AWKWARD | BLOCKED | vs source RFC |
|---|---|---|---|---|
| **A slots + layers** | **18** | **4** (4, 9, 14, 21) | 0 | no net change on either parent (02 and 04 were both 18/4/0) |
| **B composed objects** | **20** | **2** (17, 21) | 0 | **02: 18/4/0 → 20/2/0.** Fixed 2, 3, 8; degraded 17 |
| **C layered** | **19** | **3** (4, 9, 21) | 0 | **04: 18/4/0 → 19/3/0.** Fixed 8, 12, 18; item 4 claimed fixed, is not |

**All three pass criterion 2.** The threshold was more than 5 non-CLEAN; the worst
here is 4.

Two findings that cut against the priors:

1. **B has the best matrix, by a clear margin**, and it got there by building the
   three things the prior review told every commission to build (director, saves,
   tunables) rather than by any paradigm advantage. Its one regression — item 17 —
   is a *discovery*, not a slip: B found that a cross-cutting observer has no owner
   in a composition model, and said so against its own interest.
2. **A, the synthesis prototype, improved on neither parent.** It is the largest
   build (51 files, 2,442 lines, a 297-line tool), it pays the most ceremony, and
   it lands on the same 18/4/0 as both RFCs it composes. Its AWKWARD set (tiers,
   runtime machines, monsters-ride-lifts, belts) is *worse placed* than B's,
   because three of the four sit on the boon/monster axis DESIGN treats as core.
   That is the single most important number in this review.

---

## D. Comprehensibility, applied literally

The cold-open test: *"add tin ore, and add a kiln that bakes 2 gravel into 1
brick."*

**For reference, today.** `world/tiles.js` (a `MAT` row) → `sim/items.js` (a `KIND`
row, discovered only when tin items render as nothing) → `world/paint.js:127`
(for a glint) → `render/hud.js:57` (for a pocket swatch) — and then there is no
way to add a kiln without rewriting `sim/structures.js`, whose `FURNACE` constant
(`structures.js:21`) and 46-line `updateStructures()` interleave the catch box, the
hand-feed, the recipe and the emit. All three prototypes are a large improvement on
this; the question is by how much, and at what cost.

### 1st — C

**Files, in order:** `data/substances.js` (read the 40-line header once, append
the tin row; `brick` and `gravel` are already there) → `data/palette.js` (only for
a new hue) → `data/machines.js` (read the 40-line header once, copy the crusher row
above, change nine literals).

- **Copy an adjacent example?** Completely. Every value is a literal. The recipe is
  three lines below the `accepts` selector it has to agree with, in the same object,
  so there is no second file and no string handshake.
- **Must they understand machinery first?** No, to *add*. Yes, to know *why* — the
  interpreter is `rules/machines.js`, 213 lines, and C says so in its own header:
  "if you are here because you want to add a machine, you are in the wrong file."
  This is RFC 04's weakness 1 and C does not remove it; it confines it to one file
  that is the shorter half of the pair.
- **Typo locality?** Best in class for content. `node tools/check.mjs` names the
  row and the field before any module is imported, and section 1 additionally
  proves *reachability*, not just resolvability.
- **`grep kiln`?** One file, three lines. Best in the set by a factor of seven.

### 2nd — A

**Files, in order:** A's own reading order is five files *before* the first edit —
`data/slots.js` (96 lines) → `data/parts.js` (117) → `data/machines.js` →
`rules/parts/recipe.js` → `rules/machines.js`. To do the task:
`data/substances.js` (tin row; brick row) → `data/recipes.js` (bake row) →
`data/machines.js` (kiln row) → `data/palette.js` (avoidable).

- **Copy an adjacent example?** Yes for tin. For the kiln, mostly — but "bakes"
  requires knowing that a `heat:` clause in `data/recipes.js` and a `Burner` entry
  in `data/machines.js` must agree, which is a two-file invariant a copier will not
  infer from either file alone. The parts list is genuinely self-describing, and A's
  claim that you can enumerate a machine's capabilities from its row is true.
- **Typo locality?** **The best of the three, and materially so.** Deleting the
  `Burner` reports not only the missing part but its two consequences
  (`HeatEmit` loses its input; `bake` is unreachable). No other build does that.
- **`grep kiln`?** 9 files, 1 of which is the definition and 5 of which are prose.
  A's README concedes the shape of this. Greppability is diluted, not lost.
- **Cost:** the newcomer meets three vocabularies (slots, parts, recipes) before
  the first row, and the answer to "what does `HotServo` do" is spread over
  `data/parts.js`, `data/slots.js` and `rules/parts/hotservo.js`.

### 3rd — B

**Files, in order:** `data/machines.js` → `sim/assemble.js` → `data/forms.js` +
`data/substances.js` → `data/recipes.js` → `data/machines.js` → optionally
`render/looks.js` and `data/boons.js`.

- **Copy an adjacent example?** For the kiln, yes — the row is the crusher with one
  part added. For the *substance model*, no. Before the first edit the newcomer must
  resolve "is brick a substance or a form?", and B's answer is a rule they have to
  accept: `forms.js:11` — "A brick is fired copper gravel, and stays copper." That
  is defensible and it is stated in exactly one place, which is a real improvement
  over 02 where nothing stated it. But it is a modelling decision the newcomer
  cannot copy their way past, and it is the only such hurdle in the three builds.
- **Typo locality?** Excellent, and the *messages* are the best of the three
  (`kiln.Recipe needs slot buffer`, `kiln: two components provide slot heat
  (Burner and BloodBurner)`). Boot rather than build, which in practice is the same
  cycle.
- **`grep kiln`?** 7 files. And, as B honestly notes, "a third of them are prose:
  greppability here is partly a property of how much I commented."
- **Cost:** "why did the kiln stop" is a row, four `comp/` files and the slot graph.
  B's answer is `sim/explain.js`, and B agrees with its own RFC that needing that
  tool is an admission.

**Ranking: C > A > B.** This reproduces the prior review's prediction (04 > 02 on
criterion 1) and adds one finding: **the synthesis lands between its parents, not
above them.** Combining 04's layering with 02's vocabulary does not compound their
comprehensibility; it sums their reading costs.

---

## E. Is this actually an improvement on `src/`?

The five named complaints, per prototype:

| complaint (current site) | A | B | C |
|---|---|---|---|
| `FURNACE` const + bespoke `placeFurnace()` (`sim/structures.js:21,26`) | **fixed** — a row + generic `rules/place.js` | **fixed** — a row + `assemble()` | **fixed** — a row + generic `rules/place.js` reading `tw/th/footing` |
| `copper` defined twice (`world/tiles.js:30` `MAT`, `sim/items.js:20` `KIND`) | **fixed** — one substance row carries tile, item, look, gen | **fixed** — one row; `substance × form` splits *what it is* from *what shape you hold* | **fixed** — one row |
| `paint.js:127` string-compares a material id in the renderer | **fixed** — `look.treatments` + `view/treatments.js` table | **fixed** — `paint:[['glint',…]]` + `render/treatments.js` | **fixed** — and additionally **enforced**: `view` may not import `rules`, and the layer tool fails the build if it does |
| mining in the tile storage module (`world/grid.js:96 damage()`) | **fixed** — `rules/mining.js` + `model/mining.js` as a `Map` | **fixed** — `comp/pick.js`, mining as a verb of the agent | **fixed** — `rules/mining.js` + `model/mining.js` as a `Map` |
| world dims as module constants, arrays at import (`world/grid.js:19-20,38`) | **fixed, and better than RFC 04** — a Map of bands, coexistent | **fixed** — `createWorld(cfg)` returns instances | **fixed, and better than RFC 04** — an array of bands, band-first queries |
| *(unnamed, and the most consequential)* player tunables as `export const` (`sim/player.js:16-25`) | **fixed** + statically checked | **fixed** | **fixed** + the base table is unbypassable by build rule |
| *(criterion 4)* `sim/mining.js:6` imports `sim/tutorial.js` | **prevented by build failure** | not prevented (no checker, declined by instruction) | **prevented by build failure** |

So: **all three fix all five named complaints, plus the sixth that nobody named
and that blocks a third of DESIGN's reward economy.** None of them leaves any of
them. That is a real result and it is unanimous.

**Is the migration worth it?** Yes — but the honest answer is more specific than
that, and it is not "adopt a prototype."

*Worth it, unambiguously, and each independently valuable:*

1. **The tunable store** (~90 lines + ~20 call sites). Unblocks DESIGN item 8,
   which is one of three boon tiers. There is no cheaper way to get it and it does
   not depend on any other change. Do this first.
2. **Merge `MAT` + `KIND` into one substance table** (~130 lines). Deletes a whole
   class of "I added a material and it renders as nothing", which the prior review
   measured at 16 name references outside the two tables.
3. **Treatments and the HUD from data** (~90 lines). Kills `paint.js:127` and
   `hud.js:57-62`.
4. **`tools/layers.mjs`, run against the *current* three directories, in report
   mode, `LAYER_BUDGET=16`, ratcheting.** This is 145 dependency-free lines and it
   is the highest-value artefact in all three builds. Crucially, **it does not
   require the directory reorganisation** — the rule table can name
   `core/world/sim/render` today and be tightened later. That decouples the one
   thing that is definitely worth having from the ~490 LOC of moves that are the
   expensive part.
5. **The machine interpreter + `data/machines.js`** (~+140 / −92). This is the
   change that turns "add a machine" from a day into a row, and it is the reason
   the exercise happened.
6. **Bands as rows** (~100 lines). Settles DESIGN item 18 before act three rather
   than during it.

*Not worth it at 2,068 lines, on the evidence of these builds:*

- **A's three-way part split.** By A's own accounting a new capability costs three
  edits in three directories against RFC 02's one file. It bought no matrix
  improvement over either parent. And 4 of A's 11 parts (`HotServo`, `HeatEmit`,
  `Deck`, `BloodBurner`) have exactly one consumer today, with the `servo` slot
  having one provider and one consumer — which A concedes is "the thinnest slot in
  the table". Criterion 5 marks this against, and I am marking it against.
- **A separate tag-keyed `RECIPES` table.** Zero reuse in all three builds. It
  costs one file, one indirection and one class of typo per machine added.
- **A's 297-line resolution pass**, as a starting point. About a third of its
  checks exist only to police A's own flat-record design (the parameter/output
  collision check at `layers.mjs:140-143` is there because of a hazard A's split
  created). Start from C's 145+208 split and add checks as features earn them.
- **`substance × form`, *if* the game stays small.** See the one decision in §G.

The blunt version: **about 550 LOC of this is worth doing next month and would
still be worth doing if no architecture were adopted at all. The remaining ~1,000
LOC of directory reorganisation is worth doing only because the checker makes it a
ratchet instead of a rewrite** — and the checker can be installed first, which is
the ordering the prior review recommended and which I endorse.

---

## F. Faithfulness

### A — not materially out of spec; two real undeclared defects and one framing error

A declares 8 deviations from RFC 04 and 7 from RFC 02, all substantive and all
defensible; its Faithfulness section is the most thorough of the three. What it
does not declare:

1. **The parts/slots vocabulary is machine-only.** RFC 02 makes `Body`, `Pick`,
   `Inventory` and `Hearts` components and the player a host — that is how 02
   earns DESIGN items 13 and 14. A's `data/parts.js` has no such rows, there is no
   actor table, and `model/player.js` is a plain record. This is the largest
   undeclared deviation from either source RFC, and it is what costs A item 14.
2. **Duplicate parts of the same name silently collapse. Verified.** `host.parts`
   is keyed by part *name* (`model/machines.js:113`), so a kiln row with two
   `CatchBox` entries produces one record — the second row's `mouth:'left'` param
   overwrites the first's `mouth:'top'` — and `rewire()` pushes two `wired` entries
   both pointing at it, so the part ticks twice on the same state. `tools/layers.mjs`
   reports `ok`, assembly succeeds, and the tick trace shows
   `CatchBox -> CatchBox`. B, whose `host.parts` is an array of instances, handles
   the same row correctly. A machine with two output mouths, two vents, or a fluid
   in *and* out port is not expressible in A, and attempting it fails silently —
   the exact failure class this whole exercise is trying to eliminate.
3. **Framing error, not a defect:** "`rules` may not import `rules`" is presented
   as false as RFC 04 states it. C disproves that (§A.3). The weakening itself is
   honest and enforced.

### B — in spec, and the most faithful of the three

Nine declared deviations, every one either an improvement or required by the brief;
`assemble(table, …)` taking the table as a parameter is a genuine improvement over
the RFC and is what makes the actor model work. Undeclared, all small:

1. Tin required four new `core/palette.js` entries, so "Files touched: 1" is false
   as shipped (§A.2).
2. `world/field.js:24` claims "render/ has an overlays stage"; there is no
   `render/overlays.js`. RFC 02's layout specifies one.
3. Making the kiln placeable also needs a `data/boons.js` row or an edit to
   `run.granted`, not counted in the 5.

### C — in spec, and the only prototype that kept its source RFC's headline rule intact

Ten declared deviations, all defensible; two of them (`outFrom`, the band array)
are direct responses to verified failures in RFC 04, and the per-chunk version
counter instead of a dirty flag is a genuine improvement discovered *because* of
the enforcement — the best single argument for enforcement over convention in the
three builds. Undeclared:

1. **The item-4 overclaim.** "Items 4 and 8 are now clean" is true for 8 and not
   for 4: `outFrom` removes the machine edit but leaves one substance row per
   (substance × tier), and C's own content sets `tin.smeltsTo:'ingot'`, so tin
   ingots and copper ingots are the same object. Nothing in `resolve.mjs` can see
   that, and DESIGN's tribute escalation ("20 copper plates") needs the
   distinction.
2. **The union-scope hole**, contradicting `data/world.js:16-18` (§B). A shares it.

### Rejections on faithfulness

**None.** No prototype is materially out of spec. A's two undeclared defects are
real and are weighed in §G, but they are defects in a faithful build rather than
evidence that A built something other than what it was commissioned to build.

---

## G. Verdict — a synthesis

**Not a rejection.** The bar was more than 5 of 22 DESIGN items landing non-CLEAN
for every candidate; the worst here is 4, and every prototype fixes all five of the
complaints that started this plus the sixth nobody had named. Rejecting would be
perfectionism, and the escalation option exists for a real failure, not this.

### Adopt

**1. C's structure and enforcement, wholesale.** Six layers; `rules` and `view` as
mutually forbidden siblings; `rules` modules that may not import each other, with
that rule kept *intact* (C proves it holds at 143 edges); the journal flowing
downward as data; `tools/layers.mjs` including its four additions beyond RFC 04
(no `class`, no `this`, per-file import rules, comment stripping);
`tools/resolve.mjs` as a separate section-0 file; the epoch guard; and the
per-chunk version counter. **Why:** it is the only one of the three that converts
a separation-of-concerns claim into a build failure, it wins the
comprehensibility test the rubric weights heaviest, it is the smallest of the three
builds, and it is the only one with a harness that can fail a future regression.

**2. C's `data/` shape: flat frozen tables of literals, recipes inline in the
machine row.** Do **not** take A's or B's separate tag-keyed `RECIPES` table. It
has zero reuse in all three builds and it costs one file, one indirection and one
string handshake per machine. If cross-machine reuse ever appears, adding a `tag`
field to a row is two lines.

**3. C's `model/mods.js` + `data/tuning.js`, with the enforced import rule**, and
add A's two static checks on top: every `eff()`/`stat()` call site must name a
declared tunable, and every trinket scope must name a real recipe/machine/substance.
**Why:** this is the single best idea in the three builds. The enforced rule ("only
`model/mods.js` may import the base table") is what makes the store unbypassable,
and A's scope check catches the otherwise-perfectly-silent failure of a boon that
is granted, shown in the HUD, and does nothing for the rest of the run.

**4. C's `outFrom` output selector** and `resolve.mjs`'s reachability proof. Without
it RFC 04's own benchmark 1 is false; with it, one furnace row smelts every ore
that will ever exist and a new ore with no consumer is a build error.

**5. C's `from:` + `data/sources.js` for the blood winch — *not* a `Burner`
component.** This is the one place I recommend against the composition answer that
the prior review called "the strongest single argument in the whole document set",
and the reasoning is criterion 5. At four machines, a three-row source table with
`count`/`spend` is cheaper than an eleven-part vocabulary, and C's version is
strictly better on the thing the test was actually probing: health never becomes a
substance, `run.hearts` keeps its shape, the HUD keeps drawing five hearts, and
"never spend the last heart" lives on the source row where every future
blood-fuelled thing inherits it. Accept C's stated price — one `data/` file that is
not JSON — and adopt its stated tripwire verbatim: **three rows is fine, thirty
means this was the wrong call.** Also fix the hole C flagged: teach `look.pips`
about named units, so the machine that eats you can say so.

**6. B's `substance × form` model, replacing C's flat substances.** This is the one
place I overrule C, and it is the only genuine content-model finding in the review.
Flat substances make DESIGN item 4 cost one row per (substance × tier) — 5 tiers ×
5 ores = 25 rows each carrying tile, item and look blocks — and they collapse tin
ingots into copper ingots, which C's shipped content demonstrates and C's resolver
cannot see. B's `data/forms.js` is 5 rows plus one stated rule, and it makes
`outFrom`/`$s` produce a *tin* ingot. **How they compose:** `forms.js` is another
frozen table in `data/`, `matches()` already resolves `#tag` selectors and B's
forms carry tags in the same grammar, and the substance table stays the tile-id
array. No layer rule is affected. Take B's one-sentence rule at `forms.js:8-11`
verbatim, because it is the only thing that stops the ambiguity the prior review
found.

**7. B's eager cross-table join, generalised into `resolve.mjs`.** Every
conditional requirement — a recipe gate only some machines can satisfy — must be
re-expressed there, and that is a recurring tax, not a one-off. Write it into
`CLAUDE.md`. While you are there, close the union-scope hole both A and C have:
check field gates **per band**, not against the union of all bands.

**8. B's stall reason as data, reduced.** Not `explainHost()` as a debug tool — a
`stall` string on the machine record (C's interpreter already computes the
condition at `rules/machines.js:179-187`) so "why did the kiln stop" is a HUD read.
This is the cheap 80% of B's answer to its own weakness 1.

**9. B's `ACTORS` table, and only if monsters land.** `assemble(table, …)` over a
small vocabulary (`Body`, `Pick`, `Inventory`, `Hearts`, later `Rider`) is the one
place composition clearly earns its keep in these three builds, and it is what
makes DESIGN item 14 CLEAN. Do not build it before the second actor exists.

**10. A's error-message *style*.** A's checker reports the consequences of a typo,
not just the typo ("mistyping `Burner` reports that `HeatEmit` loses its input and
`bake` becomes unreachable"). That is a writing convention, costs nothing, and is
the best failure-locality property in the set.

### Reject

- **A's three-way part split** (`data/parts.js` + record + `rules/parts/*.js`).
  Three edits in three directories per capability (A's own finding); duplicate
  parts collapse silently (verified, undeclared); the vocabulary does not extend to
  actors (undeclared); it forced the weakening of RFC 04's one distinctive rule;
  4 of 11 parts and 1 of 6 slots have a single consumer; and it produced **no net
  matrix improvement over either parent** while being the largest build of the
  three. On criterion 5 this is the clearest speculative generality in the set.
- **A's 297-line resolution pass** as a starting point; take C's and grow it.
- **B's per-instance component state with methods.** B's own residue is
  correct — a `persist` list that is *incomplete* is silent until a player reloads
  — and C/A's plain records make that failure structurally impossible. B's
  serialise-the-inputs insight is the right idea and survives in C's shape for free.
- **B's palette in `core/`.** Colour is content; it belongs in `data/`.

### The one decision I want the repo owner to make

**Flat substances, or `substance × form`?** Everything else in this synthesis
composes without a fork. This one does not, it is a content-model decision rather
than an architecture decision, and it is worth about twenty rows of future
boilerplate:

- **Flat** (A's and C's choice) is simpler today, keeps one table, and is right if
  the game will have three or four ores forever. Its cost is that DESIGN item 4's
  five refinement tiers become one substance row per (substance × tier), and that
  "a tin ingot" is not a thing the model can name.
- **`substance × form`** (B's choice) costs one extra table and one modelling rule a
  newcomer must accept before their first edit — the only conceptual hurdle in the
  three builds — and buys per-substance identity at every tier for five rows total.

DESIGN.md says tribute must escalate in refinement across five tiers, and says it
is the equation that "generates most of the factory design pressure for free."
On that basis I recommend **`substance × form`**, and I want it decided explicitly
rather than inherited from whichever prototype's structure wins, because it is the
one place where the best structure (C) and the best content model (B) disagree.

### Migration order

Each step lands alone, ends green, and steps 1–4 are valuable even if the rest is
abandoned.

1. `tools/layers.mjs` against today's directories, report mode, `LAYER_BUDGET=16`,
   ratchet-only. **~150 new lines, 3 touched.**
2. `data/tuning.js` + `model/mods.js` + the enforced import rule; move
   `player.js:16-25` behind it. **~90 + ~20 call sites.**
3. Merge `MAT` + `KIND` → `data/substances.js` + `data/forms.js` behind a
   `MAT`-shaped shim. **~150.**
4. Treatments and the HUD from data. **~90.**
5. Bands as rows; allocate in `newRun()`; `bedrock` instead of the `-1` sentinel.
   **~100.**
6. Mining to `rules/`; the `Map` rather than a full-world `Float32Array`. **~50.**
7. `data/machines.js` + `rules/machines.js` interpreter with `outFrom` and `from:`;
   delete `structures.js`; crusher and kiln as rows. **+180 / −92.**
8. `tools/resolve.mjs`, including the per-band field check and the conditional-gate
   join. **~210.**
9. The directory reorganisation, ratcheting `LAYER_BUDGET` to 0. **~350 of moves.**
10. `ACTORS`, if and only if monsters land.

Steps 1–4 are ~350 LOC of unambiguous value. Step 9 is the expensive one, and
putting it ninth rather than first is deliberate: with the checker already
ratcheting from step 1, it is a mechanical tightening rather than a rewrite, and no
week produces zero player-visible progress.

---

## Appendix — what I verified, and what I did not

**Verified by running code:** all three prototypes' tools (A: `layers.mjs`,
`epoch.mjs`, `smoke.mjs`; C: `check.mjs`, `layers.mjs`, `resolve.mjs`) exit 0 as
shipped; all 139 `src/*.js` files across the three parse under `node --check`; the
grep counts 9/7/1 for `kiln` and the tin counts; A catches a kiln with its `Burner`
deleted at build time, and still catches it with `HeatEmit` also deleted; B catches
the same at boot with the exact promised message; C's resolver catches an
undeclared field name and C's probes catch a deleted heat gate; **C's resolver does
not catch a gate on a field only another band declares**; **A silently accepts two
`CatchBox` parts on one machine, collapsing them to one record ticked twice**;
B's kiln bakes `copper:brick` (4 crafts / 8 gravel) and its save round-trips at
15,825 bytes with cross-references rebuilt; C's `rules/` has zero rules→rules
edges; `src/` is 19 files / 2,068 lines; the granite truncation is already fixed in
`src/`.

**Verified by reading:** every claim in §A's file-count table against the named
line numbers; B's palette dependency for tin; the absence of `render/overlays.js`
in B; the absence of an actor table in A and C; the zero-reuse property of the
tag-keyed recipe pools; the `smoke.mjs`-is-a-printer / `check.mjs`-asserts
distinction from their source.

**Uncertain, and flagged rather than smoothed over:**

- I did not build both content models, so the "25 rows vs 5" arithmetic behind the
  `substance × form` recommendation is a projection from DESIGN's five named tiers
  and an assumed 4–6 ores, not a measurement. If the game ends up with three ores
  and three tiers the recommendation flips.
- I did not attempt to measure whether A's three vocabularies are *actually* harder
  to hold in mind than C's one interpreter. I ranked C first on greppability,
  edit-site count and copy-adjacency, all of which are measurable, rather than on
  trace depth, which I could not test without living in both for a month.
- The LOC figures in the migration order are scaled from the three builds and the
  RFCs' own tables; they are unaudited beyond steps 1 and 2.
- B's unreproducible claims (two tribute cycles, 900 ticks with all five machines
  placed) I could not run as shipped, because B ships no driver and naive placement
  fails against generated terrain. I reproduced the kiln, the save and the slot
  wiring with a scratch driver and they held; I take the director and cycle claims
  on the strength of that and of B's candour elsewhere, but they are unverified.
- Nothing here grades bugs, framerate, performance or visuals, per the brief.
