# 00 — Review of the six architecture RFCs

Reviewer's grounding: I read `REVIEW-CRITERIA.md`, `BRIEF.md`, `docs/DESIGN.md`,
`SIDE-BY-SIDE.md`, all six RFCs, `CLAUDE.md`, `docs/SPEC.md`, `FUTURE_IDEAS.md`,
and all of `src/`. Where a claim was checkable I checked it against the code or
by running the arithmetic; those checks are marked **verified** and the ones I
could not settle are marked **uncertain**.

**Recommendation up front:** proceed to implementation. Do **not** escalate. Two
of the six (02 and 04) clear both heavy criteria, and the one gap they share —
DESIGN item 8 — is a ~100-line addition, not a paradigm failure.

---

## Corrections to the shared premises

Every RFC was written against the brief, so it inherits the brief's numbers.
One of these is cosmetic; the second is a shipping bug nobody caught.

- **The tree is 19 files / 2,052 lines, not "16 modules / 1,889 lines."**
  (`find src -name '*.js' | xargs wc -l`.) All six RFCs quote the brief's figure.
  It changes no conclusion but it slightly flatters every "LOC touched" ratio.
- **The granite bug is worse than the brief states, and this matters for
  grading.** `grid.js:92` computes `add = (seconds * power / hard) * 255`, and
  `grid.dmg` is a `Uint8Array`, so each frame contributes `floor(prev + add) −
  prev`. When `add < 1` the increment is lost **entirely**. `add ≥ 1` requires
  `dt ≥ hard / 255 = 2.40 / 255 = 9.41 ms`, i.e. **below ~106 fps**. Simulated:

  | accumulator | dt=1/30 | dt=1/60 | dt=1/120 | dt=1/240 |
  |---|---|---|---|---|
  | today (`Uint8` × 255) | 2.833 s | **4.250 s** | **never breaks** | **never breaks** |
  | RFC 06 (`Uint16` ms) | 2.433 s | 2.500 s | 2.500 s | 2.500 s |
  | float seconds (01/02/03/04/05) | 2.400 s | 2.417 s | 2.408 s | 2.400 s |

  The 4.250 s figure in the brief reproduces exactly, which confirms the
  diagnosis. But on a 120 Hz display — this repo's own platform — **granite is
  currently unmineable**, and so is any material with `hard > dt × 255 = 2.125`.
  That is a shipping bug, not a tuning error, and it should be fixed in week one
  regardless of which architecture wins.

- **Verified minor claims.** 83 internal import edges across 19 files (RFC 04's
  measurement is exact). The `scene.js ⇄ hud.js` cycle is real
  (`scene.js:13` ↔ `hud.js:9`). 16 substance-name references outside the two
  tables. The `run` schema disagrees across four sites — `state.js:24` omits
  `ingot`, `ladderStock` and `gift`, all three of which `main.js:33-35`,
  `mining.js:94` and `tutorial.js:43` create. RFC 03's diagnosis of the
  fall-damage bug is exactly right: `player.js:103` records `wasAir` *after*
  `moveY` has zeroed `vy` on the landing frame, so the sample is one
  `GRAV·dt = 5.33 px/s` short, and `floor((314.67 − 160)/32) = 4`.

---

## A. Graded table

**Scoring scheme.** Integers 0–5 on every criterion, same anchors throughout:

- **5** — solved, with a mechanism shown in the RFC that I could check.
- **4** — solved, with one disclosed cost I judge acceptable.
- **3** — solved in principle; the RFC leaves real work or a real risk unpriced.
- **2** — partially solved; the design fights the criterion.
- **1** — the RFC concedes this criterion, or I can show it fails.
- **0** — disqualifying.

**Weights**, from the rubric ("criteria 1 and 2 carry the most weight"):
C1 ×3, C2 ×3, C3 ×2, C5 ×1.5, C4/C6/C7 ×1. Max 62.5.

| | 01 registry | 02 composed | 03 ECS | 04 layered | 05 packs | 06 classes |
|---|---|---|---|---|---|---|
| **C1 Comprehensibility** ×3 | **2** | **3** | **1** | **4** | **2** | **3** |
| | compiler + derived rows + template globs; `copper_ingot` exists in no file | parts list is self-describing; but 7 files to read one machine | `Pos.data[e*2]`, `Buf.data[e*8+s*2]`; no printable entity — conceded | flat frozen tables, every value a literal, `grep` always works | 7 hooks + 6 services + 3 sigils + seal before the first edit | `ls content/machines/`, copy the neighbour — fastest cold open |
| **C2 DESIGN coverage** ×3 | **2** | **5** | **4** | **4** | **3** | **1** |
| | 9 CLEAN / 12 AWKWARD / 1 BLOCKED | 18 / 4 / 0 | 16 / 6 / 0 | 18 / 4 / 0, but AWKWARDs cluster on the economy axis | 16 / 5 / 1 | 7 / 14 / 1 |
| **C3 Extensibility** ×2 | **3** | **5** | **4** | **3** | **4** | **2** |
| | new behaviour = entry in a closed map; "60%" is honest | new behaviour = one self-contained component, no shared edit | new behaviour = new system + component; no closed map | new behaviour = new `rules` module, but **benchmark 1 fails** (below) | new behaviour = `defineSystem`/`defineEntityType` from the pack | subclass or mixin; **benchmark 1 fails**; diamond on machine 3 |
| **C4 Separation** ×1 | **4** | **4** | **4** | **5** | **4** | **3** |
| | grep-lintable dependency rule, unenforced | components never draw; `sprites.js` fn-map disclosed | `data/` never imports `render/`; treatments bound at boot | the only RFC that **fails the build** on a bad edge, plus an epoch guard proving `render()` is side-effect-free | inverted arrow is real; oxlint bans `rand` in paint | Bridge for looks is right; content classes are Turing-complete behind a lint fence |
| **C5 Simplicity** ×1.5 | **2** | **3** | **1** | **3** | **1** | **2** |
| | a compiler that is "the second-hardest file in the repo" + 320 LOC of validation | 12 component files; `Burner`/`FluidPort` conceded speculative | hand-rolled ECS, generation handles, free lists, for n≈500, perf case conceded | 6 layers + 490 LOC of invisible moves, but the checker is 60 lines | ~900 kernel lines for a boundary with one thing behind it — conceded | 10 base hooks, several with one override in sight — conceded |
| **C6 Migration** ×1 | **3** | **4** | **3** | **4** | **3** | **3** |
| | 8 steps with shims, but `compile.js` is a big bang first | steps 1–4 fix all three bugs before the risky work | 1,190 of 2,052 touched; chips-first is a good proving ground | **`LAYER_BUDGET` ratchet is the best migration device of the six** | best step 0 (state hash + golden dump); total is a rewrite in disguise | step 4 touches ~10 files, shallowly, with a lazy-migration alias |
| **C7 Grain** ×1 | **4** | **4** | **3** | **5** | **3** | **2** |
| | tables, no deps, fixed system order | no `class`, hash2-only treatments, fixed 1/120 step | runtime typed arrays contradict CLAUDE.md's "state on objects" convention | frozen tables, no `this`, 60 lines of Node, honest verification | registration is *less* "data tables over code"; 5 determinism hazards policed by convention | `#private` / `new.target` / static inheritance is furthest from stated conventions; `Object.freeze` on substances fights boons |
| **Weighted total** | **32.0** | **50.5** | **34.5** | **48.5** | **34.5** | **27.0** |

Two clear leaders (02, 48.5–50.5), a three-way middle (01/03/05, 32–34.5), and
06 last. The gap between the leaders and the middle is larger than the gap
within the middle, which is what makes the shortlist tractable.

