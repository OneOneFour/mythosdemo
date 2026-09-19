# The resource and crafting overhaul

Replaces the ore/ingot/plate economy and the crank-and-cable drivetrain with a
grounded industrial one: five world resources, two recipe classes, fuel that
carries energy, and a drivetrain with both torque and speed.

Status: **phases 1-6 landed.** Materials, fuel, smelting, the kiln and the
two-quantity drivetrain are in and every gate is green. Belts and the
character screen are outstanding, and so is the craftable bucket; §11 has the
current state of each. §10 records the five decisions and what each overturns.

---

## 1. What the player does now

Five things come out of the ground: timber, copper ore, iron ore, coal and
gravel. One tile of a deposit yields a couple of hundred units and cannot be
emptied in one visit, so a vein is a place you go back to rather than a thing
you consume. Forty talents is still all you can carry up.

Ore smelts one-for-one into ingots, in a device. Ingots become gears, gears
become the drivetrain. A winch turns only while you hold the key, and what it
can turn is decided by arithmetic: torque against load, speed against ratio.
Rope carries power between drive wheels and buckets between gear hubs. A
gear transformer buys torque with speed or speed with torque, and never both.

The pick is not in your pockets any more. It is on you.

---

## 2. Substances

Terrain rows must sit at an ordinal at or below `PACKABLE_LIMIT`. Today that
is 17, `PACKABLE_MAX` is 8 and the top byte in use is 126 of 255, so iron and
coal are **inserted** at ordinals 1 and 2 and the machine rows shift down.
Deleting the `plate` form drops `STRIDE` from 14 to 13 and raises the limit to
18. The new top byte is ~150. There is room.

| ordinal | id | tags | `hard` | drops | `charge` | tier | notes |
|---|---|---|---|---|---|---|---|
| 0 | `copper` | metal, mineable, deposit | 0.95 | `ore` | **240** | 1 | ~1 unit/s, 6 hauls per tile |
| 1 | `iron` | metal, mineable, deposit | 1.25 | `ore` | **200** | 1 | **new** |
| 2 | `coal` | combustible, mineable, deposit | 0.80 | `lump` | **180** | 1 | **new** |
| 3 | `timber` | organic, mineable | 0.35 | `log` | — | 1 | unchanged |
| 4 | `stone` | rock, mineable, bulk | 1.60 | `gravel` | — | 1 | `dropChance` 0.10 |
| 5 | `soil` | rock, mineable, bulk | 0.50 | `gravel` | — | 1 | `dropChance` 0.05 |
| 6 | `granite` | rock, mineable, deposit | 2.40 | `gravel` | **200** | **1** | the rich hard stone; a blocker by time, not by tool |
| 7 | `adamant` | rock, metal, mineable, deposit | 5.00 | `gravel` | 120 | **2** | needs the auger |

`granite` moves from tier 2 to tier 1 and up into the surface band. It is the
bulk gravel source, and 200 units at 2.40 s is 480 seconds to clear one tile —
so it blocks a tunnel by being slow rather than by being illegal, which is
what the brief asked for. `adamant` takes over tier 2. Tier 3 has no member
and no reader once the auto-miners go.

**`tin` is deleted.** No recipe has ever consumed it. Its blob row and the
idea of a second metal move to `FUTURE_IDEAS.md`.

`dropChance` and `richness` already exist as tunables and need no new
machinery — only new values.

### Deleted substances

`tin`, `press`, `belt_r`, `gear`, `axle`, `crank`, `talos_head`,
`cyclops_maw`, `furnace`. The auto-miner concept (`talos_head`,
`cyclops_maw`) is parked in `FUTURE_IDEAS.md` with its numbers intact —
it is wanted back, and at 240-charge tiles a placed miner is a different
and better machine than it was at charge 4.

### New machine substances

`kiln`, `winch`, `hub` (kept, renamed GEAR HUB), `drive_wheel`,
`transformer`, `bucket`, `belt`.

---

## 3. Forms

Deleted: **`plate`** (smelting is one step now) and **`stair`** (no recipe
survives that produces it; the ladder is the ascent).

Added:

