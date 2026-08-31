# Review — Phase 2 combined acceptance (2a + 2b + 2c together)

**Verdict: pass.** All 8 checks from `docs/BUILD_PLAN.md`'s "Acceptance for
Phase 2" script passed end-to-end, driven through the real game via
`globalThis.__mf`, not inferred from the three sub-phases' isolated tests.

This run exists because 2a, 2b and 2c were reviewed individually and each
proved its own slice worked, but nobody had yet exercised the full stated
acceptance loop — hand-craft rungs and a brand, climb into darkness, get
overloaded, drop weight, hit a pick-tier wall — as one continuous playthrough.
Integration gaps between three sub-phases sharing `data/machines.js`,
`model/run.js` and `data/recipes.js` are exactly the kind of thing that
wouldn't show up in any single phase's own test.

Result: **no integration bugs.** Every mechanic was exercised through
ordinary intents (craft, climb, drop, dig, `placeMachine` — the same function
the build-menu digit path calls), and `flags.showDebug` was asserted false
throughout, not just assumed unused, closing the loop on this phase's own
"none of that may require a debug key" requirement.

Two verification pitfalls were caught and corrected before trusting the
result, both worth keeping in mind for Phase 6's own test-writing:
`__mf.hold()`/`__mf.frames()` drain the journal internally, so refusal rows
must be read via a raw `__mf.step()` instead; and `aimAtKeys`'s downward reach
targets one tile below the player's hitbox, not the tile directly underfoot —
an off-by-one that would have silently tested the wrong tile for the pick-tier
refusal check. Both are exactly the "a test that measures the wrong thing
passes and teaches nothing" failure mode CLAUDE.md warns about, caught here
rather than shipped.

Phase 2 is complete. Proceeding to Phase 3 (buildables cost real material).
