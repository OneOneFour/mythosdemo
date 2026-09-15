# Review — wave 6, phases 6h (save and load) and 6j (named debug scenarios)

Commits `3d7b099` (6h) and `3a41c77` (6j), reviewed against `docs/PLAN-wave6.md`
§2 (U1, U2, U6), §3 (S1, S2) and §4 (the 6h and 6j briefs, and the definition of
done). Read-only review; nothing in `src/`, `tools/` or `tests/` was touched.

---

## 1. Phase 6h — save and load

### 1.0 Verdict

**PASS WITH FINDINGS.** The payload is seed plus edits, the round trip is exact,
and the `gen` hash really does refuse a save written before the worldgen rewrite
— I proved that by generating a save on 6h's own tree and loading it at HEAD.
Three defects sit in the failure paths rather than the happy path, and one of
them will bite phase 6o.

### 1.1 Brief coverage

| brief line | state | where |
|---|---|---|
| Owns `src/shell/save.js` (new) | done | the whole file, 489 lines |
| Owns `docs/SPEC.md` §27 (new) | done | `docs/SPEC.md` §27, 162 lines |
| Amends the `CLAUDE.md` storage bullet with its reason (U1) | done | `CLAUDE.md:185-193` |
| Seed plus edit set, never a world snapshot (U2) | done | `src/shell/save.js:252-264`; `bandRow` stores `edits`/`work`/`seen`, never `mat` (`:191-202`) |
| `localStorage`, one slot | done | two keys, one slot — `:57-58` |
| Versioned schema that refuses rather than half-loading | partial | `:278-302` refuse before `newRun()`; see defect 6h-2 for the one input that gets past them and throws mid-apply |
| Load goes through `newRun(seed)` first | done | `:436`, called inside `load()` from the injected `newRun` |
| Exposes `save`, `load`, `hasSave`, `clearSave` and nothing else | done | `:247`, `:427`, `:306`, `:310` — four exports, verified by grep |
| Wires no input | done | no `shell` import, no listener, no `index.html` change |
| Round trip bit-exact | done | measured identical over a 24-field fingerprint; see §3.1 |
| No model `write` path added | done | the diff touches four files and none is under `src/model/` |

Four version hashes, as claimed, and the fourth covers the generator:

| field | computed | checked | line |
|---|---|---|---|
| `v` | literal `1` | `hasSave()` | `:56`, `:279` |
| `world` | FNV-1a of `JSON.stringify(BANDS)` | `hasSave()` | `:95`, `:279` |
| `content` | FNV-1a of the `SUB`/`FORM`/`MACH` id lists | `hasSave()` | `:101-104`, `:279` |
| `gen` | FNV-1a of each band's freshly generated `mat` | `load()`, after `newRun()` | `:201`, `:442-446` |

### 1.2 The stale-save question, answered by running it

I extracted 6h's own tree with `git archive 3d7b099`, wrote a save there (seed
1337, a 6-tile shaft), and fed the payload to HEAD's `save.js`.

| payload | `hasSave()` | `load()` | slot after | edits applied |
|---|---|---|---|---|
| the real pre-6c save, unmodified | false | false | kept | no — `newRun` never ran |
| the same payload with `world` re-hashed to HEAD's value | true | false | **cleared** | no — clean run of seed 1337 |

The first row is refused by the `world` hash, because 6c (`8a4a47d`) owns
`data/world.js` as well as the generator. `content` is unchanged across the two
trees (`579952083` both sides), so the content hash is not what saved it.

The second row is the interesting one, and it is the test the phase's claim
rests on. With `world` patched so only the generator differs, `hasSave()` passes,
`load()` reaches the `gen` check, the per-band hash mismatches, and the save is
discarded. The player is left standing in a clean run of seed 1337 with the
stored shaft absent. So `gen` catches a rewritten `rules/generate.js` on its
own, with no cooperation from the phase that rewrites it. That claim is true.

6k (`635184c`) raised `seedYield`, which changes the `rand()` stream after
worldgen but not `mat`, so no hash moves. Nothing needs to move — the payload
carries items and pockets explicitly, and the stream position is not stored
either way (defect 6h-4).

### 1.3 Out of scope

| change | verdict |
|---|---|
| `docs/FINDINGS.md:2815-2844`, three parked findings | harmless, and `docs/BUILD_PLAN.md` designates FINDINGS as the parking lot |