| id | label | `massK` | tags | `subTags` | notes |
|---|---|---|---|---|---|
| `lump` | LUMP | 1.0 | `fuel` | `combustible` | what coal drops |
| `gear` | GEAR | 0.9 | `part` | `metal` | the iron gear, an intermediate |

Changed: **`ingot` `massK` 1.6 → 0.95.** Smelting is 1:1, and content
assertion 6 forbids a recipe producing more mass than it consumes. 0.95 reads
as slag lost. `gear` at 0.9 keeps `iron/ingot → iron/gear` legal for the same
reason.

`gear` is a form and no longer a machine, so "iron gear" is
`iron` × `gear` — the substance-by-form rule applied where it was previously
broken by a machine row that happened to be named GEAR.

### Fuel carries energy

A `fuel`-tagged form gains `fuel:{ energy }`, and the substance scales it
through a new `fuelEnergy` tunable.

| pair | form energy | `fuelEnergy` scope | effective |
|---|---|---|---|
| `timber/log` | 1.0 | 1.0 | **1.0** |
| `timber/brand` | 0.35 | 1.0 | **0.35** |
| `coal/lump` | 1.0 | `coal` 3.0 | **3.0** |

A recipe's fuel clause is denominated in energy rather than units, and a
device converts at `eff('burnEff', <machine>)`. This is the only way "the kiln
burns inefficiently" and "coal is denser than timber" can both be true; today
`'*/#fuel': 1` makes a log and a lump literally interchangeable.

---

## 4. Recipes

### Smelting — `smelt:true`, `hand:false`

Runs only in a device whose row carries `smelts:{}`. One generic row, with
`subFrom` carrying the substance across, exactly as the current `smelt` does.

| id | in | out | secs |
|---|---|---|---|
| `smelt` | `*/#ore` × 1, **0.5 energy** | `subFrom` × `ingot` × 1 | 3.0 |

In a kiln (`burnEff` 0.5) one log is exactly one ore and one coal lump is
three. Coal is the fuel you build a line around; timber is what you burn
before you find coal.

### Standard craft — `hand:true`

Runnable by the player, and later by a contraption. Declaration order is a
correctness property (assertion 23: a bill that strictly contains another must
precede it), so the order below decides which recipe the chooser reaches and
will be re-derived during implementation rather than trusted from this table.

| id | in | out | secs | mass in → out |
|---|---|---|---|---|
| `winch` | 2 `copper/ingot`, 5 `iron/gear` | 1 `winch/rig` | 14.0 | 6.40 → 6.40 |
| `kiln` | 15 `#bulk/gravel` | 1 `kiln/rig` | 8.0 | 4.50 → 4.50 |
| `gear_hub` | 2 `iron/gear`, 1 `copper/ingot` | 1 `hub/rig` | 10.0 | 2.75 → 2.75 |
| `bucket` | 5 `timber/log` | 1 `bucket/rig` | 5.0 | 4.00 → 4.00 |
| `transformer` | 3 `iron/gear` | 1 `transformer/rig` | 8.0 | 2.70 → 2.70 |
| `drive_wheel` | 1 `iron/gear`, 1 `iron/ingot` | 1 `drive_wheel/rig` | 6.0 | 1.85 → 1.85 |
| `belt` | 1 `iron/gear`, 2 `timber/log` | 1 `belt/rig` | 3.0 | 2.50 → 2.50 |
| `stone_block` | 10 `#bulk/gravel` | 1 `subFrom/block` | 2.5 | 3.00 → 1.20 |
| `iron_gear` | 1 `iron/ingot` | 1 `iron/gear` | 2.0 | 0.95 → 0.90 |
| `ladder` | 3 `timber/log` | 2 `timber/rung` | 1.5 | 2.40 → 0.48 |
| `kindle` | 1 `timber/log` | 2 `timber/brand` | 1.5 | 0.80 → 0.70 |

`rope` has no recipe. It is free and unlimited, created by the link verb
between two drive wheels.

**Belt's bill is invented** — the brief does not price it. See §10.4.

---

## 5. Machines

