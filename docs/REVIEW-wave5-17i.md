# REVIEW — Phase 17i (the quickbar is eight cells, and pickups fill it first)

Commit `c803360`. Plan section `docs/PLAN-wave5-closeout.md` §6a, plus the
mid-task correction that `view/ui/quickbar.js#COLS` goes 5 → 8.

## 1. Verdict

PASS WITH FINDINGS

The behaviour, the tests and the documentation are right, and nothing here
blocks 17j; three of the 80 re-accepted baselines moved outside the quickbar
for reasons the phase did not find and cannot explain, and it reported one of
them.

## 2. Brief coverage

| brief line | state | where |
|---|---|---|
| `quickbarSlots` 10 → 8 | done | `src/data/tuning.js:154` |
| SPEC owns the number first | done | `docs/SPEC.md:2692-2718` |
| `write.collect` allocates into the quickbar tail before the main grid | done | `src/model/run.js:281-282` |
| Rewrite `write.collect`'s header to state the rule that now holds | done | `src/model/run.js:265-277` |
| Merge-first unaffected, one pair in one slot | done | `src/model/run.js:279`, probe at `tools/check.mjs:6834` |
| Bound the digit mapping to the real cell count, no `data/tuning.js` import | done | `src/view/ui/quickbar.js:64-67` |
| Confirm the 38-slot refusal still reaches `rules/items.js#step` | done | probe at `tools/check.mjs:6853`; no source change needed |
| Fix `putInQuickbar`, not its callers | done | `tests/visual.spec.js:43-53` reads the landing index back |
| Re-accept the moved baselines and say why in the commit | done | 80 files; the commit body gives the reason |
| `COLS` 5 → 8 (mid-task correction) | done | `src/view/ui/quickbar.js:36`, with `docs/FINDINGS.md:2258` on the `grid.js` cause |
| Acceptance: eight pairs fill cells 0..7, the ninth reaches the bag | done | `tools/check.mjs:6801`, driven through spawn + `cmd.collect` |
| Acceptance: `9` and `0` arm nothing and throw nothing | done | `tests/visual.spec.js:1548-1574` |
| Acceptance: a full inventory refuses through the existing path | done | `tools/check.mjs:6853` |

## 3. Out of scope

Every file touched is inside the ownership block. Three changes inside it were
not spelled out in the brief.

- `tests/visual.spec.js:55-87` adds `putInMain` and `moveHeldToMain` and eight
  callers switch to them. The brief asked for the helper to be fixed rather
  than its callers, and these callers changed because their subject is the
  Character tab's own grid, which a pickup no longer reaches. Harmless and
  necessary.
- `src/view/ui/quickbar.js:1` and `:43-52` reword two comment blocks beyond the
  digit mapping. Harmless; both describe the code that changed.
- `docs/SPEC.md:2692` titles the new section "Phase 12c, revised 17i". Phase
  numbers in a SPEC heading match the file's existing convention. Harmless.

`docs/PLAN-phase16-interaction-model-v2.md:327` still says "the entire
inventory, all 40 slots". It is a historical plan document and is outside the
block, so leaving it is correct.

## 4. Defects

### 4.1 Three re-accepted baselines moved outside the quickbar and the phase found one — medium

`tests/visual.spec.js-snapshots/ui-crafting-desktop-darwin.png`,
`…/ui-character-swap-desktop-darwin.png`, `…/ui-character-desktop-darwin.png`.

I decoded all 80 old and new PNGs and clustered the differing pixels into
connected components. Sixty-nine scenes differ only in the quickbar strip, the
IN HAND line above it, the right-edge depth ruler and the top-left burden
readout. Four scenes carry a component outside those zones:

| scene | component (device px) | pixels | explained |
|---|---|---|---|
| `hollow-relic-unlit` | (624,384)-(655,407) | 100 | reported in FINDINGS, cause unknown |
| `ui-character` | (472,336)-(511,375) | 1024 | yes — the bellows trinket now lands in the strip |
| `ui-character` | (464,400)-(471,407) | 12 | no |
| `ui-character-swap` | (536,392)-(543,407) | 12 | no |
| `ui-crafting` | (544,392)-(551,407) | 36 | no |

`ui-crafting`'s test body is byte-identical across the commit, so its scene
setup cannot account for it. All four unexplained components sit in the world
layer at buffer rows 192-204, and the pixel values shift by 1 to 11 units in
near-black shades.

The phase's source changes cannot produce them. I recorded the full canvas op
stream of the `ui-crafting` scene twice under the current code — once with the
two pairs in the quickbar and once moved into main slots 0 and 1, which is the
state the old code produced — and diffed the two streams. They differ in 42
ops, every one a `fillRect` between x 517 and 542 and y 375 and 385, which is
the quickbar strip. No world-layer op differs. So the world-layer movement in
these three scenes is drift between sessions, not this phase's behaviour, and
it belongs to the same class as FINDINGS #14. The class now has four instances
rather than two, and three of them were absorbed into committed baselines
without being noticed.

Nothing in the game breaks. What degrades is the argument `maxDiffPixels: 0`
rests on. I did not reproduce the agent's stash experiment, because I have no
write access; the op-stream comparison establishes the same conclusion by a
different route and reaches three scenes the stash experiment did not examine.

### 4.2 The digit test fills one cell and reads as if it fills eight — low

`tests/visual.spec.js:1550`. The loop calls `putInQuickbar(page, i, 'copper',
'ore')` eight times with the same pair. `write.collect` merges, so each pass
tops up one stack and moves it to cell `i`. The strip ends with a single stack
of eight copper ore in cell 7 and cells 0-6 empty. `page.keyboard.press('8')`
arms because cell 7 is the one cell that holds anything. Change the loop bound
to 5 and the arming half goes red for a reason that has nothing to do with the
mapping. The direct assertion at line 1573 is present and does carry the
weight, exactly as the phase report says.

