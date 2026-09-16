# The tuning table's derivations

Salvaged from `src/data/tuning.js` when its per-row essays were cut. The file
keeps each number's contract; this holds the arithmetic and the playtest
findings that fixed each one.

## `climb` is a SIXTH of walk, not half

A sentence saying "half walk, on purpose" described the old 30, and half walk
measured as no tax at all: a playtest climbed the whole world in 7.5 s against
a 480 s clock at every load a player actually carried, so ascent was free and
the premise never fired. At 10 the same climb costs 22.4 s and the carrier
chain the game is named around can beat it. This is what makes UP expensive for
the PLAYER; `segUp` is the same question for cargo.

## The fall table

```
safe   =  5 tiles  ( 40 px) -> 160 px/s -> 0 hearts
lethal = 20 tiles  (160 px) -> 320 px/s -> 5 hearts
```
So one heart per 32 px/s above 160.

## Segment transport, eight rows and one expression

`rules/drive.js` is the only reader, and the motion expression is one line with
three cases:

```
need    = segBase + segLoad * mass * slope
surplus = supply - need                 (supply is the component's torque)
drive   = min(1, supply / demand)       (demand = the component's total need)

surplus > 0 -> ascend at segUp * min(1, surplus / segBase) * drive
surplus = 0 -> hold still
surplus < 0 -> descend at segDown * min(1, -surplus / segBase) * slope
```

Weighted descent is what that expression ALREADY produces at zero supply, which
is why there is no separate descend number and no charge gate. The `* drive`
factor on the ascent case is the one place the implementation departs from the
plan, and it is what makes sharing one crank between two segments slow both
rather than stop both.

**`segUp` and `segDown` are the same number, and that is the rule.** Nothing on
a cable rises faster than it falls, so a fed drivetrain at most matches what
gravity gives back for free. What makes up expensive is that it happens only
while a player stands at a crank holding a key.

`segUp` used to be 11, pinned to the retired winch deck's own ascent rate. That
deck is gone, and a playtest measured what the pin bought — a three-segment
chain moved cargo 14× slower than the player's own legs, so no rational player
built one. A measurement of the shipped game outranks a constraint inherited
from a deleted module.

**`segLoad` puts one crank's stall exactly on the burden cap.** At 0.0125 a
vertical segment needs `1.0 + 0.0125 × 40 = 1.5` drive to lift 40 T, which is
precisely `crank.torque` — so one crank raises anything a player's pockets could
hold and stops dead at the boundary, and a player riding with full pockets
(48 T with their body) runs backwards. That stall has to stay reachable: a
carrier strong enough that load stops mattering is the free ladder again from
the other side, and the harness's WEIGHT REVERSES IT probe fails outright if the
burden cap ever climbs.

## `burdenSoft` is `riderMass / burden`

The falloff starts the moment your pockets weigh as much as your own body does,
8 T of 40. It was 0.75, and a playtest measured what that cost — the knee sat
at 30 T while a cycle-2 tribute load is 7.2 T, so the whole curve was off the
critical path and a full-height climb took 7.5 s at every load a player
carried. The curve is linear from 1.0 at the knee to `burdenClimbFloor` at the
cap, so it stays shallow near the knee and only bites past half a cap.

## `rerollCost` is 2

In FAVOUR, spent with the god whose trial raised the offer. 2 against the
running totals the cycles pay out — 3 at cycle 2's draft, 2 at cycle 3's, 3 at
cycle 4's — buys exactly one second look per trial and never two.

## `altarWaitSecs` is 80, which is the beat sheet's own 1:20

The director withholds cycle 1's altar until the player has climbed back out of
their own shaft, and this is the deadline on that wait. The sheet raises the
altar between 1:20 and 1:40, so a player who never digs meets it at the
earliest instant the sheet allows rather than at a time this row invented. A
player who does dig has fired the relevant beat well before then and never
reaches this number at all.

## `richness` changes the size of a find, never the rate of a swing

It scales a `deposit` substance's `tile.charge` and does NOT touch `hard`,
which is why the compression table and the break-even depths survive it
untouched. Rounded and floored at 1 by both readers, so no bend can make a tile
yield nothing.

## `yield` is rolled for every substance, ore included

Base 1.0, so a real ore is unaffected and every unit lands. `soil` and `stone`
are overridden low, because they are filler you tunnel through rather than a
vein of anything. The roll happens once per unit ORE INCLUDED — a roll against
1.0 always passes — so the position of every downstream `rand()` draw does not
depend on which substance is being mined.

## Tree regrowth: 180 s and a yield of 2

`log` is the only fuel a player can mine, so a felled forest is a run that has
quietly ended. These two numbers are the whole of the answer.

**`treeGrowSecs` is 180 and not 90.** 90 is `brandSecs`, this game's existing
unit of "one long errand", and a tree ought to cost more than one errand. 180 s
is three eighths of a cycle-2 deadline, 3/7 of cycle 3's and half of cycle
4's — so a seed planted in the first third of any trial still pays back inside
that trial, and planting mid-trial is a real move rather than a decorative one.

**`seedYield` is 2 because 2 is the smallest integer that compounds.** At 1 a
fell returns exactly the tree it took, so a grove can be sustained and never
grown. At 2 the rule reads in one sentence — fell one, plant two — and the
grove doubles every `treeGrowSecs` until the player's own hands are the limit.
That limit is arithmetic: a tree is 3-5 tiles at 0.35 s each, so one
fell-and-replant cycle costs about 6 s of attention, a grove of G trees needs
6G seconds per 180 s of growth, and it saturates around G = 30. A yield of 3
clears that ceiling in one generation and the surplus seeds just sit in the
player's pockets.

**It stays a VALUE and not a chance.** A regrowth mechanic that sometimes gives
nothing is a mechanic that sometimes silently ends the timber economy. If
scarcity is ever wanted, the lever is the growth TIME, not the drop odds, which
is why there is no `seedChance` beside it.

**Raising it changes the `rand()` stream.** `rules/mining.js` spends two draws
per seed on the toss, so a fell now consumes four where it consumed two, and a
seed shared across the change does not replay past the first tree felled.
Determinism requires only that `newRun(s)` twice match, and it does.
