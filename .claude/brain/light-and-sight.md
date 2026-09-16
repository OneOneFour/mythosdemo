# Light, sight, and the throttles that make them affordable

Salvaged from `src/rules/light.js` and `src/rules/reveal.js` when their headers
were cut. Two separate facts: `b.seen` is MEMORY, `b.light` is a CURRENT
CONDITION.

## Light propagation is Dial's algorithm, not a plain BFS

A multi-source flood from every emitter — every tile open to its own band's
sky, every lit machine, the player's tile while a brand burns, and row 0 at
whatever the band above carried down — decrementing `lightFalloffAir` per tile
of open air and `lightFalloffRock` per tile of solid rock, so light does not
leak through strata the way sight already does not.

Levels are small bounded integers, so a level-indexed array of queues walked
brightest-to-dimmest replaces a real priority queue at no cost. A plain BFS
cannot do it: a WEIGHTED spread, where rock costs three times what air does,
cannot be visited in insertion order the way the unweighted sight flood can.

**A band's row 0 is not sky.** Only a band carrying sky of its own seeds
daylight; `topsoil`'s row 0 is buried under the surface band's rock and is lit
only by what reaches it.

## The light recompute's dirty check is two independent things

Both are cheap to check every frame even when nothing changed.

1. **The band's own chunk versions,** summed over every chunk — not just the
   ones near the player, because a distant emitter's light can pass through a
   tunnel dug anywhere in the band.
2. **A SIGNATURE of the active emitter set** — position and level of every lit
   machine plus the carried brand — because an emitter turning on or off, or a
   fuel charge running out, never touches a tile byte and would otherwise be
   invisible to a version check.

Whichever band changed recomputes, plus the band below it, whose row 0 reads
the changed field across the seam. Most frames none does.

## Pass A: open sky, and the gate that asks about the WORLD

Gated on a cheap check first — `worldSkyAt` on the player's own occupied tiles
only. A player underground, the common case, never pays for the band-wide pass.

**The gate asks about the WORLD, not this band's own grid.** `skyExposedAt`
stops at row 0 of whatever band it was handed, and `topsoil`'s row 0 is buried
under 28 rows of surface rock — so a player 38 tiles down their own shaft
satisfied it and un-fogged the band's whole row 0, a full band width of rock
nothing had ever seen.

**The scan runs at most once per terrain change, not once per frame.** It is
O(band width) and its result is monotone, so re-running against an unchanged
grid reveals nothing new. `b.ver` summed over every chunk is the same signal
the light dirty check uses, and it is the WHOLE band rather than the player's
neighbourhood because a shaft dug anywhere lengthens that column's scan. The
player walking into and out of sunlight is NOT a reason to rerun — the scan
never depended on where they stood.

**Every band above this one is in the sum too,** because `worldSkyAt` walks up
through their rock for a band carrying no sky of its own. A tile broken in
`surface` can open a `topsoil` column to daylight without touching one
`topsoil` chunk version, and a sum over this band alone would skip the rescan
that notices.

This is a throttle and not a radius cull. Pass A's contract is that open air
obstructs nothing, so a radius would change what the player sees; the throttle
changes only how often the same answer is computed.

**One `worldSkyAt` per COLUMN, at row 0,** which is the cheapest row to ask
about — its in-band walk is empty. Never per TILE: that walks the column every
call and is close to quadratic over a band as deep as `topsoil`.

**REVEAL, THEN CHECK SOLID, in that order.** The ground you are standing on —
the first solid tile a column hits — has nothing solid above it and must be
revealed too, or the visible walkable surface would stay fogged everywhere
except the handful of tiles the local flood reaches, while the open air above
it was fully lit. A floating-sky-over-a-dark-strip bug the screenshots caught.

## Pass B: bounded local sight, and why a position-only cache is a bug

A 4-directional flood through non-solid neighbours up to a maximum GRAPH
distance — not a straight-line radius, and deliberately not shadowcasting,
which was considered and rejected as overkill for "somewhat visible, not the
whole cavern".

The player's own occupied tiles seed the flood at distance 0 and are always
revealed with their immediate neighbours regardless of solidity, which is
exactly the old radius-1 rule and is why this subsumes it. Past distance 0 a
SOLID tile is revealed — you can see the wall you are facing — but the flood
does not continue through it.