### Two undisclosed benchmark failures

Both RFCs volunteered other honest limits, so this is not a candour problem —
but the rubric asks me to check the ones that *didn't* volunteer, and these two
claims are false as written.

**RFC 04 fails benchmark 1.** Its furnace recipe is a literal:
`recipes:[ { in:{ copper:2, timber:1 }, out:{ ingot:1 }, secs:4.0 } ]`
(`04:112`). There is **no output-side selector anywhere in RFC 04** — `#ore`
appears only on the input side (`04:104`, `04:207`). So the tin row at `04:236`
does not produce a tin ingot; worse, the furnace's port `accepts:['#ore']`, tin
carries `tags:['ore']`, so the furnace *swallows* tin into a buffer no recipe
consumes, and it accumulates forever. Adding tin therefore requires editing the
furnace row, contradicting "adding tin is this row and nothing else"
(`04:236`). Fix: adopt 05's `@in.smelt` (`05:236`) or 02's `$s` binding
(`02:89-96`). **~10 lines in `rules/machines.js`.** Cheap, but it is engine code.

**RFC 06 fails benchmark 1 for the same reason, in a worse way.**
`Machine.recipe` is `static recipe = null` — **singular** — (`06:166`) and `tick`,
`canStart` and `produce` all read `this.constructor.recipe` (`06:188`,
`06:212`, `06:225`). A furnace can hold exactly one recipe. Yet `06:151` claims
`Registry.link()` derives from `smeltsTo` "a furnace recipe with no further
edits". It cannot: there is nowhere to put it. Adding tin means either a
`TinFurnace` subclass or changing `recipe` → `recipes` in the base — the latter
is engine code and rewrites the sealed template tick.

**RFC 06 also does not fix the granite bug class.** `06:485` claims
"Byte truncation has nowhere left to live." True in letter — there is no byte —
and false in substance: `Uint16Array mine` stores milliseconds and the same
accumulate-then-truncate error persists at a finer quantum. Measured above:
2.433–2.500 s against a specified 2.400 s, **still framerate-dependent, still
faster on slower machines**. The +4.2% error would probably never be noticed,
which is exactly why it should be named — the architecture does not make the bug
unrepresentable, it makes it invisible. Five of six store float seconds and are
correct to within one `dt` of the last substep.

### Three other undisclosed weaknesses

- **RFC 03 reintroduces the brief's single biggest blocker.** `MAX_ENT = 4096`
  is a module constant and `component()` allocates `new Kind(MAX_ENT * width)`
  at import time (`03:23-31`) — structurally identical to the
  `WORLD_TW`/`WORLD_TH` defect the brief calls out. It also caps components at
  31 (`03:27`), and 03 already declares 18.
- **RFC 03's machine buffer is less expressive than today's furnace.**
  `slots:4, cap:4` is one cap for every slot (`03:227`, `03:247`), so the existing
  4-copper / 2-timber asymmetry (`structures.js:68-69`) cannot be expressed. A
  regression, not a refactor.
- **RFC 05 contradicts itself on fields and repaints.** `05:347-349` says fields
  "reuse the chunk grid but *not* the paint-dirty flag", then in the same
  sentence "a rule declaring `reads:['heat']` tells the kernel which field
  writes also dirty paint" — i.e. field writes *do* dirty chunk paint. That is
  the unbudgeted-repaint hitch the audit found, re-entered deliberately. 01, 02,
  03 and 04 all explicitly refuse this coupling and draw fields as an overlay.
  06 couples too, but throttles by visual quantum and a 3-chunk budget.

### One framing overclaim

RFC 01 heads its `converter` "~40 lines, the *entire* machine runtime"
(`01:74`), then discloses "~30 further lines" of helpers plus a generic
`placeMachine` in the next paragraph, and step 6 of its own migration budgets
~250 LOC. The disclosure is there; the headline isn't. Against
`structures.js`'s 92 lines the honest comparison is ~110 generic lines
replacing 92 bespoke ones — still a good trade, but not 40 against 92.

---

## B. The DESIGN.md coverage matrix

All 22 items × 6 RFCs. **CLEAN** = a path with no new engine mechanism beyond
what the RFC already specifies. **AWKWARD** = implementable, but needs a
mechanism the RFC lacks, or fights its grain, or costs boilerplate per
instance. **BLOCKED** = requires changing something the RFC declares fixed, or
the path is genuinely unclear.

Cells are `MARK — reason`. I have been sceptical: an RFC gets no credit for
naming a DESIGN feature in prose if the mechanism it shows cannot carry it.

### Economy and progression

| item | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| **1** Cost of ascension: `k×depth`, fuel at the lifter, 1:1→400:1 | CLEAN — `item.const.baseMass` + a `tiers` table naming the exact ratios | CLEAN — `item.mass` × `FORMS.massK`; ratio is the recipe's in/out counts | CLEAN — `Mass` component; "sum Mass over Carried" is one query | CLEAN — `item.mass` on the row; fuel is a `'#fuel'` recipe input | CLEAN — `item.mass`; fuel is a port with `from:'inventory'` | AWKWARD — mass fine, but the lifter itself is Structure+Burner+Conveyance, a conceded diamond |
| **2** Tribute cycles: deadline → band unlock + boon draft; two misses ends run | AWKWARD — no director in the tree; a new engine module with no named home | AWKWARD — `sim/tutorial.js` is the only script; no run-structure concept | AWKWARD — no director; run state exists but nothing schedules it | CLEAN — `rules/director.js` and `data/beats.js` are in the tree | CLEAN — `defineSystem({phase:'script'})` + `defineBand` + runtime pack for the boon | AWKWARD — no director; a `Director` class has no root to hang from |
| **3** Torments: run-state vs meta-state split; keep recipes + favour | CLEAN — `content/runschema.js` + `resetTo(run, RUN_SCHEMA)`; content is inert and interned, so it serialises | AWKWARD — component instances hold methods and resolved cross-references (`this.buf = host.slots.buffer`); snapshotting needs every component to declare persistent fields. Never addressed | CLEAN — `snapshot()` and the registry *is* the schema; meta-state sits outside the ECS. Caveat: typed arrays don't JSON | CLEAN — all state is plain objects in `model/`, and 04's stated reason for refusing classes is that saves want diff-ability | CLEAN — a save stores `'copper'` not a byte, plus `run.packLog`; 05 discloses the version-skew bug class it creates | AWKWARD — instance state declared in subclass bodies where reset cannot see it; 06's own weakness 5. `#private` + interned `Quality` pointers make a snapshot hard |
| **4** Refinement tiers ore→ingot→plate→essence→ambrosia | CLEAN — the `tiers` table + `refine` facet exist for exactly this; derived rows chain | CLEAN — substance × form, `FORMS` already has 5 rows, and `$s` means one `press` recipe covers every ingot. Best fit in the document | AWKWARD — nested `smelt.out` recurses, but `SMELT_RECIPES` is hardcoded in `substances.js`; a `press` verb needs a second folded list, i.e. engine code | AWKWARD — no output selector, so every (substance × tier) is a hand-written recipe row: 5 tiers × N ores | CLEAN — `'@in.smelt'` derives the output from what was consumed. Caveat 05 discloses: each tier is a second substance row | AWKWARD — `static recipe` is singular, so each tier needs its own machine subclass or a base rewrite |

### Fields and physics