| id | name | tw × th | role |
|---|---|---|---|
| `kiln` | BASIC KILN | 2 × 2 | `smelts:{}`, `burnEff` 0.5. The only smelter. |
| `winch` | WINCH | 1 × 2 | `drive:{ torque: 2.0, speed: 1.0 }`, `wheel: true`. Turns only while held. |
| `hub` | GEAR HUB | 2 × 2 | Rope anchor. Buckets ride a rope between two of these. |
| `transformer` | GEAR TRANSFORMER | 1 × 2 | `ratio: 3.0`, `loss: 0.10`. Faced; see §6.4. |
| `drive_wheel` | DRIVE WHEEL | — | Mounts onto a placed hub or transformer. Not a footprint. |
| `bucket` | BUCKET | — | Attaches to a rope. `cap: 20` talents, tare 4.0. |
| `belt` | BELT | 1 × 1 | One per tile. Gear-driven, `beltMaxSlope` 0.5. |
| `brazier` | BRAZIER | 1 × 1 | Kept. Burns energy for light. |
| `hearth` | HEARTH | 2 × 2 | Kept, unchanged. |
| `cloud_dock` | THE CLOUD DOCK | 2 × 1 | Kept. Rope anchor and tribute receiver. |
| `altar` | THE SURFACE ALTAR | 2 × 2 | Kept, unchanged. |

The drive wheel and the bucket are the two rows that are **not** placed as
footprints. Both are crafted as `<sub>/rig` and consumed by a verb that
attaches them to something already placed — the wheel sets `m.wheel = true`
on a hub or transformer, the bucket appends to a rope's carrier list. This
reuses the existing held-item placement dispatch rather than adding a second
one.

---

## 6. The drivetrain, with two quantities

### 6.1 Why it changes

`rules/drive.js` models one scalar today: torque supply against torque demand,
with carrier speed derived from the surplus. A gear transformer that trades
torque for speed cannot be expressed against one number. Adding angular speed
makes the transformer, the drive wheel and the sloped belt all mean something
real, and it is the largest single change in this plan.

### 6.2 The law

Power is `torque × speed` and is conserved across a transformer, less its
loss. A shaft has one angular speed; torque is the divisible budget.

```
per component:
  omega   = source speed, divided by the transformer ratios on the path
  tau     = sum of source torques, multiplied by the same ratios, less losses
  demand  = sum of need() over every rope the component drives
  throttle = demand > 0 ? min(1, tau / demand) : 0

per rope:
  need    = segBase + segLoad * mass * slope
  surplus = tau - need
  surplus > 0 -> v = +segUp   * min(1, surplus / segBase) * throttle * omega
  surplus = 0 -> v = 0
  surplus < 0 -> v = -segDown * min(1, -surplus / segBase) * slope
```

At `omega = 1` and no transformer this is **exactly** the current law, so
every shipped behaviour — weighted descent, the stall, the run-backwards —
survives unchanged and the new term is provably inert until a transformer is
placed.

### 6.3 What one winch turns

`torque 2.0` against `segBase 1.0` and `segLoad 0.0125/T` stalls at 80 T on a
vertical rope. A bucket is 4.0 T tare and holds 20 T.

| aboard | mass | need | surplus at τ=2.0 | result |
|---|---|---|---|---|
| empty bucket | 4 | 1.05 | +0.95 | near full speed |
| 1 loaded bucket | 24 | 1.30 | +0.70 | brisk |
| 2 loaded | 48 | 1.60 | +0.40 | slow |
| 3 loaded | 72 | 1.90 | +0.10 | crawling |
| 4 loaded | 96 | 2.20 | **−0.20** | runs backwards |
| player, pockets full | 48 | 1.60 | +0.40 | slow |
| player, empty | 8 | 1.10 | +0.90 | brisk |

So one winch and one arm move three loaded buckets and no more. The fourth
needs a transformer, a second winch, or a lighter load — which is the decision
the whole tier exists to create.

### 6.4 The transformer

`ratio 3.0`, `loss 0.10`, and a facing chosen at placement.

| facing | torque | speed | lifts | at |
|---|---|---|---|---|
| **TORQUE** | ×2.7 | ÷3 | 3× the mass | ⅓ the speed |
| **SPEED** | ÷3 | ×2.7 | ⅓ the mass | 3× the speed |

Torque-side: τ 5.4 against `segLoad` stalls at 352 T — roughly fourteen loaded
buckets, at a third of the speed. The facing is drawn as an arrow on the
machine and named in the placement ghost before the click, the same way the
mirrored machines already resolve facing off `player.face`.

