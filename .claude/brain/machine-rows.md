# The machine table's long-form notes

Salvaged from `src/data/machines.js` when its 164-line field key and its
per-row essays were cut to one line per key and one or two lines per row. The
file still carries the key itself; this holds the reasoning behind the rows and
the numbers.

## Field-key notes that did not fit one line

**`handFeed { reach, from }`.** `reach` px is what "standing beside it" means
and is read by BOTH hand paths. The real verb is deliberate: arm a held pair
with a click, aim, LMB, one unit per press (`rules/machines.js#handOne`). The
AUTOMATIC drain of the same block, one unit per selector per substep for merely
standing there, is `rules/machines.js#handFeed`, and it runs only while the
Character tab's AUTO FEED row is on, which defaults to off every run.

**`servo { over, mult }`.** This is what keeps buffers bounded. Without it
small surpluses accumulate to full over roughly 20 minutes.

**`hub { reach, carries }`.** A segment is not a machine: no footprint, no
buffer, no recipe. It lives in `model/segments.js` and is created by an action
between two hubs rather than placed. `carries` is data so a cheap
material-only chain needs no engine edit.

**`gear { loss }`.** The seam a generator eventually plugs into. `axle` is this
row with three tiles of reach for a third of the loss, which is content rather
than code.

**`glyph`.** Deliberately NOT nested inside `look`. A `variantOf` row is a
SHALLOW merge, so a variant that restates `look` to change its colours — which
is what nearly every variant exists to do — would silently lose a glyph nested
in it. At the top level a variant inherits the glyph it should and overrides it
only where the difference is the point.

**`light.level: 'max'`** is a sentinel meaning "read `eff('lightMax')` at tick
time". This file may not import `model/mods.js`, so a row that needs to track a
tunable rather than state a constant has to say the word and let the
interpreter resolve it.

**`mine { facing, tier, tiles, secs }`.** A gate on hardness, not a second
implementation of it. `rules/machines.js` chews with the same seconds-to-break
arithmetic `rules/mining.js` uses by hand. `tiles` is how tall the face is, one
tile at a time, topmost unbroken first, so a taller face is reach rather than
simultaneity. `secs` is how long one buffered fuel unit lasts, independent of
hardness — the "high fuel draw" difference between tiers is a smaller `secs`,
nothing about the break-speed formula.

**`band` against `minDepth`.** The coarse half of a pair, deliberately not
expressible as one. A negative `minDepth` would say "somewhere above the
surface datum" in arithmetic derived from a band's own `origin`/`floorTy`,
which drifts the moment a band moves. A band id cannot.

**`tribute {}`.** Empty on purpose rather than carrying a selector list,
because which pairs a receiver takes is already `ports.accepts`'s job and a
second copy could disagree. A tribute receiver is a SINK, a deliberate crossing
of the line `rules/machines.js` draws at "a machine that consumed its inputs
and produced nothing is a sink, not a recipe". It has `ports` and a `buffer`
and no `recipes`, so the interpreter accepts into it and never produces out of
it, and the director takes what accumulates.

## Append-only, and the one row ever deleted

Rows are append-only because the index is the id a save would store. One row
has been deleted — the winch stage, replaced by `hub`/`crank`/`gear`/`axle`.
That was safe only because nothing persisted an index at the time. A save
format now exists, so deleting a row is no longer free and a retired row must
be tombstoned instead.

## Tuning derivations

**`crank.torque: 1.5`**, and the half is what makes the mechanic work. At
exactly 1.0 the motion expression's three cases put a single crank on the knife
edge of an empty vertical carrier — `surplus` is exactly zero, the "hold still"
case, so one crank would raise nothing, while an unpowered carrier still needs
a full `segBase` of deficit to slide back at full `segDown`. Those two facts
require `crank.torque > segBase`, and 1.5 keeps every stated behaviour true at
once:

| load aboard | one crank |
|---|---|
| empty, or a few ore | climbs |
| ~20 T | exactly holds it |
| over 20 T | runs BACKWARDS under it |
| 40 T, the whole burden cap | needs 2.0, so more drivetrain |