| item | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| **5** Buoyant heat: diffusing field, upward bias | CLEAN — `{ solver:'diffusive', flow:'up', diffuse, decay }` as a content row | CLEAN — `Field` with `Float32Array` + active ring; kernel is one function | CLEAN — `f.heat = {v, act, hot}`; storage and active set specified | CLEAN — `model/fields.js` + `rules/fields.js` over an active set | CLEAN — `defineField({ diffuse:0.14, buoyancy:-0.6 })`; buoyancy is a declared parameter | CLEAN — `HeatField.flow(hi, lo, up)`; two real subclasses on day one, not speculative |
| **6** Bottom-up flooding, drowning the deepest works | CLEAN — `solver:'cellular', flow:'down', maxPerTile`; machines read it via `accept:{field:'water'}` | CLEAN — second `Field`; `FluidPort` reads it | CLEAN — `ready()` already tests `f[fl].v[tile] < n` | CLEAN — `mode:'fluidIn'` + `m.fluid[f]` are already wired before any fluid exists | CLEAN — `~water` sigil ports; `buoyancy:1.0` | CLEAN — `WaterField.flow` returns 0 upward; the clearest statement of the mechanic |
| **7** Failure states: flood, cave-in, thermal runaway, fuel spiral, wrath | AWKWARD — each needs a machine-level condition hook the closed `converter` lacks; new behaviours, i.e. engine code | CLEAN — `Drowns`, `Overheats`, `Collapses` are self-contained components; cross-cutting per-object is composition's strength | CLEAN — systems plus mask bits; a failure is a query | CLEAN — new `rules/` siblings + `model/journal.js` for events + `rules/director.js` for wrath | AWKWARD — the 6 kernel events are **closed** and contain no "machine overheated"; either poll or edit the kernel | AWKWARD — `onStall`/`speed` hooks work per class, but a failure spanning Substance and Structure crosses two independent roots |

### Boons — the hardest architectural test

| item | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| **8** **Trinkets: passive modifiers** (walk speed, pick power, machine rates, fall thresholds) | **BLOCKED** | AWKWARD | AWKWARD | AWKWARD | **BLOCKED** | AWKWARD |
| **9** Machines: new production verbs granted mid-run | CLEAN — with a run-scoped `granted` set. Genuine runtime *registration* is AWKWARD: `defs` is frozen and ids are interned at compile | CLEAN — no boot compile at all; `MACHINES` + `assemble()` work at any time | CLEAN — `TYPES` is append-only and ids are indices | CLEAN — with a `granted` set; `MACHINES` is a frozen array so runtime addition is AWKWARD | CLEAN — 4 starred hooks are runtime, ids come from a dynamic 192..255 block, `packLog` replays. Best in class, and the design's own answer | CLEAN — import a class, append to the registry |
| **10** Miracles: one-shot region-scoped tile transformation | AWKWARD — 01 itself says "miracles need terrain-edit primitives — each adding a registry column too" | CLEAN — `world.tiles.set` + a plain function in `sim/`; repaint is budgeted | CLEAN — a system doing bulk writes; `dirtyQ` is budgeted | CLEAN — `model/tiles.js write.*` from a new `rules/` module | CLEAN — `api.tiles.set` is a published service and a miracle is a pack system | CLEAN — the narrow `WorldFacade` exposes `setTile`; `RepaintQueue` drains ≤3 chunks/frame |
| **11** Mutually hostile boons: boons read *and write* the fields | AWKWARD — a recipe has `in`/`use`/`out`/`secs`; a *temperature band* requirement needs a new clause and a registry column | CLEAN — `Recipe.tick` **already** gates on `this.heat.hot()`; a `TempBand` component generalises it | CLEAN — `ready()` already threshold-tests a field; min-and-max is a two-line generalisation of code shown | CLEAN — the inline `boost:(m, api) => api.fieldAt(...)` hook is exactly a per-machine field-dependent condition, and it lives in the data row | AWKWARD — needs a fourth sigil or a kernel edit to express a band | CLEAN — override `canStart()`/`speed()` per class reading `this.world.field(id)`. Inheritance's genuine strong case |
| **12** **Trap boons: the blood winch** (a lifter fuelled by player health) | AWKWARD | **CLEAN** | AWKWARD | AWKWARD | AWKWARD | **BLOCKED** |

#### Item 8 in detail — the matrix's most important row

`CLAUDE.md` forbids the obvious implementation, and the rubric says an RFC that
leaves tunables as module constants is BLOCKED. I went looking for
`WALK`, `HOP`, `CLIMB`, `SAFE_V`, `HEART_V` and material hardness in each RFC:

> `grep -n -iE "WALK|tunable|trinket|boon|modifier" docs/rfc/0*.md`

**No RFC contains the words "trinket", "tunable" or "modifier". Not one of the
six moved the player tunables anywhere.** `WALK`, `HOP`, `CLIMB`, `SAFE_V` and
`HEART_V` are `export const` at `player.js:16-25` today, and after all six
proposals they are still `export const` — five of six leave `sim/player.js` or
its equivalent in the tree without comment. This is a **shared blind spot**, and
it is the single most valuable thing this review found, because DESIGN treats
trinkets as one of three boon tiers, i.e. a third of the game's reward economy.

Per RFC, concretely:

- **01 — BLOCKED.** `compile()` produces a *frozen* `defs`, so `tile.hard` and
  `recipe.secs` are immutable by construction. `rules/fall.js` is quoted at
  `01:333` with **160 and 32 as inline literals**. `sim/player.js` survives
  untouched. Nothing a trinket touches lives anywhere mutable.
- **05 — BLOCKED.** `api.cfg` is annotated "frozen"; substance `tile.hard` is
  sealed at `seal()`; the player's numbers are, in 05's own words at `05:382`,
  "a 1x2 hitbox, 60 px/s, five hearts and a ladder verb are all design" — i.e.
  module constants inside `packs/myth/systems/body.js`. There are 7 registration
  hooks and none is `defineModifier`; there are 6 closed events and none is a
  stat query. A runtime boon pack **cannot reassign another pack's `const`**.
  This is the sharpest irony in the set: 05 is the best RFC in the document on
  item 9 (boon machines) and is BLOCKED on item 8 (boon trinkets), which is the
  other two-thirds of the same feature.
- **02 — AWKWARD, and closest to free.** The RFC never mentions it, but
  `Pick.power` is already `this.power` on a per-instance component
  (`02:457`), and `Body`/`Recipe` are the same shape. A trinket is
  `player.slots.pick.power *= 1.5`, and a stacking modifier is a new
  self-contained component providing a `mods` slot. Machine rates are the one
  hard case, because `this.cur.secs` comes from the shared `RECIPES` row — but a
  `Rate` component multiplying `prog` is 8 lines. **Mutability is a free
  side-effect of per-instance component state**, which is a real point in 02's
  favour that 02 did not think to make.
- **03 — AWKWARD.** Every property is already a mutable typed-array slot per
  entity, and `SUB` rows are never frozen (`03:190-192`, `register` builds `{...row}`), so
  hardness is globally mutable. A `Modifier` component is idiomatic. Not
  addressed; mechanically supported.
- **04 — AWKWARD, and the failure is deliberate.** `data/` is *explicitly*
  frozen (`Object.freeze(SUBSTANCES.map(Object.freeze))`, `04:84`), `data`
  imports nothing, and `view` may not import mutators. So the naive path is
  impossible **by design** — which I read as a feature: it forces the modifier
  store to be a real thing. But 04 does not build it. What is needed is one new
  `model/mods.js` with a stacking multiplier per named tunable, and every
  `rules` module reading `mod('walk') * WALK` instead of `WALK`. That is ~80
  lines and perhaps 20 call sites, it fits the layering exactly, and the layer
  checker keeps it honest.
