# Review — wave 5, phase 17g2

**Authored by the coordinator.** §5 separates what I re-ran from what the phase
reported.

## 1. Verdict

**PASS**

The strongest phase of the wave. Twelve perturbations across two new sections,
seven more against 17e's unaudited five, every red quoted, and a finding it was
right not to fix. It also caught a defect in its own harness that would have
hidden a failure.

## 2. Brief coverage

| # | item | verdict | where |
|---|---|---|---|
| 1 | `rules/draft.js` headless coverage | done | `tools/check.mjs` section 8l, three claims |
| 2 | the batch clause at 8 framerates | done | section 8m, 20/30/60/90/107/120/144/240 fps |
| 3 | audit 17e's five unaudited assertions | done | all five made red; §4 corrects one review claim |
| 4 | `tribute-cycle1-armed` gets its altar | done | `altarArrives` + `altarOnScreen`, 2 baselines |
| 5 | FINDINGS #14 | done | 18 further runs, not reproduced, honestly scoped |

Item 1's third claim walks cycles 1–3 through the real director, so the asking
god is the director's own rather than a string the test chose. Cycle 2's grant
tier is 2 rows against an offer of 3, which is the natural exhausted case, and
hephaestus holds 3 favour against a price of 2 there — so the refusal cannot be
the purse. That is a better test than the brief asked for.

## 3. Out of scope

Nothing. Five files, all inside the block. It read `src/` freely, perturbed it
for proof, reverted every perturbation, and wrote nothing there.

## 4. Defects

None.

Two corrections to earlier records, both the phase's own work:

- **`docs/REVIEW-wave5-17e.md` §6 was half wrong about the chip stream.** I
  wrote that `view/fx.js#reset()`'s rewind could not be demonstrated because
  Playwright gives each test a fresh page. True of a *baseline*, and the test
  17e wrote is not one — it bursts, advances the stream, resets, and bursts
  again inside a single page, and it goes red the moment
  `spark = mulberry(SPARK_SEED)` leaves `reset()`. Nothing about it is
  uncovered. My §6 note should not be read as licence to leave it untested.
- **A poll loop in this harness must be bounded by frames, not by `run.t`.**
  Section 8m's `until()` first read `while (run.t < limit)`. The first
  perturbation — `batchMet()` always true — pays cycle 4 on the rig's first
  step, wins the run, and `main.step()` then returns early without advancing
  the clock, so the checker hung rather than failed. A hung checker reports
  nothing, and a perturbation that freezes the simulation is the ordinary case
  for a probe driving the real loop. Fixed, and recorded in `docs/FINDINGS.md`.

## 5. Verification

Re-run here.

`npm run check` — section 0 `ok 86 files, 498 edges, 0 violations`; sections 8l
and 8m both green; ends `All checks passed.`
`npm run lint` — clean, exit 0.
`npm run test:visual` — 140 passed. `npm run parity` — 1 passed, self-contained.

**One perturbation re-derived independently.** I swapped the batch window's
clock for wall time (`Date.now()/1000 - c.t` in `model/run.js#batchHave`) and
section 8m went red:

```
FAIL: BATCH WINDOW: at 20 fps one plate credited at NaN and aged out at 2.25
      (batchHave 0) -- a credit must both count and then stop counting
FAIL: BATCH CLAUSE: the rolling window does not hold
```

That is invariant 10 enforced by arithmetic rather than by a comment.

**The framerate table is the right shape.** Each rate's error is one polling
frame and never negative, so the bound is `0 <= err <= dt` per rate rather than
a blanket tolerance. A blanket tolerance would have passed a window that drifts
with the framerate, which is the whole thing being tested.

**Its two re-accepted baselines are decoded correctly.** I re-audited
`tribute-cycle1-armed` and its phone variant with a clustering differ. The
201,804-px cluster is the world layer moving as the camera finishes easing —
the same signature `docs/REVIEW-wave5-17f2.md` §5 recorded — and the rest is
cloud drift, the altar sprite, the settled player, and beat 5's callout
replacing the title card. Its `altarOnScreen` assertion returns
`{ standing: 0 }` with the `frames(1)` removed, which a baseline alone could
not say.

**FINDINGS #14's verdict is scoped honestly and I accept it.** 18 further
parallel runs, 2,520 test executions, all green, all under real contention. The
phase separates the two symptoms rather than merging them: contention produced
`Test timeout` stalls, never a wrong pixel, while #14 is a 164 px pixel diff
seen at `threshold: 0.2`. Reading those as one symptom would have closed the
item on evidence about a different failure. Running total is 52 full-suite runs,
43 at `threshold: 0`. It names what would settle it — one captured diff image —
and does not close the item by re-running until green.

## 6. What it found and did not fix, and what I then did

**`view/hud.js#bottomLine` draws text outside its own panel.** The phase
recorded this with a `file:line` and left it, correctly: `view/` is outside its
block. Following it up turned a one-scene note into two defects, both now fixed
in `3a6c6a5`:

- Eight of the nine `data/callouts.js` rows overran the 200 px base buffer, not
  one. A player on the narrowest viewport read `CLICK YOUR ORE, THEN THE
  ALTAR -` and never saw `10 COPPER`. Only `TAKE THE PICKAXE` fitted.
- `panel()` drew its top bevel after resetting `globalAlpha` to 1, so a fading
  callout painted a hard 1 px line over nothing. That line was the *entire*
  diff in `ore-against-pale-stone` and the only callout pixel in five more
  baselines — every one of which had been recording the artifact as correct.

The second would not have been found without this phase's baseline discipline.
The diff it reported was two 1-px lines and nothing else, and a diff that small
is normally waved through.

## 7. What a later phase must not undo

- **Section 8m's per-rate `0 <= err <= dt` bound.** A blanket tolerance passes
  a window that drifts with the framerate.
- **Section 8l's exhausted case uses cycle 2's real 2-of-3 grant tier**, with
  the purse deliberately full. Rewriting it to stub a candidate list loses the
  proof that the refusal is not about favour.
- **`until()` is bounded by frames.** `run.t` stops advancing on a won run, so
  a `run.t` bound turns a failure into a hang.
- **The five `tribute-*` scenes left without an altar have their reason written
  above them.** Three are armed at the dock and must not step at all; a stepped
  frame with the ledger already full completes the trial out from under the
  picture.
