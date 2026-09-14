# Review — wave 5, phase 17e

**Authored by the coordinator, not by a `reviewer` agent.** Three review
agents stalled in succession on this phase. The phase agent stalled too,
before reporting, so its own red-then-green evidence never existed. This
review is the only gate 17e received, and §5 says exactly what it did and did
not cover.

## 1. Verdict

**PASS WITH FINDINGS**

All eight brief items are implemented, every moved baseline is accounted for,
and the one correctness bug is genuinely fixed. Two comments overstate what
they claim, and five of eight new assertions were not audited.

## 2. Brief coverage

| # | item | verdict | where |
|---|---|---|---|
| 1 | aggregate no longer reads 100% unpaid; batch row clamped at `batch.n` | done | `view/hud.js:326-357` |
| 2 | `run.misses` visible in play, only when non-zero | done | `view/hud.js:395-406` |
| 3 | deadline urgency reusing the boon rule, threshold a tuning row | done | `view/hud.js:253-255`, `data/tuning.js:156` |
| 4 | death screen carries the win screen's facts, shared | done | `view/hud.js:1163-1170` |
| 5 | `data/gods.js` read; `GOD_NAME` gone | done | `view/hud.js:44,597`, `view/ui/draft.js:39,140,167` |
| 6 | Character tab stat rows reachable by scroll region | done | `view/ui/mainPanel.js:305-343` |
| 7 | `view/fx.js#reset()` rewinds the chip stream | done | `view/fx.js:55` |
| 8 | callout clears the quickbar, by measurement | done | `view/hud.js:1071-1083` |

Item 1 fixes a variant the brief did not name: `Math.round` alone reaches 100
from a fraction below 1 once a demand exceeds 200 units, so the row now
ceilings at 99 short of done (`view/hud.js:353`). That is the same lie in a
second form and catching it was not asked for.

Item 3 is one helper with two readers (`urgentFlash`), which is what the brief
required — not a second rule beside the boon stack's.

Item 5 degrades legibly: `godName` falls back to `String(id).toUpperCase()`
(`data/gods.js:31`), so a missing row prints the id rather than `undefined`.

Item 8 reads both neighbours' rectangles back out of `view/ui/state.js#drawn`
and lifts only where the callout actually overlaps one in x. Measured, not
nudged.

## 3. Out of scope

Nothing. Every changed file is inside the ownership block.

## 4. Defects

**D1 — `tallyLines()`'s comment claims the win screen's pixels do not move,
and the win-screen baseline moved.** `view/hud.js:1153-1158`. The claim is
true of the two text lines (`run.cycle - 1` reads `CYCLES.length` on a win) and
false of the image: `win-screen-desktop-darwin.png` differs by 2,652 px in the
top-left HUD column, because `endScreen` washes at 0.78 alpha and the HUD
shows through. Harmless, but a future reader who trusts the comment will read
a legitimately moved baseline as a regression. Severity: low.

**D2 — `calloutBottom`'s comment understates the change.** `view/hud.js:1063`
says "a scene with room keeps the bottom row it has always had". The default
bottom is now `H - 4` where the old `hint` centred at `H - 16`, so every
callout moved even where nothing overlapped — which is why two desktop scenes
(`cloud-dock`, `ore-against-pale-stone`) moved in the bottom band. The fix is
right; the sentence describing it is not. Severity: low.

## 5. Verification

`npm run check` — 86 files, 494 edges, 0 violations; all checks passed.
`npm run lint` — clean, exit 0.
`npm run test:visual` — 137 passed (14.7 s).

Six winch tests timed out on an earlier run while a competing process held the
machine. All 137 passed on a clean re-run, and the 24 winch tests pass as a
group in 4.3 s. That is CPU contention, and it is the strongest lead yet on
FINDINGS #14 — recorded for 17g2.

**Baselines: all 17 moved images and 10 new ones are accounted for.** Decoded
against `4b4c6fe` with a canvas differ. The eight that looked wrong for a HUD
change are all confined to the bottom band, y 258..351 of 400x360 (buffer y
129..175), with nothing above y=258 moving in any of them:

```
cloud-dock             12472 px  [62,258,335,351]
ore-against-pale-stone  1568 px  [4,258,395,329]
grown-tree-phone       11360 px  [80,258,317,351]
ladder-lit-phone       10228 px  [92,258,305,351]
ladder-unlit-phone      9728 px  [92,258,305,351]
seedling-phone         11360 px  [80,258,317,351]
vein-fresh-phone       10148 px  [92,258,305,351]
vein-depleted-phone    10148 px  [92,258,305,351]
```

That is item 8 and nothing else. No world-layer pixel moved in a phase with no
business touching the world. `ui-character` moved 1,448 px at [412,506,871,557],
the panel's stat region, which is item 6.

**Assertions: three of eight audited, five not.** The phase added one test per
item. Audited in full:

- *the bottom callout does not paint over the quickbar* — hashes the
  quickbar's own recorded rect with a callout showing and with none, and
  asserts the hashes match. Goes red if any text paints into the strip. Guards
  its own vacuity by asserting the two states differ (`callout` truthy,
  `silent` null).
- *all four stat rows are reachable* — drives `realWheel` against the real
  scroll path and collects `lines` off the drawn grid rect, asserting each
  label appears. Goes red if a row is unreachable at either viewport. Reads
  drawn output, does not recompute the layout.
- *the batch bar is clamped at `batch.n`* — the clamp is the subject and
  `batchHave()` saturating is what would break it.

Not audited: the honest-at-every-stage test, the miss tally, the urgency
flash, the death-screen tally, and the chip-stream rewind. They are named
plausibly and the suite is green, which is not the same as knowing they can
fail. **17g2 should audit those five**, and this is the wave's third instance
of the class — 17c2 shipped four bounds assertions defeated by `drawPanel`
clamping, and 17g1's own purity test passed with an injected `rand()`.

## 6. What a later phase must not undo

- `view/hud.js:353`'s 99% ceiling is not cosmetic rounding. It exists because
  `Math.round` reaches 100 from below 1 past 200 units.
- `urgentFlash` is deliberately one function with two callers. Splitting it
  lets the HUD mean two different things by "nearly out".
- `calloutBottom` reads `drawn` rather than re-deriving the quickbar's rect.
  A constant here would re-open FINDINGS 16b.3's class of bug.
- `view/fx.js`'s `spark` rewind closes a latent hole and cannot be
  demonstrated against a baseline, because Playwright gives each test a fresh
  page. Do not delete it for want of a failing test.
