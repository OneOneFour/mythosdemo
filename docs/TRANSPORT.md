# Segment transport — the normative reference

Extracted from `docs/PLAN-gears-and-winches.md` §4 ("The design") and §5
("Open decisions") once segment transport shipped in Phase 8f. CLAUDE.md D10
delegates the binding contract for this subsystem here; that document's own
"Nothing here is built" banner no longer applied to this material and a
normative reference had no business staying behind it. The plan document
still holds the brief, the recon and the phase-by-phase execution history —
read it for *why*; read this for *what is true today*.

Five nouns, and nothing here may use a sixth (CLAUDE.md D10 states them):
**hub** (a placed machine a segment may anchor to), **segment** (one cable
between exactly two hubs, carrying one carrier), **carrier** (the thing that
rides a segment), **chain** (a maximal connected run of segments, derived,
never stored) and **drivetrain** (the placed crank/gear/axle graph that
supplies torque).

## Data model — three interpreter keys, no new engine concept

All three are `data/machines.js` blocks in exactly the class `belt:{}` and
`light:{}` already occupy: a key the generic interpreter reads, with no
machine name anywhere in `rules/`.

```
hub    { reach, carries }
       reach    px, the longest segment this hub may anchor. Multiplied by the
                `segReach` scale tunable, scope 'machine' — so a better
                hub row is content (a `variantOf` with a bigger reach) and a
                boon that lends range is one tuning row.
       carries  ['material'] | ['material','player'] — what the carrier may
                bear.

crank  { torque, reach }
       torque   drive units supplied while the player is turning it. 1.0 is
                "enough to raise one empty carrier at full speed" — see below.
       reach    px the player must stand within, the same shape and units
                `handFeed:{reach:10}` uses on every row.

gear   { loss }
       loss     fraction of torque lost per hop along the drivetrain graph.
                This is the reason a drivetrain is not free to sprawl, and the
                seam a generator would eventually plug into.
```

Rows: `hub` (2x2, footing 2, `hub:{ reach:96, carries:['material','player'] }`
— no `ports`, no `buffer`, no `recipes`, the first machines with none, and the
interpreter already handles that: `rules/machines.js#choose` returns null,
`produce` zeroes progress), `crank` (1x2, footing 1,
`crank:{ torque:1.0, reach:12 }` — `reach:12` is `handFeed`'s 10 plus a
little, so "close enough to feed" and "close enough to turn" read the same),
`gear` (1x1, footing 1, `gear:{ loss:0.06 }`, the linkage primitive) and
`axle` (3x1, footing 1, `variantOf:'gear'`, `gear:{ loss:0.02 }` — three tiles
of reach for a third of the loss, content, not code).

**The segment is not a machine.** It has no footprint, no buffer, no recipe,
and it is created by an *action between two machines* rather than placed.
`model/segments.js` holds the array (cleared by `newRun()`, like
machines/items) and one record per segment: `a`/`b` (the two hub machine
RECORDS, never ids — machines never move, and a removed hub must invalidate
this), `ax,ay,bx,by` (world-px anchor points, cached at link time), `len` (px),
`slope` ((yLo-yHi)/len, 0 horizontal .. 1 vertical), `hi` ('a'|'b', which end
is UP, ties resolve to 'a' deterministically), `t` (0..1 carrier parameter, 0
= the LOW end), `dir` (-1 up | 0 still | +1 down, view only), `load` (talents
currently riding, view and tooltip), `band` (the band the carrier is
currently in).

