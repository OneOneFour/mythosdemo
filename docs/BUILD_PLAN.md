# Build plan — prototype to game

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
   - every non-raw holdable pair is reachable from a mined pair through the
     recipe graph — no orphans, no unobtainable content
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
      already use, and spends exactly one unit from run.inv
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
  - register the new step in src/shell/schedule.js with a comment explaining
    its adjacent pairs, as every other entry has. It must run BEFORE reveal
    (reveal now reads light) and AFTER mining (a tile broken this frame opens a
    new light path this frame). Between them is the only correct slot; say so.

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
