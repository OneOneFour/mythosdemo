# Review — Phase 0 (targeted hardcode census)

**Verdict: pass.**

## Against the spec

- Four sections, dense tables, `file:line` throughout, no narrative, no
  proposals, no code — matches the spec's required shape.
- Section 1 contains no "etc." Every row either recommends a tunable or says
  "keep" with a stated reason. Cross-checked `HARD_BREAK` against the agent's
  own re-reading of `rules/mining.js` — the "journal-kind selector, not a
  mechanic" claim holds: `work < hard` and the drop both run identically on
  either side of it.
- Section 3: cross-checked against `grep -n "k ==="  src/shell/input.js`
  (verified independently) — every key the spec lists (`w a s d`, arrows,
  space, `x j e u g c h i o m f t b l r`, `1`-`9`) is accounted for. No gap.
- Section 4: all five hooks addressed, each with an honest existing/not-existing
  call, not a hedge.

## The two things this phase changes for later phases

1. **`t` and `b` are load-bearing**, not decorative debug keys — they are
   currently the *only* sources of a trinket and of any machine grant beyond
   `STARTING_MACHINES`. Phase 4 already sequences replacement-before-deletion
   correctly; this is now written down so Phase 3 (which touches `f`/`l`, not
   `t`/`b`) doesn't reach for them by mistake.
2. **Real scheduling conflict, now fixed.** The live `STEPS` order is
   `player -> reveal -> mining`, not `player -> mining -> reveal` as Phase 2b's
   original text assumed — `reveal` sits where it does specifically *because*
   it has no dependency on `mining` today, and Phase 2b's own light-gated
   Pass B is what creates that dependency. Patched `docs/BUILD_PLAN.md`
   directly: `reveal` moves to sit after the new `light` step, and both
   schedule.js header-comment entries are rewritten as part of Phase 2b's own
   file-ownership block, not left as a stale rationale describing an edge that
   no longer exists.

## Findings carried forward

`docs/FINDINGS.md` created (the agent's harness blocked it from writing this
file itself; content applied by the orchestrator from its report, unedited).
Two items of note beyond the scheduling fix above:
- `rules/player.js:113`'s void-death damage should read `eff('fallMax')`
  instead of a bare `5` — assigned to Phase 2a, which already owns that file.
- A four-way toss-velocity inconsistency across `mining`/`trinkets`/`crafting`/
  `machines` — resolved by adding `tossUp`/`tossSpread` tuning rows in Phase 1
  and having Phase 2a's new drop verb (the only new call site) read them; the
  four existing call sites are left alone this pass rather than triggering a
  drive-by edit across three other phases' files.

No scope violations: only `docs/AUDIT.md` was written by the agent, nothing
under `src/`.
