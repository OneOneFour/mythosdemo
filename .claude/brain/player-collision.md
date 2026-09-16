# Band seams, the handoff, and the two bugs that shaped `rules/player.js`

Salvaged from `src/rules/player.js` when its essays were cut. The file keeps
each constraint; this holds the measurements and the failures.

## The band handoff was two leading-edge tests, and it oscillated

It used to hand off DOWN once the feet reached the band's bottom edge and UP
once the head rose past its top edge. Both are true at once for the whole 15 px
a 16 px hitbox spends straddling a seam, so a player crossing one flipped band
EVERY FRAME — and each flip resolved collision against a grid that answered
BEDROCK for the half of the box hanging out of it, snapping them back up flush
to the seam with `vy` zeroed.

**Measured before the fix**, free-falling down a cleared shaft into the
surface/topsoil seam: **154 band flips in 200 frames**, y oscillating between
752 and 753, never descending a pixel. A ladder out of topsoil stalled
identically at 767/768. That was the reported "dig from layer II to III and you
teleport up".

The fix is ONE QUERY ABOUT ONE POINT. `model/world.js#bandAt` is the only thing
that knows bands share a single vertical space, and bands do not overlap, so
the hitbox CENTRE is in at most one of them and there is no position two bands
can both claim.

Handing off into ROCK is no longer a case to guard, which is why the old
`!solidAt(...)` test is gone rather than moved: the probes read the same tiles
from either side of a seam, so a handoff cannot change what the hitbox is
embedded in. It picks which grid is the fast path and which band mining, aim
and the camera are about. Bookkeeping, not a physical event, and it must not be
able to argue with itself.

## Why every probe walks WORLD rows rather than band rows

The hitbox is 16 px tall and a band boundary is a line, so for 15 px of every
crossing the box is in two bands at once. A band's own grid cannot answer for
the half outside it and does not try: `model/tiles.js#tileAt` reports BEDROCK
past its last row and AIR above its first.

Both are the right answer at the edge of the WORLD and a lie at a seam. The
bedrock lie is a phantom floor that stops a descending player dead; the air lie
takes the last two rungs off a ladder climbing out of the band below. Neither
band is the one to ask — the band that OWNS THE ROW is. Every frame that is not
a crossing pays one range test for that.

**Only ROWS are split, because a seam is horizontal.** Each row's columns are
addressed in that row's own band, but the flush snap in `moveX` still reads the
CURRENT band's column lattice. That is exact while adjacent bands agree on
`tile` and `origin.x` — all three rows are tile 8 at x 0 today — and it is the
same assumption the auto-step's `b.tile` rise already makes. A band inset or
scaled relative to its neighbour would need `moveX` to learn which band stopped
it.

Falling back to the current band when `bandAt` returns null is today's
out-of-world convention restated, not a new one, which is why null is not a
special case. It covers the horizontal case for free: a neighbouring band that
does not span this column is not a place to fall into, and reads as the edge of
the world, which is what it is.

## The fall table is exact, not approximate

Impact speed is derived from the DISTANCE FALLEN rather than a per-frame
velocity sample, so the same drop costs the same hearts at any framerate.

```
 40 px ( 5 tiles) -> sqrt(2*320*40)  = 160 px/s -> 0 hearts
 64 px ( 8 tiles) -> sqrt(2*320*64)  = 202 px/s -> 1 heart
160 px (20 tiles) -> sqrt(2*320*160) = 320 px/s -> 5 hearts, lethal
```

Both landings snap flush to a tile boundary, so `fallen` is always an exact
multiple of the tile size and the boundary cases land ON the numbers.

## A carrier's deck is a floor, resolved after `moveY`

`moveY` only consults the tile grid and would otherwise report standing over
open air. `onGround` true is what pins `fallFrom`, which is the whole of "no
fall damage accrues while riding" — no new code in `land()`, and the frame
after stepping off, gravity and the fall-damage curve resume with none either.

`land()` still fires for the frame the player ARRIVES on a deck out of a fall,
so dropping onto a bucket costs exactly what dropping onto rock from the same
height costs. A carrier is a surface, not a safety net.

**Re-queried after the move, not trusted from the top of the frame,** because
`moveX` may have walked the player straight off the deck's edge, and the whole
promise of "walking off resumes gravity on the very next frame" is that nothing
keeps holding them up once they are not over it.

## Three places burden is deliberately NOT read

1. **Boarding a carrier**, at any weight. An over-cap rider is mass in
   `rules/drive.js`'s arithmetic, and the carrier runs backwards under them
   instead of a refusal saying so.
2. **Hopping OFF a carrier.** A hop is a hop, and an over-cap player standing
   on a sinking bucket must be able to step off onto the ledge beside them. Off
   the ground it is refused as it always was.
3. **The one-tile auto-step.** Gating a height gain on state is exactly what
   wedged a player in their own shaft permanently, and an over-cap player must
   still be able to walk over rubble to reach the ledge where they can drop
   material back under the cap.

A ladder WINS over a carrier: the player pressing up or down on a rung has said
which mechanic they mean, and a shaft with both in it is a shaft they can
always climb by hand.

## The fifth backing satisfier is opted into by the FORM

A ladder needs something to hang from — rock beside or above it, or another
climbable tile to join — and THE ONE BELOW COUNTS TOO, because that is the
direction you build climbing out of your own shaft. Without it the last two
rungs cannot be placed and the shaft becomes a grave.

A `tile.roots` form is additionally backed by a solid tile DIRECTLY BELOW,
because a seed dropped on flat ground has soil beneath it and air on all three
other sides.

**It is a key on the row and not a sixth clause in the shared predicate, and
that is the whole point.** `solidAt(band, tx, ty + 1)` added unconditionally
would let a `rung` be placed standing on a floor with nothing beside it — a
real change to how a ladder is built, in the one function recorded as wedging a
player in their own shaft — and it would let a `block` be stacked on a floor
with no wall to key into. Gated on the form's own key,
`rung`/`stair`/`block` placement is BIT-IDENTICAL, since none carries `roots`
and the added term short-circuits before the read.

## Deconstruct returns the machine, not its materials

A machine proven EMPTY gives its own `<id>/rig` pair back, exactly one unit.
Picking up and relocating a machine is "mine it back out as the same item you
built", not "get raw materials back". A machine still holding anything refuses
with a reason, so nobody discovers ore has quietly vanished into the abyss
along with the machine holding it.

"Empty" is `m.buf` having no keys and `m.charges === 0` — the same two fields
`rules/machines.js` treats as "holding something". `m.made` is a lifetime
counter and `m.prog` cannot be nonzero with an empty buffer, so neither is part
of the test.

**A removed hub cannot leave a dangling segment.** A segment holds the two hub
RECORDS, so the instant one stops being in `machines` every query over it reads
a ghost. Cables are cut after the empty-check and before the removal, so the
order reads "prove it is empty, pay the refund, cut the cables, then remove".

A rider aboard a cut segment simply FALLS, and deconstruct does not refuse while
one is aboard. Gravity is the answer and the fall curve already exists to be
the consequence. No journal row, because the removal row already reports the
event and "and its cables went with it" is not news about a different one.

**The cable is free.** The hubs are priced and the span between them costs
nothing but reach, so unlike a machine placement there is nothing to spend and
no ordering question about when to spend it.
