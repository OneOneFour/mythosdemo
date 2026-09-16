# Worldgen decisions and the numbers behind them

Salvaged from `src/rules/generate.js` when its per-pass essays were cut. The
file keeps each constraint; this holds the derivations and the two bugs worth
remembering.

## `SHELF_R` is 9, not 6

Half-width in tiles of the guaranteed flat shelf around the spawn column. The
first two minutes must not depend on the seed — a ragged lip or a tree where
the player wakes is the difference between "walk" and "fall".

It was 6 while the whole surface was flat, ported from the flat prototype's own
`SPAWN_TX ± 9`. Once the ground either side actually undulates, 13 columns is
not enough to stand on and place a 3×2 furnace at arm's length, because the aim
reticle reaches 3.2 tiles and the footprint is three wide. 19 columns is.

## Do not go back to summing octaves

Four passes build a landform: a trend octave decides where the uplands and
lowlands are, discrete raised-cosine summits sit on top of it, two 1-2-1 passes
smooth the float profile, and a clamp to the strata row's own budget flattens
the extremes into a valley floor and the odd plateau. Then the shelf is pinned,
the relief blended either side of it, and the step pass sweeps outward.

The three-octave sum this replaced ran a 5-tile period and then flipped an
independent one-row coin per column, so the ground changed direction 37 to 52
times per 128 columns and read as sawtooth rather than as terrain.

## `dens` is attempts per 10,000 tiles, not a count

An absolute count is diluted by every widening. `tw` went from 128 to 1,024 and
the same ore sat in eight times the rock, at an eighth of the ore per screen,
while every worldgen property stayed green because each one is a floor. What a
player experiences is content per screen, and a density is what holds that
fixed.

## `hash2` is deliberately absent from this file

It is stateless, so it would hand every seed the identical hills and the
identical strata fingers. All randomness goes through `rand()` in a fixed
traversal order — bands in declaration order, strata rows in row order, columns
left to right — and a run is bit-reproducible from its seed only because that
order is fixed here rather than emergent.

## Two bugs this file's passes were built to avoid

**A stratum boundary's air pockets.** `fromTy` is the ground line when a layer
is the topmost, which is why the top row gets the ragged lip by default.
Without the `lip:false` opt-out, giving a band's stone layer its own `fromTy`
— to sit under a shallow soil cap, say — punched random air pockets along the
seam, because the lip check cannot tell "top of my own range" from "top of the
world". Relief does not resurrect it: the lip is still the one top row of the
row's own range, and all the height map changes is which row that is per
column.

Two adjacent layers cannot part company, because a boundary's offset is a
function of the DECLARED row, so the upper row's `toTy` and the lower row's
`fromTy` resolve to the identical shifted row.

**Ore sealed by a higher tier.** `star()` overwrites whatever a cell held, with
no memory of what was there — correct for a `blobs` row painting over plain
rock, but it means a later, higher-tier row can box in an earlier, lower-tier
ore tile by overwriting its neighbours without ever touching the ore tile
itself. The reachability property found this for real: a copper or tin tile
sealed by granite or adamant in about 2.5% of seeds, unreachable by the tool
that can mine every other copper or tin tile in the world.

Scoped to `metal`-tagged substances specifically rather than every solid tile.
Plain rock surrounded by a higher tier is the ordinary shape of a deposit, not
a defect; it is the ORE the player is guaranteed a tool-appropriate path to.

**A one-hop fix was tried first and was not enough.** Opening a single
neighbour to `stone` fixed 4 of the 5 seeds, but the 5th had a shell more than
one tile thick, and "is my immediate neighbour clear" cannot know that — the
neighbour it opened was itself still sealed, one layer removed. `reachesAir` is
the honest version: a real flood-fill through tiles already diggable at this
ore's own tier, exactly the claim the property test checks, so the repair can
never again believe a tile is unsealed when the checker would disagree. When it
says no, `carvePathToStone` runs a SECOND, unrestricted flood-fill through any
tile at any tier to find the nearest open air, and carves every tile of that
shortest path down to plain tier-1 `stone` — a contiguous, always-diggable
corridor rather than a hope that one opened cell leads somewhere.

## Summits and groves both slice the band

**Summits.** `tw / HILL_SPACING` raised-cosine summits, three draws each —
centre, height, width — in that fixed order, because seed reproducibility
depends on it. Each takes one column at random from its OWN slice of the band,
so spacing still reads as irregular while a uniform scatter over the whole band
left one seed in three with a 70-column dead plain. A summit the band edge
clips is kept as drawn, because a hill running off the map is a hill and
rejecting it would bias every band toward flat edges.

**Groves.** One centre per slice of `spacing` columns, at a random column
inside it, covering `spread` either side. Trees come in stands because a trunk
is a WALL, and the free ground between two stands is the distance a walker
covers. A centre landing on the spawn shelf is pushed clear rather than
filtered, because deleting such a grove's trees column by column would leave
the first two minutes with no timber in reach.

## The contact zone is deliberately not smoothed

A strata boundary is a band `thick` tiles deep where two materials
interdigitate in blocky fingers. Ported in effect from the flat prototype's two
`hash2` flip windows and re-expressed as a probability ramp rather than a flat
35% chance, with `rand()` rather than `hash2` and a per-column bias, so the
result is fingers rather than static.

`at` is the DECLARED boundary row and `thick` is content's rather than the
interpreter's, so a gradational soil/stone seam and a sharp granite/adamant one
are two rows with two numbers rather than two code paths. The consequence is
deliberate: a shaft through a contact hits alternating hardness, so the dig
slows and speeds unpredictably.

## Cruciform ore is new, not a port

A centre cell plus 4-8 arms of length 1-2, orthogonals first, so a small
cluster is a plus sign and a big one a star — the same species at every size
and no two identical. `r` is the same `r:[min,max]` draw the round disc it
replaced used, so tier sizing stayed content. The disc was the shape from the
mockup onward; cruciform ore has never existed here before.

## Nothing marks a hollow as hidden

A hollow is unseen because `b.seen` is false, dark because `rules/light.js`
says so, and un-flooded because `rules/reveal.js#passB` will not enqueue past
its first ring without light. Carve the air; those three make it a discovery.

A hollow is built as a cell list, then judged, then written, so "backfilled
entirely" is "never carved" — the same world and one pass fewer.