Nothing else. No file outside the ownership block was touched.

### 1.4 Defects

**6h-1 — a caller whose `newRun` ignores the seed destroys the save.**
`src/shell/save.js:442-446`. The `gen` mismatch path calls `clearSave()`
unconditionally, and it cannot tell "the generator changed" from "the caller
built the wrong world". Measured with `load(() => newRun(123456))` against a
good save of seed 77 — `load()` returned false and both keys were gone. Phase 6o
owns the only call site that will ever exist, has not been written yet, and one
plausible slip there (`load(() => newRun())`, a fresh random seed) silently
deletes the player's only save slot. The payload already carries the seed, so
`run.seed !== p.seed` distinguishes the two cases in one line. Severity: high
for 6o, none today, because nothing calls `load()` yet.

**6h-2 — a corrupt `seen` string throws out of `load()` after band 0 is already
written.** `bodyOk` checks `typeof row.seen !== 'string'` (`:294`) and nothing
more, and `fromB64` (`:120-125`) hands the string straight to `atob`. I set
`seen` to `'!!!!'` and `load()` threw `DOMException: Invalid character` from
`applyBand` — with band 0's tile edits already applied, the ledgers not restored,
the run ledger untouched, and the slot not cleared. The plan's wording is
"refuses a payload it does not recognise rather than half-loading it", and this
input is half-loaded. It matters because 6o calls `load()` during boot, and an
uncaught throw there renders nothing at all, which is the failure mode
`CLAUDE.md`'s boot-order note already records. Reaching it needs a corrupted or
hand-edited slot, so severity is medium, not high.

**6h-3 — `hasSave()` and `load()` can disagree, and a failed save can destroy a
good one.** `src/shell/save.js:244-246` claims a refused write "leaves whatever
was already stored intact", and `:428-431` claims the two functions "can never
disagree about whether a slot is loadable". Both are false in one state. With a
store that accepts the body and throws on the header — a quota refusal on the
second key — `save()` overwrites the good body, fails on the header, and drops
the body it just wrote. The previous header survives. Measured: `hasSave()` true,
`load()` false, slot never cleared, so a menu offers CONTINUE forever and it
never does anything. Narrow window, but the two comments assert it cannot happen.

**6h-4 — the `rand()` cursor is not stored, and §27.2 does not say so.**
Measured: 57 draws after `newRun(4242)`, then save, then load, and the next three
draws are the post-worldgen ones rather than the post-57 ones. A loaded run
therefore diverges from the run that was saved on every future draw, and
reloading the same save always replays the same stream. The round trip is still
bit-exact over epoch-visible state, which is what the brief asked for, so this
is not a broken acceptance criterion. It is an unlisted omission —
`docs/SPEC.md` §27.2 enumerates eleven things deliberately not stored and the
cursor is not among them, while `save.js:136-141` shows the author thought hard
about the cursor in the other direction. Fixing it needs a draw counter in
`core/rng.js`, which is outside 6h's ownership, so the missing row is in SPEC and
in FINDINGS rather than in code.

**6h-5 — `bodyOk`'s comment overstates its reach.** `:283-285` says "Every named
id is resolved here". It resolves machine ids and boon ids. It does not resolve
recipe ids (`run.craftRecipe`), god ids (`run.favour`), `run.offer.ids`,
`run.equipped` ordinals or item substance ordinals, and `CONTENT_SIG` does not
cover the recipe, god or cycle tables either — so `data/recipes.js` can change
under a save without any hash moving. I injected all six and none threw through
40 real `step()` calls, so this is a comment defect rather than a crash. Worth
one word in SPEC §27.3, which repeats the same overstatement.

**6h-6 — `data/tuning.js#invSlots` is part of the payload shape and no hash covers
it.** `run.inv` is position-significant and `applyRun` restores by index
(`:346-357`), while `mainSlots` is derived from `eff('invSlots')` at reset. Raise
`invSlots` and a saved quickbar entry lands in a main slot. Cosmetic, no crash,
and cheap to note.

**6h-7 (style note) — the three reproduced `run` fields are sound today.** I
checked `known`, `maxHearts` and `mainSlots`. `write.reset` seeds `known` from
every `HAND_RECIPES` id (`model/run.js:286`), nothing in `src/` adds to it, and
`isKnown` derives the machine-recipe gate from `canPlace` rather than from stored
state — so reproduction is exact, not approximately exact. The fragility the
phase parked is real and correctly parked. I cannot describe it failing today, so
it is a note.

