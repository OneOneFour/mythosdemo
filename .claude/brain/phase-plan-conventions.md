# Three standing sequencing rules, repeated across every shipped phase plan

Absorbed from `docs/PLAN-phase13.md` §6, `docs/PLAN-phase14-mining-and-drops.md`'s
former §7, `docs/PLAN-phase15-trees.md`'s former §7 risk-register row on
"two overlay passes," and `docs/PLAN-phase12.md`'s former "why this is two
phases now, not one" (Phase 12c/12c2 split), when those sections were
trimmed to pointers. All three are conventions for planning the *next*
phase, not facts about any one already-shipped phase, which is why they
outlive the plan documents that stated them.

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

**Rule 3 — verify at each step; do not stack unverified changes.** A wide
storage change is landed and proven green (`npm run check` alone — epoch,
determinism and mass-conservation are enough to catch a broken migration)
*before* any view or drag code is layered on top of it, even when the two
halves were originally scoped as one phase. `docs/PLAN-phase12.md`'s 12c
started as "add one derived function, wire three readers to it," but the
revised scope touched `model/run.js` wholesale, three `rules/` files and a
new tunable pair before a single pixel of UI changed — landing that alone
first, verified, meant a broken migration would be caught by the harness
before any view code made the diff harder to bisect. 12c2 (the view/drag
half) depended on 12c having already landed and passed. The same discipline
is why `docs/PLAN-phase12.md`'s own 12a→12b→12d sequence never bundled two
unverified layers into one commit.