- **06 — AWKWARD, and the mechanism it has is a trap.** `static` class fields
  *are* writable, so `Pick.power = 2` and `Smelter.hotBonus = 1.5` work today —
  but writing a static on a base silently changes every subclass, does not
  stack, and cannot be removed when the trinket is lost. Meanwhile `Substance`
  instances are explicitly frozen, so `hard` is immutable, and `Actor.onLand`
  is quoted at `06:510` with **160 inline**.

**Consequence for the shortlist:** whichever RFC wins, the implementation agent
must be commissioned to build a modifier layer first, and the tunables in
`player.js:16-25` plus `SPEC.md`'s fall table must move into it. This is not a
tiebreak — it is a requirement to add to all three commissions.

#### Item 12 in detail — the blood winch

The test the rubric names: is "fuel" a generic concept, or a hardcoded item
slot? Reformulated: **is capability keyed to a slot, or to a type/recipe shape?**

- **02 — CLEAN, and uniquely so.** `Burner` (`02:276-292`) *provides* the `heat`
  slot and happens to satisfy itself from a buffer. A blood winch is a new
  `BloodBurner` component that provides the same `heat` slot and drains
  `world.player.slots.hearts` instead. Because `Recipe` depends on the **slot**
  and not on the component, **nothing else changes** — not the winch's other
  parts, not the recipe engine, not `assemble()`. Player health does not need to
  become a substance. This is composition earning its keep on a concrete DESIGN
  feature, and it is the strongest single argument in the whole document set.
- **01 — AWKWARD.** Fuel is a port with `accept:{tag:'fuel'}`, and 01's ports
  have exactly two sources: falling items via `itemsNear`, and the inventory via
  `hand`/`pickFromInv`. Hearts are `run.hearts`, neither. So you add a third
  port source, i.e. a branch in `converter`. And a lift is not a `converter` at
  all, so the winch also needs a third entry in the closed `BEHAVIOUR` map.
- **04 — AWKWARD.** Fuel is a recipe input selector `'#fuel'` consumed from
  `m.buf`, and `handFeed` draws from `run.inv` via `invCount`/`rw.spend`. There
  *is* a zero-engine-code route: mint a `blood` substance and mirror hearts as
  `run.inv.blood`. That works — but reifying health as an inventory substance is
  a model change with HUD and SPEC knock-ons (5 discrete hearts, drawn as
  hearts), so it is a design decision smuggled in as an implementation trick.
- **03 — AWKWARD.** "Fuel" is not a concept at all: `timber` carries
  `fuel:{heat:40, secs:6}` (`03:157`) and **no code reads it**. So the winch is
  a new archetype plus a ~10-line system reading `Health.data[playerE]` — easy
  in ECS, but it *reuses nothing*, which is precisely what the test is probing.
- **05 — AWKWARD, self-declared.** `05:286` names the blood winch as the
  example of what escapes the machine spec: it becomes a `defineEntityType` with
  its own bespoke tick. Honest and it works, but it means fuel is not generic
  and the winch shares no code with the furnace.
- **06 — BLOCKED, self-declared, and doubly so.** `06:566-567` says outright: "The
  blood winch — a Burner whose fuel is a player resource, not an item — fits
  nowhere." `Smelter.canStart` hardcodes `this.buf.take(this.constructor.fuel)`.
  A `BloodWinch extends Smelter` overriding `canStart()` would work — but
  `06:315` commits to a check that **fails the build if a `content/` class
  declares any prototype method outside `{onMined, qualityOf, onProduced}`**. So
  06's own enforcement forbids the only fix available to content, and the winch
  must become engine code.

### Monsters and the Hades act

| item | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| **13** Emission-driven aggro (noise, heat plume, light) | AWKWARD — 01 lists "monster aggro needs an emitter" among the things that are not data | CLEAN — a `Noise`/`HeatEmit` component on any machine; monsters are hosts | CLEAN — 03 names the archetype: `Pos|Vel|Body|Health|Appetite` | CLEAN — noise is another `model/fields.js` field; `rules/monsters.js` reads it | CLEAN — `defineField('noise')` + `defineEntityType` | AWKWARD — an emitter capability on Machine is a mixin, and Machine already carries 10 hooks |
| **14** Monsters attack logistics; **ride the player's elevators** | AWKWARD — `world` has `machines` and `items` and no generic entity pool; monsters are a third collection to index | CLEAN — `world.index` is generic over `e.tag`; riding is a `Carried`/`Rider` component | CLEAN — heterogeneous entities with a parent link is literally what the mask model is for. Best in class | CLEAN — a new `model/actors.js` + `rules/monsters.js`; moderate boilerplate, obvious home | CLEAN — `bodies` is a generic service owning the only integrator | AWKWARD — `Monster extends Actor` gets physics free, but "eat items off chutes" and "ride a lift" cross hierarchies |
| **15** Ichor: a fluid only from monsters, gating top-tier goods | CLEAN — the `pump` behaviour is already declared as arriving with fields | CLEAN — `FluidPort` write side; a producer component | CLEAN — `f[fl].draw` is shown; add is symmetric | CLEAN — `fw.drain` shown, `write` namespace has the inverse | CLEAN — `fields.add()` is published API | AWKWARD — 06 names "the still (FluidConsumer + FluidProducer + Burner)" as a diamond casualty |
| **16** Hades wants mass: slag/tailings/bones as currency; worthlessness-to-Zeus | CLEAN — `item.const.baseMass` + one `worth` column; the sink is a machine with `out:{}`, which 01 names | CLEAN — `mass × massK`; a `Sink` component | CLEAN — sum `Mass` over a query; 03 uses this exact example for load-bearing fall damage | CLEAN — `item.mass`; a machine row with no `out` | CLEAN — `item.mass`; a machine with no out port | AWKWARD — a no-recipe sink inherits `Machine`'s buffer/progress template as dead weight, which 06 already flags for the cooling tower |
| **17** Suspicion and concealment (hidden downward tonnage; needs a visibility concept) | AWKWARD — cross-cutting through a closed vocabulary: a new registry column, a new field, and a visibility notion the renderer must honour | CLEAN — a `Concealed` component on any host; the meter is `world.suspicion` | CLEAN — a `Hidden` mask bit is free, and queries exclude it by construction. **The one item where the ECS mask genuinely pays** | CLEAN — one `model/suspicion.js` read by many `rules`; `view` may read model state legally | AWKWARD — no "item moved downward" event in the closed 6; poll or edit the kernel | AWKWARD — a `Concealable` mixin would have to span two independent roots, and Substance instances are frozen |
| **18** Tartarus: a third act below Hades | AWKWARD — `world.grid` is a single slot, so bands replace rather than coexist; a continuous descent needs a band list | CLEAN — `createWorld(cfg)` returns an instance and `world` is threaded as a parameter, so bands coexist | AWKWARD — `world.field` is a single slot, same problem | AWKWARD — `model/world.js` is a mutated **singleton** (`write.allocate(band)`), so only one band can be resident | CLEAN — `defineBand` carries an `origin` offset, the only RFC that lets bands stack vertically | CLEAN — `new World({...})` twice, shown side by side |

### Infrastructure the mockup had and the game still needs

