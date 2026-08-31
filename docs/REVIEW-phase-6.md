# Review — Phase 6 (harness)

**Verdict: pass.** Final phase of `docs/BUILD_PLAN.md`.

## The core defect fix, checked against the actual claim

CLAUDE.md's historical note says `check.mjs` ran at a stale `1/60` calling
`sched.stepAll` directly instead of the real `step()`. Read `tools/check.mjs`
directly: it now explicitly calls `main.step(dt)` (confirmed at line 150 and
the `1/120` settle call at line 367), with a header comment stating plainly
that `sched.stepAll` already *was* `step()`'s core and the delta (clock
bookkeeping, map-freeze guard, camera) doesn't touch the existing assertions —
this is a defensible, checked claim rather than an assumption, and the fix was
made regardless of whether it changed any prior result, which is the correct
instinct (fix the structural gap even if it happens not to have been hiding
anything today).

## The single most load-bearing acceptance criterion: independently spot-checked

The report claims every new assertion was deliberately broken once and
confirmed to fail before being trusted, including a self-caught bug in the
agent's own `minMineDepth` check (a string-vs-ordinal comparison) — caught
*by* the deliberate-break discipline this phase itself introduced, which is
the strongest possible evidence the discipline is real and not performative.
Re-ran the full suite independently here rather than trusting the report at
face value: `npm run check` (all new BURDEN/LIGHT/render-purity probes
passing with concrete numbers, e.g. "walking covers the identical 60.0 px at
0% and 150% of the hard cap"), `npm run check:content` (165 checks, up from
154 — consistent with the new reachability/holdability/depth-monotonicity
assertions), `npm run lint`, and the full `npm run test` (70/70 Playwright
tests across both viewports) all re-run here, all green.

## Housekeeping fix confirmed in the actual file

`package.json:27` now reads `"oxlint": "1.80.0"` under `devDependencies` —
the gap flagged at Phase 5a's review is closed, confirmed by direct read, not
by report.

## The phone-screenshot honesty is the right call

Checked `docs/FINDINGS.md`'s entry directly: the phone project's screenshots
were already blank in this sandbox before this phase touched anything (a
pre-existing environment limitation, not a regression), and the finding says
plainly that this means the phone baselines aren't currently proving anything
about phone rendering correctness — exactly the kind of "a test can silently
test nothing" self-awareness CLAUDE.md asks for, rather than quietly shipping
a green phone suite that isn't actually checking pixels.

## No pre-commit hook invented

Confirmed no `.git/hooks` or Husky config exists in this repo; the phase
correctly declined to invent hook infrastructure that wasn't asked for and
noted the content-lint's pre-commit wiring as unavailable rather than adding
a new mechanism outside its scope.

## Checks reconfirmed independently, one more time, at the finish line

`npm run check`, `npm run check:content`, `npm run lint`, `npm run test`
(70/70) all re-run fresh in this review, all green, closing out the entire
`docs/BUILD_PLAN.md` phase sequence (0 through 6) with every phase
independently verified rather than taken on an agent's word.

No unexplained scope violations across either commit.
