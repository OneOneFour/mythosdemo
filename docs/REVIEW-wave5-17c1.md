# Review — Phase 17c1 (the offer, the pause and the reroll; headless half)

Commit `f343c86`. Spec: `docs/PLAN-wave5-closeout.md` §2 (D17-A, D17-B, D17-F)
and §6, items 1, 2, 3 and 5 of the numbered brief.

## 1. Verdict

**PASS WITH FINDINGS**

The wiring is right, the layer direction is clean and the pause is stated once,
but the reroll it ships cannot change the offer on two of the three drafts a
run contains, cycle 4's draft is still silently discardable by the `run.won`
guard it sits under, and `offerGod()` reports a god for debug-key drafts that
the code, the SPEC and `__mf` all claim it reports `null` for.

## 2. Brief coverage

| # | brief line | state | where |
|---|---|---|---|
| 1 | `run.offer` grows to `{ tier, ids }` in `RUN_SCHEMA`, `newRun()` resets it | done | `src/model/run.js:121-138`; reset via the frozen template at `src/model/run.js:207`; probed by `tools/check.mjs:922` |
| 1 | `write.offer` still the one setter | done | `src/model/run.js:336`; no other writer of `run.offer` exists in `src/` (grepped) |
| 2 | `rules/draft.js` new, event-driven, not in `shell/schedule.js` | done | `src/rules/draft.js:1-68`; absent from `src/shell/schedule.js`; called at `src/shell/main.js:377`, `:426` |
| 2 | `offer()` picks up to three through `rand()` | done | `src/rules/draft.js:30-36, 45-54` |
| 2 | `reroll()` prices at `eff('rerollCost')`, refuses with a `'refused'` row, otherwise spends and re-picks | done, degenerate | `src/rules/draft.js:62-68` — see defect D1: the re-pick is content-identical on the grant and trinket tiers |
| 2 | fewer than three candidates offers fewer, never padded, never silently empty | done | `src/rules/draft.js:32` (clamped to `pool.length`), `:47-51` (empty refuses out loud) |
| 3 | the four `draftable()[0]` branches become one path | done | `src/shell/main.js:375`, `:388-400` |
| 3 | a taken card dispatches to the tier's `grant()` and clears the offer | done | `src/shell/main.js:415-422` |
| 3 | the pause is one predicate over `ui.stack`, consulted by `step()` and `applyIntents()`, stated once | done | `src/shell/ui.js:202-203`; `src/shell/main.js:105`, `:214` |
| 4 | `view/ui/draft.js`, the modal | correctly absent | 17c2's; no `src/view/` file touched |
| 5 | 1/2/3 pick a card; Escape does not dismiss | done, with a hole | `src/shell/input.js:353-359` — see defect D4 (the search-focus branch pre-empts it) |
| 5 | `__mf.ui` projects the open offer | done | `src/shell/main.js:904-911` |

Acceptance criterion (§6) is the combined 17c/17c2 one and cannot be met
headlessly in full. Of the four halves that *are* headless — three distinct
cards, a frozen world, a reroll that changes the offer, the same seed twice —
**none has an automated probe** (see V3).

## 3. Out of scope

- `tests/visual.spec.js:1847-1869` — outside the ownership block, recorded in
  `docs/FINDINGS.md`. **Harmless, and the right call.** The old assertion
  (`BOONS[0]` goes live after pressing `b`) is false the moment `b` raises an
  offer instead of granting, so the alternative really was a red suite. The
  edit preserves the subject (a granted boon activates, then expires back to
  the base `eff`) and in fact strengthens it: the baseline is now read through
  `__mf.ui.offer.ids[0]`, so the test throws if the offer is not raised, and it
  presses `1`, so it goes red if the take path stops granting. It does not test
  offer size or distinctness, and does not claim to.
- `docs/SPEC.md` §18.4 table and §18.5 prose — the ownership block names
  `docs/SPEC.md` §18.6, and these are the two other places that asserted
  "1-of-1 today". Harmless; a stale SPEC is corrected in the same commit by
  house rule.
- `src/shell/input.js:91` adds `takeCard`/`reroll` to `wants` — implied by
  brief item 5. In scope.

Nothing else was touched. No `src/view/` file, no baseline, no `tools/`.

## 4. Defects

### D1 — MAJOR. A reroll cannot change the offer on two of three drafts.
`src/rules/draft.js:62-68`, `src/shell/main.js:426`.

