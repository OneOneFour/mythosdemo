# Hand-recipe declaration order, and the worldgen numbers

Salvaged from `src/data/recipes.js` and `src/data/world.js` when their per-row
proofs were cut.

## The rule, and why the order is a correctness property

`rules/crafting.js#choose` takes the FIRST recipe whose inputs are all
present, matched through `model/run.js#pocketedPair` — so a clause must be met
by ONE pocketed pair holding the whole count, never by a sum across two
elements.

That makes declaration order a correctness property: **if bill A strictly
contains bill B, A must be declared first,** or every pockets state that could
afford A also affords B, and the first-match rule hands out B forever while A
becomes uncraftable.

## The containments, and the four rows that were unobtainable

| row | bill | position, and why |
|---|---|---|
| `cloud_dock` | 5 plate, 1 ingot, 2 log | BEFORE `hub`, because it strictly contains the hub's {3 plate, 1 ingot, 2 log}. With `hub` first, the dock is uncraftable forever. |
| `daedalan` | 3 plate, 1 log | Was 2 plate + 4 logs, and `peg_rungs` {2 log} and `kindle` {1 log} are strict subsets of a four-log bill, so the cheaper timber row won at EVERY inventory — measured in a real run. One log is under `peg_rungs`'s two, which breaks the containment in the one direction that matters. |
| `auger` | 2 plate, 1 log | AFTER `daedalan`, which asks one more plate at the same log count, and BEFORE `kindle` {1 log}, which is a strict subset. `kindle` used to be declared above it, which made the auger — the answer to the granite gate — unobtainable in every run at every inventory. |
| `hearth` | 2 plate | LAST of every plate-consuming row. Its bill is a strict SUBSET of `cyclops_maw`, `talos_head`, `press_machine`, `belt_r`, `daedalan` and `auger`, so declaring it earlier starves whichever came after it the moment a player held 2+ plate. The weakest bill in the file must be the last one tried. |

The same failure is recorded for `cyclops_maw` before `talos_head` before
`press_machine`.

## `pack` has no containment in either direction, so position is decided differently

Two facts give that, and both matter.

1. **Nothing here can imply `pack`.** Its 5 is strictly MORE gravel than any
   other bill asks — `belt_r` 4, `crank` 3, `brazier` 2, `gear` 1 — and
   `cyclops_maw`'s 6 is GRANITE, which `#bulk` excludes. If a future row ever
   wants 5+ plain gravel it must be declared BEFORE `pack` or `pack` starves
   it.
2. **`pack` can imply nothing.** It is a one-clause bill, and every other
   gravel-consuming row also demands logs or plate, which it does not ask for
   at all. Every non-gravel row shares no material with it whatsoever.

So position is decided by WHO LOSES THE OVERLAP, since first-match-wins means
any two simultaneously affordable rows contend. Gravel is the most abundant
material in the game, so a player holds 5+ almost always. Declared FIRST,
`pack` would win and a player carrying rubble could not hand-build a brazier,
crank, gear or belt — most of the drivetrain — without spending gravel below 5.
Declared LAST, the loss runs the other way and is smaller: a player holding 2+
plate has to put the plate down to pack earth. Starving four machine builds is
worse than starving one utility craft, so `pack` is declared ABSOLUTE LAST,
after even `hearth` — which loses nothing, since the two share no material.

**The residual wart is known:** the craft queue cannot choose a recipe, and a
real menu is the fix for this the way it is the fix for `daedalan`/`auger`.

## The four transport rows' containments, and the two certainties

Salvaged from `src/data/recipes.js` and `src/data/drops.js` in the `data/`
comment pass. The live constraint is stated on each row; this is the pairwise
work behind it.

- **`crank` {3 log, 3 gravel} is deliberately not a subset of `brazier`
  {4 log, 2 gravel}.** An earlier draft priced it at {3 log, 2 gravel}, which
  IS a subset, and would have made the crank permanently unreachable by hand
  for any player holding four logs. Raising the gravel to 3 breaks the
  containment in both directions. It is still declared after `brazier`, so the
  brazier's behaviour is unchanged where the two merely overlap.
- **`gear` {2 log, 1 gravel} is a strict subset of both `brazier` and
  `crank`,** so it is declared after both and before `peg_rungs` {2 log} /
  `kindle` {1 log}, which are in turn subsets of it.
- **`hub` and `axle` have no containment with anything.** `hearth`'s {2 plate}
  is a subset of the hub's {3 plate, 1 ingot, 2 log}, which `hearth` being
  last of the plate rows already covers. The axle's {2 ingot, 2 log} needs two
  ingots to the hub's one and no plate at all.
- Both were originally placed after the retired winch-stage row, whose
  {6 plate, 4 log, 2 ingot} contained them both. Removing a superset can only
  relax an ordering constraint, so the positions did not have to move.

**`data/drops.js#tribute-bellows` stays `chance:1` by decision, not
inheritance.** It was a certainty when the trinket table had one row; with
three the draft has two left to offer, so the dice-roll argument is gone. The
reason to keep the certainty is that the first trial to pay is where a player
learns the trinket tier exists at all, and a tier introduced by a coin flip is
one half the runs never meet. `deep-bellows`'s `chance:0.03` is the rare
source; this is the taught one.

## `#bulk/gravel` and not `#rock/gravel` is the point

