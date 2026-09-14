# Plan — wave 5: closing every open item before the code review

**Status: IN FLIGHT. 17a has landed (`docs/AUDIT-wave5.md`); 17b onward is
running. Every decision in §2 and §5.1 is settled — do not reopen one.**

This wave exists to empty the project's open-work list so a general code review
has a still target. It is a closeout wave, not a feature wave: everything in it
is already named somewhere as open — `docs/PLAN-phase13.md` §5.2's twenty-item
punch list, `docs/PLAN-phase17-drafts.md` (which this plan absorbs as Phase
17b), the two parked items in `docs/FINDINGS.md`, and the Character-tab
overflow parked by Phase 16b.

Read `CLAUDE.md` (especially §"Resolved decisions" and §"Invariants") and
`ARCHITECTURE.md` (§1 the layer graph, §5 the tunable store, §7 what was already
rejected) before touching anything. `docs/SPEC.md` holds the locked numbers;
where SPEC and code disagree, SPEC wins and is corrected in the same commit.

## 1. What this wave closes, and what it does not

### 1.1 In scope

| source | item | phase |
|---|---|---|
| punch list #4 | the draft is 1-of-1, not 1-of-3 | 17b, 17c |
| punch list #5 | three of four gift tiers have exactly one content row | 17b |
| punch list #6 | cycle 4's trinket draft is a guaranteed no-op | 17b |
| punch list #7 | **restated by 17a.** Not a depth problem: `kiln_divine` has no `minDepth` of its own (it is `variantOf:'furnace'`, `data/machines.js:201`) and no substance row or recipe by deliberate content decision (`data/substances.js:463-469`), so `placementCheck` refuses it `'NOTHING BUILT YET'` at every depth, for ever. It is the only `GRANTS` row, so **the whole machine-grant tier is presently a no-op** | 17b |
| punch list #11 | **narrowed, not open.** `run.misses` reaches the win screen (`view/hud.js:1062`) and nowhere during play | 17e |
| punch list #12 | FAVOUR has zero consumers | 17c |
| punch list #14 | no rate or throughput demand exists. **Closes as "mechanism shipped, promise reworded"** — 17d's clause measures delivery bunching, which a rolling window over delivery instants is all it can measure; a genuine throughput quota stays unbuilt and goes to `FUTURE_IDEAS.md` | 17d, 17e, 17h |
| punch list #15 | the deadline timer has no urgency treatment | 17e |
| punch list #16 | the death screen shows cause and depth only | 17e |
| punch list #17 | no `data/gods.js`; two god ids can never be named | 17b |
| punch list #18 | the altar is placed fully formed at frame 0, with no presentation | 17f |
| FINDINGS #13 | **closed by 17a, and not as reported.** The HUD burden bar passes no `label` (`view/hud.js:209-215`), so `bar.js:70`'s `max(bar, label)` collapses to `x + w + 3` for it and cannot have moved the screenshots the finding cites — the value never overlapped that bar. The real instance of the class was the TRIBUTE demand rows, fixed at `view/ui/bar.js:58-74` | 17h records it |
| FINDINGS #14 | `winch-lit`/`winch-unlit` failed once under full parallelism | 17g |
| FINDINGS 16b.3 | the Character tab has no vertical budget; 3 of 4 stat rows are invisible | 17e |
| new | `talos_head` and `cyclops_maw` are granted by nothing and are unreachable in a whole run | 17b |
| new | `view/fx.js`'s chip stream is never reseeded by `reset()` — latent, **not** observable in a baseline today (17a: Playwright gives each test a fresh page, so `spark` starts at the same offset every time) | 17e |
| new | **17a.** `talos_head`/`cyclops_maw` are not merely ungranted but *uncraftable*: `isKnown` (`model/run.js:610-614`) gates a machine-build recipe on `canPlace`, so they are dead content in three tables at once | 17b |

### 1.2 Explicitly out of scope, and where each goes instead

Three punch-list items are closed **as documentation**, because the code is
already right and only the docs imply otherwise:

- **#3, no content past cycle 4.** The run now ends — `rules/cycles.js:86-94`
  fires `rw.win()` and `view/hud.js#winScreen` draws it. Cycles 5 and 6 need
  the `essence` (60:1) and `ambrosia` (~400:1) refinement tiers that
  `docs/SPEC.md` §8 marks NOT IMPLEMENTED; that is a content wave with its own
  forms, recipes, machines and a rebalance of the whole refinement curve.
  → `FUTURE_IDEAS.md`, in 17h.
- **#13, charting is knowledge and not access.** Already deliberate and
  recorded in three places (`model/run.js:78-81`, `data/cycles.js:43-46`,
  `docs/SPEC.md` §18.6). Closed as acknowledged, not implemented.
- **#19, meta-progression, and #20, stolen recipes.** `meta` has no save and
  `CLAUDE.md` forbids `localStorage`/`sessionStorage`, so "banked favour
  carries between runs" cannot mean what `docs/DESIGN.md` implies it means.
  Within-page-session banking through the existing `META_SCHEMA` is
  constructible and is a real design question about what a meta-currency buys.
  → `FUTURE_IDEAS.md`, in 17h, with the storage constraint stated.

One further item stays parked with its reason restated once, not fixed:
`docs/PLAN-phase10.md:771`'s assertion of a "feed key" is a true record of what
Phase 10b intended, in a historical plan document, and is left alone on the same
principle `PLAN-phase12`/`13`'s own stale recommendations are.

## 2. Decisions, made before the phases begin

Binding on every phase below, and on `docs/DESIGN.md` and `docs/SPEC.md` too.

### D17-A — the draft modal PAUSES the run

`shell/main.js#step` and `#applyIntents` already return early on
`flags.showMap` and on `run.won`; the draft modal joins that guard rather than
inventing a second pause mechanism. A draft is a ceremony, and a player
choosing a permanent gift while a crank stalls under them is choosing under
pressure the design never asked for. The counter-precedent —
`view/ui/mainPanel.js`'s tabbed window deliberately pauses nothing — stands for
a panel the player *opens*; the draft is one the game *raises*, which is the
same shape as the map freeze and the end screens.

Consequence: the guard is stated **once**, as a predicate over `ui.stack`, not
as a hardcoded `'draft'` string in two functions.

### D17-B — FAVOUR buys a reroll of the offer