`candidatesFor()` returns the tier's whole `draftable()` list, which still
contains the ids currently on offer (nothing has been granted). The shipped
tier sizes are grants 2, trinkets 3, boons 5 (`src/data/grants.js`,
`src/data/trinkets.js`, `src/data/boons.js`; `docs/SPEC.md` §14) against
`offerSize` 3:

- **cycle 2, `grant`**: 2 candidates, 2 cards. Every reroll returns the same
  two ids, possibly transposed. 2 favour for a shuffle.
- **cycle 3, `boon`**: 3 of 5. This one works.
- **cycle 4, `trinket`**: 3 of 3 — or 2 of 2, since `data/drops.js`'s
  `tribute-bellows` fires at `chance:1` on cycle 1 and `draftable()`
  (`src/rules/trinkets.js:39`) filters on `invCount`. Either way the contents
  cannot change.

Inputs that break it: complete cycle 2 with ≥2 favour and press `r`. The favour
is spent (`src/rules/draft.js:65`), `pick()` redraws, and the player sees the
same cards. D17-B's "a god you have pleased will look again" and §6's
acceptance "a reroll costs the price and changes the offer" both fail. `pick()`
is not at fault; the missing statement is that a reroll is only purchasable
when `candidates > offerSize` (or that the standing ids are excluded from the
re-pick pool, which would need a `min(offerSize, candidates − 1)` rule of its
own). `docs/SPEC.md` §18.8 asserts the price "buys exactly one second look per
trial" without noticing that two of the three second looks are the first look.

### D2 — MAJOR. Cycle 4's draft is discarded whenever `run.won` lands first.
`src/shell/main.js:207` (the `run.won` return) vs `:213` (`applyDraftIntents`)
and `:377` (`raiseOffer`).

`rules/cycles.js#complete` writes `rw.offer('trinket')`, `rw.tribute(null)` and
`rw.cycle(5)` in one call (`src/rules/cycles.js:240-244`). If any substep
remains in that frame, `ensureLiveCycle` sees `run.cycle > CYCLES.length` and
sets `run.won` (`src/rules/cycles.js:88-93`). `applyIntents()` then returns at
`:207`, above both `applyDraftIntents()` and `raiseOffer()`, so the offer is
never laid out: `run.offer` stays `{ tier:'trinket', ids:null }` for ever, the
modal never opens, the trinket tier is never drafted and `__mf.ui.offer` reads
`null` (so a test cannot see it either).

Reproduction: play to cycle 4 completion at 60 fps (2 substeps/frame) and the
loss is decided by substep parity — the draft survives only when `complete()`
lands on the frame's last substep. At 30 fps (4 substeps) it survives one time
in four. When it *does* survive, the behaviour is correct and desirable: the
pause holds the win screen until the card is taken.

This is pre-existing in shape (the old `draftable()[0]` branches sat under the
same guard), but this phase owned `shell/main.js`, restructured exactly this
dispatch, and wrote a comment at `:208-212` reasoning about which intents must
sit above which guard. It was in scope to see.

### D3 — MODERATE. `offerGod()` names the previous cycle's god for a debug draft.
`src/model/run.js:620`.

`CYCLES[run.cycle - 2]?.god` is correct on the completion path only, because
`complete()` bumps the cycle in the same call. The four debug keys
(`src/shell/main.js:375`) raise an offer with no completion and no bump, so:

- at `run.cycle === 1`, `CYCLES[-1]` is `undefined` → `null`. Matches the claim.
- at `run.cycle === 2` (cycle 1 paid), `b`/`t`/`k`/`y` raise an offer whose
  `offerGod()` is `hephaestus`. Pressing `r` passes `canReroll('hephaestus')`
  and `rw.favour('hephaestus', -2)` — the wrong purse pays for a draft that god
  never offered, and at cycle 2 that is 2 of the player's 3 favour.
- at `run.cycle === 3`/`4` the same, against `athena`/`poseidon`.

Three artefacts assert the opposite and are wrong together: the comment at
`src/model/run.js:617-619` ("`null` for a debug-key draft"), the identical
claim at `src/shell/main.js:901-903`, and `docs/SPEC.md` §18.8's "A debug-key
draft has no asker, so `offerGod()` is `null` and it can never be rerolled."
Reach is behind `flags.showDebug`, which is why this is not major; the SPEC
sentence is wrong for every reader regardless. Storing the god on the offer
record (it is already `{ tier, ids }`) would make the derivation unnecessary.

### D4 — MODERATE. The modal does not claim the keyboard above the search field.
`src/shell/input.js:312` (the `ui.searchFocus` branch) vs `:353` (the draft
branch), which sits below it.