### 6.5 Rope

A rope is a link between two **drive wheels**. It always transmits power. If
both ends are gear hubs it is also a carrying loop and buckets may be attached
to it. One noun, two consequences.

This inverts the current reconciliation, in which power is only ever
transmitted by footprint adjacency and the cable is the one non-physical
thing. See §10.2 — it needs your sign-off, because it rewrites a decision the
architecture doc records as settled.

Rope keeps every constraint that is actually doing work: bounded between two
placed endpoints, within `hub.reach × eff('segReach')`, over an unobstructed
straight path, and never a record of a route longer than one link. Chains stay
derived.

### 6.6 Belts

One belt per tile, gear-driven rather than fuel-burning, and it may run at an
angle. Above `eff('beltMaxSlope')` — 0.5, the sine of 30° — friction fails and
items slide back down. A run of adjacent belt tiles is one drivetrain load
drawing torque in proportion to the items on it.

The existing four-tile fuel-burning conveyor is deleted rather than adapted.
They are different machines and shipping both would be confusing.

---

## 7. Tunables

`data/tuning.js` is the only place a number a god could ever bend may live.
Every quantity this plan introduces gets a row, even at base 1.0.

### New

| id | kind | scope | base | unit | note |
|---|---|---|---|---|---|
| `fuelEnergy` | scale | substance | 1.0 | × | `scoped: { coal: 3.0 }` |
| `burnEff` | scale | machine | 1.0 | × | `scoped: { kiln: 0.5 }` |
| `driveTorque` | scale | machine | 1.0 | × | renames `crankTorque` |
| `driveSpeed` | scale | machine | 1.0 | × | the new second quantity |
| `gearRatio` | scale | machine | 1.0 | × | bends the transformer |
| `spinRate` | scale | machine | 1.0 | × | see below |
| `beltMaxSlope` | **value** | — | 0.5 | sin | 30°; a value, not a scale |
| `bucketCap` | scale | machine | 1.0 | × | talents one bucket holds |

`beltMaxSlope` is `kind:'value'` deliberately. `eff()` is
`(base + Σadd) × Πmul`, so an `add` against a scale row's 1.0 base would mean
"plus 25% of a literal elsewhere", which is unreadable for an angle. As a
value in the unit `model/segments.js` already uses — `slope` is `|dy| / len`,
the sine — `add: 0.24` reads as "belts now run to about 46°".

### Retuned

`richness`, `dropChance` (add `granite`, `iron`, `coal` scopes), `segLoad`,
`segUp`, `segDown`, `riderMass` — values change, rows do not.

### Deleted