20 T is half the burden cap, which is the honest statement of the trade. Ride
up with half a load, or crank a full one up empty-handed. A rider plus a full
load needs more drivetrain, which is the whole of "nothing makes ascent cheap".

**`hub.footing: 1`**, changed from 2. A headframe straddles the shaft mouth:
one column on solid ground, one over the void. At `footing:2` both columns had
to stand on rock, and the cable — which leaves from the footprint's centre,
down the right-hand column — ran into the hub's own footing tile one row below,
and `linkCheck` refused it with 'THE PATH IS BLOCKED'. With both columns
supported, no span steeper than 45 degrees can leave an upper hub at all, so
"a hub at the surface and a hub at the shaft floor" was unbuildable through
`rules/placement.js`. Screenshot baselines never caught it, because a scene
places machines directly through `model/machines.js#write.place`, which asks
nothing about footing. Found by physically performing the acceptance
walkthrough.

**`cyclops_maw.minDepth: 200`.** Adamant blobs start at topsoil row 220, which
is depth ~256 against the HUD's datum. 200 leaves room to place the machine on
the approach rather than only once standing in the vein. Its cost is priced in
granite-tier goods a T2 auger can reach, not adamant, because a machine
buildable only from the one material it alone can mine could never get built.

**`talos_head.secs: 12.0`** against **`cyclops_maw.secs: 3.0`.** A quarter, and
that is the "high fuel draw" the tier list names — a thirstier machine, not a
faster one. Both chew at the identical per-tile rate, because
`rules/machines.js#mine` reads `eff('pickPower') x bestHandToolPower()`, the
same two numbers a swinging player reads. Automation buys parallelism and
nothing else.

**`belt_r`'s price.** 2 plate and 4 gravel, denominated in the second
compression tier rather than raw ore, so a lane of belts is a plate-shipping
decision rather than a doorstep mat beside every machine. Flat cheap horizontal
logistics is the thing the project refuses to become.

## Two gates deliberately absent

**`press` has no `needs:{heat:{min}}` gate**, though the "sit a press above a
furnace" buoyant-heat pairing is exactly what `needs` exists for. Diffusion is
unimplemented: heat sits at the tile a machine emits into and only decays
there, it does not rise. So a press one tile above a furnace would sit at the
same heat as one in an empty field, and a gate that reads as intentional design
while being permanently shut is worse than no gate. Wire it once
`rules/fields.js` grows buoyant transport.

**`hearth` has an `in:{}` recipe with `secs: Infinity`.** It is satisfied by
construction, so `m.running` goes true the instant it is placed and stays true
forever, and `m.prog` can never reach `Infinity`, so nothing is spent or
produced. It exists only so the generic fire-glow look reads as lit with no
interpreter change.

## The art decisions behind `parts`

The segment-transport rows are the first in the table that are not catch boxes,
and their `look` blocks say so with a `parts:[...]` list instead of taking
`view/paint.js#paintMachine`'s generic body-trim-mouth-base box, which is right
for a furnace and a lie on a gear.

**The frame recedes and the moving parts come forward.** Everything was in the
same dark register at first — dark rock, dark timber, dark iron — and the hub
read as a stain on the wall. So the structure is the darkest timber, the drum
is bright ochre, and the gear is pale iron with a bronze boss. What turns is
what you see.

**The drum sits clear of the gear**, rows 2-6, because when the two overlapped
the drum was invisible and the hub read as one indistinct wheel in a picture
frame.

**The crank is post on the left, wheel and handle on the right.** They shared
the middle at first and the wheel swallowed the post, so the crank read as a
lone cog with a hook floating over it. Eight pixels of width is enough for two
things only if each is told which side it is on.

**A gear's teeth reach the footprint edge.** `rt` is 5 in an 8 px tile, so two
gears in orthogonally adjacent tiles overlap their teeth across the gap and
read as meshed, while two diagonally adjacent sit 11 px apart with an obvious
hole between them. `teeth:8` keeps one tooth on each axis at phase 0, so a
resting train looks engaged rather than accidentally aligned. Diagonals do not
conduct, and that geometry is what teaches it.
