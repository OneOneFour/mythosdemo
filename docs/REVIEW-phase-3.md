# Review — Phase 3 (buildables cost real material)

**Verdict: pass.**

## The accepted deviation is sound, and correctly scoped

Cost-at-placement instead of a machine-item form is the right call given
`data/substances.js`'s own header rule (a substance is an element; a machine
has none) — verified this isn't a rationalization after the fact, it's the
same constraint Phase 3's spec text in `docs/BUILD_PLAN.md` already
anticipated and pre-approved. No new substance row was added to represent a
machine; confirmed by the diff touching only `cost` keys on existing rows.

## `placementCheck` — one implementation, two readers, verified in the code

Read `src/model/run.js:194-237` and `src/rules/placement.js:55-64` directly:
`rules/placement.js#placeMachine` calls `model/run.js#placementCheck` rather
than re-deriving footprint/footing/grant/depth/shaft/afford logic, and spends
the bill only after the check passes — matches the spec's explicit
"one implementation, two readers" requirement, the same move `canAfford`
already made. The new `'NO SHAFT TO SERVE'` lift-shaft check lives in the
same function rather than bolted on separately.

## Deconstruct and the no-spawn guard, independently confirmed

`grep -rn "wants.machine = '" src/` reproduced here: exactly two hits, both
`flags.showDebug`-gated (`input.js:114-115`), matching the reported result —
this is the actual enforcement mechanism for Phase 3's whole point and it
checks out directly, not just by the agent's say-so.

## The out-of-ownership `tests/visual.spec.js` touch — justified, and minimal

Two pre-existing tests assumed free furnace/press placement, which Phase 3's
own cost changes broke by design. The fix grants exactly the bill before the
keypress rather than reworking test intent, with comments explaining why
(each test's own point is the machine's look or the digit-routing logic, not
the mining grind to afford one) — this is the same class of forced,
documented exception Phase 2a's `crafting.js` fix and Phase 2b's
`STARTING_MACHINES` addition were, not scope creep. Diff reviewed directly:
four added lines of `write.collect` plus one added `draw()` call to repaint
after closing a panel the old test never opened — small, mechanical, and
explained inline.

## Checks reconfirmed independently

`npm run check` (0 layer violations) and `npm run check:content` (136 checks,
0 violations, up from 118 — consistent with new cost keys adding reachability
obligations) both re-run here, both green.

No unexplained scope violations: diff matches the FILE OWNERSHIP block plus
the one documented, necessary test-file exception.