State that reaches it: the CRAFTING tab open with the search field focused —
`ui.searchFocus` is cleared only by Enter, Escape or a click elsewhere — when a
trial pays. Then `1`, `2`, `3` and `r` are appended to the search string
(`:334`) and no card can be taken. Escape (`:324-331`) blurs *and* calls
`closeTop()`, which pops `'draft'` off the stack, unfreezing the run for the
remainder of that frame; `raiseOffer()` at `src/shell/main.js:400` re-opens it
in the same `applyIntents()` call, so nothing is lost — but the intervening
fall-through means the frame's world intents (place, deconstruct, link, feed)
do resolve while a god waits.

Not a soft-lock: Enter blurs and the next `1` takes the card. The comment at
`src/shell/input.js:341-343` ("claims the whole keyboard, above even the map")
is nonetheless false, and 17c2 draws the modal over a panel whose text field
still owns the keys the modal advertises.

### D5 — MINOR, latent. `flags.showMap` above `applyDraftIntents` is a real
soft-lock if anything ever opens the map while an offer stands.
`src/shell/main.js:199` vs `:213`.

Today it is unreachable: `raiseOffer()` cannot run while the map is open (the
same guard), and the draft branch swallows `o` before the map branch sees it,
so `showMap` cannot become true underneath a standing modal except through
`__mf.flags`. If it ever does, `applyDraftIntents` is never reached (so no card
can be taken) and `o`/Escape are swallowed by the draft branch (so the map
cannot be closed) — no key clears either, and there is no save. The asymmetry
is worth naming because the draft guard was deliberately placed *below*
`applyDraftIntents` for exactly this reason and the map guard was not moved.

### D6 — MINOR. A reroll spends before it re-picks.
`src/rules/draft.js:65-66`. If `candidateIds` were empty at that moment,
`offer()` would call `rw.offer(null)` and push `'NOTHING LEFT TO OFFER'`, the
staleness sweep at `src/shell/main.js:412` would close the modal, and the
favour would be gone with nothing granted. Unreachable today — the run is
frozen, so no boon can expire and no trinket can be spent between the two
calls — but it is one `if` away from being safe and the freeze is the only
thing holding it.

### S1 — STYLE. Phase narration in a comment.
`tests/visual.spec.js:1852-1857` — "THE DEBUG KEY NOW RAISES AN OFFER RATHER
THAN GRANTING OUTRIGHT (Phase 17c1)" is the `// now uses the registry` /
`// Phase 6.6` form `CLAUDE.md` says to delete; git and SPEC own it. The *fact*
worth keeping is the second half (the baseline comes from the seeded draw, not
from `BOONS[0]`).

### Checks that came back clean

- **Layer direction.** `src/rules/draft.js:21-24` imports `core/rng`,
  `model/journal`, `model/mods`, `model/run` only — no `rules` sibling, nothing
  upward. `shell/main.js` → `rules/draft.js` matches the `rules/placement.js`
  precedent. No `view` file touched, so the `view`/`rules` ban is untested here.
  `data/tuning.js` is still imported only by `model/mods.js`. Section 0 agrees:
  483 edges, 0 violations.
- **Pause predicate, one statement.** `PAUSING`/`pausesRun` at
  `src/shell/ui.js:202-203`; no `'draft'` string test anywhere else
  (`isOpen('draft')` in the dispatcher and the input branch are membership
  tests for a different question). It composes rather than shadows: both call
  sites put it after `flags.showMap` and `run.won`, and none of the three
  guards is reachable by the others.
- **Nothing else leaks past the freeze.** Above `if (pausesRun()) return` in
  `applyIntents()` there is only the `showMap` guard, the `run.won` guard and
  `applyDraftIntents()`. Placement, linking, feeding, deconstruct, the armed-
  pair sweep, `wants.draft`, `raiseOffer()` and `applyUiIntents()` are all
  below it. In `step()` the guard precedes the craft-queue re-assert, the clock
  and `stepAll`. A card take and a world intent cannot resolve in one substep:
  the take returns from `applyDraftIntents` and then the guard fires, because
  `closePanel('draft')` and the `return` are in the same statement sequence —
  the world does not resume until the *next* call. `wants.restart` is consumed
  in `frame()` at `src/shell/main.js:795`, above everything, which is what
  keeps the death screen's restart button working under the modal.
