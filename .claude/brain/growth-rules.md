# Growth: the only thing in the game that changes on its own

Salvaged from `src/rules/growth.js`'s 58-line header. Everything else in
`rules` is driven by an input this frame or by material another step just
moved; this step is driven by nothing but elapsed time, which is why the two
things it must not touch were worth naming before the code.

## Time comes from `dt`, never from a wall clock

The simulation runs a fixed 1/120 s substep and no `rules` module ever sees a
variable dt, so a seed takes its stated `eff('treeGrowSecs')` of SIMULATION
time at 20 fps and at 240 fps alike.

`Date.now()` and `performance.now()` would both "work" and both drift — and
worse, they would keep growing a seed while the tab was in the background,
where no other mechanic in the game advances at all.

`clock.t` is not an option either: it is `shell`-owned and `rules` may not
import `shell`. `model/run.js#run.t` exists and is ticked first, but is not
used either — an ACCUMULATOR PER SEED is what makes the transition independent
of WHEN the seed was planted, where a comparison against a run clock would need
a planted-at stamp and would drift the day anything reset that clock.

## Height comes from `hash2`, never from `rand()`

A trunk's height must be a function of WHERE the seed was planted and nothing
else. `rand()` is a stream, so its value depends on how many draws preceded it:
two runs from the same seed in which the player planted the same tile at
different times — having mined a different number of tiles first, say — would
resolve to different heights, and the run would no longer be bit-reproducible
from its seed in any useful sense.

`hash2(tx, ty)` is stateless, consumes nothing from the stream, and is already
the idiom for positional pseudo-randomness. The band ordinal is folded in so
the same `(tx, ty)` in two bands is not forced to the same height.

MULTIPLY-AND-FLOOR rather than a modulo of the raw 32-bit word, matching
`randInt` and every other `hash2` reader. `hash2` returns [0, 1), so `| 0` can
never reach `hi - lo + 1` and the result can never exceed `hi`.

## The height range is read off the worldgen row

So a planted tree is the same size as a wild one by construction, and the two
cannot drift apart in a tuning pass that only remembered one of them. Whether a
CULTIVATED tree should differ — taller, faster, or worth more — is a real design
question and is explicitly deferred; when someone answers it, the answer is a
key on a content row rather than a number in the rules module.

## Four things this step deliberately does not do

**It does not draw anything.** The growth-stage cue is `view/scene.js`'s live
overlay, reading `model/growth.js#stageAt`.

**It does not touch the canopy, the chunk cache or any repaint.** A grown trunk
is written as NATIVE tiles through the identical call worldgen makes, and
`write.touch` inside `setByte` already bumps the right 3×3 neighbourhood of
chunk versions, so the crown grows on the next repaint with no code here and
none there. That is the single best property of a tree being N stacked native
tiles and nothing else.

**It does not push a journal row.** The tile appearing IS the event, and a
notification for something three minutes downstream of any input the player
made is noise rather than feedback.

**It does not regrow a tree nobody planted.** Nothing scans for stumps. A world
that reforests itself removes the reason to carry a seed.

## The seed's own tile becomes the trunk's base

Rather than being cleared with the trunk starting above it, which is what makes
the tree stand exactly where the player put it. Growing upward is the same
direction worldgen grows, and the only direction that cannot bury the player —
downward would overwrite the ground the seed was planted on.

Off the top of the band is not a special case: `write.set` refuses an
out-of-bounds coordinate, so a seed planted two tiles below row 0 simply yields
a two-tile tree. A REFUSAL TO GROW would be worse — the player would be left
with a seedling that never resolves and no way to learn why.

**The substance is the seed's OWN, not the literal `timber`.** Reading it off
the tile costs nothing and means a second organic element would grow into its
own kind of tree. The content lint guarantees any substance that can cross into
`seed` has a `tile` block of its own, so the trunk can always be mined back
out.

## A missing band is skipped rather than cleared

`model/growth.js#write.clear` needs the band record itself to rebuild the key,
so there is no honest way to delete an entry whose band is gone. It is also not
reachable in a correct build: the only thing that destroys a band record is
`newRun`, which clears the growth ledger in the same teardown block. If that
branch ever runs, the clear has been removed.

## The swept collision in `rules/items.js`

The previous version integrated in one shot and point-sampled the tile under
the item's new position. At terminal velocity (400 px/s) and a 30 ms frame an
item travels 12 px, which is one and a half tiles — so a one-tile floor could
be entirely stepped over, and ore mined above a thin ledge fell through it into
the cavern below. Invisible at 60 fps and reproducible the moment the tab lost
focus.

The sweep splits motion into substeps no longer than half a tile, so no solid
tile can be skipped regardless of dt. The cost is up to a handful of probes per
item per frame against hundreds of items — measured in microseconds.