**The flood must not walk through UNLIT air,** or a player could map a
pitch-black cavern by standing in it. Past distance 1 a tile is only enqueued
for further exploration if it is lit at all. It is still REVEALED regardless —
visible because it is right there, but the flood does not continue past it into
the dark.

**Throttling on player position alone is a real bug.** Standing still and
digging SIDEWAYS through a wall is an ordinary play pattern, and the newly
opened tile is a WORLD change rather than a player movement. A position-only
cache would leave the space beyond that wall dark until the player physically
stepped into it — worse than the radius-1 rule it replaced, which simply
re-ran cheaply every frame.

So the cache key folds in a CHUNK VERSION, summed over the player's own chunk
plus its neighbours, since a dig at reach's edge can land in an adjacent chunk
on a seam. And `b.lightVer` folds into the same sum, because a brazier lighting
up or running dry never touches a tile byte — without it a newly-lit corridor
would stay dark until some unrelated nearby tile write forced a rerun.

**One throttle, one flood per straddled band.** The version sum and the tile
key both run over every span, so a crossing frame cannot be throttled away by
the half of the box that did not move. `home` is in the key BY OBJECT IDENTITY,
so a restart's fresh band records make the cache stale with no reset call to
forget.

## Occupied tiles, not one point

The hitbox is 6 × 16 px in an 8 px tile. 16 px is exactly two rows when
tile-aligned, but it need not be, so both passes walk every tile the box's
bounding rectangle overlaps — 2 most of the time, up to 4 straddling a seam on
both axes. A single point would shrink the seeded patch to follow the player's
waist and leave a foot or a head one tile short of what "standing here" means.

## No `rand()` anywhere in either file

The light BFS order is fixed by tile index inside each level's bucket, so two
runs of the same seed relight identically.

## Dial's algorithm, in detail

`buckets[lvl]` holds every tile index CURRENTLY BELIEVED to be at level `lvl`,
and levels only ever fall as the flood spreads — so processing buckets from
`max` down to 1 visits every tile at its FINAL, brightest level the first time
a live entry for it is popped. A tile can be pushed more than once at different
levels before its best one is processed, and `best[i] !== lvl` on pop is the
cheap way to ignore a since-beaten stale entry rather than searching a bucket
to remove it.

**The scratch field is the lit region's BOUNDING BOX, not the band.** `best`
was `Int8Array(b.tw * b.th)` per recompute, which is 320 KB for `topsoil` at
1,024 columns — allocated, walked and thrown away every time a tile broke
anywhere. It is now sized to the seeds' bounding box grown by `reach`, and
`topsoil` with no shaft to the surface and no lit machine has no seeds at all,
so it allocates nothing and floods nothing. Indices in `best` and the buckets
are WINDOW-LOCAL; the only absolute coordinates are the ones handed to
`solidAt` and `setLight`.

## The sky seed, and the seam carry

Only a band carrying sky of its own gets any. Walk DOWN from row 0 once per
COLUMN and stop after the first solid tile — `worldSkyAt` and `skyExposedAt`
both walk a whole column, and running either per tile over a band this deep is
close to quadratic. Every tile from row 0 to and including that first solid
tile has a clear path to the band's own sky, so all of them seed at `max`
rather than just the ground line.

`topsoil` carries no sky, and its row 0 used to seed at `max` under 28 rows of
surface rock at level 0. Nothing about the loop could tell: row 0 was the first
solid tile it looked at.

**The seam carry is what a buried row 0 gets instead.** Each column takes the
level the band above finished at one world row up, minus the cost of entering
this tile — the same falloff `relax` charges anywhere else, so a shaft through
the seam carries daylight down and solid rock over the seam carries nothing.
The band above has already settled this frame. Where no band lies above a
column the world really is open there, so it seeds at `max`, which covers the
topmost band and a column sticking out horizontally past the band above it.

**ONE DIRECTION ONLY.** A brazier below a seam does not light the rock above
it, because resolving both directions needs the flood iterated to a fixed point
across bands rather than one top-down pass.