### 4.3 `COLS` must track a tunable and nothing enforces it — style note, cannot fail today

`src/view/ui/quickbar.js:36`. The comment claims `COLS` matches
`eff('quickbarSlots')`. No trinket, boon or grant targets that tunable, so the
two cannot disagree in the shipped build. If one ever did, `drawGrid` would
paint `COLS × ceil(n/COLS)` cells over `n` slots and the padded-box defect
returns, while `drawQuickbar` computes `y` from its own row count and the grid
computes another from its clamped column count.

### 4.4 `rules/items.js:128`'s refusal comment still says "no free main slot" — style note

Outside the ownership block, parked at `docs/FINDINGS.md:2270`. Correctly
handled.

### 4.5 The hint callout runs under the strip at the 200 px floor — pre-existing

`src/view/hud.js#hint`. I compared `ui-quickbar-full-phone` before and after.
The callout band already cut the bottom edge of the strip's lower row in the
old baseline, so the overlap predates this phase, as `docs/FINDINGS.md:2283`
claims. The wider strip moves the collision from cells 6-0 to cells 1-5 and
makes it more visible. A committed baseline does show overlapping UI, and it
did before this commit too.

## 5. Verification

Run at `c803360` with a clean tree apart from `docs/PLAN-wave5-closeout.md` and
`docs/STYLE.md`.

| command | result | phase's claim | match |
|---|---|---|---|
| `npm run check` | `0. dependency direction — 86 files, 494 edges, 0 violations`; `8k` prints three `ok` lines; `All checks passed.` | same | yes |
| `npm run lint` | exit 0, no output | clean | yes |
| `npm run test:visual` | `122 passed (20.9s)`, then `122 passed (16.4s)` on a second full run | `122 passed` | yes |

Section 8k's three lines read:

```
  ok   QUICKBAR FILL: 8 distinct pairs picked up through the real item path land in quickbar cells 0..7 left to right with the main grid untouched, and the 9th lands in main slot 0
  ok   MERGE FIRST: a pair already held in a MAIN slot tops that slot up, rather than allocating a quickbar cell -- the merge search still precedes the fill order
  ok   INVENTORY FULL: all 38 slots taken, the next pickup is refused through rules/items.js#step with one 'INVENTORY FULL' journal row, and the item is still lying on the ground
```

What turns each new assertion red:

- `tools/check.mjs:6801` — any allocation that reaches a main slot before a
  free quickbar cell, any right-to-left or gap-leaving order, or a ninth pickup
  that does not reach main slot 0. It drives spawn plus `cmd.collect`, so a
  refusal in `rules/items.js#step` also fails it.
- `tools/check.mjs:6834` — an allocation that runs before the whole-array merge
  search. The pair sits in main slot 3, so a merge-second implementation would
  open a second stack in the strip and the probe reads both the landing slot
  and the quickbar's emptiness.
- `tools/check.mjs:6853` — a 38-slot inventory that accepts a 39th pair, drops
  the item without a journal row, or pushes a `why` other than
  `'INVENTORY FULL'`. The `burden × 100` lift at line 6856 cannot mask the
  subject: the burden gate runs first in `rules/items.js#step` and lifting it
  only prevents the wrong refusal from firing, and the probe matches the `why`
  string rather than counting refusals. It is removed by source at line 6866
  before any branch returns.
- `tests/visual.spec.js:1532-1535` — `__mf.ui.quickbar.length` and
  `grid.slots.length` are asserted on both sides, so a `COLS` that does not
  divide the slot count shows as more painted cells than addressable ones. With
  `COLS = 5` this reads 10 against 8 and fails.
- `tests/visual.spec.js:1573` — an unbounded or off-by-one `slotForDigit`. The
  old mapping returns 8 and 9 for `'9'` and `'0'`, and `-1` is the only
  observable difference, which is why the direct call is the assertion that
  matters.

`write.collect` fill order, read at `src/model/run.js:278-286`: the merge scan
covers the whole array before any allocation, the quickbar scan returns the
first null at or past `mainSlots`, and the fallback scans from index 0. A gap
is unreachable, because the first null in index order always wins. With the
strip full and the bag not, `q === -1` and the fallback lands on the first free
main slot. Worst case is two O(38) scans instead of one.

The rewritten header at `src/model/run.js:265-277` states present behaviour and
does not narrate the reversal. `docs/PLAN-phase12.md` keeps the old rule as
history and the header no longer cites it, so the two do not contradict each
other in live code.

## 6. What a later phase must not undo

- The two-step allocation in `write.collect`. Collapsing it to one
  `findIndex(s => s === null)` restores main-first and silently reverts the
  phase.
- The merge scan running before any allocation. `invCount` is a single lookup
  because of it.
- `slotForDigit`'s bound measured off `run.inv.length - run.mainSlots`. It is
  not a constant because `view` may not import `data/tuning.js`.
- `COLS = 8` tracks `eff('quickbarSlots')` by hand. Changing one without the
  other brings back cells that address nothing.
- `tests/visual.spec.js#putInMain`. Three Character-tab shots baseline an empty
  grid without it.
- The `burden × 100` lift in `tools/check.mjs:6856`. Removing it makes the
  probe report the burden refusal instead of the capacity refusal, and pass.

For 17j specifically: nothing here blocks the ALL tab or teaching
`view/ui/tabs.js` to wrap. Two things to carry over. The quickbar's baselines
have just moved, so a blanket `test:visual:update` would bury any panel-layout
mistake among 80 files that already changed once — diff the regions instead.
And expect small unexplained components in the world layer of re-accepted
shots; they are defect 4.1's drift, not the tab row.