- **Draw count.** `src/rules/draft.js:34` is exactly one `rand()` per iteration
  and `k` is clamped to `pool.length`, so the count is `min(3, candidates)` —
  3, or 2 for the grant tier — and a reroll is the same again. `splice` removes
  the drawn id, so no duplicate is possible; `rand()` is strictly `< 1`
  (`src/core/rng.js:20`, `>>>0 / 2**32`), so the index is always in range and
  the `...spread` can never push nothing. No `rand()` reaches a draw path: the
  only call sites are `applyIntents`, never `draw()`.
- **`ids: null` as a request.** `run.offer` is replaced whole on every write
  (`src/model/run.js:336`), never patched. A request cannot be observed as a
  drawable offer: `__mf.ui.offer` is gated on `run.offer?.ids`
  (`src/shell/main.js:904`), no `src/view/` file reads `run.offer` at all, and
  in the normal loop a request written during `step()` is filled by
  `raiseOffer()` later in the same frame, before `draw()`. The one state where
  a request persists across frames is D2's.
- **No new literal that should be a tuning row**; both numbers are rows with
  derivations (`src/data/tuning.js:139-148`) and both are in `docs/SPEC.md`
  §18.8 in the same commit. No `Date.now()`, no variable dt, no second stat or
  paint pipeline.

## 5. Verification

Run by me, on the commit as it stands:

```
npm run check   ->  ok   85 files, 483 edges, 0 violations      (section 0)
                    ok   834 checks, 0 violations               (section 1b)
                    All checks passed.
npm run lint    ->  oxlint src tools tests; no output, exit 0
npm run test:visual -> 115 passed (16.2s), exit 0
git show --stat f343c86 -> 9 files, no *.png
```

All three match the phase report exactly, and "no baselines re-accepted" is
confirmed by the diff itself rather than by the claim.

**V3 — the verification gap.** No probe exercises `rules/draft.js`. The reset
probe (`tools/check.mjs:922`) dirties `run.write.offer('grant')` and so still
proves invariant 8 for the grown field. The determinism probe fingerprints
`run` wholesale (`tools/check.mjs:281`), so it *would* see a divergent offer —
but its scripted session is 2,000 substeps of pseudo-random input that never
completes a cycle and never presses a debug key, so the three draws are never
taken and the "same seed lays out the same cards" claim is unproven. The one
new assertion in the suite is indirect: `tests/visual.spec.js:1862` throws if
the offer is not raised and goes red if `1` does not grant, which covers the
raise-and-take path and nothing else. Not asserted anywhere: offer size 3,
distinctness, the freeze (a falling item that does not move), the reroll's
price/spend/refusal, and reproducibility. `tools/check.mjs` and `tests/` are
outside 17c1's ownership block, which explains the absence — but the gap is not
parked in `docs/FINDINGS.md`, and it should have been, because 17c2 owns only
`src/view/` and `docs/SPEC.md` and so cannot close it either.

## 6. What a later phase must not undo

- **`applyDraftIntents()` sits above `if (pausesRun()) return` and
  `raiseOffer()` sits below it** (`src/shell/main.js:213-214`, `:377`). This is
  not tidy-able into one block: taking a card is the only thing that ends the
  pause, and raising an offer is a world event that must not fire while one
  stands.
- **Escape is deliberately not a dismissal** (`src/shell/input.js:353-359`). A
  later phase adding a close box or an Escape branch to the draft panel for
  consistency with every other panel would make a permanent gift losable to a
  reflex keypress.
- **`rules/draft.js` is not in `shell/schedule.js`** and must not be added
  there; it is event-driven, and scheduling it would put `rand()` draws on the
  substep path.
- **The draw count is a commitment.** One `rand()` per card, in
  `src/rules/draft.js:34`. Rewriting `pick()` as a shuffle-then-slice, or
  drawing a rejection sample, changes every later draw in the run. Note that
  the draws are on the once-per-frame `applyIntents` path, which is the
  existing precedent (`src/rules/placement.js:106` draws there too) — but it
  means the cursor's position relative to substep consumers (mining drops,
  growth) at the moment a trial pays depends on framerate. Do not "fix" that by
  moving the pick into a substep.
- **`PAUSING` is a list of one** (`src/shell/ui.js:202`). It reads like an
  over-generalisation; it is the shape D17-A asked for, and the end screens and
  the map deliberately are not in it.
- **The `offer(tier, ids = null)` two-arg setter is one setter on purpose**
  (`src/model/run.js:336`). Splitting it into `request()`/`layOut()` would give
  `run.offer` two writers, which is the thing the field's comment exists to
  prevent.
