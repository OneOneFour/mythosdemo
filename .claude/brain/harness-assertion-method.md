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

## What each assertion keeps in the source

One line: what it proves, and where it looks if that is not obvious from the
code. Not the incident, not the rejected alternative, not the doc that asked
for it.

See also [[verification-gaps]], [[comment-audit-method]].