`bulk` tags `soil` and `stone` only; `granite` and `adamant` are `deposit`. So
neither `pack`'s input nor `block`'s own `subTags:['bulk']` can ever admit
them, and `cyclops_maw`'s 6 granite/gravel is not a containment concern at all
— the two bills cannot be satisfied by the same pocketed pair whatever the
counts.

## Two compression ratios, and one selector that would eat its own output

Ingot is locked at 4:1, so `smelt` reads 4 and not the round-number 2 an
earlier draft shipped. Plate is locked at 12:1 against raw ore, and since one
ingot already costs 4 ore, three ingots is the same 12:1 in ingot terms — so
`press` reads 3 rather than a fresh ore-relative number.

**The press input selects on `ingot` and NOT on `refined`,** because `refined`
also tags `plate` itself. Selecting on it would let a press eat its own output,
one refinement tier "compressing" into itself for free.

## `kindle` is TWO brands per log, not three

A log and a brand are each ONE unit to a fuel selector, so this count IS the
fuel exchange rate. At three, every fuel bill in the game silently cost a third
of a log and burning a log directly was never rational. Two still pays for the
1.5 s — a brand is 0.3 massK against a log's 1.0 and is the only carried light
there is — and leaves 40% of the log as waste.

It is also **the only row whose output form is not a compression tier**: smelt
and press compress toward density, kindling does the opposite.

## `from:` and `units:'named'` have no user today

The only row that ever used either was the retired winch stage's heart-fuelled
recipe. The mechanism stays because it is the only way a non-item input can
ever be expressed.

## Worldgen: astral is FULL WIDTH now

It was 96 columns inset by 128 px, meant to read as a platform in the sky. What
it produced was two 16-column DEAD STRIPS — surface columns 0-15 and 111-127 —
in which nothing above world y 320 resolves to a band at all, so no hub could
be placed above the surface there and no span could rise past y 320 without
'OUTSIDE THE WORLD'. That is 25% of the world's width in which the game's own
destination is unreachable, for a silhouette nothing draws: astral's floor is a
solid slab spanning the whole band either way.

Measured before the change: `bandAt(x, 100)` was `null` for surface columns
0-15 and 111-127, `astral` for 16-110.

Astral has no heat, which is a content statement made by omitting one array
entry.

## The height map: `amp` 10, `dip` 2

`amp` is rows of hilltop above `floorTy`, `dip` rows of valley floor below, so
the envelope is rows 10..22.

**10 rows is 80 px of relief in a 160 px sky,** and it was 6 while relief was
three summed octaves. A landform needs the room: at 6 the clamp flattened every
summit into a mesa.

**2 rows of dip, and what caps it is the tutorial's own shaft.** `dip`
recentres the trend octave, so it lowers the whole profile rather than only
cutting valleys. At 2, 111 seeds in 200 carry a column below the datum where 0
carried any, the flat fraction is unchanged at a 69% median, and the deepest
ground row over 200 seeds is exactly `floorTy + dip`.

The price is paid at spawn, and it is why this is 2 and not 4.
`view/paint.js#excavated` cannot tell a valley from a shaft, so air inside the
relief envelope reads as SKY — and the spawn shelf is pinned at exactly
`floorTy`, which makes the daylight collar on the tutorial's hole exactly `dip`
rows deep. The beat sheet promises that hole is a 5-tile dig, so at 4 the first
hole a player digs is mostly sky, and at 2 it reads as light spilling into the
mouth of a dark hole. Photographed both ways.

## The trees row: `toTy` 22, and groves

`toTy` must reach past the ground line or a trunk's base scan never finds solid
ground — it did not, for any seed, until this was 22: rows 16-19 were air, so
the scan for the first solid tile always fell through and every column was
skipped. The window has to span every height the relief row can produce, with a
margin either side so raising `amp` by one cannot silently empty a hilltop of
trees.

**Trees come in stands, and the gaps are the point.** `chance` is the
per-column chance INSIDE a grove, and one grove centre per 96 columns covers 5
either side, so the band carries 11 stands of about 6 trees and 85 clear
columns between them. The tree count is unchanged at 66 per band — `chance` was
always per column, so trees were the one thing the widening did not dilute.

What changed is where they sit. A trunk is 3-5 tiles of solid timber and the
auto-step clears one, so a trunk is a WALL. An even scatter at `chance:0.06`
put one every 17 columns: a player walking right covered a mean 151 px before
stopping, measured over 12 seeds. Grouped, the same trees leave a mean 612 px.

A grove landing on the spawn shelf is pushed clear, which keeps timber within
43 columns of spawn on every seed.

## Ore density: 16.0 attempts per 10,000 tiles

`dens` is content per screen, so a band's width cannot dilute it. It replaced
an absolute `count` of 5, which is why the widening from 128 to 1,024 columns
left this band at an EIGHTH of its ore density with every checker green.

16.0 is solved against the measurement rather than derived: over 200 seeds it
lands 0.895% of the band's tiles as copper, against the 0.856% the tuned
128-column world carried, so +4.6%. It is NOT the old count times eight,
because clusters overlap less in a wider band and the hollow-lining pass does
not scale with this number at all.

The bill it has to cover is unchanged: the first trial asks for 10 raw copper
and the furnace bill for 12 more.