`model/segments.js` owns the queries (numbers and questions, per CLAUDE.md
rule 1): `carrierPos(seg)`, `carrierBox(seg)` (the `deckBox` idiom, sized by
the carrier's own width), `segmentsAt(m)`, `linkedTo(a, b)`, `linkCheck(a, b)`
(below), `chains()` and `breaks()`, and `carrierUnder(band, box)` (the one
`rules/player.js` needs, below). Write API, bumping the epoch like every
other model write: `write.link`, `write.unlink`, `write.unlinkAll(m)`,
`write.carrier(seg, t, dir)`, `write.load(seg, talents)`, `write.band(seg,
band)`, `write.clear()`.

Drivetrain state lives on the **machine record**, not in a new module,
because `view` must draw a turning gear and `view` may not import `rules` —
exactly the precedent `m.running` and `m.fire` already set. `model/machines.js`
carries `write.torque(m, v)` (0..1 drive actually delivered this frame) and
`write.turn(m, phase)` (accumulated rotation, for the sprite).

## The manual crank

`shell/input.js` holds one hold, in the shape `cmd.craft` has: `r` is bound to
`cmd.action`, held to turn the nearest crank (renamed from an earlier `turn`/
`f` binding per `docs/PLAN-phase12.md` §3 D-J). In `rules/drive.js`:

```
a crank is ACTIVE this frame  <=>  cmd.action && overlaps(playerBox(), m.box, def.crank.reach)
```

`overlaps(a, b, slack)` (`core/math.js`) is the same call
`rules/machines.js#handFeed` makes, so "within reach to turn" and "within
reach to feed" can never disagree. Every crank within reach turns — holding
one key at a junction of two cranks turns both, which is a legitimate build.

**Time is the cost, and that is the point.** Nothing is spent but the
player's presence: no fuel, no charge, no item. `docs/DESIGN.md`'s
cost-of-ascension equation is therefore priced in seconds-of-attention, not
talents-of-fuel — the one resource automation cannot give you more of is your
own standing there.

Feedback is entirely through the journal (`rules` never calls `play()`/
`toast()`): a `'turn'` row on the rising edge of a crank actually delivering
torque, gapped by `rules/machines.js`'s `WeakMap` idiom; the existing `winch`
sound row (`data/sfx.js`) covers arrival.

## Motion — one expression, three cases, and the player's weight in it

Per frame, per segment:

```
mass   = Σ massOf(item) for items in carrierBox        // model/items.js#massOf
       + (rider ? eff('riderMass') + burdenOf() : 0)   // model/run.js#burdenOf

need   = eff('segBase') + eff('segLoad') * mass * seg.slope
supply = drive(component containing seg's hubs)        // drivetrain solve, below
surplus = supply - need

surplus > 0   ->  ascend  at eff('segUp')   * min(1, surplus / eff('segBase'))
surplus == 0  ->  hold still
surplus < 0   ->  descend at eff('segDown') * min(1, -surplus / eff('segBase'))
                                            * seg.slope
```

Everything the premise asks for falls out of that one expression, with no
special cases:

- **Unpowered is weighted descent.** `supply = 0` -> `surplus = -need <=
  -segBase` -> descent at full `segDown * slope`. There is no `descend()`
  branch and no charge gate; the *same* line produces it.
- **A rider weighs it down.** An 8 T body plus 30 T of ore on a vertical
  segment is 38 T; at `segLoad` 0.025 that is `need = 1 + 0.95 = 1.95`, so a
  single 1.0-torque crank yields `surplus = -0.95` and **the carrier runs
  backwards under them**, at about half descent speed. Drop the ore
  (`cmd.drop`) and it climbs. Add a second crank and a gear, and it climbs
  loaded.
- **Shallower gives less back.** `slope` is 0 for a horizontal segment, so
  weight stops mattering *and* gravity stops helping: an unpowered horizontal
  segment sits still, and a powered one runs at full speed regardless of
  load. Level transport costs continuous attention and nothing else.
- **Nothing makes ascent cheap.** The one way to raise a heavy carrier is
  more drivetrain, and every gear hop costs `gear.loss`.

Arrival at an end: clamp `t`, release riding material (`it.rest = 0`, the
`rules/items.js` wake idiom), and if the carrier's band changed, hand items
over with `iw.spawn` + `iw.remove` at the same world pixel — the only
sanctioned way to change an item's band. Push the existing `'winch'` journal
row so `shell/notify.js` and `data/sfx.js` need no edit.

Material rides by translation, one addition per item: `it.x += dx; it.y +=
dy`, since a segment is not axis-aligned.

**Determinism:** no `rand()` anywhere (invariant 7). Iteration order is the
`segments` array order, which is link order. `m.turn` accumulates from `dt`
alone, so the gear sprite is reproducible from the seed and the frame count.

## The drivetrain solve

Nodes: every placed machine whose row carries `crank`, `gear` or `hub`.
Edges: **orthogonal footprint adjacency** — two footprints sharing an edge,
computed from `m.tx/m.ty` + `def.tw/th`, in the same band. Diagonals do
**not** conduct; a corner needs a gear in it. A deliberate legibility choice
(A3, below).

Per connected component, per frame:

```
supply = Σ over active cranks c:  crank.torque(c) x eff('crankTorque', def.id)
                                   x (1 - gear.loss)^hops(c -> nearest hub)
demand = Σ over segments anchored in this component:  need(seg)
drive  = demand > 0 ? min(1, supply / demand) : 0
```

and every segment in the component ascends at `drive` (i.e. `surplus` above
is computed with `supply_seg = drive * need(seg)`; equivalently, apportion
`supply` across segments in proportion to their own `need`). One crank, three
loaded segments -> all three at a third speed. Each hub's `m.torque` is set to
its component's `drive` so the view can draw it, and `m.turn` advances by
`drive * dt * TURN_RATE`.

Cost and caching, following `rules/light.js`: the component partition changes
only when the machine set or the segment set changes, so it is cached in a
module-local `WeakMap` keyed by band and invalidated by a **signature** —
`machines.length`, `segments.length`, and a rolling hash of node positions —
recomputed per frame at a cost of one pass over a few dozen records. Crank
*activity* changes every frame and is never cached. Node counts are in the
tens; there is no reason to do better.

## Linking, and the clear-path test

**One decision, two readers.** `model/segments.js#linkCheck(a, b)` returns
`{ ok, why }` and is the only implementation. `rules/placement.js#linkSegment`
calls it and turns `false` into a journal row plus the mutation; `view/hud.js`
calls it and turns `false` into a tinted cable ghost with the one-word reason
beside it. Neither keeps a second copy — `model/run.js#placementCheck`'s own
pattern.

Refusals, in this order (structural before affordable):

| `why` | test |
|---|---|
| `'NOT A HUB'` | either end's row has no `hub` block |
| `'ALREADY LINKED'` | `linkedTo(a, b)` |
| `'TOO FAR APART'` | `len > min(reachOf(a), reachOf(b))`, where `reachOf(m) = MACH[m.def].hub.reach * eff('segReach', def.id)` — the **smaller** of the two hubs governs, so a long-reach hub does not lend its reach to a short one |
| `'THE PATH IS BLOCKED'` | any sample along the span is solid |
| `'OUTSIDE THE WORLD'` | any sample resolves to no band |
| `'TOO STEEP TO STAND'` | *(deliberately absent — every angle is legal.)* |

The clear-path test, over a span at any angle, is the **existing half-tile
sweep**, not a new line algorithm — `rules/items.js`'s own rule: *"No substep
longer than half a tile, in either axis."*

```
n = max(1, ceil(len / (tile * 0.5)))
for k in 0..n:  p = lerp(anchorA, anchorB, k/n)
                b = bandAt(p.x, p.y)          // model/world.js
                if (!b) refuse 'OUTSIDE THE WORLD'
                if (solidAt(b, tileX(b,p.x), tileY(b,p.y))) refuse 'THE PATH IS BLOCKED'
```

`bandAt` per sample is what makes a cross-band segment work at all.

**The path is not re-checked after linking.** A segment whose path is later
blocked by a placed tile or a fresh wall **keeps working**, because
re-validating every segment every frame is a cost with no gameplay behind it,
and because "your cable now runs through a wall you built" is a cosmetic
problem, not a soft-lock (A4, below).

**The link verb.** Two presses of one key, with the reticle over a hub: `l`
(edge-triggered, the `hop`/`place` latch idiom). First press with `aim` over
a hub arms `shell/ui.js#ui.linkFrom = m` (which endpoint is armed is UI
state, CLAUDE.md D2), reached through `frameCtx` because `view` may not
import `shell`. Second press over another hub calls
`rules/placement.js#linkSegment(from, to)` and clears the arm on success.
Escape clears it, same as an armed placement. Second press on the **same**
hub, or on an already-linked partner, unlinks (`'THE CABLE IS CUT'`). One
key, both directions.

**The ghost.** `view/hud.js`'s build-ghost path draws a candidate cable from
the armed hub's anchor to the aimed point, in `UI.good` or `UI.heart` per
`linkCheck`, with the `why` drawn beside the far end. The first blocked
sample draws in a refusal colour so *where* it is blocked is visible; the
reach limit clips the drawn cable when `len` exceeds it. Integer pixels,
`lineTo`, per CLAUDE.md's conventions.

**Deconstructing a hub** drops its segments (`rules/placement.js#deconstruct`
calls `segw.unlinkAll(m)`). A rider on a segment being cut simply falls —
invariant 4's whole argument is that gravity is the answer, and the fall
damage curve already exists (A6, below).

## Riding — the one genuinely new player interaction

The carrier is **not** terrain and must not become terrain: invariant 1 is
that the tile grid is the only source of truth, and `rules/belts.js` already
leans on machines not being solid.

So the carrier supports the player through a **model query**, exactly the
way a ladder does. `rules/player.js` reads `climbAt` (`model/tiles.js`) to
decide the ladder branch; it reads `model/segments.js#carrierUnder(band,
playerBox())` to decide the ride branch:

- `rules/player.js` (the existing step, which runs *before* the drive step)
  treats "standing on a carrier" like "standing on ground": `onGround` true,
  gravity not integrated, `fallFrom` pinned by the existing ground/ladder
  line — **no fall damage accrues while riding**, no new code in `land()`.
- Horizontal input still walks; walking off the carrier's edge resumes
  gravity on the very next frame, from the existing collision path. Hop off
  works unchanged and is not burden-gated on a carrier — a hop is a hop.
- `rules/drive.js` then translates the player by the carrier's own delta
  with `pw.move`, the same way item-carry translates items. Two writers of
  `player.y` in one frame, in the fixed order `shell/schedule.js` states —
  precisely the existing `items` -> machines relationship (items fall, then
  the carrier lifts them).
- The rider is counted in `mass` (above) **whether or not** they are the
  reason the carrier is moving, so stepping on is always felt.
- **No refusal at any weight.** Boarding is never refused (D4 as amended).
  The refusal that exists instead is a rate-limited `'TOO HEAVY TO LIFT'` row
  pushed when a crank is actively being turned and the carrier is
  nonetheless descending — the one state that is otherwise baffling ("I am
  cranking and it is going down").

Known risk surface: jitter at a band seam; the player being carried into a
ceiling (the carrier must stop at `t` bounds, and the player's own `moveY`
ceiling bonk handles the rest); a framerate-dependent ride distance (tested
at eight framerates the way hardness already is).

## Tunables

Every number is a `data/tuning.js` row read through `eff()`; only
`model/mods.js` may import that file.

| id | kind | base | unit | note |
|---|---|---|---|---|
| `segUp` | value | 11 | px/s | carrier ascent at full surplus |
| `segDown` | value | 26 | px/s | free descent on a vertical segment |
| `segBase` | value | 1.0 | drive | drive needed to raise an empty carrier at full speed. The unit `crank.torque` is denominated in |
| `segLoad` | value | 0.025 | drive/talent | added drive per talent, at full slope. 40 T (the whole burden cap) doubles the requirement |
| `riderMass` | value | 8 | talents | the player's own body on a carrier, before their pockets |
| `segReach` | scale | 1.0 | x, scope `machine` | multiplies `hub.reach`. Where a range boon or a better hub tier goes |
| `crankTorque` | scale | 1.0 | x, scope `machine` | multiplies `crank.torque`. Where a strength boon goes |
| `torqueLoss` | scale | 1.0 | x, scope `machine` | multiplies `gear.loss` |

`docs/SPEC.md` §17 carries these numbers as the locked contract.

## Where every piece lives

| piece | layer | file |
|---|---|---|
| hub / crank / gear / axle rows | `data` | `data/machines.js` |
| machine substances, bills, grants | `data` | `substances.js`, `recipes.js`, `grants.js` |
| the eight tunables | `data` | `data/tuning.js` |
| segment records + queries | `model` | `model/segments.js` |
| `torque` / `turn` on a machine | `model` | `model/machines.js` |
| `carrierUnder` for the ride branch | `model` | `model/segments.js` |
| drivetrain solve + carrier motion + carry + ride | `rules` | `rules/drive.js` |
| the ride branch in movement | `rules` | `rules/player.js` |
| `linkSegment` / `unlinkSegment` | `rules` | `rules/placement.js` |
| segment/hub cleanup on deconstruct | `rules` | `rules/placement.js` |
| carrier, cable, gear, crank sprites | `view` | `view/paint.js` (+ `look:{}` data) |
| the cable ghost | `view` | `view/hud.js` |
| `cmd.action` (hold), `cmd.link` (edge) | `shell` | `shell/input.js` |
| `ui.linkFrom` | `shell` | `shell/ui.js` |
| the link dispatch | `shell` | `shell/main.js` |
| the step slot | `shell` | `shell/schedule.js` |

`rules/drive.js` is scheduled between `machines` and `cycles`
(`src/shell/schedule.js` states and argues the adjacency): a hub's own
buffered state settles before the drivetrain is solved, so feeding and
turning are one beat; and **`player` runs before `drive`**, so the ride
translation is applied to a position collision has already resolved — the
identical freshness argument `items before belts` makes elsewhere in that
file.

## Binding decisions

| # | decision | status |
|---|---|---|
| **A1** | The gears-vs-auto-cable reconciliation. | Power/transmission is placed and adjacency-checked; the transport cable between two hubs is the one auto-resolved piece. Landed as CLAUDE.md D10. |
| **A2** | Torque is a per-component scalar, apportioned by demand, rather than a per-edge flow solve. | Confirmed. |
| **A3** | Diagonal footprints do not conduct torque; a corner needs a gear in it. | Confirmed. |
| **A4** | A segment's path is checked at link time only, never re-checked. | Confirmed. |
| **A5** | Does a heart-power fallback survive, moved to the crank? | **Rejected — explicitly, in the user's own words:** "no ignore the blood winch stuff for now, that's a different idea. just have you turn the crank to turn it. the payment is that YOU THE PLAYER have to be standing there turning the crank so you can't be doing other stuff." The crank is manual-only, full stop — no heart-powered or otherwise passive fallback of any kind. Recorded in CLAUDE.md D10's "Manual only, for now" paragraph. |
| **A6** | Deconstructing a hub with a rider aboard: allow (the rider falls) or refuse. | Allow. |
| **A7** | Link cost: hubs are priced; the cable is free, bounded only by reach. | Confirmed. |
| **A8** | Narrow the tile-byte guard to packable substances only (the fix that made adding four new machine substances possible without overflowing the tile byte). | Confirmed. |
| **(boarding)** | Should an overloaded player ever be refused boarding a carrier? | **Confirmed, in the user's own words:** "Always allow, physics handles it." Landed as the CLAUDE.md D4 amendment — no `'TOO HEAVY TO CLIMB'`-style refusal for a carrier; an over-cap rider is load the drivetrain must overcome, not a permission check. |
