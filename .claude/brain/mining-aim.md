# The keyboard aim's four resolvers, and the bugs each one fixed

Salvaged from `src/rules/mining.js` when its resolver essays were cut. The
hitbox is 6 × 16 px on an 8 px tile, so it straddles two columns and fills two
rows, and a single centre point picks the wrong one of the pair. Each resolver
exists for a measured failure.

## `resolveStraightDown` picks the COLUMN

It targets whichever of the two straddled columns is CURRENTLY solid at the row
just below the feet, recomputed fresh every call. Once the targeted column
breaks, the next resolve finds it no longer solid and retargets the other, so
the two break SEQUENTIALLY at their normal one-tile cost each — never both at
once for the price of one. When the player is tile-aligned, or neither column
blocks, it degenerates to the same centre-x column the old unconditional
resolve used, so aligned play is unchanged.

`PW` is 6 px against an 8 px tile, and continuous never-grid-snapped walk
physics almost never leaves `player.x` a multiple of the tile size. So a fixed
centre-x column broke one of the two columns `boxSolid` tests and left the
other solid forever — the player then stood wedged on what read as open air
from directly overhead.

## `resolveFacing` picks the ROW

`PH` is 16 px on an 8 px tile, so the body fills two rows and only one need
hold the tile in the way. It takes the first OCCUPIED of the two in the faced
column, centre row first and the row above second, so a wall comes down
belly-height and then head-height.

**Probing only the centre row is why a keyboard player could not clear anything
two tiles tall.** Holding right + dig broke the belly tile, the aim then found
the air it had just made, and the head-height tile was never targeted — 400 s
of right + dig moved the player exactly as far as `right` alone on 12 seeds.
The second probe is what makes the aim ADVANCE through an obstacle rather than
expire on its own work.

Both probes sit inside `eff('reach')` by construction. The centre row contains
`c.y` and the row above ends at or below `player.y`, so both overlap the
hitbox, and the furthest tile centre either can name is hypot(12, 11) = 16.3 px
against a reach of 25.6.

**OCCUPIED means not air rather than `solidAt`.** A non-solid tile in the faced
column — a pegged rung, a sapling — is a legitimate thing to swing at, and it
is what the centre-row probe has always hit, so preferring a solid tile one row
above would retarget swings that already land.

## `resolveStraightUp` reaches TWO rows

`cmd.up` resolved to `centre.y - tile` before this existed, which is
`player.y` — always the topmost row the body itself fills, never a row above
it. So digging up under rock broke nothing at all: 0 tiles in 20 s of held up +
dig in a carved pocket, against 4 for down + dig in the same scene. It read as
working only because a player on a ladder mines the rung at head height, and
that case is this function's fallback.

The second row is what makes a two-tile ceiling come down. Breaking the first
leaves the player exactly where they were — down is free and up needs a
ladder — so a single probe would find the air it had just made and expire,
which is `resolveFacing`'s defect on the vertical axis.

Both rows sit inside reach by construction, measured from the body's top edge
rather than a row index, so an unaligned player mid-fall gets the row partly
above their head and the one above that. Over every sub-tile pose the furthest
tile centre either row can name is 22.1 px against a reach of 25.6. **A third
row reaches 29.8 px, past reach, so there are two.**

Straight down tests `solidAt` instead of "not air", because what that choice
prevents is standing wedged on a half-broken floor, and nothing stands on a
ceiling.

## The dig queue commits to one tile and finishes it

`nearestWithin` is asked only when nothing is committed — the same
decide-once hysteresis the pointerdown dispatch applies to itself. Re-deciding
every frame was measured and does not work: at `eff('walk')` a column is the
nearest mark for about 8 px of travel, 0.13 s against soil's 0.50 s, so a
player who painted a seam and ran along it finished nothing.

**A tile this pick cannot break LOSES its mark,** and that is the only thing
the queue does that a hand swing does not. `swing` returns false for a
tier-gated tile, and leaving the mark makes the nearest query hand back the
same impossible tile every substep forever — both a stalled queue and a mark
that reads as merely deferred. The refusal row is rate-limited, so a granite
drag says TOO HARD FOR THIS PICK once and then empties rather than 256 times.

## The seed drop, and why it is code rather than a `DROPS` row

`data/drops.js` is the existing "mining X also drops Y" hook and it was
considered first. A row sees the SUBSTANCE and TIER of the tile just broken and
nothing else. "The last remaining trunk tile" is a fact about the COLUMN, which
no row can express and which the table must not be bent to try.

**Two neighbour reads, not a column scan.** A trunk is a contiguous vertical
run felled one tile at a time from either end or the middle outward, so the
last tile standing is by definition the one with no trunk above and none below.
Two reads, no loop, no state, correct for every felling order. The tile clear
has already run, so both reads see the world AFTER this tile went.

**`formAt(...) === NATIVE` is the half that keeps a placed ladder out.** `subOf`
reads `timber` for a `timber/rung` tile exactly as for a trunk, so without the
NATIVE test a player could peg rungs into a wall and mine them back out for
free seeds.

**Where this sits in the `rand()` stream matters.** It is AFTER the ordinary
material drop and BEFORE the `DROPS` loop, so the rare-trinket roll keeps its
exact position relative to that drop — the property the drop odds were measured
against. The two draws the seed toss consumes are a fixed insertion rather than
a moving one. It does change what an existing seed produces downstream of the
first tree ever felled, which adding any new spawn to that branch must;
determinism requires only that `newRun(s)` twice match, and it does.