| item | 01 | 02 | 03 | 04 | 05 | 06 |
|---|---|---|---|---|---|---|
| **19** Staged lift: five independent stages, each with drum/deck/counterweight | AWKWARD — not a converter, so a third entry in the closed `BEHAVIOUR` map | CLEAN — `Footprint` + `Burner` + a new `Deck`/`Winch` component; the designed extension path | CLEAN — a new archetype + system | CLEAN — a new `rules/lift.js` + `model/lift.js`; engine code, but no closed map to edit and an obvious home | CLEAN — 05 names "a lift stage" as the `defineEntityType` case | AWKWARD — Structure + Burner + Conveyance, a conceded diamond |
| **20** Piles with backpressure: unconsumed pile fills and flags FULL | CLEAN — a full port `continue`s, so the item is not removed and rests on the pile | CLEAN — `!this.buf.room(e)` returns, item rests | AWKWARD — the mechanic works, but one uniform `cap` per slot cannot express the existing 4-copper/2-timber asymmetry | CLEAN — `full()` short-circuits intake | CLEAN — `m.count(e.sub) >= p.cap` skips | CLEAN — `if (this.buf.get(it.subId) >= cap) continue` |
| **21** Chutes, carts, pipes: item and fluid routing | AWKWARD — needs either a new behaviour or a tile-transport mechanism; occupancy stamping is adopted only "partially" | AWKWARD — self-declared weakness 3: 2,000 belt tiles is 16,000 objects with poor locality, and "belts are where this genre goes next" | CLEAN — entities are cheap. Caveat: 2,000 belts + 400 items approaches `MAX_ENT = 4096`, which is a module constant | CLEAN — chutes as tiles in `model/tiles.js` + a `rules/` transport pass | CLEAN — tiles or `defineEntityType`; kernel owns bodies | AWKWARD — the `Conveyance` branch exists, but an instance per chute tile contradicts 06's own rule that instances are only for "things a player can point at individually (~15 machines)" |
| **22** Fog of war, gaining late purpose from concealment (17) | AWKWARD — one extra array in `makeGrid` is trivial, but there is no overlay stage: the tree is `scene/entities/hud` and chunk canvases are baked per substance | CLEAN — `render/overlays.js` exists, and fields are already specified to draw as a per-frame overlay over the cached blit | CLEAN — same: overlay pass specified, chunk cache decoupled | CLEAN — `view/overlays.js` exists and is already the fields' home | AWKWARD — `cfg.PHASES` is frozen, so a new render phase is a kernel edit; and 05 couples field writes to paint-dirty (above) | AWKWARD — no overlay stage named; `Field` pokes `RepaintQueue` on a visual quantum, so a flood front will saturate the 3-chunk budget |

### Tally

| | CLEAN | AWKWARD | BLOCKED |
|---|---|---|---|
| 01 data-driven registry | 9 | 12 | 1 (item 8) |
| **02 composed objects** | **18** | **4** | **0** |
| 03 ECS archetypes | 16 | 6 | 0 |
| **04 layered core** | **18** | **4** | **0** |
| 05 content packs | 16 | 5 | 1 (item 8) |
| 06 class hierarchy | 7 | 14 | 1 (item 12) |

Where the AWKWARDs cluster matters as much as the count. **02**: items 2, 3, 8,
21 — run structure, saves, trinkets, belt scale. **04**: items 4, 8, 12, 18 —
refinement tiers, trinkets, the blood winch, band coexistence, i.e. the economy
and boon axis that DESIGN treats as core. **06**: 14 AWKWARDs spread across
every section, all traceable to one cause — single inheritance cannot supply two
orthogonal capabilities, which 06 states in its own weakness 1.

---

## C. Comprehensibility findings

The cold-open test, applied literally: a developer who has never seen the repo
is told *"add tin ore, and add a kiln that bakes 2 gravel into 1 brick."* Note
"bakes" implies fuel, so the task also probes whether fuel is expressible.

**Today, for reference.** They would open `world/tiles.js` (add a `MAT` row),
`sim/items.js` (add a `KIND` row — and only discover the need when tin items
render as `undefined`), `world/paint.js:127` (to get a glint), `render/hud.js:57`
(to get a pocket swatch), and then find there is **no way to add a kiln at all**
without rewriting `sim/structures.js`. Roughly 40 minutes to tin, and a day to
the kiln. Every RFC improves on this; the question is by how much and at what
cost.

### 01 — data-driven registry

**Files, in order:** `content/substances.js` (tin row; gravel row; brick row) →
`content/recipes.js` (a `bake` row) → `content/machines.js` (kiln row) →
optionally `content/looks.js`.

**Can they copy an adjacent example?** For tin, yes and elegantly — the copper
row is right there and `refine:{ via:'smelt', ratio, per:{timber:1} }` derives
the ingot, the recipe, the HUD slot and the paint plan. For the kiln, they must
first understand three things that are not obvious from the neighbours: the
port grammar (`face`, `mouth:{x0,x1}`, `grab`, `accept`, `cap`, `hand`,
`eject:{dx:'mid',dy,vy,spread}`), that `recipes:['bake_*']` is a **glob over
recipe ids**, and the difference between an authored row and a `tmpl()` row.
That is an interpreter, and they have to read it.

**Failure locality.** Mixed. `defs/validate.js` is promised with per-row
messages, which would catch a misspelled tag. But a *well-spelled tag that
matches nothing* — the commonest real mistake — fails silently: the kiln
swallows gravel and never produces.

**Greppability — the worst of the six.** `grep -rn tin src/` finds the row.
`grep -rn 'tin_ingot' src/` finds **nothing**, because it is minted by
`compile()` from `refine`. Derived rows are the price of 01's best feature, and
the debugging tool for them (`--dump-defs`) is a tool you must build and then
remember exists. 01 states this itself as weakness 3.

**Verdict: 2/5.** Fast for tin, slow for the kiln, and it trades greppability
for derivation.

### 02 — composed objects

**Files, in order:** `data/substances.js` (tin, gravel, brick) →
`data/forms.js` (only if `brick` is a new *form*) → `data/recipes.js` (a `bake`
row with `$s`) → `data/machines.js` (kiln row) → optionally
`render/sprites.js`.

**Can they copy an adjacent example?** Yes, and this is the RFC where the
declaration itself teaches. The kiln row is:

```js
kiln: { name:'KILN', size:[2,2], footing:2, sprite:'kiln',
        parts:[ ['Footprint',{}], ['Buffer',{cap:{gravel:6, log:2}}],
                ['CatchBox',{mouth:'top', accepts:{form:'gravel'}}],
                ['HandFeed',{pad:10}], ['Burner',{fuel:{sub:'timber'}, secs:8}],
                ['Recipe',{tag:'bake'}], ['Emitter',{at:'bottom', vy:10}] ] }
```

A reader who has never seen the repo can enumerate the machine's capabilities
from that list without opening a single other file, and `Burner` — the exact
component this task needs — already exists for exactly this reason. **This is
the only RFC of the six where "bakes" is a first-class concept rather than a
recipe ingredient.**

**Failure locality — the best of the six.** `assemble()` throws
`'kiln: unknown component Burnr'` at the moment of placement, and throws
`'kiln.Recipe needs slot buffer'` if the parts list is incomplete. Both messages
name the machine and the component. That is failure *at* the edit, with the
identifier the author typed.

**Greppability.** `grep kiln` → one table row plus one sprite fn.
`grep Burner` → `comp/burner.js` plus every row using it, which is a genuinely
useful query. The loss is elsewhere: `grep` will not tell you *why the kiln
stopped*, because that answer is spread over `data/machines.js`, four `comp/`
files and the slot graph. 02 states this as weakness 1 and offers a debug
overlay, and correctly notes that needing the tool is an admission.

