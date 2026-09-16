# The motion law, and the one place it deviates from the plan

Salvaged from `src/rules/drive.js` when its 75-line header was cut.

## The law

```
need    = segBase + segLoad * mass * slope
supply  = the component's torque, from active cranks, gear loss per hop
demand  = the component's total `need`, summed over its segments
drive   = demand > 0 ? min(1, supply / demand) : 0
surplus = supply - need

surplus > 0  ->  ascend  at segUp * min(1, surplus / segBase) * drive
surplus == 0 ->  hold still
surplus < 0  ->  descend at segDown * min(1, -surplus / segBase) * slope
```

## The deviation is the `* drive` factor on the ASCENT case

Two sections of the plan cannot both be implemented literally.

One apportions `supply` across a component's segments in proportion to their
own `need`, which makes `surplus` identically `need * (supply/demand - 1)`. Its
SIGN is then uniform across the component, so two identical segments sharing
one crank do not slow down — they STOP. That contradicts the other section's
own worked example, "one crank feeding three segments through gears turns all
three at a third speed", and the acceptance walkthrough.

Conversely `drive` alone cannot make a loaded carrier run BACKWARDS, which is
the correction the brief exists for.

So `surplus`, over the WHOLE component supply and unapportioned, decides the
DIRECTION and the descent magnitude; `drive` decides how much of the
drivetrain's capacity an ascending segment gets. Sharing a crank between two
segments halves `drive` and therefore halves the climb, and no combination can
ever exceed `eff('segUp')`.

## There is no `descend()` and no charge gate

Weighted descent is what the expression already produces at zero supply —
`surplus` is then `-need`, which is at least `segBase`, so an unpowered
vertical segment descends at the full `segDown`. A second code path would be
two rules for one fact. A horizontal segment gets that same descent multiplied
by `slope = 0` and therefore sits still, with no horizontal special case
anywhere.

## Manual only, and that was explicitly asked for

The only power source in the game is a crank the player is standing at and
holding down. No heart-powered fallback, no banked charge, no passive source of
any kind: the cost of raising anything is the player's own attention, and
`active()` is the whole of it. A generator, when it exists, is one more
predicate in that function and changes nothing else in this file.

## Load is physical, not a permission

Boarding is never refused at any weight. An over-cap rider is real mass in
`massOf`, so the carrier slows, stalls and then runs backwards under them — the
premise enforced by arithmetic instead of by a refusal. The only thing said out
loud is `'TOO HEAVY TO LIFT'`, and only in the one state that is otherwise
baffling: a crank is being turned and the thing is going DOWN anyway.

## Nothing here could grow into a world-spanning elevator

Motion is per SEGMENT, a segment joins exactly two hubs, and a chain is a
derived query that nothing in this file reads.

## Every crank within reach turns

Holding one key at a junction of two cranks turns both, which is a legitimate
build rather than a loophole: each still contributes only its own torque.
`overlaps(playerBox(), m.box, def.crank.reach)` is the same call `handFeed`
makes, so "close enough to turn" and "close enough to feed" cannot disagree
about touching.

## Determinism

No `rand()`. Iteration is `segments` order (link order) and `machines` order
(placement order), and `m.turn` accumulates from `dt` alone, so a gear's
rotation phase is reproducible from the seed and the frame count.

## The headframe exemption, and the bug it fixed

A translation is not a move, so it asks the tile grid itself. A carrier's cable
can run within a pixel of solid rock — a 1-tile shaft is the ordinary case —
and pushing an unresolved position across a tile boundary is the ONE way this
file could put the player inside rock, which the 7,200-frame fuzz asserts never
happens. Refused rather than resolved: the carrier keeps going, the rider does
not, and by the next frame they are not over it and gravity has them.

`boxSolid` is DUPLICATED from `rules/player.js` rather than shared, because
siblings may not import each other — the identical trade `rules/machines.js`'s
`HARD_BREAK` mirror already accepted. Both read `solidAt` and the hitbox from
`model/player.js`, so the two can only disagree if someone edits one alone.

**The one exception is this segment's own two headframes.** Measured before the
fix, a 12-tile vertical pair built on real footing tiles with the player aboard
and a crank held: the rider stopped dead at world y 1632 with the carrier still
climbing, **34 px — 4.25 tile rows — below the deck it was supposed to arrive
on**, then detached and fell back down the shaft.

The cause is three facts, the same three that blocked the cable with one
swapped: the anchor sits on a tile COLUMN boundary, the player's 6 px box
straddles that boundary, and `footing:1` requires a solid tile directly under
the upper hub's footprint. So a rider approaching the top always has that
footing tile inside their box, whichever column holds it, and the translation
was always refused. That made "the player rides up and steps off onto astral's
floor" physically unreachable.

