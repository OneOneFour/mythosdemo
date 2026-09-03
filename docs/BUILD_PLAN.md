# Build plan — prototype to game

**Status as of `818236e` (2026-09-02): every phase below, waves 1 and 2, is
committed — 0 through 11, including the 8c–8g segment-transport insertion.**
A third wave ran after this document stopped being extended: the interaction-
model rework (key audit, unified LMB, opt-in pickup, a real slot-grid
inventory), planned in `docs/PLAN-phase12.md` as Phases 12a/12b/12c/12c2/12d
and also fully committed. This file was never updated to add that wave to its
own sequencing tables; treat `docs/PLAN-phase12.md` as the record for it.
Two items sit parked, not fixed, in `docs/FINDINGS.md` #13 (a HUD label can
overlap the burden bar at wide values) and #14 (an intermittent
`winch-lit`/`winch-unlit` visual-test flake under full parallel runs).
`FUTURE_IDEAS.md` and `docs/DESIGN.md`'s unbuilt sections are backlog, not
scheduled work.

**Wave 4 is PLANNED AND NOT STARTED**, in four documents plus one scoping
document, following the same convention wave 3 used — the plan is standalone
and this file points at it rather than absorbing it:

| document | phases | what |
|---|---|---|
| `docs/PLAN-phase13.md` | **13a–13d** | UI text contrast (a *classified* recolour — grey is load-bearing in ten places); the ladder's sprite (the label rename already landed in `7c6993c`, so this is pixels only); the auto-collect default (one real gap — `newRun()` does not reset it — plus two now-vacuous test probes); and a **20-item punch list of what is left to close the tribute loop**, with 13d proposed as the five-item shortest path. 13d needs a greenlight. |
| `docs/PLAN-phase14-mining-and-drops.md` | **14a–14e** | Mined material becomes a prerequisite (rubble stops being placeable; 5 → 1 packed block) and named deposits **deplete** instead of vanishing. Its own document because it changes what a material *is*. Carries the wave's risk register. **Read its §2.1 first, whatever else you are doing: appending a tile-capable substance row throws at import today, and `docs/SPEC.md` §15 reads as if there is room.** Also drafts **D12** — a form is either feedstock or buildable, never both — and applies it a second time to `timber/log` (D14-H); **now the wave's first phase to land, ahead of 13 and 15.** |
| `docs/PLAN-phase15-trees.md` | **15** | A fully felled tree drops a seed; a planted seed grows into a tree on the fixed step. Shares `data/forms.js` and the form budget with 14a and must land after it — and after D14-H, since a placed timber ladder can no longer be `log`. |
| `docs/PLAN-phase16-interaction-model-v2.md` | **16a–16c** | **The missing feed verb**, and what a click on an inventory slot means. Extends Phase 12's interaction model rather than replacing it: today clicking a placeable arms it (correct, and Factorio-shaped) but clicking an ore/ingot/plate/brand/relic is a **confirmed silent no-op**, and feeding a machine is not a gesture at all — `rules/machines.js#handFeed` is proximity-only, ungated, at 120 Hz. **Three places in the repo already work around that and three more claim a "feed key" that has never existed.** Keeps "the click *target* decides" as the implementation (more defensive against a future content mistake) now that D12 has made it behaviourally identical to plain type-dispatch for every legal pair — and recommends describing it to the player the simpler way regardless. 16b (the drain becomes opt-in `ui.autoFeed`) carries the whole risk. |
| `docs/PLAN-horizontal-chunks-SCOPE.md` | **none — scoping only** | A horizontal, procedural, unbounded world. **Not a phase plan and must not be executed.** It establishes that the storage change is feasible (nothing outside `model/` reads a tile array directly) and that the *generator* change has an unsolved problem in it, drafts the `CLAUDE.md`/`ARCHITECTURE.md`/`SPEC.md` diffs **for review and deliberately unapplied**, and recommends a cheaper bounded-but-large intermediate instead, plus a read-only recon pass before any implementation. |

**Net wave order: 14a first, then 13a → 13b → 13c → 13d, then 15, then
16a → 16b → 16c.** 14a moved to the front after `docs/PLAN-phase14-mining-and-drops.md`'s
D14-H drafted `CLAUDE.md` D12 (a form is either feedstock or buildable,
never both) and applied it to `timber/log` as well as `gravel` — both 15
(shared form budget, and D15-A/D15-C were written assuming `log` stays
placeable) and 16 (D16-A's click-model choice was originally forced by
`log`/`gravel` being double-duty; D12 removes the forcing reason) now depend
on it landing first, not just on each other.