**One conceptual snag the task exposes.** 02 models a held thing as
`substance × form`, and `brick` is not a form of gravel. The author must decide
whether brick is a new substance with `forms:['brick']` or a `brick` form of
`clay`. Neither is wrong; the model does not tell them which, and the mistake is
not caught by anything. Small, but it is the kind of ambiguity that generates
inconsistent content over a year.

**Verdict: 3/5.** Best failure locality and best self-documenting declaration;
worst behaviour-tracing among the table-driven three.

### 03 — ECS-lite

**Files, in order:** `data/substances.js` → `data/machines.js` → and then,
unavoidably, `systems/buffer.js`.

**Can they copy an adjacent example?** For tin, yes. For the kiln, no. They must
read `systems/buffer.js` to learn that `slots:4, cap:6` means "four
`(substance, count)` pairs in one `Uint16Array`, six units each", and then
discover that they **cannot** give gravel a cap of 6 and timber a cap of 2 — one
number covers all slots. Then they discover fuel is not a concept: `timber`'s
`fuel:{heat:40, secs:6}` is read by nothing, so "bakes" has to be modelled as a
recipe ingredient or as new engine code.

**Failure locality.** Good at boot (`bindTreatments` throws on an unknown
treatment name, `register` throws on a duplicate id). Poor at runtime: a stack
trace inside `tickMachines` gives you an integer.

**Greppability.** `grep kiln` works fine for the *declaration*. Everything
downstream is `Buf.data[e*8 + s*2]`, `Prog.data[e*2+1]`, and
`console.log(entity)` prints `37`. 03 states this as weakness 2 and says
plainly: "If the owner wants runtime state to read like the tables do, this
paradigm is wrong and RFC 03 should lose on that basis alone." I take the RFC at
its word.

**Verdict: 1/5.** The authored tables are genuinely good; the runtime is the
least readable of the six, by the author's own assessment.

### 04 — layered core

**Files, in order:** `data/substances.js` (tin, gravel, brick) →
`data/machines.js` (kiln row) → `data/palette.js` (if a new hue). That is two
files, in one directory, both flat frozen arrays.

**Can they copy an adjacent example?** Yes — the flattest copy of the six. Every
value in a 04 row is a literal or a `'#tag'` string; there are no templates, no
globs, no derived rows, no registration calls. The kiln is:

```js
{ id:'kiln', name:'KILN', tw:2, th:2, footing:2,
  ports:[ {side:'top', mode:'in', accepts:['gravel','#fuel']},
          {side:'bottom', mode:'out'} ],
  buffer:{ cap:{ gravel:6, '#fuel':2 } },
  catchBox:{ mouth:'top', slack:2 },
  recipes:[ { in:{ gravel:2, '#fuel':1 }, out:{ brick:1 }, secs:2.4 } ],
  look:{ ... } }
```

"Bakes" becomes `'#fuel':1` in the recipe — no fuel concept needed, no burn
clock. That is a legitimate simplification for this task, though it means the
kiln consumes fuel per *output* rather than per *burn*, which is a different
mechanic to DESIGN's "fuel burned at the lifter".

**Failure locality — the best static safety net of the six.** 04's
`tools/layers.mjs` runs a resolution pass that "asserts every treatment name,
recipe substance, tag, port field and palette key resolves". A typo in
`'#fule'` fails `npm run check` **before any module is imported**, naming the
bad key. Nothing else in the six catches a dangling string at build time.

**But the same silent trap as 06.** Adding tin with `tags:['ore']` makes the
furnace's `accepts:['#ore']` swallow tin into a buffer no recipe consumes. The
resolution pass will not catch that — it checks that names resolve, not that a
tag-matched substance has a consumer. Mitigating factor: because 04's furnace
recipe is a *visible literal* in the same file (`out:{ingot:1}`), a reader
adding tin is fairly likely to notice they need a tin recipe. 06's reader is
actively told the opposite.

**Greppability — the best of the six.** Everything is a literal in a flat table
in one directory. `grep kiln` → one row. `grep gravel` → the substance row, the
kiln row, the crusher row. No derivation, no interning, no registration. The
cost is elsewhere: understanding *behaviour* means reading
`rules/machines.js`'s interpreter, and the six-layer tree means one gameplay
field can touch four directories — 04's own weakness 2.

**Verdict: 4/5.**

### 05 — content packs

**Files, in order:** `packs/myth/substances.js` (three `defineSubstance` calls)
→ `packs/myth/machines.js` (one `defineMachine`). Two files — but **before**
either, `kernel/api.js`, because nothing in a pack makes sense until you know
there are 7 registration hooks, 6 service namespaces, 6 closed events and 3
sigils (`#tag`, `~field`, `@derived`).

**Can they copy an adjacent example?** Mechanically yes; the furnace call is
adjacent and the kiln is the same shape. But the *first* edit costs a reading of
the API surface and of `seal()`'s contract, and the author has to internalise
that ids are assigned by lexicographic sort at seal (so bytes are stable), that
runtime packs get 192..255, and that `look:'box'` is a string key into a
registry. 05 prices this itself: "Content editing is also the *most common* edit
here... charged on every content change forever."

**Failure locality.** Good, and pack-attributed: `myth:furnace: unknown
substance "coper"` at seal. That is the second-best error message in the set
after 02's.

**Greppability.** `grep kiln` works. But jump-to-definition dies for everything
string-keyed — `look:'box'`, `'#smeltable'`, `treat:['glint']` — which 05
concedes as weakness 2, along with "a stack trace in `tickMachines` names no
machine". Three mitigations are proposed (seal errors, a `?packs=1` overlay, a
golden dump) and 05 correctly observes that each is "more machinery paid to undo
a legibility loss the architecture caused".

**Verdict: 2/5.** The steady-state edit is fine; the cold open is the most
expensive of the six, and the ceremony is charged forever against a boundary
with one thing behind it.

### 06 — class hierarchy

**Files, in order:** `content/substances/tin.js` (new file) →
`content/substances/gravel.js` → `content/substances/brick.js` →
`content/machines/kiln.js` (new file) → `content/manifest.js` (append 4 lines).

**Can they copy an adjacent example?** For the kiln, **this is the fastest cold
open of the six**, and I want to say so plainly against the 5-vs-1 paradigm
count. `ls content/machines/` shows `furnace.js crusher.js washery.js`. The
author copies `furnace.js`, renames the class, changes eight `static` fields,
appends one manifest line. `Kiln` is even drawn in 06's own hierarchy diagram
under `Smelter`, so the base-class choice is made for them, and `Smelter`
supplies the burn clock — "bakes" is inherited, not re-declared.

**And then it silently under-delivers on tin.** As established in §A,
`Machine.recipe` is singular, so the derived tin smelt recipe has nowhere to
live. The author adds `static smeltsTo = 'pewter'`, is told by the RFC that a
furnace recipe is derived automatically, and gets no error, no recipe, and no
signal. That is the exact failure mode criterion 1 names — "silently and far
away" — arriving on the *simplest* half of the task.

**Failure locality.** Good on the things it covers: `new.target === Machine`
throws for abstract instantiation, a `tick` override throws in the constructor,
and `check.mjs` `readdir`s `content/` and fails on a missing manifest line —
that last one is a genuinely nice touch that no other RFC has. Bad on the
things it doesn't: choosing the wrong base is not an error, it is a slow
realisation three machines later.

**Greppability — tied best with 04, by a different route.** `grep kiln` →
`content/machines/kiln.js`, one file, whole thing. One file per concept is the
most navigable layout in the set. The cost is behaviour tracing: understanding
what a `Kiln` does means reading `Kiln → Smelter → Processor → Machine →
Structure`, four files and a chain of `super` calls, with `#private` fields you
cannot inspect.