---

## 2. Phase 6j — named debug scenarios

### 2.0 Verdict

**PASS WITH FINDINGS.** Five dioramas, declarative rows, no `rules` sibling
import, no `rand()` draw, and the ones I drove are genuinely playable. Assertion
27 bites hard on eight injected defects. It has one coverage gap it does not
admit to, and the commit message reports none of the three gates the plan
requires.

### 2.1 Brief coverage

| brief line | state | where |
|---|---|---|
| Owns `src/data/scenarios.js` (new) | done | 280 lines, five rows |
| Owns `src/rules/scenarios.js` (new) | done | 164 lines |
| Owns `docs/SPEC.md` §29 (new) | done | §29.1–§29.5 |
| A frozen table of named builders | done | `data/scenarios.js:275-280`, matching `data/cycles.js:167-168`'s freeze convention exactly |
| Applied after `newRun()` | done | `rules/scenarios.js:58`, no boot branch, nothing in `shell/schedule.js` |
| Places machines | done | `:130-149` through `model/machines.js#write.place` |
| Fills pockets | done | `:84` through `run.write.collect` |
| Advances cycle state | done | `:92-95`, writes `run.cycle` and clears the live tribute for the director to re-arm |
| Ships `winch` — a working segment the player can ride | done | `data/scenarios.js:104-131`; driven, see §3.2 |
| Ships `belt-line` — a fed production chain | done | `:150-162`; 2 `copper/ingot` in the pit within 20 s, driven |
| Ships `cycle2` | done | `:176-188`; `run.tribute.id` is `first-delivery`, 480 s, 33.7 T held |
| Ships `cycle3` | done | `:199-211`; `grey-eyed-tithe`, 26.5 T held |
| Every named id validated the way assertion 19 validates a cycle's demands | done | `tools/content.mjs:1286-1565`, 1063 content-lint checks total |
| A scenario naming impossible content fails the build | done | eight injections, eight build failures, see §2.4 |
| No menu entry, no URL parsing | done | nothing under `src/shell/` or `index.html` changed |
| Imports no `rules` sibling | done | `rules/scenarios.js:37-49` imports `data` and `model` only, and `tools/layers.mjs` walks the directory rather than the import graph, so section 0 really does cover a module nothing imports |

`ascent` is a sixth row the brief did not ask for. It builds out the whole
three-segment chain and is the best fixture in the table, so I would keep it, but
it is scope the brief did not name.

### 2.2 Determinism, verified by running

| scenario | `rand()` stream untouched | `mat` before apply matches the clean run |
|---|---|---|
| `winch` | yes | yes |
| `belt-line` | yes | yes |
| `cycle2` | yes | yes |
| `cycle3` | yes | yes |
| `ascent` | yes | yes |

Three draws taken after each `apply()` are identical to three draws taken after a
bare `newRun(2026)`. No scenario consumes the stream, so invariant 7 holds and
the claim is true.

### 2.3 Playability, verified by running

`winch`, driven through the real `shell/input.js#cmd` and `shell/main.js#step`:
the player settles at spawn, walks right to the crank at world x 362, and holding
the action verb delivers torque on all 3,600 substeps of 30 s. The carrier goes
from `t = 0` to `t = 1.0`, the full 88 px, with all four ore inside the carrier
box. Release it and `t` returns to 0 within 10 s — down is free.

`ascent`, one crank at a time: crank 0 lifts stage 1 by `t += 0.4875` in 8 s,
crank 1 lifts stages 1 and 2 together because its reach covers the shared hub,
and crank 2 in the astral band lifts stage 3 by `t += 0.55`. All three stages
rise. Segment 0 slid back to 0 while I stood at crank 2, which is the documented
weight behaviour rather than a fault.

All five rows apply with zero `refused` journal rows, and the burdens the file's
own comments quote (33.7 T, 26.5 T) are the burdens `burdenOf()` returns.

### 2.4 Assertion 27 bites — eight injections, eight failures

I re-injected eight defects of my own choosing into a scratch copy. Every one
failed the build with a message that names the row, the offending value and the
refusal the game would have produced.

