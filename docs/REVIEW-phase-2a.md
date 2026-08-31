# Review — Phase 2a (encumbrance, dropping, tiered ladders)

**Verdict: pass.**

## Against the spec

- Drop verb ships first, as a prerequisite, before the lockout — matches the
  spec's explicit ordering rationale (a lockout without a drop verb is a
  soft-lock).
- Encumbrance effect on movement matches D4 exactly: soft->hard linear climb
  falloff, hard lockout on ladder-up/hop/lift-boarding, walking and all
  downward movement unaffected at any burden. Confirmed independently: `npm
  run check` still reports the fall-damage table matching `docs/SPEC.md` at
  all 7 rows and the 7,200-frame collision fuzz still passes, so the burden
  gate didn't perturb unrelated physics.
- `moveX`'s auto-step deliberately left ungated, with the CLAUDE.md history
  cited as the reason — correct, and matches the phase spec's explicit
  instruction not to repeat that mistake.
- Reused `placeTile`'s existing unbacked-ladder refusal rather than
  re-implementing it — correct per the spec's explicit "do not change that
  rule" instruction and its own cited shaft/grave history.
- Toss velocity for the new drop verb reads `eff('tossUp')`/`eff('tossSpread')`
  rather than hardcoding a fifth magic number — resolves the Phase 0 finding
  as intended.
- Independently reconfirmed: `npm run check` (0 layer violations), `npm run
  check:content` (82 checks, 0 violations), `docs/SPEC.md` gained the new
  locked numbers in the same commit as the content, per process rule 4.

## The crafting.js fix: outside FILE OWNERSHIP, correctly judged anyway

`rules/crafting.js` wasn't in this phase's ownership block, and the process
rules say scope violations belong in `docs/FINDINGS.md`, not in the diff. But
this case clears the bar for an exception on its own terms: the bug
(`clause.sub` never translated through `S[...]`) sits on the *exact* code path
this phase's own required manual-verification step exercises (`peg_rungs`,
literal-`sub` output), so leaving it undocumented-only would have shipped a
phase whose acceptance criterion ("hand-craft peg rungs... climb") could not
actually pass. The fix is one line, symmetric with the adjacent `F[...]`
translation already there, and it's explained inline with why it's safe. It
also retroactively fixes Phase 1's `kindle`, which had been silently
producing nothing since Phase 1 landed — worth knowing: Phase 1's own manual
sign-off didn't actually exercise `kindle` end-to-end, since nothing caught
the no-op until this phase's peg_rungs hit the same line. Not a Phase 1
process failure worth re-opening (the content lint doesn't check runtime
output, only content-graph shape), just a reminder that "lint passes" and
"manually verified" are different claims — noted for future phases: prefer
actually running the recipe through the test hook, not just checking it
compiles against the lint.

## The peg_rungs/kindle collision — a real design catch, not a workaround

Making `peg_rungs` cost 2 logs instead of 1 to avoid being trigger-identical
to `kindle` (both `1 timber/log` hand recipes would tie under "first
satisfied recipe wins") is the correct fix for a real ambiguity the plan
didn't anticipate, and it was caught by manual play-testing rather than
content lint — a good argument for keeping manual verification a real gate
and not a formality, echoed above.

No other scope violations: the remaining diff matches the FILE OWNERSHIP
block exactly.