**Verdict: 3/5.** Best add-a-machine ergonomics, silently broken
add-a-substance path, and the worst behaviour-tracing depth.

### Comprehensibility summary

**04 ≈ 06 > 02 > 01 ≈ 05 > 03.**

Two findings worth stating because they cut against the priors:

1. **The class-based RFC is not the comprehensibility loser.** One file per
   thing plus a manifest is the most greppable, most copy-adjacent layout
   proposed. 06 loses on criteria 2 and 3, decisively, but not on 1.
2. **The two RFCs that add a registration or compilation step (05, 01) pay for
   it in exactly the criterion the owner weighted highest.** Both concede this
   in their own weakness sections. The cheapest comprehensible design in the set
   is the most boring one: flat frozen tables in one directory, every value a
   literal, plus a build-time name resolver (04).

---

## D. Shortlist of three

I am recommending one composition and two singles, so the three commissions
test genuinely different bets rather than three flavours of one.

Two requirements apply to **all three** and should be written into every
commission:

- **R1 — Fix the three bugs first, before any refactor.** `grid.dmg` → float
  seconds, fall damage from geometric distance, one swept integrator shared by
  player and items. Roughly 60 lines, as RFC 03 itself says in its final
  rejected alternative. Do it in week one so that the architecture work starts
  from a correct game and the invisible refactoring is not also carrying the
  bug risk. Also add the check that granite breaks in 2.40 s ± one `dt` at
  `dt ∈ {1/30, 1/60, 1/120, 1/240}` — the current code *never breaks granite*
  above 106 fps and no test noticed.
- **R2 — Build the modifier layer.** Move `WALK`, `HOP`, `CLIMB`, `SAFE_V`,
  `HEART_V`, `PICK_POWER`, `GRAV`, `TERMINAL` and per-recipe `secs` out of
  module constants and behind a stat lookup with a stacking multiplier per named
  tunable. ~80 lines plus ~20 call sites. Without this, DESIGN item 8 is
  unreachable in every one of the six proposals.

### 1 — RECOMMENDED: 04's layering and enforcement + 02's component vocabulary

**Why these two and not either alone.** They solve orthogonal problems and
neither has an opinion about the other's domain.

- 04's contribution is a **direction**: six layers, a 60-line dependency checker
  that fails the build, a ratcheting `LAYER_BUDGET`, an epoch guard that proves
  `render()` is side-effect-free, and a resolution pass that turns every
  dangling string key into a build failure. **None of that constrains how
  `rules` organises machine behaviour internally.** It is the only RFC that
  makes a separation-of-concerns claim a machine can check, and it is the reason
  `paint.js:127` cannot happen again — not convention, enforcement.
- 02's contribution is a **vocabulary**: capability as a list of named parts
  that *provide* and *need* slots. That vocabulary is what makes DESIGN items 7,
  12, 13, 14, 17 and 19 CLEAN, and it is the only answer in the document to the
  blood winch. It is also the best answer to the rubric's "only genuinely
  contested axis": a new behaviour is a new file, not an edit to a closed map
  (01, 04) or a new subclass (06).

**The one real incompatibility, and how to resolve it.** 04 states "nothing in
`data` or `model` has methods, nothing in `rules` has state", and 02's
components are closures carrying `this` and holding state. Resolve it by
splitting each 02 component in three, which costs nothing and improves both:

- **`data/parts.js`** — the parts *vocabulary*: `{ CatchBox: { provides:
  ['buffer'], needs: ['footprint'], defaults: {...} } }`. Pure data, frozen,
  checkable by the resolution pass.
- **`model/machines.js`** — a machine instance is a plain record with a `slots`
  map of plain sub-records. No methods, inspectable, diffable, serialisable —
  which fixes 02's AWKWARD on DESIGN item 3 (saves), its weakest cell.
- **`rules/parts/*.js`** — one free function per part:
  `catchBox(state, host, world, dt)`. No `this`, one file per capability, and
  `rules → rules` stays banned because parts are dispatched by the machine
  driver from a table, not by importing each other.

`assemble()` becomes a `model` write that validates the parts list against
`data/parts.js` and throws with the machine id and part name — 02's best
property, preserved.

**Build:** 04's steps 1–6 (layers, checker, `model/world.js` injection, bedrock,
float mining, journal) but **reordered so R1 lands first**; then the parts
table, the machine driver, `assemble()`, and the furnace/crusher/kiln as rows;
then 04's steps 8–10 (fixed timestep, treatments, space index, fields).

