# Two standing sequencing rules, repeated across every shipped phase plan

Absorbed from `docs/PLAN-phase13.md` §6, `docs/PLAN-phase14-mining-and-drops.md`'s
former §7, and `docs/PLAN-phase15-trees.md`'s former §7 risk-register row on
"two overlay passes," when those sections were trimmed to pointers. Both
rules are conventions for planning the *next* phase, not facts about any one
already-shipped phase, which is why they outlive the plan documents that
stated them.

**Rule 1 — one `src/view/`-owning phase in flight at a time.** Two phases
that both touch `src/view/` and run concurrently will fight over the same
baselines, and whichever lands second either duplicates the other's overlay
pass or silently reverts it. This repo hit the concurrency case explicitly
at Phases 8, 8b, 8e and 9 (all serialised for this reason), again at 13a/13b
(both editing `src/view/` broadly — the ladder sprite waited for the UI
contrast pass), and again between 14c's depletion overlay and 15's growth
cue (both wanted "a live per-tile cue" in `view/scene.js`; the fix was one
overlay pass with a case added for each, not two passes drawing over each
other). When two phases in a wave both plausibly want `view/scene.js` or
`view/paint.js`, sequence them — don't parallelise and reconcile after.

**Rule 2 — the additive phase lands and is hand-verified before the phase
that removes what it replaced.** Landing new machinery and deleting the old
machinery in the same commit means a bug in the new path has no fallback
and no isolated diff to bisect. `docs/PLAN-gears-and-winches.md` followed
this for segment transport: the crank/gear/hub/segment system was built and
played by hand before `rules/lift.js`, the staged winch's substance, recipe
and `STARTING_MACHINES` entry were deleted. The same shape recurs at smaller
scale inside `docs/PLAN-phase14-mining-and-drops.md`'s D14-A/D14-H (the
`block`/`pack` recipe route existed and was verified before `gravel`'s and
`log`'s `tile` blocks were deleted, so a mid-phase revert never left a
placeable form with no way back).
