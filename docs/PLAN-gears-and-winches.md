# Plan — gears, cranks and segment transport

**Status: BUILT.** Segment transport shipped in Phase 8f. Kept below as the
design record; the "PROPOSAL" framing that follows describes the plan before
it was executed.
This is the document a human reads before any code is written, in the shape
`docs/BUILD_PLAN.md` Phase 10's own plan-mode step would produce. It replaces
the staged winch (`src/rules/lift.js`, `data/machines.js`'s `lift` row) with
player-driven, gear-linked **segment transport**, and it deliberately changes
`CLAUDE.md` invariant 4 and decision D4 — both drafted below for review, both
**unapplied**.

Read `CLAUDE.md`, `ARCHITECTURE.md` §1 §3 §5 §6, `docs/SPEC.md` §2 §3 §8 §13
§15 and `docs/BUILD_PLAN.md` Wave 2 first. Everything cited below was read in
the repo at commit `0da2a06`; every `file:line` is real, not inferred.

---

## 1. The brief, as given

Verbatim user messages salvaged to `.claude/brain/transport-brief.md`. In
short: replace the staged winch entirely with segments (not one cage, not
five fixed stages) between placeable endpoints; unpowered by default,
weighted to descend; a manual crank now, generators later; gears connect
multiple systems spatially; visual iteration is part of the work; and a
mid-plan correction that a rider must never be refused, only weighed down or
run in reverse — the point that produced the CLAUDE.md D4 amendment and the
"boarding is never refused" rule `docs/TRANSPORT.md` states.

---

## 2. Recon — what actually existed before this phase

`src/rules/lift.js` and the `lift` machine row it went with were retired in
Phase 8f, replaced by `rules/drive.js` + `model/segments.js` (`docs/TRANSPORT.md`
is the normative reference now). §2.1–2.5's line-by-line recon of the deleted
file and its two blockers (the tile-byte budget, `tools/check.mjs`'s
fuel-priced break-even section) are both resolved and gone with it; nothing
here still needs reading to work on segment transport.

### 2.6 Idioms this design reuses rather than reinvents

- **Signature-keyed recompute** for a network that changes rarely:
  `rules/light.js:50-57` + `emittersFor:89-108` + `signatureOf:114-119` +
  `isDirty:127-135`, with a module-local `WeakMap` cache and no `newRun()` hook
  to forget (fresh records every run).
- **Half-tile sweep** for anything traced through the grid:
  `rules/items.js:143-145` — *"No substep longer than half a tile, in either
  axis."* The clear-path test in §4.5 is this, not a Bresenham.
- **One decision, two readers:** `model/run.js#placementCheck` +
  `view/hud.js#buildGhost:327-352` / `#drawFootprintGhost:307-325`.
- **Hold-to-act:** `cmd.craft` is a hold (`shell/input.js:95`),
  `rules/crafting.js:63-80` accumulates while it is true and forgets on
  release. The crank is this, with a proximity test instead of a recipe.
- **Rate-limited refusal:** `rules/machines.js:304-311` (`WeakMap`, 1.0 s gap)
  for "more than one machine can be stalled at once".
- **Rules siblings may not import each other**, but `tools/layers.mjs:33-35`
  declares one exception: *"a driver may bind leaf helpers from a
  sub-directory below itself"* — so `rules/drive.js` may import
  `rules/drive/solve.js` if it grows too large. `LAYER_BUDGET` is 0
  (`:44`).

---

## 3. The binding-document changes — landed, not proposed

This section drafted exact replacement text for `CLAUDE.md` invariant 4,
`ARCHITECTURE.md` §9 invariant 4, the `CLAUDE.md` D4 amendment, and a new
`CLAUDE.md` D10. All of it applied verbatim; a second copy of binding text
here would only be a drift hazard against the real one. See `CLAUDE.md`
invariant 4 and D4/D10, `ARCHITECTURE.md` §9, and `docs/SPEC.md` §17.

---

## 4. The design

### 4.1 Data model — three new interpreter keys, no new engine concept

All three are `data/machines.js` blocks in exactly the class `lift:{}`,
`belt:{}`, `mine:{}` and `light:{}` already occupy: a key the generic
interpreter reads, with no machine name anywhere in `rules/`.

```
hub    { reach, carries }
       reach    px, the longest segment this hub may anchor. Multiplied by the
                new `segReach` scale tunable, scope 'machine' — so a better
                hub row is content (a `variantOf` with a bigger reach) and a
                boon that lends range is one tuning row. This is the brief's
                "LIMITS (maybe expandable)".
       carries  ['material'] | ['material','player'] — what the carrier may
                bear. Ships as both; data so a cheap chain can be
                material-only later without an engine edit.

crank  { torque, reach }
       torque   drive units supplied while the player is turning it. 1.0 is
                "enough to raise one empty carrier at full speed" — see 4.3.
       reach    px the player must stand within, the same shape and the same
                units `handFeed:{reach:10}` already uses on every row.

gear   { loss }
       loss     fraction of torque lost per hop along the drivetrain graph.
                This is the reason a drivetrain is not free to sprawl, and the
                seam a generator eventually plugs into.
```

Rows to add (`tw`/`th`/`footing` in the style of the existing table):

| id | name | size | block | notes |
|---|---|---|---|---|
| `hub` | WINCH HUB | 2x2, footing 2 | `hub:{ reach:96, carries:['material','player'] }` | 96 px = 12 tiles. No `ports`, no `buffer`, no `recipes` — the first row with none, and the interpreter already handles that (`rules/machines.js#choose` returns null, `produce` zeroes progress) |
| `crank` | HAND CRANK | 1x2, footing 1 | `crank:{ torque:1.0, reach:12 }` | `reach:12` is `handFeed`'s 10 plus a little, so "close enough to feed" and "close enough to turn" read the same |
| `gear` | GEAR | 1x1, footing 1 | `gear:{ loss:0.06 }` | the linkage primitive |
| `axle` | AXLE | 3x1, footing 1 | `variantOf:'gear'`, `gear:{ loss:0.02 }` | three tiles of reach for a third of the loss — *content*, not code, exactly as `kiln_divine` and `belt_l` are |

Each needs a `data/substances.js` machine row (mass + `hud.order`), a
`data/recipes.js` build recipe producing `<id>/rig`, and a
`data/grants.js#STARTING_MACHINES` entry. Priced per §6.2. **Four substance
rows is why Blocker 1 must be fixed first.**

**The segment is not a machine, and must not be one.** It has no footprint, no
buffer, no recipe, and it is created by an *action between two machines* rather
than placed. `model/segments.js`:

```js
export const segments = [];        // cleared by newRun(), like machines/items

// one record
{ a, b,                 // the two hub machine RECORDS (never ids: machines
                        //   never move, and a removed hub must invalidate this)
  ax, ay, bx, by,       // world-px anchor points, cached at link time
  len,                  // px
  slope,                // (yLo - yHi) / len, 0 horizontal .. 1 vertical
  hi,                   // 'a' | 'b' — which end is UP. Ties resolve to 'a',
                        //   deterministically.
  t,                    // 0..1 carrier parameter, 0 = the LOW end
  dir,                  // -1 up | 0 still | +1 down, for view only
  load,                 // talents currently riding, for view and the tooltip
  band }                // the band the carrier is currently in
```

Queries `model/segments.js` owns (numbers and questions, per `CLAUDE.md` rule
1): `carrierPos(seg)`, `carrierBox(seg)` (the `deckBox` idiom, `DECK_GRAB`
slack, sized by the carrier's own width), `segmentsAt(m)`, `linkedTo(a, b)`,
`linkCheck(a, b)` (§4.5), `chains()` and `breaks()` (§7's Phase 9 layer), and
`carrierUnder(band, box)` — the one `rules/player.js` needs (§4.4).

Write API, bumping the epoch like every other model write: `write.link`,
`write.unlink`, `write.unlinkAll(m)`, `write.carrier(seg, t, dir)`,
`write.load(seg, talents)`, `write.band(seg, band)`, `write.clear()`.

Drivetrain state goes on the **machine record**, not in a new module, because
`view` must draw a turning gear and `view` may not import `rules`: exactly the
precedent `m.running` and `m.fire` already set. `model/machines.js` gains
`write.torque(m, v)` (0..1 drive actually delivered this frame) and
`write.turn(m, phase)` (accumulated rotation, for the sprite). Both are
`bump()`ing one-liners beside `write.fire:69`.

### 4.2 The manual crank

`shell/input.js` gains one hold, in the shape `cmd.craft` already has
(`:95` — `if (key === 'u') cmd.craft = down;`), **not** an edge like `place`:

```js
if (key === 'f')  cmd.turn = down;      // hold to turn the nearest crank
```

`f` is free (the old `F`/`L` machine-spawn keys were retired in `66ad0e7`;
`shell/input.js`'s live set is `wasd`/arrows, space, `x`/`j`, `e`, `u`, `q`,
backspace, `v`, `p`, `g`, `c`, `h`, `i`, escape, `o`, `m`, `r`, digits, plus
`t`/`b`/`k`/`y` behind `flags.showDebug`). Add it to `clearEdges`' blur list
(`:232`), **not** to `clearEdges` itself — a hold is not an edge.

Then in `rules/drive.js`:

```
a crank is ACTIVE this frame  <=>  cmd.turn && overlaps(playerBox(), m.box, def.crank.reach)
```

`overlaps(a, b, slack)` (`core/math.js:14-16`) is the same call
`rules/machines.js#handFeed:134` makes, so "within reach to turn" and "within
reach to feed" can never disagree. Every crank within reach turns — holding one
key at a junction of two cranks turns both, which is a legitimate build.

**Time is the cost, and that is the point.** Nothing is spent but the player's
presence: no fuel, no charge, no item. `docs/DESIGN.md`'s cost-of-ascension
equation therefore reprices from talents-of-fuel to seconds-of-attention, which
is a *stronger* statement of the thesis (the one resource automation cannot
give you more of is your own standing there) and is what §6.5's rewritten
break-even check measures.

Feedback, all through the journal (`rules` never calls `play()`/`toast()`): a
`'turn'` journal row on the rising edge of a crank actually delivering torque,
gapped by the `rules/machines.js:304-311` `WeakMap` idiom; the existing `winch`
sound row (`data/sfx.js:25`) is the obvious reuse for arrival, and a new sfx row
for the crank ratchet is content, added with the phase.

### 4.3 Motion — one expression, three cases, and the player's weight in it

Per frame, per segment:

```
mass   = Σ massOf(item) for items in carrierBox        // model/items.js#massOf
       + (rider ? eff('riderMass') + burdenOf() : 0)   // model/run.js#burdenOf

need   = eff('segBase') + eff('segLoad') * mass * seg.slope
supply = drive(component containing seg's hubs)        // 4.4 below
surplus = supply - need

surplus > 0   ->  ascend  at eff('segUp')   * min(1, surplus / eff('segBase'))
surplus == 0  ->  hold still
surplus < 0   ->  descend at eff('segDown') * min(1, -surplus / eff('segBase'))
                                            * seg.slope
```

Everything the brief asks for falls out of that one expression, with no special
cases:

- **Unpowered is weighted descent.** `supply = 0` → `surplus = -need ≤
  -segBase` → descent at full `segDown * slope`. There is no `descend()`
  branch and no `charges > 0` gate; the *same* line produces it. Today's
  `rules/lift.js:83-86` is replaced, not ported.
- **A rider weighs it down.** An 8 T body plus 30 T of ore on a vertical
  segment is 38 T; at `segLoad` 0.025 that is `need = 1 + 0.95 = 1.95`, so a
  single 1.0-torque crank yields `surplus = -0.95` and **the carrier runs
  backwards under them**, at about half descent speed. Drop the ore
  (`cmd.drop`, D4's prerequisite verb) and it climbs. Add a second crank and a
  gear, and it climbs loaded. This is exactly the brief's point 7.
- **Shallower gives less back.** `slope` is 0 for a horizontal segment, so
  weight stops mattering *and* gravity stops helping: an unpowered horizontal
  segment sits still, and a powered one runs at full speed regardless of load.
  Level transport costs continuous attention and nothing else — legible, and
  it keeps horizontal logistics expensive in the one currency the design cares
  about.
- **Nothing makes ascent cheap.** The one way to raise a heavy carrier is more
  drivetrain, and every gear hop costs `gear.loss`.

Arrival at an end: clamp `t`, release riding material (`it.rest = 0`, the
`rules/items.js` wake idiom), and if the carrier's band changed, hand items
over with `iw.spawn` + `iw.remove` at the same world pixel — `lift.js:108-117`
verbatim in shape, because it is the only sanctioned way to change an item's
band. Push the existing `'winch'` journal row so `shell/notify.js:52-54` and
`data/sfx.js` need no edit at all.

Material rides by translation, one addition per item, exactly
`lift.js#carry:94-103` (`it.y += dy` becomes `it.x += dx; it.y += dy`, since a
segment is no longer axis-aligned).

**Determinism:** no `rand()` anywhere (invariant 7). Iteration order is the
`segments` array order, which is link order. `m.turn` accumulates from `dt`
alone, so the gear sprite is reproducible from the seed and the frame count.

### 4.4 The drivetrain solve

Nodes: every placed machine whose row carries `crank`, `gear` or `hub`. Edges:
**orthogonal footprint adjacency** — two footprints sharing an edge, computed
from `m.tx/m.ty` + `def.tw/th`, in the same band. Diagonals do **not**
conduct; a corner needs a gear in it. That is a deliberate legibility choice
(A3).

Per connected component, per frame:

```
supply = Σ over active cranks c:  crank.torque(c) x eff('crankTorque', def.id)
                                   x (1 - gear.loss)^hops(c -> nearest hub)
demand = Σ over segments anchored in this component:  need(seg)
drive  = demand > 0 ? min(1, supply / demand) : 0
```

and every segment in the component ascends at `drive` (i.e. `surplus` in §4.3
is computed with `supply_seg = drive * need(seg)`; equivalently, apportion
`supply` across segments in proportion to their own `need`). One crank, three
loaded segments → all three at a third speed. Each hub's `m.torque` is set to
its component's `drive` so the view can draw it, and `m.turn` advances by
`drive * dt * TURN_RATE`.

Cost and caching, following `rules/light.js` exactly: the component partition
changes only when the machine set or the segment set changes, so it is cached
in a module-local `WeakMap` keyed by band and invalidated by a **signature** —
`machines.length`, `segments.length`, and a rolling hash of node positions —
recomputed per frame at a cost of one pass over a few dozen records. Crank
*activity* changes every frame and is therefore never cached. Node counts are
in the tens; there is no reason to do better, and a comment should say so.

### 4.5 Linking, and the clear-path test

**One decision, two readers.** `model/segments.js#linkCheck(a, b)` returns
`{ ok, why }` and is the only implementation. `rules/placement.js#linkSegment`
calls it and turns `false` into a journal row plus the mutation; `view/hud.js`
calls it and turns `false` into a tinted cable ghost with the one-word reason
beside it. Neither keeps a second copy. This is `placementCheck`'s own pattern
(`model/run.js:254-267`, `view/hud.js:297-306`).

Refusals, in this order (structural before affordable, per `placementCheck`'s
own stated ordering):

| `why` | test |
|---|---|
| `'NOT A HUB'` | either end's row has no `hub` block |
| `'ALREADY LINKED'` | `linkedTo(a, b)` |
| `'TOO FAR APART'` | `len > min(reachOf(a), reachOf(b))`, where `reachOf(m) = MACH[m.def].hub.reach * eff('segReach', def.id)` — the **smaller** of the two hubs governs, so a long-reach hub does not lend its reach to a short one |
| `'THE PATH IS BLOCKED'` | any sample along the span is solid |
| `'OUTSIDE THE WORLD'` | any sample resolves to no band |
| `'TOO STEEP TO STAND'` | *(deliberately absent — every angle is legal. Listed only to record that it was considered and rejected.)* |

The clear-path test, over a span at any angle, is the **existing half-tile
sweep**, not a new line algorithm. `rules/items.js:143-145` states the rule:
*"No substep longer than half a tile, in either axis."* So:

```
n = max(1, ceil(len / (tile * 0.5)))
for k in 0..n:  p = lerp(anchorA, anchorB, k/n)
                b = bandAt(p.x, p.y)          // model/world.js:157
                if (!b) refuse 'OUTSIDE THE WORLD'
                if (solidAt(b, tileX(b,p.x), tileY(b,p.y))) refuse 'THE PATH IS BLOCKED'
```

`bandAt` per sample is what makes a cross-band segment work at all, and it is
the same call `rules/lift.js#ascend:75` already trusts for the handoff. **Note
the interaction with Phase 10:** astral is `tw:96, origin.x:128`, so today a
hub in surface columns `tx<16` or `tx>=112` cannot link upward into the sky at
all — those samples resolve to no band. That is the identical 32-column dead
zone Phase 10 Step 1 already plans to close by widening astral to `tw:128,
origin.x:0`, and this gives it a second reason.

**Is the path re-checked after linking?** No, and this is deliberate: a segment
whose path is later blocked by a placed tile or a fresh wall **keeps working**,
because re-validating every segment every frame is a cost with no gameplay
behind it, and because "your cable now runs through a wall you built" is a
cosmetic problem, not a soft-lock. Recorded as A4 in case a reviewer disagrees.

**The link verb.** Two presses of one key, with the reticle over a hub:

- `l` (free; historically the lift key) → `cmd.link`, **edge-triggered**, the
  `hop`/`place` latch idiom (`shell/input.js:92-94`) with a `linkHeld` local
  and a line in `clearEdges()`.
- First press with `aim` over a hub: `shell/ui.js` gains `ui.linkFrom = m`
  (which endpoint is armed is UI state, `CLAUDE.md` D2 — *"which panel is
  open, the focused slot, the drag payload are `shell`"*), with
  `armLink`/`clearLink` beside `armPlace`/`clearArmedPlace`
  (`shell/ui.js:194-195`), reached through `frameCtx` because `view` may not
  import `shell`.
- Second press over another hub: `shell/main.js#applyIntents` calls
  `rules/placement.js#linkSegment(from, to)` and clears the arm on success —
  the exact shape the `cmd.place` branch already has (`main.js:159-188`).
- Escape clears it, in the same line that already clears an armed placement
  (`input.js:177`). A `linkFrom` whose machine has since been deconstructed
  clears on the same top-of-frame sweep `main.js:144` does for a stale armed
  pair.
- Second press on the **same** hub, or on an already-linked partner: unlink
  (`'THE CABLE IS CUT'`). One key, both directions.

**The ghost.** `view/hud.js#buildGhost:327-352` gains a third branch beside
`F.rig` and tile-capable: with `f.ui.linkFrom` set, draw the candidate cable
from the armed hub's anchor to the aimed point, in `UI.good` or `UI.heart` per
`linkCheck`, with the `why` drawn beside the far end by the existing
`drawText` call at `:323`. Draw the first blocked sample as a refusal-coloured
tile so *where* it is blocked is visible, and draw the reach limit as the point
the cable is clipped to when `len` exceeds it. Integer pixels, `lineTo` per
`CLAUDE.md`'s conventions.

**Deconstructing a hub** must drop its segments: `rules/placement.js#deconstruct`
(`:83-110`) calls `segw.unlinkAll(m)` after its existing empty-check. A rider
on a segment being cut simply falls — invariant 4's whole argument is that
gravity is the answer, and the fall damage curve already exists. Whether
deconstruct should *refuse* while a rider is aboard is A6.

### 4.6 Riding — the one genuinely new player interaction

Today there is no ride mechanic to extend (`rules/lift.js:44-51` says so). The
carrier is **not** terrain and must not become terrain: invariant 1 is that the
tile grid is the only source of truth, and `rules/belts.js:13-20` already leans
on machines not being solid.

So the carrier supports the player through a **model query**, exactly the way a
ladder does. `rules/player.js` reads `climbAt` (`model/tiles.js`) to decide the
ladder branch; it will read `model/segments.js#carrierUnder(band, playerBox())`
to decide a ride branch:

- `rules/player.js` (the existing step, which runs *before* the drive step)
  treats "standing on a carrier" like "standing on ground": `onGround` true,
  gravity not integrated, `fallFrom` pinned by the existing line at `:137`
  (`if (player.onGround || player.onLadder) pw.set('fallFrom', player.y)`), so
  **no fall damage accrues while riding** with no new code in `land()`.
- Horizontal input still walks; walking off the carrier's edge resumes gravity
  on the very next frame, from the existing collision path. Hop off works
  unchanged and is not burden-gated on a carrier — a hop is a hop.
- `rules/drive.js` then translates the player by the carrier's own delta with
  `pw.move`, the same way `carry()` translates items. Two writers of
  `player.y` in one frame, in a fixed order stated in `shell/schedule.js` —
  which is precisely the existing `items` → `lift` relationship (items fall,
  then the deck lifts them).
- The rider is counted in `mass` (§4.3) **whether or not** they are the reason
  the carrier is moving, so stepping on is always felt.
- No refusal at any weight. `rules/lift.js:52-53`'s `'TOO HEAVY TO CLIMB'`
  push is **deleted**, per §3.3. Its replacement is a rate-limited
  `'TOO HEAVY TO LIFT'` row pushed when a crank is actively being turned and
  the carrier is nonetheless descending — the one state that is otherwise
  baffling ("I am cranking and it is going down").

Risks, named because this is the most likely thing to go wrong: jitter at a
band seam; the player being carried into a ceiling (the carrier must stop at
`t` bounds, and the player's own `moveY` ceiling bonk at `:311` handles the
rest); and a framerate-dependent ride distance. The last one is why §6.5 tests
ride distance at eight framerates the way hardness already is.

### 4.7 Tunables

Every number is a `data/tuning.js` row read through `eff()`; only
`model/mods.js` may import that file (`tools/layers.mjs:37-41`).

| id | kind | base | unit | note |
|---|---|---|---|---|
| `segUp` | value | 11 | px/s | carrier ascent at full surplus. **Same base as today's `liftUp`, renamed** |
| `segDown` | value | 26 | px/s | free descent on a vertical segment. **Same base as `liftDown`** |
| `segBase` | value | 1.0 | drive | drive needed to raise an empty carrier at full speed. The unit `crank.torque` is denominated in |
| `segLoad` | value | 0.025 | drive/talent | added drive per talent, at full slope. 40 T (the whole burden cap) doubles the requirement |
| `riderMass` | value | 8 | talents | the player's own body on a carrier, before their pockets |
| `segReach` | scale | 1.0 | x, scope `machine` | multiplies `hub.reach`. Where a range boon or a better hub tier goes |
| `crankTorque` | scale | 1.0 | x, scope `machine` | multiplies `crank.torque`. Where a strength boon goes |
| `torqueLoss` | scale | 1.0 | x, scope `machine` | multiplies `gear.loss` |

`liftUp`/`liftDown` are **renamed, not duplicated**: two rows meaning ascent
speed is exactly the drift `CLAUDE.md` warns about. `docs/SPEC.md` §17 gets
them.

### 4.8 Where every piece lives

| piece | layer | file | new? |
|---|---|---|---|
| hub / crank / gear / axle rows | `data` | `data/machines.js` | rows |
| machine substances, bills, grants | `data` | `substances.js`, `recipes.js`, `grants.js` | rows |
| the eight tunables | `data` | `data/tuning.js` | rows |
| segment records + queries | `model` | **`model/segments.js`** | NEW |
| `torque` / `turn` on a machine | `model` | `model/machines.js` | 2 writers |
| `carrierUnder` for the ride branch | `model` | `model/segments.js` | NEW |
| drivetrain solve + carrier motion + carry + ride | `rules` | **`rules/drive.js`** | NEW, replaces `rules/lift.js` |
| the ride branch in movement | `rules` | `rules/player.js` | edit |
| `linkSegment` / `unlinkSegment` | `rules` | `rules/placement.js` | edit |
| segment/hub cleanup on deconstruct | `rules` | `rules/placement.js` | edit |
| carrier, cable, gear, crank sprites | `view` | `view/paint.js` (+ `look:{}` data) | edit |
| the cable ghost | `view` | `view/hud.js` | edit |
| `cmd.turn` (hold), `cmd.link` (edge) | `shell` | `shell/input.js` | edit |
| `ui.linkFrom` | `shell` | `shell/ui.js` | edit |
| the link dispatch | `shell` | `shell/main.js` | edit |
| the step slot | `shell` | `shell/schedule.js` | edit |

`rules/drive.js` takes the `lift` slot in `STEPS` (`schedule.js:164`), keeping
both adjacency arguments and rewriting them:

- **`machines before drive`** — a hub's own buffered state and a crank's charge
  (if A5 lands) settle before the drivetrain is solved, so feeding and turning
  are one beat. (Replaces *"a charge banked this frame turns the drum now"*.)
- **`drive before tutorial`** — unchanged in force: `rules/tutorial.js` is a
  pure observer and goes as late as it can.

And one relationship that must be stated explicitly in that file's comment
block: **`player` runs before `drive`**, so the ride translation is applied to
a position collision has already resolved — the identical freshness argument
`items before belts` already makes.

---

## 5. Open decisions — confirmed by the user, binding

| # | decision | **decided** |
|---|---|---|
| **A1** | The gears-vs-auto-cable reconciliation. | **Confirmed.** Power/transmission is placed and adjacency-checked; the transport cable between two hubs is the one auto-resolved piece. Landed as `CLAUDE.md` D10. |
| **A5** | **Does the heart-power fallback survive, moved to the crank?** | **REJECTED — explicitly, in the user's own words: "no ignore the blood winch stuff for now, that's a different idea. just have you turn the crank to turn it. the payment is that YOU THE PLAYER have to be standing there turning the crank so you can't be doing other stuff."** The crank is manual-only, full stop — no heart-powered or otherwise passive fallback of any kind. Recorded in `CLAUDE.md` D10's "Manual only, for now" paragraph. |
| **A7** | Link cost: hubs are priced; the cable is free, bounded only by reach. | **Confirmed.** |
| **A8** | Blocker 1's fix: narrow the tile-byte guard to packable substances. | **Confirmed.** |
| **(brief point 7)** | **Boarding refusal.** Should an overloaded player ever be refused boarding a carrier? | **Confirmed, in the user's own words this time (not a paraphrase): "Always allow, physics handles it."** Landed as the `CLAUDE.md` D4 amendment — no `'TOO HEAVY TO CLIMB'`-style refusal for a carrier; an over-cap rider is load the drivetrain must overcome, not a permission check. |

The remaining open decisions (A2–A4, A6: torque as a per-component scalar,
diagonal non-conduction, link-time-only path checking, allow-deconstruct-
under-a-rider) were confirmed with no dissent and no reasoning beyond the
confirmation itself — see `CLAUDE.md` D10 and `docs/TRANSPORT.md` for the
shipped behavior, not this list.

---

## 6. The phases

Inserted between Phase 8b and Phase 9, as **8c → 8g**. Process rules in
`docs/BUILD_PLAN.md` §1 apply unchanged: one commit per agent, reviewer after
every phase, `npm run check` + `npm run lint` + `npm run test:visual` green or
a re-accepted baseline with the reason in the commit, ownership blocks
respected, every number a `data/tuning.js` row, every number `docs/SPEC.md`
should own in `docs/SPEC.md` first.

**Why this order.** The user asked for visual iteration *before* mechanical
lock-in. A visual phase needs something real to draw — `view` cannot render
state that does not exist, and a fake render path would be thrown away. So
8d lands the data and model **with no motion at all** (hubs place, segments
link, carriers park), 8e iterates the pixels against that static-but-real
state and builds the screenshot matrix, and only then does 8f make it move and
delete `rules/lift.js`. The old winch keeps working untouched through 8d and
8e, so the wave is never in a half-broken state.

**Phases 8c–8g shipped** (substance-budget fix, the hub/segment/link
skeleton, the visual-iteration pass, the drivetrain and the winch's removal,
and the harness) — their prompt-and-acceptance text is gone with the work;
`docs/TRANSPORT.md` is the normative reference for what they built.

### 6.6 — Deferred, named, not designed: Phase 8h — belts take torque

The brief's *"a manual winch that the player has to turn to drive belts"* means
`rules/belts.js` should eventually consume drivetrain torque instead of banked
charges (`belts.js:52` reads `m.charges > 0`). The seam is one file and one
`data/machines.js` key (`belt:{ dir }` gains adjacency to the drivetrain), and
the drivetrain solve after 8f already produces the number it needs. **Not
specified here**, because it changes the price of horizontal logistics —
`docs/DESIGN.md`'s "deliberately rare" argument — and that is a design decision
of its own, not a mechanical follow-on.

---

## 7. Patches owed to the already-written Phase 9 and Phase 10

Applied in `02849b1` — `docs/BUILD_PLAN.md`'s Phase 9/10 prompts no longer
describe a `rules/lift.js` API that doesn't exist.

---

## 8. Explicitly not designed here

- **Generators.** Deferred by the brief. The architecture must not preclude
  them, and it does not: a generator is a `data/machines.js` row with a
  `crank:{}`-shaped block that reports active without the player standing
  there — i.e. one predicate in `rules/drive.js`'s `active()`, and no change to
  the solve, the motion expression or any tunable. **Do not build it.**
- **Electricity.** Flagged only, per the brief ("might be far later game"). If
  it ever lands it is a second transmission medium alongside the drivetrain,
  not a replacement for it; nothing here forecloses that and nothing here
  should anticipate it.
- **Belts on torque.** §6.6 names the seam and stops.
- **The Cloud Dock.** Phase 10's, unchanged in scope; §7 only stops it from
  citing dead code.
- **A per-edge torque flow solve.** A2 rejects it on cost/benefit; if a future
  mechanic genuinely needs per-edge flow, the component solve is the thing it
  replaces, in one file.
- **Retuning the burden cap or the compression ratios.** `docs/SPEC.md` §8 and
  §9 stand. What changes is the *currency* ascent is priced in (player seconds,
  not fuel talents), and only `tools/check.mjs`'s break-even section measures
  that.

---

## 9. Risk register

| risk | why it is likely | mitigation in the plan |
|---|---|---|
| **The ride is the hard part.** Two writers of `player.y` in one frame, a moving platform that is not terrain, and fall damage that must not fire. | Nothing like it exists in the codebase today. | §4.6 models it on the ladder branch (a model query, not a new collision model); 8g's framerate table and the ride/step-off damage pair are the tests that would catch it. |
| **A one-crank drivetrain feels bad.** Standing still holding a key while a bucket creeps 12 tiles is the mechanic, and it may simply not be fun. | It is a *design* risk, not an engineering one, and no test can find it. | 8f's acceptance is a physical playtest, in order, by a human — and `segUp`, `segBase` and `segLoad` are tunables precisely so the answer is a number, not a rewrite. |
| **Scope creep into generators.** The moment cranking feels tedious, "just add a generator" is the obvious fix and it is out of scope. | Human nature. | §8 states the one-predicate shape a generator would take, so the temptation is cheap to resist and cheap to satisfy later. |
