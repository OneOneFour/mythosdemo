# What makes an assertion non-vacuous in this repo

Salvaged from `tools/check.mjs`, `tools/content.mjs`,
`tools/worldgen-check.mjs` and `tests/visual.spec.js` when their per-assertion
essays were cut to one line each. The instances are in the source; the method
is here, because a new assertion needs this and the old ones no longer carry
it.

## The two incidents this is written against

**The furnace check sampled the wrong column.** It read the player's column
*after* they had walked to the altar, so it measured a hole at the surface and
reported success. The assertion it claimed to make — that a furnace had been
built underground — was never tested. If an assertion passes suspiciously
easily, verify it is looking where it claims.

**Two screenshot tests set `flags.grid` when the name is `flags.showGrid`.**
Both baselined a scene with the overlays off and passed forever. If a test
asserts a feature is visible, prove the pixels differ with it off — take the
shot both ways once, by hand, and confirm the diff is nonzero before
committing the baseline.

## The checklist

1. **Assert the mechanism, not the symptom's absence.** "No exception thrown"
   is not an assertion. Name the number, the pixel, the tile or the ledger
   entry that must change and by how much.
2. **Prove the negative case once.** Before trusting a new assertion, break
   the thing it guards and watch it fail. An assertion never observed failing
   is a comment.
3. **Check the shape of what you are asserting against.** Rewriting the
   harness produced ten failures and every one was the harness: `TUNE` maps an
   id to a *row* rather than to a number, a trinket key is dotted
   (`rate.furnace` is `rate` scoped to `furnace`), `NAMED_UNITS` is an array,
   and a recipe with `from:` draws named units from a source rather than from
   substance-form selectors.
4. **Use the validator that already exists.** `data/forms.js#expand(sel)`
   exists to prove a selector is not empty, which is the failure that lets a
   substance pile up in a buffer no recipe consumes. A hand-rolled string
   check was written first and was strictly worse.
5. **A fixed-dt harness cannot see framerate bugs.** `check.mjs`
   re-implements the frame loop rather than calling the real `step()`, which
   is why known framerate-dependent bugs can pass green. Any claim about
   seconds-to-break has to sweep several framerates or it is claiming nothing.
6. **Importing a module is not executing it.** `check.mjs` imports every
   module so a parse error or an orphan cannot hide, but it only executes the
   paths its own assertions drive — which is why a typo'd identifier inside a
   function body once reached a commit through both gates.
7. **Screenshots prove appearance has not *changed*.** They say nothing about
   whether it is good, and bit-exactness needs both `threshold: 0` and
   `maxDiffPixels: 0`; either alone silently filters near-black drift.
8. **Drive input through the keyboard, the model, or `__mf.ui`'s record of
   what was drawn** — never hardcoded click coordinates. A click resolved
   against a still-easing camera hits a different tile than the one drawn.

## Salvaged from the visual suite's per-test essays

9. **A clamped rect proves nothing about layout.** `view/ui/panel.js#drawPanel`
   forces every rect inside the buffer *before* recording it, so
   `x + w <= vw` is a tautology — three cards stacked on each other at x 2
   satisfy it. Assert *strictly* inside every clamp boundary instead:
   `w == vw - 4`, `x == 2` or `x + w == vw - 2` is what a clamped rect looks
   like.
10. **Two draws are a weak sample for render purity.** An injected
    `(rand() * 10) | 0` passed a two-draw op-stream compare by landing on the
    same string twice. Four draws is the floor.
11. **Baseline both halves of a cue, never one.** Lit/unlit, armed/unarmed,
    grown/ungrown: each shot accepted separately, so a regression that makes
    the cue a no-op has to move a file against its *own* image rather than
    merely look plausible beside the other. Where the difference is too subtle
    for a human between two PNGs (a halo under `drawDarkness`'s 0.94 alpha),
    the honest form is a pixel count from two draws with zero steps between
    them and the feature the only thing toggled.
12. **Assert that the scene contains its own subject.** A screenshot of "an
    altar arriving" with no altar on screen, or of a cliff whose face turned
    out to be one tile, passes forever. `expect(at).not.toBeNull()`,
    `expect(steps.big).toBe(1)` and an on-screen check against the live camera
    are what make the picture about what it claims.
13. **Set state, never toggle it.** A toggle asserts the caller already knows
    the current value, which is true only by accident of a fresh page.
14. **A substep count calibrated to a tunable goes stale.** A scene budgeted at
    400 substeps for `segUp` 11 overran the top of its cable when the tunable
    moved and went on asserting a parked carrier was ascending. Derive the
    budget from the distance and the tunable (`riseTo`), and only on a
    drivetrain saturated enough to run at it.
15. **Let the camera converge before any real click.** `updateCamera` eases
    `cam` toward a teleported player at 5% a substep while the dispatcher
    hit-tests against the camera the last `draw` snapshotted, so a scene that
    teleports has to run a few hundred substeps before its first click.

## What each assertion keeps in the source

One line: what it proves, and where it looks if that is not obvious from the
code. Not the incident, not the rejected alternative, not the doc that asked
for it.

## Four traps the worldgen sweep hit, salvaged from its own comments

1. **A packed node key's stride must be derived from the data.** `keyOf` used
   a literal 1000 against a 128-column world. At 1,024 columns, row `ty`
   column 1023 and row `ty + 1` column 23 collided, so the flood fill marked
   nodes visited it had never reached and the sealed-ore property was
   answering about the wrong tile. The stride is now
   `max(...BANDS.map(b => b.tw))` with an overflow guard against the band
   slot.
2. **Measure density, not count.** Every other property in the sweep is a
   per-seed absolute. A band widening from 128 to 1,024 columns against an
   absolute `count` left the same content in eight times the rock with the
   whole file green. The floors are cells per 10,000 tiles of the band, each
   set at 80% of the measured mean, aggregated over the sweep because one
   seed's scatter is noisy.
3. **A harness measuring terrain must skip what grows on it.** Counting a
   timber trunk's top tile as the ground row read every tree as a 3-5 tile
   cliff the step rule never produced, at nearly every seed. Trunks are
   placed after the relief and step passes, so they stand on the surface
   rather than being it.
4. **Test only what the generator promised.** The big-step rule is asserted on
   the outward column alone, because that is the column
   `rules/generate.js#stepPass` tests as it assigns it. A both-ends test
   flagged the inward column, which sits on the SAFE_R+1 boundary by
   construction, on every seed with a big step near spawn.

Two vacuity traps in the same file are guarded in the source instead: a
tier-blind reachability fill passes trivially because every strata substance
carries a finite `tile.hard`, and at `dip` 0 a correct and a broken
`skyBottomTy` both return `floorTy`, so the sweep fails on the content row
rather than quietly proving nothing.

See also [[verification-gaps]], [[comment-audit-method]].