`crankTorque` (renamed), `torqueLoss` (folded into `gearRatio`'s loss term).

### `TURN_RATE` must become a tunable before the transformer ships

`rules/drive.js:43` is `const TURN_RATE = 5.0`, and its comment correctly calls
it presentation-only — `view/treatments.js` reads `m.turn` for a rotation
phase and nothing else. **The transformer makes rotational speed a real
quantity**, at which point that constant is a hardcoded number sitting where a
tunable belongs, and a transformer's speed side will be visibly wrong because
the wheels will not turn faster. Convert it to `eff('spinRate', def.id)` in
the same phase that lands the two-quantity law, not after.

---

## 8. Tools leave the inventory

`pick` and `auger` are substances in `relic` form living in `run.inv`, and
`model/run.js#hasPick` is `invCount(S.pick, F.relic) > 0`.

They move to the Character screen. `run.equipped` already exists as a
fixed-length array of substance ids synced against `run.inv`
(`rules/trinkets.js`), and `bestTool()` already scans `item.tool` blocks
generically, so this is a slot-kind on the existing structure rather than new
state: `run.equipped` gains a tool slot alongside the trinket slots, and
`bestTool()` reads the slot instead of the pockets. The CHARACTER tab is
already drawn at `view/ui/mainPanel.js:112` and already renders equipment
slots and an `explain`-derived stat list.

`STAT_ROWS` at `view/ui/mainPanel.js:204` hardcodes `walk`, `climb`,
`pickPower` and `rate.furnace`. Three of those four are wrong after this
overhaul. It becomes torque, speed, fuel energy and burden.

---

## 9. Two defects to fix on the way past

Both found while reading, both will bite this overhaul specifically.

1. **`rules/crafting.js:82` ignores `eff('yield')`.** `rules/machines.js:162`
   applies it. Standard-craft recipes are meant to run by hand *and* in a
   contraption — the same row, two runners — so the two will disagree the
   first time anything bends yield. Read `eff('yield', <scope>)` in both.
   Assertion 7 already requires a hand recipe be object-identical to what a
   machine names, so the divergence is in the runners, not the data.

2. **`tools/content.mjs:267` claims to iterate any table with a `mods` array
   and does not.** It is a hardcoded `[...TRINKETS, ...GRANTS, ...BOONS]`. Any
   table renamed or added by this overhaul silently stops being validated.

`data/grants.js#STARTING_MACHINES` also carries a comment claiming
`rules/placement.js` is its only reader; the real importers are
`model/run.js:9,135` and `tools/content.mjs:11`. This overhaul rewrites that
constant, so the comment gets fixed in the same commit.

---

## 10. Decisions taken

All five open items are resolved. Each rewrites something the architecture
notes recorded as settled; the amendments land in phase 1.

### 10.1 The first tribute grants the winch

The first task — ten copper ore to the surface altar, no clock — used to hand
over the crude furnace. The furnace is deleted and the kiln is buildable from
the start, so the reward becomes **the winch**, with the Cloud Dock alongside
it as before.

Nothing in the world rotates without a winch, so this is the whole of
mechanical power arriving at once, one task before the gods start asking for
deliveries that need it. Everything else in the tier — kiln, gear hub, bucket,
belt, transformer, drive wheel — starts known and buildable.

The beat itself does not move: surface altar, ten raw copper, no deadline.

### 10.2 Rope carries power

A rope between two drive wheels transmits torque. If both ends are gear hubs
it also carries buckets. One kind of rope, two consequences.

Power previously moved only between machines whose footprints share an edge,
and the cable between two hubs was the one thing that was not placed
tile-by-tile. That is now inverted: rope is the long-distance power path, and
the drive wheel is the part that earns its cost by creating one.

Every constraint that protects the premise survives: a rope joins exactly two
endpoints, both placed, within reach, over an unobstructed straight path, and
no record anywhere describes a route longer than one rope. Runs of connected
rope stay a derived query.

The vocabulary is now seven parts — **rope, bucket, gear hub, drive wheel,
winch, transformer, belt**. `segment`, `carrier` and `crank` are retired as
words as well as as code. `chain` survives only as the name of the derived
query.

### 10.3 Material is cheap; lifting it is not

Recipe bills stay exactly as briefed. The entire tech tree comes to about 12
iron ore, 3 copper ore and 5 timber against 200-plus-unit tiles, so building
is a short ramp rather than a grind.

The sinks are elsewhere and both of them have to travel up the shaft: tribute
demanded in the hundreds of ingots, and the fuel burned to smelt them — about
67 coal per 200 ore through a kiln. The pick is not the bottleneck and is not
meant to be.

### 10.4 A belt costs half an iron gear and half a log per tile

1 iron gear + 1 timber log makes **two** belt tiles, each 0.85 T. A ten-tile
incline is five gears, which makes a belt a real commitment against a rope,
which is free.

### 10.5 Granite moves to the surface

Granite becomes tier 1, mineable with the starting pick, and its blob row
moves up into the surface band. One tile holds 200 gravel and takes 480
seconds to clear completely.

That makes it the bulk gravel source — a kiln is about 36 seconds of mining
against it — while remaining something you would never tunnel through. It
blocks by being slow rather than by being illegal, which is the structural
blocker the brief asked for. The cost is that early surface terrain looks
different, and worldgen changes with it.

---

## 11. Phases

Restructured so **`npm run check` is green at the end of every phase**, which
the original split did not manage: it would have left the content lint failing
assertions 6, 19, 23 and 25 across four phases at once. Each phase below is
also a playable state.

### Phase 1 — the written decisions

This document plus the amendments in §10, and the matching rewrites to the
locked-numbers doc: the substance table, the fuel model, the motion law, the
first-tribute reward, the transport vocabulary. Docs only.

### Phases 2 and 3 — MERGED, and landed

Merged during implementation. Keeping the old drivetrain alive through a
content-only phase meant building a machine roster that existed only to be
deleted, and it collided outright: `gear` is now a FORM, the iron gear, while
`gear` was also the old power-conductor machine. One phase is less work and
has no naming trap.

The whole content layer in one move, because the lint checks it as one graph.

- Insert `iron` and `coal`; delete `tin`; retune `charge`, `hard`, `tier`.
- Move granite's blob row to the surface band.
- Delete the `plate` and `stair` forms; add `lump` and `gear`; correct
  `ingot`'s mass.
- Fuel carries energy; recipes ask for energy; devices carry `burnEff`.
- Delete the furnace and the press; add the kiln; smelting recipes lose
  `hand:true` and require a device carrying `smelts:{}`.
- Rewrite the recipe table; rewrite the cycle demands off `plate` and `tin`;
  rewrite the starting-machine list.
- Fix the two defects in §9.

And the drivetrain with it:

- Torque and speed as two quantities, power conserved.
- `TURN_RATE` became `eff('spinRate', …)` in the same change.
- The winch replaced the crank; the gear transformer arrived.
- Rope carries power; the drive wheel is a placed 1x1 anchor.
- Crank, gear and axle deleted.

**Not done: multiple buckets per rope.** A rope still carries one implicit
bucket, as the carrier always did. The craftable bucket was written and then
removed before landing, because an item you can craft and cannot use is worse
than one that does not exist yet. It comes back with the mechanic.

Three numbers moved during implementation, each because a test found the
first choice wrong:

| number | first choice | landed | why |
|---|---|---|---|
| `winch.drive.torque` | 2.0 | **1.55** | 2.0 stalls at 80 T, and a player carrying the whole 40 T burden cap weighs 48 T — so one winch would have lifted any load a player could hold, and D4's gate would have been gone |
| `burnEff.kiln` | 0.4 | **0.5** | at 0.4 one log yields 0.4 usable against a 0.5 smelt, so timber could never smelt at all. At 0.5 one log is exactly one ore and one coal is exactly three |
| `bucketCap` | 20 T | removed | belonged to the bucket mechanic, which did not land |

### Phase 4 — belts — LANDED

Per-tile, gear-driven, running to 30°. The four-tile fuel-burning conveyor is
deleted: `belt_r` has no `ports`, no `buffer`, no `catchBox`, no `handFeed`
and no recipe, and `rules/belts.js` reads the drivetrain instead.

**A run needed no new graph code.** `rules/drive.js#partition` already groups
drivetrain nodes by footprint adjacency, so 1x1 belts in a row are one
component with the gear hub at either end. The one addition is
`beltAdjacent`: Chebyshev-1 rather than edge-sharing, and only where one of
the pair is a belt, so a stepped run connects at its corners while the
existing rule that a corner-touching winch drives nothing still holds.

| decision | answer |
|---|---|
| does a belt cost torque | yes, `beltDrag` 0.08 per tile, against `segBase` 1.0 for a bucket. One winch turns 19 tiles, or a bucket and six |
| above 30° | items run back downhill at `beltSlip` 34 px/s, and every tile of the run draws a `!` |
| how slope is measured | over the **whole run**, rise over the diagonal between its extreme columns — so one row every two tiles reads 18° and grips, where measuring step to step would read 45° and refuse |
| how a run is powered | drive reaching any tile turns all of them |

Belt speed is `beltSpeed x m.torque x m.speed`, so an oversubscribed
drivetrain runs its belts slowly rather than stopping them, and a speed
transformer upstream runs them fast. `rules/belts.js` reads the drive
`rules/drive.js` wrote on the previous substep — siblings may not import each
other, and staying ahead of `machines` in the order is what lets an item
dragged into a mouth be caught the same substep it arrives.

**A bug found by the harness, in this phase's own code.** `groundBox` is per
tile, and an item on a tile seam lies inside two of them, so the first draft
dragged it twice in one substep and it travelled at double speed. The driven
test measured 20.4167 px against a predicted 19.5833 and named the ratio.
Items are now gathered into a `Set` across the whole run before any of them
moves.

Verified in `tools/check.mjs` section 8u: a held run carries ore 19.58 px and
an unheld one 0.00; sin 0.707 slips and runs it 17 px back downhill while sin
0.316 grips and carries it up the step; and 12 tiles take a bucket sharing
their winch from 14.30 to 11.31 px/s, against an independently transcribed
prediction.

### Phase 4a — the contraption — LANDED

The device half of "a standard craft runs in the hands or in a contraption".
2 iron gear + 1 copper ingot + 4 timber log, 5.95 T, known from the start.

**It knows four recipes, not all fifteen.** `rules/machines.js#choose` takes
the first affordable row, so a device that knew every hand recipe would spend
a fed pile on whichever machine happened to be declared first. It runs the
repetitive intermediates — `stone_block`, `iron_gear`, `ladder`, `kindle` —
and a machine is still built deliberately, by hand, one at a time. The probe
in `tools/check.mjs` section 8v asserts that directly: no row in its list
outputs a `machine`-tagged substance, so adding one is a failure rather than
a surprise.

Fed 15 stone gravel it makes exactly one block and leaves 5, which is the
chooser stopping rather than draining the buffer.

### Phase 5 — the character screen — LANDED

**`run.equipped` stopped being a selection over `run.inv` and became the
store.** A relic never enters the pockets: `write.collect` routes any `relic`
pair to the first free slot, one per slot, refusing a duplicate and refusing
a fourth so the pickup leaves it on the ground. `invCount` answers for relics
off the slots, so every existing caller stayed correct.

| decision | answer |
|---|---|
| does a relic still weigh | yes. `burdenOf()` sums the slots as well as the pockets, so the 40 T cap is not quietly widened |
| slot cost | the pick consumes one of the three equipment slots |
| later relics | consumable intermediates are fine, but once held they appear on the character tab and never in the pockets |

`rules/trinkets.js` lost its whole reconciliation pass: with the slot as the
only record of possession there is no second list to disagree with it. A
modifier is active exactly when its relic is in a slot.

**Dragging a relic out of a slot now spawns it as an item.** It used to clear
the slot, which was correct when the pockets still held the relic and is
destruction now that they do not.

`STAT_ROWS` named `rate.furnace`, a machine deleted in phase 2. It now reads
WALK, CLIMB, PICK POWER, BURDEN CAP and KILN RATE — `rate.kiln` being the key
the bellows trinket actually bends. The equipment grid's heading changed from
TRINKETS to EQUIPMENT, since it holds the pick too.

**A fact this surfaced.** With relics out of the pockets there are 33
pocketable pairs against 38 slots, so distinct pairs can no longer fill the
bag and `collect`'s INVENTORY FULL refusal is unreachable in play. It is kept
as a guard against content growing and its probe now says so, filling the bag
directly rather than pretending the scene reached it. Slot pressure was never
the constraint; `eff('burden')` is.

### Phase 6 — the craftable bucket — LANDED

5 timber -> 1 bucket, 4.0 T, holding `eff('bucketCap')` 20 T. Placed with the
same verb a machine is, aimed at a rope rather than at tiles: a `rig` pair
naming no machine row is a carrier, and `rules/placement.js#attachCarrier`
hangs it on whichever rope passes within `eff('attachR')`. Up to
`eff('ropeBuckets')` (4) per rope.

**A rope became a loop.** `seg.t` is gone; `seg.u` is the loop phase in
[0,1), 0 at the low anchor, 0.5 at the high one, and the rest of the turn is
the descending strand. A bucket rides at `u + off` wrapped, so buckets
circulate rather than stopping at the top, and haulage is continuous.

**What resists the loop is the NET load**, which is the whole reason to build
a chain:

```
w(c)  = segBase + segLoad * mass(c) * slope
net   = sum of w over ascending buckets, minus the same descending
force = tau - net
force >  segFric -> forward  at segUp   x min(1, (force - segFric)/segBase)
force < -segFric -> backward at segDown x min(1, (-force - segFric)/segBase) x slope
otherwise        -> hold still
```

With one bucket and nothing opposite, `net` is exactly the old `need` and the
expression reduces to what it was, less the friction dead band.

**`segBase` had to stop meaning friction.** It is a carrier's own weight, so
on a loop it cancels between strands; treating it as a symmetric friction
band made a loaded bucket unable to run backwards at all. `segFric` (0.05) is
the new, much smaller, always-opposing term, and it is what stops a balanced
loop turning for free.

| number | was | is | why |
|---|---|---|---|
| `winch.drive.torque` | 1.55 | **1.50** | with a friction band, 1.55 puts a fully laden 48 T rider exactly on the reversal boundary. At 1.50 the boundary is 44 T and the rider reverses with margin |

Measured, in `tools/check.mjs` section 8w: 40 T on one bucket **stalls a winch
dead** at 0.00 px/s; the same 40 T with an empty bucket opposite runs at 24.70;
with an equal load opposite, the full 26.00. And a balanced loop nobody is
turning does not move at all.

**Why this does not make ascent cheap.** The only mass you can send down is
mass you already paid to lift, so a chain never helps the first ascent; one
winch still cannot lift 40 T with a single bucket; and the player must stand
and hold the winch throughout. `CLAUDE.md`'s invariant 4 is reworded in the
same commit, since "slides back down under its own weight for nothing" is no
longer true of a balanced loop.

A bucket hauls at most `eff('bucketCap')`; what does not fit stays where it
was, so a chain is throughput rather than one enormous lift.

**The first draft did not look like a loop, and a screenshot said so.** Three
defects, all in the drawing rather than the physics:

- `carrierPos` put both strands on the same line, so a bucket going up and one
  coming down at the same height were the same pixel. Four buckets drew as
  three. The model now carries `STRAND_GAP` (8 px) across the rope, and
  `carrierPos` offsets by strand — so the two are stood on where they are
  drawn. `CARRIER_W` narrowed 10 -> 8, which puts two decks side by side in
  exactly the 2-tile shaft the scenarios carve.
- Every bucket was drawn twice: once as the standable deck and once as a
  leftover decorative shape on the cable. The cable pass now draws only the
  two strands and the turns round each hub.
- Every bucket drew the same fill, because the fill read the rope's total
  load. Each carrier now carries its own `load`, so a laden bucket rising past
  an empty one is visible — which is the counterweight made legible. The
  brim-full reference was a literal `full:40` against a 20 T cap, so a full
  bucket could only ever draw half full; `view` reads `eff('bucketCap')`
  instead.

`winch-bucket-chain.png` is the baseline that covers it, and it asserts two
buckets on each strand rather than only comparing pixels.

Divine content is out of scope throughout.
`docs/PLAN-divine-reintegration.md` records how it comes back, and §7 of this
document lists the tunables that must exist for it to be able to.

---

## 12. What verification costs

Measured, not estimated. The harness is coupled to the old economy far more
tightly than the game code is, and the phase table above under-counts it.

| file | lines | references to deleted content |
|---|---|---|
| `tools/check.mjs` | 7,558 | `crank` 85, `plate` 28, `furnace` 20, `tin` 7, plus the talos and maw placement suites |
| `tests/visual.spec.js` | — | `furnace` 85, `hub` 31, `crank` 21, `gear` 18, `belt_r` 7, `axle` 4 |
| `tools/content.mjs` | — | 1 |
| `src/` outside `data/` | — | **3**: a stale comment in `model/run.js`, a `copper/stair` comment in `model/tiles.js`, and `rate.furnace` in the stat list |

The game code is almost clean — the economy really does live in `data/`,
which is the architecture working. The cost is in the assertions: the
ore/ingot/plate break-even tables, the cranking-seconds-per-tier figures, the
maw's depth-gate arithmetic and the drop-chance suites all assert numbers this
overhaul deletes.

Three consequences:

1. **Phase 2 and phase 3 each carry a harness rewrite** roughly the size of
   their own content change. A visual baseline re-take is unavoidable, and it
   is a deliberate change rather than a regression — every scene that lights a
   furnace has to light a kiln instead.
2. **Assertions that measure a deleted quantity get deleted, not retargeted.**
   A break-even table for ore-to-plate has no successor; the two-quantity
   drivetrain wants a torque-and-speed table instead, which is a new
   assertion, not an edited one.
3. **The visual baselines were already unreviewed.** Re-taking them here
   changes nothing about their standing: they catch future drift and have
   never been judged good.
