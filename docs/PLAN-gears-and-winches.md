# Plan — gears, cranks and segment transport

**Status: PROPOSAL. Nothing here is built. No `src/` file has been touched.**
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

The current winch was rejected outright ("nothing like what i wanted"). The
reference image is a continuous bucket chain running between two large gears —
one at a shaft floor, one at the surface — a separate counterweighted pulley
bucket, and a ladder alongside for climbing by hand. The design, in the user's
own words plus one mid-plan correction:

1. **Replace the current winch entirely.** Not an additional tier.
2. **Segments, not one cage, and not five fixed vertical stages.** *"you can
   link but there are LIMITS (maybe expandable) about how long lift segments
   can be. note that they don't purely have to be straight up either (though
   the space for them must be clear) in theory you can just pick two endpoints
   (that are within a certain radius) and then join them with a cable (can be
   automatic) is my vision."*
3. **Unpowered by default, weighted to descend.** *"there should also be a
   handle where the player can 'manually' winch material up (the player can i
   guess ride the pulley if they wish but it will be weighted right, so if they
   get on a platform it will want to go down!)"* and *"They should be unpowered
   (only either by player winch OR by generator (implement that later)."*
4. **Power, in implementation order:** (a) NOW — a manual crank the player
   holds: *"Active — player must hold/turn it to generate power... matches
   hold-to-mine/hold-to-craft. Manual labor has a real time cost."* (b) LATER,
   out of scope — generators, then (much later, flagged only) electricity.
   *"for all motion like this to be a form of gears and pulleys initially
   connected to a manual winch that the player has to turn to drive belts and
   vertical elevator/mine shafty type bucket things upwards (they can connect
   with gears multiple systems together) and then eventually generators can
   drive the shafts. Feels a bit more greco roman than electricity."*
5. **Gears connect multiple systems.** *"Spatial — gears are real, placed,
   physically connected... Power only flows through adjacent/connected gear and
   shaft tiles you actually place."*
6. **Visual iteration is part of the work, not after it.** *"I think you will
   need to iterate visually on this so you will need to add many playwright
   tests for how they look."*
7. **CORRECTION received mid-plan, and it is load-bearing:** *"don't bar the
   player from riding the lift! but they are heavy so they will probably weight
   it down either slowing the lift down or causing it to run in reverse! ...
   lift should be physicy!"*

Point 7 supersedes the obvious port of today's over-cap boarding refusal
(`rules/lift.js:52-53`) and, with it, one clause of `CLAUDE.md` D4. §4.3 and
§3.3 below are written to it.

---

## 2. Recon — what actually exists today

Verified by reading the files, at `0da2a06`.

### 2.1 `src/rules/lift.js` (126 lines) in full shape

| lines | what |
|---|---|
| 1-21 | header. States invariant 4 as its reason for existing: *"there is no object in this file that could grow into a world-spanning elevator"*, and the charge indirection that makes the blood winch free |
| 34 | `const DECK_GRAB = 3` — px slack within which material counts as ON the deck |
| 36-58 | `step(dt)`: for every machine with a `lift` block **and** a `deck`, ascend while `m.charges > 0 && m.deck.y > top`, else `descend` |
| 41-42 | `top = m.box.y - def.lift.span`, `bottom = m.box.y`. The stage's travel is one span straight up from its own footprint |
| 44-56 | the **only** place the player's hitbox is tested against a deck: `overlaps(playerBox(), deckBox(m)) && burdenFrac() >= 1` → push `'refused'` `'TOO HEAVY TO CLIMB'` and **hold the stage**, charge intact. Its own comment: *"The winch carries only MATERIAL today (see `carry()` below -- there is no player-ride mechanic here to extend)"* |
| 61-80 | `ascend()`: `eff('liftUp')`, carries the load, on arrival hands the haul to `bandAt(cx, y) \|\| m.band`, spends one charge, pushes a `'winch'` journal row |
| 83-86 | `descend()`: `eff('liftDown')`, unconditional, **returns empty** |
| 88-90 | `deckBox(m)` — full footprint width, `DECK_GRAB*2` tall, centred on `deck.y` |
| 94-103 | `carry()`: `it.y += dy; it.vy = 0; it.rest = 1` per item in the deck box, then `mw.load(m, n)` |
| 108-117 | `deposit()`: band handoff by `iw.spawn` at the same world pixel then `iw.remove` — the only sanctioned way to change an item's band |
| 122-126 | `reaches(m)` — exported query: does `bandAt(cx, box.y - span)` equal `bandOf(lift.toBand)` |

### 2.2 The `lift` machine row and its data

- `src/data/machines.js:36-38` documents the `lift:{ span, toBand }` interpreter
  key; `:123-157` is the row. `tw:2, th:3, footing:2`;
  `lift:{ span:64, toBand:'astral' }` at `:148`; two inline recipes at
  `:150-153` — `{ in:{'*/#fuel':1}, out:[], secs:6.0 }` then
  `{ in:{heart:1}, from:'vital', out:[], secs:6.0 }`. The comment at `:130-133`
  states the trap: *"timber first, so the winch behaves like an ordinary
  fuelled lift for as long as you have timber, and only starts eating hearts
  once you have run dry."*
- `src/model/machines.js:41-44` — `deck: def.lift ? { y, dir: 0, load: 0 } : null`,
  with invariant 4 restated in the comment. Write API: `write.deck` `:65`,
  `write.load` `:66`, `write.charge` `:67`, `write.spendCharge` `:68`.
- `src/rules/machines.js:183` banks a charge when a recipe produced nothing
  (`out:[]`); `:194` `if (def.lift && m.charges > 0) return null` stops a stage
  holding an unspent haul from burning more fuel.
- `src/data/tuning.js:46-48` — `liftUp` 11 px/s, `liftDown` 26 px/s.
- `src/data/grants.js:25-26` — `STARTING_MACHINES` includes `'lift'`, so it is
  buildable from run start with no grant.
- `src/data/recipes.js:81-89` — the build recipe: 6 `copper/plate` + 4
  `timber/log` + 2 `copper/ingot`, `secs:20.0`, `hand:true`, out
  `lift/rig` × 1.
- `src/data/substances.js:213-216` — the `lift` machine substance,
  `item:{ mass:20.8, hud:{ order:13 } }`.
- `src/view/paint.js:304-310` — the deck and its cable, two rects, drawn from
  `m.deck.y`.
- `src/data/sfx.js:25` `winch` sound; `src/shell/notify.js:52-54` the `winch`
  journal text (`"<n> DELIVERED TO <BAND>"`). **Both are journal/sfx names, not
  machine names, so both survive this redesign unchanged.**

### 2.3 `placementCheck`'s `'NO SHAFT TO SERVE'` branch

`src/model/run.js:268-318` is the single placement decision (footprint →
footing → `minDepth` → lift shaft → affordability). The lift branch is
`:305-309`:

```js
  if (def.lift) {
    const cx = worldX(band, tx) + def.tw * band.tile / 2;
    const topY = worldY(band, ty) - def.lift.span;
    if (bandAt(cx, topY) !== bandOf(def.lift.toBand)) return { ok:false, why:'NO SHAFT TO SERVE' };
  }
```

The comment at `:294-304` records **why** the arithmetic is duplicated from
`rules/lift.js#reaches`: `model` may not import `rules`. Note for the Phase 9
patch below: BUILD_PLAN cites this branch as `run.js:286` **twice** — the real
line is **308**, and the function starts at 268.

### 2.4 Everything else that names the lift (the removal ledger)

| file:line | reference | fate |
|---|---|---|
| `src/shell/schedule.js:104-105` | `machines before lift` adjacency comment | rewritten for the new step |
| `src/shell/schedule.js:106-118` | `lift before tutorial` | the new step takes the same slot; comment updated on both sides |
| `src/shell/schedule.js:141`, `:164` | import + `STEPS` entry | replaced |
| `src/rules/belts.js:13-26`, `:41` | *"`rules/lift.js#carry()` turned ninety degrees"*, `DECK_GRAB` reference | comments repointed; belts otherwise untouched this wave |
| `src/model/run.js:328` | comment naming `rules/lift.js`'s boarding refusal | rewritten (the refusal is being deleted — §4.3) |
| `src/view/hover.js:36`, `:51` | tooltip comments naming the lift's `vital` source and inline recipe | repointed |
| `src/view/ui/mainPanel.js:509` | LOGISTICS tab: *"a banked lift/belt charge (`m.charges`)"* | still true of belts; comment narrowed |
| `tools/check.mjs:789-815` | **BREAK-EVEN DEPTH** reads `D_mach.MACH[D_mach.M.lift]` and `liftDef.lift.span` | **this section throws the moment the row or the block is deleted.** Must be rewritten in the same commit — see §6.5 |
| `tools/check.mjs:262-273` | blood-winch note; generic over any recipe with `from:` | assertion survives; only vacuous if the heart recipe moves. See A5 |
| `tests/visual.spec.js:602` | belt test comment: *"the honest-fuel recipe this row shares with the lift"* | comment only |
| `docs/SPEC.md:194`, `:353`, `:364-381`, `:486` | the lift's cost row, the `placementCheck` order, **The winch shaft check** | superseded by a new numbered section (§3.4) |
| `docs/DESIGN.md:233` | *"staged lift as the bottleneck \| yes \| yes (`lift` machine, one stage)"* | rewritten |
| `docs/BUILD_PLAN.md` Phase 9/10/11 | see §7 | patched on approval |

**There are no lift screenshot baselines.** `tests/visual.spec.js-snapshots/`
holds 19 PNGs and none contains a placed winch, so deleting the row is not a
visual-regression event. Adding the new machines is.

### 2.5 Two blockers found in recon

**BLOCKER 1 — the substance budget, and the good news that it is a false
constraint.** `src/data/forms.js:225-228`:

```js
const STRIDE = FORM.length + 1;
if (1 + (SUB.length - 1) * STRIDE + FORM.length >= BEDROCK)
  throw new Error(`forms: ${SUB.length} substances x ${FORM.length} forms overflows the tile byte`);
```

Measured live: 19 substances × 11 forms, `STRIDE` 12, guard value **228** of
255. The next two substance rows are legal (240, 252); the **third overflows**
(264). `docs/SPEC.md` §15's "two rows left" is correct *as the guard is
written*.

This redesign needs **three or four** new machine substances (hub, crank, gear,
and probably an axle). It does not fit.

But the guard is conservative, and measurably so: the highest **tile-capable**
substance ordinal is `adamant` at **8**, so real tile-byte usage is
`1 + 8*12 + 11 = 108` of 255. Ten of the nineteen rows (`bellows`, `pick`,
`auger`, `chasm`, and all six machine substances) have no `tile` block, can
never cross with a tile-capable form (`gravel`'s `subTags` are
`['metal','rock']`; a machine substance's only tag is `machine`), and are
therefore **never passed to `packTile`** — `rules/placement.js#placeTile:132`
gates on `FORM[form]?.tile`, and `placeableFromPockets:125` treats `rig`
separately precisely because `rig` is not tile-capable.

**Proposed fix (Phase 8c):** narrow the guard to the maximum *packable*
substance ordinal, and add the content-lint assertion that makes it safe — for
every substance, if any tile-capable form is `crossable` with it, its ordinal
must be ≤ the packable maximum. That is ~6 lines in `data/forms.js`, one
assertion in `tools/content.mjs`, and a `docs/SPEC.md` §15 correction. It
raises tile-capable headroom from 2 rows to **12** and makes non-tile rows
(machines, relics, miracles) effectively free.

**Fallback if that is rejected:** retire the `lift` substance (frees one) and
spend the last two, giving exactly three new rows and **zero** headroom. That
is not a budget anyone should want to be at, and the next machine of any kind
blocks. A third option — `mat` as a `Uint16Array` — is named and *not*
recommended here: it touches `packTile`/`subOfTile`, the chunk bake and every
tile write for a constraint the guard fix removes for free.

**BLOCKER 2 — `tools/check.mjs`'s break-even section is written against fuel
mass.** `:789-815` prices ascent as `fuelMass / spanTiles / refItemMass` and
asserts the compression ordering `ore < ingot < plate`. With a hand crank there
is no fuel at the lift at all: the currency becomes **seconds of player time**.
The assertion that matters (a more compressed tier survives to a greater depth)
survives the change of units; the section must be rewritten, not deleted. §6.5.

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

## 3. The binding-document changes, drafted for review

These are of the same weight as D1–D9 and are **not** applied by this document.
Land them as one orchestrator commit before Phase 8c's agent runs, exactly as
D5–D9 were landed in `1d7f3dc`.

### 3.1 `CLAUDE.md` invariant 4 — exact replacement

It stays item **4** of the `## Invariants — breaking these breaks the premise`
list, in the same slot, immediately after invariant 3 and before invariant 5.

Current text (`CLAUDE.md:91-93`):

```
4. **Down is free, up is expensive.** Falling is fast and costs hearts;
   climbing is half walk speed and costs material; the winch ascends only with
   a lit burner. Five independent lift stages, never one continuous cage.
```

Proposed replacement:

```
4. **Down is free, up is expensive.** Falling is fast and costs hearts;
   climbing is half walk speed and costs material; a carrier rises only while
   something is actively turning it and slides back down under its own weight
   for nothing. **Transport is bounded segments between placed endpoints,
   never one continuous cage:** a segment joins exactly two hub machines
   within `hub.reach x eff('segReach', <hub>)` of each other over an
   unobstructed path, and reaching further means placing another hub and
   another segment. No object in the code may describe a route longer than one
   segment — a route is a derived query over segments
   (`model/segments.js#chains`), never a record. A segment may run at any
   angle, and the shallower it runs the less gravity gives back, so a
   horizontal line needs power in both directions. **Load is physical, not a
   permission:** cargo and a riding player both weigh on the carrier, and past
   what the drivetrain can turn it slows, stops, and then runs backwards. That
   is the premise enforced by arithmetic instead of by a refusal.
```

### 3.2 `ARCHITECTURE.md` §9 invariant 4 — exact replacement

Same commit, or doc and code drift. Current (`ARCHITECTURE.md:218-219`):

```
4. Down is free, up is expensive. Falling is fast and costs hearts; climbing is
   half walk speed and costs material; the lift only ascends with a lit burner.
```

Proposed:

```
4. Down is free, up is expensive. Falling is fast and costs hearts; climbing is
   half walk speed and costs material; a carrier rises only while a drivetrain
   is being turned, and descends under its own weight for nothing. Transport is
   bounded segments between two placed hubs, never one continuous cage.
```

### 3.3 `CLAUDE.md` D4 — amendment, because of brief point 7

D4's third bullet (`CLAUDE.md:339-340`) currently reads:

```
- at or over the hard cap: **climbing is impossible.** Ladder-up, hop and
  boarding a lift stage upward are all refused, legibly, through a journal row.
```

Proposed replacement:

```
- at or over the hard cap: **climbing is impossible.** Ladder-up and hop are
  refused, legibly, through a journal row.
- **a carrier is the one exception, and it is physics rather than permission.**
  Boarding is never refused at any weight. The player's body plus everything
  in their pockets is real load on the segment (§ the segment-transport plan),
  so an over-cap player standing on a carrier makes it slow, stall, or run
  backwards under them. The ascent is still impossible; nothing had to say so.
```

And D4's second deliberate exception (`CLAUDE.md:351-354`) keeps its wording;
the drop verb is still the prerequisite it names, and now it is also the way
off a carrier that is sinking.

### 3.4 New `CLAUDE.md` decision D10 — vocabulary and the reconciliation

Append after D9, in the same style:

```
### D10 — one word per part, and where the cable stops being physical

Five nouns, and nothing in code, docs or a commit message may use a sixth:

| term | what it is | where it lives |
|---|---|---|
| **hub** | a placed machine that a segment may be anchored to. Gears and a drum. | `data/machines.js` row with a `hub:{}` block |
| **segment** | ONE cable between exactly TWO hubs, carrying one carrier. Runtime, not a machine. | `model/segments.js` (state) + `rules/drive.js` (motion) |
| **carrier** | the bucket/platform that rides a segment. One per segment. | a field on the segment record |
| **chain** | a maximal connected run of segments. DERIVED, never stored. | `model/segments.js#chains()` |
| **drivetrain** | the placed crank/gear/axle graph that supplies torque. | `crank:{}` / `gear:{}` blocks, solved in `rules/drive.js` |

**The reconciliation, stated because the brief contains both readings.**
Everything that supplies or transmits POWER is physical, placed and adjacent:
a crank, a gear, an axle, and the hub they feed. Power flows only through
footprint adjacency between those machines, exactly as "gears are real, placed,
physically connected" requires. The one thing that is NOT tile-by-tile placed
is the CABLE between two hubs: once both hubs exist, are within reach, and the
straight path between them is clear, the segment resolves itself. So the player
places endpoints and drivetrains, never cable — and a belt is still the
tile-by-tile thing a belt always was.

**Torque is a component scalar, not a per-edge flow.** One crank feeding three
segments through gears turns all three at a third speed. That is the whole of
"gears connect multiple systems together": a shared, divisible resource with a
visible cost, not a graph-flow simulation.
```

### 3.5 `docs/SPEC.md` — a new numbered section

`docs/SPEC.md` currently ends at §16.5 (line 717). Add **§17 — Segment
transport, cranks and gears**, locking: hub footprints and reach, segment
length cap, the three motion cases and their tunables, rider mass, torque
supply/loss, the link refusal strings, and the new machine bills. And mark §13's
lift row and §13's **The winch shaft check** paragraph (`:375-381`) as
superseded by §17, in §13's existing "SUPERSEDED by section 15" style rather
than by deletion.

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
| **A2** | Torque is a per-component scalar, apportioned by demand, rather than a per-edge flow solve. | **Confirmed** (accepted with phase sequencing; not separately re-litigated). |
| **A3** | Diagonal footprints do not conduct torque; a corner needs a gear in it. | **Confirmed** (as above). |
| **A4** | A segment's path is checked at link time only, never re-checked. | **Confirmed** (as above). |
| **A5** | **Does the heart-power fallback survive, moved to the crank?** | **REJECTED — explicitly, in the user's own words: "no ignore the blood winch stuff for now, that's a different idea. just have you turn the crank to turn it. the payment is that YOU THE PLAYER have to be standing there turning the crank so you can't be doing other stuff."** The crank is manual-only, full stop — no heart-powered or otherwise passive fallback of any kind. `data/sources.js#vital`, the `heart` named unit, and `check.mjs:262-273`'s blood-winch check are now DEAD CONTENT once the lift row is retired in Phase 8f, unless a future phase finds them a new home. Phase 8f must remove or explicitly repark them, not silently leave them orphaned. Recorded in `CLAUDE.md` D10's "Manual only, for now" paragraph. |
| **A6** | Deconstructing a hub with a rider aboard: allow (the rider falls) or refuse. | **Confirmed:** allow. |
| **A7** | Link cost: hubs are priced; the cable is free, bounded only by reach. | **Confirmed.** |
| **A8** | Blocker 1's fix: narrow the tile-byte guard to packable substances. | **Confirmed.** |
| **(brief point 7)** | **Boarding refusal.** Should an overloaded player ever be refused boarding a carrier? | **Confirmed, in the user's own words this time (not a paraphrase): "Always allow, physics handles it."** Landed as the `CLAUDE.md` D4 amendment (§3.3) — no `'TOO HEAVY TO CLIMB'`-style refusal for a carrier; an over-cap rider is load the drivetrain must overcome, not a permission check. |

All of §3 (invariant 4 in `CLAUDE.md` and `ARCHITECTURE.md`, the D4 amendment,
and new decision D10) is now LANDED, not proposed — applied in the commit
following this plan's completion. Phase 8c's agent reads the applied result.

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

### 6.0 — Prerequisite: the orchestrator lands the binding changes

Not an agent phase. One human commit: `CLAUDE.md` invariant 4 (§3.1), D4
amendment (§3.3), new D10 (§3.4), `ARCHITECTURE.md` §9 invariant 4 (§3.2), plus
the answers to A1–A8 recorded in this file. Phase 8c's agent reads the result,
not this proposal.

### 6.1 — Phase 8c: unblock the substance budget (1 × `systems`, small, serial)

```
Read CLAUDE.md (including the new D10 and the reworded invariant 4),
ARCHITECTURE.md section 2, docs/SPEC.md section 15, docs/PLAN-gears-and-winches.md
section 2.5, and src/data/forms.js's tile-id packing block in full.

THE PROBLEM, MEASURED. src/data/forms.js:225-228 fails the build when
1 + (SUB.length - 1) * STRIDE + FORM.length >= 255. Live: 19 substances x 11
forms, STRIDE 12, guard value 228 -- two rows of headroom. But the highest
TILE-CAPABLE substance ordinal is `adamant` at 8, so real usage is
1 + 8*12 + 11 = 108. Ten rows (bellows, pick, auger, chasm, and six machine
substances) can never be packed: rules/placement.js:132 gates placeTile on
FORM[form]?.tile, :125 treats `rig` separately, and no tile-capable form's
subTags are crossable with a `relic`/`machine`/`miracle` substance.

1. NARROW THE GUARD to the maximum PACKABLE substance ordinal -- the highest
   ordinal for which any tile-capable form is `crossable`. Keep the throw, keep
   its message shape, and state the new headroom in the message. Do not change
   packTile/subOfTile/formOfTile arithmetic at all: an ordinal is still an
   ordinal.

2. ADD THE LINT THAT MAKES IT SAFE, in tools/content.mjs as a new numbered
   assertion in the established style: for every substance, if any tile-capable
   form is crossable with it, its ordinal must be <= the packable maximum.
   Without this the guard is narrowed on a fact nothing enforces. PROVE IT
   FAILS: temporarily give a machine substance a tag that makes it crossable
   with `gravel`, confirm the assertion fires, revert. An assertion never seen
   to fail has not been tested.

3. REPORT the new figures and CORRECT docs/SPEC.md section 15's "two substance
   rows left" in the same commit, with the arithmetic shown.

Do NOT add any substance, form, machine or tunable in this phase. This phase
only removes a false constraint.

FILE OWNERSHIP: src/data/forms.js (the guard block only), tools/content.mjs
(one new assertion), docs/SPEC.md (section 15), docs/FINDINGS.md.
```

**Acceptance:** `npm run check` and `npm run check:content` green; `npm run
test:visual` passes with **no** snapshot updates (nothing rendered changed);
the reported tile-capable headroom is ≥ 10 rows; the new assertion has been
seen to fail.

### 6.2 — Phase 8d: the skeleton — hubs, segments, the link verb, no motion (1 × `systems`, serial)

```
Read CLAUDE.md (invariant 4 as reworded, D2, D4 as amended, D10),
ARCHITECTURE.md sections 1-3 and 5, docs/SPEC.md sections 2 3 8 13 15,
docs/PLAN-gears-and-winches.md sections 2 and 4 in full, and these files
before you write a line: src/rules/lift.js, src/data/machines.js's key
reference block (lines 1-81), src/model/machines.js, src/model/run.js
#placementCheck, src/rules/placement.js, src/shell/ui.js, src/shell/input.js.

GOAL. Hubs, cranks and gears are placeable machines; two hubs in range with a
clear path between them can be LINKED into a segment; a segment has a carrier
that sits still. NOTHING MOVES YET, and rules/lift.js is NOT touched -- the old
winch keeps working through this phase and the next.

1. DATA (docs/PLAN section 4.1). Four machine rows (hub, crank, gear, axle as
   a variantOf gear), four machine substances with masses, four build recipes
   producing <id>/rig, four STARTING_MACHINES entries. Price them against the
   40 T burden cap and docs/SPEC.md section 8's compression ratios: a hub is
   the investment (refined -- plate and ingot, in the class the retired lift
   was priced in), a crank and a gear are cheap enough to build several
   (timber and gravel), an axle sits between. Every mass is the
   substance.item.mass x form.massK x n arithmetic model/items.js#massOfPair
   already uses -- do not invent a second sum.

2. TUNABLES. All eight rows from docs/PLAN section 4.7, each with a `note` in
   the style of the rows already there. segUp/segDown carry liftUp/liftDown's
   EXACT bases (11 and 26); do NOT delete liftUp/liftDown yet -- rules/lift.js
   still reads them until Phase 8f.

3. MODEL: src/model/segments.js (new), exactly the record shape, write API and
   query list in docs/PLAN section 4.1. It is model, so it owns numbers and
   questions and makes no decisions. Every writer bumps the epoch.
   write.clear() is called from shell/boot.js's newRun alongside the other
   model clears -- a segment surviving a restart is the determinism bug
   invariant 8 exists to name.

4. THE LINK DECISION lives in model/segments.js#linkCheck(a, b), returning
   { ok, why } with exactly the refusal strings in docs/PLAN section 4.5, in
   that order. ONE implementation, TWO readers (rules and view), the same rule
   model/run.js#placementCheck already follows -- see
   docs/DEVELOPER_GUIDE.md#one-decision-two-readers. The clear-path test is the
   HALF-TILE SWEEP rules/items.js:143-145 already states ("no substep longer
   than half a tile"), with bandAt() per sample so a cross-band span works. Do
   not write a Bresenham.

5. RULES: rules/placement.js gains linkSegment(a, b) / unlinkSegment(seg) --
   call linkCheck, turn a false into a journal row with its reason, mutate on
   success. And #deconstruct calls segw.unlinkAll(m) after its existing
   empty-check, so a removed hub cannot leave a dangling segment.

6. SHELL: `l` as an EDGE-triggered cmd.link (the hop/place latch idiom at
   input.js:92-94 plus a line in clearEdges), ui.linkFrom in shell/ui.js
   beside armedPlace with armLink/clearLink, Escape clearing it on the line
   that already clears an armed placement, the two-press dispatch in
   applyIntents mirroring the cmd.place branch, and a stale-linkFrom sweep
   mirroring main.js:144. Expose linkFrom on __mf.ui's projection (a
   serialisable {tx, ty, def}, not the record) and segments on __mf so the
   next two phases can drive this from a test with no hardcoded click
   coordinates.

7. NO MOTION, NO TORQUE, NO RIDING. A carrier parks at t=0 (the low end).
   model/machines.js may gain write.torque/write.turn now if you want them in
   one place, but nothing writes a nonzero value this phase.

FILE OWNERSHIP: src/data/machines.js, src/data/substances.js,
src/data/recipes.js, src/data/grants.js, src/data/tuning.js,
src/model/segments.js (new), src/model/machines.js (the two new writers only),
src/rules/placement.js, src/shell/ui.js, src/shell/input.js, src/shell/main.js
(the link dispatch and the __mf projection), src/shell/boot.js (one clear()
call), docs/SPEC.md (open section 17 and fill what this phase locks),
docs/FINDINGS.md. DO NOT TOUCH src/rules/lift.js, src/rules/player.js,
src/rules/machines.js, src/view/ or tools/.
```

**Acceptance:** place two hubs 8 tiles apart with clear air between them, press
`l` on each, and a segment exists in `__mf.segments` with the right anchors and
slope. Place them 20 tiles apart and the second press refuses with `'TOO FAR
APART'`. Leave one tile of rock on the line and it refuses `'THE PATH IS
BLOCKED'`. Deconstruct a hub and the segment is gone. Restart and
`__mf.segments` is empty. `npm run check` + `check:content` green, layer
violations still **0**. The old winch still lifts.

### 6.3 — Phase 8e: how it looks (1 × `ui`, serial after 8d) — THE VISUAL ITERATION PHASE

This is the phase the user asked for by name, and it is a *loop*, not a pass:
draw, screenshot, look, change, screenshot again. Budget it accordingly.

```
Read docs/PLAN-gears-and-winches.md, docs/SPEC.md sections 1 6 12, CLAUDE.md
D7 D8 and the Conventions section, docs/AUDIT-2.md section 4, and
view/treatments.js's own header. Study the reference image the brief supplied
(a continuous bucket chain between two large gears, one at a shaft floor and
one at the surface; a counterweighted pulley bucket; a ladder alongside).

GOAL. Hubs, cables, carriers, cranks and gears that read as Greco-Roman
machinery at this viewport, and a screenshot matrix dense enough that any
future change to them is caught.

--- THE ARCHITECTURAL CONSTRAINT, UNCHANGED ---

docs/SPEC.md section 12: no machine or substance name may appear in src/view/.
So every appearance decision is a key on the machine row's look:{} block,
dispatched generically -- the same indirection Phase 8 extended for terrain,
and view/paint.js#paintMachine already reads look.body/trim/base/pips/fire off
the row. ADD KEYS to look:{}; do not add a name check to paintMachine. Its own
canopy/grassCap exceptions (paint.js:174-180) are pre-existing and are not a
licence for a third.

--- WHAT TO DRAW ---

  HUB       a drum and a large toothed gear, 2x2. The gear's rotation phase
            comes from m.turn (a model number this phase does not write yet --
            read it, and it will simply be 0 until Phase 8f). NEVER from
            rand(), NEVER from a frame counter: invariant 7, and
            view/treatments.js's header says it again.
  CABLE     the segment, at any angle, integer pixels, drawn with lineTo per
            CLAUDE.md's conventions. Two tones so it reads as a loop rather
            than a wire. This is the first thing in the project drawn along an
            arbitrary line -- state in a comment how you keep it integral.
  BUCKETS   the CHAIN, which is what the reference image is actually about:
            evenly spaced buckets along the cable, phase-locked to the
            carrier so the whole loop reads as one mechanism. Deterministic
            from the carrier's t and the segment's own geometry.
  CARRIER   the platform/bucket that rides. It must read as standable -- the
            player will stand on it in Phase 8f.
  CRANK     a handle, and a visible turning state (again, from m.turn).
  GEAR/AXLE 1x1 and 3x1 linkage, drawn so a CONNECTED train reads as connected
            and an accidentally-diagonal one visibly does not mesh. That
            second half is the point: docs/PLAN A3 makes diagonals dead, and
            the art is what teaches it.
  LOAD      a carrier's `load` (talents aboard) legible at a glance -- how
            full the bucket looks, not a number.

--- THE CABLE GHOST ---

view/hud.js#buildGhost gains a third branch beside F.rig and tile-capable
(see docs/PLAN section 4.5): with f.ui.linkFrom set, draw the candidate cable
tinted by model/segments.js#linkCheck, the one-word `why` beside its far end
with the existing drawText call, the FIRST BLOCKED SAMPLE marked, and the
cable clipped at the reach limit when it is too long. view may not import
rules; linkCheck is a model query and you may read it.

--- THE SCREENSHOT MATRIX (this is not optional, and it is not deferred) ---

Add to tests/visual.spec.js, driven through __mf and the model exactly as the
existing tests are -- NEVER a hardcoded click coordinate (CLAUDE.md: a click
at (400,300) fails at a different base buffer). At minimum:

  hub alone / two hubs unlinked / a vertical segment with the carrier at the
  bottom, the middle and the top / segments at roughly 30, 45 and 60 degrees /
  a horizontal segment / a crank alone / a crank plus a two-gear train plus a
  hub / an accidentally diagonal (non-conducting) gear pair / a three-segment
  chain that connects / the same chain with the middle segment missing / a
  loaded carrier / the cable ghost showing OK / the cable ghost showing TOO FAR
  APART / the cable ghost showing THE PATH IS BLOCKED / a segment in an unlit
  shaft / the same segment lit.

maxDiffPixels stays 0. Every baseline you commit is a REVIEWABLE change, not a
formality -- say in the commit which ones you looked at and what you judged.
And per CLAUDE.md's recorded mistake ("a test can silently test nothing"):
for the ghost shots, prove the pixels differ with linkFrom unset.

ITERATE BEFORE YOU BASELINE. Render, look at the PNG, change it, look again.
Commit the baselines once, at the end, not after every attempt -- a baseline
churned five times in one phase tells a reviewer nothing.

FILE OWNERSHIP: src/view/paint.js, src/view/hud.js, src/view/treatments.js,
look:{} keys on the four new src/data/machines.js rows (appearance only -- no
behaviour key), src/core/palette.js + src/data/palette.js (new colour names
only), tests/visual.spec.js (new tests only), and the new baselines. Nothing in
rules/, model/ or shell/.
```

**Acceptance:** a human looks at the matrix and says the machinery reads as the
reference image's family. A cable at 45° has no stair-step artefacts at 1x.
Every new baseline is committed once, with a sentence per shot in the commit.
`npm run check` green (render purity: the epoch counter unchanged across a draw
of every new path, no `rand()` in any of it).

### 6.4 — Phase 8f: the drivetrain, motion, riding — and the winch is retired (1 × `systems`, serial after 8e)

```
Read docs/PLAN-gears-and-winches.md sections 2, 4.2-4.6 and 5 in full, plus:
src/rules/lift.js (you are deleting it -- read every comment first, they record
what it learned), src/rules/light.js (the signature/dirty-recompute idiom you
are reusing), src/rules/player.js's header (three bugs, one of which is
"gating a height gain on state wedged a player in their own shaft"),
src/rules/items.js, src/shell/schedule.js in full.

GOAL. Cranks make torque, gears carry it, segments move, the player can ride,
and rules/lift.js is gone.

1. THE SOLVE (docs/PLAN 4.4). Components over orthogonal footprint adjacency
   between crank/gear/hub machines; supply from active cranks with gear loss
   per hop; demand summed per component; drive = min(1, supply/demand),
   uniform across the component. Cache the PARTITION behind a signature and a
   module-local WeakMap exactly as rules/light.js:114-135 does, and say in a
   comment why the crank's own activity is deliberately NOT cached. Write
   m.torque and m.turn so view can draw it.

2. A CRANK IS A HOLD. cmd.turn, the cmd.craft shape (a hold, not an edge), and
   overlaps(playerBox(), m.box, def.crank.reach) -- the SAME core/math.js call
   rules/machines.js#handFeed makes, so reach-to-turn and reach-to-feed cannot
   disagree. Nothing is spent but the player's presence.

3. MOTION IS ONE EXPRESSION, THREE CASES (docs/PLAN 4.3). Implement it as
   written: need = segBase + segLoad * mass * slope; surplus = supply - need;
   ascend / hold / descend. THERE IS NO SEPARATE descend() FUNCTION AND NO
   CHARGE GATE -- weighted descent is what the expression already produces at
   zero supply, and a second code path for it would be two rules for one
   fact.

4. MASS INCLUDES THE RIDER: eff('riderMass') + burdenOf(), plus massOf() over
   the items in the carrier box. CLAUDE.md D4 AS AMENDED IS BINDING HERE:
   boarding is NEVER refused at any weight. Delete rules/lift.js:52-53's
   'TOO HEAVY TO CLIMB' push; replace it with a rate-limited 'TOO HEAVY TO
   LIFT' row pushed only when a crank is being turned AND the carrier is
   descending anyway (the WeakMap gap idiom at rules/machines.js:304-311).

5. RIDING (docs/PLAN 4.6). model/segments.js#carrierUnder is the query;
   rules/player.js gains a ride branch beside the ladder branch, treating a
   carrier top as ground (onGround true, gravity not integrated, fallFrom
   pinned by the existing line 137 so no fall damage accrues). rules/drive.js
   then translates the player with pw.move, after rules/player.js has already
   resolved collision -- the identical freshness relationship items->belts
   already has. Walking or hopping off resumes gravity on the next frame with
   no new code. DO NOT make a carrier solid and DO NOT add a second collision
   model (invariant 1).

6. CARRY AND HAND OFF. rules/lift.js#carry:94-103 for material, generalised to
   two axes; #deposit:108-117 verbatim in shape for the band handoff, since
   iw.spawn + iw.remove at the same world pixel is the only sanctioned way to
   change an item's band. Reuse the EXISTING 'winch' journal kind on arrival
   so shell/notify.js:52-54 and data/sfx.js need no edit.

7. RETIRE THE WINCH, completely, in this commit:
   - delete src/rules/lift.js and its schedule import/entry; rules/drive.js
     takes the slot, with BOTH adjacency comments rewritten (see docs/PLAN 4.8)
     plus the new `player before drive` argument stated explicitly.
   - delete the `lift` machine row, its substance row, its build recipe and its
     STARTING_MACHINES entry; delete the lift:{} key from data/machines.js's
     key reference; delete liftUp/liftDown from data/tuning.js.
   - delete model/machines.js's `deck` field and its deck/load writers, and
     view/paint.js:304-310's deck draw.
   - delete model/run.js#placementCheck's def.lift branch and its
     'NO SHAFT TO SERVE' string (:305-309) -- the reach and clear-path checks
     now live in model/segments.js#linkCheck, where a SEGMENT is validated
     rather than a lone machine guessing about a band it might reach.
   - delete rules/machines.js:194's `def.lift && m.charges > 0` gate.
   - A5's answer decides the heart recipe: if it survives, it moves to the
     crank row as a second power source and data/sources.js#vital stays live;
     if not, say so in the commit and rewrite tools/check.mjs:262-273's
     blood-winch comment so it does not describe a mechanism that no longer
     exists.
   - repoint every comment in docs/PLAN section 2.4's table. A comment naming
     a deleted file is a lie the layer checker cannot catch.

8. tools/check.mjs's BREAK-EVEN DEPTH section (:789-815) reads
   MACH[M.lift].lift.span and WILL THROW the moment step 7 lands. Reprice it in
   the new currency -- SECONDS OF PLAYER CRANKING per item-slot per tile
   (len/segUp, scaled by need) instead of fuel mass per tile -- and keep the
   assertion that actually matters: a more compressed tier survives to a
   GREATER depth. Print the raw-ore figure for a human, as it already does.

9. DOCS: docs/SPEC.md section 17 completed and section 13's lift row and "The
   winch shaft check" paragraph marked superseded (section 13's own "SUPERSEDED
   by section 15" style -- do not delete the record). docs/DESIGN.md:233's
   "staged lift as the bottleneck | yes | yes (`lift` machine, one stage)" row
   rewritten, and the cost-of-ascension section noted as repriced from fuel to
   player time.

FILE OWNERSHIP: src/rules/drive.js (new), src/rules/lift.js (deleted),
src/rules/player.js, src/rules/machines.js (the one gate deleted),
src/rules/placement.js, src/model/segments.js, src/model/machines.js,
src/model/run.js (the lift branch deleted), src/data/machines.js,
src/data/substances.js, src/data/recipes.js, src/data/grants.js,
src/data/tuning.js, src/data/sources.js (only if A5 says so),
src/shell/schedule.js, src/shell/input.js, src/view/paint.js (the deck draw
deleted; sprites are Phase 8e's and are not to be restyled here),
tools/check.mjs (the break-even section only), docs/SPEC.md, docs/DESIGN.md,
docs/FINDINGS.md.
```

**Acceptance, physically performed:**

1. Place a hub at a shaft floor and one at the surface within reach, link them,
   place a crank beside the lower hub, hold `f` — the carrier rises and the
   gear turns.
2. Let go — it slides back down. Let go on a **horizontal** segment — it does
   not move at all.
3. Drop ore into the carrier, crank, and it is delivered at the top with the
   existing `"<n> DELIVERED TO <BAND>"` toast.
4. Stand on the carrier empty and crank: you rise. Fill your pockets to 30 T
   and crank again: **it runs backwards under you**, and a `'TOO HEAVY TO
   LIFT'` toast says why. Drop the ore (`q`) and it climbs again.
5. Place a second crank and gear-link it: the loaded carrier climbs.
6. Link one crank to two segments through gears: both climb at half speed.
7. Chain three segments up a shaft and send ore from the bottom to astral.
8. `npm run check` green including layer violations at **0**; `npm run
   check:content` green; `npm run test:visual` — Phase 8e's baselines will move
   for anything that now turns, which is a **deliberate** change: re-accept it
   and say per-shot why in the commit.
9. `grep -rn "lift" src/` returns only the word in prose where it still makes
   sense. No file references `rules/lift.js`.

### 6.5 — Phase 8g: harness (1 × `harness`, may start during 8f, lands after it)

```
Read docs/PLAN-gears-and-winches.md, CLAUDE.md, and Phase 8f's diff. Extend
tools/check.mjs, tools/content.mjs and tests/visual.spec.js. There is no test/
directory and there must not be one.

--- TIER 1: PROPERTIES, node only, no browser ---

  FRAMERATE INDEPENDENCE, the invariant-10 test applied to this mechanic:
  a carrier's travel over 10 simulated seconds is identical at 30, 60, 90 and
  144 fps, and so is a RIDING player's displacement. check.mjs already runs
  hardness at eight framerates; point the same harness at this. A ride that
  is framerate-dependent is the same class of bug as the truncated-byte
  mining progress CLAUDE.md opens with.

  THE MOTION EXPRESSION, as a table rather than as prose: for a grid of
  (slope x mass x supply), assert the sign and magnitude of the carrier's
  velocity against docs/SPEC.md section 17's three cases. Include the exact
  boundary surplus == 0 and assert it HOLDS STILL.

  WEIGHT REVERSES IT: with one crank held and a rider carrying > the
  break-even mass, the carrier's net displacement over 5 s is NEGATIVE. This
  is the brief's own correction and it deserves its own named assertion.

  NOTHING MAKES ASCENT CHEAP: no combination of (slope, mass, supply) yields
  an ascent faster than eff('segUp'), and no unpowered segment ever ascends.
  A property test over a few thousand random parameter triples, seeded.

  TORQUE CONSERVATION: one crank driving N segments delivers total drive <=
  its own torque. Assert for N = 1, 2, 5.

  GEAR LOSS IS MONOTONIC: torque delivered falls as hops rise, and a diagonal
  neighbour delivers ZERO (docs/PLAN A3).

  LINK LEGALITY: over >= 200 seeds, a link is accepted if and only if
  linkCheck says so, and the half-tile sweep never accepts a span with a solid
  tile on it. Generate spans at every angle, including cross-band ones.

  DETERMINISM AND RESET: same seed plus the same scripted crank/link intents
  gives an identical state hash (check.mjs section 4 already has the harness);
  newRun() empties `segments` and zeroes every m.torque/m.turn (invariant 8 --
  extend the existing newRun fingerprint probe rather than writing a second).

  BREAK-EVEN, REPRICED: assert Phase 8f's rewritten section still orders
  ore < ingot < plate, in seconds of cranking rather than talents of fuel.

--- TIER 2: INVARIANTS ---

  RENDER PURITY over every new draw path (carrier at three positions, the
  cable ghost, a turning gear): the epoch counter unchanged across a render,
  and no rand() reachable from any of it.

  NO SECOND COLLISION MODEL: a carrier is not solid. Assert an item and the
  player can occupy a carrier's tiles with solidAt() false throughout, and
  that a segment's existence writes NOTHING to any band's mat array.

  GLOW/LIGHT SEPARATION is Phase 8b's; do not duplicate. But DO assert a
  segment emits no light unless a row says so.

  NO FALL DAMAGE WHILE RIDING, and full fall damage the moment you step off:
  ride 40 tiles up, take 0 hearts; walk off the edge at the top, take the
  SPEC section 3 table's answer for the height. Both in one test, because it
  is the pair that proves the ride branch pins fallFrom rather than disabling
  damage.

--- TIER 3: THE MOTION SNAPSHOT MATRIX ---

Phase 8e's matrix is static state. Add the moving states it could not cover:
a carrier mid-ascent with a rider aboard / mid-descent under its own weight /
a reversing carrier under an over-cap rider / a crank being turned with the
gear train lit / a three-segment chain in motion / a carrier at a band seam.
Fixed seeds, fixed tick counts, maxDiffPixels 0, input through __mf only.

Every new assertion must be SEEN TO FAIL: break the thing it names (invert
the slope term, make loss zero, let a rider's mass drop out of `mass`, unpin
fallFrom) and confirm the specific assertion written for it fires.

FILE OWNERSHIP: tools/check.mjs, tools/content.mjs, tests/visual.spec.js and
its baselines, package.json scripts, plus any __mf hook whose cost you name in
docs/FINDINGS.md first.
```

**Acceptance:** every assertion above green, and each one demonstrated failing
against a deliberately broken build. The framerate table for a ride is printed,
not just asserted.

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

**Not applied by this document.** Apply them when this plan is approved and
8c–8g are scheduled, so `docs/BUILD_PLAN.md` never describes a `rules/lift.js`
API that no longer exists. Each patch quotes the exact current text.

### 7.1 Phase 9 §4, the LIFT CHAIN layer (BUILD_PLAN.md:2075-2082)

Replace:

```
  LIFT CHAIN     the single most useful thing in this game. Draw every lift
                 stage, its span, which bands it connects, and — highlighted —
                 WHERE THE CHAIN BREAKS. A vertical factory's whole failure
                 mode is a gap between stages, and it is currently invisible.
                 The arithmetic already exists twice, and you may import
                 neither: rules/lift.js#reaches (view may not import rules)
                 and model/run.js#placementCheck's 'NO SHAFT TO SERVE' branch
                 (run.js:286, a model query you MAY read). Use the model one.
```

with:

```
  LIFT CHAIN     the single most useful thing in this game. Draw every
                 SEGMENT, its two hubs, its angle, which bands it spans, its
                 carrier's position, and — highlighted — WHERE THE CHAIN
                 BREAKS. A vertical factory's whole failure mode is a gap
                 between segments, and it is currently invisible. A CHAIN IS
                 DERIVED, NEVER STORED (CLAUDE.md D10), so the query is
                 model/segments.js#chains() and #breaks() -- a model query you
                 MAY read; there is no rules/lift.js and nothing in view may
                 import rules. Draw an UNPOWERED segment differently from a
                 driven one: an unpowered chain is not broken, it is merely
                 nobody's turn to crank, and those are different failures.
```

### 7.2 Phase 9 acceptance (BUILD_PLAN.md:2113-2114)

Replace:

```
**Acceptance:** open overview with three lift stages placed and a gap between
two of them, and the gap is the first thing you see.
```

with:

```
**Acceptance:** open overview with four hubs linked into three segments and a
gap where a fourth should be, and the gap is the first thing you see. An
unpowered but complete chain reads as complete, not as broken.
```

### 7.3 Phase 10 Step 1 (BUILD_PLAN.md:2142-2146)

Replace:

```
  - data/machines.js's WINCH STAGE already declares
    lift:{ span:64, toBand:'astral' }, and its comment already states the
    design: "one stage, one drum, one deck, one counterweight, pointed
    surface -> astral. Five stages would be five of these records placed at
    five level pairs; NEVER one continuous cage."
```

with:

```
  - the WINCH STAGE and its lift:{ span, toBand } block are GONE, replaced by
    hub/crank/gear machines and runtime segments -- see
    docs/PLAN-gears-and-winches.md and CLAUDE.md invariant 4 as reworded. A
    segment reaching astral is no longer a machine row DECLARING a destination
    band; it is two hubs within reach with a clear path between them, and the
    band a carrier delivers into is whichever band bandAt() puts it in on
    arrival. There is nothing left to declare and nothing to keep in sync.
```

### 7.4 Phase 10 Step 3 (BUILD_PLAN.md:2204-2210)

Replace:

```
  - Astral is widened to the surface's full column range by Step 1, so the
    dock may be placed at any column with a completed lift chain beneath it.
    Per Step 1's correction, most of the surface (tx 16-112) already had
    astral overlap before the widening — so if a lift chain built there
    still can't reach astral, the cause is a placement/height check
    (rules/lift.js#reaches, model/run.js#placementCheck), not band geometry.
    Diagnose which before assuming the widening alone fixes reachability.
```

with:

```
  - Astral is widened to the surface's full column range by Step 1, so the
    dock may be placed at any column with a completed chain beneath it. Per
    Step 1's correction, most of the surface (tx 16-112) already had astral
    overlap before the widening. IF A CHAIN BUILT THERE CANNOT REACH ASTRAL,
    THE CAUSE IS model/segments.js#linkCheck, AND THERE ARE ONLY TWO
    CANDIDATES: 'TOO FAR APART' (astral's floor is further above the surface
    than one hub's reach, which is correct and is answered by another hub, not
    by a fix) or 'OUTSIDE THE WORLD' (a sample on the span resolves to no band
    -- the two 16-column edge strips, which is exactly what the widening
    closes). Diagnose which before assuming the widening alone fixes
    reachability, and note that the dock is a hub-adjacent RECEIVER, not a
    lift stage: it needs no lift block, no span and no toBand.
```

### 7.5 Phase 10's STOP paragraph (BUILD_PLAN.md:2300-2305)

Replace:

```
STOP after writing docs/PLAN-phase10.md covering: the confirmation of Step 1
and the astral-widening fix, how the dock row interacts with rules/lift.js#reaches and
model/run.js#placementCheck's 'NO SHAFT TO SERVE' branch (run.js:286) given
astral's inset x range, ...
```

with:

```
STOP after writing docs/PLAN-phase10.md covering: the confirmation of Step 1
and the astral-widening fix, how the dock row receives cargo from a segment
carrier arriving in the astral band (model/segments.js, rules/drive.js's own
arrival handoff) and which model/segments.js#linkCheck refusal a
surface->astral link can still hit given astral's x range, ...
```

### 7.6 Phase 10 acceptance (BUILD_PLAN.md:2311)

Replace `Then build a lift chain to the astral band from a column anywhere
under the (now full-width) astral band, send plate up, ...` with `Then chain
segments to the astral band from a column anywhere under the (now full-width)
astral band, crank plate up, ...`.

### 7.7 Wave-2 ground-truth table (BUILD_PLAN.md:1281)

The row ends `The `astral` band already exists and the winch already targets
it. Nothing to reindex.` Replace the middle sentence with `The `astral` band
already exists; nothing declares it as a destination any more (see
docs/PLAN-gears-and-winches.md).`

### 7.8 Sequencing summary (BUILD_PLAN.md:2416-2428)

Insert five rows between `8b relics` and `9 overview`:

```
| 8c substance budget | 1 `systems` | after 8b | tile-capable headroom >= 10 rows; new lint seen to fail |
| 8d segment skeleton | 1 `systems` | after 8c | two hubs link, three refusals fire, nothing moves, old winch still works |
| 8e segment visuals | 1 `ui` | after 8d | a human approves the machinery; ~16 new baselines, each reviewed |
| 8f drivetrain | 1 `systems` | after 8e | crank to rise, let go to sink, a heavy rider reverses it; rules/lift.js gone |
| 8g drivetrain harness | 1 `harness` | with/after 8f | framerate-independent ride; every assertion seen to fail |
```

and amend the closing line `Phases 8, 8b and 9 all live in `src/view/` — do
not run them concurrently.` to include **8e**.

### 7.9 Phase 11

Phase 11's Tier 2 `HEAVENS LEDGER` bullet (*"Delivery with a broken lift chain
fails and says why"*) and its Tier 3 shot list entry (*"overview with a broken
lift chain"*) both survive as written — "chain" is still the right word, per
D10. No patch needed; noted so a future reader does not go looking.

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
| **Baseline churn across 8e → 8f.** Phase 8e commits static baselines; 8f makes the same scenes move. | Unavoidable given the ordering the user asked for. | 8f's acceptance requires re-accepting them **with a per-shot reason**, and 8e is told to commit once at the end rather than churn. |
| **`tools/check.mjs` throws the moment the `lift` row goes.** | `:789-815` indexes `M.lift` directly. | Named as Blocker 2, owned by 8f step 8, with the repriced assertion specified rather than left to invention. |
| **The substance budget.** Four new machine rows against a guard that allows two. | Measured in §2.5. | Phase 8c, with a fallback and a rejected third option both written down. |
| **Comments that name a deleted file.** `tools/layers.mjs` checks imports, not prose. | Ten call sites in §2.4's table. | 8f step 7 lists every one; the reviewer's job is to check the list was worked. |
| **A one-crank drivetrain feels bad.** Standing still holding a key while a bucket creeps 12 tiles is the mechanic, and it may simply not be fun. | It is a *design* risk, not an engineering one, and no test can find it. | 8f's acceptance is a physical playtest, in order, by a human — and `segUp`, `segBase` and `segLoad` are tunables precisely so the answer is a number, not a rewrite. |
| **Scope creep into generators.** The moment cranking feels tedious, "just add a generator" is the obvious fix and it is out of scope. | Human nature. | §8 states the one-predicate shape a generator would take, so the temptation is cheap to resist and cheap to satisfy later. |
