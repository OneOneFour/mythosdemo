# Review — Phase 2b (light and darkness)

**Verdict: pass.**

## The schedule reorder — independently verified, not just trusted

Read the live `src/shell/schedule.js`: order is now `player -> mining -> light
-> reveal -> items -> ...`, exactly as the corrected spec required. The header
comment doesn't just add two entries, it explicitly retires the stale `player
before reveal` reasoning with a note on *why* it moved rather than leaving two
contradictory adjacency claims in the file — matches this repo's own
convention of stating the reason for every adjacent pair, and closes the loop
Phase 0's audit opened.

## Memory vs. current condition — composed, not collapsed

The two-fact model (`b.seen` permanent, `b.light` current) reads correctly
from the diff: Pass B's flood gate is additive on top of the existing
radius-1-always-revealed base case rather than replacing it, and Pass A (open
sky) is untouched. Manual verification confirms the important edge case
directly: a revealed-but-now-dark tile reports `seen:true, light:0`, distinct
from `seen:false, light:0` — the fog/darkness distinction the spec worried
about collapsing is intact.

## Machine-grant additions are correctly cost-gated, not a free-content regression

`brazier` and `hearth` were added to `STARTING_MACHINES` (`data/boons.js`) as
a deviation, on the reasoning that a machine excluded from that list can never
be placed at all yet, and the phase's own manual-verification step requires
placing one. Checked directly: both rows carry a real `cost` block
(`brazier`: 4 timber/log + 2 stone/gravel; `hearth`: 2 copper/plate, with a
`docs/FINDINGS.md` note that it should reprice in essence once that tier
exists) — being "starting" only means visible in the build menu, exactly the
precedent `belt_r`/`belt_l` already set in that same list, not a free
placement. Correct call, and it doesn't reopen Phase 3's "furnace/lift are
free" problem since neither new machine lacks a cost key.

## New interpreter key cost, paid honestly

`light:{level, whileRunning}` is one key and one branch, per ARCHITECTURE §3's
accepted trade for an unprecedented behavior — confirmed no machine or
substance name leaks into `rules/light.js` or `src/view/`.

## Deviations outside FILE OWNERSHIP

Three touches outside the stated block (`model/run.js#brandLeft`,
`data/tuning.js#brandLevel`, `data/boons.js#STARTING_MACHINES`) — all
necessary consequences of the phase's own content requirements rather than
drive-by scope creep, all documented loudly in the commit message and
`docs/FINDINGS.md`, matching the precedent Phase 4's own spec text sets
("`data/tuning.js` is NOT yours — if you need a tunable, add the row and say
so loudly"). No objection.

## Checks reconfirmed independently

`npm run check` (0 layer violations, 92-check content lint passing), `npm run
check:content` standalone — both re-run here, both green. Tile-byte headroom
unaffected (no new forms/substances this phase), consistent with the report.

No unexplained scope creep; the diff matches ownership plus the three
documented, justified exceptions above.