Within that order: **13a → 13b → 14c → 15's view work → 16c are all
`src/view/` and must not run concurrently** — the same rule that kept Phases
8, 8b, 8e and 9 serial. 13c is disjoint and may run alongside anything.
14a → 14b is strictly serial; 14d is parallel-safe with 14c. **16 lands after
the whole of 13**, including 13d — its own §7.2 argues the ordering (13d's
acceptance criterion is worded against the automatic feed 16b turns off, and
16's acceptance wants the completion feedback 13d adds); 16a → 16b → 16c are
strictly serial.

Ordered. Each phase has a **paste-ready prompt** for a subagent, an explicit
**FILE OWNERSHIP** block in this repo's real paths, and an **acceptance
criterion** that is a physical action you perform. Do not reorder. Phases 0, 1,
3 and 4 are strictly serial; the three agents inside Phase 2 are parallel-safe
*only* because their ownership blocks are disjoint, and Phase 6 is parallel-safe
alongside Phase 5 for the same reason.

**Read first, every phase, no exceptions:** `CLAUDE.md` (especially
§"Resolved decisions", which answers the four questions no agent may decide for
itself) and `ARCHITECTURE.md` (especially §1 the layer graph, §5 the tunable
store, §7 what was already rejected). `docs/SPEC.md` holds the locked numbers;
`docs/DESIGN.md` holds the reasoning.

---

## 0. What is already true, and what the plan therefore is not

This plan supersedes an earlier draft written against `docs/DESIGN.md` alone.
That draft's central premise — that no content registry exists and items are
hardcoded strings — is **false for this codebase**, and every phase below is
written against what is actually here.

**There is a content registry, and it is more general than a flat item list.**
`src/data/substances.js` × `src/data/forms.js` is a substance × form model: a
substance is an element, anything you can hold is `{sub, form}`, and a thing
with no element of its own is a *form* of the element it came from. One `smelt`
row therefore covers every ore that will ever exist. `src/data/recipes.js`,
`machines.js`, `trinkets.js`, `boons.js`, `tuning.js`, `world.js`, `sources.js`
and `sfx.js` all exist, all frozen, with derived indices built once at import.
`src/data/forms.js#expand(sel)` is the purpose-built validator that proves a
selector is not empty. **Do not build a parallel `data/items.js`.** A flat item
table would be a *regression*: it would need one row per substance-form pair,
which is the exact defect the reference prototype had (two ores both declaring
`smeltsTo:'ingot'`, so a tin ingot was byte-identical to a copper one).

**The layer graph is enforced, not conventional.** `core → data → model →
{rules | view} → shell`. Nothing imports upward; `rules` and `view` may never
import each other; `rules` modules may not import one another (their order is
stated once, in `src/shell/schedule.js`); and **only `model/mods.js` may import
`data/tuning.js`**. `tools/layers.mjs` parses every import and fails on any
illegal edge, with `LAYER_BUDGET = 0` that may only ever go down. It runs as
section 0 of `npm run check`.

**Consequently there are no new top-level directories in this plan.** The
earlier draft proposed `player/`, `physics/`, `inventory/`, `entities/`,
`build/`, `ui/`, `hud/`, `stats/`, `modifiers/` and `world/lighting.js`. Every
one of those is remapped below into the real graph. The remap costs nothing
mechanically — it is the same code in a directory the checker recognises. What
it buys is that a new module cannot quietly acquire an illegal dependency.

**There is already a stat pipeline; do not build a second one.**
`data/tuning.js` is the frozen design, `model/mods.js` is the run-scoped
modifier list, and `eff(id, scope)` is the only reader:
`(base + Σ add) × Π mul`, in that fixed order so draft order cannot change a
number. A key may be scoped with a dot — `rate.furnace` is the tunable `rate`
narrowed to one machine — and `TUNABLES` rows carry per-scope base overrides, so
a variant machine is faster purely by tuning. Every phase that introduces a
number introduces it as a **row in `data/tuning.js` read through `eff()`**, never
as a module constant.

**There is already a notification channel.** `rules` never calls `play()` or
`toast()`; it pushes a row onto `model/journal.js` and `shell/notify.js` drains
it once a frame. Every refusal in this plan — a pickup over the cap, a climb
blocked, a tile too hard for the pick — is a journal row carrying its reason.

**There is already a test harness with a synchronous tick API.**
`src/shell/main.js#installTestHook` exposes `globalThis.__mf` under `?test=1`
with `newRun(seed)`, `step(dt)`, `frames(n, dt)`, `hold(keys, n, dt)`, `draw()`,
`mouseAt(sx, sy)`, `revealAll(band)` and read handles on `clock`, `cam`,
`player`, `run`, `aim`, `items`, `machines`, `cmd`, `flags`, `hover`, `hits`.
`tests/visual.spec.js` (903 lines) drives it and contains **zero**
`waitForTimeout` calls already. Phase 6 extends this; it does not replace it.

### The four decisions, already made

D1 (four tiers: Boon / Trinket / Miracle / Machine grant), D2 (canvas-drawn
widget layer, and where it lives in the graph), D3 (mass in talents, cap is new
state) and D4 (encumbrance gates ascent: soft 75%, hard 100%, climb falloff to
40%, blocked at/over hard, walking and descent never affected) are resolved in
**`CLAUDE.md` §"Resolved decisions"**. Read that, do not re-derive it, and do
not soften it.

---

## 1. Process rules

These matter more than the agent definitions.

1. **One phase = one commit per agent.** Never run two agents concurrently
   against overlapping files. Subagents do not know about each other and the
   loser silently clobbers the winner.
2. **The reviewer runs after every phase**, reading the phase spec plus
   `git diff`, output to `docs/REVIEW-phase-N.md`. Cheap, and it catches the
   "implemented something adjacent" failure mode that is otherwise invisible
   three phases later.
3. **Scope discipline.** Do not implement anything not in your task spec, even
   if it is obviously missing or obviously broken. Write it to
   `docs/FINDINGS.md` with a `file:line` reference and move on. No new `TODO`
   without a matching `docs/FINDINGS.md` line.
4. **Definition of done, every task:**
   - `npm run check` passes — including section 0, dependency direction, which
     must stay at **0 violations**.
   - `npm run lint` passes (oxlint, no config).
   - `npm run test:visual` passes, or a deliberate visual change is re-accepted
     with `npm run test:visual:update` **and the commit says why the pixels
     moved.** `maxDiffPixels` is 0 and stays 0.
   - You changed only files in your task's FILE OWNERSHIP block.
   - Any number you introduced is a row in `data/tuning.js` (or on a `data/`
     content row) and is read through `eff()` / `scaled()`.
   - Any number `docs/SPEC.md` should own is **in `docs/SPEC.md` first**, in the
     same commit.
5. **Report testing honestly.** Say what `npm run check` and
   `npm run test:visual` actually said. Screenshots prove appearance has not
   *changed*; they do not prove it is good. That still needs a human, and the
   current baselines are UNREVIEWED.

### Subagent roster

Put these in `.claude/agents/`. The orchestrator writes the specs.

| agent | role | may write |
|---|---|---|
| `cartographer` | reads code, produces maps and audits | `docs/` only |
| `systems` | gameplay mechanics, data tables, simulation | `src/data/`, `src/model/`, `src/rules/`, `src/shell/` per ownership block |
| `ui` | the canvas widget layer and panels | `src/view/` (+ `src/shell/ui.js` where named) |
| `harness` | verification | `tools/`, `tests/`, `package.json` scripts |
| `reviewer` | checks a phase's diff against its spec | `docs/` only, verdict only |

---

## Phase 0 — Targeted hardcode census (1 × `cartographer`, read-only)

Deliberately **short**. The earlier draft asked for an exhaustive module map and
state inventory; most of that is already written down, in the file headers, in
`ARCHITECTURE.md` and in `CLAUDE.md` §"Where to look". Duplicating it into
`docs/AUDIT.md` would create a second description of the architecture that can
drift from the first. So this phase audits exactly one thing: **what is still
hardcoded that the new mechanics need to bend.**

```
Read CLAUDE.md and ARCHITECTURE.md first. Read only — modify nothing outside
docs/.

Produce docs/AUDIT.md. Four sections, dense tables, file:line references, no
narrative, no proposals, no code.

1. LITERALS THAT MUST BECOME TUNABLES. Every number written as a literal in
   src/rules/, src/model/ or src/shell/ that the mechanics in
   docs/BUILD_PLAN.md phases 2-4 will need to modify. For each: file:line, the
   literal, what it means, and which data/tuning.js row it should become (or
   "keep — geometry, not a tunable", with a reason). Note that
   src/rules/mining.js#HARD_BREAK is already documented as selecting a journal
   kind rather than a mechanic; say whether you agree.

2. LITERALS THAT MUST BECOME CONTENT ROWS. Any place a mass, a duration, a
   count or a capacity is written in src/ rather than on a data/ row. Check
   src/model/items.js, src/model/machines.js, src/rules/machines.js,
   src/rules/items.js, src/rules/lift.js, src/rules/belts.js.

3. DEBUG SPAWN PATHS, exactly as they are. Trace every key handled in
   src/shell/input.js — W A S D, arrows, space, X, J, E, U, G, C, H, I, O, M,
   F, T, B, L, R, and 1-9 — to what it sets and who consumes it. For each,
   state whether it creates something from nothing, and where the consumer is.
   Pay particular attention to: F and L (which set wants.machine), T and B
   (which set wants.draft), and how src/shell/main.js#applyIntents consumes
   them. Note which of these are the ONLY way to exercise a real mechanic
   today, because Phase 3 removes some of them and must not remove a mechanic's
   only entry point without replacing it.

4. HOOKS PHASES 2-6 WILL NEED. For each, name the file:line where it goes and
   whether it already exists:
   - a per-band Uint8Array alongside model/world.js#b.seen (for a light field)
   - a per-frame rules step slot in src/shell/schedule.js, and which existing
     adjacent pair a new step would sit between
   - a drop-material verb (there is currently no way to put anything down —
     confirm this and say what the nearest existing code is)
   - a "which tool is held" query in src/model/run.js next to hasPick()
   - a place for a serialisable UI projection on globalThis.__mf

Do NOT write a module map, a state inventory, a tick/render description or a
serialization section. Those are already in ARCHITECTURE.md and the file
headers; a second copy would drift. If you find one of them WRONG, that is a
finding — put it in docs/FINDINGS.md with a file:line.
```

**FILE OWNERSHIP:** `docs/AUDIT.md`, `docs/FINDINGS.md`. Nothing else.

**Acceptance:** section 3 accounts for every `if (k === ...)` in
`src/shell/input.js`, and section 1 contains no "etc.". If either does, re-run.

---

## Phase 1 — Extend the registry (1 × `systems`, serial, plan-mode first)

**Not "build a registry."** The registry exists. This phase adds the content the
later phases consume, and adds the *content lint* that makes an unreachable
recipe fail a build instead of confusing a player. Have the agent produce a plan
and stop for review before editing.

```
Read CLAUDE.md, ARCHITECTURE.md, docs/AUDIT.md, and — before you write a single
row — the header comments of src/data/substances.js and src/data/forms.js. They
state the rule that decides where a new thing goes. Follow it.

THE RULE: a substance is an ELEMENT. Anything you can hold is substance x form.
A thing with no element of its own is a FORM of the element it came from. Do
not create a flat item table; do not create data/items.js or data/entities.js.
Behaviour must be IDENTICAL for existing content after this change.

1. NEW FORMS (append-only rows in src/data/forms.js — the index is half the
   tile-id byte, so appending keeps every existing id valid):
   - 'brand'  : subTags ['organic'], tags ['fuel','light']. A hollow fennel
                stalk carrying stolen fire. massK ~0.5. No tile block.
   - 'phial'  : subTags ['miracle'], tags ['miracle']. The one form a miracle
                may take, kept separate from 'relic' precisely so a miracle can
                never satisfy a trinket selector by accident.
   Adding forms raises STRIDE. src/data/forms.js has a guard that throws at
   import if substances x forms overflows the tile byte — verify by running
   `npm run check` and report the new headroom (substances still allowed).

2. NEW SUBSTANCES (append-only rows in src/data/substances.js), for the deep
   strata Phase 2c's pick tiers gate against. Two rows, both rock-family, both
   with a tile block, both mineable to 'gravel' so no new rubble form is
   needed:
   - 'granite'  hard ~2.4 s, tile.tier 2
   - 'adamant'  hard ~5.0 s, tile.tier 3, tags include 'metal' so it can take
                ore/ingot/plate forms later
   `tile.tier` is a NEW optional key: absent means tier 1. Document it in the
   header block beside `hard` and `drops`.

3. NEW TUNABLES (rows in src/data/tuning.js — the ONLY file this table may be
   read from is model/mods.js; do not import it anywhere else):
   - burden           value  40    talents   hard carry cap
   - burdenSoft       value  0.75  x         fraction of cap where falloff starts
   - burdenClimbFloor value  0.40  x         climb multiplier at the hard cap
   - trinketSlots     value  3     slots     equip slots
   - lightMax         value  15    levels    daylight / brightest emitter
   - lightFalloffAir  value  1     levels    lost per tile through air
   - lightFalloffRock value  3     levels    lost per tile through solid rock
   - brandSecs        value  90    s         one lit brand's burn time
   - toolTier         scale  1.0   scope 'substance'   bends tile.tier gating
   - tossUp           value  50    px/s      upward toss on a newly spawned
                                             falling item (drop verb only —
                                             see docs/FINDINGS.md's toss-
                                             velocity finding; the four
                                             existing hardcoded call sites in
                                             rules/mining.js, rules/trinkets.js,
                                             rules/crafting.js and
                                             rules/machines.js are NOT touched
                                             this phase, only the new drop verb
                                             reads this row)
   - tossSpread       value  12    px/s      horizontal scatter on the same
   Every one of these gets a `note` explaining the number, in the style of the
   rows already there. Add them to docs/SPEC.md in the same commit — a new
   locked-numbers section for encumbrance, light and tool tiers.

4. NEW RECIPES (src/data/recipes.js, append to RECIPES):
   - 'kindle'  in { 'timber/log':1 }  out [{ sub:'timber', form:'brand', n:3 }]
               secs 1.5, hand:true
   Keep the existing shape exactly. Note in the row's comment that this is the
   first recipe whose output form is not a compression tier.

5. CONTENT LINT — a new tool, tools/content.mjs, exported as a function the
   same way tools/layers.mjs exports checkLayers({quiet}), imported by
   tools/check.mjs as a new section 1b, AND runnable alone via a new
   `npm run check:content` script for a pre-commit hook. Assert:
   - every recipe input/output selector expands to at least one legal pair
     (USE src/data/forms.js#expand — it exists for exactly this; a hand-rolled
     string check was written here once and was strictly worse)
   - every substance with an `item` block has a finite positive mass; every
     form has a finite positive massK
   - every machine `cost` key parses to a real, holdable sub/form pair
   - every machine `cost` key is REACHABLE: the pair is either mined directly
     (some substance's tile.drops) or produced by some recipe's out clause
   - every pair the game actually DECLARES — a recipe's concrete `out` pair
     (literal `sub`, or every substance a `subFrom` clause could resolve to),
     or a machine `cost` key (already the section-4 job, don't duplicate) — is
     reachable from a mined pair through the recipe graph. Scope the universal
     set to DECLARED pairs, not `data/forms.js#expand`'s full `crossable()`
     cartesian space: `crossable()` is an ANY-match on tags, so it already
     calls some pairs "holdable" that nothing in the game produces or
     requires — `copper/gravel` and `tin/gravel` are holdable today
     (`gravel`'s `subTags` is `['metal','rock']`) with no mining path or
     recipe ever touching them, and that is harmless: nothing declares them,
     so there is nothing to orphan. Asserting over the full holdable space
     fails on that pre-existing, harmless gap on the very first run — check
     reachability of what the content table actually says exists, not of
     every pair the tag algebra happens to permit.
   - no recipe produces more total MASS than it consumes unless the row is
     tagged `transmute` (catches accidental infinite-material loops). Compute
     mass with the same substance-mass x form-massK arithmetic
     model/items.js#massOfPair uses; do not duplicate the formula, state in a
     comment that it mirrors it, and assert the two agree for one known pair.
   - every hand:true recipe is byte-identical in `in`, `out` and `secs` to the
     row a machine names — this is guaranteed today because they are the SAME
     frozen object, so assert object identity and say so in the failure message
   - every tunable key named by any data/ modifier row resolves, scope included
   - tile.tier is monotonic against hard: nothing at a higher tier is softer
     than something at a lower one

STOP after writing docs/PLAN-phase1.md with the exact row list and the new
headroom figure from the tile-byte guard. Wait for approval before editing.

FILE OWNERSHIP: src/data/forms.js, src/data/substances.js, src/data/recipes.js,
src/data/tuning.js, src/data/world.js (strata only, to place granite and
adamant), src/data/palette.js + src/core/palette.js (new colour names only),
tools/content.mjs, tools/check.mjs (the new section only), package.json
(scripts only), docs/SPEC.md, docs/PLAN-phase1.md, docs/FINDINGS.md.
Nothing under src/model/, src/rules/, src/view/ or src/shell/.
```

**Acceptance:** `npm run check` and `npm run check:content` pass; `npm run
test:visual` still passes with **no** snapshot updates (nothing rendered
changed, because nothing placed the new content yet); the new headroom figure is
reported. Deliberately temporarily-mutate `data/recipes.js` to point one
selector at a nonexistent tag and confirm `check:content` fails — a lint that
has never been seen to fail has not been tested.

---

## Phase 2 — The missing verbs (3 × `systems`, parallel, disjoint ownership)

Run all three, then the reviewer. They are parallel-safe because 2a owns the
player and the pockets, 2b owns the light field and its render pass, and 2c owns
machines and mining. All three append to `data/` tables; **appending to
different tables is safe, appending to the same table is not**, so the
assignments below are exclusive.

### 2a — Encumbrance, dropping, and ladders

Two coupled features plus one prerequisite, one agent, because all three touch
the player and the pockets.

```
Read CLAUDE.md (especially §"Resolved decisions" D3 and D4, which are binding
and not to be softened), ARCHITECTURE.md, docs/AUDIT.md, docs/SPEC.md, and
src/rules/player.js in full — its header records three bugs that each cost real
debugging time, and you are editing the file they live in.

(0) A DROP VERB, FIRST. There is currently no way to put material down. Ship
    the encumbrance lockout without one and an over-cap player is soft-locked.
    - a new one-shot intent in src/shell/input.js, EDGE-TRIGGERED like `place`
      (a held key emptying the pockets into a wall in half a second is a bug
      this file's header already records for `place`)
    - consumed in src/shell/main.js#applyIntents, calling a new exported
      function in src/rules/items.js
    - it spawns the pair as a falling item at the player's feet with a small
      toss, exactly the idiom rules/crafting.js and rules/trinkets.js#grant
      already use, and spends exactly one unit from run.inv. Read the toss
      velocity through eff('tossUp') / eff('tossSpread') (new Phase 1 rows) —
      do not hardcode a fifth magic toss number; docs/FINDINGS.md records that
      the four existing call sites already disagree with each other and this
      verb should not add a fifth disagreement
    - which pair: the heaviest held pair, so the verb is useful under the cap
      you are trying to get under. Not the first in HUD order.
    - it pushes a journal row so shell/notify.js can say what was dropped

(1) ENCUMBRANCE. Mass is in TALENTS (T). Mass semantics do not change:
    model/items.js#massOfPair already returns substance mass x form massK.
    - NEW MODEL QUERY, in src/model/run.js beside canAfford/pocketsHave:
      burdenOf() summing massOfPair(sub, form) * n over run.inv, and
      burdenFrac() = burdenOf() / eff('burden'). A query on numbers, so it is
      model, not rules.
    - the cap is eff('burden'); the soft threshold is eff('burdenSoft'); the
      climb floor is eff('burdenClimbFloor'). All three exist as of Phase 1.
      There is no constant anywhere.
    - EFFECT ON MOVEMENT, in src/rules/player.js only:
        frac <= soft            climb speed x 1.0
        soft < frac < 1         climb speed x lerp(1.0 -> floor)
        frac >= 1               ladder-up REFUSED, hop REFUSED
      Walking on level ground and every downward movement are NEVER affected,
      at any burden. You can always fall.
    - DO NOT gate the one-tile auto-step in moveX. CLAUDE.md records that
      gating a height gain on state is what wedged a player in their own shaft
      permanently, and an over-cap player must be able to walk over rubble to
      reach the ledge they need to drop ore onto. Leave a comment saying so.
    - PICKUP REFUSAL, in src/rules/items.js: a pickup that would cross the hard
      cap is refused and the item stays on the ground. Push a journal row with
      a reason; shell/notify.js turns it into a line. No modal, no new UI.
    - a refused pickup must not spin: the item must not be re-tested every
      frame in a way that spams the journal. Rate-limit via the journal kind,
      the way rules/mining.js's 'pick' row already is in data/sfx.js.
    - the boarding refusal for a lift stage going UP belongs here too, in
      src/rules/lift.js: over the cap, you do not get on.

(2) LADDERS, TIERED. Today any timber log places as a climbable tile, via
    data/forms.js#log's tile block — placing logs IS building a ladder, and
    that stays true. What is missing is a cheap dedicated rung and a fast tier.
    - 'timber/rung' is a NEW FORM row in src/data/forms.js: subTags
      ['organic'], tile { solid:false, climb:true, hardK:0.20 }, massK ~0.35 —
      cheaper and lighter than placing a whole log. Recipe 'peg_rungs':
      1 timber/log -> 4 timber/rung, 1.5 s, hand:true.
    - the tier-2 'daedalan' stair is a form too, not a substance: 'stair',
      subTags ['metal'], tile { solid:false, climb:true }, so copper/stair is
      the real pair. Recipe: 2 copper/plate + 4 timber/log -> 2 copper/stair.
      It climbs faster: a per-form `climbK` on the form row, multiplied into
      eff('climb') by rules/player.js. ~1.8x. Vertical throughput becomes an
      upgradeable axis, which is the point.
    - climbing costs no resource. The cost of ascent is time and burden, and
      that is deliberate — see ARCHITECTURE invariant 4.
    - src/rules/placement.js#placeTile already refuses an unbacked ladder tile
      and already counts the tile BELOW as backing. Do not change that rule:
      CLAUDE.md records that requiring rock support made the last two rungs out
      of a shaft unplaceable and "the shaft became a grave."

HUD: one plain line is enough for now — 'BURDEN 12.5 / 40 T' in the existing
5x7 font via drawText, amber past the soft cap, red at the hard cap, with the
words 'TOO HEAVY TO CLIMB' when locked out. The dense burden BAR is Phase 5.
Nothing else in view/ changes.

FILE OWNERSHIP:
  src/model/run.js          (burdenOf, burdenFrac, run.equipped is NOT yours)
  src/model/player.js       (only if a field is genuinely needed; prefer not)
  src/rules/player.js
  src/rules/items.js
  src/rules/lift.js         (the upward-boarding refusal only)
  src/rules/placement.js    (only if the new forms need it; prefer not)
  src/shell/input.js        (the drop intent only — no other key)
  src/shell/main.js         (applyIntents: the drop branch only)
  src/view/hud.js           (the one burden line only)
  src/data/forms.js         (append 'rung' and 'stair' + climbK; YOU own this
                             file this phase — 2b and 2c may not touch it)
  src/data/recipes.js       (append 'peg_rungs' and 'daedalan'; YOU own this
                             file this phase)
  docs/SPEC.md, docs/FINDINGS.md
Do NOT touch src/model/world.js, src/rules/reveal.js, src/view/scene.js,
src/data/machines.js, src/rules/machines.js, src/rules/mining.js,
src/data/substances.js — other agents own those this phase.
```

### 2b — Light and darkness

```
Read CLAUDE.md, ARCHITECTURE.md, docs/AUDIT.md, and src/rules/reveal.js in
full. That file already implements SIGHT, and this task must compose with it
rather than duplicate it.

HOW LIGHT AND FOG COMPOSE — read this twice before writing anything.
There are TWO separate facts about a tile and they must not be collapsed:

  model/world.js#b.seen   HAS THE PLAYER EVER SEEN THIS TILE. Permanent,
                          one-way, never cleared (write.reveal has no
                          opposite). This is MEMORY, and it controls whether
                          view/scene.js draws the tile at all — an unseen tile
                          is opaque fog.
  model/world.js#b.light  HOW LIT IS THIS TILE RIGHT NOW. 0..15, recomputed,
                          goes down as well as up. This is a CURRENT
                          condition, and it controls how DARK a tile that has
                          already been seen renders.

So: memory is not lost when a torch burns out, but the room goes dark. That is
the right feel and it is also why the existing permanence rule survives intact.

The one change to rules/reveal.js: Pass B's flood must not walk through
unlit air. Today it floods eff('sightRadius') graph-distance through any
non-solid tile, which would let a player map a pitch-black cavern by standing
in it. Cap the flood: past distance 1 (the always-revealed immediate
neighbours, which subsume the old radius-1 rule and must keep working in a
fully solid dead end), a tile is only enqueued if lightAt() >= 1. Pass A —
standing under open sky, unbounded — is UNCHANGED: daylight is level 15 and
there is nothing to obstruct a view across open air.

LIGHT FIELD
  - storage: a Uint8Array per band, b.light, allocated in
    src/model/world.js#write.allocate alongside b.seen, same idx() addressing,
    cleared by the same path that clears seen on newRun(). Add writers
    (write.setLight / write.clearLight) and one query (lightAt(b, tx, ty)).
    Storage and query are model; the decision about propagation is rules.
  - propagation: a new sibling src/rules/light.js. BFS from every emitter,
    decrementing eff('lightFalloffAir') per tile through air and
    eff('lightFalloffRock') per tile through solid rock, so light does not leak
    through strata. Deterministic: no rand() anywhere, ever (invariant 7).
  - RECOMPUTE ONLY ON A DIRTY CHUNK, never per frame. model/world.js#b.ver[]
    is already bumped on every tile write and is already the staleness signal
    view/paint.js#chunkCanvas and rules/reveal.js#passB both trust. Use it.
    Also recompute when an emitter is added, removed, moves or goes out.
  - sky: a tile with model/tiles.js#skyExposedAt true is seeded at
    eff('lightMax'). Read that comment first — skyExposedAt walks from a tile
    to row 0 on EVERY call, so calling it per tile over a 128x320 band is close
    to quadratic. rules/reveal.js#passA solved exactly this by walking DOWN
    from row 0 once per column and stopping after the first solid tile. Do the
    same. Do not call skyExposedAt in a loop over tiles.
  - FIXED AFTER PHASE 0: the live STEPS order is `player -> reveal -> mining ->
    items -> ...`, NOT `player -> mining -> reveal -> ...`. There is no
    existing mining-then-reveal adjacency to insert into. `reveal` currently
    sits right after `player` on the stated rationale that it "reads nothing
    mining touches and writes nothing anything else reads" — true today, and
    exactly the invariant this phase breaks once Pass B gates its flood on
    lightAt(). So: MOVE reveal. The new order is
    `player -> mining -> light -> reveal -> items -> ...`. Register `light` as
    a new step immediately after `mining` and move the existing `reveal` entry
    to immediately after `light`. Rewrite BOTH header-comment entries in
    src/shell/schedule.js: `player before reveal` no longer applies (delete
    it), and its old reasoning is replaced by two new adjacent-pair entries —
    `mining before light` (a tile broken this frame opens a new light path
    this frame) and `light before reveal` (reveal's flood now reads this
    frame's light, not stale). Do not leave the old `player before reveal`
    prose in place describing an edge that no longer exists.

RENDERING (src/view/scene.js only)
  - a darkness pass over tiles that ARE seen, drawn after the terrain and the
    field overlay and BEFORE the fog pass — fog is opaque and must win.
  - QUANTISED to a small number of palette steps. No smooth gradients, no
    createLinearGradient, no alpha ramp per pixel. Integer rects via R(), the
    same row-run coalescing drawFog already does (it walks each row once and
    paints one wide rect per contiguous run). Match that.
  - at light 0 a seen tile reads as remembered-but-dark, not as fog: visibly
    different from an unseen tile, or the two facts have been collapsed after
    all. Prove the pixels differ.
  - below roughly light 4 an ore vein must be indistinguishable from rock. That
    is what makes a torch a prerequisite rather than decoration.
  - the existing machine-fire glow pass is already gated on seenAt for a stated
    reason (globalCompositeOperation 'lighter' would add light straight through
    an opaque fog rect). Your darkness pass must not reintroduce that bug from
    the other side.

CONTENT — Greek-thematic. Prometheus carried the stolen fire in a hollow fennel
stalk, so the starting light is consumable and that is the point.
  - the carried light is 'timber/brand' (the 'brand' form, added in Phase 1):
    level 9. It burns for eff('brandSecs') and is then consumed. Burn time is a
    SCALAR ON run, not per-item state — run.brandLeft, ticked by rules/light.js
    — for the same reason run.craftProgress is a scalar: a player has one pair
    of hands and there is only ever one lit brand. It resets with the run for
    free (invariant 8). Recipe 'kindle' exists as of Phase 1. Add one brand to
    the starting kit in src/shell/boot.js, planted near spawn as a physical
    pickup exactly like the stock pickaxe — nothing teleports into your hands.
  - 'brazier': a placed machine ROW in src/data/machines.js. level 12 while
    fuelled. It burns '*/#fuel' through the honest-fuel recipe shape the belt
    and the lift stage already use — { in:{ '*/#fuel':1 }, out:[], secs:N }
    banks a charge — and rules/light.js reads the charge to decide whether it is
    lit. cost: 4 timber/log + 2 stone/gravel.
  - 'hearth': placed, level eff('lightMax'), never expires. Design wants this
    priced in essence (the 60:1 tier), which does not exist yet, so price it at
    2 copper/plate FOR NOW and put a line in docs/FINDINGS.md saying it should
    be repriced in essence when that tier lands. Do not invent an essence
    substance to make the price look right — that is Phase 1's table, not
    yours.
  - light on a machine row is a NEW INTERPRETER KEY: `light:{ level,
    whileRunning }`. ARCHITECTURE §3 is explicit that adding a behaviour
    nothing has yet costs engine code — one key and one branch. That is the
    accepted trade; state the cost in your commit message. No machine NAME may
    appear in rules/light.js, and no machine or substance name may appear
    anywhere in src/view/ (§3, and it is currently true).

FILE OWNERSHIP:
  src/model/world.js        (b.light, its writers, lightAt)
  src/rules/light.js        (new)
  src/rules/reveal.js       (the Pass B light gate ONLY — do not touch Pass A)
  src/view/scene.js         (the darkness pass only)
  src/view/paint.js         (only if a vein must dim within a chunk canvas;
                             prefer the overlay pass and say why if not)
  src/shell/schedule.js     (the one new step + its comment)
  src/shell/boot.js         (planting the starting brand only)
  src/data/machines.js      (append brazier + hearth; YOU own this file this
                             phase — 2c may not touch it)
  src/core/palette.js, src/data/palette.js  (darkness step colours only)
  docs/SPEC.md, docs/FINDINGS.md
Do NOT touch src/data/forms.js, src/data/recipes.js, src/data/substances.js,
src/rules/player.js, src/rules/items.js, src/rules/mining.js,
src/rules/machines.js, src/model/run.js, src/view/hud.js.
```

### 2c — Mining tiers and the automated line

```
Read CLAUDE.md, ARCHITECTURE.md, docs/AUDIT.md, docs/DESIGN.md ("Hands compete
with machines on throughput; they lose on headcount"), and both
src/model/mining.js and src/rules/mining.js.

WHAT ALREADY EXISTS AND MUST NOT BE REINVENTED:
  - hardness is ALREADY seconds-to-break, on substances.tile.hard, and it is
    already framerate-independent at 8 tested framerates. It used to be a
    truncated byte in the tile array, which made granite unmineable above
    106 fps. Progress is seconds in model/mining.js; the decision that a tile
    broke is rules/mining.js. Do not move either.
  - the `hard` scale tunable already bends hardness per substance, applied in
    exactly ONE place (rules/mining.js) so a trinket cannot be read around.
  - mined material ALREADY becomes a falling item, never an inventory credit
    (invariant 5). Machines are catch boxes: material that falls in is free.
    That one line is the whole thesis of the game.
  - backpressure already exists: model/machines.js#full / capOf, and
    rules/machines.js stalls on it. Reuse it; do not reimplement it.

You are adding a GATE on top of hardness, not a second hardness.

TIERS — thematic, bronze automata and the smiths' myths, not "drill mk2":
  T1  BRONZE PICKAXE   hand. Exists today as the 'pick' relic substance row.
                       Unchanged in behaviour.
  T2  ADAMANT AUGER    hand. Faster per swing AND bites the harder deep strata
                       a pickaxe cannot. 2 copper/plate + 1 timber/log.
  T3  TALOS HEAD       placed. A severed bronze automaton head that chews the
                       tile it faces. Burns fuel. Mines at exactly the T2 HAND
                       rate — the win is that it runs unattended in a shaft you
                       are not standing in. 8 copper/plate + 2 copper/ingot.
  T4  CYCLOPS MAW      placed. Breaks a 3-tile face, deep strata only, high
                       fuel draw. Gated behind depth.

  T3 must not out-throughput a hand at T2. docs/DESIGN.md is explicit that
  automation buys parallelism and nothing else, and Phase 6 asserts it over the
  data. Get it exactly equal, not approximately.

MECHANICS
  - TOOLS ARE RELIC SUBSTANCES, not a new table. The stock pickaxe is already
    a substance row tagged 'relic' taking the 'relic' form, and
    model/run.js#hasPick() is invCount(S.pick, F.relic) > 0 — a capability GATE,
    which is why it is not a data/trinkets.js modifier. Follow that exactly:
    the auger is one more relic substance row, and the tool's numbers live on
    that row as `item.tool:{ tier, power }`.
  - a new query in src/model/run.js beside hasPick(): bestTool(), returning the
    highest-tier tool relic currently held. hasPick() stays, expressed in terms
    of it, so nothing that calls it breaks.
  - rules/mining.js refuses a tile whose tile.tier (Phase 1 added the key;
    absent means 1) exceeds the held tool's tier, scaled by
    eff('toolTier', substanceId) so a boon can lend you one tier. Refusal is a
    journal row with a reason — 'TOO HARD FOR THIS PICK' — not a silent no-op.
    A silent no-op on a wall you are swinging at is unreadable.
  - the tool's `power` multiplies eff('pickPower'). One place, like `hard`.
  - a PLACED miner is a machine row with a new interpreter key:
    `mine:{ facing, tier, tiles, secs }`. It needs a target tile, a fuel slot
    and an output port. Its output DROPS to the tile below the out port as a
    falling item, per invariant 5 — it is never teleported to the player and
    never credited to a buffer directly.
  - a miner with no fuel, no valid target, or a blocked drop stalls VISIBLY,
    through the existing stall path.
  - depth gating for T4: a machine row key `minDepth` in tiles below the spawn
    band's datum, checked in rules/placement.js, refused with a reason.
  - this is TWO new interpreter keys (`mine`, `minDepth`). ARCHITECTURE §3
    accepts that adding an unprecedented behaviour costs engine code. State the
    cost in your commit message. No machine name in rules/machines.js, no
    machine or substance name in src/view/.

FILE OWNERSHIP:
  src/data/substances.js    (append the auger relic + item.tool on it and on
                             'pick'; YOU own this file this phase)
  src/data/machines.js      (talos + maw rows — COORDINATE: agent 2b also
                             appends to this file. Resolve by having 2b commit
                             first and rebasing; if that is not possible, this
                             task is serialised after 2b. Do not both edit it
                             concurrently.)
  src/model/run.js          (bestTool only — 2a owns burdenOf in the same file;
                             same coordination rule applies)
  src/model/mining.js       (only if the tier gate genuinely needs storage;
                             prefer not, and say why)
  src/rules/mining.js
  src/rules/machines.js     (the `mine` key branch only)
  src/rules/placement.js    (the minDepth check only)
  src/data/recipes.js       (auger recipe — 2a owns this file; same
                             coordination rule)
  docs/SPEC.md, docs/FINDINGS.md

  NOTE ON THE OVERLAP. 2a, 2b and 2c each need to append to data/ tables and
  two of them touch model/run.js. Appending to a frozen table is not a merge
  conflict in principle but IS one in practice. The orchestrator resolves this
  by running 2a, then 2b, then 2c as three commits in that order if the
  agents cannot be given genuinely disjoint files — parallelism here is a
  convenience, not a requirement, and a silent clobber costs more than the
  wall-clock saved.
Do NOT touch src/rules/player.js, src/rules/items.js, src/rules/light.js,
src/rules/reveal.js, src/view/scene.js, src/view/hud.js, src/shell/input.js.
```

**Acceptance for Phase 2 (do this by hand, in a browser):** hand-craft peg
rungs and a brand from timber; climb down into a dark shaft and watch ore veins
become indistinguishable from rock; place a brazier and watch the strata come
back; mine until you are over 40 T and find that you cannot climb out; drop ore
until you can. **None of that may require a debug key.** Then: dig to granite
with only the stock pickaxe and confirm you are told why it will not break.

---

## Phase 3 — Buildables cost real material (1 × `systems`, serial)

```
Read CLAUDE.md, ARCHITECTURE.md, docs/AUDIT.md §3 (debug spawn paths), and
src/rules/placement.js in full.

WHAT ALREADY EXISTS: data/machines.js already has an optional `cost` key —
exact sub/form pairs, not selectors, because a build bill is a specific list of
materials — and rules/placement.js already checks it with
model/run.js#canAfford AFTER every other refusal and spends it only once
placement is guaranteed. `belt_r` already carries a real cost. The build MENU
already exists: model/run.js#buildableMachines() feeds view/hud.js's BUILD
section, and shell/input.js's 1-9 keys select the Nth row of the SAME list in
the SAME order. So "press 3 places the third row" already cannot disagree.

WHAT IS MISSING: furnace and lift are free, and F and L spawn them from
nothing.

AN ACCEPTED DEVIATION FROM THE ORIGINAL PLAN, AND ITS REASON. That plan asked
for a `furnace` ITEM you carry and place. In this codebase a held thing is
substance x form, and a furnace is not an element — making it one would mean a
substance row per machine, which is exactly the rule data/substances.js's header
forbids. So the mechanic is delivered through COST AT PLACEMENT instead: the
material bill IS the commitment, and because Phase 2a made mass a hard cap, a
20-talent bill is a haul you plan a trip around. The design intent ("hauling a
machine down a shaft is a trip you commit to") is preserved; the implementation
is not a machine-item. Do not add a machine-item form.

1. REAL COSTS on src/data/machines.js. Price them in talents against the 40 T
   cap so the haul is the decision:
   - furnace: 12 copper/ore + 6 timber/log   (~16.8 T of ore and timber)
   - lift:    6 copper/plate + 4 timber/log + 2 copper/ingot
   - press:   priced, and its provisional-free comment updated or deleted
   - belt_r / belt_l: already priced, unchanged
   Put these numbers in docs/SPEC.md in the same commit.

2. ONE PLACEMENT FLOW, used by every buildable — machines, rungs, stairs,
   braziers, miners:
     select (build menu digit, or the pockets for a tile-capable form)
       -> ghost preview at the aimed tile, snapped to the grid
       -> validity check: footprint clear, footing satisfied, granted,
          affordable, depth allowed
       -> valid ghost tinted ok / invalid tinted bad, with the ONE-WORD reason
          drawn beside it
       -> confirm spends exactly the bill and instantiates
   The refusal reasons already exist as journal strings in
   rules/placement.js ('NEEDS A FLOOR', 'CANNOT AFFORD IT', ...). Reuse them
   verbatim; do not write a second set. The ghost is view: it reads
   model/aim.js and a model query for validity. VIEW MAY NOT IMPORT RULES, so
   the yes/no it draws must come from a MODEL query — extend the
   canAfford/canPlace pattern in model/run.js with a placementCheck(band, id,
   tx, ty) returning { ok, why }, and have rules/placement.js CALL THAT rather
   than keeping its own copy. One implementation, two readers. That is the same
   move canAfford already made for the greyed-out build rows.

3. DECONSTRUCT. Returns the full bill, minus nothing, if the machine is empty
   of contents and fuel; refused with a reason if it still holds anything. New
   exported function in rules/placement.js, a new edge-triggered intent in
   shell/input.js, consumed in main.js#applyIntents.

4. REMOVE the F and L handlers from src/shell/input.js. The build menu already
   covers both. If you want them for development they move behind the existing
   `flags.showDebug` (H) gate and must be no-ops when it is off — exactly the
   pattern the 1-9 digits already use against flags.showInv.
   BEFORE YOU DELETE EITHER: docs/AUDIT.md §3 was asked to record whether a key
   is the only entry point for a real mechanic. Check it. If F or L is the only
   way to exercise something the build menu cannot reach, fix the menu first.

5. THE WINCH is the staged lift and the game's bottleneck. Placing it must
   require a shaft it can actually serve — validate that its `lift.span` has
   somewhere to go, and say why when it does not. Five independent stages,
   never one continuous cage (invariant 4).

FILE OWNERSHIP: src/data/machines.js (cost keys only), src/model/run.js
(placementCheck), src/rules/placement.js, src/shell/input.js, src/shell/main.js
(applyIntents), src/view/hud.js + src/view/scene.js (ghost preview only),
docs/SPEC.md, docs/FINDINGS.md.
Do NOT touch src/rules/machines.js, src/rules/mining.js, src/rules/light.js,
src/rules/player.js, or anything under src/view/ui/.
```

**Acceptance:** `grep -rn "wants.machine = '" src/` finds no unconditional
literal outside a `flags.showDebug` gate. A fresh run cannot produce a furnace
without mining 12 copper ore first — verify by starting a run and trying. A
placed furnace deconstructs back into 12 ore and 6 timber; a furnace with ore
in its buffer refuses to, and says why.

---

## Phase 4 — The four modifier tiers (1 × `systems`, serial)

This is the D1 migration. Read `CLAUDE.md` §"Resolved decisions" D1 — it is
already decided; implement it, do not redesign it.

```
Read CLAUDE.md §"Resolved decisions" D1, docs/DESIGN.md §"God gifts", and
src/model/mods.js in full — including the ORDER OF APPLICATION block, which is
a determinism requirement in a game with shareable seeds and not a nicety.

DO NOT BUILD A STAT PIPELINE. One exists: data/tuning.js is the frozen base,
model/mods.js is the run-scoped { src, key, mul, add } list, eff(id, scope) is
the only reader, and (base + sum of add) x product of mul is fixed so draft
order cannot change a number. Only model/mods.js may import data/tuning.js and
the layer checker fails the build otherwise. Every tier below reaches numbers
through THAT. A modifier that cannot reach a tunable is a modifier that does not
exist; if a tier needs a number that has no tunable, ADD THE TUNABLE ROW.

STEP 1 — RENAME THE MACHINE-GRANT TIER. Pure move, zero behaviour change,
commit it separately from everything else in this phase so the diff is
readable:
  src/data/boons.js   -> src/data/grants.js
      BOONS -> GRANTS, BOON -> GRANT, STARTING_MACHINES unchanged in name.
      Update the header comment: this is the MACHINE tier of docs/DESIGN.md's
      four, and it was only ever called "boons" because the timed tier did not
      exist yet.
  src/rules/boons.js  -> src/rules/grants.js
      grant() and draftable() keep their names.
  Fix every importer: src/model/run.js (STARTING_MACHINES),
  src/shell/schedule.js (the re-export at the bottom), src/shell/main.js
  (applyIntents' draft branch), tools/check.mjs (it already reads
  D_boon.MACHINE_BOONS || D_boon.BOONS — make it read GRANTS).
  src/shell/input.js: 'b' currently means wants.draft = 'boon'. It now means
  the machine-grant draft OR the timed-boon draft — pick one, bind the other to
  a free key, and check the full KEYS table plus every `if (k === ...)` before
  choosing, as the 'o' comment in that file documents doing.
  Run `npm run check` and confirm 0 layer violations and no behaviour change.

STEP 2 — TIMED BOONS. New content in a now-free src/data/boons.js:
  { id, name, god, secs, text, mods:[{ key, mul, add }], conflictsWith:[],
    trap:true? }
  - model: NEW src/model/boons.js holding active:[{ id, left }], with
    write.grant / write.tick / write.expire / write.clear, each calling
    model/epoch.js#bump. write.clear() must be called from src/shell/boot.js
    alongside every other model clear — a field surviving a restart is a
    determinism bug (invariant 8), and Phase 6 asserts it.
  - rules: src/rules/boons.js becomes the TIMED step. Decrement in the fixed
    1/120 s step (never a variable dt), and SYNC model/mods.js from the active
    list the same way rules/trinkets.js#step syncs from run.inv — a sync, not
    an event, so an expiry cannot leave a row behind because someone forgot to
    call unequip(). mods rows are keyed src = 'boon:' + id so the boon and
    trinket tiers can never remove each other's rows. Register the step in
    src/shell/schedule.js with a comment on its adjacent pairs; it belongs
    immediately before `machines`, for the same reason `trinkets before
    machines` is already stated — a rate modifier that turned on this frame
    should apply to this frame's recipe tick.
  - stacking: re-applying the same boon REFRESHES duration and does not stack
    magnitude. Different gods' boons may both be active.
  - conflictsWith: two hostile gifts must not silently co-exist. The later
    gift either SUPPRESSES the earlier (its rows removed while both would be
    active) or INVERTS it (mul -> 1/mul, add -> -add). Which of the two is a
    per-row choice, so the field is { id, mode:'suppress'|'invert' }. Ship at
    least one hostile pair as content — Poseidon against Hephaestus is the
    example docs/DESIGN.md gives — because an unexercised branch is an
    untested one.
  - grant and expiry both push a journal row. shell/notify.js turns it into
    sound and text; rules never calls play() or toast().

STEP 3 — MIRACLES. New src/data/miracles.js:
  { id, name, god, text, effect:{ kind, ... } }
  A miracle is a HELD PAIR: a 'miracle'-tagged substance row per miracle,
  crossed with the 'phial' form Phase 1 added. `id` is the substance id, the
  same identity trick data/trinkets.js already uses. New src/rules/miracles.js
  consumes exactly one unit on use, applies its terrain edit, and may grant a
  timed boon as a side-effect (that is one of the three boon sources). Ship one
  row: the simplest real terrain edit available — collapsing or petrifying a
  region of tiles through model/tiles.js#write — plus its side-effect boon.
  Use is an edge-triggered intent, aimed through model/aim.js, consumed in
  main.js#applyIntents.

STEP 4 — TRINKET EQUIP SLOTS. src/data/trinkets.js is UNCHANGED.
  - run.equipped: a new RUN_SCHEMA field, a fixed-length array of substance ids
    (nulls when empty), length capped by eff('trinketSlots'). It is a SELECTION
    over run.inv, not a second inventory — read the header of
    src/rules/trinkets.js on why run.trinkets was deleted.
  - rules/trinkets.js#step syncs mods from run.equipped INTERSECTED with what
    run.inv holds, and clears a slot whose id is no longer held in the same
    pass. The two therefore cannot disagree, which was the whole point.
  - equipping is an action: a new write on model/run.js and a shell intent. The
    drag-to-equip UI is Phase 5b; a keyboard or model-driven path is enough
    here, and Phase 6's test must not depend on pixel geometry.
  - THEY MUST BE EARNED. Delete the unconditional 'T' spawn from
    shell/input.js. Sources, in priority order: (a) a drop table on tribute
    completion — new src/data/drops.js; (b) a rare drop from deep strata tiles,
    in rules/mining.js's existing drop path, THROUGH rand() and nowhere else
    (invariant 7: a run is bit-reproducible from its seed); (c) the cycle
    draft, once cycles are real. The draft UI is out of scope. A trinket
    arriving from a drop table is not.

STEP 5 — THE HUD TIMER STACK (src/view/hud.js). Top-right, BELOW the existing
depth gauge (which draws at y 6) and clear of the debug panel (y 22). A
vertical stack of active BOONS only, newest at top:
     [swatch] NAME  <bar>  0:47
  Bar drains, seconds count down, flashes in the last 5 s. Cap the visible
  stack at 5 with a '+N' overflow row. Drawn with R() and the 5x7 font —
  drawText, never fillText (invariant 11). Nothing in the stack is clickable:
  boons are not player-triggered, they happen to you.
  Trinkets are NOT here. They are permanent and belong in the Character tab
  (Phase 5b). A machine grant is a new row in the BUILD list and needs nothing.
  The flash and the drain must derive from clock.t and the boon's own `left`,
  never from rand() — CLAUDE.md records the furnace flame briefly using rand()
  in a draw path, which made a screenshot depend on how many times you had
  drawn.

STEP 6 — DEBUG. Grant-boon, grant-trinket, grant-miracle and grant-machine all
move behind the existing flags.showDebug (H) gate as an explicit list, and are
no-ops when it is off.

STEP 7 — DOCS, SAME COMMIT. docs/DESIGN.md §"God gifts" and its "Implemented vs
design-only" table were already amended to the four-way split before this phase
began; update the prototype column for everything Phases 1-4 actually shipped,
and update tools/content.mjs to lint the three new tables. The doc is the spec;
do not let it drift.

FILE OWNERSHIP: src/data/boons.js, src/data/grants.js (new, from the rename),
src/data/miracles.js, src/data/drops.js, src/data/trinkets.js (only if a row
needs conflictsWith), src/data/tuning.js is NOT yours — if you need a tunable,
add the row and say so loudly in the commit, since that file's importer rule is
enforced; src/model/boons.js (new), src/model/run.js (run.equipped + its
writers), src/rules/boons.js, src/rules/grants.js, src/rules/miracles.js (new),
src/rules/trinkets.js, src/rules/mining.js (the rare-drop hook only),
src/shell/schedule.js, src/shell/boot.js, src/shell/input.js, src/shell/main.js,
src/view/hud.js, tools/check.mjs + tools/content.mjs (the renamed exports and
the new tables), docs/DESIGN.md, docs/FINDINGS.md.
Do NOT touch src/view/scene.js, src/view/paint.js, src/rules/player.js,
src/rules/light.js, src/rules/placement.js, or anything under src/view/ui/.
```

**Acceptance:** with debug off, `T` and `B` produce no item and no entity.
Complete a tribute and a trinket falls at your feet as a physical item; walk
over it, equip it to a slot, and watch the stat readout change. Grant a boon
from the debug list, watch the timer appear top-right and drain, and confirm
that when it hits zero `eff()` returns exactly the base value again. Grant two
hostile boons and confirm the HUD says which one lost.

---

## Phase 5 — The dense GUI (1 × `ui` for 5a, then 1 × `ui` for 5b)

Only now. The registry, real recipes, real masses, real burden and real
modifiers all exist, so the GUI has something true to display. Building an
inventory grid against a fake item list is the most expensive thing here to
throw away.

### 5a — The widget layer

```
Read CLAUDE.md (§"Resolved decisions" D2 is binding), src/view/hud.js in full,
src/core/font.js and src/core/pixels.js. Reference images, if present, live in
docs/reference/ — study slot geometry, count placement, tab row and tooltip
content for DENSITY. Do not copy anyone's art.

Infrastructure only. No panels.

WHY IN-CANVAS: the whole game renders at ~1/2 to 1/6 window resolution and is
upscaled nearest-neighbour by CSS. A DOM overlay will not sit on that pixel
grid and will read as a different product. Everything here draws with R() /
lineTo() and the 5x7 bitmap font via drawText. NO fillText, ANYWHERE
(invariant 11). No sub-pixel positioning, no antialiased text, no rounded
corners, no gradients.

WHERE IT LIVES (this is decided, see CLAUDE.md D2):
  src/view/ui/*.js    primitives and, in 5b, panels. Same-layer imports are
                      legal, so view/hud.js may import view/ui/panel.js.
  src/shell/ui.js     the MUTABLE UI STATE — which panel is open, active tab,
                      focused slot, drag payload, search string, scroll
                      offsets. It is shell state, handed to view through
                      shell/main.js#frameCtx exactly as shell/input.js#flags
                      already is. VIEW MAY NOT IMPORT SHELL. Follow the flags
                      precedent precisely.
  There is no new top-level directory. tools/layers.mjs would fail the build.

PRIMITIVES (one file each under src/view/ui/):
  panel.js    titled window, 2px bevelled chrome, dark fill, optional close box
  tabs.js     a row of tabs, one active, keyboard-cyclable
  grid.js     fixed-size square slots, configurable columns, scrollable
  slot.js     swatch + count in the bottom-right + optional corner glyph
  bar.js      labelled fill bar (burden, craft progress)
  tooltip.js  follows the cursor, clamps to the viewport, multi-section
  text.js     thin wrappers over core/font.js only if they earn their keep

  Colours come from src/core/palette.js by NAME. Do not inline hex — add named
  entries. view/hud.js's UI table is the precedent.

DENSITY: slots small, tight, uniform; the count in the slot's corner in a
compact face; no wasted padding. The existing HUD's panel clamps for narrow
viewports were learned the hard way (below ~240 px of base width panels overlap
and the depth gauge collides with anything centred) — every primitive must
clamp, and the phone project's base buffer is 200x422, so test there.

INPUT ROUTING, and the layer rule that shapes it:
  - the open panel stack captures input while open, in src/shell/ui.js +
    src/shell/input.js. Click, right-click, drag, ctrl-click, shift-click and
    wheel must all be routed. Escape closes the top panel.
  - these are UI intents on the existing `cmd` / `wants` objects, NOT new
    global hotkeys. One key opens the window (I already toggles flags.showInv —
    reuse it or migrate it, and say which).
  - A CLICK THAT DOES SOMETHING IS SHELL CALLING RULES. view draws and reports
    the rectangles it drew — the exact view/hud.js#pocketHits idiom, which
    exists so hover and layout cannot disagree about where an entry sits.
    shell hit-tests those rects and calls into rules. view never calls rules
    and never mutates model; `npm run check` section 2 proves the second half
    by asserting the epoch counter is unchanged across two renders, and it must
    keep passing.

TESTABILITY (required — Phase 6 depends on it): export a plain serialisable
projection of the live widget tree from src/view/ui/ — panel ids, tab states,
slot contents ({ sub, form, n, mass }), tooltip lines, focused element — and
expose it as `ui` on the existing globalThis.__mf handle in
shell/main.js#installTestHook, beside `hover` and `hits`. One handle, not a
second window.__ui global. It is a PROJECTION of real state, rebuilt each draw
like pocketHits, never a second copy; a copy will drift and the test will pass
against the copy.

FILE OWNERSHIP: src/view/ui/** (new), src/shell/ui.js (new), src/shell/input.js
(UI intent routing only), src/shell/main.js (frameCtx + the __mf.ui handle
only), src/core/palette.js + src/data/palette.js (named entries only),
docs/FINDINGS.md. No gameplay files: nothing under src/rules/, src/model/ or
src/data/ except palette.
```

### 5b — The panels

```
Read CLAUDE.md, and build on src/view/ui/ from 5a. One window, tabbed, opened
by a single intent. IT PAUSES NOTHING — this is an automation game and the
factory keeps running. (Note that flags.showMap deliberately DOES freeze the
run, guarded inside shell/main.js#step; do not copy that here, and do not
break it.)

TAB 1 — CHARACTER
  - inventory grid over model/run.js#pocketRows(), sorted by the ONE ordering
    rule in data/forms.js#byHudOrder. Slots are stack-based, BUT the binding
    constraint is MASS, so a prominent burden bar sits above the grid:
    'BURDEN 31.5 / 40 T', amber past eff('burdenSoft'), red at the cap, with
    'TOO HEAVY TO CLIMB' when locked out. This is the one place you deliberately
    diverge from every other factory game's inventory, and it should be the most
    legible thing in the panel.
  - slot tooltip: name from data/forms.js#labelOf (nothing hand-writes 'COPPER
    INGOT'), mass each and mass total from model/items.js#massOfPair, tier, and
    what it is for.
  - equipment: eff('trinketSlots') trinket slots over run.equipped, drag to
    equip, each trinket's modifiers listed as RESOLVED deltas ('+25% FURNACE
    RATE') rather than raw rows. Resolve them through model/mods.js#explain,
    which exists to answer 'why is my walk speed 71' and is what the debug
    overlay already reads.
  - stat readout: eff() values for the stats a player can affect, so they can
    see what their trinkets and boons actually did.
  - a unique drop needs its name, its god of origin and its flavour line in the
    tooltip — reserve the space. A relic gets a rarity frame colour on its slot;
    view/hud.js already frames a relic in the `ichor` divine-gold, so extend
    that rather than inventing a second 'this is special' colour.

TAB 2 — CRAFTING
  - category tab row across the top (raw / refined / tools / placeables /
    divine), driven off substance and form TAGS, not a hand-written list.
  - dense recipe grid below. Craftable now: full colour (view/hud.js already
    uses model/run.js#canCraft for exactly this, in the same green the reticle
    uses for a legal placement). Missing inputs: dimmed, with the missing
    ingredient shown small. UNKNOWN RECIPE: SILHOUETTE ONLY — you are a thief,
    recipes are stolen, and an unlearned recipe must read as a locked outline.
    This has no equivalent in any reference image and it is important: it
    advertises what you have not yet stolen. It needs a `known` set on run
    (RUN_SCHEMA, reset by newRun) — that is a model addition; get it approved
    before writing it, since model is not this task's layer by default.
  - recipe tooltip: inputs with have/need counts, output, secs, and the station
    it needs. A hand-craft matches the machine's rate BY CONSTRUCTION here —
    data/recipes.js#HAND_RECIPES filters the SAME frozen rows a machine names,
    so there is one object and it cannot drift — so say it plainly:
    'BY HAND: 4.0 s — same as furnace'. That is how a player learns a recipe
    before they can afford the machine that runs it.
  - click queues one, shift-click queues five, ctrl-click queues max
    affordable.
  - craft queue strip with per-item progress; cancelling refunds inputs.
    NOTE THE REAL CONSTRAINT: rules/crafting.js is a SCALAR on run
    (craftProgress / craftRecipe) because a player has one pair of hands, and
    it deliberately forgets the bar when the key is released. A QUEUE is a
    genuine mechanic change, not a UI feature. Write the design question to
    docs/FINDINGS.md and implement the queue as UI state in src/shell/ui.js
    that re-asserts the craft intent while the queue is non-empty — the
    one-pair-of-hands rule stays intact and the queue is a convenience over it.
    Do not restructure rules/crafting.js.
  - search field filtering the grid.

TAB 3 — LOGISTICS (a stub, honestly labelled)
  One list of placed machines from model/machines.js: state (running / stalled /
  unfuelled / blocked) and depth. Genuinely useful in a vertical factory and
  cheap now that machines are real. Anything left unwired goes in
  docs/FINDINGS.md.

QUICKBAR: the bottom bar currently shows key hints (view/hud.js#hint). Convert
it to a two-row numbered quickbar in the reference's style, with the key hints
collapsing to one toggleable line. Assigning an item to a slot is
drag-and-drop. Quickbar assignments are UI state (src/shell/ui.js), not model
state — nothing about which slot an item sits in changes the world.

FILE OWNERSHIP: src/view/ui/**, src/view/hud.js, src/shell/ui.js,
src/shell/input.js + src/shell/main.js (dispatch only), src/core/palette.js +
src/data/palette.js (named entries only), docs/FINDINGS.md.
Read gameplay state; do not modify it except by dispatching an existing rules
action through shell. If you need a new model field (the `known` recipe set is
the one known case), stop and get it approved rather than adding it quietly.
```

**Acceptance:** open the panel, see `BURDEN 31.5 / 40 T`; shift-click peg rungs
and watch the queue drain into four rungs; drag a trinket into a slot and watch
the furnace rate change in the stat readout; look at the crafting grid and see
at least one recipe as a locked silhouette — all without touching a debug key,
and all at the phone viewport as well as the desktop one.

---

## Phase 6 — Harness (1 × `harness`, parallel with Phase 5)

```
Read CLAUDE.md §"Verification, and what each layer can actually tell you", and
tools/check.mjs, tools/layers.mjs, tests/visual.spec.js and
playwright.config.js in full.

EXTEND WHAT EXISTS. Do not create a scripts/ or test/ tree — tools/ and tests/
are the real ones, tools/layers.mjs and tools/content.mjs already export
callable functions that tools/check.mjs composes as sections, and
tests/visual.spec.js already contains ZERO waitForTimeout calls and already
drives a synchronous tick API. Four tiers; tiers 1 and 2 must not launch a
browser.

TIER 1 — CONTENT LINT (node, no browser, <1 s). tools/content.mjs from Phase 1,
extended:
  - every substance/form pair referenced by any drop table, boon, trinket,
    miracle, grant, machine cost or recipe exists and is holdable
  - every placeable is REACHABLE: mined pair -> recipes -> the exact cost bill
  - every tunable key named by any modifier row resolves, scope included
  - no recipe nets mass from nothing unless tagged 'transmute'
  - depth gates are monotonic: nothing requires an item gated deeper than it
  - tile.tier is monotonic against tile.hard
  - conflictsWith is symmetric where it should be, and never self-referential
  Wire it to a pre-commit hook. This tier is where content bugs die.

TIER 2 — HEADLESS SIM (node, no canvas). tools/check.mjs, extended. FIRST, FIX
A KNOWN DEFECT that CLAUDE.md already records: check.mjs re-implements the frame
loop by calling sched.stepAll at a fixed 1/60 instead of calling the real
shell/main.js#step, which is why three known framerate-dependent bugs pass
green. Call the real step(). Report every new failure that surfaces, and for
each one say whether it is the game or the harness — CLAUDE.md records that a
previous rewrite of this file produced ten failures and ALL TEN were the
harness. Before believing a new assertion, check the shape of what you are
asserting against: TUNE maps an id to a ROW not a number, a trinket key is
dotted, NAMED_UNITS is an array, and a recipe with `from:` draws named units
from a source rather than substance-form selectors.
  New assertions:
  - DETERMINISM: same seed + same scripted intents => identical state hash
    after 10,000 substeps. Run it twice in one process and once fresh. A hash
    over player position, inventory, item count, machine buffers, mods rows and
    b.seen/b.light — not just the five fields the current probe uses.
  - newRun() RESETS EVERYTHING (invariant 8): snapshot every exported model
    object's keys before and after a run's worth of play plus newRun(), and fail
    on any field that survived. This is the cheapest possible guard on the
    determinism invariant and nothing checks it today.
  - CONSERVATION: over a 10,000-substep random-intent fuzz, (mined + crafted
    outputs) - (consumed + shipped) must equal inventory + ground items +
    machine buffers exactly. Print the substep where drift first appeared.
  - HAND EQUALS MACHINE: for every recipe with both, assert `in`, `out` and
    `secs` are the same OBJECT (they are today, because HAND_RECIPES filters
    the same frozen rows). This is the most interesting decision in
    docs/DESIGN.md and the easiest to lose to a casual balance tweak.
  - BREAK-EVEN DEPTH: compute lift fuel cost k x depth against each tier's
    compression ratio from docs/SPEC.md §8 and assert raw ore goes net-negative
    near depth 30. When someone retunes a ratio, this test tells them what they
    did to the game's central pressure.
  - BURDEN: no code path leaves the player above the hard cap, and a climb
    intent at or over the cap produces no upward movement. Also assert walking
    speed and fall speed are IDENTICAL at 0% and 150% burden — the invariant is
    that only ascent is taxed.
  - LIGHT: propagation is deterministic and identical across two runs of one
    seed; a fully enclosed unlit chamber has light 0 at every tile; a lit tile
    behind two tiles of rock is dark. And light recomputation is not per frame:
    count recomputes across 600 substeps with no tile change and assert it is
    bounded.
  - RENDER PURITY stays: two draws, zero epoch bumps, zero rand() consumed.
    The existing probes are good; keep them and extend them over the new
    view/ui/ tree.

TIER 3 — PLAYWRIGHT, STATE-ASSERTED. tests/ — extend, do not replace.
  __mf already has newRun/step/frames/hold/draw/mouseAt/revealAll and read
  handles. ADD: intent(name, args) for the new UI intents, ui() returning the
  Phase 5a projection, and give(sub, form, n) marked TEST ONLY and inert
  outside ?test=1. Keep every existing test passing.
  Drive input through the keyboard or through the model, NEVER through
  hardcoded pixel coordinates — a test clicking (400, 300) fails on the phone
  project, whose base buffer is 200x422. Use __mf.hits / __mf.ui() to find a
  rect.
  Flows to cover:
   - cold start -> mine 12 copper ore -> craft nothing -> place a furnace ->
     it smelts
   - craft peg rungs -> place -> climb down -> place a brazier -> the strata
     become visible where they were not
   - overload past 40 T -> climb intent refused -> drop -> climb succeeds
   - open the GUI -> shift-click a recipe -> the queue shows 5 -> tick ->
     the pockets hold 5
   - grant a boon in debug -> the top-right timer appears -> tick past the
     duration -> the modifier is gone and eff() returns the base
   - NO-SPAWN GUARD: with flags.showDebug off, assert F, L, T and B produce no
     entity and no item. This test is the enforcement mechanism for Phase 3's
     and Phase 4's whole point.

TIER 4 — VISUAL SNAPSHOTS. tests/visual.spec.js, extended. Fixed seed, fixed
substep count. New framings: an unlit shaft, the same shaft lit by a brazier,
the Character tab, the Crafting tab (including a locked silhouette), and the
boon stack with 3 active. maxDiffPixels stays 0 — the renderer is deterministic
by construction and any diff is either a regression or an intended change. If a
test asserts a feature is VISIBLE, prove the pixels differ with it off:
CLAUDE.md records two tests that set flags.grid when the real name is
flags.showGrid, baselined a scene with the overlays off, and passed while
testing nothing.

FILE OWNERSHIP: tools/**, tests/**, package.json (scripts only),
playwright.config.js, plus the MINIMUM new hooks in src/shell/main.js's test
hook (name them in docs/FINDINGS.md if they turn out to be more than trivial).
Do NOT change gameplay to make a test pass; if a new assertion fails, report it
and say whether it is the game or the harness.
```

**Acceptance:** `npm run check:content` and `npm run check` are green and
tier 2 now calls the real `step()`; deliberately break one invariant per new
assertion (over-fill the pockets, leak mass in a recipe, put a `rand()` in a
draw path, leave a field unreset in `newRun()`) and confirm each one fails the
specific assertion written for it. An assertion never seen to fail has not been
tested.

---

## Sequencing summary

**All phases in this table are DONE.**

| phase | agents | parallel? | gate to proceed |
|---|---|---|---|
| 0 census | 1 `cartographer` | — | every input key traced; no "etc." |
| 1 registry extension | 1 `systems` | no | `check` + `check:content` green, nothing renders differently |
| 2 verbs | 3 `systems` | only if files are truly disjoint; serialise otherwise | climb / light / mine loop playable with no debug key |
| 3 buildables | 1 `systems` | no | no spawn path outside the debug gate |
| 4 modifiers | 1 `systems` | no (rename as its own commit first) | boon timers expire cleanly back to base; `DESIGN.md` current |
| 5 GUI | 1 + 1 `ui` | 5a then 5b | burden bar and craft queue functional at both viewports |
| 6 harness | 1 `harness` | yes, alongside 5 | tiers 1+2 green; each new assertion seen to fail |

Reviewer after every phase, reading the phase spec plus `git diff`, output to
`docs/REVIEW-phase-N.md`. One commit per agent. Never two agents at once
against the same file.

---

## Appendix — where the original plan's paths went

Kept for anyone reading the earlier draft alongside this one.

| original plan | this repo |
|---|---|
| `data/items.js` | **does not exist and must not.** `data/substances.js` × `data/forms.js` |
| `data/entities.js` | `data/machines.js` (already exists, frozen, with `variantOf`) |
| `data/registry.js` | the derived indices at the bottom of each `data/` table (`SUB`/`S`/`byTag`, `FORM`/`F`, `MACH`/`M`, `TUNE`) |
| `player/**`, `physics/**` | `model/player.js` (state) + `rules/player.js` (movement) |
| `inventory/**` | `run.inv` in `model/run.js`; `model/items.js` for the ground |
| `entities/**` | `data/machines.js` rows + `model/machines.js` + `rules/machines.js` |
| `build/**` | `rules/placement.js` |
| `world/lighting.js` | `b.light` in `model/world.js` + `rules/light.js` |
| `world/tiles.js` (hardness) | `substances.js#tile.hard` — **already seconds-to-break** |
| `stats/**`, `modifiers/**` | `data/tuning.js` + `model/mods.js#eff()` — **already exists** |
| `ui/**`, `hud/**` | `view/ui/**` (drawing) + `shell/ui.js` (mutable UI state) |
| `input/intents.js` | `shell/input.js#cmd` / `#wants` / `#flags` |
| `debug/`, `give()` | the `flags.showDebug` gate + `__mf` under `?test=1` |
| `scripts/lint-content.js` | `tools/content.mjs`, composed into `tools/check.mjs` |
| `test/**` | `tests/visual.spec.js` + `tools/check.mjs` |
| `window.__ui` | `globalThis.__mf.ui` — one handle, not two |
| `npm run lint:content` | `npm run check:content`, also a section of `npm run check` |
| `resolve(stat)` | `eff(id, scope)` |
| "boon = permanent" | **four** tiers: Boon (timed) / Trinket (equipped) / Miracle (one-shot) / Machine grant. `CLAUDE.md` D1 |

---

## Wave 2 — surface relief, painting, overview, and the Heavens

Phases 0–6 above are executed and reviewed (`docs/REVIEW-phase-*.md`,
`docs/AUDIT.md`). This wave continues the same plan at Phase 6.5. Same shape:
ordered phases, paste-ready subagent prompts, explicit file ownership,
acceptance criteria you can physically check. Process rules in section 1 and the
subagent roster apply unchanged.

Four asks, in dependency order: **worldgen relief and hidden hollows** →
**painting fidelity** → **overview mode** → **the Heavens as loop closure**.
The harness phase runs alongside all of them.

### The five further decisions, already made

D5 (cargo ascends, the player is not walled out — gravity is the gate), D6 (the
First Trial does not move; the Heavens are the cycle-2+ target), D7
(non-interactive scenery is paint, never a substance row — extend `look:{}` and
`view/treatments.js#TREAT`, do not add a second pipeline), D8 (HUD panels are
anchored over measured text; the masked-id predicate is written once and shared)
and D9 (the depth datum does not move, and the Heavens band already exists as
`astral`) are resolved in **`CLAUDE.md` §"Resolved decisions"**. Read that, do
not re-derive it, and do not soften it.

### Ground truth this wave was corrected against

The prompts below were first drafted without repo access. Every file path,
export and `docs/SPEC.md` citation has since been checked against the code. The
corrections that changed a phase's shape, rather than just a section number:

| claim as drafted | ground truth |
|---|---|
| worldgen lives in `data/world.js` | `data/world.js` holds only the declarative `BANDS` rows; the passes are `rules/generate.js#KINDS` + `#generate(b)`. **Phase 7 must own `rules/generate.js`.** |
| the world is one array; the Heavens need rows reserved at its top | three per-band records with absolute `origin`s (`model/world.js#bands`), allocated at boot. The `astral` band already exists; nothing declares it as a destination any more (see docs/PLAN-gears-and-winches.md). Nothing to reindex. |
| `view/` has no per-material paint data | it does: `look:{ base, hi, lo, treatments:[{fn,…}] }` on every substance row, consumed generically by `view/paint.js` through `view/treatments.js#TREAT`. |
| the tree canopy was lost | `TREAT.canopy` exists, and its own comment records that blocky leaf-blocks were chosen **deliberately** over the mockup's stochastic `oliveTree()` (preserved at `reference/mockup/src/world/strata.js`) because the latter reads as fuzzy at this viewport. |
| overview is bound to `C`, in `view/overview.js` | it is `O` (`shell/input.js:181`, `flags.showMap`), drawn by `view/scene.js#drawMap`. There is no `view/overview.js` yet. |
| the FAVOUR panel already masks Hades | no FAVOUR, TRIBUTE, SUSPICION or masking exists anywhere in `src/`. The predicate is written by the ruler phase and reused by the cycle phase. |
| `test/**` | `tests/**`. There is no `test/` directory, and Phase 6 above already forbids creating one. |
| `docs/ARCHITECTURE.md` | `ARCHITECTURE.md`, at the repo root. |
| astral is merely "inset" at `x:128`, `tw:96` | **corrected twice now.** First pass misread `origin.x` as a tile column (it is world PIXELS) and concluded astral (`x:[128,896)` px) and surface (`x:[0,1024)` px) don't overlap at all — false. Phase 6.5 recon executed `data/world.js` directly: astral's px range is a proper subset of surface's, and the two bands are exactly y-contiguous with no gap. In surface's own tile coordinates that's `tx ∈ [16,112)` — **96 of surface's 128 columns already have astral directly above them today.** Only the two 16-column edge strips (`tx 0-15` and `tx 112-127`) don't. Widening astral to full width is still worth doing (it closes a real 32-column gap), but Phase 10 must not reason from "no column connects" — most already do. See Phase 10 Step 1. |

Two citations checked and **kept as drafted**, because they are right:
`docs/SPEC.md` §12 really does state "no machine or substance name appears in
`src/view/`" (SPEC.md:319–320; §12 runs 252–325, §13 begins at 326), and §15
really does record two remaining substance rows.

---

## Phase 6.5 — Recon (1 × `cartographer`, read-only, ~30 min)

Every prompt below names files that have been checked once, from outside a
running phase. Confirm or correct them before anything runs, or four agents will
each guess differently.

```
Read docs/SPEC.md, ARCHITECTURE.md (repo root, not docs/), docs/AUDIT.md,
docs/DEVELOPER_GUIDE.md, CLAUDE.md.
Read only. Write only to docs/AUDIT-2.md.

Report, with file:line for everything:

1. VERTICAL LAYOUT. The world is THREE BANDS, not one array: confirm each
   band's th, tile, origin and floorTy from data/world.js#BANDS, and give the
   world's total row count and world-pixel span. State the exact row of the
   topsoil surface and of the spawn band's floorTy. Confirm that row indices
   are BAND-LOCAL and that the world-pixel conversion is
   model/world.js#worldY / #tileY. Confirm how many rows exist in the astral
   band above the surface and what is written there today.

2. WORLDGEN. Everything rules/generate.js does, as an ordered list of passes,
   and everything data/world.js declares that drives them. How the surface
   height is currently decided (is it a per-row fromTy constant plus the LIP
   carve?). Where the copper vein guaranteed below spawn is placed. Where the
   spawn shelf (SHELF), the stock pickaxe and the brand are planted — note
   that the last two are shell/boot.js, not worldgen. Which RNG stream each
   pass draws from.

3. BANDS. What a band IS in this codebase: the record shape, where the list
   lives, bandAt()'s signature (world PIXELS, not a band id), what lift.toBand
   holds today, and every reader of band identity. A band above the surface is
   already expressible and already exists (`astral`) — confirm that and say
   what, if anything, treats it as special.

4. PAINTING. Every function in view/paint.js, view/scene.js, view/treatments.js
   and core/pixels.js that puts pixels on a chunk canvas, and in what order.
   How a substance's colour is currently chosen given SPEC §12's rule that
   view/ may not name a substance — specifically, document the
   `look:{ base, hi, lo, treatments:[{fn,…}] }` indirection and the TREAT
   table, since THIS IS THE PAINT DATA and the next phases must extend it
   rather than invent a parallel one. Document how trees are drawn today
   (TREAT.canopy plus the skyExposedAt gate) and what the mockup's
   reference/mockup/src/world/strata.js#oliveTree did instead.

5. CHUNK BAKE. The exact bake entry point (view/paint.js#chunkCanvas /
   #paintChunk) and its cache and REPAINT_BUDGET. What happens to a drawing
   operation whose extent crosses a chunk boundary — is it clipped, or does
   the neighbouring chunk redraw it? Test it if the code does not say.

6. CAMERA & OVERVIEW. How the camera maps world to screen, and clampCam's
   band union. What the overview (`O`, flags.showMap, view/scene.js#drawMap)
   actually does — its scale calculation, its centring, whether it repaints
   tiles or reuses baked chunk canvases, and exactly why it renders as a small
   strip in a black field (see docs/reference/overview-current.png).

7. FOG & LIGHT READERS. Every place b.seen and b.light are read. Confirm
   whether any renderer can currently draw an unseen tile — including drawMap,
   which enforces fog BY OMISSION rather than with an opaque rect.

8. TRIBUTE STATE. Whether anything for cycles, tribute, favour, suspicion or
   the altar exists beyond HUD decoration. Grep honestly: the expectation is
   NOTHING, and docs/DESIGN.md's "the HUD shows a static cycle-4 tribute panel
   as decoration" is believed stale. What data/grants.js, data/boons.js and
   data/drops.js already expose that a cycle director would consume, including
   the drops.js row for tribute completion that nothing reads yet.

9. HEADROOM. Current substance count, form count, and exact remaining tile-id
   byte headroom, quoting data/forms.js's guard verbatim.

10. THE FIVE HAZARDS for this wave specifically: a non-flat surface, hollow
    carving, extending the look/TREAT indirection, content in the astral band,
    and an overview that scrolls. file:line and one line each.

Dense tables. No proposals. No code.
```

**Acceptance:** items 1, 3, 4 and 5 are unambiguous. If the answer to 5 is "I
didn't check", re-run — Phase 8 lives or dies on it. If item 4 does not name
`look:{}` and `TREAT`, re-run: the agent has not found the paint data and every
downstream phase will reinvent it.

---

## Phase 6.6 — Archaeology (1 × `cartographer`, read-only, runs with 6.5)

An older build looked substantially better than the live one. Save that
screenshot to `docs/reference/known-good.png`. **It is your own code, so
recover it from history rather than describing it to an agent and hoping.** A
`git show` is exact; a paraphrase of a screenshot is a guess.

What is visibly present in `known-good.png` and absent from the live build:

| feature | what it looked like |
|---|---|
| strata contact | soil→stone boundary interdigitated — blocky fingers of brown into beige and back, a dithered contact zone several tiles thick, not a ruled line |
| grass cap | a full bright-green tile band with a darker green underside edge, following the surface steps |
| soil / stone | rich brown and pale beige, both with dense fine speckle at different amounts |
| ore | saturated orange cruciform blobs, 3–5 tiles across, unmistakable against pale stone |
| hard rock | a dark grey irregular blob, distinct from both bands |
| tree | 1-tile trunk ~4 tall, canopy ~5×4 in two or three greens, ragged silhouette |
| relief | stepped surface with visible 1–2 tile ledges |
| pickaxe | an actual pickaxe sprite — angled head on a handle — planted upright, **with a soft glow marking it as a divine relic** |
| tutorial callout | a bordered centre-screen prompt, "TAKE THE PICKAXE" |

**One row of that table is already known not to be a loss.** The tree is a
deliberate change, not a casualty: `view/treatments.js#canopy`'s own comment
records choosing blocky leaf-blocks over the mockup's stochastic `oliveTree()`
because the latter "reads as fuzzy rather than as a tree at this project's
small viewport". The mockup original survives verbatim at
`reference/mockup/src/world/strata.js`. Extract it anyway — Phase 8 may want a
middle path — but classify it as a judgment call to revisit, not as a
regression to revert.

```
Read docs/SPEC.md §1 §6 §12, ARCHITECTURE.md, CLAUDE.md.
Read only. Write only to docs/ARCHAEOLOGY.md.
Study docs/reference/known-good.png against docs/reference/live-surface.png.

An earlier commit rendered the world markedly better than HEAD does. Find it
and report exactly what was lost — and, where it was changed on purpose, say
so instead of calling it a loss.

1. FIND THE COMMITS. Use history, not inference:
     git log --all --oneline
     git log --all -S'<name of each painting helper>' -- src/
     git log --all --follow -p -- src/view/scene.js src/view/paint.js
     git log --all --follow -p -- src/view/treatments.js src/rules/generate.js
     git log --all -S'glow' -- src/
   Identify: the last commit whose terrain painting matches known-good.png,
   the last whose worldgen produced that strata contact and those ore blobs,
   and the commit that planted a pickaxe sprite with a glow.
   Check stashes, branches, and reference/mockup/ — SPEC §6 says core/'s
   painting helpers were carried over unchanged, so the original may survive
   in reference/mockup/src/world/strata.js even where the ported version
   diverged.

2. EXTRACT, VERBATIM. For each, paste the actual old source into
   docs/ARCHAEOLOGY.md under a heading naming its commit sha and path:
     - the surface/strata painting function
     - the soil->stone contact generation (worldgen, tile-level — those brown
       fingers are material data, not paint)
     - the ore blob shape generation
     - the tree draw (both the live TREAT.canopy and the mockup's oliveTree)
     - the pickaxe sprite and its glow() call site
     - the tutorial callout widget
   Verbatim, not summarised. This file is the input the next agents build
   from; a paraphrase is worthless to them.

3. DIAGNOSE THE LOSS. For each, say what replaced it and in which commit, and
   classify: deliberate simplification, casualty of the chunk-bake refactor,
   or casualty of SPEC §12's "no substance name in src/view/" rule.
   The third is the hypothesis to test, but test it PROPERLY: the per-material
   paint data that would have replaced inline names DOES exist today, as
   `look:{ base, hi, lo, treatments:[…] }` on every substance row. So the
   question is not "was the data never added" but "is the data thinner than the
   inline colours it replaced" — e.g. one `base` where the old painter mixed
   three tones, or a missing speckle amount. Quantify that gap per material,
   because it is exactly what Phase 8 has to fill.

4. WHAT CANNOT SIMPLY BE REVERTED. For each feature, whether the old code
   still typechecks against today's substance x form model, the chunk bake,
   and the light/fog passes — or whether it must be re-expressed. Be specific.
   Note in particular that a worldgen extract must be re-expressed as a
   rules/generate.js#KINDS entry driven by a data/world.js strata row.

No proposals, no code changes. Verbatim extracts and a loss ledger.
```

**Acceptance:** `docs/ARCHAEOLOGY.md` contains real old source with real shas.
If it contains descriptions of screenshots, re-run it — the whole point is to
stop guessing. If it reports "the paint data was never added", re-run it: the
data exists and the agent has not read `data/substances.js`.

---

## Phase 7 — Surface relief and hidden hollows (1 × `systems`, serial)

```
Read docs/AUDIT-2.md, docs/SPEC.md §1 §3 §5 §9 §11 §12, CLAUDE.md.
Owner: worldgen only. You are not touching how anything is painted.

WHERE WORLDGEN ACTUALLY IS. src/rules/generate.js holds the passes: a KINDS
table (`layer`, `blobs`, `vein`, `trees`), the SHELF and LIP consts, blob(),
onShelf(), and the single entry point generate(b), which applies a band's
strata rows in order into a freshly allocated all-AIR array.
src/data/world.js holds only the declarative BANDS rows that drive it, and
data/world.js#STRATA_KINDS is asserted against KINDS' own keys. A NEW PASS IS
A NEW KINDS ENTRY PLUS A NEW STRATA ROW — that pairing is the extension point,
and generate.js is inside this phase's ownership.

FIRST: read docs/ARCHAEOLOGY.md sections 2 and 4. An earlier commit may already
have generated the strata contact and ore blob shapes this phase wants, and
that file holds the verbatim source. If it still fits today's model, PORT IT
rather than writing new generation — it is known-good and it is already tuned.
Write new code only where section 4 says the old code cannot be re-expressed,
and say in your commit message which features were ported and which were
rewritten.

GOAL. The surface becomes a landscape with hills, and the rock below contains
natural hollows that are invisible until excavated into.

--- CONSTRAINTS THAT ARE NOT NEGOTIABLE ---

C1. Band widths stay as declared: SPEC §1 fixes the world at 128 tiles and the
    surface and topsoil bands are tw:128 (astral is tw:96 and inset). Do not
    touch any tw.
C2. All randomness through the existing seeded RNG only (CLAUDE.md invariant
    7). Same seed must produce byte-identical material and damage arrays.
C3. No new substances. Headroom is 2 rows (SPEC §15) and none of them is
    being spent on scenery. If a pass wants a new material, it reuses an
    existing substance or becomes Phase 8's paint problem instead
    (CLAUDE.md D7).
C4. THE SPAWN SHELF IS SACRED. SPEC §5's beat sheet requires, at spawn:
      - a perfectly FLAT shelf, >= 9 tiles wide, centred on spawn. This
        already exists as SHELF = 6 half-tiles in rules/generate.js, and
        onShelf() already exempts the shelf from the LIP carve and from
        trees(). Extend that exemption to every new pass; do not re-derive it.
      - the lighter soil seam underfoot, the stock pickaxe, the brand (the
        last two are planted by shell/boot.js, which you do not own — but a
        relief pass that moves the ground out from under them breaks them, so
        assert their footing survives)
      - a copper vein guaranteed directly below, reachable in a 5-tile dig
        (the `vein` KIND with near:'spawn', dy:8)
      - a 5-tile tutorial shaft that per SPEC §3 cannot kill the player
    Carve relief everywhere EXCEPT here, then assert the shelf survived.
C5. THE FIRST TWO MINUTES CANNOT KILL. Within 24 tiles of spawn, no surface
    feature may produce a fall greater than 5 tiles (SPEC §3's safe fall).
C6. TRAVERSABILITY. The player's hop clears exactly 1 tile (SPEC §2). A
    surface with a 3-tile step is a wall, not a hill. Rule: adjacent columns
    differ by at most 1 tile by default; a step of 2 or 3 is permitted no
    more often than once every 12 columns, and never within 24 tiles of
    spawn. Anything larger is a deliberate cliff and needs a ladder or a dig
    as its answer — which is fine, and is the design's own thesis, but it
    must be intentional and it must be tested.

--- SURFACE HEIGHTMAP ---

h(tx), deterministic, evaluated once into a per-band array of heights (128 for
surface and topsoil). Sum of three octaves, hash-driven, no external noise
library:
  - period ~48 tiles, amplitude +-4  (the landform)
  - period ~16 tiles, amplitude +-2  (hills)
  - period ~5  tiles, amplitude +-1  (roughness)
Total relief budget +-6 tiles from the base topsoil row. That is 48 px at an
8 px tile: readable as terrain at the game's zoom without turning the surface
into a mountain range that hides the factory. Clamp, then run a pass that
enforces C6's step rule, then stamp the flat shelf from C4 over the top of it,
then blend 3 tiles either side of the shelf so it does not read as a plateau.

Strata follow the surface: every layer boundary below topsoil offsets by
h(tx) rather than being a flat horizontal line, so a hillside exposes the
same banding a shaft does. Deep boundaries flatten out (lerp the offset toward
zero with depth) so the adamant band (data/world.js: fromTy:220) does not
inherit surface wobble.

NOTE THE EXISTING LIP TRAP. rules/generate.js#layer already carves a ragged
one-row lip on a layer's top row, and `lip:false` exists on the surface band's
stone row specifically because the lip check "does not know 'top of my own
range' from 'top of the world'" and was punching air pockets seven tiles
underground along the soil/stone seam. A heightmap that moves layer boundaries
must not resurrect that bug. Read that comment before you change layer().

--- THE CONTACT ZONE (the biggest single visual win, and it is worldgen) ---

Look at docs/reference/known-good.png. The soil->stone boundary is not a line:
it is a band 3-5 tiles thick where the two materials interdigitate in blocky
fingers, brown reaching down into beige and beige up into brown, thinning out
as it goes. That is TILE DATA, not paint — those are real material cells and
they dig differently. It is the reason that image reads as geology and the
live build reads as stacked layers.

Implement it as a per-column probability ramp: across the contact band, the
chance a cell is the upper material falls from 1 to 0 with depth through the
band, hash-driven per cell, with a small horizontal correlation term so the
result is fingers rather than TV static. Apply the same treatment to every
strata boundary, with band thickness per boundary — a soil/stone contact is
gradational and thick, a granite/adamant contact is sharp and thin. Thickness
is a key on the strata row, so content decides it, not the interpreter.

Consequence to keep: an interdigitated contact means a shaft through it hits
alternating hardness, so the dig slows and speeds unpredictably. That is a
free texture on the mining verb and should not be smoothed away.

--- ORE BODY SHAPE ---

known-good.png's ore is cruciform: a 3-5 tile plus/star cluster, saturated,
unmistakable. Not a circle, not a rectangle, not a single tile. Today
rules/generate.js#blob() draws a round cluster and every `blobs` row uses it.
Generate as a centre cell plus 4-8 orthogonal and diagonal arms of hash-varied
length 1-2, so every blob is the same species but no two are identical. Same
generator, different sizes and densities per ore tier, driven off the existing
`r:[min,max]` on each blobs row. Hollow-lining ore (below) uses the same shapes
hugging the void wall.

--- HIDDEN HOLLOWS ---

Air pockets carved into the rock after strata, before ore — i.e. a new KINDS
entry whose strata row is declared between the `layer` rows and the `blobs`
rows, since generate() applies rows in declaration order.

  density        rises with depth; none in the top 8 rows below topsoil
  size           3-12 tiles across, blobby, not rectangular
  shape          a short random walk with a radius; core/pixels.js#walk is a
                 DRAWING helper and is not it — write the tile-space walk here,
                 or use an ellipse union, which is also acceptable
  never          intersecting the spawn column, the tutorial shaft, or the
                 guaranteed vein (reuse onShelf() plus the vein's own
                 near:'spawn' resolution rather than recomputing spawn)
  ceiling rule   any hollow whose ceiling comes within 2 tiles of topsoil is
                 backfilled entirely. A hollow that breaches the surface is a
                 hole, and a hole is not a secret.
  floor rule     record each hollow's floor depth; a hollow deeper than 5
                 tiles internally will hurt someone who falls in, which is
                 correct and wanted, but must not occur within 24 tiles of
                 spawn (C5).

THE HIDDENNESS IS ALREADY BUILT. Do NOT add a `hidden` flag, a discovery
event, or a reveal trigger. A hollow is unseen because b.seen is false, and
dark once entered because rules/light.js says so, and SPEC §11 already bounds
rules/reveal.js's passB from flooding past its first ring without
lightAt() >= 1. Your job is to carve air and then VERIFY those three existing
systems make it a discovery. If a hollow adjacent to a lit shaft becomes
visible through solid rock, that is a reveal-leak bug — report it in
docs/FINDINGS.md, do not paper over it in worldgen.

--- MAKE DISCOVERY PAY ---

A fraction of hollows (suggest 1 in 4, a tunable) get their walls lined with
ore during the ore pass — the vein hugs the void. So a hollow is a shortcut
down AND a jackpot, and you found it by falling into the dark. That is three
of this game's systems paying off in one moment for the cost of one flag on a
carve record.

--- TUNABLES ---

Every number above goes in data/tuning.js#TUNABLES and is read through
model/mods.js#eff() if it is gameplay-facing, or is a named const in
rules/generate.js beside SHELF and LIP (or a key on a data/world.js strata
row) if it is purely generative. No literal appears twice. Remember that only
model/mods.js may import data/tuning.js — tools/layers.mjs enforces it.

FILE OWNERSHIP: src/rules/generate.js, src/data/world.js, src/data/tuning.js
(via model/mods.js, per the layer rule), docs/SPEC.md (add a new numbered
section documenting the locked worldgen numbers, same style as §9-§15).
Do NOT touch view/, other rules/ siblings, or model/tiles.js beyond calling
its existing write API.
```

**Acceptance:** walk 60 tiles either way from spawn and the ground rises and
falls without ever needing a ladder to continue; dig sideways at depth 40 and
eventually break into a black room you cannot see the far wall of; `npm run
check` and `npm run check:content` green; a fresh run's first two minutes still
play as §5's beat sheet.

---

## Phase 8 — Painting fidelity (1 × `ui`, serial after 7)

Reference the images by path. Save them first: the mockup to
`docs/reference/mockup-surface.png`, the live build to
`docs/reference/live-surface.png`. (`docs/reference/` does not exist yet;
`docs/art/` holds unrelated concept images and is not it.)

```
Read docs/AUDIT-2.md §4 §5, docs/SPEC.md §1 §6 §12, CLAUDE.md D7.
Study docs/reference/mockup-surface.png and docs/reference/known-good.png
against docs/reference/live-surface.png.

GOAL. Close the gap between those images. Two different references, two
different jobs:

  known-good.png is YOUR OWN OLDER BUILD. It is the baseline to RECOVER, and
  docs/ARCHAEOLOGY.md holds the verbatim old source for its tree draw, its
  speckle amounts, and its material colours. Port before you rewrite.

  mockup-surface.png is the target to EXCEED it toward — cloud scale, sky
  depth, parallax. It is NOT a target for its HUD overflow (CLAUDE.md D8).

Order of work: recover known-good first and confirm it visually, commit that,
then push toward the mockup. Do not conflate the two — if the recovery and the
new work land in one commit you will not be able to tell which broke what.

--- THE ARCHITECTURAL CONSTRAINT, AND THE DATA THAT ALREADY SATISFIES IT ---

SPEC §12 (SPEC.md:319-320): no substance or machine name may appear in
src/view/. So you may not write `if (sub === 'granite') fill('#5a5a5a')`.

THE INDIRECTION THAT SOLVES THAT ALREADY EXISTS, AND YOU ARE EXTENDING IT,
NOT REPLACING IT:

  data/substances.js   look:{ base:'graniteB', hi:'graniteA', lo:'graniteD',
                              treatments:[{ fn:'glint', col:'veinA', n:2 }] }
  view/treatments.js   TREAT = { glint, halo, banded, canopy, … }
  view/paint.js        look() / paintTile() read the row and dispatch by name
  data/palette.js      colour(name), and hasColour() for validation

A `fn` that is not a TREAT key fails the content check at build time. So:
  - ADD KEYS to look:{} (speckle amount, band-line colour, cliff-face tone,
    a global light direction's effect) and ADD FUNCTIONS to TREAT.
  - DO NOT add a parallel `paint:{}` block beside `look:{}`. Two tables
    describing one thing is the same failure a second stat pipeline beside
    model/mods.js would be. CLAUDE.md D7 says this explicitly.
  - Every colour is a NAMED palette entry (core/palette.js / data/palette.js).
    No inlined hex.
  - WATCH FOR A THIRD TABLE HIDING AS AN `if`: `view/paint.js#paintTile`
    already has two dispatch paths, not one — the generic `look.treatments`
    array through `treat()`/`TREAT[fn]` (glint, banded, halo), AND two
    top-level `look` keys, `canopy` and `grassCap`, checked BY NAME directly
    in `paintTile`, bypassing `treat()` entirely (`paint.js:174-180`). Any
    NEW generic per-substance switch you add belongs in the first path. If
    you extend canopy/grassCap themselves that's fine — they're existing
    exceptions — but a third hardcoded name check in `paintTile` is the same
    failure as a parallel `paint:{}` table wearing a different disguise.

If the live terrain reads flat, the cause is that look:{} carries ONE base
tone where the old painter mixed three, and no speckle amount at all — a
thinness in the data, not an absence of the mechanism. docs/ARCHAEOLOGY.md
§3 is asked to quantify that gap per material; that quantification is your
work list.

--- 1. TREES ---

Live build: a trunk of timber/log tiles with TREAT.canopy's blocky leaf-blocks
on the top tile, gated on model/tiles.js#skyExposedAt.
known-good.png: 1-tile trunk about 4 tall, canopy roughly 5x4 tiles in two or
three greens, ragged silhouette.

  - READ TREAT.canopy's OWN COMMENT FIRST. The blocky look was a deliberate
    choice over the mockup's stochastic oliveTree() (verbatim in
    reference/mockup/src/world/strata.js), on the grounds that the dot-cloud
    "reads as fuzzy rather than as a tree at this project's small viewport".
    DECIDED: that objection stands, and so does the decision not to just
    revert. Neither the flat blocky rectangle nor the mockup's stochastic
    dot-cloud is an acceptable outcome here — find a THIRD shape distinct
    from both: a ragged but SOLID silhouette (below), built from a small
    fixed union of blob shapes rather than per-pixel dot scatter, so it
    reads solid at this viewport without reading as a rectangle. Do not
    submit "the blocky version was correct after all" as a result.
  - Trunk stays timber/log TILES. Felling is unchanged (SPEC §5).
  - Canopy stays RENDER-ONLY DECORATION baked into the chunk canvas,
    deterministic from tile coordinates through hash2 (never rand — see
    treatments.js's own header and CLAUDE.md invariant 7). No tile cost, no
    collision, no tile-byte spend (SPEC §15 has 2 rows left and this is not
    what they are for).
  - Shape: 3-5 overlapping blobs, radius jittered +-1 px, union'd, then eroded
    at the edge so the silhouette is ragged rather than circular. These are
    OLIVE trees per SPEC §5 — sparse, silver-green, irregular, not the dense
    round canopy of a generic deciduous tree.
  - Three tones from the existing palette: underside shade, body, sun-side
    highlight.
  - Declare ONE global light direction as a const in core/ and use it in every
    painting function you touch, including strata and cliff faces. Nothing
    reads as amateur faster than a scene lit from two directions.

--- 2. STRATA AND GROUND ---

  - Per-substance colour from the extended look:{} data, darkened with depth by
    a single shared curve so the same granite reads deeper at row 260 than 180.
  - Speckle via the existing core/pixels.js#noiseFill, amount per substance —
    soil noisy, adamant nearly smooth.
  - A 1 px band line at each strata boundary, hash-jittered along its length
    so it is a geological contact rather than a ruled line.
  - GRASS CAP, not a fringe. known-good.png shows a FULL bright-green tile
    band with a darker green lower edge, stepping with the terrain.
    HEED THE RECORDED BUG: data/substances.js's soil row already carries a
    comment that its `hi` leans on paintTile's exposed-top-face pass, and that
    a generic "any air above" test painted GRASS ON CAVE CEILINGS. The gate is
    model/tiles.js#skyExposedAt — "a clear shot to the sky" — and it is the
    gate a grass cap must use. Read that comment before you widen anything.
  - Carry the same treatment onto the exposed vertical face where a cliff
    drops, so a hillside is not a stack of cut cubes. This is the detail that
    will make Phase 7's new heightmap read as landscape.

--- 3. SKY ---

The live sky is a two-stop gradient with small block clouds (view/scene.js's
sky pass, driven by each band's look:{ sky, tint, ambient }). The mockup has
large soft cumulus at several scales.
  - Gradient with more steps, quantised to the palette (integer pixels only,
    SPEC §6 — no smooth interpolation).
  - Three cloud layers at different parallax factors and sizes: large slow
    cumulus, mid, small fast. Cloud shapes are blob unions with a flat base
    and a lumpy top, two tones, deterministic per layer from position and the
    clock — NOT from rand().
  - Horizon haze band where sky meets the highest terrain.

--- 4. THE CHUNK SEAM PROBLEM — read AUDIT-2 §5 before writing anything ---

SPEC §1 flags this as the open visual question of the whole chunked design
("whether the look SURVIVES being cut into chunks is a visual question only a
human can answer"). A canopy, a cloud, or a fringe stroke whose extent crosses
a chunk boundary will be CLIPPED unless the neighbouring chunk also draws it.
For every decoration you add, view/paint.js#paintChunk must consider emitters
in a margin of neighbouring tiles wide enough to cover that decoration's
maximum extent, and clip to its own canvas. Declare each decoration's max
extent as a const next to it. If AUDIT-2 §5 says the existing bake has no
margin concept, ADDING ONE IS PART OF THIS TASK and is the first thing you do.
Mind view/paint.js#REPAINT_BUDGET while you are in there.

--- 5. NOT IN SCOPE ---

Do not restyle the HUD panels. Do not touch machine sprites. Do not add
dependencies, a build step, or non-integer pixels (SPEC §6). TREAT.halo is
already documented as the project's ONE non-integer effect; do not add a
second.

FILE OWNERSHIP: src/view/scene.js, src/view/paint.js, src/view/treatments.js,
src/core/ painting helpers, and look:{} keys extended on rows in
src/data/substances.js / src/data/forms.js (additive only — no behaviour keys
touched). Nothing in rules/ or model/.
```

**Acceptance:** side-by-side your new surface against
`docs/reference/mockup-surface.png` and the olive trees, grass cap, and cloud
scale are recognisably the same game. Then dig a shaft across a chunk boundary
under a tree and confirm the canopy is not sliced. `npm run check:content`
green — a `fn` or colour name that does not resolve fails there, not at depth
300.

---

## Phase 8a — Tutorial beat detection (1 × `systems`, small, after 7, before 8b)

Inserted phase, not in the original draft. Phase 8b's callout widget needs
something to wire itself to, and CLAUDE.md's "Conventions" section names "the
beat sheet in tutorial.js" and "resetTutorial()" as things to prefer editing —
but there is no `src/*/tutorial.js` in this tree and no `resetTutorial`
export. Those lines describe the mockup, not this build: **the beat sheet is
pure design copy in SPEC §5 today, with no code behind it.** A per-beat
predicate over model state is a decision with a per-frame lifetime, which
makes it `rules`, not `view` — a `ui` agent may not write it, which is why
this is its own phase rather than a step inside 8b.

```
Read docs/SPEC.md §5, CLAUDE.md (model/rules split, invariant 8), model/run.js
RUN_SCHEMA, shell/schedule.js.

GOAL. A single source of truth for "which beat of the first two minutes is
the player on", advanced automatically as the player does each thing, queried
by Phase 8b's callout and by nothing else yet.

SCOPE: BEATS 1-4 ONLY (walk / take the pickaxe / dig-and-mine-copper /
build-a-way-up). Beats 5 and 6 name the altar and the furnace gift, and
neither mechanic exists in code yet — that is Phase 10's cycle director, which
has not run when this phase does. Add beat indices 5 and 6 as reserved slots
that never fire here; Phase 10 Step 4 is the one that advances into them once
the altar exists. Do not build a stand-in altar to complete the set.

STORAGE: add `tutorialBeat` (int, starts 0) to model/run.js's RUN_SCHEMA. It
resets on newRun() like every other run field (invariant 8) — a beat sheet
that survives a restart is exactly the determinism bug invariant 8 exists to
name.

QUERY: model/tutorial.js, one export, `beat(run)`, returning `run.tutorialBeat`.
This is a query over a number model already owns, not a decision — keep it
that thin. Phase 8b reads only this.

DECISION: rules/tutorial.js, a rules SIBLING like every other rules module —
it may not import another rules module (mining, items, player, etc.), and its
one slot in src/shell/schedule.js needs the same "why here, why adjacent to
these two" comment every other insertion in that file already has. Each frame,
check whether the condition for `run.tutorialBeat + 1` now holds (chain
snapped / pickaxe in inventory / copper mined count / player has climbed back
to spawn height), and if so advance the counter by exactly one and push a
journal row (model/journal.js — never call play()/toast() directly, per the
existing notification convention). Advancing is monotonic and one-way: a beat
never regresses, and the check for beat N+1 only runs once beat N has fired.

FILE OWNERSHIP: src/model/run.js (the RUN_SCHEMA field only), src/model/tutorial.js
(new), src/rules/tutorial.js (new), src/shell/schedule.js (one insertion, with
its comment). Nothing in view/ — this phase produces no visible change by
itself; Phase 8b is what makes it visible.
```

**Acceptance:** in a fresh run, `run.tutorialBeat` advances from 0 to 4 across
the SPEC §5 beats in order, never skips, never regresses, and resets to 0 on a
new run. Beats 5 and 6 never fire. `npm run check` green with no new epoch
bumps or `rand()` calls introduced.

---

## Phase 8b — Relic presentation and the tutorial callout (1 × `ui`, small, after 8a)

Small phase, disproportionate payoff. The stock pickaxe is the first object in
the game and it currently reads as a stray pixel cluster; in `known-good.png`
it is a recognisable pickaxe with a soft glow saying *this is divine*.

`core/pixels.js#glow` exists (SPEC §6 lists it among the helpers carried over
unchanged) and is **not** an orphan: it is called at `view/scene.js:459` for
machine fire and wrapped as `TREAT.halo` in `view/treatments.js:43`. So the
mechanism, the treatment table entry, and the data indirection are all already
here. What is missing is a **predicate** that says which items are divine, and
the `look:{ treatments:[…] }` rows that hang a halo off it.

```
Read docs/ARCHAEOLOGY.md (the pickaxe sprite, its glow() call site, and the
tutorial callout widget), docs/SPEC.md §5 §6 §12 §14 §15, CLAUDE.md,
src/model/tutorial.js (Phase 8a's output).
Reference docs/reference/known-good.png.

--- 1. ITEM SPRITES ---

Dropped and planted items get real sprites instead of the generic blocks
view/paint.js#paintItem draws from look:{ item:[colA, colB] }. Start with the
stock pickaxe: an angled head on a handle, planted upright in the ground,
readable at 8-12 px. Port the old sprite from ARCHAEOLOGY.md if it survived.

Sprites live as data, not as code in view/ — SPEC §12 forbids view/ from
naming a substance. Extend look:{} the same way Phase 8 did: either a sprite
key on the substance/form row, or a named entry in a TREAT-style sprite table
dispatched by name from the row. One generic drawer, per-item data.

--- 2. THE RELIC GLOW, AS A RULE RATHER THAN A SPECIAL CASE ---

The glow is not "a nice touch on the pickaxe." It is the game's visual grammar
for divine provenance, and the game already has a category for that. SPEC §12's
tools (`pick`, `auger`) are relic substances carrying item.tool:{tier,power};
SPEC §14's trinkets (`bellows`) and miracles (`chasm`) are one-substance-per-
thing items, and SPEC §15 spells out the shared justification — "this refines
from nothing, it IS the element" — crossed with a shared form (`relic`,
`phial`).

So: any item whose form or substance carries the divine marker draws with a
halo — pickaxe, auger, bellows trinket, chasm phial, and every trinket
data/drops.js has yet to produce. One predicate, one call site, and every
future relic inherits it for free. Pick the marker off EXISTING data — the
`relic` / `phial` forms and their subTags — rather than adding a `glowing:true`
flag per row. NOTE that `rig`-form machine items (SPEC §15) are one substance
per thing too and are NOT divine; whatever predicate you write must exclude
them, or every held furnace glows.

Glow parameters (intensity, radius, pulse period) are data on the form so a
miracle can glow differently from a tool — TREAT.halo already takes { r, col,
a }, so this is extending its parameter row, not writing a new effect. A slow
pulse, not a flash, derived from clock.t plus a position hash and never from
rand() (CLAUDE.md invariant 7, and treatments.js's own header).

Interaction with Phase 2b's darkness: a glowing relic on the ground in an
unlit hollow should be VISIBLE — that is the pickup affordance and it is how
you spot a trinket you dropped. But it must NOT contribute to b.light in
rules/light.js, or a dropped pickaxe becomes a free torch and Phase 2b's
brand economy leaks. Glow is a view-layer treatment; light is a simulation
fact. view/scene.js already draws its machine glow AFTER drawFog for exactly
this reason (see the comment at scene.js:453) — follow that precedent, and
note the distinction in your commit message.

--- 3. THE TUTORIAL CALLOUT ---

CORRECTED BY PHASE 6.6 ARCHAEOLOGY: the widget itself is NOT gone. `view/hud.js`'s
bottom-centre bordered callout (`#hint`/`#panel`) is line-for-line unchanged
since the earliest tile-grid prototype. known-good.png's "TAKE THE PICKAXE"
prompt is described in the original plan draft as centre-screen, but every
historical version of this widget found in history sits at the bottom edge —
CHECK known-good.png DIRECTLY before assuming which is right; the discrepancy
may be the plan's description, not the code. What is actually gone is the
CONTENT: the SPEC §5 beat sheet (`sim/tutorial.js` in the old prototype) was
deleted with no successor, which is exactly why Phase 8a exists.

So: reuse the EXISTING callout widget rather than rebuilding one (adjust it
only if known-good.png genuinely shows a different position/style, and say so
if you do). On top of Phase 5a's widget layer if it needs rework
(src/view/ui/panel.js and friends — reuse the panel frame and the 5x7 font,
do not draw a new box from scratch): bordered box, bitmap font, anchored
low-centre above the key-hint bar, fades in and out, queued so two beats never
overlap. Positioned by measured text, per CLAUDE.md D8.

Wire it to model/tutorial.js#beat (Phase 8a's read-only query — see below),
which tells you the CURRENT beat index and nothing else. Each beat is
dismissed by the player DOING the thing, which Phase 8a's own detector
already resolved; this phase only renders whichever line the index selects.
The callout strings are content in data/, not literals in view/ — a future
locale or a rewrite should not require touching the renderer.

Do not add a callout for anything outside §5's beat sheet. Six lines in the
first two minutes is guidance; a callout for every mechanic is a manual.

BEATS 5 AND 6 ("the gods ask" / "gods give machines") NAME THE ALTAR AND THE
FURNACE GIFT, AND NEITHER EXISTS YET — that mechanic is Phase 10's cycle
director, which lands after this phase. Ship this phase wired to beats 1-4
only (walk, take the pickaxe, dig-and-mine, build a way back up); leave beats
5-6 as data rows with no trigger yet, and say so explicitly in your commit.
Phase 10 Step 4 is responsible for firing them once the altar exists — do not
stub a fake altar here to complete the set.

FILE OWNERSHIP: src/view/ sprite and halo drawing, src/view/ui/ (a callout
widget), sprite and glow parameter data appended to src/data/substances.js and
src/data/forms.js, callout strings in a src/data/ table. Nothing in
src/rules/light.js — see the interaction note above. Nothing in
src/model/tutorial.js or src/rules/tutorial.js — Phase 8a owns those; this
phase only reads model/tutorial.js#beat.
```

**Acceptance:** a fresh run opens on a pickaxe that looks like a pickaxe and
pulses faintly, with "TAKE THE PICKAXE" under it. Drop it down an unlit shaft
and you can still find it, while `b.light` around it stays at zero. No held
machine `rig` glows. Beats 1-4 fire and dismiss correctly in sequence; beats
5-6 exist as unfired data rows.

---

## Phase 9 — Overview mode (1 × `ui`, serial after 8b)

`docs/reference/overview-current.png` shows the current state: a small strip in
a black field. Save it to that path.

```
Read docs/AUDIT-2.md §6 §7, docs/SPEC.md §1 §6 §12, CLAUDE.md D8 D9.
Reference docs/reference/overview-current.png (current) and
docs/reference/mockup-surface.png (the DEPTH gauge on its right edge).

WHERE IT IS TODAY. The overview is bound to `O`, not C: shell/input.js:181
toggles flags.showMap, shell/main.js#step no-ops while it is true, and
view/scene.js#render swaps in view/scene.js#drawMap for the whole draw.
There is no view/overview.js — creating one by extracting drawMap is fine and
probably right, but say so in your commit rather than implying it existed.

WHY IT IS A STRIP, ALREADY DIAGNOSED IN THE CODE: drawMap derives
scale = min(1/minTile, W/worldW, H/worldH) over the union of all three bands.
The world is 1024 px wide and 3328 px tall, so H/worldH always wins and the
whole map collapses to fit the viewport HEIGHT. Confirm against AUDIT-2 §6 and
fix that before adding anything.

--- 1. FIX THE SCALE AND FRAMING FIRST ---

  - default scale fits the world's WIDTH to the viewport width. Derive the
    width from the band union the way drawMap already does — do not hardcode
    128 tiles. At the time this phase runs, astral is still tw:96 at
    origin.x:128px (x:[128,896) of surface's x:[0,1024), i.e. mostly but not
    fully overlapping — Phase 10 widens it to tw:128/origin.x:0 later);
    deriving from the union means this code needs no change when that
    happens.
  - the world is far taller than it is wide, so the vertical axis scrolls
  - +/- or wheel-with-modifier steps through discrete integer zoom levels only
    (SPEC §6: integer pixels, nearest-neighbour — no fractional scale, ever)
  - drawing by downscaling the already-baked chunk canvases instead of
    repainting tiles is the stated goal, BUT view/paint.js's cache only holds
    chunks that have actually been painted, so a never-visited chunk has no
    canvas to downscale. Either fall back to the current per-tile path for
    unbaked chunks or state plainly why that is acceptable. Do not silently
    lose terrain the player has seen.

--- 2. VERTICAL SCROLL ---

  - wheel and click-drag, clamped to world bounds with no overscroll. The
    clamp reads the same band union shell/main.js#clampCam does.
  - a FOLLOW PLAYER toggle, on by default, that any manual scroll switches off
  - clicking the band ruler jumps to that band
  - the player's position always drawn, even off-screen, as an edge indicator
  - scroll and drag state is UI state, so it lives in src/shell/ui.js and
    arrives through frameCtx (CLAUDE.md D2). view may not import shell.

--- 3. THE BAND RULER ---

One widget, TWO CONTEXTS: the right edge of overview mode, and the right edge
of the normal HUD (D8's layout). Build it once, in one file, parameterised by
height. Per the mockup:
  - vertical bar, one coloured segment per band, roman numerals
  - band name beside each segment, from the band record's own `name`
    ('THE MINOR HEAVENS', 'THE SUN'S FLOOR', 'THE TOPSOIL') — view/ may read a
    BAND name, which is not a substance or machine name
  - a band the player has never entered shows its name MASKED as `????????`.
    NOTHING IN src/ MASKS ANYTHING TODAY — there is no FAVOUR panel to borrow
    from. YOU write this predicate, in one place, and Phase 10's FAVOUR panel
    reuses it. State where you put it so Phase 10 can find it (CLAUDE.md D8).
  - current player depth as a sliding marker
  - footer: current depth in metres and current band name
  - THE HEAVENS occupy the segment above the surface, and that band already
    exists (`astral`). Per D9, 0 M remains the spawn floor and the astral band
    reads as negative / ABOVE. Do not move the datum — SPEC §12 anchors
    minDepth:200 and the HUD gauge to the same floorTy specifically so they
    can never disagree, and view/hud.js:324 already computes it as
    worldY(ref, ref.cfg.floorTy ?? 0).
  - mind D8: the depth readout already owns top-right with the boon stack
    under it. The ruler is the right EDGE, vertical. Do not collide with them.

--- 4. METADATA LAYERS (each individually toggleable) ---

  LIFT CHAIN     the single most useful thing in this game. Draw every
                 SEGMENT, its two hubs, its angle, which bands it spans, its
                 carrier's position, and — highlighted — WHERE THE CHAIN
                 BREAKS. A vertical factory's whole failure mode is a gap
                 between segments, and it is currently invisible. A CHAIN IS
                 DERIVED, NEVER STORED (CLAUDE.md D10), so the query is
                 model/segments.js#chains() and #breaks() -- a model query you
                 MAY read; there is no rules/lift.js and nothing in view may
                 import rules. Draw an UNPOWERED segment differently from a
                 driven one: an unpowered chain is not broken, it is merely
                 nobody's turn to crank, and those are different failures.
  MACHINES       one glyph each, coloured by state: running / stalled /
                 unfuelled / blocked. This data already exists behind the
                 LOGISTICS tab; read the same query, do not write a second one.
  PILES          item piles with counts above a threshold.
  ORE            seen ore only (see the invariant below).
  LIGHT          dark-zone shading from b.light, so you can see which shafts
                 are unlit.
  BANDS          per-band summary rows on hover: depth range, machine count,
                 stalled count, ore seen, dark fraction.
  HOVER          a machine tooltip with its buffer contents and fuel charges.
                 view/ui/tooltip.js already exists; use it.

--- 5. THE INVARIANT ---

OVERVIEW MAY NEVER DRAW AN UNSEEN TILE. It is a map assembled from memory, not
an X-ray. drawMap already honours this, by omission rather than with an opaque
rect (see the comment at view/scene.js:120-130) — every layer you add must
filter on seenAt() the same way. Phase 7 spent real effort making hollows
discoveries; an overview that shows them all is a cheat menu. Phase 11 tests
this separately from the scene pass.

FILE OWNERSHIP: src/view/overview.js (new, extracted from
view/scene.js#drawMap), src/view/ui/ruler.js (new, the shared widget),
src/view/scene.js where drawMap is removed, src/view/hud.js only where the
ruler is mounted, src/shell/ui.js for scroll/zoom/layer-toggle state, and
glyph/colour names appended to data/ rows. No rules/, no model/, no data/
behaviour keys. view/ may not name a substance or machine (SPEC §12) — state
glyphs and colours come from data, same pattern as Phase 8's look:{} keys.
```

**Acceptance:** open overview with four hubs linked into three segments and a
gap where a fourth should be, and the gap is the first thing you see. An
unpowered but complete chain reads as complete, not as broken. Scroll from the astral
band to adamant without the view ever leaving the world bounds. Confirm an
undiscovered hollow is absent from the map.

---

## Phase 10 — The Heavens, and closing the loop (1 × `systems`, serial, plan-mode first)

The largest phase in this wave and the only one that adds a game rather than a
view. Have the agent write a plan and stop.

```
Read docs/AUDIT-2.md §1 §3 §8, docs/SPEC.md §4 §5 §8 §12 §13 §14 §15,
docs/DESIGN.md (especially "Run structure" and "The Hades act"), CLAUDE.md
D1-D9.

GOAL. The Heavens become a real destination, cargo can reach them, and
delivering cargo there drives the cycle loop. This is the game's win condition
acquiring a location.

--- STEP 1: THE WORLD ALREADY HAS ROOM ---

This is answered before you start, and AUDIT-2 §1 §3 should confirm it:

  - data/world.js#BANDS[0] is `astral`, name 'THE MINOR HEAVENS', tw:96,
    th:40, tile:8, origin:{x:128,y:0}, floorTy:30, fields:[], with a single
    stone layer at rows 30-40 and look:{ sky:'skyHi', tint:'marbleA',
    ambient:1.0 }.
  - the WINCH STAGE and its lift:{ span, toBand } block are GONE, replaced by
    hub/crank/gear machines and runtime segments -- see
    docs/PLAN-gears-and-winches.md and CLAUDE.md invariant 4 as reworded. A
    segment reaching astral is no longer a machine row DECLARING a destination
    band; it is two hubs within reach with a clear path between them, and the
    band a carrier delivers into is whichever band bandAt() puts it in on
    arrival. There is nothing left to declare and nothing to keep in sync.
  - bands are separate records with absolute origins, each allocated its own
    typed arrays by world.write.allocate(cfg) in shell/boot.js. There is no
    single array, nothing to grow, and nothing to reindex.

So the band EXISTS, and — CORRECTED after Phase 6.5 recon executed
`data/world.js` directly, since `origin.x` is world PIXELS not a tile column
— it is mostly NOT disjoint from the surface band. Real px ranges:
astral `x:[128,896)`, surface `x:[0,1024)`, exactly y-contiguous (astral's
floor at y:320 meets surface's origin at y:320, no gap). In surface's tile
coordinates that overlap is `tx ∈ [16,112)`: **96 of surface's 128 columns
already have astral directly above them.** Only the two 16-column edge
strips (`tx 0-15`, `tx 112-127`) don't. Widen astral to tw:128, origin.x:0
anyway, to close that real 32-column gap rather than leave two dead zones —
but do NOT reason from "nothing connects today," and do NOT assume this
widening is what makes a winch reach astral; whether a lift built in the
already-overlapping 96 columns can reach astral is a placement/height
question (does a stage's footprint clear the gap up to astral's floor)
that Phase 6.5's recon flags as still open — verify it directly before
writing the dock row. Re-run tests/visual.spec.js's astral-desktop-darwin.png
baseline update in its own commit and say why the pixels moved.

Per D9, 0 M STAYS THE SPAWN FLOOR regardless of the width change: the astral
band is negative depth. Moving the datum would silently relocate
cyclops_maw's minDepth:200 (SPEC §12). If AUDIT-2 contradicts any of the
above, STOP and report rather than proceeding.

--- STEP 2: WHAT THE BAND NEEDS ---

Not a band — content. Today astral is 40 rows with a stone floor and nothing
on it, and tests/visual.spec.js already baselines it
(astral-desktop-darwin.png), so it renders. What it lacks:
  - anything to arrive at
  - anything to receive cargo
  - a reason for a player to look up

If a band above the surface turns out NOT to be fully expressible in some
reader you find — a hardcoded assumption that depth is positive, say — the
smallest change that fixes it is part of this task. Name it in your plan and
name every reader it touches.

--- STEP 3: THE CLOUD DOCK, AND WHY THERE IS NO WALL ---

The topmost lift stage terminates at a Cloud Dock: a 2-tile platform in the
astral band, as a data/machines.js row like any other.

  - Cargo arriving at the dock is consumed and credited to the tribute ledger.
  - The player CAN ride up and stand on it. There is no invisible wall and no
    refusal message.
  - Step off, and you fall the full world height. SPEC §3's own table makes a
    20-tile drop lethal, and the drop from astral's floor to the surface is
    many times that. Gravity is the gate. Do not add a barrier, do not
    special-case the fall, do not soften it. This costs zero new mechanics and
    buys the correct myth (CLAUDE.md D5).
  - The gods are never drawn as figures and never speak to the player
    directly. Hands take the cargo. docs/DESIGN.md's Hades reveal depends
    entirely on him being the FIRST god who addresses you in person — do not
    spend that here.
  - Astral is widened to the surface's full column range by Step 1, so the
    dock may be placed at any column with a completed chain beneath it. Per
    Step 1's correction, most of the surface (tx 16-112) already had astral
    overlap before the widening. IF A CHAIN BUILT THERE CANNOT REACH ASTRAL,
    THE CAUSE IS model/segments.js#linkCheck, AND THERE ARE ONLY TWO
    CANDIDATES: 'TOO FAR APART' (astral's floor is further above the surface
    than one hub's reach, which is correct and is answered by another hub, not
    by a fix) or 'OUTSIDE THE WORLD' (a sample on the span resolves to no band
    -- the two 16-column edge strips, which is exactly what the widening
    closes). Diagnose which before assuming the widening alone fixes
    reachability, and note that the dock is a hub-adjacent RECEIVER, not a
    lift stage: it needs no lift block, no span and no toBand.

--- STEP 4: THE CYCLE DIRECTOR ---

New: data/cycles.js (content) + rules/cycles.js (the director).

  { id, god, demand:[{sub, form, n}], deadlineSecs|null, reward, punishment }

  Demand selectors go through data/forms.js#expand(sel) to prove they are not
  empty — the validator that already exists, per CLAUDE.md.

  DEAD SCAFFOLDING TO REUSE, NOT DUPLICATE: model/run.js's RUN_SCHEMA already
  has a `tribute` field (null, with a working setter `write.tribute()`,
  currently zero callers) and a `cycle` field (starts at 1, never read or
  incremented). Both were clearly staged for exactly this phase — use them
  instead of adding new RUN_SCHEMA fields for the same concepts. Also:
  data/drops.js already has a `tribute-bellows` row (`trigger:'tribute',
  chance:1, give:'bellows'`) that nothing fires — this phase is what fires
  it, on cycle completion, through whatever the existing `trigger:'mine'`
  drop-roll call site in rules/mining.js does for that trigger.

  CYCLE 1 IS UNCHANGED AND UNMOVED (D6). SPEC §4/§5: altar on the SURFACE,
  10 raw copper, no clock, furnace as the reward. Every beat in §5's sheet
  teaches exactly one thing and this one teaches "the gods ask." Do not
  relocate it to the dock.

  CYCLE 2+ delivers to the Cloud Dock. Which means the lift chain is not a
  convenience, it is the win condition — exactly the pressure docs/DESIGN.md's
  cost-of-ascension section is built to generate. Demand escalates in
  REFINEMENT, not volume (DESIGN.md is emphatic): cycle 2 wants plate, not
  more ore. SPEC §8's compression ratios are the table to price against.

  On completion: credit favour to the asking god, unlock the next depth band
  (the mask in Phase 9's ruler comes off, using PHASE 9'S predicate — do not
  write a second one), and offer a draft from the existing tiers via
  rules/grants.js#draftable and rules/boons.js#draftable, both of which
  already exist and already filter what is takeable.
  On miss: the punishment row. Two misses ends the run.

  data/drops.js already carries a row for tribute completion that nothing
  reads, because tribute completion is not a real event yet (SPEC §14). This
  phase is what makes it one — wire it.

  Deadlines are wall-time against the fixed 1/120 s step, accumulated in the
  director, never read off Date.now() anywhere.

  rules/cycles.js is a rules SIBLING: it may not import another rules module,
  and its position in src/shell/schedule.js needs a comment explaining both
  adjacent pairs. Notification goes through model/journal.js, never a direct
  play() or toast().

  THIS IS ALSO WHERE PHASE 8a's RESERVED BEAT SLOTS 5 AND 6 FIRE. Advance
  `run.tutorialBeat` (model/run.js, via Phase 8a's field — read it with
  model/tutorial.js#beat, write it directly here, the same way any rules
  module writes model state as a consequence) to 5 the moment the altar
  first appears, and to 6 the moment cycle 1's delivery completes. Do not
  duplicate Phase 8a's advancement logic; this is the one and only place
  beats 5-6 ever fire, because the altar they describe is born here.

--- STEP 5: HUD ---

Per D8's layout map. TRIBUTE panel under the burden bar: demand rows with
have/need, a progress bar, and the deadline when there is one. FAVOUR under
the boon stack, per-god bars, unmet gods masked with the SAME predicate
Phase 9's ruler introduced.

Panels are positioned by an anchored layout pass over MEASURED text. The
mockup demonstrates the failure: its FAVOUR label overruns its own frame and
its boon cards are clipped off the viewport. Match the mockup's density, not
its bugs. Remember the depth readout already owns top-right with the boon
stack beneath it (view/hud.js:120-121).

--- STEP 6: DOCS ---

New numbered section in docs/SPEC.md locking every number this phase invents
(cycle table, dock footprint, band bounds, deadline values), in the
established style. Update DESIGN.md's "Implemented vs design-only, at a
glance" table. AND FIX A LIVE DIVERGENCE: DESIGN.md's "Run structure" says
"Cycle 1: 20 copper plates" while SPEC §4 locks 10 raw copper. SPEC wins;
correct DESIGN.md in the same commit. DESIGN.md also claims "the HUD shows a
static cycle-4 tribute panel as decoration", which is not true of this build —
fix or delete that line too.

FILE OWNERSHIP: src/data/cycles.js, src/rules/cycles.js, src/shell/schedule.js
(one insertion, with its comment), src/data/machines.js (the dock row),
src/data/world.js (widening astral's tw/origin.x, per Step 1, plus any other
astral content), src/model/run.js (RUN_SCHEMA fields the ledger needs, plus
writing the existing `tutorialBeat` field to 5/6 per Step 4 — not a new
field), src/view/hud.js panels, docs/SPEC.md, docs/DESIGN.md.

STOP after writing docs/PLAN-phase10.md covering: the confirmation of Step 1
and the astral-widening fix, how the dock row receives cargo from a segment
carrier arriving in the astral band (model/segments.js, rules/drive.js's own
arrival handoff) and which model/segments.js#linkCheck refusal a
surface->astral link can still hit given astral's x range, where
rules/cycles.js sits in the schedule and why, the RUN_SCHEMA additions and
their newRun() reset (invariant 8), and the cycle table. Wait for approval.
```

**Acceptance:** finish cycle 1 at the surface altar exactly as §5 describes,
and watch `run.tutorialBeat` advance to 5 when the altar appears and to 6 on
delivery. Then chain segments to the astral band from a column anywhere
under the (now full-width) astral band, crank plate up, watch the TRIBUTE
panel fill, and get a band unlock. Then walk off the dock on purpose and die.

---

## Phase 11 — Harness (1 × `harness`, parallel with 7–10)

Generated terrain and a new render path are where a visual-only harness stops
being enough. Most of this is property tests over seeds and never opens a
browser.

```
Read docs/AUDIT-2.md, CLAUDE.md, and each phase spec as it lands.
Extend tools/content.mjs, tools/check.mjs and tests/visual.spec.js. There is
no test/ directory and there must not be one — Phase 6 above says so already,
and the appendix maps the original plan's `test/**` onto tests/ +
tools/check.mjs.

--- TIER 1: WORLDGEN PROPERTIES, over >= 200 seeds, node only ---

For every seed, assert:
  - determinism: same seed twice => byte-identical material and damage arrays,
    for every band
  - the spawn shelf is FLAT and >= 9 tiles wide, centred on spawn (Phase 7 C4;
    rules/generate.js#SHELF is the half-width)
  - the guaranteed copper vein is present and reachable within a 5-tile dig
  - within 24 tiles of spawn, no surface feature yields a fall > 5 tiles
    (SPEC §3's safe fall — this is the test that protects §5's beat sheet)
  - adjacent surface columns differ by <= 1 tile, except for permitted steps
    that occur no more often than 1 in 12 columns and never near spawn
  - surface height stays inside the declared relief budget
  - no hollow's ceiling is within 2 tiles of topsoil
  - no hollow intersects the spawn column, tutorial shaft, or guaranteed vein
  - every ore body is reachable: a flood from the surface through diggable
    tiles reaches it (catches ore sealed inside an adamant shell)
  - tier monotonicity still holds (SPEC §9's existing tools/content.mjs
    assertion — do not duplicate it, extend it)

Print the failing seed. A worldgen bug you cannot reproduce is a worldgen bug
you cannot fix.

--- TIER 2: INVARIANT TESTS ---

  - FOG: no renderer draws a tile with b.seen false. Assert for the scene pass
    AND for overview mode, separately. drawMap enforces this by OMISSION, so a
    test that only checks "no opaque rect" proves nothing — assert on the
    pixels or on the draw calls.
  - REVEAL LEAK: a hollow separated from a lit shaft by solid rock stays
    unseen. Per SPEC §11, rules/reveal.js's passB may not enqueue past its
    first ring without lightAt() >= 1 — test the boundary directly. NOTE
    passB is module-private (reveal.js exports only step()), so drive it
    through step() rather than importing it, or say why you exported it.
  - CHUNK SEAM: bake a chunk containing a tree whose canopy overhangs its
    boundary, in isolation and in context; the overlapping region must be
    pixel-identical. Same for a cloud and a grass-cap stroke. This is the open
    question SPEC §1 names and it needs a test, not an eyeball.
  - GLOW IS NOT LIGHT: drop a glowing relic in a fully unlit hollow and assert
    every b.light in the region is unchanged. Phase 8b's glow is a view
    treatment; if it reaches the light field, a dropped pickaxe is a free
    torch and the brand economy leaks. Assert too that a held/dropped `rig`
    machine item does NOT glow.
  - RENDER PURITY still holds: the epoch counter is unchanged across a render
    of every new path (overview at every zoom, the ruler, the callout), and no
    new draw path calls rand() (invariant 7). check.mjs already has both
    probes; point them at the new paths.
  - DATUM: the HUD gauge's depth at a given worldY equals the depth
    model/run.js#placementCheck uses for minDepth, at the surface, in the
    astral band, and at topsoil row 220. SPEC §12 says these can never
    disagree; prove it once the astral band has content.
  - HEAVENS LEDGER: cargo delivered to the dock credits the ledger exactly
    once. Delivery with a broken lift chain fails and says why. Cycle
    completion unlocks exactly one band. Two misses ends the run. Stepping off
    the dock is lethal. newRun() resets every new RUN_SCHEMA field
    (invariant 8).

--- TIER 3: VISUAL SNAPSHOT MATRIX ---

Fixed seeds x fixed tick counts x framings, added to tests/visual.spec.js
alongside the existing sixteen baselines:
  the opening frame with the glowing pickaxe and its callout /
  a soil-to-stone contact zone at full frame /
  an ore blob against pale stone / a tree crossing a chunk seam /
  a glowing relic lying in an unlit hollow /
  surface hills / a cliff face / an unlit hollow / the same hollow lit /
  overview at three scroll positions / overview with a broken lift chain /
  the Cloud Dock / HUD with TRIBUTE, FAVOUR, boons and the ruler populated

maxDiffPixels stays 0 — it is pixel art and the renderer is deterministic by
construction, so any diff is real. Drive input through the keyboard or the
model, never through hardcoded click coordinates: the phone project's base
buffer is 200x422 and geometry-driven clicks break there. Commit baselines,
and note in the suite that a baseline update is a REVIEWABLE change, not a
formality — the existing baselines are still UNREVIEWED.

FILE OWNERSHIP: tests/**, tools/**, package.json scripts, plus test hooks on
globalThis.__mf whose cost you name in docs/FINDINGS.md first.
```

---

## Sequencing summary — wave 2 (phases 6.5–11)

**All phases in this table are DONE**, including the 8c–8g insertion below
(see "Pending insertion" — resolved).

Continues the table above. Same rules: reviewer after every phase, one commit
per agent, never two agents at once against the same file.

| phase | agent | parallel? | gate to proceed |
|---|---|---|---|
| 6.5 recon | 1 `cartographer` | with 6.6 | vertical layout, bands, the `look`/`TREAT` indirection and chunk-seam behaviour all unambiguous |
| 6.6 archaeology | 1 `cartographer` | with 6.5 | verbatim old source, with shas, for every lost feature; deliberate changes classified as such |
| 7 worldgen | 1 `systems` | no | beat sheet still plays; contact zone reads as geology; `check` + `check:content` green |
| 8 painting | 1 `ui` | after 7 | known-good recovered in its own commit, then exceeded; no seam slicing |
| 8a tutorial beats | 1 `systems` | after 7, may run alongside 8 | `tutorialBeat` advances 0→4 in order, resets on newRun |
| 8b relics | 1 `ui` | after 8a and 8 | a pickaxe that looks divine; four callouts fire, two reserved; glow never touches `b.light` |
| 8c substance budget | 1 `systems` | after 8b | tile-capable headroom >= 10 rows; new lint seen to fail |
| 8d segment skeleton | 1 `systems` | after 8c | two hubs link, three refusals fire, nothing moves, old winch still works |
| 8e segment visuals | 1 `ui` | after 8d | a human approves the machinery; ~16 new baselines, each reviewed |
| 8f drivetrain | 1 `systems` | after 8e | crank to rise, let go to sink, a heavy rider reverses it; rules/lift.js gone |
| 8g drivetrain harness | 1 `harness` | with/after 8f | framerate-independent ride; every assertion seen to fail |
| 9 overview | 1 `ui` | after 8g | a broken segment chain is the first thing you see; no unseen tile drawn |
| 10 heavens | 1 `systems` | after 9, plan-mode first | cycle 1 unchanged; astral widened and connects; beats 5-6 fire; plate reaches the dock; SPEC and DESIGN current |
| 11 harness | 1 `harness` | yes, throughout | worldgen properties green over 200 seeds; each new assertion seen to fail |

Phases 8, 8b, 8e and 9 all live in `src/view/` — do not run them concurrently.

### Three things to watch across the wave

**The paint-data indirection already exists, and the risk has inverted.** The
first draft of this plan assumed `view/` had no per-material data and that
Phase 8's job was to add it. It has: `look:{ base, hi, lo, treatments:[…] }`
plus `view/treatments.js#TREAT`. So the failure mode to guard against is no
longer "the agent adds substance names to `view/`" but "the agent adds a
second, parallel `paint:{}` table beside `look:{}`" — which passes the layer
checker, passes the screenshot, and leaves two tables describing one thing.
If that happens, the phase has failed even if the pixels improve. Extend the
table that is there.

**A regression is cheaper to fix than a redesign, so find out which you have —
and be willing to find neither.** Phase 6.6 exists because some of the look
was *lost* rather than never built, and the two have completely different
remedies. But at least one item on its list, the tree canopy, was changed
**deliberately**, with the reasoning written down in
`view/treatments.js#canopy`. An archaeology phase that reports every difference
as a regression is as useless as one that reports none. Every hour spent
inventing a strata contact generator is an hour it could have spent running
`git show`; every hour spent reverting a considered decision is worse than
both.

**Phase 7 makes discovery, Phase 9 can give it away.** Hollows are only a
discovery because three existing systems agree to hide them: `b.seen`,
`rules/light.js`, and `passB`'s light-gated flood. Overview mode is the natural
place for that agreement to break — and `drawMap` enforces fog by *omission*,
which is easy to lose when you switch to downscaling baked chunk canvases that
were painted without regard to what has been seen. That is why the fog
assertion is written twice in Phase 11: once for the scene, once for the map.

---

## Pending insertion — segment transport replaces the staged winch (Phases 8c–8g)

**RESOLVED. Phases 8c–8g are committed**, `docs/PLAN-gears-and-winches.md`'s
§7 patches were applied, and Phases 9 and 10 above ran against the segment
model, not the retired winch. Left below verbatim as the historical record of
the decision.

**`docs/PLAN-gears-and-winches.md` exists and is awaiting review.** It is the
plan-mode output for a rejected mechanic: the staged winch
(`src/rules/lift.js`, `data/machines.js`'s `lift` row,
`lift:{ span, toBand }`, the `liftUp`/`liftDown` tunables, `m.deck`,
`placementCheck`'s `'NO SHAFT TO SERVE'` branch) is **replaced**, not extended,
by player-cranked, gear-linked **segment transport**: two placed hub machines
within reach of each other, joined by an auto-resolved cable at any angle over
a clear path, with a carrier that rises only while a drivetrain is being turned
and slides back down under its own weight — and under the weight of whatever,
or whoever, is riding it.

What that plan contains, and why this file cannot simply absorb it:

- **It changes two binding documents.** `CLAUDE.md` invariant 4 ("Five
  independent lift stages, never one continuous cage") is reworded, `CLAUDE.md`
  D4's "boarding a lift stage upward is refused" clause is amended to physics
  rather than permission, `ARCHITECTURE.md` §9 invariant 4 follows, and a new
  **D10** fixes the vocabulary (hub / segment / carrier / chain / drivetrain)
  and records the gears-are-placed-but-the-cable-is-not reconciliation. All four
  are **drafted in that file for review and deliberately unapplied.**
- **Five new phases, 8c–8g,** slotting between Phase 8b and Phase 9 — a
  substance-budget unblock, a motionless skeleton, a dedicated **visual
  iteration** phase with a ~16-shot screenshot matrix *before* behaviour locks
  in, the drivetrain and the winch's retirement, then the harness.
- **Phase 9 and Phase 10 above still cite code this deletes.** Phase 9's LIFT
  CHAIN layer names `rules/lift.js#reaches` and `placementCheck`'s
  `'NO SHAFT TO SERVE'`; Phase 10 Steps 1 and 3, its STOP paragraph and its
  acceptance all name the WINCH STAGE row or that same API. **Their bodies are
  deliberately left untouched here.** §7 of the plan is a diff-shaped patch
  list — exact current text, exact replacement — to be applied when the plan is
  approved and 8c–8g are scheduled, not silently now. Do not run Phase 9 or
  Phase 10 against the text above once 8f has landed without applying those
  patches first.
- **Two blockers it found and quantified:** the tile-id-byte guard in
  `data/forms.js:225-228` allows only two more substance rows and this needs
  four (the guard is conservative by ten non-packable rows — Phase 8c's job),
  and `tools/check.mjs:789-815`'s break-even section indexes `M.lift` directly
  and throws the moment the row goes.

Sequencing, until this is approved: **Phase 8 (painting) and 8b (relics) are
unaffected and may proceed.** Phase 9 and Phase 10 depend on the new mechanism
existing — Phase 9 to visualise it, Phase 10 for the Cloud Dock to be reachable
— so neither should start until 8c–8g are either done or explicitly deferred.

*(Done — see the RESOLVED note above this section.)*

---

## Wave 3 — the interaction model (Phases 12a–12d)

Not sequenced in this file. Planned and executed as a standalone document,
`docs/PLAN-phase12.md`, after Phase 11 landed: audited every key, unified
mining/placing/miracle-use/craft onto LMB, made pickup opt-in (`c` to
collect, an auto-collect toggle), converted `run.inv` from an unbounded dict
to a fixed-capacity slot array, and rebuilt the quickbar as a live mirror of
that array. Sub-phases 12a, 12b, 12c, 12c2 and 12d are all committed; 12d
included a gap-fix commit retiring the last stray craft key
(`u`) that survived the initial pass. See `docs/PLAN-phase12.md` for the
full design record — its own "Status: PROPOSAL" header is stale and refers
to before the phase was built.

---

## Wave 4 — legibility, materials, the world's edges, and the feed verb (Phases 13a–16c)

Not sequenced in this file either, for the same reason wave 3 was not:
planned as standalone documents so that a phase agent is handed one file
rather than a slice of this one. **Nothing in wave 4 is committed.**

- **`docs/PLAN-phase13.md` — Phases 13a, 13b, 13c, 13d.** UI text contrast,
  the ladder's sprite, the auto-collect default, and the game-loop punch
  list. 13d ("the shortest path to a closed loop") is a *proposal* and needs
  a greenlight before it is scheduled; the other three are ready to run.
- **`docs/PLAN-phase14-mining-and-drops.md` — Phases 14a–14e.** Mining drops
  become prerequisites and named deposits deplete. The largest item in the
  wave and the one with a full risk register. **Also carries a new
  cross-cutting decision, drafted for review as `CLAUDE.md` D12 (§4's
  D14-H): a form is either feedstock or buildable, never both** — the
  general rule `gravel` losing its `tile` block already is one instance of;
  applied a second time in the same phase to `timber/log` (fuel, five
  recipe ingredients, *and* a ladder tile today — `peg_rungs` already
  crafts the placeable `rung` from it, so the fix is deleting one field, not
  new content). D12 is now the earliest dependency in the wave: **14a lands
  first**, ahead of 13 and 15.
- **`docs/PLAN-phase15-trees.md` — Phase 15.** Seeds, planting and growth.
  Gated on 14a twice over: the shared form budget (§2.4) and, since D14-H,
  the fact that its own D15-A/D15-C were written assuming `log` stays
  placeable and must be re-read against 14a's actual landed row.
- **`docs/PLAN-phase16-interaction-model-v2.md` — Phases 16a, 16b, 16c.**
  The missing feed verb. Clicking a non-placeable inventory slot is a
  confirmed silent no-op today, and feeding a machine is a proximity side
  effect rather than a gesture — with three workarounds in the repo for its
  absence (`rules/cycles.js`'s `SPAWN_GAP`, and two offsets in
  `tools/check.mjs`) and three comments asserting a "feed key" that has
  never existed. Extends Phase 12's model; contradicts none of it. Its
  click-model decision (D16-A) originally rejected pure type-dispatch
  because `log` and `gravel` were both double-duty; D12 removes both
  counterexamples, so the two candidate models now agree on every legal
  pair and D16-A's revision (§5) keeps the target-priority implementation
  as the more defensive of two equivalent choices, while recommending the
  *simpler* framing ("what you're holding decides") for the player-facing
  legibility work in 16c. **Lands after 14a and after the whole of 13**, per
  its own §7.2 — net wave order is **14a, then 13a→13d, then 15, then
  16a→16c**.
- **`docs/PLAN-horizontal-chunks-SCOPE.md` — scoping only, no phase
  numbers.** An unbounded horizontal world. Feasible, larger than any wave
  so far, and recommended *against* in its current form in favour of a
  bounded-but-large intermediate; requires a read-only recon pass
  (`docs/RECON-horizontal.md`) before any implementation phase is written.
  Its §5 drafts three binding-document diffs which are **deliberately
  unapplied**, exactly as `docs/PLAN-gears-and-winches.md` §3 did.

Five facts from wave 4's planning that are true of the repo **today** and are
worth knowing whether or not the wave ever runs:

1. **Appending a tile-capable substance row to `data/substances.js` throws at
   import.** `SUB.length` is 23, `PACKABLE_LIMIT` is 20, and the twelve
   "free" ordinals `docs/SPEC.md` §15 counts are all already occupied by
   non-packable rows. `docs/SPEC.md` §15 and
   `src/data/substances.js`'s "ROWS ARE APPEND-ONLY" header contradict each
   other on this. See `docs/PLAN-phase14-mining-and-drops.md` §2.1.
2. **`docs/SPEC.md` §18.4 promises a 1-of-3 draft and the code delivers
   1-of-1**, and three of the four gift tiers have exactly one content row so
   1-of-3 is not currently constructible. See `docs/PLAN-phase13.md` §5.2
   items 4 and 5, and `docs/PLAN-phase16-interaction-model-v2.md` §7.3 for
   why the draft's own UI belongs in a Phase 17 document rather than in
   either of them.
3. ~~**Clicking a non-placeable inventory slot does nothing at all.**~~
   **FIXED by Phase 16a** (docs/SPEC.md §23.1): any occupied slot arms, on
   both the click and the digit path. It *was* true — the gate required a
   tile-capable form, `F.rig` or `F.phial`, so every ore, ingot, plate,
   brand and relic was click-inert, control falling through to
   `runw.moveSlot(i, i)`, which returns immediately on `from === to`. See
   `docs/PLAN-phase16-interaction-model-v2.md` §3.3.
4. ~~**There is no way to feed a machine on purpose.**~~ **FIXED by Phase
   16a, and the fallback retired by Phase 16b** (docs/SPEC.md §23). The verb
   is `rules/machines.js#handOne`: arm a held pair, aim at a machine inside
   `handFeed.reach`, LMB, one unit per press. The proximity drain
   (`#handFeed`) is now gated on `cmd.autoFeed` — the Character tab's AUTO
   FEED row, default off, reset every run (§23.6) — and `step` takes `cmd`.
   It *was* true, and unpleasantly so: an altar took everything you carried
   in under a second and `rules/cycles.js#drainReceivers` credited it the
   same frame. `rules/cycles.js`'s `SPAWN_GAP = 4` and the `+15` offset in
   `tools/check.mjs`'s burden probe are **kept**, with their reasoning
   corrected rather than removed (the hazard is opt-in now, not gone, and
   the altar's gap is correct staging regardless). The three "feed key"
   comments (`data/machines.js` ×2, `docs/SPEC.md` §18.3) are gone. See
   `docs/PLAN-phase16-interaction-model-v2.md` §3.4–3.5.
5. **`docs/PLAN-phase12.md` D-I never landed**, despite that document's
   status line. `git log -- src/view/ui/slot.js` shows no Phase 12 commit and
   `frameSlot` still draws a single 1-px border, not the specified 2-px
   double frame. Folded into Phase 16c.
6. **Every currently-placeable form is also consumed as feedstock somewhere,
   on both terrain rows the game has.** `timber/log` is fuel
   (`handFeed:{from:['*/#fuel']}`) and a bare ingredient in five recipes
   (`hub`, `crank`, `gear`, `axle`, `daedalan`) *and* directly placeable as
   a ladder. `*/gravel` (stone, soil, granite, adamant's shared mined drop)
   is cycle 4's literal tribute currency and a recipe ingredient in
   `belt_r`/`gear` *and* the "shovel it back" placeable tile. Both are the
   same shape of bug, on different substances — see
   `docs/PLAN-phase14-mining-and-drops.md` §4's D14-A/B (gravel) and D14-H
   (log), and the drafted `CLAUDE.md` D12 that names the general rule.