| injected | caught |
|---|---|
| `ascent` stage-1 upper hub moved 4 tiles further | yes — "spans 120.0 px … past the smaller hub's own reach of 96" |
| `cloud_dock` placed on the surface | yes — "declares band 'astral' and the row places it in 'surface'" |
| `copper/ore` poured into the belt's fuel buffer | yes — "which no recipe on that machine consumes" |
| `timber/log` written as terrain | yes — "carries no `tile` block … (CLAUDE.md D12)" |
| favour to a god that does not exist | yes — "not a data/gods.js id" |
| a segment anchored on the gear | yes — "carries no `hub:{}` block … 'NOT A HUB'" |
| a carve rect 900 rows tall | yes — "outside its 128x56 grid" |
| a duplicated scenario id | yes — "id is missing or duplicated" |

### 2.5 Out of scope

| change | `file:line` | verdict |
|---|---|---|
| `tools/content.mjs` +284 lines (assertion 27) | `tools/content.mjs:1286-1565` | implied by the brief, which says the validation must work "the way `tools/content.mjs` assertion 19 validates a cycle's demands". But `tools/` is `harness`'s ownership in 6g and 6p of the same wave, and the 6j ownership block does not list it. Harmless in outcome, a real overlap in process. |
| `docs/DEVELOPER_GUIDE.md` +102 lines | `docs/DEVELOPER_GUIDE.md:1743-1844` | not in the ownership block. The scenario half belongs to 6j; the debug-mode half is request 8's first half and the wave assigned it nowhere. Harmless — the file is not on §3's single-owner list — but it is a phase writing documentation it was not given. |
| `docs/FINDINGS.md` +55 lines | — | harmless, sanctioned by process |
| the `ascent` row | `data/scenarios.js:237-272` | keep it, but the brief asked for four rows and got five |

### 2.6 Defects

**6j-1 — assertion 27 misses two of `placementCheck`'s refusals that are
computable from the rows alone.** `model/run.js:538-598` produces seven
refusals. Assertion 27 re-derives four (no such machine, footprint in bounds,
the band gate at `tools/content.mjs:1435`, the depth gate at `:1440`), correctly
declines two that need a generated world (`NEEDS CLEAR SPACE`, `NEEDS A FLOOR`),
and misses one that needs no world at all. Injected and confirmed passing the
lint:

- two machines on overlapping footprints — `placementCheck` answers
  `SOMETHING IS ALREADY THERE`, and `model/machines.js#write.place:30-60` does no
  overlap test, so both records are pushed. Pure arithmetic on `dx`/`dy`/`tw`/`th`.
- a `tiles` rect written over a machine footprint — `apply()` writes tiles at
  `rules/scenarios.js:66-67` before placing machines at `:69`, so the machine ends
  up standing inside solid rock that the row itself put there. Also pure
  arithmetic.

The cost is not a live bug, because no shipped row overlaps. The cost is that
`tools/content.mjs:1314-1318` and `docs/SPEC.md` §29.3 both name footing and the
clear path as the only unchecked gates, so the next person to add a row will
believe overlap is covered. Fix is two nested loops over `sc.machines`.

**6j-2 — the commit message reports none of the three gates.** The plan's §4
definition of done is `npm run check` at 0 layer violations, `npm run lint` and
`npm run test:visual`. 6j's message reports "Injected defects were confirmed to
fail the build" and nothing else. I ran all three against `3a41c77`'s own tree:
89 files, 529 edges, 0 violations, all sections pass, lint clean. So the work is
green and the report is silent, which is the reverse of the usual problem but
still a reporting gap.

**6j-3 (style note) — `rules/scenarios.js:62` binds `home` and uses it only as a
guard.** `bandFor` re-resolves the band for every spec, so the binding is dead
after `:63`. Harmless.

---

## 3. Verification

### 3.1 What I verified by running