**It is the same narrow exemption and not a collision change.** The exempt
tiles are `model/segments.js#headframe`'s, imported rather than re-derived, so
the rider may pass exactly the tiles the cable may pass and not one more. Of
those, the rows inside the footprint are required CLEAR by `placementCheck`, so
the only tile that can actually be solid is the footing row — one row, two
tiles, per endpoint. `solidAt` is untouched, `rules/player.js`'s own `boxSolid`
is untouched, and nothing outside a ride translation on THIS segment sees any
of it.

**A rider cannot get stuck in the tile they pass through,** which is the one
thing that would make this worse than the bug it fixes. The rows above the
footing row are required clear, so a box overlapping it always has its top half
in proven air, and every way out resolves in one frame through code this
exemption does not touch — gravity moves them down into the clear row below, a
hop bonks the ceiling case and snaps them flush to the footing row's lower
boundary, and `moveX` refuses so they cannot walk further in. Measured: a rider
who hops mid-headframe is out of the tile on the next frame.

## Which component drives a cross-component segment

The one supplying more torque, `seg.a`'s on a tie. A segment's two hubs can sit
in different bands and therefore in different components — a surface-to-astral
span is the ordinary case — and both ends pull on the same cable. Taking the
GREATER rather than the SUM is the conservative reading: two half-fed
drivetrains at opposite ends of a cable do not add up to a free ride.

## A band handoff is a respawn at the same world pixel

The only sanctioned way to change an item's band. Done the moment the carrier's
own band changes rather than only on arrival, because `it.band` is which band's
tiles an item collides against, and a resting item on the wrong side of a seam
is a wake-up waiting to happen.

## The topology cache

A module-local `WeakMap` keyed by the BAND OBJECT and invalidated by a
signature recomputed every frame. Keyed by the object and not by `b.ord`
deliberately: `newRun()` always hands out fresh band records, so a stale entry
cannot be read back into a live run and there is no reset call to wire up or
forget.

What is cached is the TOPOLOGY only — the component partition, and per crank
the path of nodes between it and its nearest hub. Every NUMBER on that path is
still read through `eff()` per frame, so a modifier is never one frame stale.
The partition changes only when a machine is placed or removed; the crank's own
activity changes every frame and is deliberately not cached at all.

Node counts are in the TENS, so the flood is O(n²) and the path search is a
plain BFS.

## The headframe exemption, from the cable's side

Salvaged from `src/model/segments.js`.

**A hub's own footing tile does not block a cable leaving that hub.** Without
the exemption a straight vertical link between two LEGALLY PLACED hubs is
impossible: the anchor is the footprint's centre, so a span from below
terminates one row above the footprint's bottom, and `footing:1` requires a
solid tile directly under that footprint.

Measured, 12 tiles apart on flat ground: `ok` with no footing at all — that is,
only where the upper hub could not legally have been built — and 'THE PATH IS
BLOCKED' at the footing row's own lower boundary with the footing under either
column or both. That is the `footing:2` defect recurring at `footing:1`:
dropping 2 to 1 fixed the one instance, and the boundary sampling correctly
reopened the class.

**Why the exemption is sound — three facts, not a tolerance.**

1. The FOOTPRINT is required CLEAR by `placementCheck`'s first loop, so the
   rows at and below the anchor inside it hold nothing to hide.
2. The FOOTING TILE is required PRESENT, so the one tile this hides is a tile
   the game itself insisted on — refusing the cable because of it refuses the
   player their own floor.
3. The drawn cable LEAVES THE HEADFRAME. A headframe straddles its own shaft
   mouth, and a bucket rising into one passes the floor it is bolted to.

The blind spot is therefore EXACTLY the footing row's tiles under each
endpoint, two per hub, each immediately under a machine with a required-clear
footprint above it.

**Why not the alternatives.** Moving the anchor off the footprint centre breaks
the locked anchor and moves every carrier and every baseline. Teaching the lean
leaves the most obvious build — hubs stacked straight up — refusing, and
pointing at a tile the player deliberately placed as the hub's floor.
`footing:0` floats hubs in mid-air and kills the headframe reading outright.

Stated as TILES rather than as a sample window, so "exactly two tiles per
endpoint" is the code and not a consequence of it.

## Why both tiles sharing an exact boundary are sampled

A hub's anchor is `box.x + w/2`, exactly on a tile-column boundary for any EVEN
footing, which every hub today is. So a straight vertical or horizontal link
between two same-footing hubs samples its whole length astride a grid line, and
`Math.floor()` has to pick one of the two tiles that share it — consistently,
which means the OTHER one is never sampled at all.

Confirmed live: a solid tile placed in the column the floor happened not to
pick was invisible to every sample the sweep took. Both tiles sharing an exact
boundary are equally "on" the line a player sees the cable drawn along, so both
must be checked. `EPS` is world px, far below anything a seeded RNG or a real
placement could land on by coincidence, so it only fires for a
genuinely boundary-exact sample.
