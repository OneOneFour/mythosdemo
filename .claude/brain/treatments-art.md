# The treatment table's art decisions

Salvaged from `src/view/treatments.js` when its per-treatment essays were cut.

## Why `EXTENT` is authoritative rather than descriptive

A treatment that draws OUTSIDE its own cell is clipped by the chunk canvas it
is drawing into, and the neighbouring chunk does not independently redraw the
missing part. Those pixels are **permanently lost, silently, with no error and
nothing visual to notice it by.** Read straight off two adjacent chunk
canvases: at seed 1, tile (7,17), the canopy's top row was out of bounds in its
owning chunk and fully transparent in the chunk above.

So every decoration declares its maximum reach in tiles, and `view/paint.js`
scans a margin that wide before deciding a chunk is finished. The treatments
CLAMP their own data-supplied `w`/`h` against it, so a content row cannot ask
for a canopy the margin does not cover. `paint.js` takes the largest, so this
table is the only thing that has to be right.

`EXTENT` does NOT apply to machine parts: a machine is drawn live into the
frame and never baked into a chunk canvas, so there is no seam to be clipped
at. What bounds a part is its own footprint, and one that draws outside it — a
hub's cable lugs, an axle's end teeth — is drawing over the world on purpose.

## Colour params must use the keys the content lint knows

`body`, `trim`, `base`, `hi`, `lo`, `col`, `low`, `dark`, `face`, `contact`. A
colour under any other key is not a syntax error, it is an UNCHECKED colour —
it would throw from `colour()` the first time the part painted, at whatever
depth that happened to be. Moving that failure to import time is what the lint
assertion exists for.

The ladder proposal originally named `rail:` and `rung:`, which are not colour
keys and would have been exactly that unchecked case.

## The canopy is a THIRD shape, not either of the two before it

What was there was a flat `w × h` rectangle of two greens, chosen over the
preserved mockup's `oliveTree()` — 26 polar-scattered 2×2 dots, which read as
fuzz rather than as a tree at this viewport. That objection stands. So does the
rectangle's own problem: it reads as a rectangle. Reverting would trade one
wrong answer for the other.

The third shape is a UNION OF A FEW BLOBS, eroded at the rim. Solid interior,
so it holds together at 8 px to the tile the way the dot cloud never did; a
ragged outline, so it is not a rectangle. `CANOPY_BLOBS` is a FIXED layout —
five overlapping discs in a deliberately lopsided fan — rather than a per-pixel
scatter, and that is the whole difference: **the silhouette is designed and
only its edge is random.** Olives are sparse, silver-green and irregular, so
the fan leans, the two upper blobs are small, and the highlight tone gets a
scatter of flecks where the light catches.

**Three tones, one sun.** Underside shade, body, sun-side highlight, chosen per
pixel from its offset within its own blob projected onto `core/pixels.js#LIGHT`
— no second light direction, and no baked-in "top course is lighter", which is
what the rectangle did and why it read as a lit box rather than a lit sphere.

Everything is positional over BAND pixel coordinates and never the chunk's own,
so the same crown is identical from either side of a seam. Without that, a tree
straddling a chunk boundary would be two different trees meeting in the middle.

## The turf cap is a CAP, not a fringe

What it used to draw was two pixels of green on a tile's top edge, which reads
as a line ruled along the ground rather than as ground. The older look it
recovers was a FULL band — a whole tile of bright green over a darker green
lower edge, with a `noiseFill` speckle over both and 1 px tufts above. Same
three parts now, per tile instead of screen-wide, so it steps with relief
instead of running flat.

**And it DRAPES over a lip.** A hillside is otherwise a stack of cut cubes: the
turf stops dead at the top face and the vertical face below is bare subsoil.
Where a tile has an open side and solid rock beneath, the turf runs a few
pixels down that face, ragged, which is the one detail that makes a step read
as a bank of earth. That drape is why `EXTENT.grassCap` is 1 tile and not 0.

**And it BANKS across a one-tile step.** The drape softens a riser; it cannot
change the silhouette, and the silhouette is where a hillside reads as a flight
of stairs.

## The bank is paint, and the slope limit cannot be relaxed

The ±1-tile-per-column slope limit is fixed, because `rules/player.js#moveX`'s
auto-step clears exactly one tile and a 2-tile rise is a wall the hills would
stop being walkable over. All that limit can draw is treads and risers, and at
8 px to the tile a run of them is a staircase.

So the bank fills the notch over the lower tread on the diagonal, one pixel
wider per row down, hugging the riser, in the turf the tread already wears. The
outline then runs level, diagonal, level, and two steps join into one bank. The
cells stay AIR, so collision, the auto-step and the fall table are untouched
and the player walks through a bank exactly as they walk through a canopy.

`TURF_LIT` px of each row stay in the bright tone, measured from the OUTER end,
because that end is the surface and the rest is under it.

## The ladder's rung pitch comes from the ABSOLUTE band row

`c.ty * c.tile + y`, never a counter starting at each tile's own top edge. A
3-row pitch computed per tile restarts at every tile boundary: six stacked
tiles then show six identical 8 px patterns whose joins stutter, and a ladder
placed one row lower than the one above does not line up with it. Derived from
the band row, a column of any length is ONE ladder, continuous across every
seam at any starting row.

**No jitter and no hash, deliberately.** Everything else painted into a chunk
canvas is geology and is roughened positionally; a ladder is the one thing down
there somebody MADE, and straight rails are what say so at 8 px.

`every`/`tread`/`inset` are what make the two tiers read apart: timber pegs are
1 px rungs between inset rails, a bronze stair is a 2 px tread between rails on
the tile's own edges. One function, two rows of data.

## The toothed wheel is the whole machine family

The hub's big drive gear, a 1×1 gear, an axle's two end gears and the crank's
boss are all one function at four sizes.

**Teeth reach past the footprint on the four orthogonal axes,** and that is the
entire art-teaches-the-rule requirement, since diagonals do not conduct. `rt`
defaults to half the tile past the wheel's rim, so two gears in ORTHOGONALLY
adjacent tiles have teeth overlapping in the gap between them, while two
DIAGONALLY adjacent are 1.41 tiles apart centre to centre and leave a plain
gap. Nothing declares "these mesh"; the geometry does.

**Tooth count is tied to the angle grid, not to size:** `teeth` multiples of 4
keep one tooth on each axis at phase 0, which is what makes an unpowered train
read as meshed rather than as coincidentally close.

Rotation is `c.turn` and nothing else. Before placement it is 0 and every wheel
draws at phase 0, which is correct rather than a placeholder.

## The halo is the one non-integer effect in the project

Additive light rather than geometry, so it cannot produce a half-pixel edge. A
SLOW PULSE rather than a flash when the caller has a clock to give it — an item
or machine-part context does, a bare terrain cell does not, and the base alpha
is exactly what a still relic in a screenshot-diffed baseline should be.
Derived from the clock plus a hash of the cell's own position, so two relics on
screen do not breathe in lockstep.