**Discard:** 02's `make()` closures and all `this`. 02's `IDENT` interning
(premature at 400 items — use 04's `mod: null` slot, `04:356-359`). 02's `Burner`
and `FluidPort` until their second consumer exists, per 02's own weakness 6.
04's inline `boost:(m, api) => ...` functions in `data/` — 04's own weakness 1
identifies them as the hole in its checker; replace with a named part
(`['HotServo', {over: 0.55, mult: 1.38}]`), which is strictly better because it
is greppable, checkable and reusable.

**Borrow from 01, one idea:** bake per-substance **paint plans** at boot
(`01:233-237`) so the chunk-paint hot loop is `for (const f of plan[m]) f(g,
px, py, tx, ty)` with every colour already a literal. This kills the audit's
`mix()`-per-call finding outright and is a strict improvement over 02/03/04's
name-keyed treatment lookup. It composes with anything and costs ~30 lines.

**Add:** R1, R2, and the output-side recipe selector 04 lacks (`@in.smelt` from
`05:236` or `$s` from `02:89-96`) — without it, benchmark 1 is false.

**Residual risk.** This is the largest of the three commissions and the one most
exposed to 04's honest weakness 2: `model/` drifting toward a god object with
many `newRun()` reset obligations. Mitigate with 01's `resetTo(run, SCHEMA)`
idea (`01:373`), which makes reset mechanical rather than hand-listed.

### 2 — 02 as written, hardened

**Why commission it separately.** It is the highest DESIGN coverage in the set
(18/4/0) and the only CLEAN on the blood winch, and commission 1 modifies its
core representation. If the parts-as-plain-records translation turns out to cost
more than it looks, we want a build of the *unmodified* bet to compare against.
This is the control.

**Build:** substance × form + `FORMS`; `$s` recipe binding; `assemble()` with
slot validation and topological tick order; `Body` + the fixed 1/120 s
accumulator; the hash grid with a `sleepers` bucket; the treatments registry;
`Field`; the chunk repaint budget and LRU.

**Discard:** `Burner` and `FluidPort` at first ship (02's weakness 6 says they
should not ship before a second consumer, and it is right). The `IDENT`
interning. `render/sprites.js` as a per-machine `{id: fn}` map — replace with
06's `looks/` **Bridge** idea keyed by a `look` string, which is the same
dispatch with an explicitly parallel hierarchy and no risk of appearance code
migrating into `sim/`. Keep `wants()` but cap it: it is a small inference engine
and 02 says so.

**Bolt on, cheaply:** 04's `tools/layers.mjs`. It is 60 dependency-free lines,
it is paradigm-agnostic, and it would have caught the `scene.js ⇄ hud.js` cycle
that exists today. There is no reason for any commission not to have it.

**Add:** R1, R2. And a serialisation test — 02's DESIGN item 3 is its weakest
cell and the failure will be discovered late otherwise.

### 3 — 04 as written, reordered

**Why commission it separately.** It is the only proposal that converts
"separation of concerns" from a claim into a build failure, it scores highest on
grain (C7) and comprehensibility (C1), and its content layer is the flattest and
most greppable. If the owner's real priority is *a codebase that stays clean for
a year* rather than *maximum DESIGN coverage*, this is the answer, and it is
also the lowest-variance build of the three.

**Build:** steps 1–10 as written, with two changes. **(a) Move steps 4 and 8
(the bug fixes) to the front**, ahead of the ~490 LOC of invisible moves — 04
concedes those steps "buy the player nothing", and doing them second means the
first six weeks produce no player-visible progress at all, which is a real
project risk even if it is not an architectural one. **(b) Ship the resolution
pass in step 1**, not later: it is the single highest-value 30 lines in any of
the six RFCs.

**Discard:** the inline `boost` functions in `data/` (same reason as commission
1 — replace with a named, checkable hook). Reconsider `model/mining.js`'s
`Float32Array(tw*th)` — 196 KB always resident to track the two or three tiles
being mined; 01/02/05's `Map<tileIndex, seconds>` is strictly better and holds
single-digit entries.

**Add:** R1, R2, the output-side recipe selector, and 01's baked paint plans.
Also **either** a band list or an explicit decision that only one band is
resident at a time — `model/world.js` is a mutated singleton, so DESIGN item 18
(Tartarus below Hades, reached by descending) needs that settled up front, not
discovered at act three.

### Explicitly not shortlisted, and why

- **03 (ECS).** It makes no performance claim, its authored tables are good, and
  DESIGN item 17 (a `Hidden` mask bit) is the single most elegant cell in the
  matrix. But it loses criterion 1 by its own explicit invitation — "if the
  owner wants runtime state to read like the tables do, this paradigm is wrong
  and RFC 03 should lose on that basis alone" — and criterion 1 carries the most
  weight. It also reintroduces the brief's headline defect as `MAX_ENT`, caps
  components at 31 with 18 already declared, and regresses buffer expressiveness
  below today's furnace. Salvage two ideas: the `Hidden`/`Asleep` **mask bit as
  an activity index**, and its rule that "discrete outcomes derive from
  integrated quantities, never per-frame samples", which is the crispest
  statement of the fall-damage fix in the document and should go in `CLAUDE.md`
  verbatim.
- **05 (packs).** The best RFC in the set on DESIGN item 9, and the only one
  with a `origin`-offset band model, a shuffled-manifest determinism test and a
  golden registry dump — all three of which are excellent and should be
  borrowed. It is not shortlisted because ~900 kernel lines buy a boundary with
  one thing behind it (its own weakness 1, which I agree with and which
  criterion 5 marks against), because it is BLOCKED on item 8 while marketing
  boons as its headline, because the closed 6-event set blocks items 7 and 17,
  and because its cold open is the most expensive of the six. Salvage:
  `@in.smelt` output derivation, `defineBand({origin})`, the state-hash harness
  as **step 0 of whichever commission wins**, and the shuffled-order
  determinism test.
- **06 (classes).** Best cold open and best greppability, and its `looks/`
  Bridge and its `readdir`-vs-manifest check should be borrowed. Not
  shortlisted because it is BLOCKED on the blood winch by its own lint rule,
  because two of its benchmark claims are false (benchmark 1's derived recipe
  and benchmark 10's granite fix — both verified above), because 14 of 22 DESIGN
  items are AWKWARD for one traceable reason, and because its closing line is
  correct: the mixin in its own washery is the strongest argument against its
  paradigm. Salvage: the Bridge for appearance, the manifest completeness check,
  and its rejection of `Substance#paint()` — which is the right call and should
  be recorded as a decision.
- **01 (registry).** The most thorough treatment of derivation (`refine` +
  `tiers` is the cleanest answer to DESIGN item 4) and the baked paint plans are
  the best single performance idea in the set. Not shortlisted because 12 of 22
  DESIGN items are AWKWARD, because the closed `BEHAVIOUR` map puts DESIGN items
  7, 10, 12 and 19 behind engine edits, and because it is BLOCKED on item 8
  while freezing `defs` makes that hard to walk back. Salvage: baked paint
  plans, `resetTo(run, SCHEMA)`, and `bedrock` as a real row.

---

## E. Escalation

**Not warranted.** Recording the reasoning explicitly, since the option was
offered and refusing it should be as argued as taking it would be.

The bar is "no combination of these six is worth building." Two RFCs (02, 04)
score 18 CLEAN / 4 AWKWARD / 0 BLOCKED on the 22-item matrix, and their AWKWARD
sets barely overlap — 02 is AWKWARD on tribute cycles and run structure where 04
is CLEAN (`rules/director.js`); 04 is AWKWARD on the blood winch and refinement
tiers where 02 is CLEAN (`Burner` slot, `$s` binding). A composition of the two
plausibly reaches 21 CLEAN with one AWKWARD on belt-scale routing, which is a
problem no proposal in the set solves and which the game does not have yet.

The one criterion on which **all six** fail is DESIGN item 8, and it fails for a
reason that is not architectural: nobody thought about it. It is not a
consequence of any paradigm — it is a missing ~80-line module that two of the
six (02 by per-instance component state, 03 by per-entity arrays) would host for
free, and that 04's frozen `data/` actively forces into the right place. A
shared oversight with a cheap, well-understood fix is not grounds for five new
research directions; it is grounds for a line in the commission.

The other candidate for escalation would be criterion 5, where three of six
score 1–2 and none scores above 3. That is real — the brief said "speculative
generality is a defect" and got a compiler, a hand-rolled ECS, a 900-line kernel
and a 10-hook base class. But 04 and 02 are the two cheapest proposals in the
set, the composition in commission 1 discards the expensive parts of both, and
the three-commission structure means the owner sees a simplicity comparison
rather than having to predict one.

---

## Appendix — what I verified, and what I did not

**Verified by running code or arithmetic:** the granite truncation and its
never-breaks-above-106 fps consequence; RFC 06's millisecond quantum still being
wrong and framerate-dependent; the fall-damage under-read being exactly
`GRAV·dt`; 83 import edges across 19 files; the `scene.js ⇄ hud.js` cycle; the
16 substance-name references outside the tables; the four disagreeing `run`
schemas and which three fields each site invents.

**Verified by reading the RFCs against each other:** RFC 04 and RFC 06's
benchmark-1 failures (no output-side selector; `static recipe` singular); RFC
03's `MAX_ENT` module constant and 31-component cap; RFC 03's uniform per-slot
buffer cap; RFC 05's field-writes-dirty-paint contradiction; the total absence
of the words "trinket", "tunable" and "modifier" from all six documents.

**Uncertain, and flagged rather than smoothed over:**

- I did not measure whether RFC 02's 12 component files and slot graph are
  *actually* harder to trace in practice than RFC 04's interpreter. Both RFCs
  say their own version is worse than today's 92 contiguous lines. I scored 04
  higher on comprehensibility mainly on greppability and copy-adjacency, which
  are measurable, rather than on trace depth, which I could not test without
  building both.
- I did not verify the "3 of 8 sub-pixel offsets tunnel at dt=0.05" figure. The
  mechanism is clearly present (`items.js:46` tests only the destination row
  after a full-`dt` integration of up to 20 px against an 8 px tile) but I took
  the count from the brief.
- LOC estimates in all six migration paths are unaudited beyond spot checks. The
  one I checked and disagree with is RFC 01's framing of its machine runtime as
  "~40 lines" against `structures.js`'s 92; the honest figure from its own
  migration table is ~110 generic lines, which is still a good trade.
- Nothing here grades visuals, per the brief. Screenshot baselines will fail in
  every commission and that is expected.