| ran | result | matches the phase's own report |
|---|---|---|
| `npm run check` at HEAD | 89 files, 529 edges, 0 violations, 1063 content-lint checks, all sections pass | yes |
| `npm run check` at `3d7b099` (6h's own tree, clean extraction) | **87 files, 516 edges**, 0 violations, all checks passed | **no** — 6h's message quotes "89 files and 529 edges", which is `3a41c77`'s figure. 6j committed 18 minutes later, so 6h's check run saw 6j's uncommitted files. The verdict reproduces; the figures are not 6h's own commit's. |
| `npm run check` at `3a41c77` (6j's own tree) | 89 files, 529 edges, 0 violations, all checks passed | 6j reported nothing to compare |
| `npm run lint` at HEAD | clean, no output | yes |
| `npm run test:visual` at HEAD | 142 passed in 18.7 s, no baseline re-accepted | yes for 6h; 6j reported nothing |
| a pre-6c save loaded at HEAD | refused by the `world` hash; `hasSave()` false, `load()` false, nothing applied | yes |
| the same save with `world` re-hashed | refused by the `gen` hash; save cleared, clean run of seed 1337, no edits applied | yes — this is 6h's central claim and it holds |
| a full round trip at HEAD over a 24-field fingerprint (8 tile edits, 2 part-worked tiles, a growing seed at 42.5 s, 2 items, 2 hubs, 1 segment at `t = 0.37`, buffers, charges, 2 hearts lost, a boon, an equipped trinket, `run.t = 88.5`) | `save()` true, `load()` true, fingerprints identical | yes |
| `localStorage` absent / throwing / quota-refusing / holding garbage | `hasSave()` false, `load()` false, `save()` false or true as appropriate, nothing threw, the run survived all four | yes — the guards cover a throw, not just a null |
| a failed header write over a good save | the good body is destroyed and the good header survives — defect 6h-3 | no, the code comment claims the opposite |
| twelve malformed payload fields | eleven apply or are ignored, one (`seen`) throws mid-apply — defect 6h-2 | partially; the "refuses rather than half-loads" claim has one hole |
| the `rand()` cursor across a save and load | not restored — defect 6h-4 | unreported |
| `load(() => newRun(123456))` | returns false and deletes the slot — defect 6h-1 | unreported |
| all five scenarios applied, then 20 s of real `step()` each | no journal refusals, `belt-line` yields 2 ingots, `cycle2`/`cycle3` arm their tributes | yes |
| `winch` driven from spawn through the real `cmd` | 88 px of rise in under 30 s with 4 ore aboard, back to 0 on release | yes |
| `ascent` driven crank by crank | all three stages rise | yes |
| every scenario's effect on the `rand()` stream and on `mat` | untouched, all five | yes |
| eight fresh defect injections into `data/scenarios.js` | eight build failures with useful messages | yes |
| four probe injections aimed at assertion 27's gaps | overlapping footprints, a floating machine and a rect over a footprint all pass — defect 6j-1 | the footing gap is admitted, the other two are not |
| an undefined identifier inside a function in each new file | `oxlint` silent, `npm run check` says "All checks passed" | yes, both phases parked this correctly |

### 3.2 What I verified by reading only

- **`load()`'s newRun contract.** I read it and I tested two abuses, and the
  contract is weaker than the header claims. `load(() => {})` with no world
  allocated **returns true**, writes the player position and the whole `run`
  ledger, and leaves `bands` empty. So "there is no way to apply a payload to a
  dirty world" holds, but "impossible to get wrong from the outside" does not —
  nothing checks that the injected function produced a world of the stored seed.
  One line (`if (run.seed !== p.seed) return false;`) closes both this and defect
  6h-1.
- **SPEC §27.2's "deliberately not stored" table.** I read every row and spot-
  checked `mods` and `known` in code. I did not test `fields.js` heat or
  `run.invuln` re-establishing themselves.
- **`ascent`'s delivery claim** — "3 plates delivered at the dock pay cycle 2 and
  advance `run.cycle` to 3". I drove the three cranks and confirmed the carriers
  rise, but I did not carry a plate to the dock and watch the cycle advance. The
  phase says it did.
- **`belt-line`'s catch-box arithmetic** and the 6q finding it produced. Read
  only; `docs/PLAN-wave6.md` §6q already owns it.
- **The comment and doc prose** in all six touched files. Both phases follow the
  house header style and cite binding documents rather than narrating their own
  history. No phase banners, no commented-out code, no restated JSDoc.

### 3.3 The shared blind spot, and its blast radius

Neither `src/shell/save.js` nor `src/rules/scenarios.js` is in
`tools/check.mjs`'s hand-written import list (`tools/check.mjs:93-127`), and
nothing in `src/`, `tools/` or `tests/` imports either module — I grepped. Both
phases noticed and parked it. It is still true, and I measured it. I renamed
`WORLD_SIG` to `WORLD_SIGNATURE` inside `save()` and `SCENARIO` to
`SCENARIOS_BY_ID` inside `apply()`, both undefined identifiers inside function
bodies, and `oxlint` printed nothing while `npm run check` printed "All checks
passed."

Blast radius: `save()`, `load()` and `apply()` would each throw a
`ReferenceError` on first call in a real browser. `load()` is the dangerous one,
because 6o calls it during boot and an uncaught throw there renders nothing at
all. `tools/layers.mjs` does walk the directory, so layer direction is covered
for both files; execution is not. The documented fix is one `.oxlintrc.json`
declaring the browser and node environments with `no-undef` denied, contents
recorded in `docs/FINDINGS.md`. It is still not committed. 6p owns the tests and
should land it, or land a probe that at least calls both entry points once.

---

### 3.4 The tree I ran in

The working tree carries an uncommitted `src/data/tuning.js` from a concurrent
phase 6t, which raises `segUp` from 11 to 26 and lowers `burdenSoft` from 0.75 to
0.20. It is not mine and I did not touch it. Everything above that could depend
on those two numbers was re-run against a clean `git archive` of the relevant
commit in the scratchpad:

- `npm run check` at clean `3d7b099`, clean `3a41c77` and clean `HEAD` — 87/516,
  89/529 and 89/529 respectively, 0 violations and all sections passing in each.
- the `winch` drive — identical under committed tuning and under the working
  tree's tuning. `t` reaches 1.0 within 30 s of holding the crank either way,
  which is what `docs/SPEC.md` §29.4 states.

`npm run test:visual`'s 142 passes were taken in the working tree, so they
include 6t's in-progress numbers. Neither phase under review touches `view/`, and
no baseline moved.

---

## 4. What a later phase must not undo

**In `src/shell/save.js`:**

- `ORD_GAP = 64` and the scratch band records at `:159-172`. The baseline
  regenerate writes through `model/tiles.js#write.setByte`, which addresses the
  dig and growth ledgers by a key prefixed with the band ordinal. Drop the gap and
  every `save()` wipes the live ledgers of the run it is saving.
- The `finally` block at `:175-180`. It restores the `rand()` cursor and re-adds
  the modifier rows by source. Delete the cursor half and a save rewinds the run's
  randomness to boot; delete the mods half and the baseline is taken under live
  mods, so the loader refuses a perfectly good save.
- `machw.charge(m, row.made)` then `machw.spendCharge(m, row.made - row.charges)`
  at `:405-406`. `write.charge` raises `charges` and `made` together, so the pair
  can only be restored in that order.
- `runw.arrival` before `runw.tick` at `:343-344`, and the edits-then-ledgers
  order in `applyBand` at `:322-325`. `write.setByte` clears the dig entry for
  every coordinate it writes, so restoring the ledger first loses it.
- `itemw.clear()` at `:464`. `newRun` plants the starting pick and the payload
  already says whether it is still lying there.

**In `src/data/scenarios.js`:**

- `winch`'s crank at `dx:3`, on the spawn side of the hub (`:123`). Move it past
  the shaft and the walk to it crosses the open mouth, so the player falls in
  before they can turn it.
- `winch`'s cargo at `dx:5`, the left column (`:130`). The right column is the
  open shaft mouth, and a haul released there falls straight back down.
- `ascent`'s `{ dx:3, dy:9, w:2, h:1, band:'astral' }` carve at `:249`. That is
  astral's bottom row, the one slab row no headframe exemption covers, and a cable
  may not pass a solid tile. Remove it and stage 2 never links.
- The `dx` -9..+9 rule stated at `:79-82`. Outside the spawn shelf, `floorTy` is
  not the ground row.

**In `tools/content.mjs`:**

- The reach comparison at `:1511-1516` uses the **base** `hub.reach`, not
  `eff('segReach')`. That is deliberate — the tool runs before anything boots, and
  a row inside the base reach is inside it under any modifier that only widens.

**In `docs/SPEC.md` §27.3:** the `gen` hash is checked in `load()` and not in
`hasSave()` because it needs a world to exist. Moving it into `hasSave()` to make
the menu stricter would mean generating three bands every frame.