Favour is spent with **the god who is asking**, on rerolling that god's 1-of-3
offer, at a `data/tuning.js` price (`rerollCost`). This closes punch-list #12
with no new screen: the modal Phase 17c builds is the whole UI. A god you have
pleased will look again; one you have not cannot be asked twice.

Rejected: gating offer *width* on favour (invisible to the player, and it makes
the modal's layout variable), and leaving favour a pure score (which is what
#12 already complains about).

An offer the player cannot afford to reroll still draws the price, dimmed, with
a refusal through the existing `'refused'` journal row — never a hidden button.

### D17-C — a throughput demand is a ROLLING WINDOW, measured on simulated time

A cycle row may carry `rate:{ sub, form, n, secs }` beside its `demand`:
deliver `n` of that pair inside **any** window of `secs` seconds. Both clauses
must be satisfied for the trial to pay, so a rate demand is an additional
constraint on a flat count and never a replacement for one — `tributeMet()`
stays the single completion predicate with a second clause in it, not a second
predicate.

- The window accumulates from `run.t` (`model/run.js:235`, `write.tick(dt)`,
  the fixed-step accumulator) and **never** from `Date.now()` — invariant 10.
- Credits older than the window are pruned on write, so the ledger is bounded
  by `n` rather than by the length of the run.
- `docs/SPEC.md` §4's "Throughput quotas are NOT IMPLEMENTED" paragraph and
  §18.4's table are corrected in the same commit as the code.

Rejected: retiring the promise and escalating by tightening `deadlineSecs`
(cheaper, but it leaves the factory half of the design unexpressed — every
demand stays a pile rather than a line); and a start-on-first-delivery window
(cheaper again, but it measures punctuality rather than rate).

### D17-D — a machine row must be reachable, and that is a build failure

`talos_head` and `cyclops_maw` (and their `_l` variants) appear in
`data/machines.js`, in `data/substances.js` as held items, in `data/recipes.js`
as craftables — and in no grant, no cycle reward and not in
`STARTING_MACHINES`. They cannot be placed in any run. `tools/layers.mjs`
cannot see this ("direction and names, not sense"), and neither could
`tools/content.mjs` until this wave.

So: two of the three grant rows Phase 17b needs already exist as machines, and
a new `tools/content.mjs` assertion makes an unreachable machine row fail the
build. `altar` is the one exemption, by name and with its reason — it is the
machine the player cannot build, placed by `rules/cycles.js#ensureAltarPlaced`.

**The assertion tests placeability, not sponsorship** (17a). "Named by a
`GRANTS` row" is the wrong property and would have passed `kiln_divine`, the
deadest row in the table, green: it *is* named by a grant and still cannot be
placed, because `machineHeldSub('kiln_divine')` is `undefined`
(`model/run.js:492-493`). The assertion is therefore: for every machine row,
`machineHeldSub(id) !== undefined` **and** some route grants it — both halves,
with `altar` the single exemption. An assertion that would have gone green over
the bug that motivated it is worse than no assertion.

### D17-E — a mirrored pair is granted as one thing

`belt_r`/`belt_l`, `talos_head`/`talos_head_l` and `cyclops_maw`/`cyclops_maw_l`
are each one `variantOf` row overriding a facing key, and `model/run.js:385-388`
already derives that relationship from the shape rather than hand-listing it.
Granting `talos_head` therefore grants its mirror too, through that existing
derivation exported as a query — not through a second content field and not by
listing both ids in `data/grants.js`. `STARTING_MACHINES`'s explicit `belt_l`
entry is a different table and is left alone.

### D17-F — the offer lives on `run`, and the selection consumes `rand()` inside `rules`

`run.offer` grows from a tier name to `{ tier, ids }`. It is world state: it was
drawn from the seeded stream, it decides what the player may be given, it must
reset with `newRun()`, and `__mf` must be able to read it back.

The 3-of-N selection is a decision and consumes `rand()`, so it lives in a new
event-driven `rules/draft.js` — called from `shell/main.js#applyIntents` exactly
as `rules/placement.js` already is, and not added to `shell/schedule.js`, which
orders *stepped* modules. `shell` gathers the four tiers' `draftable()` lists
(it is the only layer that may see all four) and hands the candidate ids over;
`rules/draft.js` picks, prices the reroll and spends the favour. Dispatching the
chosen id back to `trinkets.grant` / `grants.grant` / `boons.grant` /
`miracles.grant` stays in `shell`, because those four are `rules` siblings that
may not import one another.

### D17-G — the altar's arrival is gated on the tutorial beat, with a timeout

`docs/SPEC.md` §5's beat is "the sky darkens, clouds part, a shaft of light, an
altar rises"; the code places it fully formed on frame 0
(`rules/cycles.js:134-139`). Gate it on `run.tutorialBeat` reaching the
climbed-back-up beat — `run` state, so no `rules` sibling import — **or**
`run.t` passing an `altarGraceSecs` tunable, whichever comes first.

The timeout is not belt-and-braces: a beat predicate that never fires would
otherwise withhold the only receiver cycle 1 has, and a soft-locked first trial
is strictly worse than an altar that arrives unannounced. This is the same
reasoning that keeps the one-tile auto-step ungated (`CLAUDE.md` D4) — never
gate the only way forward on a state that can fail to arrive.

## 3. Agents, and the process

`.claude/agents/` now holds the five roles `docs/BUILD_PLAN.md`'s roster
specified and never shipped: `cartographer`, `systems`, `ui`, `harness`,
`reviewer`. Each carries this repo's own non-negotiables, so a phase prompt is a
brief and an ownership block rather than a re-statement of the rules.

Agent definitions are read at session start. The session that wrote them had to
run Phase 17a as a general-purpose agent instructed to read its role file first;
from the next session on, the five are dispatchable by name.

`docs/BUILD_PLAN.md` §1's process rules apply unchanged. The two that bite
hardest here:

- **One phase = one commit per agent, and never two agents against overlapping
  files.** Subagents do not know about each other; the loser silently clobbers
  the winner.
- **The reviewer runs after every phase**, reading the phase brief plus
  `git diff`, and writes `docs/REVIEW-wave5-<phase>.md`. A FAIL verdict is
  fixed before the next phase starts, by the phase's own agent, against the
  review.

And the three standing sequencing rules in
`.claude/brain/phase-plan-conventions.md`: one `src/view/`-owning phase in
flight at a time; the additive phase lands before the phase that removes what it
replaced; verify at each step rather than stacking unverified changes.

## 4. Phase 17a — the audit (1 × `cartographer`, read-only)

**Why first.** Every later phase is sized against the punch list, and at least
one of its twenty items is already fixed: `view/ui/bar.js:58-74` closes FINDINGS
#13 by measuring `max(bar width, label width)` before placing the value text,
and its own comment says the overlap the finding reported was "never true here
— by measurement". An audit that strikes the already-done items is cheaper than
three phases discovering them one at a time.

**Brief.**
1. Re-verify all twenty items in `docs/PLAN-phase13.md` §5.2 against today's
   code. For each: still open / already fixed (with the `file:line` that fixed
   it) / closed as acknowledged. Do not infer from the plan documents.
2. Re-verify the two parked items in `docs/FINDINGS.md` (#13, #14) and Phase
   16b's parked item 3 the same way.
3. Verify this plan's own claims, each of which is a citation you can check:
   `talos_head`/`cyclops_maw` are granted by nothing; `run.t` is the fixed-step
   accumulator; `MIRROR_TO_BASE` is derived and not hand-listed;
   `view/fx.js#reset()` clears chips without reseeding `spark`; appending a
   non-packable substance row is safe while appending a tile-capable one throws.
4. Name anything in the punch list whose fix as specified in §1.1 above would
   contradict a decision already recorded in `ARCHITECTURE.md` §7 or
   `CLAUDE.md` §"Resolved decisions".

**File ownership.** `docs/AUDIT-wave5.md` (new). Nothing else.

**Acceptance.** The document gives a verdict per item with a `file:line`, and
names at least one item this plan has wrong or stale. (If it genuinely finds
none, it says so — but a twenty-item list written weeks ago with no drift would
itself be surprising.)

**LANDED — `docs/AUDIT-wave5.md`.** 6 of the 20 already fixed (13d's five
complete, #3 partial by design), 12 still open, 2 closed as acknowledged. It
found four things this plan had wrong, all folded in above and below: #7's
diagnosis (the grant tier is a no-op, not a depth annoyance), FINDINGS #13's
real subject, the fourth tab's width, and D17-D's assertion property. Its
citation corrections to the punch list itself (#4, #15, #17, #18 all cite stale
lines) are 17h's to carry into `docs/PLAN-phase13.md`.

## 5. Phase 17b — content: three rows per tier, and the grant roster (1 × `systems`)

**Brief.**

1. **Four substance rows, appended** (`data/substances.js`): two tagged
   `relic`, two tagged `miracle`. Appending is safe — the import-time guard in
   `data/forms.js:459` prices the highest *packable* ordinal, and a relic or
   miracle row is not packable, so `PACKABLE_MAX` does not move. Each needs an
   `item:{ mass, hud:{ order } }` and a `look` carrying the `halo` treatment
   every relic and miracle already carries (`tools/content.mjs` assertion 17
   enforces it).
2. **Two trinket rows** (`data/trinkets.js`), taking the tier to three. Every
   `mods` key must resolve through `data/tuning.js` — assertion 8 checks it,
   scope included. Prefer tunables with a visible consequence (`climb`,
   `pickPower`, `burden`, a scoped `segReach.hub`) over a second furnace-rate
   row, and at least one should have a real cost as well as a benefit, the way
   `data/boons.js#ares-frenzy` is a trap in one row.
3. **Two miracle rows** (`data/miracles.js`), taking the tier to three. One
   needs **no new code at all**: `rules/miracles.js#applyEffect` already grants
   `effect.boon` independently of `effect.kind`, so a pure-boon phial is a
   content row. The other adds **one** new `kind` branch, and it must use a
   tile-write verb that already exists (`model/tiles.js#write.set`/`#clear`) —
   the same argument that chose `collapse` over `petrify` in that file's header.
4. **Two grant rows** (`data/grants.js`), granting `talos_head` and
   `cyclops_maw` — machines that exist in three tables and are reachable by
   nothing (D17-D). Granting them also makes their recipes craftable, because
   `isKnown` gates a machine-build recipe on `canPlace`
   (`model/run.js:610-614`), so the grant unlocks the build rather than merely
   permitting the placement. That is the tier working as designed, and it is
   the first time it has.

5. **Delete `gift-kiln`** (§5.1, DECIDED). It is the only shipped `GRANTS` row
   and it grants a machine that cannot be placed at any depth, so the tier has
   never once done anything. The `kiln_divine` MACHINE row stays and becomes
   the reachability assertion's second named exemption; the grant tier ships
   at two rows, and that is deliberate, not a shortfall to pad.
6. **Mirrored granting** (D17-E): export a `mirrorOf(machineId)` query from
   `model/run.js`, where the derivation already lives, and have
   `rules/grants.js`'s `grant`/`award` grant the mirror alongside the base.
7. **`data/gods.js`** (new): one row per god id in use — `hephaestus`,
   `athena`, `poseidon`, `ares`, `hades` — with the display name
   `view/hud.js:489`'s `GOD_NAME` currently hardcodes for three of five. This is
   punch-list #17. `view/hud.js` is **not** yours; leave the constant where it
   is and Phase 17e moves its readers over.
8. **`data/drops.js`**: `tribute-bellows` fires at `chance:1` on the first
   completion, which is what makes cycle 4's trinket draft empty
   (punch-list #6). With three trinkets the draft is no longer a no-op; decide
   and record whether the drop should also stop being a certainty, and if you
   change the number, `docs/SPEC.md` owns it first.
9. **Two `tools/content.mjs` assertions.** Every `data/machines.js` row is
   reachable — sponsored (in `STARTING_MACHINES`, named by a `GRANTS` row,
   named by some cycle's `reward.grants`, or a mirror of one of those) **and**
   placeable (`machineHeldSub(id) !== undefined`), per D17-D's second
   paragraph, with `altar` exempted by name and reason. And every miracle's
   `effect.kind` is in a hardcoded closed set, the way assertions 10, 18 and 19
   hardcode their vocabularies.

### 5.1 The decision 17b cannot make for itself: what `kiln_divine` becomes

Its unplaceability is a *consequence* of a decision already recorded and still
sound: `data/substances.js:463-469` refuses it a substance because its
inherited build bill is bit-identical to `furnace`'s, so a hand recipe for it
would share `furnace`'s exact trigger and `rules/crafting.js#choose`'s
first-match rule would produce a furnace every time, for ever. What nobody
noticed is that this leaves the tier it belongs to with nothing that works.

**DECIDED: retire `gift-kiln`.** The rejected alternative was making a granted
variant upgrade its base's placement (one furnace rig places a divine kiln once
the kiln is granted), which needed no new content but made a grant silently
change what an existing verb does. The tier is instead the two machines that
already exist and are reachable by nothing: `talos_head` and `cyclops_maw`.

Two consequences, both of which 17b must handle explicitly rather than
discover:

**The `kiln_divine` machine row stays, and becomes D17-D's second exemption.**
Deleting the row is the only way to satisfy the reachability assertion
otherwise, and its blast radius is far wider than this wave is chartered for:
`rate.kiln_divine` is `CLAUDE.md`'s own canonical example of a scoped tunable
key, `data/machines.js:73` names it as the worked example for `variantOf`,
`docs/DEVELOPER_GUIDE.md#variants-are-nearly-free` documents it, and
`shell/notify.js:13-15` cites it for the per-machine sound override. So the
exemption list is `altar` (never obtainable, by design) and `kiln_divine` (a
live worked example with no sponsor), each with its reason written at the
exemption site — not a bare id list. An exemption whose reason is "we kept dead
content as documentation" is defensible only while it is written down, and 17h
records the same fact in `docs/SPEC.md` so the next reader does not re-discover
it as a bug.

**The grant tier ships at two rows, not three, and the plan says so.**
Punch-list #5 is therefore fully closed for boons (5), trinkets (3) and
miracles (3), and *narrowed* for grants (1 → 2). A third grant needs a machine
that does not exist, which is content-wave work and not closeout work. The
draft offers two-of-two for that tier, honestly and with no padding — D17-F
already requires that an offer never invent an option it does not have. 17h
parks "a third machine-grant" in `FUTURE_IDEAS.md` with this reasoning.

**File ownership.** `src/data/substances.js`, `src/data/trinkets.js`,
`src/data/miracles.js`, `src/data/grants.js`, `src/data/drops.js`,
`src/data/gods.js` (new), `src/data/tuning.js` (only if a new row needs one),
`src/model/run.js` (the `mirrorOf` export only), `src/rules/grants.js`,
`src/rules/miracles.js` (the one new `kind` branch only), `tools/content.mjs`,
`docs/SPEC.md`, `docs/FINDINGS.md`.

**Acceptance.** With `flags.showDebug` on, the four draft debug keys each hand
over three *different* rows across three presses, and every one of the three
machine grants can actually be placed in a run that has taken it —
`kiln_divine` included, which has never been true. `npm run check` reports the
two new content assertions passing. Then revert §5.1's fix locally, confirm the
reachability assertion goes **red** on `kiln_divine`, and restore it: this
assertion exists precisely because its weaker form would have stayed green over
the bug that motivated it.

## 6. Phase 17c — the draft modal, the pause and the reroll (serial)

Depends on 17b: a 1-of-3 modal cannot be built, let alone screenshotted,
against tiers that hold one row.

**SPLIT INTO 17c1 AND 17c2, mid-wave, under
`.claude/brain/phase-plan-conventions.md` rule 3.** As written this phase
bundled a `RUN_SCHEMA` change, a new `rules` module, the shell dispatch and a
pause guard together with a new canvas modal — a headless-verifiable half and a
pixel half in one commit, which is the shape 12c/12c2 was split for. The
storage and wiring half lands and goes green on `npm run check` alone before
any pixel is drawn on top of it, so a broken offer is caught before view code
makes the diff harder to bisect.

- **17c1 (`systems`)** — `run.offer` grows to `{ tier, ids }` in `RUN_SCHEMA`;
  `rules/draft.js` (new, event-driven, NOT in `shell/schedule.js`) owns the
  3-of-N selection through `rand()`, the reroll price and the favour spend;
  `shell/main.js`'s four `draftable()[0]` branches collapse to one path that
  raises an offer; the pause (D17-A) is one predicate over `ui.stack`
  consulted by both `step()` and `applyIntents()`; `__mf` projects the live
  offer. **No `src/view/` file is touched**, so with no modal drawn yet the
  offer is raised, inspectable through the test hook, and takeable only by a
  test — which is precisely what makes it verifiable in isolation.
  Ownership: `src/rules/draft.js` (new), `src/model/run.js`,
  `src/shell/main.js`, `src/shell/ui.js`, `src/shell/input.js`,
  `src/data/tuning.js`, `docs/SPEC.md`, `docs/FINDINGS.md`.
- **17c2 (`ui`)** — `view/ui/draft.js`, the cards, the deltas, the REROLL row
  and its dimmed-when-unaffordable state. Ownership: `src/view/ui/draft.js`
  (new), `src/view/hud.js` (the one call that draws it), `src/shell/main.js`
  (the hit-test branch ONLY), `docs/SPEC.md`.

  **`shell/main.js` was added to this block after 17c1 landed**, on its own
  parked finding: `applyUiIntents()` is deliberately unreachable while the
  modal stands (the pause guard returns above it), so a drawn card would have
  nothing to click. The intents and the dispatch already exist —
  `applyDraftIntents()` runs above the guard and takes a card or rerolls — so
  this is a second CALLER for them from a pointer hit-test against
  `view/ui/state.js#drawn`, not a second dispatch path. If it turns into a
  second path, that is a defect and the reviewer should say so.

Their combined brief is the numbered list below; items 1, 2, 3 and 5 are 17c1's
and item 4 is 17c2's.

**Brief.**

1. **`run.offer` grows to `{ tier, ids }`** (D17-F), declared in `RUN_SCHEMA`
   so `newRun()` resets it, with `write.offer` still the one setter.
2. **`rules/draft.js`** (new, event-driven, not in `shell/schedule.js`):
   `offer(tier, candidateIds)` picks up to three through `rand()` and writes
   `run.offer`; `reroll(god)` prices the reroll at `eff('rerollCost')`, refuses
   through a `'refused'` journal row when the god's favour is short, and
   otherwise spends it and re-picks. Fewer than three candidates offers fewer
   than three — honestly, never a padded or a silently empty offer.
3. **`shell/main.js`**: the four `draftable()[0]` branches become one path —
   gather that tier's candidates, call `rules/draft.js#offer`, push `'draft'`
   onto `ui.stack`. A card click dispatches to the tier's own `grant()` and
   clears the offer. The pause (D17-A) is one predicate over `ui.stack`,
   consulted by both `step()` and `applyIntents()` beside the existing
   `flags.showMap` and `run.won` guards, and stated once.
4. **`view/ui/draft.js`** (new): the modal. Three cards, each naming the god
   (through `data/gods.js`), the row's `name` and `text`, and — for a trinket or
   a boon — its `mods` resolved the way `mainPanel.js#trinketDeltaLines` already
   resolves them through `model/mods.js#explain`. A REROLL row showing the
   price, dimmed and refusing when unaffordable. Every rectangle recorded into
   `view/ui/state.js#drawn`; every position measured (D8); legible at the 200 px
   floor.
5. **`shell/input.js`**: keys 1/2/3 pick a card, Escape does **not** dismiss the
   offer — an un-taken gift must not be losable by a keypress. Extend
   `__mf.ui`'s projection with the open offer so a test can read it back.

**File ownership.** `src/view/ui/draft.js` (new), `src/shell/ui.js`,
`src/shell/main.js`, `src/shell/input.js`, `src/rules/draft.js` (new),
`src/model/run.js`, `src/data/tuning.js`, `docs/SPEC.md` §18.6.

**Acceptance.** Play cycle 1 to completion on a fixed seed: the modal raises,
the world is visibly frozen behind it (a falling item does not move), three
distinct grants are offered, a reroll costs the price and changes the offer, and
the same seed with the same key sequence produces the identical offer twice.

## 6a. Phase 17i — the quickbar is eight cells, and pickups fill it first

**Added mid-wave at the user's request.** Its letter is later than its position
because renumbering a document other agents have already read is worse than an
out-of-order letter. It runs after 17c2 and before 17d: both it and 17c2 move
pixels, and Rule 1 does not care that one of them is "only" a tunable.

**What changes.** Two things, in one commit, so the quickbar's baselines move
exactly once:

1. `data/tuning.js#quickbarSlots` 10 → 8. `docs/SPEC.md` owns the number first.
2. `model/run.js#write.collect` allocates into the quickbar's range
   (`run.inv[run.mainSlots ..]`) **before** the main grid, instead of never.

**This reverses a deliberate Phase 12 decision, and the reversal is the
request.** `write.collect`'s own header (`model/run.js:269-272`) currently
states the opposite as a design rule — "the quickbar's own tail is populated
only by a deliberate drag, never by a pickup" — which made the quickbar a
curated strip the player arranges. Filling it first is the Minecraft
convention and has the consequence that mined rubble lands in the hotbar
rather than in the bag. That is the accepted trade; **rewrite that header to
say the new rule and why, rather than leaving it contradicting the code.** A
comment that still argues for the behaviour you just removed is worse than no
comment.

Merge-first is unaffected and must stay: the whole array is searched for an
existing stack of the exact pair before any slot is allocated, so no two slots
can hold the same pair and `invCount` stays a single lookup.

**Blast radius, all of it inside this phase:**

- `view/ui/quickbar.js#DIGITS` is the literal `'1234567890'` and
  `slotForDigit` indexes into it, so keys `9` and `0` will address slots 8 and
  9 that no longer exist. Today's guard (`if (slot && slot.sub != null)`)
  makes that a silent no-op rather than a crash, which is the worst of both:
  bound the mapping to the real cell count, derived as
  `run.inv.length - run.mainSlots` (no `data/tuning.js` import — `view` may
  not, and does not need to).
- Total capacity falls from 40 slots to 38. `write.collect` already returns
  `false` when there is no stack and no free slot, and `rules/items.js#step`
  already handles that refusal — confirm both still hold at the new size.
- `tests/visual.spec.js#putInQuickbar` collects and then moves, on the premise
  that a pickup lands in a main slot. That premise is what this phase deletes.
  Fix the helper rather than each of its callers.
- Every quickbar baseline moves, deliberately: eight cells instead of ten, and
  scenes whose pickups now land in the strip. Re-accept them with
  `npm run test:visual:update` and say in the commit why the pixels moved.

**Agent:** `systems`, with the harness and baselines in the same block because
the behaviour and its evidence cannot be split here.

**File ownership.** `src/data/tuning.js`, `src/model/run.js`,
`src/view/ui/quickbar.js` (the digit mapping only), `tools/check.mjs`,
`tests/visual.spec.js`, `tests/visual.spec.js-snapshots/`, `docs/SPEC.md`,
`docs/FINDINGS.md`.

**Acceptance.** Mine with an empty inventory and watch the first eight distinct
pairs land in the quickbar, left to right, before slot 0 of the bag takes
anything; the ninth lands in the bag. Press `9` and `0` and confirm nothing
arms and nothing throws. A full 38-slot inventory still refuses a pickup
through the existing path rather than dropping it silently.

---

## 6b. Phase 17j — an ALL category in the crafting tab

Added mid-wave at the user's request, and runs after 17i because both move
panel pixels. Its letter is later than its position for the reason 17i's is.

**What it does.** `view/ui/mainPanel.js#CATEGORY_TABS` gains an `all` entry
that filters nothing, so the crafting grid can show every known recipe at
once. `categoryOf` is unchanged — the new tab bypasses it rather than adding
a sixth category to it, because "all" is the absence of a filter and not a
kind of thing a recipe can be.

Put `ALL` first and make it the default. `activeTab` already falls back to
`tabs[0]` when nothing is stored, so opening CRAFTING for the first time
would then show everything rather than only RAW, which is the more useful
first frame and costs nothing.

**The row does not fit at the phone floor, and the overflow is silent.**
Measured through `core/font.js#textWidth`, tab width is `textWidth(label) + 6`:

| RAW | REFINED | TOOLS | PLACE | DIVINE | total | with ALL |
|---|---|---|---|---|---|---|
| 23 | 47 | 35 | 35 | 41 | **181** | **204** |

The crafting body is 232 px wide at the desktop buffer and **188 px** at the
200 px floor (`drawMainPanel`'s `w = min(vw - 8, 236)`, less 4). So 204 fits
the desktop and overflows the floor by 16 px, and `view/ui/tabs.js:37` drops
a tab that would bleed past rather than truncating it — the category simply
vanishes with nothing to say it has. This is the same trap that killed the
fourth Character tab in 17e, caught the same way, and it must not be shipped
by putting `ALL` first and letting `DIVINE` fall off the end instead.

Three ways to fix it. Pick one and say why in the commit.

1. **Wrap the tab row.** Teach `drawTabs` to flow onto a second line when the
   next tab would exceed `maxRight`, returning the real height so callers
   anchor below it. Generic, fixes every future tab row, and the drop
   behaviour stays as the last resort when even one tab cannot fit. Costs a
   `view/ui/tabs.js` change that four other callers inherit, so it needs
   their baselines checked.
2. **Shorten a label.** `REFINED` at 47 px is the widest and the easiest to
   cut. Cheapest, and the least honest — it fixes this row and leaves the
   next one to rediscover the limit.
3. **Scroll the row horizontally.** Rejected before it is tried: a tab you
   cannot see is no better than a tab that was dropped, and this UI has no
   scroll affordance a player would find.

Option 1 is the recommendation. Whichever is chosen, the acceptance is the
same and it is a measurement, not an eyeball.

**Acceptance.** At the 200 px floor, every one of the six categories is
reachable, and a test asserts it by counting the tab rects `drawTabs`
recorded rather than by looking at a screenshot. ALL shows every recipe the
five categories show between them, with no recipe appearing twice and none
missing — assert that as set equality against `RECIPES`, filtered by
`isKnown`, so a future category that stops covering something fails here.

**File ownership.** `src/view/ui/mainPanel.js`, `src/view/ui/tabs.js` (only
if option 1), `tests/visual.spec.js`, `tests/visual.spec.js-snapshots/`,
`docs/SPEC.md`, `docs/FINDINGS.md`.

---

## 6c. Phase 17g1 — the visual suite is not bit-exact, and that must be settled first

**Promoted ahead of every remaining phase after 17i's review.** It was the
back half of 17g. It runs now, alone, because every phase left in the wave
re-accepts baselines, and a re-accepted baseline that carries session drift is
indistinguishable from a re-accepted regression.

**The evidence, and it is no longer one rare event.** Four scenes have now
moved with no source change to explain them:

| scene | drift | found by |
|---|---|---|
| `winch-lit` / `winch-unlit` | ~164 px, once under full parallelism | FINDINGS #14, Phase 9 |
| `hollow-relic-unlit` | 100 px in a relic halo | 17i |
| `ui-character` | 12 px outside the quickbar zone | 17i review |
| `ui-character-swap` | 12 px | 17i review |
| `ui-crafting` | 36 px | 17i review |

17i's reviewer established that the movement is not the phase's by recording
the scene's whole canvas op stream under current code in both the old and new
inventory states and diffing: all 42 differing ops are `fillRect` inside the
quickbar strip, and no world-layer op differs. So the world-layer pixels moved
between sessions, not between commits. **That method is the phase's starting
point** — an op-stream diff localises a drift to the draw call that made it,
which a pixel diff cannot.

**What is already ruled out, by inspection, and must not be re-tested.**
`view/fx.js#spark` is a module-scope generator that `reset()` never rewinds,
but Playwright gives each test a fresh page, so it starts at the same offset
every time (17a). Do not spend a run on it.

**Live hypotheses, in the order they are worth testing.**

1. A late `resize` landing between the last `draw()` and the screenshot. Under
   `?test=1` there is no RAF loop to repaint, so a viewport that settles after
   the final draw leaves a stale canvas scaled to a new CSS size.
2. Font or image decode timing — anything the renderer reads that is not ready
   on the first frame and is ready later.
3. State surviving between tests inside one worker process, as distinct from
   one page: module scope is per page, but the Playwright worker is reused.
4. A genuine `rand()` draw in a draw path that only fires in some states. The
   render-purity probe in `npm run check` asserts this over the default scene
   only, so a draw path that no headless probe reaches is not covered — and
   `view/ui/draft.js` is exactly such a path today.

**The deliverable is a diagnosis, not a green suite.** If it reproduces, name
the draw call and the cause. If it does not reproduce in a stated number of
full parallel runs, say so plainly and say what that rules out. Do not raise
`maxDiffPixels`, do not re-accept a drifting baseline to make a run pass, and
do not close this by re-running until green. A non-reproduction honestly
reported is a real result; a suppressed symptom is not.

**One cleanup is in scope regardless of the outcome**, because three drifting
images were re-accepted in `c803360` and are now the reference: re-derive
`hollow-relic-unlit`, `ui-character`, `ui-character-swap` and `ui-crafting`
from a known-clean run, and say which of them changed again on the way.

**File ownership.** `tools/check.mjs`, `tests/visual.spec.js`,
`tests/visual.spec.js-snapshots/`, `playwright.config.js`, `package.json`
scripts, `docs/FINDINGS.md`. **`src/` is out of bounds** — if the cause is in
`src/`, report it and the owning phase fixes it.

**Acceptance.** A written diagnosis in `docs/FINDINGS.md` naming either the
cause or the evidence against each hypothesis, and four re-derived baselines.

---

## 7. Phase 17d — the rolling-window rate demand (1 × `systems`, serial)

**Brief.**

1. **`docs/SPEC.md` first** (§4's not-implemented paragraph, §18.4's table, and
   a new §18.x defining the clause), then `data/cycles.js`: a `rate:{ sub, form,
   n, secs }` key on the cycle that should ask for a line rather than a pile.
2. **`model/run.js`**: the credit ledger on `run.tribute`, pruned on write;
   `rateMet()` as a query; `tributeMet()` gains the second clause. `run.tribute`
   is still replaced whole and never patched in place.
3. **`rules/cycles.js#creditTribute`**: stamp each credit with `run.t`.
4. Deliberate allocation note required: hand-feeding credits one unit per
   substep, so say in a comment why the ledger is rebuilt per credit and what
   bounds it.

**File ownership.** `src/data/cycles.js`, `src/model/run.js`,
`src/rules/cycles.js`, `src/data/tuning.js`, `docs/SPEC.md`,
`docs/FINDINGS.md`. **Not** `src/view/` — Phase 17e draws it.

**Acceptance.** Feed the rated pair slowly enough to fall outside the window
and the trial does not pay however many units have been delivered in total;
feed it fast enough and it pays. Both at 30 fps and at 144 fps, through the real
`main.step()`.

## 8. Phase 17e — the rate row and the HUD closeout (1 × `ui`, serial)

**Brief.**

1. **The batch row** in `view/hud.js#tribute`, showing progress against the
   window in the same measured-bar language every other demand row uses.
   Clamp it at `batch.n` — `batchHave()` saturates near that value and would
   under-report a raw "X delivered" readout, which its own doc now says.

   **The aggregate lies today.** `view/hud.js:305-309` draws `100%` on an
   unpaid cycle 4, because it reads the demand rows and knows nothing about
   the second clause. 17d shipped that knowingly and recorded it; fixing it
   is this phase's, and a panel that reads 100% while the trial refuses to
   pay is worse than one that reads 80%.
2. **#11**: `run.misses` visible during the run, in the TRIBUTE column, drawn
   only once it is non-zero, and legible as "one more ends this".
3. **#15**: the deadline gets the urgency treatment the boon stack already has
   under 5 s (`view/hud.js:388`) — reuse that rule rather than inventing a
   second one, with the threshold as a tuning row.
4. **#16**: the death screen reaches parity with `winScreen`'s own lines
   (cycle reached, favour, misses) through the shared `endScreen`, not a second
   copy.
5. **#17**: `view/hud.js`'s `GOD_NAME` and `view/ui/draft.js` both read
   `data/gods.js`; the hardcoded three-entry constant goes.
6. **FINDINGS 16b.3**: the Character tab's clipped block gets a **scroll
   region**, not a fourth tab. 17a measured the fourth tab and it does not fit:
   `CHARACTER`/`CRAFTING`/`LOGISTICS` cost 59 + 53 + 59 = 171 px through
   `core/font.js#textWidth`, and `STATS` costs 35 more against the phone
   floor's 188 px of content width — `view/ui/tabs.js:37` would silently *drop*
   the new tab rather than truncate it, so the feature would simply be absent
   at the floor with nothing to show it had gone. `view/ui/grid.js` already
   scrolls and `shell/ui.js#scrollBy` already keys an offset per `panel:grid`;
   extend that to the stat block rather than inventing a second scroll
   mechanism.
7. **`view/fx.js#reset()`** reseeds the chip stream. `spark` is a module-scope
   generator seeded once from a constant (`view/fx.js:25`) and `reset()` clears
   the chips without rewinding it, so chip positions depend on how many chips
   the page has ever emitted rather than on the run's seed. Cheap to close, and
   a plausible contributor to FINDINGS #14 (17g owns the investigation).

**File ownership.** `src/view/hud.js`, `src/view/ui/mainPanel.js`,
`src/view/fx.js`, `src/data/tuning.js`, `docs/SPEC.md`, `docs/FINDINGS.md`.

**Acceptance.** All four stat rows visible at the desktop buffer and at the
200 px floor; a rated demand reads correctly as its window fills and empties;
the death and win screens carry the same three facts.

## 9. Phase 17f — the altar rises (1 × `systems`, serial, highest risk)

**Brief.** D17-G: `rules/cycles.js#ensureAltarPlaced` gates on the
climbed-back-up tutorial beat or `altarGraceSecs`, whichever first, and the
arrival gets a presentation derived from `clock.t` and the machine's own
position — never `rand()` in a draw path.

**The risk, stated up front.** `tools/check.mjs` and several
`tests/visual.spec.js` scenes assume an altar exists near spawn from frame 0,
and cycle 1 is unpayable without it. This phase therefore owns its own harness
updates, and its fallback is explicit: **if the beat gate cannot be made safe
in one phase, land the presentation alone against frame-0 placement and park the
gate in `docs/FINDINGS.md`.** A soft-locked first trial is worse than an
unannounced altar, and `CLAUDE.md`'s auto-step history is the precedent for
refusing to gate the only way forward.

**File ownership.** `src/rules/cycles.js`, `src/view/scene.js` **or**
`src/view/fx.js` (one of the two, named in the commit — not both),
`src/data/tuning.js`, `tools/check.mjs`, `tests/visual.spec.js`,
`docs/SPEC.md` §5, `docs/FINDINGS.md`.

**Acceptance.** A fresh run reaches the altar-rises beat and the altar arrives
with its presentation; a run that never digs still gets an altar within
`altarGraceSecs` and can pay cycle 1; `npm run check` and the full visual suite
both pass.

## 10. Phase 17g — harness (1 × `harness`, after 17f)

**Brief.**

1. **New `tools/check.mjs` sections**, each driven through the real
   `main.step()`: the draft offer (three distinct ids, seeded and reproducible,
   the pause actually freezing a substep, a reroll spending exactly the price
   and refusing when short); the rate clause at 8 framerates; the altar timing
   both ways.
2. **New baselines**: the draft modal (and a not-vacuous probe proving the
   world is frozen behind it), the fourth tab, a rated demand row, the altar's
   arrival. No hardcoded click coordinates — drive through `__mf.ui()`.
3. **FINDINGS #14, the flake.** Run the full suite at default parallelism
   repeatedly and report honestly: reproduced, with a diagnosis; or not
   reproduced in N runs, with what has been ruled out and what evidence would
   settle it. **The chip stream is already ruled out by inspection and must not
   be re-tested** — 17a established that Playwright gives each test a fresh
   page, so `view/fx.js#spark` starts at the same offset in every test and
   every burst sequence is deterministic; record that as eliminated rather than
   spending a run on it. The live hypothesis inspection has *not* eliminated is
   a late `resize` landing between the last `draw()` and the screenshot, which
   under `?test=1` has no RAF loop to repaint it. Do not raise
   `maxDiffPixels`, and do not close the item by re-running until green.

4. **Audit 17e's five unaudited assertions** — the honest-at-every-stage test,
   the miss tally, the urgency flash, the death-screen tally, and the
   chip-stream rewind (`docs/REVIEW-wave5-17e.md` §5). For each, perturb the
   source and quote the red. This wave has shipped three assertions that could
   not fail: 17c2's four bounds checks, defeated by `drawPanel` clamping before
   recording, and 17g1's own purity test, which passed with an injected
   `rand()`. A green suite is not evidence that a test can go red.
5. **`tribute-cycle1-armed` shows the first trial armed with no altar**
   (`docs/REVIEW-wave5-17f1.md` D2). The scene sets `run.tutorialBeat` and
   draws without stepping (`tests/visual.spec.js:4811`), so the director never
   gets a frame. One `__mf.frames(1)` after the beat jump brings the altar
   back. Five other `tribute-*` scenes share the shape; fix the ones whose
   subject needs an altar behind it and leave the rest.

**File ownership.** `tools/check.mjs`, `tests/visual.spec.js`,
`tests/visual.spec.js-snapshots/`, `package.json` scripts, `docs/FINDINGS.md`.

**Acceptance.** `npm run test` green, and every new assertion has a
one-sentence description of what would make it red **plus the red output a
perturbation actually produced**.

## 11. Phase 17h — docs closeout (1 × `cartographer`)

**Brief.** Bring every binding document into line with what the wave landed,
and close the list this plan opened.

- `docs/SPEC.md`: §4 (throughput now exists), §18.4 (the table), §18.6 (the
  draft is 1-of-3), §20, §5 (the altar beat), and the reroll's price.
- `docs/DESIGN.md`: lines 128, 179 and 219 on the draft; the favour sink; and
  each remaining promise marked not-implemented rather than deleted.
- `docs/FINDINGS.md`: #13 closed with the `file:line` that closed it, #14 with
  17g's verdict, Phase 16b's item 3 closed.
- `docs/BUILD_PLAN.md`: a wave-5 status block in the shape waves 3 and 4 have.
- `docs/PLAN-phase17-drafts.md`: becomes the record of what shipped, or is
  retired into this document with a pointer — not left reading "Status:
  unbuilt" after it is built.
- `FUTURE_IDEAS.md`: cycles 5–6 and the essence/ambrosia tiers;
  meta-progression with the no-storage constraint stated; stolen recipes.
- `docs/DEVELOPER_GUIDE.md`: the draft modal, the rate demand, and the three
  module sections `.claude/notes/cleanup-progress.md` records as never written
  (`rules/cycles.js`, `rules/growth.js`, `rules/tutorial.js`).
- **The empty DIVINE tab, whose recorded cause is wrong.** `docs/FINDINGS.md`
  says no relic is craftable. The real cause is clause ordering in
  `view/ui/mainPanel.js#categoryOf`: `sub.item?.tool` is tested at `:459`
  before the relic tag at `:460`, and `data/recipes.js#auger` — the one recipe
  in all 19 whose output carries `tags:['relic']` — also carries `item.tool`,
  so it lands in TOOLS and DIVINE holds nothing. `docs/SPEC.md:2727` inherits
  the same wrong cause. Correct both; do not reorder the clauses, which would
  only empty TOOLS instead. `docs/REVIEW-wave5-17j.md` §D2 has the full
  reasoning, and its `file:line` citations predate the 17j commit that moved
  them.
- **DONE, by the coordinator, ahead of this phase.** The four live comments
  citing the deleted `view/hud.js#pocketHits` (`view/ui/grid.js`, `panel.js`,
  `state.js` twice) and `CLAUDE.md` D2's copy of the same reference now name
  `view/ui/state.js#drawn` or drop the citation. `docs/DEVELOPER_GUIDE.md:1143`
  needed no change — it already records the retirement. Nothing left to do
  here; the item stays listed so the closeout reads complete.

**Acceptance.** No document in the repo still describes an open item this wave
closed, and no closed item is described as open.

## 12. Sequencing

```
17a  audit           cartographer   read-only, first, gates the rest
17b  content         systems        data/ + two rules touches
17c  draft modal     ui + shell     needs 17b's content
17i  quickbar        systems        8 cells + fill order; moves baselines
17g1 the drift      harness        PROMOTED: 4 scenes move with no source change
17j  crafting ALL    ui             a sixth tab; the row needs to fit at 200 px
17d  rate demand     systems        model/rules only, no view
17e  HUD closeout    ui             needs 17d's query to draw
17f  altar rises     systems        highest risk, owns its own harness
17g  harness         harness        after every behaviour it asserts exists
17h  docs            cartographer   last, records what actually shipped
```

**Strictly serial, and the reason is Rule 1.** 17c, 17e and 17f all put pixels
on screen; two of them concurrently would fight over the same baselines, and
whichever landed second would either duplicate the other's pass or silently
revert it. 17b and 17d both touch `src/model/run.js`, so they do not overlap
either. The only genuine parallel opportunity in the wave is 17a against
nothing, and it is read-only.

**The reviewer runs after each phase**, on the phase brief plus `git diff`, into
`docs/REVIEW-wave5-<phase>.md`. A FAIL is fixed by that phase's own agent
against the review before the next phase starts.

## 13. Risk register

| # | risk | mitigation |
|---|---|---|
| 1 | The altar gate soft-locks cycle 1 | D17-G's timeout, and 17f's stated fallback to presentation-only |
| 2 | The draft pause diverges from the map/win guards | D17-A: one predicate, consulted by both entry points, never a second string test |
| 3 | A new substance row throws at import | Only non-packable rows are appended (17b); `data/forms.js:459` is the guard and `docs/SPEC.md` §15 the reasoning |
| 4 | The rate ledger grows without bound, or reads wall-clock time | Pruned on write; `run.t` only; asserted at 8 framerates in 17g |
| 5 | 17c's `rand()` draws break seed compatibility with existing baselines | The draw happens only when an offer is raised, which no existing scene reaches; 17g re-runs the determinism probe regardless |
| 6 | A fourth tab does not fit the 200 px floor | Measured in 17e before committing; the fallback is a scroll region in the existing tab |
| 7 | FINDINGS #14 does not reproduce | 17g reports a non-reproduction as a non-reproduction; the chip-stream reseed lands on its own merits either way, and is already eliminated as a hypothesis |
| 8 | §5.1 option B makes a grant change what placing a held furnace does, silently | The BUILD ghost, the placement and the deconstruct refund all resolve through `machineIdFor`/`machineHeldSub`; 17b verifies all three agree, and `docs/SPEC.md` §18.6 states the upgrade semantics before the code lands |
| 9 | A granted-variant upgrade removes the player's ability to place the *base* machine | Decide it deliberately in 17b and write it down: a divine kiln is strictly better than a furnace, so losing the choice costs nothing today — but it would matter for a future variant that is a sidegrade, and that is the sentence SPEC needs to carry |

## 14. What "done" means for the wave

`npm run test` green (check + build + the full visual suite); `npm run lint`
clean; `npm run parity` green; every phase carrying a reviewer verdict of PASS
or PASS WITH FINDINGS, with the findings either fixed or parked in
`docs/FINDINGS.md`; and no document describing an open item that this wave
closed. At that point the repo is a still target and the general code review
can start.
