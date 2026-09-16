# Prototype spec — locked decisions

The commitments the playable build is being written against. Distinct from
`docs/DESIGN.md` (the reasoning) and `FUTURE_IDEAS.md` (the backlog). If a
number here changes, change it here first.

---

## 1. World representation

**A tile grid is the single source of truth.** No separate physics list, no
baked bitmap. Solidity, material, damage state, and what is drawn all derive
from one array.

| | value |
|---|---|
| tile size | **8 px** |
| world width | **8192 px = 1024 tiles**, fixed, independent of viewport |
| chunk size | 16x16 tiles = 128x128 px |
| storage | `Uint8Array` material id + `Uint8Array` damage, per chunk |

World coordinates are absolute and never depend on `innerWidth`. The camera
windows onto them. Resizing the window changes only the camera, never the world
— this is the single biggest departure from the mockup.

**The width is bounded on purpose.** It was 128 tiles until wave 6.3, and the
request it answers asked for unbounded horizontal extent
(`docs/PLAN-horizontal-chunks-SCOPE.md`). Bounded-but-large is what U3 chose,
because it keeps storage dense and eager and `rules/generate.js` whole-band: the
generator's three global passes — the height map, the outward step sweep and the
ore-body unseal fixpoint — have no chunk-local form, so generating in visit
order would give one seed a different world per playthrough and invariant 7
would have to weaken. Nothing here weakens it. A band carries its own dimensions
(invariant 2), which is what made the widening one number per row.

| | value |
|---|---|
| bands | 1024 x 40 `astral`, 1024 x 56 `surface`, 1024 x 320 `topsoil` |
| tiles | 425,984, spanning world x 0..8192 and world y 0..3328 |
| typed arrays | **2.70 MB** — 1.23 MB of `mat`/`seen`/`light`/`ver` and 1.47 MB of `heat` |
| allocation | 0.09 ms, all three bands |
| worldgen | **129 ms**, all three bands, inside a 160 ms `newRun()` |

Worldgen is 8.4x its cost at 128 tiles, which is the column count and nothing
else. It is paid once per run, behind the title card.

**Rendering.** Each chunk paints to its own offscreen canvas using the mockup's
painting functions (`noiseFill`, `walk`, hash-jittered edges). A dig marks its
chunk dirty and only that chunk repaints: 128x128 px instead of 8192x3328, i.e.
~1/1660th of a full bake. The look is inherited; whether it *survives* being cut
into chunks is a visual question only a human can answer.

**The chunk canvas cache is bounded, and the bound is in bytes.**
`view/paint.js#cacheLimit.bytes` is **24 MB** of backing store, and eviction is
**LRU by frame touched**: `beginFrame` drops the least recently drawn canvases
until residency is under budget, and never drops one the last frame drew.

| | value |
|---|---|
| one chunk canvas | `px * px * 4` = **64 KB** at 16x16 tiles and `tile:8` |
| the budget | **24 MB** = 384 chunks |
| the whole world, resident | **1,728 chunks = 108 MB** at 1,024 tiles wide |
| the same world at 128 tiles, before wave 6.3 | **216 chunks = 13.5 MB** |

So the cache holds about 30% of the world's chunks rather than all of them, and
`stats.evictedTotal` is non-zero in ordinary play — which it never was while the
world was narrow enough that the budget was a ceiling it could not reach. 384 is
more than eight times the 45
chunks the largest base buffer `core/canvas.js#resize` produces can cover, so a
player has to leave eight screens behind before turning round costs a re-bake.

Two properties make the policy safe, and both are asserted in
`tests/visual.spec.js`:

- **A chunk evicted and re-baked is byte-identical to one never evicted.**
  `paintChunk` is a pure function of the tile grid, the frozen substance rows
  and `hash2` of absolute tile coordinates, with no `rand()` anywhere
  (invariant 7).
- **Eviction never widens a dig.** It drops canvases; it does not touch
  invalidation. The chunk under the pick is on screen, and what the last frame
  drew is never a candidate — so the same dig under a forced 2 MB budget
  repaints the same chunks and leaves a bit-identical frame.

## 2. Player

| | value |
|---|---|
| size | 1 x 2 tiles (8 x 16 px) |
| walk speed | 60 px/s (7.5 tiles/s) |
| hop | 1 tile clearance — enough for ledges, not for escaping holes |
| gravity | 320 px/s² (matches the mockup's `GRAV`) |
| health | **5 discrete hearts**, no partials |
| death | permadeath; the run ends |

Ascent of any real depth requires **crafted ladders**. Timber from the surface,
placed as tiles, climbable at 10 px/s — a sixth of walk speed. Down is free, up
is slow and costs material.

**`climb` was 30 px/s — half walk — until wave 6, and half walk taxed
nothing.** `docs/PLAYTEST.md` finding 1 drove the 224 px climb to the Heavens
in 7.47 s at every load under the soft cap, 1.6% of cycle 2's 480 s deadline.
Half walk is a rounding error against a clock, not a price. At 10 px/s the same
climb costs 22.41 s at 0 T, 23.27 s at 10 T and 51.21 s at 38 T, all driven,
and the carrier chain in §17 can now beat it (§17.8). The legs had to be slower
than the cable for anything to invert: `segUp` is 26 px/s, so at 30 px/s no
retune of the transport side could ever have won.

`tools/check.mjs`'s two climbing BAND SEAM probes derive their substep budget
from the distance they need and `eff('climb')`. They used to spend a fixed 260
substeps each, which is exactly what 30 px/s needed for 64 px, and that literal
blocked this number for a wave.

## 3. Fall damage

Discrete hearts, derived from impact velocity. With `g = 320 px/s²`,
`v = sqrt(2 g h)`, so:

- **safe fall: 5 tiles (40 px)** → impact 160 px/s, no damage
- **1 heart per 32 px/s above 160**
- `hearts = floor((v - 160) / 32)`, clamped to 0..5

Which gives a deliberately round table:

| drop | tiles | impact | hearts |
|---|---|---|---|
| 40 px | 5 | 160 px/s | 0 |
| 64 px | 8 | 202 px/s | 1 |
| 88 px | 11 | 237 px/s | 2 |
| 112 px | 14 | 268 px/s | 3 |
| 136 px | 17 | 295 px/s | 4 |
| **160 px** | **20** | **320 px/s** | **5 — lethal** |

A 20-tile drop kills outright, as specified. The tutorial shaft is 5 tiles
deep, so the first two minutes cannot kill you. Load-based scaling and fragile
cargo are parked in `FUTURE_IDEAS.md`.

## 4. First Trial

**Deliver 10 raw copper to the altar. No clock.**

Gentle by design. The refinement quotas escalate from cycle 2 onward; cycle 1
only has to teach that the gods ask and the player answers.

**Throughput quotas are still NOT IMPLEMENTED, and a batch clause is not
one.** A cycle row may add `batch:{ sub, form, n, secs }` beside its `demand`,
which asks for `n` of that pair to *arrive* inside any window of `secs`
seconds of simulated time. That constrains how tightly deliveries are bunched
and says nothing about how fast the player produces, because a credit is
stamped when cargo reaches the receiver — a stockpile hauled up in one trip
credits in one instant. §18.10 holds the shape, the numbers and why arrivals
cannot be made to measure production. Cycle 1 carries neither a `batch` nor a
`deadlineSecs`, so it measures nothing but the answer. The furnace arrives as
the cycle-1 reward, which means minute two ends on "gods give machines" rather
than on a timer.

## 5. First two minutes — beat sheet

Each beat teaches exactly one thing. The gravity thesis lands before any
machine exists.

| t | beat | teaches |
|---|---|---|
| 0:00–0:12 | Wake chained at a cliff face. Chain snaps. Only left/right respond. | walk |
| 0:12–0:30 | Stock pickaxe planted in the soil. Stand over it and **hold `c` to collect** it — pickup is opt-in, not a magnet (or turn AUTO COLLECT on in the Character tab). A lighter soil seam sits underfoot. | dig, hold-to-break, hold-to-collect |
| 0:30–1:00 | Dig down 5 tiles. A copper vein is guaranteed directly below spawn. Mine 6 copper — **the ore falls to the bottom of your own shaft** rather than into a backpack. | the thesis: down is free, and you just used it |
| 1:00–1:20 | You are in a 5-tile hole and a 1-tile hop will not clear it. Cut a diagonal stair out, or fell the olive tree for a ladder. Ascent takes ~4x the descent. | up is expensive, felt not told |
| 1:20–1:40 | Sky darkens a notch. Clouds part, a shaft of light lands on the surface, an altar rises. **First Trial: deliver 10 raw copper.** | the gods ask |
| 1:40–2:00 | Deliver. The altar gifts a crude furnace. Place it **at the bottom of the shaft**, under the vein, and ore now falls into it for free. | gods give machines; gravity-fed production |

The trap is deliberate: a player who places the furnace on the *surface* must
haul ore up by hand. Nothing punishes them yet — cycle 1 has no clock — but
they will feel the asymmetry, and cycle 2 has a deadline.

**The altar arrives on the beat, or on a grace, whichever comes first.**
`rules/cycles.js#ensureAltarPlaced` holds it back until `run.tutorialBeat`
reaches 4, the climbed-back-up beat above, so the fifth row of the table is an
event rather than a description of furniture that was always there.

The grace is the second half, and it is not belt-and-braces. Cycle 1 has
exactly one receiver, so an altar that never arrives is a run that can never be
played — the same reason CLAUDE.md D4 leaves the one-tile auto-step ungated.
`altarGraceSecs` is therefore **80 s**, and the altar stands once `run.t`
passes it whatever the beat says. 80 s is the table's own 1:20, so a player who
never digs meets the altar at the earliest instant the sheet allows rather than
at some later time of the tunable's invention. A player who does dig has fired
beat 4 long before then and never reaches the grace at all.

`run.t` is simulated seconds at the fixed 1/120 s substep (invariant 10), never
wall-clock time, so the grace is the same length of *game* at every framerate.
`tools/check.mjs` section 7a proves both routes, and proves the grace-placed
altar can still be fed cycle 1's ten ore and pay the trial.

**And it arrives with a presentation.** The fifth row's sky, light and rise are
drawn by `view/scene.js`, over `altarRiseSecs` = **1.6 s**:

| element | what it does |
|---|---|
| sky | the whole viewport dims by up to 0.22 and releases |
| shaft | a tapering column of `ichor` from the top of the viewport down to the altar's base, brightest where it lands |
| dust | 36 motes falling down the shaft, scattered by `hash2` of the altar's own world position |
| rise | the altar climbs out of its own footprint, clipped to the band floor, and is fully up by 70% of the window |
| flare | a `glow` at the base, growing and fading with the shaft |

`rules/cycles.js` stamps `run.arrival` with the machine box's world-px
top-left and `run.t` at placement; the renderer matches that position against
the machines it is drawing, so no machine name reaches `view`. Progress is
`run.t` against `altarRiseSecs`, so the presentation lasts the same length of
game at every framerate and it **ends**. Nothing in it consumes `rand()`
(invariant 7), and it draws nothing at all while the altar is off screen.

## 6. Carried over from the mockup unchanged

- `core/` in full — palette, 5x7 bitmap font, mulberry/hash RNG, integer-pixel
  `R()` / `lineTo()` / `noiseFill()` / `walk()` / `glow()` helpers
- Integer pixels only; nearest-neighbour upscale; HUD drawn in world pixel space
- Zero dependencies, no build step
- Cross-module mutable scalars live on objects, mutated by property
- `sim/` behaviour models (rigs, carts, drops, piles, stations, lift) port once
  the item-identity layer exists
- An honest headless harness that says what it cannot verify

## 7. Explicitly not in the prototype

Procedural run generation beyond the tutorial band, monsters, fluids, heat,
boon drafting, the Hades act, meta-progression. All recorded elsewhere.

## 8. Compression ratios

`docs/DESIGN.md`'s cost-of-ascension section fixes these against raw ore, but
states them as a conceptual table rather than as recipe inputs. Locked here
as the numbers the code is actually written against, so a future tier is
added by matching this table rather than picking a fresh round number:

| tier | ratio (vs. ore) | recipe |
|---|---|---|
| ore | 1:1 | mined directly |
| ingot | 4:1 | `smelt`: 4 ore + 1 fuel -> 1 ingot |
| plate | 12:1 | `press`: 3 ingot + 1 fuel -> 1 plate |
| essence | 60:1 | not implemented |
| ambrosia | ~400:1 | not implemented |

Plate's ratio is expressed in ingot terms (3, not 12) because it is built
*from* ingots, not from ore directly — 3 x the 4:1 ingot ratio is the same
12:1 against ore. If this disagrees with `data/recipes.js`, this file is
stale; fix it here first.

**`kindle` is the one ratio that runs the other way, and it is the game's
fuel exchange rate.** 1 `timber/log` -> **2** `timber/brand`, 1.5 s,
`hand:true`, no machine. A log and a brand are each **one unit** to any
`*/#fuel` selector, so the output count is exactly what a log is worth as
fuel:

| | logs in | fuel units out | brazier/hearth seconds (1 fuel per 6.0 s) | carried light (`brandSecs` 90) |
|---|---|---|---|---|
| shipped before 6v | 1 | 3 | 18 s | 270 s |
| **locked here (6v)** | 1 | **2** | **12 s** | **180 s** |

At 3 the multiplier was accidental — it was the most `brand`'s `massK` of 0.3
allowed against a log's 1.0 without tripping the content lint's
mass-conservation check, not a number anyone set — and it priced every fuel
bill in the game at a third of a log, so burning a log directly was never
rational. At 2 a log is still worth splitting (a brand is 30% of the mass and
the only carried light there is) and 40% of the log is waste. The furnace's
own bills are unchanged; what changes is how many logs pay them.

## 9. Encumbrance, light and tool tiers

Locked with Phase 1 of `docs/BUILD_PLAN.md`. `CLAUDE.md` §"Resolved
decisions" D3/D4 is the reasoning; this is the numbers.

| tunable | value | unit | meaning |
|---|---|---|---|
| `burden` | 40 | talents | hard carry cap |
| `burdenSoft` | 0.20 | x | fraction of `burden` where climb falloff starts |
| `burdenClimbFloor` | 0.40 | x | climb-speed multiplier at the hard cap |
| `trinketSlots` | 3 | slots | length of `run.equipped` |
| `lightMax` | 15 | levels | daylight, and the ceiling any emitter can reach |
| `lightFalloffAir` | 1 | levels | lost per tile of open air the light BFS crosses |
| `lightFalloffRock` | 3 | levels | lost per tile of solid rock the light BFS crosses |
| `brandSecs` | 90 | s | one lit `timber/brand` burns this long |
| `toolTier` | 1.0 | x, scoped `substance` | bends `tile.tier` gating |
| `tossUp` | 50 | px/s | upward toss on a newly dropped item (drop verb only) |
| `tossSpread` | 12 | px/s | horizontal scatter on the same drop |

**`burdenSoft` is `riderMass / burden`, and it was 0.75 until wave 6.** The
knee is where your pockets weigh as much as your own body does — 8 T of the
40 T cap. At 0.75 it sat at 30 T while a cycle-2 tribute load is 7.2 T, so the
climb never left the flat part of the curve and `docs/PLAYTEST.md` finding 1
measured 7.47 s up a 224 px ladder at every load a player carried. Driven on a
224 px `timber/rung` ladder at the shipped `climb` of 10 px/s:

| pockets | frac | climb multiplier | 224 px | px/s |
|---|---|---|---|---|
| 0 T | 0.00 | 1.00 | 22.41 s | 10.00 |
| 7.2 T (cycle 2's whole demand) | 0.18 | 1.00 | 22.41 s | 10.00 |
| 10 T | 0.25 | 0.96 | 23.27 s | 9.62 |
| 29 T | 0.725 | 0.61 | 36.95 s | 6.06 |
| 38 T | 0.95 | 0.44 | 51.21 s | 4.37 |
| 41 T | 1.025 | — | refused | — |

The falloff is linear from 1.0 at the knee to `burdenClimbFloor` at the cap, so
it is shallow near the knee whatever the knee is — at 10 T the tax is 4%, and
cycle 2's own 7.2 T bill sits under the knee and pays nothing. A curve that
taxes a light load needs a lower floor or a convex ramp in `rules/player.js`
rather than a lower knee. The hard cap does not move. `burden` is still 40 T,
and ladder-up and hop are still refused at or over it.

New substance tiers (`tile.tier`, absent = 1): `granite` tier 2 (hard 2.4s),
`adamant` tier 3 (hard 5.0s). Monotonic against `hard` — nothing at a higher
tier is softer than something at a lower one — and `tools/content.mjs`
asserts it.

## 10. Ladders, tiered (Phase 2a)

Locked with `docs/BUILD_PLAN.md` Phase 2a. Two new forms
(`src/data/forms.js`), append-only.

| form | subTags | tile | massK | climbK | meaning |
|---|---|---|---|---|---|
| `rung` | `organic` | `solid:false, climb:true, hardK:0.20` | 0.3 | — (1) | cheap dedicated peg, so a ladder costs less than a whole log |
| `stair` | `metal` | `solid:false, climb:true` | 3.0 | 1.8 | tier-2 ladder; `climbK` multiplies `eff('climb')` in both directions |

Recipes (`src/data/recipes.js`), both `hand:true`:

| recipe | in | out | secs |
|---|---|---|---|
| `peg_rungs` | 2 `timber/log` | 4 `timber/rung` | 1.5 |
| `daedalan` | 3 `copper/plate` + 1 `timber/log` | 2 `copper/stair` | 6.0 |

`peg_rungs` reads **2** logs, not the 1 the phase's own prose named, and is
declared **before** `kindle` in `RECIPES` (previously kindle came first) —
both are load-bearing, not cosmetic. `rules/crafting.js#choose` picks the
first `HAND_RECIPES` row whose inputs are fully satisfied; `kindle` and a
1-log `peg_rungs` would have an IDENTICAL trigger, so whichever is declared
first would win forever and the other would be permanently unreachable by
hand. Requiring 2 logs and checking `peg_rungs` first breaks the tie: holding
exactly 1 log fails `peg_rungs`'s stronger requirement and falls through to
`kindle`; holding 2 or more satisfies `peg_rungs` first. `massK:0.3` (not the
phase's original ~0.35) keeps `tools/content.mjs`'s mass-conservation check
passing at the 1-log quantity; at 2 logs there was room to spare, but 0.3 was
kept for consistency with `brand`'s own massK and its identical "split
lighter, with real waste" shape.

**`daedalan` reads 3 plate and 1 log, not the 2 plate and 4 logs it shipped
with, and the change is a reachability fix (Phase 6v).** `peg_rungs` (2 logs)
and `kindle` (1 log) are both strict subsets of a four-log bill, so every
pockets state that could afford a stair could also afford rungs or a brand and
`rules/crafting.js#choose` handed out the cheaper timber row at every
inventory — driven and confirmed in `docs/PLAYTEST.md` finding 4, and
allowlisted by name in the content lint until this phase. One log is under
`peg_rungs`'s two, which breaks the containment in the one direction that
matters, so the stair is now craftable from exactly its own bill. Mass is
unchanged: 3 x 2.4 plate + 1 x 0.8 log = 8.0 consumed against 6.0 produced,
which is the same 8.0 `forms.js#stair`'s `massK:3.0` headroom was derived
against. The trade is 12 more ore for 3 fewer logs, which is the direction
`data/cycles.js`'s header asks for — escalation in refinement, not volume —
and timber is the scarcer material by a wide margin (`docs/PLAYTEST.md`
finding 5).

Encumbrance (D3/D4) gates ASCENT only: on a ladder, descending is always
`eff('climb') x climbK`, at any burden. Ascending is that same speed, scaled
by burden fraction (1.0 up to `burdenSoft`, linear down to
`burdenClimbFloor` at the hard cap), refused outright at/over the hard cap
(`rules/player.js`) — the same refusal covers a ground/ladder hop. **Boarding
a carrier is the one exception and is never refused at any weight** (`CLAUDE.md`
D4 as amended, §17.10): an over-cap rider is real load on the segment, so it
slows, stalls and runs backwards under them instead. A pickup that would cross
the hard cap is refused and the item stays on the ground (`rules/items.js`).
A new drop verb (`Q`, `rules/items.js#dropHeaviest`) spends exactly one unit
of the heaviest held pair, tossed with `eff('tossUp')`/`eff('tossSpread')` —
the prerequisite for the lockout not being a soft-lock.

## 11. Light and darkness (Phase 2b)

Two separate per-tile facts, both in `src/model/world.js`: `b.seen` is
permanent memory (unchanged this phase); `b.light` is a current condition,
0..`eff('lightMax')`, recomputed by `src/rules/light.js` and read by the
darkness pass in `src/view/scene.js` and by fog of war's own bounded flood
(`src/rules/reveal.js#passB`), which may no longer enqueue a tile past its
first ring unless `lightAt() >= 1`.

| tunable | value | unit | meaning |
|---|---|---|---|
| `lightMax` | 15 | levels | daylight, and the ceiling any emitter can reach (Phase 1 row) |
| `lightFalloffAir` | 1 | levels | lost per tile of open air the light BFS crosses (Phase 1 row) |
| `lightFalloffRock` | 3 | levels | lost per tile of solid rock the light BFS crosses (Phase 1 row) |
| `brandSecs` | 90 | s | one lit `timber/brand` burns this long (Phase 1 row) |
| `brandLevel` | 9 | levels | light level while a `timber/brand` is lit (new, Phase 2b — see `docs/FINDINGS.md`) |

New machine rows (`src/data/machines.js`), both using the new `light:{level,
whileRunning}` interpreter key:

| machine | footprint | cost | light | notes |
|---|---|---|---|---|
| `brazier` | 1x1 | 4 `timber/log` + 2 `stone/gravel` | level 12, `whileRunning:true` | honest-fuel recipe (`out:[]`, banks a charge), the same shape the belt uses; lit for as long as the buffer holds fuel |
| `hearth` | 2x2 | 2 `copper/plate` (**provisional** — design wants this in the essence tier, which does not exist yet; reprice when it lands) | level `'max'` (tracks `eff('lightMax')`) | no fuel, never expires; an `in:{}, secs:Infinity` recipe keeps `m.running` true purely so the existing fire-glow look renders, no interpreter change |

Both are in `STARTING_MACHINES` (`src/data/machines.js`... `src/data/grants.js`)
for testability, same precedent as `press`/`belt_r`/`belt_l` — no director
exists yet to gate them behind a boon.

The starting kit (`src/shell/boot.js`) plants no `timber/brand` — only the
stock pickaxe. `run.brandLeft` (`RUN_SCHEMA` field, `src/model/run.js`)
auto-relights from the pockets the instant it reaches zero, with no separate
"light your torch" verb, for any `timber/brand` acquired through play
(`data/recipes.js#kindle`).

**Schedule reorder.** The live step order was `player -> reveal -> mining ->
...` (not `player -> mining -> reveal -> ...` as `docs/BUILD_PLAN.md`
originally assumed — corrected after Phase 0's audit). It is now
`player -> mining -> light -> reveal -> items -> ...`: a tile broken this
frame can open a light path this frame (`mining before light`), and fog of
war's flood must read this frame's light field, not last frame's
(`light before reveal`). `reveal` no longer sits immediately after `player`.

**Darkness rendering.** `src/view/scene.js#drawDarkness` quantises `b.light`
into three fixed alpha steps over the tile's own already-painted colour
(0.94 / 0.55 / 0.22 for levels 0-4 / 5-9 / 10-14; no overlay at `lightMax`),
row-run coalesced like `drawFog`, drawn after terrain/fields and before fog.
A seen-but-dark tile therefore stays visibly distinct from both a fully-lit
tile and an unseen (fog) one, and an ore vein is visually swamped by the
darkest step well before its glint treatment could read as ore.

### 11.1 Daylight, band seams and the world sky

**A band's row 0 is not sky.** Daylight is seeded only into a band that
carries sky of its own, which `src/model/world.js#hasOwnSky` reads off
`data/world.js#floorTy` — the same ground line `view/scene.js` and
`view/paint.js` already divide sky from excavated rock by. `astral` declares
30 rows of sky and `surface` declares 20; `topsoil` declares 0, because its
row 0 is buried under 28 rows of surface rock.

| band | `floorTy` | own sky | row 0 at boot |
|---|---|---|---|
| `astral` | 30 | yes | `lightMax` (15) |
| `surface` | 20 | yes | `lightMax` (15) |
| `topsoil` | 0 | no | 0 |

**Content states a band's sky, not occlusion.** The astral floor slab is solid
across every column and sits 19 tiles over the surface band's own sky, so a
pure "is anything solid above it in the world" test darkens the spawn band
whole. `hasOwnSky` is the statement that the surface has a sky; occlusion
decides everything under it.

**The seam carry.** A band with no sky of its own takes row 0 from the band
above: the level that band finished at one world row up, minus the ordinary
`relax` cost of entering this tile (`lightFalloffAir` through air,
`lightFalloffRock` through rock). So a shaft dug through the seam carries
daylight down — surface 15 becomes topsoil 14, 13, 12 down the shaft — and
solid rock over the seam carries nothing. Where no band lies above a column,
the world really is open there and the column seeds at `lightMax`.

The carry runs **downward only**. `src/rules/light.js#step` walks `bands` in
top-down declaration order and relights a band whenever the band above relit,
so one pass settles it; the upward direction would need the flood iterated to
a fixed point across bands and is not implemented (`docs/FINDINGS.md`).

**Fog of war asks the same question.** `src/rules/reveal.js`'s Pass A gates on
`src/model/tiles.js#worldSkyAt`, which walks up across seams and stops at the
top of a band that carries sky, rather than on the band-local `skyExposedAt`.
A shaft dug 38 tiles down `topsoil` therefore does not read as sky-exposed.
Pass B seeds over **every band the hitbox overlaps** (`model/world.js#bandSpans`),
so a player straddling a seam has their own tiles revealed on both sides.

`tools/check.mjs` section 8o holds all four facts.

### 11.2 How far one seed reaches, and what the recompute allocates

`relax` charges at least `min(lightFalloffAir, lightFalloffRock)` per hop and
drops a tile below level 1 rather than seeding it, so **a seed at `lightMax`
dies after `(lightMax - 1) / min(air, rock)` hops — 14 tiles at 15/1/3.** That
number is derived, not tuned, and it is what bounds the recompute: the scratch
field `rules/light.js#recompute` allocates is the seeds' bounding box grown by
14 tiles and clamped to the band, not the band. A tile outside that box is
further than 14 hops from every seed, so it can be neither lit nor a live relay,
and the window is therefore bit-identical to the whole band rather than an
approximation of it.

What that buys at 1,024 columns: a `topsoil` recompute with no shaft to the
surface and no lit machine has no seeds, allocates nothing and floods nothing.
A band with sky of its own seeds every column, so its window is the full width
and only its rows narrow. Medians over three runs of the same probe, one band
dirtied at a time, `rules/light.js#step` end to end:

| dirtied band | before | after |
|---|---|---|
| `topsoil` | 0.45 ms, 320 KB | **0.02 ms, nothing** |
| `surface` (and `topsoil` carried) | 1.98 ms | **1.80 ms** |
| `astral` (and both below carried) | 4.40 ms | **4.68 ms** |

`astral` pays 7% for the second seed enumeration the bounding box needs, on a
band whose window was already the whole of it. A recompute is not a per-frame
cost — it fires when a tile changes or an emitter turns over — so the trade is
worth it for the band a digging player actually dirties. A clean frame is
0.0024 ms whatever the width, because `isDirty` answers first.

## 12. Mining tiers and the automated line (Phase 2c)

Locked with `docs/BUILD_PLAN.md` Phase 2c. A GATE on top of hardness, not a
second hardness: `tile.tier` (Phase 1) decides whether a swing is legal at
all; `hard` (unchanged) decides how long a legal one takes.

Tools are relic substances (`item.tool:{tier, power}`), not a new table:

| tool | tier | power | how |
|---|---|---|---|
| `pick` (STOCK PICKAXE) | 1 | 1.0 | starting kit, unchanged behaviour |
| `auger` (ADAMANT AUGER) | 2 | 1.8 | crafted: `data/recipes.js#auger`, 2 `copper/plate` + 1 `timber/log`, 8.0s, hand:true |

`model/run.js#bestTool()` returns the highest-tier tool relic held;
`hasPick()` is now `bestTool() !== null`, a strict generalisation (true under
the identical condition a fresh run starts in). The gate in
`rules/mining.js#step`: a tile refuses with journal reason `'TOO HARD FOR
THIS PICK'`, rate-limited to once per 1.0s, if `tile.tier > tool.tier x
eff('toolTier', <substance>)`. The tool's `power` multiplies
`eff('pickPower')` in that same one place `hard` is already applied.

Placed miners (`mine:{facing, tier, tiles, secs}`, new interpreter key,
`rules/machines.js`):

| machine | footprint | cost | tier | tiles | secs (fuel drain) | minDepth |
|---|---|---|---|---|---|---|
| `talos_head` (+ `_l` mirror) | 1x1 | 8 `copper/plate` + 2 `copper/ingot` | 2 | 1 | 12.0 | — |
| `cyclops_maw` (+ `_l` mirror) | 1x3 | 16 `copper/plate` + 6 `copper/ingot` + 6 `granite/gravel` | 3 | 3 | 3.0 | 200 tiles |

`facing` is `1`/`-1`, `belt.dir`'s own convention; the `_l` rows are the
identical near-free mirrored variant `belt_l` already is. `secs` is how many
seconds of ACTIVE CHEWING one buffered fuel unit lasts — a continuous drain
with time, unrelated to any one tile's hardness — not a per-tile cost; the
Maw's shorter `secs` is the tier list's "high fuel draw", a thirstier
machine, not a faster one. `tiles` is a face height, chewed one tile at a
time (topmost unbroken first), so a taller face is reach, not simultaneity.

**The rate is not a row on either machine.** `rules/machines.js#mine` reads
`eff('pickPower') x bestHandToolPower()`, where `bestHandToolPower()` scans
every substance's `item.tool.power` and returns the largest — the SAME two
numbers, read off the SAME data, that a swinging player's `rules/mining.js`
uses. Verified via the test hook: a hand-swung auger and a fuelled Talos Head
each broke an identical `granite` tile in exactly 1.3417s at a fixed 1/120s
step — 0.0000s difference, not merely "close". A Cyclops Maw chews at the
identical rate; its only advantages over a Talos Head are reaching
`tile.tier:3` (adamant, which NEITHER hand tool can bite) and a 3-tall face.

`minDepth:200` (`cyclops_maw`) is checked in `rules/placement.js` against the
SAME datum `view/hud.js`'s depth gauge already reads (`worldY` of the spawn
band's own `floorTy`), so "the HUD says 25m" and "a machine may place here"
can never disagree about what depth means. `data/world.js`'s adamant blobs
start at topsoil row 220 (depth ~256 against that datum); 200 leaves room to
place the Maw on the approach, not only once standing in the vein.

**Cost.** `cyclops_maw`'s bill is deliberately priced in granite-tier goods a
T2 auger CAN reach, not adamant: a machine that could only be built from the
one material it alone can mine would have no way to ever get built.

**Recipe-ordering collision, same shape as `peg_rungs`/`kindle` (Phase 2a),
and the auger was the recipe it killed (fixed in Phase 6v).**
`data/recipes.js#auger` and `#daedalan` share identical input KEYS
(`copper/plate`, `timber/log`) at the same log count and different plate
counts (2 vs 3). `daedalan` is declared first (the stronger requirement), so
holding 3+ plate and a log yields a stair and holding 2 falls through to the
auger. What made the auger unobtainable in **every** run was neither of those
two rows but `kindle` (1 log), declared above both: a strict subset of the
auger's bill, so any pockets that could pay for an auger produced brands
instead. `kindle` is now declared last of the log rows, the weakest bill
tried last, exactly as `hearth` sits after every plate row. The content lint
(`tools/content.mjs` assertion 23) proves every one of the 19 hand recipes is
craftable at its own minimal bill, with no allowlist.

**Engine cost, stated per ARCHITECTURE §3.** Two new interpreter keys:
`mine` (`rules/machines.js`) and `minDepth` (`rules/placement.js`). No
machine name appears in `rules/machines.js`; no machine or substance name
appears in `src/view/`.

Tile-byte headroom: adding the `auger` relic substance is the 10th
substance row, dropping headroom from 14 to 13 substances still allowed
before the tile-id byte overflows (`src/data/forms.js`'s guard).

## 13. Buildable machine costs (Phase 3)

**SUPERSEDED by section 15.** This section is kept as the historical record
of Phase 3's own reasoning (the numbers below are unchanged, and still exactly
what section 15's held items cost to build) — but "cost at placement" itself
is gone, reversed on direct post-launch feedback. See section 15 for the
current mechanic: a machine is now a held `<id>/rig` item, crafted like any
other recipe and spent at placement, not a bill charged there.

Locked with `docs/BUILD_PLAN.md` Phase 3: `furnace` and the (since-retired)
`lift` were free and
`F`/`L` spawned either from nothing. Both are now priced in talents against
the 40 T `burden` cap (section 9), so the haul itself is the decision the
design wants, and neither key places anything unconditionally any more.

**The deviation from the original plan, restated in one place.** The plan
asked for a `furnace` ITEM the player carries and places. In this codebase a
held thing is substance x form (`ARCHITECTURE.md` section 2, rule 2) and a
furnace has no element of its own — making it one would cost a substance row
per machine, exactly what `data/substances.js`'s own header forbids. **Cost
at placement** is the substitute: the bill IS the commitment, and because
Phase 2a made mass a hard cap, a 20-talent haul is a trip a player has to plan
a route for, which is the same weight the item-carry design wanted without a
machine-item form.

| machine | footprint | cost | mass | notes |
|---|---|---|---|---|
| `furnace` | 3x2 | 12 `copper/ore` + 6 `timber/log` | 16.8 T | raw, unrefined material — exactly what the first two minutes (section 5) already teach a player to dig |
| ~~`lift` (winch stage)~~ | ~~2x3~~ | ~~6 `copper/plate` + 4 `timber/log` + 2 `copper/ingot`~~ | ~~20.8 T~~ | **SUPERSEDED by section 17.** The staged winch was retired in Phase 8f — row, substance, recipe, grant, tunables and rules module all deleted. Its replacement is a pair of `hub` machines at 10.4 T each: exactly the same 20.8 T and the same 20.0 s, spent on two endpoints instead of one stage (§17.3) |
| `press` | 2x2 | 4 `copper/plate` + 2 `copper/ingot` | 12.8 T | no longer the one free-provisional row `data/grants.js#STARTING_MACHINES`'s own comment named; a player may still hand-press (`data/recipes.js#press`, `hand:true`) toward this bill without owning one |
| `belt_r` / `belt_l` | 4x1 | 2 `copper/plate` + 4 `stone/gravel` | unchanged (priced since the belts commit) | — |

Mass is `Σ substance.item.mass x form.massK x n` — the identical arithmetic
`model/items.js#massOfPair` already uses for the pockets and the burden gauge,
so "the HUD says 16.8 T" and "this is what the furnace bill weighs" can never
disagree.

**`placementCheck(band, machineId, tx, ty)`** (`src/model/run.js`) is the
single decision every reader of a placement's legality now calls: footprint
clear, footing satisfied, granted, depth allowed (`minDepth`), ~~a lift's own
`lift.span` actually reaching `lift.toBand` from the exact footprint proposed
(new this phase — see below)~~ **[deleted in Phase 8f — see §17.6]**, and
affordability LAST, in that order — the
same order `rules/placement.js#placeMachine` always checked in, now read from
one place instead of copied into it. `rules/placement.js#placeMachine` calls
it and turns a refusal into a journal row; `view/hud.js`'s new build-menu
ghost (hover a BUILD row with the panel open) calls the identical query to
tint a footprint preview at the aim reticle and print the same one-word
reason beside it — `view` may not import `rules`, so this is the same move
`canAfford`'s own greyed-out BUILD row already made, generalised.

**The winch shaft check — SUPERSEDED by section 17.6, and DELETED in Phase
8f.** Kept here as the record of what it was and why it went, in the same style
§13 already uses for its own superseded material.

*What it was:* a stage whose `lift.span` did not reach `lift.toBand` from where
it was about to stand would place, run, and never once deliver a haul, so
`placementCheck` refused it with `'NO SHAFT TO SERVE'` before it cost a talent
— duplicating, across the layer boundary, the arithmetic the winch's own
`reaches()` applied to an already-placed stage.

*Why it went:* the check existed because a lone machine DECLARED a destination
it might not reach. A `hub` declares nothing at all. Whether transport can
serve anything is a property of a **segment** — two hubs and the space between
them — and that decision now lives in `model/segments.js#linkCheck`, which
answers reach (`'TOO FAR APART'`), obstruction (`'THE PATH IS BLOCKED'`) and
band coverage (`'OUTSIDE THE WORLD'`) about a real pair rather than a guess
about one machine. There is nothing left to declare, and therefore nothing
duplicated across a boundary to keep in sync. The `HARD_BREAK`-style mirror
this paragraph used to justify is simply gone.

**Deconstruct** (`rules/placement.js#deconstruct`, new intent on `Backspace`,
`shell/input.js`/`shell/main.js`) returns a machine's FULL cost, as falling
items (invariant 5 — never a direct pocket credit), the moment it is proven
to hold nothing: `m.buf` has no keys and `m.charges` is 0. A machine still
holding buffered material or a banked fuel charge refuses, with a reason, so
the bill can never quietly outlive the ore that was sitting inside it.

**`F`/`L`.** Removed as unconditional spawns; a debug-keymap census had
already confirmed neither was the SOLE way to place its machine (the build
menu's digit `1`/`2` already reached the identical `buildableMachines()`
list, itself since retired along with the whole digit-driven BUILD menu and
`flags.showInv` — see `docs/FINDINGS.md`; placement now has exactly one path,
`cmd.place`, whether the pair is a tile or a machine). Kept as a development
shortcut behind `flags.showDebug` (`H`), a no-op with the gate off.

## 14. God gifts: the four modifier tiers (Phase 4)

Locked with `docs/BUILD_PLAN.md` Phase 4 and `CLAUDE.md` "Resolved
decisions" D1. `data/boons.js#BOONS` (renamed from the machine-grant tier,
which moved to `data/grants.js#GRANTS`) is the TIMED tier; every number below
is content on that table, read through `model/mods.js#eff()` like everything
else that bends a number — no new tunable was needed this phase.

| boon | god | secs | mods | conflictsWith |
|---|---|---|---|---|
| `hephaestus-forge` | hephaestus | 60 | `rate.furnace` x1.5 | — |
| `poseidon-flood` | poseidon | 60 | `hard` (unscoped, every substance) x0.85 | suppresses `hephaestus-forge` |
| `athena-focus` | athena | 50 | `pickPower` x1.25 | — |
| `ares-frenzy` (`trap:true`) | ares | 40 | `pickPower` +0.2 | inverts `athena-focus` |
| `hades-passage` | hades | 20 | `climb` x1.3 | — (miracle side-effect only) |

**The canonical hostile pair, `docs/DESIGN.md`'s own example.** Poseidon's
flood softens every rock (helps mining) but douses a forge already lit:
granting `poseidon-flood` while `hephaestus-forge` is active SUPPRESSES the
older gift entirely (`eff('rate','furnace')` reads exactly base, 1.0) for as
long as both would be active, while the flood's own `hard` reduction still
applies. Letting the flood expire hands the forge boost back with no code
anywhere remembering it was ever overridden — `rules/boons.js#step`
recomputes the whole active list from scratch every fixed 1/120 s step.

**The INVERT pair, and the one shipped trap.** `ares-frenzy` reads as a flat
`pickPower` +0.2 buff. If `athena-focus` (x1.25) is already running, the
frenzy inverts her multiplier to x0.8 for as long as it lasts. Per the fixed
order of application (`model/mods.js`: `(base + Σadd) x Πmul`), holding both
at once gives `(1 + 0.2) x 0.8 = 0.96` — WORSE than the unmodified base of
1.0. A gift offered on a bad cycle can cost you more than refusing it would
have; `docs/DESIGN.md`: "some gifts are traps."

**Trinkets.** `data/trinkets.js`, three rows, all reaching numbers through
the same `mods` shape:

| trinket | god | mods |
|---|---|---|
| `bellows` ("BELLOWS OF THE FORGE") | hephaestus | `rate.furnace` x1.25 |
| `owl` ("OWL OF ATHENA") | athena | `sightRadius` x1.5 (14 → 21 tiles) |
| `girdle` ("GIRDLE OF ARES") | ares | `burden` x1.25 **and** `climb` x0.8 |

**The girdle is the ascent trade, priced to exactly break even.** `burden`
and `climb` are two of the three tunables D4 names as the whole player-scale
expression of "down is free, up is expensive", so bending them is allowed
only as a trade that is stated. `1.25 x 0.8 = 1.0`: 50 T at 24 px/s delivers
the identical talents-per-second up a shaft as the base 40 T at 30 px/s. What
it buys is FEWER TRIPS and less walking between them; what it costs is a
slower climb, longer exposure on the ladder and a bigger load to lose in one
fall. Ascent is not cheaper, it is lumpier.

**Miracles.** `data/miracles.js`, three rows. Each is a held
`<id>/phial` pair (substance tagged `miracle`, crossed with Phase 1's
`phial` form), spends exactly one unit on use, and is applied at the AIM
reticle — a miracle that edits nothing still cannot be used while aiming at
open sky, the same rule every other aimed verb obeys.

| miracle | god | effect |
|---|---|---|
| `chasm` ("RIFT OF HADES") | hades | `collapse` r1 — the 3x3 around the reticle to AIR (`model/tiles.js#write.clear`); grants `hades-passage` |
| `tide` ("VIAL OF THE DEEP") | poseidon | no tile edit at all; grants `poseidon-flood` |
| `lodestone` ("LODESTONE OF THE FORGE") | hephaestus | `transmute` r1 to `copper` — every ALREADY-SOLID tile in the 3x3 becomes native copper (`model/tiles.js#write.set`) |

`effect.kind` is a closed set (`collapse`, `transmute`) that
`tools/content.mjs` assertion 26 holds; a row with no `kind` at all is the
pure-boon phial, which needed no engine code because `applyEffect` grants
`effect.boon` independently of `effect.kind`. `transmute` only ever
overwrites a tile that is already solid, so it can neither entomb the player
nor conjure a step under their feet.

**What `lodestone` is actually worth, stated rather than softened.** It
CREATES ORE. `copper.tile.charge` is 4, so a radius-1 transmute turns up to
9 tiles of ordinary soil or stone into **36 raw copper**, at any depth,
including 0 M — 3.6x cycle 1's entire demand, out of rock that was worth
nothing. The player still has to mine it (36 x 0.95 s ≈ 34 s of held
swings), but the ore did not exist before the phial was used, and
`data/recipes.js#pack` closes the loop the other way: 5 mining spoil become
one `block`, which is `solid:true`, which `transmute` will convert. Spoil →
copper is therefore a real conversion, bounded by phials held and not by
material.

That is the intended shape of a ONE-SHOT god gift — the largest single
material windfall in the game, spent in one press, with the swings still to
pay — and `effect.radius` is the one number that prices it. It is recorded
here in full rather than described as "walking saved", which is what this
section said first and is not true of a row that manufactures the ore.

**`effect.sub` must name PACKABLE terrain, and `tools/content.mjs` assertion
26 enforces it.** `transmute` is a third caller of `data/forms.js#packTile`,
alongside worldgen and `rules/placement.js#placeTile`, and is constrained by
neither of their gates. A row with no `sub` packs to `NaN`, which a
`Uint8Array` stores as 0 — AIR — so the miracle would clear the rock it
claims to convert; a row naming a `relic`, `miracle` or `machine` substance
overflows 255 and wraps into an unrelated substance x form pair (ordinal 26
packs to 365, truncating to 109: a granite `stair`, climbable, placed by
nobody). Both shapes place, paint and collide perfectly well, which is why
the guard is a build failure and not a comment.

**Machine grants.** `data/grants.js`, **two** rows, and two is deliberate:

| grant | god | grants |
|---|---|---|
| `gift-talos` ("THE HEAD OF TALOS") | hephaestus | `talos_head` (+ its mirror) |
| `gift-maw` ("THE CYCLOPS MAW") | poseidon | `cyclops_maw` (+ its mirror) |

`gift-kiln` — the tier's only row until now — is RETIRED. It granted
`kiln_divine`, which has no substance row (§15) and therefore cannot be
placed at any depth by any player, so the whole machine-grant tier had never
once done anything. The `kiln_divine` MACHINE row stays, as the live worked
example for `variantOf` and for scoped tuning (`rate.kiln_divine`), and is
one of the two names exempted from `tools/content.mjs` assertion 25's
sponsorship half — the other being `altar`, which the player must never
obtain. Nothing is exempt from that assertion's second half: whatever grants
a machine, that machine must be placeable, which is what would go red if
`gift-kiln` were ever restored.

A third grant would need a third machine that does not exist yet, and
padding the tier to three is not a reason to invent one.

**A grant unlocks the BUILD, not only the placement.**
`model/run.js#isKnown` gates a machine-build recipe on `canPlace`, so
`talos_head` and `cyclops_maw` draw as locked silhouettes in the CRAFTING
tab until their grant is taken. **A mirrored pair is one gift**:
`rules/grants.js` grants `<id>` and `mirrorOf(<id>)` together, because
`placementCheck` is asked about the concrete id `machineIdFor` resolves off
`player.face`, so granting only the base would refuse every left-facing
placement.

**Gods.** `data/gods.js` is one row per god id the content tables use —
`hephaestus`, `athena`, `poseidon`, `ares`, `hades` — with the display name.
Before it, `ares` and `hades` could be asked for and could never be named:
`view/hud.js`'s `GOD_NAME` covered three of the five.

**Trinket equip slots.** `run.equipped`, length `eff('trinketSlots')` (3,
Phase 1), a fixed-length array of substance ordinals or `null`. A trinket's
modifier is active only while its id is BOTH equipped AND held —
`rules/trinkets.js#step` clears a slot whose id the pockets no longer hold in
the same pass it syncs `model/mods.js`, so the two can never disagree.

**Trinket sources.** The unconditional `T` debug spawn is gone (behind
`flags.showDebug` only, alongside the other three tiers' debug grants). Real
sources this phase: a 3% chance per broken tile at `tile.tier >= 2` (granite,
adamant) named in `data/drops.js` and rolled in `rules/mining.js`'s rare-drop
hook, through `rand()` only (invariant 7). The second row,
`tribute-bellows`, is live: `rules/cycles.js#rollTributeDrop` rolls it on
every completion and skips it once a copy is held, so in practice the first
trial that pays hands over the bellows.

**`tribute-bellows` stays `chance:1`, decided rather than inherited.** It was
a certainty over a ONE-ROW trinket table, which is what emptied cycle 4's
trinket draft — the guaranteed drop had already taken the only row there was.
With three rows the draft has two left to offer, so the reason to make it a
dice roll has gone, and the reason to keep it is the beat sheet: the first
trial that pays is where the player learns this tier exists, and a tier
introduced by a coin flip is a tier half the runs never meet. The 3% mining
roll is the RARE source; this is the TAUGHT one, and they are deliberately
not the same kind of event.

## 15. Machine items (design reversal, post-launch)

**This section supersedes section 13's "cost at placement" mechanic**, on
direct user feedback after playing the shipped game: crafting and
machine-building are unified into ONE list, and a built machine is "a thing
like wood or stone that lives in a pocket slot, but heavier." Section 13's
own reasoning for rejecting a machine-item — "a furnace is not an element,
one substance row per machine is exactly what `data/substances.js`'s header
forbids" — proved too conservative: `data/substances.js#bellows` (a
trinket) and `#chasm` (a miracle) are ALREADY one substance per thing,
justified by the identical "this refines from nothing, it IS the element"
argument, crossed with a shared form (`relic`, `phial`). A machine is
fabricated, not compressed from ore, and unique in itself — the same
category.

**The mechanism.** `data/forms.js#rig` is the new shared form every machine
substance takes (`subTags:['machine']`, `massK:1.0` so a machine substance's
`item.mass` IS the held item's mass directly). One substance row per machine
in `data/substances.js`, id reusing the machine's own id from
`data/machines.js` — the same 1:1 naming precedent `bellows` already sets.
One `hand:true` recipe per machine in `data/recipes.js`, spending EXACTLY
the bill `data/machines.js` used to charge at placement (unchanged from
section 13's own table) and producing one `<id>/rig`. `data/machines.js`'s
`cost` key is deleted — the recipe is the single source of what a machine
costs, not a second copy of the same numbers.

| machine | held substance | recipe secs | item mass |
|---|---|---|---|
| `furnace` | `furnace` | 8.0 | 16.8 T |
| ~~`lift`~~ | ~~`lift`~~ | ~~20.0~~ | ~~20.8 T~~ — **SUPERSEDED by §17.3** (retired in Phase 8f; `hub` x2 is the same 20.0 s and the same 20.8 T) |
| `press` | `press` (recipe key `press_machine`, distinct from the ingot->plate `press` recipe) | 12.0 | 12.8 T |
| `belt_r` / `belt_l` | `belt_r` (ONE shared substance — see below) | 10.0 | 6.0 T |
| `brazier` | `brazier` | 5.0 | 3.8 T |
| `hearth` | `hearth` | 4.0 | 4.8 T |
| `talos_head` / `talos_head_l` | `talos_head` (ONE shared substance) | 16.0 | 22.4 T |
| `cyclops_maw` / `cyclops_maw_l` | `cyclops_maw` (ONE shared substance) | 24.0 | 50.7 T |

Mass is `Σ substance.item.mass x form.massK x n` over the FORMER cost bill
— the identical `model/items.js#massOfPair` arithmetic, so a recipe can never
manufacture more mass than it consumes (the content lint's own conservation
check). `kiln_divine` has NO substance or recipe: its cost bill is
BIT-IDENTICAL to `furnace`'s, and two hand-recipes with an identical trigger
would starve one of them forever under `rules/crafting.js#choose`'s
first-match rule — the exact tie class `daedalan`/`auger`'s differing plate
counts exist specifically to avoid, with no quantity left to differentiate
here since retuning would invent a number Phase 3 never set. It is therefore
placeable by nobody, at any depth, and its grant row has been retired rather
than left pretending otherwise (§14); the machine row stays as the worked
example for `variantOf` and scoped tuning.

**Mirrored pairs share one substance.** `belt_r`/`belt_l`,
`talos_head`/`talos_head_l` and `cyclops_maw`/`cyclops_maw_l` are each one
`variantOf` row differing only in a `belt.dir`/`mine.facing` flip — giving
each its own substance would need a SECOND hand-recipe with a bit-identical
bill (the same unbreakable tie `kiln_divine` hits) — and, on the guard as it
was written then, would also have overflowed the tile-byte budget, though that
half of the argument no longer holds (see below). The recipe tie is the reason
that stands. Instead, `model/run.js#machineIdFor`
resolves ONE held substance to a concrete machine id off `player.face`
(+-1) at the moment of placement — the SAME direction convention
`belt.dir`/`mine.facing` already carry, reused rather than reinvented. A
held belt places facing wherever the player is currently walking/facing.

**Placement.** `model/run.js#placementCheck`'s cost gate is now
`invCount(machineHeldSub(machineId), F.rig) >= 1` instead of `canAfford(def.
cost)` — same position in the check order (last), same refusal shape, new
reason string (`'NOTHING BUILT YET'`). `rules/placement.js#placeMachine`
spends exactly 1 unit of that pair after every other check passes (same
"spent after placement is guaranteed" ordering); `#deconstruct` refunds
exactly 1 unit of the SAME pair instead of the old material bill — picking
up and relocating a machine is now "mine it back out as the same item you
built," not "get raw materials back."

**Placing from the pockets.** `rules/placement.js#placeableFromPockets`
recognizes a held `rig`-form pair as placeable, alongside the tile-capable
forms it already did; `shell/main.js#applyIntents`'s `cmd.place` branch
(`E`) dispatches to `placeMachine` (via `machineIdFor`) or `placeTile`
depending on which kind the first placeable pocket pair is. The `f`/`l`
debug keys and `wants.machine`'s digit-driven direct-placement path
(`shell/input.js`'s 1-9 block, the LOGISTICS tab's BUILD-row clicks) are
superseded by this — placing is placing, one verb, whatever is held — but
were left mechanically in place rather than ripped out: since cost
enforcement moved entirely into `placementCheck`, EVERY caller of
`placeMachine` (old or new) already requires holding the item, so the old
paths are harmless, not free. Wiring a "place from pockets" click-to-arm UI
and locking the Crafting tab's silhouettes on the grant tier are a follow-up
task's job, not this reversal's.

**~~Placeable rubble.~~** ~~`data/forms.js#gravel` gained a `tile` block
(`solid:true, climb:false, hardK:0.5`) so mined rubble (`stone/gravel`,
`soil/gravel`, `granite/gravel`, `adamant/gravel`) can be shovelled back into
a dug-out hole through the same `placeTile` path `log`/`rung`/`stair` use —
loose backfill, easier to dig back out than any native rock it came from.~~
— **SUPERSEDED by §19** (Phase 14a). `gravel` lost that `tile` block, and so
did `log`: a form may not be both feedstock and buildable (CLAUDE.md D12).
Backfill is now `data/forms.js#block` at 5 rubble per tile, recovered at
native hardness, and a timber ladder is `rung` via `peg_rungs`.

**Tile-byte headroom.** Adding one form (`rig`, `data/forms.js`'s 11th) makes
`STRIDE` 12, so a substance at ordinal `n` in form `f` packs to
`1 + n * 12 + (f + 1)`, and `BEDROCK` (255) is the ceiling. **Phase 14a added
a twelfth form (`block`) and Phase 15 a thirteenth (`seed`), so the live
figures are `STRIDE` 14 and `1 + n * 14 + (f + 1)`;** the shape of the
arithmetic is unchanged.

A new FORM does cost every substance one byte of stride, and that reads as if
a form were the expensive thing. **It is the cheap one.** Measured against the
real modules at the thirteen forms shipped today: the guard's own figure is
`1 + 8 * 14 + 13 = 126` of 255, and `PACKABLE_LIMIT` is 17. Two more forms
would take it to 144 and 14. A form is affordable; a tile-capable substance is
not appendable at all — see the correction below.

**A naive guard, measuring from `SUB.length - 1`, prices *every* row as if it
were tile-capable** and reads far more conservative than the game actually
is: `1 + 18 * 12 + 11 = 228` of 255, so a third new row would overflow at
264. But twelve of the nineteen rows can never be packed at all — `bellows`, `pick`,
`auger` (relics), `chasm` (a miracle) and all **eight** machine substances.
`rules/placement.js#placeTile` refuses any form with no `tile` block,
`#placeableFromPockets` sends `rig` down `placeMachine` instead, and no
tile-capable form's `subTags` (`gravel`: metal/rock, `log`/`rung`: organic,
`stair`: metal) cross with a `relic`, `miracle` or `machine` substance.

**The real figures.** The guard now measures from the highest **packable**
ordinal — native terrain, or a legal crossing with a form carrying a `tile`
block:

| | as measured today |
|---|---|
| substance rows | 27 |
| forms | 13, so `STRIDE` 14 |
| packable substances | 7 of 27 (`copper`, `tin`, `timber`, `stone`, `soil`, `granite`, `adamant`) |
| highest packable ordinal | 8 (`adamant`) |
| byte in use at that ordinal | `1 + 8 * 14 + 13 = 126` of 255 |
| last ordinal that still fits (`PACKABLE_LIMIT`) | 17, at `1 + 17 * 14 + 13 = 252` |

Two of the four rows appended since Phase 14a are `relic`-tagged trinkets and
two are `miracle`-tagged phials (§14), and none of the four moved
`PACKABLE_MAX` off `adamant` — which is exactly the asymmetry this table
exists to state: a non-packable row costs an ordinal and nothing else.

Rows that can never be packed — relics, miracles, machine items — now cost
the tile byte **nothing**. They do still consume ordinals, so a *tile-capable*
row must land at an ordinal ≤ `PACKABLE_LIMIT`.

**Appendable headroom for a tile-capable row is ZERO.** Ordinals 9–17 read
as rows of headroom by slot count alone, but **every one of them is already
occupied** by a non-packable row: 9–17 are `auger`, `chasm`, `furnace`,
`press`, `belt_r`, `brazier`, `hearth`, `talos_head`, `cyclops_maw`.
`SUB.length` is 27, so the next **appended** row lands at ordinal 27, and if
it were packable:

```
before Phase 14a (11 forms, STRIDE 12):  1 + 23 * 12 + 11 = 288  >= 255
after  Phase 14a (12 forms, STRIDE 13):  1 + 23 * 13 + 12 = 312  >= 255
today       (13 forms, STRIDE 14):       1 + 27 * 14 + 13 = 392  >= 255
```

`data/forms.js` **throws at import** in both cases. Executed, not reasoned
about: appending a `marble` row to `data/substances.js` produces
`forms: 24 substances x 11 forms overflows the tile byte -- packable ordinal
23 ("marble") packs to 288, and ordinal 20 is the last that fits`. So the
escape hatch this section already gestured at is not a contingency for "if
that limit is ever approached" — it is **the only mechanism**, today:

> **A new tile-capable substance must be INSERTED at an ordinal ≤
> `PACKABLE_LIMIT`, never appended.** No tile byte is ever persisted (no save
> file, no `localStorage`, §7's own "no meta-progression"), so an insertion is
> only ever a renumbering and is safe.

`src/data/substances.js`'s own header said "ROWS ARE APPEND-ONLY", in flat
contradiction with the paragraph above it. It now carries the same
qualification: append freely for anything that can never reach the tile byte;
insert for anything that can.

Both halves are enforced, not eyeballed: `data/forms.js` throws at import if
the highest packable ordinal exceeds 20, and `tools/content.mjs` assertion 16
proves the fact that narrowing rests on — a substance crossable with a
tile-capable form must carry its own `tile` block, or the tile it places would
have `Infinity` hardness (`model/tiles.js#baseHardOf`) and never be mineable
back out.

## 16. Worldgen: relief, contacts and hollows (Phase 7)

Locked with `docs/BUILD_PLAN.md` Phase 7. The surface is a landscape and the
rock below has natural voids in it. Three new strata kinds and one new
tunable; no new substance, no band `tw` moved (SPEC §1 still fixes the world
at 128 tiles), and every draw is `rand()` so a run is still bit-reproducible
from its seed (invariant 7). All of it lives in `src/rules/generate.js` plus
`src/data/world.js` rows.

### 16.1 The height map (`kind:'relief'`)

One row per band, declared FIRST; a band without one is flat (`astral`,
`topsoil`). A landform pipeline of seven passes in this order — a trend
octave, discrete summits, two smoothing passes, a clamp, the spawn shelf
pinned, the relief blended in either side of it, and the step limit swept
outward. Rewritten in wave 6 phase 6c; the three summed octaves this replaced
are gone.

| number | value | where | meaning |
|---|---|---|---|
| `amp` | 10 | strata row (`RELIEF`, 6, is the default) | rows of hilltop above `floorTy`, 80 px at an 8 px tile |
| `dip` | 2 | strata row | rows of valley floor below `floorTy` — see below |
| `TREND_PERIOD` | 40 tiles | `generate.js` | lattice spacing of the one trend octave |
| `TREND_SHARE` | 0.20 | `generate.js` | the trend's amplitude either way from its centre, as a fraction of `amp + dip` |
| `HILL_SPACING` | 20 tiles | `generate.js` | tiles of world per summit, so 6 over a 128-column band |
| `HILL_LOW` | 3 tiles | `generate.js` | the shortest summit |
| `HILL_SHARE` | 0.72 | `generate.js` | the tallest summit, as a fraction of `amp` |
| `HILL_SLOPE` | 1.6 | `generate.js` | half-width per tile of summit height |
| `HILL_WIDE` | 1.8 | `generate.js` | how much wider than that a summit's draw may go |
| `SMOOTH_PASSES` | 2 | `generate.js` | 1-2-1 passes over the float profile |
| `FADE` | 36 rows | `generate.js` | depth at which a boundary's relief offset reaches 0 |
| `BLEND` | 10 columns | `generate.js` | the smoothstepped fade-in either side of the spawn shelf |
| `LIP` | 0.35 | `generate.js` | fraction of a FLAT band's top row carved away — see below |

The blend is smoothstepped rather than linear. A linear ramp out of a flat
shelf holds one slope for its whole width, so it renders as a flight of
stairs. The S-curve leaves the shelf flat, steepens in the middle and settles
into the landform, which renders as the foot of a slope. It also widens the
guaranteed-flat ground at spawn from `SHELF`'s 19 columns to 21–45, median 24,
which §5's beat 6 only benefits from. That is the same metric as the longest
flat run in the table below, and measured over seeds 1..200 the two are equal
on every seed — the longest flat stretch a seed has IS the spawn shelf and its
blend.

A summit is one column per slice of `HILL_SPACING`, at a random column inside
it, so the spacing is irregular but no seed gets a dead plain. Each summit is
a raised cosine `h/2 * (1 + cos(pi x / w))` added to the profile in tiles.
That shape has maximum slope `pi h / 2w`, so `w >= (pi/2) h` is exactly what
holds the 1-tile-per-column limit `rules/player.js#moveX`'s auto-step
imposes. `HILL_SLOPE` rounds `pi/2` up, which is why §16.2's step pass
backstops a summit rather than shaping it.

Measured over 200 seeds, reading the ground row the way
`tools/worldgen-check.mjs#groundRow` does and skipping timber:

| | three summed octaves | the landform pipeline |
|---|---|---|
| direction changes per 128 columns | 26–57, median 43 | 5–13, median 8 |
| flat columns | 45–69%, median 57% | 55–80%, median 69% |
| highest hilltop above `floorTy` | 2–6 rows | 4–10 rows, median 8 |
| deepest valley below `floorTy` | 0 rows, always | 0–2 rows, median 1 |
| steps over 1 tile, per seed | 0–3, median 1 | 0–1, 0.065 per seed |
| longest flat run | 19–29 columns | 21–45 columns, median 24 |

The landform column is measured at `dip:2`; the three-octave column is the
generator this replaced, at `dip:0`, which had no way to go below the datum at
all. 111 seeds of 200 now carry at least one column below it.

**Relief runs BOTH WAYS from `floorTy`, and the sky reaches past the horizon.**
`heightmap()` takes a downward budget and honours it, so a valley floor below
the declared ground line is the `dip` on the strata row, spent at 2 by wave 6
phase 6s. What used to block it was `view/scene.js#drawSky`, which painted sky
only down to `floorTy * tile` and left `INK.void` below that row, so a valley
floor under `floorTy` wore a black band instead of sky. Both passes now read
one number, `view/paint.js#skyBottomTy`, which is `floorTy` plus the band's
own `dip`.
`drawSky` continues its haziest step down to that row, and `excavated` calls
an air tile cut rock at or past it. Landed by phase 6r.

**`dip` recentres the profile; it does not only cut valleys.** The trend
octave is centred on `reach - dip`, so raising `dip` lowers the whole
landscape relative to the datum and the spawn shelf becomes a plateau rather
than the lowest ground in the band. That is the point of spending it, and it
is also why the spend is small — see the cap below.

**`tools/worldgen-check.mjs` property 10 is what holds the two numbers
together.** `skyBottomTy` finds the relief row by the literal `'relief'` and
reads the literal `dip`; spell either wrong and it silently returns `floorTy`,
the black band comes back, and nothing else in any checker moves. Property 10
asserts `skyBottomTy(surface) === floorTy + dip` and that no ground row over
200 seeds is deeper than it, and the file refuses a `dip` of 0 outright,
because at 0 the correct answer and the broken one are the same number.

**`excavated` stays a union, and the depth term is not removable.** A valley
and a hand-dug shaft are the same geometry, one sky-exposed column, and
nothing in `model` records the height map the generator started from — so
`view` cannot tell them apart. Inside the relief envelope the landscape itself
may be open air, so the sky wins; past it the player dug, so the cavity
texture wins and a shaft stays a lit hole rather than a slot of daylight.
Photographed at `dip:2`, seed 17. The valley floor at column 22 reads as open
sky down to row 22, a shaft sunk from that floor reads as a warm lit hole, and
a tunnel driven sideways into a hilltop is still a cavity.

**THE COST OF `dip` IS PAID AT SPAWN, AND IT IS WHY `dip` IS 2.** A shaft
inside the relief envelope reads as sky for as long as it stays inside it, and
the spawn shelf is pinned at exactly `floorTy` — so the daylight collar on the
hole §5 beat 3 sends the player to dig is exactly `dip` rows deep. That hole
is a 5-tile dig to the guaranteed vein's top at row 25. At `dip:4` four of
those five rows are sky and the first hole in the game reads as a slot of
daylight; at 2 it reads as light spilling into the mouth of a dark hole. Both
were photographed before the number was chosen. A phase that wants a deeper
`dip` needs a way to tell a shaft from a valley first; `docs/FINDINGS.md`
(phase 6s) records one, and why it was not taken here.

The datum does not move either way — CLAUDE.md D9 anchors the HUD gauge and
`cyclops_maw`'s `minDepth` to `floorTy`, and §16 never touches it.

**The ragged lip belongs to a flat band only.** `KINDS.layer` carves `LIP` of
its own top row in a band with NO relief row. A band with one gets no carve at
all, because the carve is an independent coin flip per column — which leaves a
two-tile face the hop cannot clear where it lands beside a raised column, and
was the loudest term in the sawtooth this section replaced.

**Strata follow the surface.** A boundary declared at row `ty` sits at
`ty + round(off[tx] * max(0, 1 - (ty - floorTy) / FADE))`. Both sides of a
seam resolve the *declared* row, so two adjacent layers can never part
company, and the offset is 0 by 36 rows down — the adamant band at topsoil row
220 inherits no surface wobble.

### 16.2 Traversability (BUILD_PLAN C4/C5/C6)

| number | value | meaning |
|---|---|---|
| `SHELF` | 9 tiles half-width | the guaranteed flat shelf, 19 columns, pinned to `floorTy` |
| `STEP_BIG` | 2 tiles | the only step larger than 1, and only descending away from spawn |
| `STEP_GAP` | 12 columns | minimum spacing between two big steps |
| `SAFE_R` | 24 tiles | radius around the spawn tile where no step exceeds 1 and no hollow may reach |

`SHELF` was 6 while the whole surface was flat. 9 is a port of the flat
prototype's own `SPAWN_TX ± 9` "guaranteed level ground"
(`docs/ARCHAEOLOGY.md` §2.2): once the ground either side undulates, 13
columns is not enough to stand on and place a 3x2 furnace at arm's length
(the aim reticle reaches 3.2 tiles), which is §5's beat 6.

The step pass sweeps OUTWARD from the shelf in both directions, so the shelf
and its blend are its fixed point. A rise away from spawn is capped at 1 tile
always. A DESCENT away from spawn may take `STEP_BIG` where both its columns
are outside `SAFE_R + 1` and the last big step was `STEP_GAP` columns ago.
Down is free, so walking out is never blocked, and the landform pipeline
leaves so little for this pass to do that a two-tile drop now turns up in
roughly one seed in fifteen (0.065 per seed over 200, against 0.78 before). Walking
back up one wants a dig or a ladder, which is the premise, not a bug.

**Walkability is measured, not asserted.** Two ways, both over the live bands
`newRun(seed)` builds. Geometrically, no adjacent column pair rises by more
than 1 tile in the outward direction, over every seed tested. Behaviourally,
the real player driven through `shell/main.js#step` at the fixed 1/120 s step
reaches column 0 and column `tw - 1` from spawn in 12 of 12 seeds. The one
thing that stops that walk is a standing tree trunk, which is 3 to 5 tiles of
`solid:true` timber and clears neither the auto-step nor the hop. That is
unchanged behaviour and predates the pipeline — the same 12 seeds stall at the
same trunks under the three-octave generator.

**The ±1 limit stays, and the terracing it causes is answered in PAINT.**
One tile per column on an 8 px tile can only draw a hillside as treads and
risers, and the limit cannot be relaxed, because the auto-step clears exactly
one tile and a 2-tile rise is therefore a wall the hills stop being walkable
over. So `view/treatments.js#grassCap` chamfers the outer corner of every
one-tile step — the notch over the lower tread is filled on the diagonal, one
pixel wider per row down, in the turf the tread already wears, with the turf's
own 1 px tufts scattered along the new edge. The outline then runs level,
diagonal, level, and two steps in a row join into one bank. CLAUDE.md D7:
it is a `TREAT` entry reached from a `look:{}` row, deterministic from tile
coordinates through `hash2`, at zero tile cost, zero substance rows and no
collision change at all — the cells stay air and the player walks through a
bank exactly as they walk through a canopy.

Three numbers, all in `view/treatments.js`: the chamfer reaches `bevel` px
horizontally (default one tile, so 45°, clamped to `EXTENT.grassCap`), `5` px
of each row stay in the bright turf tone measured from the outer end, and a
positional hash widens a row by 1 px 42% of the time so the diagonal is a bank
of earth rather than a ruled line. A row opts out with `bevel: 0`, which is
also how `tests/visual.spec.js`'s "the turf bank is not a no-op" proves the
pixels differ with it off.

**A `STEP_BIG` face is deliberately NOT chamfered.** The bank fires only where
the cell below the neighbour is a turfed surface tile — one row down, never
two — so the steepest face the generator produces stays a cliff. That is what
`cliff-face.png` photographs, and both readings are in the one frame.

### 16.3 The contact zone (`kind:'contact'`)

A boundary is a band `thick` tiles deep where the two materials interdigitate.
Ported in effect from the flat prototype's `hash2` flip windows
(`docs/ARCHAEOLOGY.md` §2.2, the one real casualty that file identifies),
re-expressed as the new strata kind §7 of that file recommends.

| number | value | where |
|---|---|---|
| `thick` | 4 tiles (soil/stone) | strata row — content decides, per boundary |
| `CONTACT_BIAS` | 0.45 | `generate.js` |

Across the band the chance a cell is the UPPER material falls from 1 to ~0
with depth, pushed either way by a per-column bias (one `rand()` per column,
smoothed against its neighbours) — which is what makes the result fingers
rather than TV static. The consequence is deliberate: a shaft through a
contact hits alternating hardness, so the dig slows and speeds unpredictably.

Only one contact row exists today (`surface`: soil over stone at row 27, the
gradational one). A sharp seam is the same row with `thick:1`; granite and
adamant are ore FIELDS rather than layers, so they have no boundary to grade
yet.

### 16.4 Hidden hollows (`kind:'hollows'`)

Air carved out of the rock after the strata and before the ore.

| row | `fromTy..toTy` | `count` | `r` | `steps` | `bias` |
|---|---|---|---|---|---|
| `surface` | 38..56 | 16 | 1.4..2.6 | 2..3 | 1 |
| `topsoil` | 4..320 | 180 | 1.6..3.8 | 2..4 | 0.85 |

| number | value | meaning |
|---|---|---|
| `HOLLOW_ROOF` | 2 rows | minimum rock between a hollow's ceiling and the top of the solid column |
| `HOLLOW_ASPECT` | 1.5 | width over height of each stamped disc — a room, not a chimney |
| `HOLLOW_VEIN` | 0.14 | fraction of a lined hollow's wall cells that get an ore cluster |
| `hollowOre` | 0.25 | **the one tunable**, `data/tuning.js`, read through `eff()` — chance a hollow is lined |

Shape is a short random walk of `steps` positions stamping a squashed disc of
radius `r` at each. `bias` < 1 skews the centre draw toward `toTy`, so density
rises with depth. Measured over 40 seeds: 139 rooms per seed, 3..13 tiles
across, at most 8 ROWS of internal height — a drop of at most 7 tiles, which
is 0 hearts on §3's table (1 heart starts at 8 tiles) — and nothing stacks
higher than that, because of the one-room rule below.

Every reason a candidate is discarded whole ("backfilled entirely" is
"never carved", which is the same world and one pass fewer):

- any cell out of bounds or outside the row's own window;
- any cell in the spawn shelf's columns, or within `SAFE_R` of the spawn tile
  — the shelf columns carry the tutorial shaft and (via `near:'spawn'`) the
  guaranteed vein, and §3 promises the first two minutes cannot kill;
- any cell whose ceiling is within `HOLLOW_ROOF` of the top of its own solid
  column — a hollow that breaches the surface is a hole, and a hole is not a
  secret. This is also what keeps `model/tiles.js#skyExposedAt` honest;
- any cell, or any 4-neighbour of one, that is already air. ONE HOLLOW IS ONE
  ROOM: two merged hollows would be a room twice as tall as either, i.e. a
  fall twice as long as the row's own size key admits.

**Hiddenness is not a flag.** No `hidden` key, no discovery event, no reveal
trigger. A hollow is unseen because `b.seen` is false, dark because
`rules/light.js` says so, and un-flooded because §11's `passB` will not
enqueue past its first ring without `lightAt() >= 1`. Verified, on 16 seeds:
a room 6 tiles from a lit shaft, with no air path to it, stays unseen.

**Lining pays for the fall.** `eff('hollowOre')` of hollows have their walls
lined during the ore pass: `line:true` opts a `blobs` row in, and the DEEPEST
such row whose window holds the hollow claims it, so the jackpot is graded by
depth (copper, then tin, then granite, then adamant). Clusters are stamped
into SOLID cells only, so the ore is embedded in the wall and the room stays a
room. Worth **177 extra ore cells per seed** in `topsoil` — 35 copper, 42 tin,
60 granite, 39 adamant, measured over 200 seeds at the §19.7 counts (it was
"about 155" at the pre-14d counts; lining stamps into solid cells, so the
fewer clusters a `blobs` row scatters, the fewer of a lining star's cells land
on ore that was already there).

**Lining is opted in by the FLAG, not by the `count`.** `rules/generate.js#blobs`
scatters `count` clusters and *then* lines every hollow it claimed, so a row
with `count:0` still lines. This is why §19.7's retune is not `count / charge`:
the lining term is a fixed floor that does not scale, and dividing the count
alone overshoots by roughly a third. At §19.7's counts, lining supplies 34% of
`topsoil` granite's ore and 36% of its adamant.

### 16.5 Ore body shape

Cruciform, not round. A centre cell plus 4-8 arms of length 1-2, orthogonals
first, so a small cluster is a plus sign and a big one a star: `arms =
clamp(round(r * 2), 4, 8)`, an arm may be two cells long above `ORE_LONG`
(2.4) and grows one shoulder above `ORE_FAT` (2.8). `r` is the same
`r:[min,max]` draw per strata row the round disc used, so tier sizing stayed
content.

This is NEW generation, not a port: `docs/ARCHAEOLOGY.md` §2.4 establishes
that cruciform ore never existed here — the round ragged-rim disc was the
shape from the mockup onward. Because a cruciform cluster is roughly half the
cells a same-radius disc was, every `count` in `data/world.js` rose to hold
total ore near where it was (measured over 5 seeds: surface copper 225 -> 232,
topsoil copper 1355 -> 1246, tin 1067 -> 1010, granite 464 -> 538, adamant
173 -> 223; the shortfalls are the ~9% of `topsoil` that is now open room).

**Those counts have since come back DOWN, and it is the same move.** A `count`
buys CELLS; what this section holds near constant is total ore **UNITS**.
Phase 7 made a cell smaller, so counts rose; Phase 14b made a cell worth
`tile.charge` units, so counts fell again. The live numbers, the measurement
and the method are **§19.7**, and `data/world.js` is the only place they are
written down as code.

`blobs` writes into SOLID cells only, so a field never fills a hollow.
`vein` (the guaranteed first copper, `near:'spawn'`) writes into air as well,
because the guarantee is the whole point of the row, and is `dy:6, r:2.4,
n:1` — ONE star of exactly 6 cells, because `arms = clamp(round(2.4 × 2), 4,
8)` is 5 and `r` is not *above* `ORE_LONG` (2.4), so no arm doubles and no
shoulder grows. Its top is therefore always row 25: the 5-tile dig §5's beat 3
promises, with no arm roll left to be unlucky about. At `charge` 4 that is
**24 copper units**, against a bill of 10 (§5 beat 3) + 12 (§13's furnace) =
22. It was `r:3.6, n:3` — three overlapping stars, 23.9 cells and 95.5 units
measured over 200 seeds — see §19.7.

## 17. Segment transport, cranks and gears (Phase 8d onward)

Locked with `docs/PLAN-gears-and-winches.md` and `CLAUDE.md` invariant 4 (as
reworded), D4 (as amended) and D10. This section is opened by **Phase 8d**,
which lands the data, the model and the link verb with **no motion at all**;
the motion half is filled in by Phase 8f, and every row below marked
*(8f)* is a number this file locks before any code reads it, per this file's
own header rule.

As of Phase 8f the staged winch is **gone** — machine row, substance, build
recipe, `STARTING_MACHINES` entry, `liftUp`/`liftDown`, the
`'NO SHAFT TO SERVE'` placement branch, the machine record's `deck` field and
the whole `rules/lift.js` module. §13's winch material and §15's `lift` recipe
row are superseded by this section and marked so in place.

### 17.1 The five nouns

`CLAUDE.md` D10 is binding: **hub**, **segment**, **carrier**, **chain**,
**drivetrain**, and nothing in code, docs or a commit message may use a sixth.
A chain is DERIVED (`model/segments.js#chains()`), never stored.

### 17.2 The four machines

| machine | footprint | footing | block | held substance | mass |
|---|---|---|---|---|---|
| `hub` | 2x2 | **1** | `hub:{ reach:96, carries:['material','player'] }` | `hub` | 10.4 T |
| `crank` | 1x2 | 1 | `crank:{ torque:**1.5**, reach:12 }` | `crank` | 3.3 T |
| `gear` | 1x1 | 1 | `gear:{ loss:0.06 }` | `gear` | 1.9 T |
| `axle` | 3x1 | 1 | `variantOf:'gear'`, `gear:{ loss:0.02 }` | `axle` | 4.8 T |

`reach:96` is 12 tiles at the 8 px tile every band ships with. `reach:12` on
the crank is `handFeed`'s own 10 plus a little, deliberately: "close enough to
turn" and "close enough to feed" must read as one distance.

**`hub.footing` is 1, not 2, and it was 2 until Phase 8f.** A headframe
straddles the shaft mouth: one column on solid ground, one over the void. At
`footing:2` both columns had to stand on rock, and the cable — which leaves
from the footprint's own **centre**, i.e. down the right-hand column — then ran
straight into the hub's own footing tile one row below, so `linkCheck` refused
every span steeper than 45° with `'THE PATH IS BLOCKED'`. "A hub at the surface
and a hub at the shaft floor" was therefore unbuildable through
`rules/placement.js` at all (`.claude/brain/verification-gaps.md` records how
this stayed invisible until it did).

**And `footing:1` did not end it.** With one column supported, the *remaining*
footing tile still sits directly under the footprint the anchor is the centre
of, so a span arriving from below still ran into it and `linkCheck` still
refused — the same defect one column narrower, reopened by Phase 8g's
boundary-exact sampling. Fixed in the sweep rather than in this row, because
this row is the reading that is right: §17.6 holds the exemption, the
measurement and why the alternatives (including `footing:0`) were rejected.

**`crank.torque` is 1.5, not 1.0, and the half is load-bearing** — see §17.8
for the arithmetic that forces it.

All four are in `data/grants.js#STARTING_MACHINES`, ungated, for the same
reason the retired winch stage was: transport is the bottleneck, not a
reward.

### 17.3 Build bills

Same `hand:true`-recipe mechanism §15 locks for every other machine. Mass is
`Σ substance.item.mass x form.massK x n` — the identical
`model/items.js#massOfPair` arithmetic, never a second sum.

| machine | bill | mass | recipe secs |
|---|---|---|---|
| `hub` | 3 `copper/plate` + 1 `copper/ingot` + 2 `timber/log` | 10.4 T | 10.0 |
| `crank` | 3 `timber/log` + 3 `stone/gravel` | 3.3 T | 4.0 |
| `gear` | 2 `timber/log` + 1 `stone/gravel` | 1.9 T | 2.0 |
| `axle` | 2 `copper/ingot` + 2 `timber/log` | 4.8 T | 6.0 |

**The number the family is priced around.** A segment needs TWO hubs, so the
pair is `2 x 10.4 = 20.8 T` — *exactly* what the one winch stage it replaced
weighed (§13, §15), and `2 x 10.0 = 20.0 s` of crafting, exactly that stage's
own `secs`. A complete minimal segment (two hubs + one crank) is **24.1 T**, and
with a gear **26.0 T**, so both still fit inside one 40 T trip (§9). Pricing a
hub at the stage's full 20.8 T would have put a working segment at 44.9 T and
made carrying one down a shaft a two-trip errand for no design gain.

`crank`'s bill is 3 gravel and not 2 on purpose: `{3 log, 2 gravel}` is a
strict subset of `brazier`'s `{4 log, 2 gravel}`, and
`rules/crafting.js#choose` is first-match-wins, so at 2 gravel the crank would
have been permanently unreachable by hand for any player holding four logs.
See `data/recipes.js`'s declaration-order block, which states every containment
in the file.

### 17.4 Tunables

Eight rows in `data/tuning.js`, read only through `eff()`.

| id | kind | base | unit | meaning |
|---|---|---|---|---|
| `segUp` | value | 26 | px/s | carrier ascent at full surplus and full drive |
| `segDown` | value | 26 | px/s | free descent on a vertical segment, scaled by slope |
| `segBase` | value | 1.0 | drive | the unit `crank.torque` is denominated in, and the divisor both speed ramps use |
| `segLoad` | value | 0.0125 | drive/talent | added drive per talent aboard, at full slope |
| `riderMass` | value | 8 | talents | the player's own body on a carrier |
| `segReach` | scale | 1.0 | x, scope `machine` | multiplies `hub.reach` (`linkCheck`) |
| `crankTorque` | scale | 1.0 | x, scope `machine` | multiplies `crank.torque` |
| `torqueLoss` | scale | 1.0 | x, scope `machine` | multiplies `gear.loss` |

All eight are live as of Phase 8f; `rules/drive.js` is the only reader of the
first five and of the last two.

**`segUp` equals `segDown`, and that equality is the rule.** Nothing on a cable
rises faster than it falls, so a fully fed drivetrain at most matches what
gravity gives back for nothing, and what makes up expensive is that an ascent
happens only while a player stands at a crank holding a key. A descent needs
nobody.

**`segUp` was 11 until wave 6, and the constraint that pinned it there is
retired on purpose.** It carried the retired `liftUp`'s exact base so that a
carrier would not be faster than the staged winch deck it replaced. That deck,
its tunable and `rules/lift.js` are all gone, and `docs/PLAYTEST.md` finding 2
measured what the pin cost — a three-segment chain moved 10 T of cargo
**14x slower than the player's own legs** (105 s of held crank against 7.5 s of
held climb), so the transport system the game is named around was strictly
dominated by a ladder and no rational player would build one. A measurement of
the shipped game outranks a bound inherited from a deleted module. `segDown`
keeps its own base of 26 and is unchanged, so the pair now states an ordering
rather than a shared ancestry.

**`segLoad` was 0.025 until wave 6, and 0.0125 puts one crank's stall exactly
on the burden cap.** A vertical segment needs `1.0 + 0.0125 x 40 x 1.0 = 1.5`
drive to lift 40 T, which is precisely one `crank.torque`. So the break-even is
**40 T aboard** — the whole burden cap — and one crank raises anything a
player's pockets could hold and stops dead at the boundary. A player riding
with full pockets weighs 48 T with their body, which is past it, so the carrier
runs backwards under them and nothing had to say so. That is D4's "boarding is
never refused" as arithmetic.

**The stall has to stay reachable.** A carrier strong enough that load stops
mattering is the free ladder again from the other side, so
`tools/check.mjs`'s WEIGHT REVERSES IT probe derives all three of its rows from
`eff('segLoad')`, `eff('riderMass')` and `eff('burden')` and fails outright if
the burden cap ever climbs. It used to state the boundary as a pocket load of
12 T and the reversal as 30 T, and those two literals blocked this number for a
wave.

### 17.5 The segment record

Runtime state in `model/segments.js`, cleared by `newRun()` like `machines` and
`items` (invariant 8). **A segment is not a machine** and must not become one:
no footprint, no buffer, no recipe, and it is created by an action *between*
two machines rather than placed.

```
{ a, b,            the two hub machine RECORDS (never ids: machines never move,
                   and a removed hub must invalidate this)
  ax, ay, bx, by,  world-px anchor points, cached at link time
  len,             px
  slope,           (yLo - yHi) / len, 0 horizontal .. 1 vertical
  hi,              'a' | 'b' -- which end is UP. Ties resolve to 'a'.
  t,               0..1 carrier parameter, 0 = the LOW end
  dir,             -1 up | 0 still | +1 down, for view only
  load,            talents currently riding, for view and the tooltip
  band }           the band the carrier is currently in
```

An anchor is the hub footprint's own **centre**, so the geometry is symmetric
and does not depend on which end was armed first. A fresh link parks its
carrier at `t = 0` (the low end) with `dir = 0` and `load = 0`; from there
`rules/drive.js` owns all four of `t`, `dir`, `load` and `band`, and is the
only writer of `m.torque` and `m.turn`.

### 17.6 Linking: one decision, two readers

`model/segments.js#linkCheck(a, b)` returns `{ ok, why, at }` and is the ONLY
implementation — `rules/placement.js#linkSegment` turns a `false` into a
journal row plus the mutation, and `view` (Phase 8e) turns the same `false`
into a tinted cable ghost. The same rule `placementCheck` already follows
(§13, `docs/DEVELOPER_GUIDE.md#one-decision-two-readers`).

Refusals, **in this order** — structural before affordable, per
`placementCheck`'s own ordering:

| `why` | test |
|---|---|
| `'NOT A HUB'` | either end's row has no `hub` block |
| `'ALREADY LINKED'` | `linkedTo(a, b)` — a segment already joins this exact pair |
| `'TOO FAR APART'` | `len > min(reachOf(a), reachOf(b))`, where `reachOf(m) = hub.reach x eff('segReach', def.id)`. The **smaller** of the two hubs governs, so a long-reach tier can never lend its reach to a short one |
| `'THE PATH IS BLOCKED'` | any sample along the span is solid, **except inside either endpoint's own headframe** — see below |
| `'OUTSIDE THE WORLD'` | any sample resolves to no band |

There is deliberately **no** `'TOO STEEP TO STAND'`: every angle is legal.
Recorded so the omission reads as a decision.

**A hub's own footing tile does not block a cable leaving that hub, and this is
`footing:2`'s defect recurring at `footing:1` (Phase 10a).** §17.2 records
dropping `hub.footing` from 2 to 1 so that a headframe straddles the shaft
mouth. That fixed the one instance and *not* the class: the anchor is still the
footprint's **centre**, so a span rising from the hub below terminates one row
above the upper footprint's bottom and must cross the row directly beneath it —
which `placementCheck` requires to hold a solid tile. Since Phase 8g
`solidNear` also (correctly) samples **both** tiles sharing a boundary-exact
coordinate, so the footing tile is seen whichever column holds it. Measured,
`topsoil`, two hubs 12 tiles apart on flat ground, hubs built through
`rules/placement.js#placeMachine`:

| upper hub's footing tile | `linkCheck` |
|---|---|
| none (a hub `placementCheck` refuses: `'NEEDS A FLOOR'`) | `{ok:true}` |
| left column / right column / both | `{ok:false, why:'THE PATH IS BLOCKED', at:{x:168,y:1632}}` — the footing row's own lower boundary |

So a **straight vertical link between two legally placed hubs was impossible**,
and the refusal pointed at a tile the player had deliberately placed as the
hub's floor. The exemption: a tile in an endpoint's **own band**, in its
**footprint's columns**, in a row from the **anchor's own row** down to the
**footprint's bottom plus one**, is not blocking. That is **exactly two tiles
per endpoint** — the footing row's two columns; the rows above it are inside a
footprint `placementCheck` has already proved clear. It is sound on three
required facts and not on a tolerance: the footprint is required *clear*, the
footing tile is required *present*, and the drawn cable leaves the headframe,
which straddles its own floor. Rejected alternatives, per
`docs/PLAN-phase10.md` §3.1: moving the anchor off the footprint centre (breaks
§17.5's locked anchor, moves every carrier), teaching the player to lean one
column per stage (the obvious build always refuses, and 11 tiles per stage is
not enough to reach astral), and `footing:0` (hubs float, and the headframe
reading dies).

**The rider passes the same two tiles, and no others (Phase 10b).** Phase 10a
exempted only the cable; `rules/drive.js#ride` still refused any translation
that would put the player's box inside solid rock, and a 6 px box centred on
the anchor straddles the anchor's own column boundary, so the footing tile was
inside that box whichever column held it. Measured, the same 12-tile pair on
real footing tiles:

| direction | before Phase 10b | after |
|---|---|---|
| riding **up** under a held crank | stops at world y 1632, **34 px (4.25 rows) below the deck**, then detaches and falls back down the shaft | arrives flush on the deck at `t = 1` |
| riding **down** from `t = 1` | descends **10 px** and stops; the carrier leaves without them | tracks the deck for the whole descent, drift **0.000 px** over 3 s |

`rules/drive.js#boxSolid` now takes the exempt ranges and gets them from
`model/segments.js#headframe` — the **same function** `linkCheck` uses, exported
for this one reader rather than re-derived, so the rider can never be exempted
from a tile the cable is not. `model/tiles.js#solidAt` and
`rules/player.js#boxSolid` are untouched: nothing outside a ride translation on
that segment sees any of it. A rider whose box overlaps the footing row cannot
get stuck in it — the rows above are required clear, so their top half is
always in proven air, and gravity, a hop and `moveX` all resolve out of it on
the next frame through code the exemption does not touch (measured).

**A rider cannot power the segment they are riding, and that is by design, not
by this defect.** `rules/drive.js#supplyOf` requires the player's box to
overlap a crank inflated by `crank.reach` (12 px), and a rising carrier leaves
that reach within two tiles. Measured on a 12-tile span with one crank at its
foot and the player aboard holding `turn`: the carrier rose **18.0 px — 2.25
tiles — and stalled there**, oscillating at the edge of the crank's reach for
the remaining 40 s. So **cargo rides up and the player
climbs** — a segment carries a player *downward* for free and *upward* only if
something else is turning the crank. D10's "manual only" is what makes that
true, and §18.2's ascent costing is priced on the player climbing scaffold.

The clear-path test is the **half-tile sweep** `rules/items.js` already states
("no substep longer than half a tile, in either axis") — `n = max(1, ceil(len /
(tile x 0.5)))` samples, `bandAt()` per sample so a cross-band span works, and
`solidAt()` in that sample's own band. Not a Bresenham. `tile` is the smaller
of the two endpoint bands' tile sizes, so a future band with a finer grid
cannot be sampled too coarsely.

Both flags are collected over the WHOLE sweep and then reported in the table's
order, so a span that is both blocked and partly off-world reports
`'THE PATH IS BLOCKED'` — the order above is the answer, not the iteration.

**The path is checked at link time only, never re-checked** (`docs/PLAN` A4,
confirmed): a segment whose span is later walled in keeps working. Cosmetic,
not a soft-lock, and re-validating every segment every frame is a cost with no
gameplay behind it.

**Deconstructing a hub cuts its segments.**
`rules/placement.js#deconstruct` calls `write.unlinkAll(m)` after its existing
empty-check, so a removed hub can never leave a dangling segment. A rider on a
cut segment simply falls (`docs/PLAN` A6, confirmed: allow) — gravity is
invariant 4's whole answer and the fall-damage curve (§3) already exists.

### 17.7 The link verb

`l`, **edge-triggered**, the same `*Held` latch idiom `hop`/`place`/`drop`
already use. Two presses with the aim reticle over a machine:

- first press: `shell/ui.js#ui.linkFrom` is armed. Which endpoint is armed is
  UI state, per D2 — `view` reads it through `frameCtx`, never by import.
- second press on a **different** machine: `linkSegment(from, to)`. The arm
  clears on success and **survives a refusal**, so a mis-aimed press costs a
  retry rather than the whole gesture.
- second press on an **already-linked** partner: the cable is cut.
- second press on the **same** machine: the arm is cleared. No cable existed,
  so nothing claims one was cut.
- `Escape` clears it, on the same line that already clears an armed placement.
- an arm whose machine has since been deconstructed clears on the same
  top-of-frame sweep that already drops a stale armed placement.

Shell does **not** pre-filter for hubs: the first press arms any machine and
`linkCheck` produces `'NOT A HUB'` on the second. The decision stays in one
place.

### 17.8 Motion: one expression, three cases *(Phase 8f)*

Per frame, per segment, in `rules/drive.js`. Every number through `eff()`.

```
mass    = Σ massOf(item) for items in carrierBox        (model/items.js)
        + rider ? eff('riderMass') + burdenOf() : 0     (model/run.js)

need    = eff('segBase') + eff('segLoad') * mass * seg.slope
supply  = the DRIVETRAIN COMPONENT's torque (§17.9)
demand  = Σ need over every segment anchored in that component
drive   = demand > 0 ? min(1, supply / demand) : 0
surplus = supply - need

surplus > 0   ->  ascend  at eff('segUp')   * min(1, surplus / segBase) * drive
surplus == 0  ->  hold still
surplus < 0   ->  descend at eff('segDown') * min(1, -surplus / segBase) * seg.slope
```

**What is aboard is the carrier's own 10 px window and nothing wider (Phase
6q).** `model/items.js#itemsIn` now re-tests each item's position against the
rect it was handed, which `model/space.js#query` never did for it — that query
visits whole 32 px buckets, so `carrierBox`, every `catchBox` and
`rules/belts.js#groundBox` alike reached the four-tile bucket grid instead of
the box they asked for. Measured on the `winch` scenario: the stock pickaxe
lying on the ground at x 368, against a carrier box spanning x 379..389, was
lifted 7 px off the floor and hauled up the shaft by a cable a tile and a half
away from it. It now rests where it fell. The same test states the rule for
load: an item is aboard when its own position is inside `carrierBox`, so
`CARRIER_GRAB` either side of the 4 px deck is the whole of the grab, and
`load` counts what a carrier is physically under rather than what is nearby.

**There is no `descend()` and no charge gate.** Weighted descent is what the
same expression produces at zero supply: `surplus` is then `-need`, which is at
least `segBase`, so an unpowered vertical segment descends at the full
`segDown`. A horizontal segment gets that same descent times `slope = 0` and
therefore sits still — no horizontal special case exists anywhere.

**The `* drive` factor on the ascent case is a deliberate deviation from
`docs/PLAN-gears-and-winches.md` §4.3**, and it is there because §4.3 and §4.4
of that document cannot both be implemented literally:

- §4.3 apportions `supply` across a component's segments in proportion to their
  own `need`, which makes `surplus` identically `need × (supply/demand − 1)`.
  Its **sign is then uniform across the component**, so two identical segments
  sharing one crank do not slow down, they *stop* — contradicting §4.4's own
  worked example ("one crank feeding three segments turns all three at a third
  speed") and Phase 8f's acceptance step 6.
- §4.4's `drive` alone can never run a loaded carrier **backwards**, which is
  the load-bearing correction in the brief.

So `surplus`, computed against the **whole** component supply, decides the
direction and the descent magnitude; `drive` decides how much of the
drivetrain's capacity an ascending segment gets. Nothing can exceed
`eff('segUp')` under any combination. `rules/drive.js`'s header states the same
argument at the code.

**`crank.torque` must exceed `segBase`, and that is why it is 1.5.** Two
requirements collide at 1.0: an unpowered empty carrier must slide back down at
the *full* `segDown`, which needs a whole `segBase` of deficit, and one crank
must be able to raise that same empty carrier, which needs a positive surplus.
At `torque == segBase` the surplus is exactly zero — the hold-still case — so a
single crank would raise nothing. Measured at 1.5, one crank on one vertical
segment:

| aboard | need | result |
|---|---|---|
| nothing | 1.000 | climbs at 13.0 px/s |
| 4 T of ore | 1.050 | climbs at 11.7 px/s |
| 38 T | 1.475 | climbs at 0.65 px/s |
| 40 T (the burden cap) | 1.500 | **holds still** (the exact `surplus == 0` boundary) |
| 48 T (8 T body + the 40 T cap in pockets) | 1.600 | runs backwards at 2.6 px/s |

The reversal is gentler than it was, and that follows from `segLoad` rather
than from anything about descent: `min(1, -surplus / segBase)` needs a whole
unit of deficit to reach the full `segDown`, and halving the load term halves
how fast a given overload accumulates one. An unpowered carrier still sinks at
the full 26 px/s at any load, which is the row above it in the table.

**What one crank is worth, and what a second one is worth.** One crank supplies
1.5 against a `segBase` of 1.0, so `min(1, surplus / segBase)` can never exceed
0.5 and a single-crank carrier tops out at half `segUp`. A second crank inside
the same 12 px reach doubles the supply, saturates the ramp and runs the
carrier at the full `segUp` at any load up to 80 T. Driven on a vertical
segment, 10 T aboard, before wave 6's retune and after:

| rig | `segUp` 11, `segLoad` 0.025 | `segUp` 26, `segLoad` 0.0125 |
|---|---|---|
| one crank, 96 px | 2.75 px/s, 34.9 s | 9.75 px/s, 9.8 s |
| one crank, the 236 px three-stage `ascent` chain | 115.3 s of held crank | 30.6 s |
| two cranks, 240 px | 11.0 px/s, 21.8 s | 26.0 px/s, 9.2 s |

The chain is slower per pixel than one segment of the same length because a hub
between two stages anchors both, so the idle stage above shares the crank's
supply through `drive` (§17.9). That is the stated behaviour, not a loss.

**The ladder is what all three are measured against, and the second crank is
what inverts the preference.** Cycle 2's whole demand is three copper plates,
7.2 T, and 236 px of that climb costs 23.6 s of held `up` (§9). The same haul
on the `ascent` chain costs **27.8 s** with one crank per stage and **9.1 s**
with two — 0.85x and 2.60x the ladder. A 38 T haul makes the gap wider still:
54.0 s of climbing, 643 s on one crank per stage, 9.1 s on two, and refused
outright at 41 T. So a chain beats legs from the second crank on, and a rig
that has not been upgraded is priced at parity. Whether the second crank (3
logs, 3 gravel) is the intended upgrade or `crank.torque` should rise is an
open design call, stated in `docs/FINDINGS.md`'s phase 6t entry, finding 5.

### 17.9 The drivetrain solve *(Phase 8f)*

**Nodes** are every placed machine whose row carries `crank`, `gear` or `hub`.
**Edges** are **orthogonal footprint adjacency in the same band** — two
footprints sharing an edge, computed from `m.tx/m.ty` + `def.tw/th`.
**Diagonals do not conduct**; a corner needs a gear in it (`docs/PLAN` A3,
confirmed), and Phase 8e's art is what teaches it.

```
supply = Σ over ACTIVE cranks c in the component:
             crank.torque(c) × eff('crankTorque', c.id)
                             × Π (1 - gear.loss(n) × eff('torqueLoss', n.id))
                               over the nodes n strictly BETWEEN c and its
                               nearest hub
demand = Σ need(seg) over segments anchored in the component
drive  = demand > 0 ? min(1, supply / demand) : 0
```

A crank in a component with no hub contributes nothing. A node with no `gear`
block (another crank mid-train) conducts losslessly — it is a shaft with a
handle on it, not a gearbox. "Nearest" is fewest nodes, by a BFS in `machines`
order, so it is deterministic (invariant 7).

**A segment whose two hubs sit in different components** — the ordinary case
for a cross-band span — is driven by whichever supplies **more** torque, `a`'s
on a tie. The greater, never the sum: two half-fed drivetrains at opposite ends
of one cable do not add up to a free ride.

`m.torque` is set to the component's `drive` for every node, and `m.turn`
advances by `spin × TURN_RATE × dt`, where `spin` is `drive` when there is
demand and 1.0 when there is none — a drivetrain with nothing to lift
free-spins, and drawing it stopped would be a lie.

**Caching.** The component partition and each crank's path to its nearest hub
are cached per band in a module-local `WeakMap`, invalidated by a signature over
the node set (count, position, definition), exactly as `rules/light.js` does and
for the identical reason: `newRun()` hands out fresh band records, so a stale
entry can never be read back into a live run and there is no reset call to wire
up or forget. Only the **topology** is cached; every number is still read
through `eff()` per frame. **A crank's own activity is deliberately not cached
at all** — it changes on the frame a key goes down and on the frame the player
walks a pixel out of reach, and a cache keyed on something that changes every
frame is a slower way to compute the same number.

### 17.10 Riding *(Phase 8f)*

A carrier is **not** terrain and does not become terrain (invariant 1). It holds
the player up through a model query, exactly the way a ladder does:
`model/segments.js#riddenSegment()` — one predicate, read by both
`rules/player.js` and `rules/drive.js`, because `rules` siblings may not import
each other and two copies would eventually disagree about a frame.

- **A ladder wins over a carrier.** Pressing up or down on a rung says which
  mechanic you mean.
- **`vy < 0` is not riding.** A one-way platform: hopping up past a carrier
  passes it rather than being caught on top of it mid-jump.
- `carrierUnder(band, box)` requires horizontal overlap **and** the box's feet
  inside the carrier's own 10 px vertical grab band (`CARRIER_GRAB` either side
  of a 4 px deck). At the fixed 1/120 s step that window is three times the
  furthest a body at `terminal` can travel in one substep, so a fall cannot
  tunnel through it.
- `rules/player.js` snaps the rider **flush** to `carrierTop(seg)` and sets
  `onGround`, which pins `fallFrom` on the existing line — so **no fall damage
  accrues while riding**, with no new code in `land()`. `land()` still fires on
  the frame the player *arrives* on a deck out of a fall: a carrier is a
  surface, not a safety net.
- `rules/drive.js` then translates the rider by the carrier's own delta, after
  collision has resolved (`shell/schedule.js`: `player before drive`). The
  translation is **refused** if it would put the hitbox inside rock — the
  carrier keeps going, the rider does not, and gravity has them next frame.
- **Boarding is never refused at any weight** (D4 as amended). Hopping off is
  not burden-gated either: a hop is a hop, and an over-cap player on a sinking
  bucket must be able to step onto the ledge beside them.
- The one thing said out loud is a rate-limited `'TOO HEAVY TO LIFT'` journal
  row, pushed only when a crank **is** being turned and the carrier is
  descending anyway — the one state that is otherwise baffling.

Measured: 80 px ridden down costs **0 hearts**; the same 80 px costs **2** the
moment the deck is not under you, which is §3's table exactly.

### 17.11 The crank verb, and arrival *(Phase 8f)*

**`f`, a HOLD**, in `cmd.craft`'s shape and not an edge — the same hold-to-act
idiom as mining and hand-crafting. A crank is active while
`cmd.turn && overlaps(playerBox(), m.box, def.crank.reach)`, the same
`core/math.js` call `rules/machines.js#handFeed` makes, so reach-to-turn and
reach-to-feed cannot disagree. Every crank within reach turns; holding one key
at a junction of two turns both, and each contributes only its own torque.

**Nothing is spent but the player's presence.** No fuel, no charge, no item, no
hearts. `docs/DESIGN.md`'s cost-of-ascension equation is therefore repriced from
talents-of-fuel to **seconds of attention**, and `tools/check.mjs`'s break-even
section measures it in that currency.

**Arrival.** At the high end the haul is released (`it.rest = 0`, the
`rules/items.js` wake idiom) so it falls the last pixel onto whatever the upper
hub stands on, and the existing **`'winch'`** journal kind is pushed — so
`shell/notify.js`'s `"<n> DELIVERED TO <BAND>"` line and `data/sfx.js`'s sound
both work unedited. Only the high end is an arrival; a bucket coming to rest at
the bottom of its own shaft is not news.

**Band handoff** happens the moment the carrier's own band changes, not only on
arrival, by `iw.spawn` + `iw.remove` at the same world pixel — the only
sanctioned way to change an item's band. A cross-band chain therefore delivers
into whichever band `bandAt()` puts the carrier in; nothing declares a
destination.

## 18. The tribute cycle and the Heavens

Locked with `docs/PLAN-phase10.md` §4 and `CLAUDE.md` D1 (the four draft
tiers), D9 (the depth datum) and D10 (the five transport nouns), landed as
Phase 10a (the astral widening and the endpoint-footing sweep, §17.6) and
Phase 10b (the cycle table, the two receivers, the director and beat sheet
beats 5–6).

### 18.1 The nouns

Five words, and one of them is a role rather than a coinage:

| term | what it is | where it lives |
|---|---|---|
| **cycle** | one trial: a god, a receiver, a demand, a clock, a reward and a punishment | `data/cycles.js#CYCLES`, one-based, live row `run.cycle` |
| **tribute** | the LIVE demand ledger for the current cycle, or `null` when none is armed | `run.tribute = { id, have, left }`, `model/run.js` |
| **demand** | `[{ sub, form, n }]`, concrete pairs a cycle's tribute requires — never a selector | `data/cycles.js`'s own `demand` field |
| **favour** | how a god feels about you this run, `{ [godId]: int }` | `run.favour`, written by `write.favour` |
| **receiver** | a machine tagged `tribute:{}` that drains its own buffer into the live tribute every frame | `altar`, `cloud_dock` — `data/machines.js` |

**A receiver is a role, not a sixth transport noun.** `cloud_dock` is declared
with a `hub:{}` block exactly like any other hub — `data/machines.js`'s own
header is explicit that it must be one, since nothing in this game can
deliver cargo to a machine that is not a segment endpoint — so §17.1's five
nouns (hub, segment, carrier, chain, drivetrain) are unchanged and CLAUDE.md
D10's "nothing in code, docs or a commit message may use a sixth" still
holds. "Dock" names the machine the same way "furnace" does; `tribute:{}` is
a second tag on an existing kind of thing, not a new kind.

### 18.2 The astral band, as widened

Phase 10b widened `astral` to full width (`data/world.js#BANDS[0]`):
`tw:128`, `origin:{x:0, y:0}`, `tile:8`, `floorTy:30`. In absolute world px,
against the two bands that already existed:

| | astral | surface | topsoil |
|---|---|---|---|
| world x | **[0, 1024)** | [0, 1024) | [0, 1024) |
| world y | **[0, 320)** | [320, 768) | [768, 3328) |
| ground line (world y) | **240** (`floorTy 30 x tile 8`) | 480 (`floorTy 20`, `origin.y 320`) | n/a — buried under the surface band's own rock |

All three bands share the same width and tile size now, which is *why* the
world x range is identical across the row — §1's "world width 1024 px" was
never a single-band number, it simply had nothing above the surface to
disagree with it before this phase.

**0 M does not move (CLAUDE.md D9).** The depth datum is
`worldY(spawnBand, spawnBand.cfg.floorTy)` — the surface's own ground line,
world y 480 — read identically by `view/hud.js#depth` and by
`data/machines.js`'s `minDepth` placement rule, so the gauge and placement
legality can never disagree. Astral's entire span (world y 0..320) sits
above that datum; `view/hud.js#depth` renders the figure unsigned at or below
it (e.g. `12M`) and `+`-prefixed above it (e.g. `+32M`), never as a second
zero.

**The gap between the two ground lines is 240 px — 30 tiles — and that is
what a lift chain has to cross.** Astral's floor top (y 240) to the surface's
own ground line (y 480) is `480 - 240 = 240` px. A hub's own `reach` is 96 px
— 12 tiles, §17.2 — so the minimum number of segments able to bridge 240 px
is `ceil(240 / 96) = 3`: the three-segment chain `data/cycles.js`'s own
cycle-2 comment and `docs/PLAN-phase10.md` §4.5 both price the whole ascent
against.

### 18.3 The two receivers

One receiver block, declared twice (`data/machines.js`, "PHASE 10B: THE TWO
TRIBUTE RECEIVERS"): `ports` + `buffer.cap` + `catchBox` + `handFeed` +
`tribute:{}`, and no `recipes` on either row. What differs is `hub` — the
dock has one, the altar does not — and the catch-box slack.

**`handFeed` on both rows is the REACH and the MATERIAL CLASSES a hand may
put in, not a key.** This table's `hub` row said "holds the feed key" from
Phase 10b until Phase 16b and there was no such key at any point in between
(the audit: `docs/PLAN-phase16-interaction-model-v2.md` §3.4). The verb is
§23's: click a held pair to arm it, aim at a machine inside
`handFeed.reach`, LMB, one unit per press. The *automatic* proximity drain
that stood in for it — `rules/machines.js#handFeed`, one unit per selector
per substep for merely standing there — is opt-in as of Phase 16b (the
Character tab's AUTO FEED row, default off, reset every run like AUTO
COLLECT).

| | `cloud_dock` | `altar` |
|---|---|---|
| footprint | 2x1 | 2x2 |
| footing | 2 | 2 |
| `hub` | `{ reach:96, carries:['material','player'] }` | none — cycle 1 is unmoved at the surface (§4, §5); the player walks up and hands the ore over, one unit per click (§23) |
| `band` | **`'astral'`** — placeable nowhere else (§20.1) | none — placed by the director, not the player |
| `accepts` | `*/#ore`, `*/#refined`, `*/gravel` | same |
| `buffer.cap` | 64 per class | 64 per class |
| `catchBox` slack | **6** | **2** — the furnace's own slack |
| build bill | 5 `copper/plate` + 1 `copper/ingot` + 2 `timber/log` | **none — unbuildable** |
| mass | **15.2 T** | — |
| recipe secs | 14.0 | — |

**What they accept, and why it is not a star.** Any element in an ore-tagged
form, a refined-tagged form (`ingot`/`plate`, by their own form tags), or
`gravel` — exactly what `data/cycles.js`'s cycle table (§18.4) can demand,
and nothing else. A `*/*` receiver would also swallow a `relic` trinket or a
`phial` miracle that fell in, precisely the accident D1's `subTags` exist to
prevent; `#fuel` is deliberately absent too, since no cycle asks for logs.

**The dock's catch-box slack is 6, and it is derived, not chosen.**
`rules/drive.js` releases an arriving haul inside the footprint at the
anchor — `box.y + 4` for `th:1` — two pixels below the top mouth's own lower
edge, and the item then falls away from the mouth onto the footing tile:
`rules/items.js#hop`'s resting position is `box.y + 8 - size/2`, which is
`box.y + 6` for a size-4 ore or plate. The top mouth's own lower edge is
`box.y + 2`, so the slack must reach 4.5 px past it; 6 is the next whole
number with margin. Every other catch box in the machine table catches an
item in flight through its top mouth, where 2 px is plenty — the dock is the
one exception, because it is the one machine a haul is released *inside*
rather than dropped onto.

**And that derivation is enforced rather than asserted only as of Phase 6q.**
`model/items.js#itemsIn` re-tests each item's position against the rect;
before, it returned every occupant of every 32 px bucket the rect overlapped,
so the real mouth of every receiver was the bucket grid. Measured, the
`ascent` scenario paying cycle 2 through the real crank:

| | before | after |
|---|---|---|
| where the dock swallows the haul | world y **255.98** — 16 px, two tiles, below its own catch box | world y **239.98**, the first frame the rising cargo enters the box |
| the box | `y 224..240` (mouth `y-2..y+2`, slack 6) | unchanged |
| cycle 2 | paid | paid, 52 substeps (0.43 s) later |

So the dock catches a haul on the way *in* and the slack of 6 is what covers
the released-inside case underneath it; a resting plate at `box.y + 6` is
2 px inside the box, exactly the margin this row was chosen for. Every catch
box in the table was measured the same way, by spawning one item per pixel of
a 113x97 px grid around the mouth and stepping one frame: each one now
swallows exactly its own `mouth ± slack` and nothing outside it, and a fall
from 8, 40 or 200 px — at rest, at `terminal`, or launched upward — is still
caught through the mouth at every offset inside it. The rect is CLOSED on all
four edges, because a resting item's `y` is exact tile arithmetic and a
half-open test would cost each mouth the right-hand and bottom pixel the
`slack` above claims for it.

**The altar has no substance and no recipe, and is placed by the director.**
`model/run.js#machineHeldSub` resolves a machine id through `S[...]`, so a
row with no substance simply never passes `placementCheck`'s held-item
clause — "never placeable by the player" with no special case anywhere.
`rules/cycles.js#ensureAltarPlaced` places it through
`model/machines.js#write.place`, the sanctioned worldgen-or-director route
that asks nothing about footing, grants or held items, at
`spawnTx - def.tw - SPAWN_GAP` — 4 tiles clear of spawn, not flush against
it. Flush would put a player standing still at run start already inside
`handFeed`'s 10 px reach with whatever they were handed, which is exactly
the bug `SPAWN_GAP`'s own comment in `rules/cycles.js` records finding.

**A receiver is a sink by mechanism, not by any one line that says so.**
Neither row carries `recipes`, so `rules/machines.js#produce` never runs for
either — nothing is ever crafted out of what a receiver holds. What actually
empties them is `rules/cycles.js#drainReceivers`: every frame, for the machine
the **live cycle's own `at` names**, every non-zero buffer entry is spent
through `model/machines.js#write.consume` and credited to `run.tribute.have`
in the same motion. Material goes in, is subtracted from the buffer, and
nothing is ever produced back out of it — the receiver's buffer is a counting
ledger with a footprint, not a hopper feeding a recipe.

**Only the live cycle's receiver credits it, and this section used to say the
opposite** (Phase 13d). The drain used to run for *every* machine tagged
`tribute:{}` regardless of which one `cyc.at` named, on the argument that
nothing about a `sub/form` key says which building it arrived at. True about
the key, wrong about the game: the altar stands four tiles from spawn for the
whole run and accepts the same three material classes the dock does, so
cycles 2, 3 and 4 were all payable by hand-feeding it — no ascent, no dock, no
drivetrain, no climb.

**Material fed to the wrong receiver stays in that machine's buffer,
uncredited.** It is not refused at the port and it is not destroyed. Refusing
it would put "which cycle is live" inside `rules/machines.js`'s generic port
interpreter — director policy in the machine layer, and a second place that
has to agree with `drainReceivers` about which receiver is live — and it would
contradict invariant 5, since a catch box swallowing what falls into it is
physics rather than permission. The pile is bounded by the row's own
`buffer.cap` (64 per class), visible in the machine's tooltip, and drained in
full the instant a cycle does name that machine. The altar after cycle 1 is
the honest cost: nothing later asks for it, so what is fed to it there stays
there.

### 18.4 The cycle table

Four rows (`data/cycles.js#CYCLES`); cycles 5–6 wait on the
`essence`/`ambrosia` tiers §8 marks not implemented. The ore-equivalent
column applies §8's compression ratios; `granite/gravel` has no ratio of its
own there (§8 only prices the refined tiers), so it is counted as raw mined
units, gated by `tile.tier` rather than by compression.

| # | god | at | demand | ore-equiv. | deadline | batch (§18.10) | reward | punishment |
|---|---|---|---|---|---|---|---|---|
| 1 | hephaestus | `altar` | 10 `copper/ore` | 10 | **none** | — | +1 favour; grant `furnace` + `cloud_dock`; chart `astral` | — (cannot be missed) |
| 2 | hephaestus | `cloud_dock` | 3 `copper/plate` | 36 (+12 fuel across the two compression steps) | 480 s | — | +2 favour; chart `topsoil`; draft `grant` (2 of 2, the tier's whole roster, §18.8) | 1 heart, −1 favour |
| 3 | athena | `cloud_dock` | 6 `copper/plate` + 4 `tin/ingot` | 72 + 16 = 88 | 420 s | — | +2 favour; draft `boon` (1-of-3, §18.8) | 2 hearts, −1 favour |
| 4 | poseidon | `cloud_dock` | 8 `copper/plate` + 8 `granite/gravel` | 96 + 8 tier-2 rock | 360 s | **4 `copper/plate` / 120 s** | +3 favour; draft `trinket` (1-of-3, §18.8) | 2 hearts, −1 favour |

**Cycle 1 is the altar and every later cycle is the dock** — data expressing
§4's "cycle 1 is unmoved at the surface" as a table lookup rather than as a
branch in the director. **Escalation is in refinement, not volume**: cycle
2's 3 plates cost 36 ore against cycle 1's 10 — a 3.6x jump in mining priced
as a 3-unit ask on the panel, which is the whole point of pricing in
compression. **Cycle 3 forces depth** (`tin` does not exist above topsoil
row 60, §16). **Cycle 4 forces the tier gate** (`granite` is `tile.tier 2`,
§9, so a stock pick cannot break it and the auger becomes necessary). **Hades
never asks**: the asker set is `{hephaestus, athena, poseidon}` — `ares`
stays the shipped trap god (§14) and `hades` is untouched, reserved for
`docs/DESIGN.md`'s Hades act, where his being the first god to address the
player in person is the whole reveal. **Cycle 4 also carries the table's only
batch clause**, and it lands there because cycle 4's plate half is the one ask
in the table that otherwise teaches nothing new — the third plate demand in a
row, after cycle 2 has already taught compression. The tier gate is about the
pick; the batch clause is about how you ship. §18.10 records that on these
numbers it does not bite a single-trip haul.

### 18.5 The ledger

Five `run` fields (`model/run.js#RUN_SCHEMA`), every one reset by `newRun()`
(invariant 8):

```
run.cycle     1-based, which row of data/cycles.js is live. CYCLES[run.cycle-1]
run.tribute   { id, have, left, credits } | null. REPLACED WHOLE, never
              patched in place -- a demand and its own deadline can never be
              observed half-applied. `have` is keyed the model/items.js#keyOf
              way, the same convention m.buf and run.inv already use.
              `credits` is the batch clause's own ledger, section 18.10.
run.favour    { [godId]: int }, run-scoped
run.charted   [bandId], KNOWLEDGE and not access -- there is no band lock
run.misses    count of expired deadlines
```

`run.tribute.left` counts down from `dt` alone, at the fixed 1/120 s step
(invariant 10), never from `Date.now()` — the first wall-clock quantity this
game has ever had. `left === null` is cycle 1's real "no clock" branch and it
must never count toward a miss that can never come.

`rules/cycles.js#step` makes one decision per call, in order: arm a cycle if
none is live, drain every receiver into it, tick the deadline, then resolve.
**Completion outranks expiry** — a delivery landing the same frame the clock
reaches zero pays the trial rather than missing it. `model/run.js#tributeMet()`
is the shared predicate, a query rather than a decision here, precisely so a
future TRIBUTE panel can draw the same yes/no without importing `rules`
(`view` may not import `rules`).

**A miss forfeits the ledger but not the trial**: `run.cycle` does not
advance, so the identical row re-arms next frame with a fresh `have` and a
fresh clock — the retry is the mercy, and the punishment is its cost. **Two
misses end the run**, through the existing `write.hurt` and no new death
path: the ordinary punishment applies first, then a second miss tops hearts
off to zero outright (`hurtFor(pos, run.hearts, ...)`) regardless of which
cycle it was or how many hearts remained, so "two" always means two.

`run.offer` is the draft bridge. `rules/cycles.js` may not import the four
`rules` siblings that each know what is draftable in their own tier
(`rules/grants.js`, `rules/boons.js`, `rules/trinkets.js`,
`rules/miracles.js`), so completion writes the tier name into `run.offer` and
`shell/main.js` dispatches — one event, one path, whether a key or a
completed trial requested it. §18.8 has the record's shape and what happens
next.

### 18.6 Rewards and punishments

Every completion always adds `favour` for the asking god — a trial always
changes how that god feels about you, which is what makes the FAVOUR panel a
picture of the run rather than a static roster. Beyond that, a reward is any
mix of:

- **`grants`** — machine ids appended straight to `run.granted`: the
  machine-grant tier paid out directly rather than drafted (cycle 1 only:
  `furnace` + `cloud_dock`).
- **`charts`** — band ids appended to `run.charted`. **Knowledge, not
  access** (`docs/PLAN-phase10.md` §3.4): there is no band lock anywhere in
  this game and this does not invent one; it only takes the `????????` mask
  (`view/ui/ruler.js#masked`) off a band's name on the ruler. Cycle 2's
  `topsoil` chart is close to a no-op on its own — any player who has dug at
  all has already entered that band — the payoff arrives once more bands
  exist to chart.
- **`draft`** — one of `'grant' | 'boon' | 'trinket' | 'miracle'`, handed over
  through `run.offer` (§18.5) and laid out as an offer by §18.8. Cycles 2–4
  each draft a different tier, in that order.

A miss's `punishment` is `{ hearts?, favour? }`, both real numbers rather
than a flat penalty: hearts scale from 1 (cycle 2) to 2 (cycles 3–4) as the
run progresses, and every punishable cycle also costs 1 favour with the
asking god — the two ways a debt can be felt at once. Cycle 1 carries no
`punishment` key at all, rather than one that is merely zero, because it has
no clock and can never be missed.

### 18.7 The fall off the dock

D5's premise — cargo ascends, the player does not, and gravity is the gate
rather than a wall — is enforced by §3's own table, unedited. The shortest
shaft a player can dig from the surface's own ground line up to the Cloud
Dock is exactly §18.2's gap: **240 px**. `v = sqrt(2 x 320 x 240) = 392 px/s`,
and `hearts = floor((392 - 160) / 32) = 7`, clamped to **5 — lethal**,
regardless of how many hearts the player has standing. Stepping off the dock
away from wherever the shaft was climbed is therefore not survivable by any
margin the player can arrange; the mechanic that enforces D5 is §3's existing
curve, unedited and un-special-cased for astral.

The honest caveat: a carrier parked in the shaft below catches the player
exactly as §17.10 says any carrier does — `carrierUnder()` does not know or
care that the shaft it happens to be parked in leads to the Heavens. That is
correct physics and not a hole to patch: a carrier is a real surface, and the
fence D5 relies on is gravity acting on an *empty* shaft, not a rule that
singles this one out.

### 18.8 The offer: 1-of-3, the pause and the reroll (Phase 17c)

`docs/PLAN-wave5-closeout.md` D17-A, D17-B and D17-F. Phase 17c1 is the
storage and the wiring; Phase 17c2 draws the modal (§18.9) and adds the
pointer.

**The record.** `run.offer` is `{ tier, god, ids, pool } | null`, declared
in `RUN_SCHEMA` and reset by `newRun()`. `ids` is the offer and **`null` is a
request for one**: `rules/cycles.js#complete` and the four debug keys can
only name a tier and its asker, because only `shell` may see all four tiers'
`draftable()` lists, so the record is raised half-built and
`rules/draft.js#offer` fills it the same frame. The ids are world state
rather than session state — they were drawn from the seeded stream, and a run
replayed from its seed lays out the same cards. `god` is **written down, not
derived**: whoever raises the request knows who asked, and `null` (a
debug-key draft, which nobody asked for) is a real answer rather than a
missing one. `pool` is how many candidates the cards were drawn from.

**The selection.** `rules/draft.js` is event-driven and is **not** in
`shell/schedule.js`; `shell/main.js#applyIntents` calls it exactly as it
calls `rules/placement.js`. It picks `eff('offerSize')` = **3** distinct
candidates by partial Fisher-Yates, consuming **exactly one `rand()` draw per
card laid out** — 3 for a full offer, 2 for the grant tier's two-of-two
(§14: 5 boons, 3 trinkets, 3 miracles, 2 grants), and a reroll the same again.
**Fewer candidates offer fewer cards**; nothing is ever padded, and a tier
with nothing left refuses out loud (`'NOTHING LEFT TO OFFER'`) rather than
raising a modal holding nothing.

**The pause.** An offer freezes the run: `shell/ui.js#pausesRun()` is one
predicate over `ui.stack`, consulted by both `shell/main.js#step` and
`#applyIntents` beside the existing `flags.showMap` and `run.won` guards.
Nothing advances — not `clock.t`, not `run.t`, not a falling item, not a
carrier under the player. The modal's own intents are dispatched **above**
that guard, since taking a card is the only thing that ends the pause.

**The reroll.** `eff('rerollCost')` = **2 favour**, spent with the god on
the offer record. Against §18.4's payouts (3 favour standing at cycle 2's
draft, 2 at cycle 3's, 3 at cycle 4's) that is at most one second look per
trial and never two.

`model/run.js#canReroll(god)` is the whole predicate, and `view` dims the row
with the same function `rules/draft.js` refuses the press with, so the two
cannot disagree about why. It has **two** clauses, and each has its own
`'refused'` message; neither spends anything:

- the god is short → `'NOT ENOUGH FAVOUR'`. A debug-key draft has no asker,
  so `god` is `null`, and it can never be rerolled.
- **the pool is no bigger than the offer** → `'THIS IS ALL THERE IS'`. The
  grant tier is 2 rows and lays out 2; the trinket tier is 3, or 2 once
  `tribute-bellows` has landed. A re-pick over a pool that size can only
  transpose the cards already on the table, so it is refused rather than
  sold. Without this clause, two of the three drafts a run contains charge 2
  favour for a shuffle.

**A run is not won while a reward is outstanding.**
`rules/cycles.js#ensureLiveCycle` defers `rw.win()` while `run.offer` is
non-null. `complete()` writes the offer and bumps `run.cycle` in one call, so
on the LAST trial the director can see `run.cycle > CYCLES.length` in a later
substep of the very frame that paid it — and `shell/main.js#applyIntents`
returns on `run.won` above both the offer's dispatch and its lay-out, so
cycle 4's trinket draft was discarded on whichever substep parity the
framerate happened to give (§20.2). The win therefore means "everything is
resolved", not "the counter moved". It cannot hang: a request is laid out or
dropped the same frame, a laid-out offer always holds at least one card, and
the only verb that ends it is always available.

**Escape does not dismiss an un-taken offer.** A permanent gift the player
cannot recover must not be losable to a reflex keypress, so the draft modal
swallows every key it does not own (1/2/3 take a card, `r` asks for a second
look) — the same "one thing owns the keyboard" rule the CRAFTING search field
already enforces, minus the way out.

### 18.9 The modal (Phase 17c2)

`src/view/ui/draft.js`, drawn from `view/hud.js#drawHUD`. Canvas-drawn,
integer pixels, the 5x7 bitmap font, no `fillText` (CLAUDE.md D2).

**Z-order.** The modal joins `drawHUD`'s existing exclusive end-of-frame
chain, **below** the death and win screens and **above** the title banner and
the hover tooltip. It therefore covers the main panel, the quickbar, the key
hints and the debug overlay. Below the end screens is not tidiness: a won run
returns above `applyDraftIntents`, so a modal over the win screen would be a
card nothing could take and a restart button it covered.

**Layout, measured and never hardcoded (D8).** One card per id in
`run.offer.ids` — two is a real case and no gap is reserved for a third. A
card is between 86 and 128 px wide; as many as fit across go in one row and
the rest wrap to a second, each row centred on its own count. Text is word
wrapped to the card's inner width, a word longer than the line is hard broken,
and the draw loop stops at the card's bottom edge, so lines are dropped in
reverse priority order: **god, name, modifier lines, flavour text** — the
flavour is what goes on a short card. Verified at the 200x180 base-buffer
floor `core/canvas.js#resize` enforces
(`tests/visual.spec.js-snapshots/draft-boon-floor-*.png`), where three cards
become a 2+1 grid.

**A card names.** The row's own god through `data/gods.js#godName` (a card's
god is the ROW's, which for a boon draft need not be the asker's), its `name`,
its `mods` one line each, and its `text`. The modifier lines are built from
the row and **not** from `model/mods.js#explain`, which filters the live
`mods.rows` list and so describes only modifiers already applied; the wording
is byte-identical to `view/ui/mainPanel.js#formatModRow`. They carry one
accent colour and **do not colour by sign**: `poseidon-flood`'s `hard x0.85`
is a benefit and `girdle`'s `climb x0.8` is a cost, and whether up is good is
a fact about the tunable, which lives in `data/tuning.js` — importable only by
`model/mods.js`.

**The REROLL row** draws `rerollPrice()`, the asking god and that god's
standing favour. When `canReroll(offerGod())` is false it is dimmed and prints
**which** of §18.8's two clauses failed, in `rules/draft.js`'s own words
(`'THIS IS ALL THERE IS'` / `'NOT ENOUGH FAVOUR'`), so the drawn reason and
the journalled refusal are the same sentence. It stays clickable when dimmed —
the press routes to the same refusal the `r` key does, because D17-B forbids a
hidden button and because the predicate must live in exactly one place.

**The pointer.** Every card and the reroll row are recorded into
`view/ui/state.js#drawn.panels` as `draft-card-<i>` (`<i>` indexes
`run.offer.ids`) and `draft-reroll`.
`shell/main.js#applyDraftIntents`'s hit-test is a **second caller** for the
intents 17c1 already built, not a second dispatch path: it sets the same
`wants.takeCard` / `wants.reroll` the 1/2/3 and `r` keys set and nothing else.
It lives there rather than in `applyUiIntents()` because that dispatcher sits
below the pause guard the modal itself raises and is unreachable while one
stands. A press on the wash, or on the main panel still open beneath the
modal, is swallowed.

**No card is takeable while `run.dead`.** The death screen draws above the
modal so its restart button stays reachable, which would otherwise leave the
1/2/3 keys granting a permanent gift off an invisible panel. The window is
real: `complete()` writes `run.offer` inside a substep and `raiseOffer()`
opens the panel once per frame, so the rest of that frame still simulates.

### 18.10 The batch clause (Phase 17d)

`docs/PLAN-wave5-closeout.md` D17-C, as renamed by its own review. A cycle
row may carry one optional `batch` block beside its `demand`:

```
batch:{ sub, form, n, secs }  deliver n of that CONCRETE PAIR to the cycle's
                              own receiver inside ANY window of `secs`
                              seconds. One block per row at most.
```

**Both clauses must hold.** `model/run.js#tributeMet()` stays the single
completion predicate and gains a second term, so a batch clause constrains a
flat count and never replaces one. A row with no `batch` key is unchanged in
every respect, and `batchMet()` reads `true` for it.

**It is not a throughput quota, and one cannot be built this way.** A credit
is stamped in `rules/cycles.js#creditTribute`, which runs when a receiver's
buffer is drained, so four plates hauled up together are one credit of four
at one instant. The mechanism never sees production at all. A player who
stockpiles for ten minutes and then makes two trips satisfies a window whose
nominal rate is 2 plates a minute while producing at 0.8. What the clause
really measures is how tightly arrivals are bunched, which is worth having —
it forbids the dribble of one unit per trip — but it is a different quantity
and this spec calls it by its own name. §4's older claim of a throughput
quota is withdrawn. A real one needs either credits stamped at production or
demands too large for one load, both recorded in `FUTURE_IDEAS.md`.

**Simulated time only.** The window is measured against `run.t`, which
`model/run.js#write.tick` advances by the fixed 1/120 s substep. Nothing in
the path reads `Date.now()` (invariant 10), so the clause behaves identically
at 30 fps and at 144 fps.

**The ledger.** `run.tribute.credits` is an array of `{ t, n }`, appended by
`rules/cycles.js#creditTribute` in nondecreasing `t` order, holding only
credits of the batched pair. A credit counts while `run.t - c.t <= secs`.
`model/run.js#write.tribute` prunes on every write, twice: it drops credits
older than the window, then drops the oldest of what is left while the
remaining sum still reaches `n`. Each surviving entry carries at least 1, so
the array is bounded by `batch.n` entries and not by the length of the run.
Dropping an older entry once the newer suffix already reaches `n` can never
change a later answer, because the answer is a threshold on that suffix.
`batchHave()` therefore saturates near `batch.n` and is not a count of what
was delivered. §26.1 is what the TRIBUTE panel draws from it.

**The numbers, and what they do and do not do.** Cycle 4 carries the only
clause in the shipped table: **4 `copper/plate` inside 120 s**, against a
bill of 8 plates and a 360 s deadline.

- Refining is not the constraint. One plate is 3 ingots and 1 fuel through
  `press` (8.0 s), each ingot 4 ore and 1 fuel through `smelt` (4.0 s), so a
  furnace feeding a press produces one plate per 12 s of furnace time and 4
  plates cost 48 s of the 120 s window.
- The haul is not the constraint either. Eight `copper/plate` weigh 19.2 T
  (`massOfPair` = copper's 1.0 × `plate.massK` 2.4) against `burden` 40 T and
  `burdenSoft` 30 T, so the whole bill rides up in one climb at no speed
  penalty and credits in one instant.
- **So on these numbers the clause does not bite the natural single-trip
  play.** It bites only a player who chooses four or more separate trips
  spaced more than 40 s apart. Making it bind would need `n × 2.4 > 40`, i.e.
  seventeen plates or more, which is triple this trial's cost on a cycle
  nobody has played end to end. The balance change is not worth buying the
  word, so the numbers stand and this paragraph is the honest record of what
  they buy.

## 19. Deposits, rubble and the packed block (Phase 14a)

Locked with `docs/PLAN-phase14-mining-and-drops.md` (D14-A, D14-B, D14-C,
D14-H). §19.1–§19.5 are **Phase 14a, content only: no `rules/` file changed
and no mechanic was added.** §19.6 is **Phase 14b**, the depletion mechanic
itself (D14-D, D14-E, D14-F).

The premise, in one line: **mined material is a prerequisite, not a placeable
unit,** and **a deposit is never something the player can put back.**

### 19.1 Three buckets, two new tags

Every mineable terrain substance is classified, and the classification lives
as a **substance tag** rather than a new key, because a tag is what the
selector grammar already reads — so `#bulk/gravel` is a recipe input that
granite can never satisfy, and the split is expressible in content instead of
as a branch in code.

| substance | bucket | why | what it drops |
|---|---|---|---|
| `soil` | **bulk** | the surface cap; filler you tunnel through, not a vein of anything | `gravel` |
| `stone` | **bulk** | "the bulk of the world" — its own row comment says so | `gravel` |
| `copper` | **deposit** | a `blobs`/`vein` body, glinting, the economy's base unit | `ore` |
| `tin` | **deposit** | a `blobs` body, depth-graded | `ore` |
| `granite` | **deposit** | a named body at `tile.tier 2` | `gravel` |
| `adamant` | **deposit** | a named body at `tile.tier 3` | `gravel` |
| `timber` | **organic** | grown, felled, and regrows from a seed — neither bucket | `log` |

Nothing else in `data/substances.js` is terrain at all: the three relics, the
one miracle and the twelve machine substances carry no `tile` block and are
not unclassified, they are *not terrain*.

`tools/content.mjs` **assertion 20** requires exactly one of the three tags on
every row carrying both a `tile` block and `mineable`, so a future terrain row
cannot be added without classifying itself.

**`marble` does not exist.** If it is ever added it is a **deposit** by this
table's own logic, and per §15's correction it cannot be appended — it would
have to be *inserted* at an ordinal ≤ `PACKABLE_LIMIT`, with the `deposit`
tag and a `blobs` row in `data/world.js`, or it is unreachable content.

### 19.2 A form is either feedstock or buildable, never both

CLAUDE.md **D12**, applied twice in the same commit. Two forms lost their
`tile` block:

| form | was also | now |
|---|---|---|
| `gravel` | consumed by `brazier` (2), `crank` (3), `gear` (1), `belt_r` (4), and demanded 8-at-a-time by `data/cycles.js#salt-tribute` | **feedstock only.** No `tile` block. |
| `log` | `tags:['fuel']` a furnace drains, plus a bare ingredient in `hub`, `crank`, `gear`, `axle`, `daedalan` | **feedstock only.** No `tile` block. |

`gravel`'s block was `{solid:true, climb:false, hardK:0.5}` and superseded
§15's "Placeable rubble" paragraph, marked there in place. `log`'s was
`{solid:false, climb:true, hardK:0.30}`.

**`peg_rungs` is unchanged and is now the only route to a placeable timber
ladder:** 2 `timber/log` → 4 `timber/rung`, 1.5 s. `rung` and `stair` are the
only wood/metal ladder forms, which is what `peg_rungs` and `daedalan` already
intended.

Consequence, measured: the tile-capable forms are exactly **`rung`, `stair`,
`block`**, and a raw drop refuses placement with
`'THAT DOES NOT BUILD'` (`rules/placement.js`) — verified for `soil/gravel`,
`granite/gravel`, `adamant/gravel`, `copper/ore` and `timber/log`. Neither
`placeableFromPockets` nor the click-to-arm gate in `shell/main.js` will offer
a form with no `tile` block, so in normal play the pair cannot even be armed.

### 19.3 `block` — the packed block

One new form in `data/forms.js`. One row covers soil **and** stone **and** any
future `bulk` element, because `subFrom` carries the element across exactly as
`smelt` does; there is no `soil_block` row and there never will be.

| | value |
|---|---|
| `size` | 4 |
| `massK` | **2.0** — twice the element's base mass; a block is compacted where rubble is loose (`gravel.massK` 0.5). 2.5 is the ceiling before mass conservation fails. |
| `hudOrder` | 12 |
| `tags` | `['built']` |
| `subTags` | `['bulk']` |
| `tile` | `{ solid:true, climb:false, hardK:1.0 }` |

**`subTags:['bulk']` is the load-bearing half, and it is the whole of "a
deposit is never player-placeable".** `crossable(granite, block)` is false, so
`granite/block` is not a legal pair and cannot be *constructed*, let alone
placed. That is a possibility that does not exist rather than a permission
someone can forget to check — the same argument D4 makes for boarding a
carrier, and the same `subTags` gate that keeps a miracle out of a trinket
selector. **`rules/placement.js` needed no edit at all.**

`copper/stair` stays legal and obtainable (`daedalan`), and that is correct: a
Daedalan stair is refined bronze work, not a vein of copper — it is placed, so
`formOf(byte) !== NATIVE`, so it carries charge 1 and drops itself back rather
than ore (§19.6). `tin/stair` and `adamant/stair` are legal and
**unobtainable**: `daedalan`'s output is the literal pair `copper/stair`, so no
recipe outputs either and nothing drops them.

**`tools/content.mjs` assertion 21 checks exactly this, per pair** (Phase 14e):
for every `deposit` substance and every tile-capable form the crossing must be
illegal *or* the pair unobtainable, where obtainable means "some `tile.drops`
or some recipe output produces it". `copper/stair` is its one named exemption,
with the argument above written out at the assertion. A future form tagged
`rock` or `metal`, or a recipe that outputs a tin stair, fails the build.

`hardK:1.0` means a packed block recovers at **native** hardness — soil
0.50 s, stone 1.60 s (measured: a placed `soil/block` reads 0.50 s) — not the
retired rubble tile's half.

### 19.4 `pack` — the recipe, and its 5:1 ratio

```
pack   PACK EARTH   in { '#bulk/gravel': 5 }
                    out [ { subFrom:'#bulk/gravel', form:'block', n:1 } ]
                    secs 2.5   hand:true
```

**5:1, and the 5 is not decorative.** Backfilling a hole now costs five tiles'
worth of rubble per tile of hole and digs back out at native hardness rather
than half — strictly harder than the retired 1:1 shovel, deliberately. And the
compression is **one-way**: mining a placed `soil/block` back out returns
exactly **1 `soil/block`** (`model/tiles.js#dropOf` gives a placed tile its
own pair back), never 5 gravel. Measured through the real dig verb.

Mass conservation (`tools/content.mjs` assertion 6):

| | in | out |
|---|---|---|
| soil | 5 × 0.5 × 0.5 = **1.25** | 1 × 0.5 × 2.0 = **1.00** |
| stone | 5 × 0.6 × 0.5 = **1.50** | 1 × 0.6 × 2.0 = **1.20** |

**Declaration position: absolute last**, after even `hearth`.
`rules/crafting.js#choose` is first-match-wins over declaration order, and
`pack` has **no containment in either direction** with any row in the file —
its 5 is strictly more gravel than any other bill asks for (`belt_r` 4,
`crank` 3, `brazier` 2, `gear` 1; `cyclops_maw`'s 6 is *granite* gravel, which
`#bulk` excludes), and it is a one-clause bill that demands none of the logs or
plate every other gravel row also wants. So position is decided by who loses
the overlap instead: declared first, a player holding 5+ rubble — nearly
always — could not hand-build a `brazier`, `crank`, `gear` or `belt_r`;
declared last, a player holding 2+ plate has to put the plate down to pack
earth. Starving four machine builds is worse than starving one utility craft.
The residual wart was the known one (`docs/FINDINGS.md` 8d #4: the craft queue
could not choose a recipe). Phase 6u closed it — a click names the row
`rules/crafting.js` makes (§25.1) — so `pack`'s position now decides only an
untargeted craft hold.

### 19.5 What §19.1–§19.4 do NOT change

Seconds-per-unit, `hard`, `tier`, `pickPower` and every tool's `power` are
untouched, so §8's compression table and `docs/DESIGN.md`'s measured
break-evens (raw ore 0.62 tiles, ingot 2.40, plate 6.90) still hold with no
re-derivation. `tile.drops` is unchanged for every substance. No `data/world.js`
count moved. `rules/mining.js` and `rules/machines.js` were not opened by
Phase 14a — §19.6 is where they are.

### 19.6 Depletion — a deposit's charge (Phase 14b)

**A deposit tile yields more than one unit, and it does not vanish until the
last of them is out.** One optional content key, one tunable, no new model
state, and no change to how long a swing takes.

```
tile.charge   OPTIONAL, deposit rows only. UNITS a NATIVE tile yields before
              it is gone. Absent = 1, which is what bulk and organic keep.
richness      kind 'scale', base 1.0, scope 'substance'. Multiplies charge,
              read as Math.max(1, Math.round(charge * eff('richness', id))).
```

| substance | `tile.charge` | `hard` | seconds to exhaust one tile | units/second |
|---|---|---|---|---|
| `copper` | **4** | 0.95 | 3.80 | 1.05 |
| `tin` | **4** | 1.10 | 4.40 | 0.91 |
| `granite` | **3** | 2.40 | 7.20 | 0.42 |
| `adamant` | **2** | 5.00 | 10.00 | 0.20 |
| `soil`, `stone`, `timber` | absent (= 1) | — | unchanged | unchanged |

All at pick power 1. **Each unit costs a full `hard`**, so seconds-per-unit
are exactly what §8 and `docs/DESIGN.md` already price and nothing in either
had to be re-derived. What changes is that the player stops walking between
tiles — the brief's "ore mining should be encouraged", spent on travel rather
than on rate.

**Not ~500 per tile**, which the brief's example number would make an
eight-minute stand on one tile and an infinite faucet under a placed miner.
The example is read as per *body*: a cruciform blob of ~20 cells at charge 4
carries ~80 units, which is "a deposit is a real find" at a per-swing figure
that stays legible.

**The ledger is `model/mining.js#dig.work`, and there is no second counter.**
Accumulated pick time in float seconds already persists per tile for the whole
run, so the same number answers "how far through this swing" (`% hard`,
`unitProgressAt`) and "how depleted is this vein" (`/ (hard × charge)`,
`progressAt`). This is emphatically **not** the historical bug back again: the
byte that made granite unmineable above 106 fps was a truncated byte *in the
material array*; this is a float in seconds in a sparse `Map` outside the grid.
The cost of reusing it is that the Map now grows monotonically with every
deposit tile ever partially worked — bounded by ~3,000 ore cells per topsoil
seed (§16.5), a few hundred KB worst case, stated honestly in `activeCount`'s
own comment.

**The arithmetic lives once, in `model/mining.js#unitsCrossed`**, because
`rules/mining.js` (the player) and `rules/machines.js#mine` (a placed miner)
are siblings that may not import each other and §12's measured
hand-equals-machine equality depends on them agreeing. It caps at
`charge - 1`: the last unit is the break's own drop, so a tile never yields
`charge + 1`. Both call sites run it in a **new branch before the break test**,
never interleaved with it, so the rare-trinket roll keeps its exact position
relative to the final drop spawn in the seed's `rand()` stream (invariant 7).

**The tooltip prints how many units are left (Phase 6m).** A hovered tile
whose effective charge is above 1 gains one line, `UNITS <left> / <charge>`,
under the hardness line. Units, never a percentage, because the player plans
in units. `charge:1` tiles gain nothing -- their one unit is the tile, and
`1 / 1` on every rock in the world is noise.

| | |
|---|---|
| left | `charge - min(charge - 1, floor(progressAt(...) x charge))` |
| charge | `view/paint.js#effChargeAt`, the tile's own charge times `eff('richness', sub)` |
| hardness | `view/paint.js#effHardAt`, not the base figure the `HARD n.nnS` line prints |

The arithmetic is `view/scene.js#drawLiveTiles`'s own, so the printed count
and the notches bitten out of the tile beside it cannot disagree, and it is
measured with the EFFECTIVE pair rather than the base one for the same reason
-- a live `hard` or `richness` modifier moves the notches, so it must move the
number. Capped one short of `charge` there and therefore never `0 / 4`: the
last unit is the break, so a tile that still exists still holds one.

**A placed unit has no charge.** `model/tiles.js#baseChargeOf` returns 1 for
any non-`NATIVE` byte, which it must: `stair` crosses with `metal`, so
`copper/stair` is a real placeable pair and charging it by its substance would
turn one stair into four on the way back out.

**Accumulated work is cleared whenever a tile's byte changes** — one line in
`model/tiles.js#write.setByte`, not at each of the four callers (mining,
placement, worldgen, the `chasm` miracle) and the fifth nobody has written
yet. Without it a `soil/block` placed where a part-depleted deposit stood
inherits multiple hard-seconds and breaks the instant it is touched.

Measured at the fixed 1/120 s step, through the real dig verb and the real
machine step:

| probe | measured |
|---|---|
| one copper tile, held LMB | 4 `copper/ore`, units out at 0.9583 / 1.9083 / 2.8583 / 3.8083 s, tile AIR only then |
| the same tile at 20/30/60/90/107/120/144/240 fps | 4 units at every rate; worst error 0.0500 s at 20 fps, always inside one frame |
| a fuelled Talos Head vs. the best hand tool, identical tile | 2.1167 s vs. 2.1167 s — **0.0000 s** (§12's equality holds through depletion) |
| granite, charge 3, tier-1 pick | 0 units, 0 work, tile intact, one rate-limited `'TOO HARD FOR THIS PICK'` |
| granite, charge 3, tier-2 auger | 3 `granite/gravel` over 4.0083 s (7.20 / 1.8) |
| `soil/block` placed where copper sat at 2.0000 s of work | work reads 0.0000 s; the block takes its full 0.5000 s |
| `richness.copper` × 2 | 8 units over 7.6000 s |

**Total available ore in the world was multiplied by charge, and §19.7 is
where that was paid back.** `data/world.js` knows nothing about charge, so
every `blobs` count and the guaranteed spawn `vein` were over-rich between 14b
and 14d — the mirror of the retune §16.5 records for cruciform bodies, and
measured the same way. Nothing in §19.6 itself moved a worldgen number.

### 19.7 The worldgen rebalance (Phase 14d)

**A `count` in `data/world.js` buys CELLS; what is held constant is UNITS.**
That single sentence is the whole of both retunes: §16.5's, which raised every
count when a cruciform cell replaced a disc, and this one, which lowers every
count now that a cell is worth `tile.charge` units. Neither `tile.charge`,
`hard`, `tier`, `pickPower` nor any tool's `power` moved in 14d — **seconds
per unit are exactly §19.6's**, so §8's compression table and
`docs/DESIGN.md`'s break-evens still hold untouched.

**The target** was total ore units within ~10% of the pre-14b total *cells*,
per substance per band. Measured over 200 seeds (`SEEDS` sweep against
`model/tiles.js#baseChargeAt`, the same query mining reads):

| band / substance | `count` before | after | pre-14b CELLS (the target) | 14b UNITS, unrebalanced | 14d UNITS | vs target |
|---|---|---|---|---|---|---|
| `surface` copper | 26 | **5** | 233.6 | 934.2 (+300%) | 239.6 | **+2.6%** |
| `topsoil` copper | 160 | **34** | 1261.4 | 5045.5 (+300%) | 1243.8 | **−1.4%** |
| `topsoil` tin | 126 | **26** | 1027.9 | 4111.6 (+300%) | 1014.5 | **−1.3%** |
| `topsoil` granite | 78 | **19** | 525.7 | 1577.2 (+200%) | 522.6 | **−0.6%** |
| `topsoil` adamant | 40 | **15** | 222.1 | 444.2 (+100%) | 215.7 | **−2.9%** |
| `surface` `vein` (`near:'spawn'`) | `dy:6, r:3.6, n:3` | **`dy:6, r:2.4, n:1`** | 23.9 cells | 95.5 (+300%) | 24.0 | **+0.4%** |

**These are not `count / charge` sums, and that is the one real finding.**
Hollow-wall lining (§16.4) is opted in by `line:true`, not by `count`, so its
contribution is a fixed floor that does not scale with the retune: at these
counts it is 66 of `surface` copper's 240 units, 141 of `topsoil` copper's
1244, 170 of tin's 1015, 179 of granite's 523 and 78 of adamant's 216.
Dividing the count alone leaves that floor intact and overshoots.
`docs/PLAN-phase14-mining-and-drops.md` D14-F's indicative table (8 / 48 / 38
/ 30 / 22) is exactly that division and measured **+43.2% / +34.5% / +36.5% /
+35.7% / +31.7%** — outside the 10% band on every row. The counts above are
the solution of one linear fit against the measurement, verified in a second
pass.

**The consequence is intended: veins are fewer, smaller and richer.** Five
copper clusters in the whole `surface` band, not twenty-six — a deposit is a
find rather than speckle, which is the same legibility argument §16.4 makes
for one hollow being one room.

**The one hard constraint, asserted rather than eyeballed.** §5's beat 3
promises 10 raw copper within a 5-tile dig directly below spawn, and §13's
furnace bill wants 12 more. `tools/worldgen-check.mjs` property 3 is now a
**units** assertion, not a cells one: a Dijkstra out of the spawn ground where
non-copper tier-1 rock costs one break, copper and air cost nothing (arriving
is the cost; mining the vein is the reward), budget 5, summing
`baseChargeAt` over every copper tile touched. Measured over 200 seeds:

| | units |
|---|---|
| floor asserted | 10, then 22 |
| min | **24** |
| median | 24 |
| mean | 25.6 |
| max | 72 |
| seeds under 22 | **0 / 200** |

24 is the vein's own 6 cells × charge 4, and it is invariant because at
`r:2.4` the star has no random arm length and no shoulder (§16.5). The ceiling
is **printed and not asserted**: the floor is a promise §5 makes, but "too
rich" is a pacing judgement with no locked number behind it. Both failure
branches were confirmed live rather than assumed — `r:1.0` (5 cells, 20 units)
trips the furnace-bill branch on every seed, and `dy:20` trips the
no-copper-in-reach branch on every seed.

### 19.8 Yield quality — not every unit drops (D-Q)

**A unit a tile WOULD yield does not always land.** One tunable, no new model
state, no change to hardness or charge:

```
dropChance   kind 'scale', base 1.0, scope 'substance'.
             scoped: { soil: 0.05, stone: 0.10 }.
             Rolled once per unit (`rand()`) in rules/mining.js, at both drop
             sites (a unit chipped loose mid-tile, and the final break's own
             drop) -- ORE INCLUDED, so the roll's position in the seed's
             rand() stream never depends on which substance is being mined.
```

| substance | `dropChance` | why |
|---|---|---|
| `copper`, `tin` | 1.0 (default) | real ore; the economy's base unit |
| `granite`, `adamant` | 1.0 (default) | named `deposit` bodies, not the `bulk` pair below |
| `soil`, `stone` | **0.05**, **0.10** | §19.1's own "bulk" pair — filler you tunnel through, not a vein of anything |

`dropChance` gates yield only. `tile.charge`/`hard` are untouched, so a soil
or stone tile still takes exactly as long to break as it always did — most
swings at it simply come up empty rather than the tile surviving longer.
Gated on the tile being `NATIVE`: recovering a placed `rung`/`stair`/`block`
is never subject to the roll, at either drop site.

## 20. Closing the tribute loop (Phase 13d)

Locked with `docs/PLAN-phase13.md` §5.3 and `CLAUDE.md` D5 (cargo ascends,
the player is not walled out), D6 (the First Trial does not move) and D9 (the
depth datum does not move). Five things, four of which are new numbers or
mechanisms and belong here rather than only in code.

### 20.1 The Cloud Dock's band gate

**`data/machines.js#cloud_dock` carries `band:'astral'`, and that is the whole
mechanism.** One optional machine-row key, one clause in
`model/run.js#placementCheck`:

```
band   a data/world.js BAND ID this machine may be placed in and nowhere
       else. Optional; only `cloud_dock` carries it today.
       Refusal: 'ONLY IN ' + BAND[def.band].name  ->  'ONLY IN THE MINOR HEAVENS'
```

| | |
|---|---|
| key | `band` (machine row, `data/machines.js`) |
| value on `cloud_dock` | `'astral'` |
| read by | `model/run.js#placementCheck`, checked **before** the `minDepth` gate |
| refusal string | `ONLY IN THE MINOR HEAVENS` (the band's own `name`, never a literal) |
| validated by | `tools/content.mjs` assertion 18 — a `band` naming no real band fails at lint |

**A band id and not a negative `minDepth`.** D9 fixes the depth datum at the
spawn band's own floor line, so "at least 30 tiles above the datum" and "in
astral" would be two independently-driftable ways of saying one thing — and
the arithmetic is the half that drifts, because it is derived from a band's
own `origin` and `floorTy` and nobody moving a band would remember a
threshold computed from them. A band id cannot drift and is provable at lint
time. The gate is checked before `minDepth` because it is the coarser of the
two location questions.

**Why it matters.** Until this key existed the dock had no depth or band
restriction of any kind and was placeable on flat ground four tiles from
spawn, so §18.4's cycles 2–4 could all be paid without a hub, a segment or a
metre of climb. "Ascend to the Heavens" was fiction and nothing in the code
said otherwise. `placementCheck` is one decision with two readers
(`rules/placement.js` and the build ghost), so the refusal shows on the ghost
before the click as well as in the journal after it.

**It gates the player, not the director.** `model/machines.js#write.place` —
the sanctioned worldgen-and-director route — asks nothing about bands, exactly
as it asks nothing about footing or grants. Nothing places a dock that way
today; the altar is the only machine that arrives by it.

### 20.2 The win condition

**`run.cycle > CYCLES.length` is the fact; `run.won` is the event.**

| | |
|---|---|
| condition | `run.cycle > CYCLES.length` — every shipped trial paid (4 today) — **and no draft offer outstanding** (§18.8) |
| state | `run.won`, a `RUN_SCHEMA` boolean, reset by `newRun()` like everything else |
| set by | `rules/cycles.js#ensureLiveCycle`, **once**, guarded on `run.won` |
| announced by | a `win` journal row → `data/sfx.js#KIND_SFX.win` (`triumph`) and `shell/notify.js#TEXT.win` (`THE GODS ARE ANSWERED`) |
| drawn by | `view/hud.js#winScreen`, through the same `endScreen` helper the death screen uses |
| restart | a measured button registered into `drawn.panels` as `'win-restart'`, hit-tested by `shell/input.js#onEndRestart` alongside `'death-restart'` |
| the run stops | `shell/main.js#step` returns early on `run.won` — no clock, no `stepAll`, no camera |

Before this, `ensureLiveCycle` hit that boundary and returned forever: the
TRIBUTE panel simply stopped drawing, FAVOUR kept reading full, and the game
did not end so much as run out. **The boundary is the table's own length**, so
cycles 5–6 (waiting on the `essence`/`ambrosia` tiers, §8) move it with no
edit anywhere.

**Death outranks the win** in `view/hud.js#drawHUD`. A won run cannot then
die, because nothing steps — but both are `rules/cycles.js#step` decisions and
could land in one frame, and a victory drawn over a corpse is the wrong
screen.

**There is one restart button, drawn twice.** `endScreen` owns the layout, the
measured button and the `drawn.panels` registration; the two screens differ
only in wash, lines and the id they record. The id is what makes them
hit-testable apart. Since Phase 17e they also share their two tally rows;
§26.4 has them.

### 20.3 The reward-grant bridge

`rules/cycles.js#complete` used to call `model/run.js#write.grant` directly,
which appended the machine id to `run.granted` and pushed nothing — so cycle
1's furnace-and-dock reward, the most important gift in the game, arrived with
no toast, no sound and no journal row. `rules/grants.js#grant` is the only
thing in the project that pushes a `'grant'` row, and it is a `rules` sibling
`rules/cycles.js` may not import (`tools/layers.mjs`).

**So the reward goes over a bridge, exactly as a draft already does:**

```
rules/cycles.js#complete   ->  run.awarded = [machineId, ...]   (rw.award)
shell/schedule.js          ->  'grants' step, immediately after 'cycles'
rules/grants.js#step       ->  clears the queue, then award(id) per id
rules/grants.js#award      ->  write.grant(id) + push('grant', {machine:id})
shell/notify.js#TEXT.grant ->  '<MACHINE NAME> IS GRANTED'
```

| | `run.offer` (draft) | `run.awarded` (reward grant) |
|---|---|---|
| written by | `rules/cycles.js#complete` | `rules/cycles.js#complete` |
| holds | a tier and its asking god, then the ids §18.8 lays out | machine ids |
| performed by | `shell/main.js#applyIntents` | `rules/grants.js#step`, scheduled |
| latency | one animation frame | **zero** — same substep |

**This is not a second grant path.** Both entry points in
`rules/grants.js` — `grant(grantId)` for a drafted `data/grants.js` row and
`award(machineId)` for a reward — end in the same `write.grant` plus the same
`'grant'` journal kind, and after this phase those two functions are the only
callers of `write.grant` in all of `src/`. The award is *scheduled* rather
than dispatched from `applyIntents` (where the draft bridge is performed)
because it is not an intent: no device asked for it, nothing aims it, and the
BUILD list should gain the row in the same substep the trial was paid rather
than an animation frame later. `shell/schedule.js` argues the two new
adjacencies in place.

`award()` does not and must not get a `data/grants.js` row: a GRANT row is by
definition draftable (`draftable()` filters on exactly the machine ids not yet
granted), and neither the furnace nor the dock is a draft.

### 20.4 The beat sheet past cycle 1

§5's sheet is the first two minutes and stops at beat 6 (cycle 1 paid).
`rules/tutorial.js#BEATS` and `data/callouts.js#CALLOUTS` stopped there too,
with a comment saying there was "nothing left to teach" — written before cycle
2's requirements existed. The instant cycle 1 pays, cycle 2 asks for four
things a player has never done once.

| beat | predicate (state, never a new counter) | callout shown while it is pending |
|---|---|---|
| 7 | one `copper/plate` exists, pockets **or** ground | `SMELT, THEN PRESS -- THE GODS WANT COPPER PLATE` |
| 8 | a `cloud_dock` placed in the band its own row names | `BUILD THE CLOUD DOCK -- IT STANDS ONLY IN THE HEAVENS` |
| 9 | a segment anchored to that dock | `LINK HUBS UP TO THE DOCK -- ONE CABLE REACHES 12 TILES` |
| 10 | `run.cycle > 2` — cycle 2 paid, clock beaten | `CRANK THE PLATES UP -- THIS TRIAL HAS A CLOCK` |

Each is a read of state another step already wrote, per `rules/tutorial.js`'s
own rule that no beat gets a counter, flag or hook of its own. Beat 8 reads
the band off `MACH[M.cloud_dock].band` rather than the literal `'astral'`, so
§20.1's key and this beat can never disagree. Beat 9 asks for **one** segment,
not three: the player discovers they need three from the reach they have
(96 px against §18.2's 240 px gap), which is the arithmetic teaching the
lesson the callout only points at. Beat 10 fires on cycle 2 paid because there
is nothing to observe about *noticing* a clock — and a miss does not advance
`run.cycle` (§18.5), so the callout correctly stays up through a retry.

`CALLOUTS` is indexed by beats **already fired** (0..10, 11 rows).
`rules/tutorial.js` **fails at import** if the two arrays' lengths disagree —
the same guard idiom `data/sfx.js` uses for a kind mapped to a missing
sound — because a beat with no row draws nothing at all rather than failing
(`docs/FINDINGS.md` #10's own failure mode). Index 10 is `null` on purpose:
cycles 3–4 ask for more of the same three verbs, and a callout that repeated
itself there would be noise.

### 20.5 The loop's feedback

The three journal kinds `rules/cycles.js` has pushed since Phase 10b had no
entry in `shell/notify.js`'s `TEXT`/`CHIPS` tables nor in
`data/sfx.js#KIND_SFX`, so completion, payment and debt were all silent.

| kind | sound | `MIN_GAP` | chips | text |
|---|---|---|---|---|
| `tribute` | `tithe` (new) | **0.12 s** | 2 | `N COPPER PLATE TITHED` |
| `cycle` | `trial` | — | 14 | `HEPHAESTUS IS SATISFIED` |
| `debt` | `debt` (new) | — | 8 | `HEPHAESTUS TURNS AWAY -- 1 HEART, -1 FAVOUR` |
| `win` | `triumph` (new) | — | — (`at` is null) | `THE GODS ARE ANSWERED` |

`tithe` carries the widest gap in the table because `handFeed` moves one unit
per selector per substep and the drain credits it the same substep: ten ore
means ten rows in ten consecutive 1/120 s steps, which is 120 Hz of bell and
ten fresh ZzFX buffers a frame. `cycle`, `debt` and `win` need no gap — each
fires at most once per trial.

**The ordering artifact this section used to record is fixed (Phase 6x).**
`rules/cycles.js#miss` pushes the `debt` row and *then* calls `hurtFor`, whose
`hurt` row toasts the cause. While `view/fx.js#toast` kept one line and the
newest fact won, the debt line was superseded within its own frame by the
heart line on every punishable cycle. The toast queue (§26.8) holds both and
shows them in order, so the favour count is read and the heart count follows
it about a second later. Neither push was reordered; the slot stopped
discarding one of them.

---

*(Section numbering jumps 20.5 -> 22 here. No §21 was ever written; every
downstream citation to §22 and later is to the number actually in this file,
so it is left as a gap rather than renumbered.)*

## 22. Tree regrowth: the seed, the plant verb and growth (Phase 15)

`docs/PLAN-phase15-trees.md` is the reasoning; these are the locked numbers.
`log` is the only fuel in the game (`data/world.js`'s own `trees` row says
so), so a player who fells every tree on the surface has quietly ended their
own run. This section is the way back.

### 22.1 The two tunables

| id | kind | base | unit | meaning |
|---|---|---|---|---|
| `treeGrowSecs` | value | **180** | s | accumulated *simulation* seconds a planted seed takes to become a tree |
| `seedYield` | value | **2** | units | seeds dropped when the last remaining trunk tile of a tree is felled |

**180 s and not 90.** `brandSecs` is 90 and is the game's existing unit of
"one long errand" (§11). A tree ought to cost more than one errand, and 180 s
is three eighths of a cycle-2 deadline (`deadlineSecs` 480), 3/7 of cycle 3's
420 and half of cycle 4's 360. So a seed planted in the first third of any
trial pays back inside that same trial, and planting mid-trial stays a real
move rather than a decorative one. It is still one row: if a grove turns out
to be built entirely between trials, the lever is here.

**`seedYield` is 2, and 2 is the smallest integer that compounds.** At 1 a fell
returns exactly the tree it took, so a grove can be sustained and never grown.
At 2 the rule reads in one sentence — fell one, plant two — and the grove
doubles every `treeGrowSecs` until the player's own hands are the limit. Where
that limit sits is arithmetic rather than taste: a tree is 3–5 trunk tiles at
`hard` 0.35 s each, so one fell-and-replant cycle costs about 6 s of attention
(1.4 s of swings at mean height 4, plus travel at `trees` `chance` 0.06 — one
tree per 16.7 columns — plus the pickups and the plants). A grove of G trees
therefore needs 6G seconds of attention per 180 s of growth, and saturates at
**G ≈ 30**. Raising the yield to 3 overshoots that ceiling in a single
generation and the surplus seeds simply sit in the player's pockets, which is
a bigger number meaning nothing. The ceiling is attention, not seeds, so
yielding 2 changes how fast the grove is *reached* and never where it *ends*.

**`seedYield` is a value, not a `chance`, and there is deliberately no
`seedChance` beside it.** A regrowth mechanic that sometimes gives you nothing
is a mechanic that sometimes silently ends the timber economy. If scarcity is
wanted later, the lever is `treeGrowSecs`.

**Time comes from `dt`, never from a wall clock** (invariant 10).
`rules/growth.js` accumulates the `dt` it is handed at the fixed 1/120 s
substep, so a seed takes 180 s of simulation time at 20 fps and at 240 fps
alike, and does not grow while the tab is in the background. `tools/check.mjs`
§8g asserts the transition at all eight framerates §12's hardness table
sweeps — 107 is in that list because a truncated per-tile byte once made
granite unmineable above 106 fps, and a timed transition is the same class of
bug one level up.

### 22.2 The `seed` form

```js
{ id:'seed', label:'SEED',
  size:2, massK:0.1, hudOrder:13,
  tags:[], subTags:['organic'],
  tile:{ solid:false, climb:false, hardK:0.05, roots:true } }
```

| key | value | why |
|---|---|---|
| `subTags` | `['organic']` | timber is the only substance that crosses, exactly the restriction `log`, `rung` and `brand` already use. `timber/seed` is the real pair; no substance row was spent (§15) |
| `massK` | `0.1` → **0.08 T** | the lightest thing in the game (`timber`'s `item.mass` 0.8 × `massK` 0.1). Mass conservation is not engaged: no recipe produces a seed, so there is no input to conserve against. Two seeds at `seedYield` 2 weigh 0.16 T against a `burden` of 40 |
| `solid` | `false` | you walk through a seedling. One that blocked movement would be a trap you planted for yourself |
| `climb` | `false` | one that could be climbed would be a free ladder rung at a tenth of a rung's mass |
| `hardK` | `0.05` → **0.0175 s** | near-instant, so a misplaced seed costs nothing to recover. `model/tiles.js#dropOf` gives the pair itself back for any placed form, so digging up a seedling returns the seed with no code |
| `tags` | `[]` | a seed is not fuel, ore, or anything a selector should find by accident. It is also what keeps `seed` off the furnace's `*/#fuel` `handFeed.from` and therefore clear of D12 |

**The form budget after this row** (§15's arithmetic, re-executed against the
real modules):

| state | `FORM.length` | `STRIDE` | `PACKABLE_MAX` | `PACKABLE_LIMIT` | guard LHS |
|---|---|---|---|---|---|
| after Phase 14a | 12 | 13 | 8 (`adamant`) | 18 | 117 of 255 |
| **after `seed`** | **13** | **14** | **8** | **17** | **126 of 255** |

`PACKABLE_MAX` did not move: `seed` admits `organic`, whose only member is
`timber`, which was already packable as native terrain. §15's standing
correction still holds — ordinals 9–17 are occupied by non-packable rows, so
appendable headroom for a *tile-capable* substance remains zero and a future
terrain substance must be *inserted* below ordinal 17.

### 22.3 The drop condition

When a **NATIVE** `timber` tile breaks, `rules/mining.js` drops
`eff('seedYield')` seeds iff neither the tile above nor the tile below is now
a NATIVE `timber` tile.

A trunk is a contiguous vertical run felled one tile at a time from either end
or from the middle outward, so the last tile standing is by definition the one
with no trunk above or below it. Two reads, no loop, no state, correct for
every felling order.

- **`formOf(byte) === NATIVE` is load-bearing.** A placed `timber/rung`
  reads `timber` through `subOf` exactly as a trunk does — only the form
  differs — so without it a player could peg rungs into a wall and mine them
  back out for free seeds.
- **`data/drops.js` cannot express this and must not be bent to try.** A
  `DROPS` row sees the substance and tier of the tile just broken and nothing
  else; "the last remaining trunk tile" is a fact about the column.
- **Fell a tree *completely*.** A player who fells three tiles of a 5-tall
  tree and wanders off gets nothing yet. That is correct — the seed is still
  in the two tiles still standing — and it is a reachable, confusing state
  worth a callout beat if one is ever wanted.
- **`rand()` ordering.** The seed spawn sits *after* the ordinary material
  drop and *before* the rare-trinket `DROPS` loop, so that roll keeps its
  exact position relative to the material drop. This changes what an existing
  seed produces downstream of the first tree felled in a run, which adding any
  new spawn to that branch must; invariant 7 requires that `newRun(s)` twice
  still match, and it does.
- **The yield is a draw count.** Each spawned seed consumes two `rand()`
  draws for its toss, so `seedYield` 2 consumes four where `seedYield` 1
  consumed two. Changing the row therefore changes the stream downstream of
  the first tree felled in a run, and a seed shared across the change does
  not replay. Nothing else about the ordering moves.

### 22.4 `tile.roots`: the plant verb

Planting is `cmd.place` on an armed `timber/seed` pair through the same
unified placement every other tile uses. There is no plant key, no plant verb
and no seed-specific branch in `rules/placement.js`. What there is is one
optional key on a form's `tile` block:

> **`tile.roots`** — *this form takes root.* Two consequences, read in two
> places:
>
> 1. **Placement.** A solid tile *directly below* satisfies this form's
>    backing requirement, in addition to the four satisfiers
>    `rules/placement.js#placeTile` already accepts (solid left, solid right,
>    solid above, climbable above or below). A seed dropped on open flat
>    ground has soil beneath it and air on all three other sides, and was
>    refused with `'IT NEEDS SOMETHING TO HANG FROM'` before this key existed
>    — correct for a ladder rung and exactly wrong for a seed.
> 2. **Growth.** `model/tiles.js#write.setByte` enters the tile in
>    `model/growth.js`'s ledger the moment it is written and removes it the
>    moment it is overwritten — the same single funnel, and the same argument,
>    §19's `digw.clear` already uses.

**It is a key on the row and not a sixth clause in the shared predicate.**
`solidAt(band, tx, ty + 1)` added unconditionally would let a `rung` be placed
standing on a floor with nothing beside it — a real change to how a ladder is
built, in the one function `CLAUDE.md` records wedging a player in their own
shaft — and would let a `block` be stacked on a floor with no wall to key
into. Gated on the form's own key, `rung`/`stair`/`block` placement is
**bit-identical**: none of the three carries `roots`, so the added term
short-circuits before the read. `tools/check.mjs` §8g asserts all 36
neighbourhoods × 4 tile-capable forms against an independently written copy of
the pre-Phase-15 predicate, including that a rung with only a floor beneath it
still refuses.

**A solid `roots` form is forbidden structurally.** `tools/content.mjs`
assertion 24: a form carrying `roots` must be `solid:false`. A solid tile that
needs nothing but a floor under it is a free-standing wall — stand on flat
ground and stack a tower upward one tile at a time, with no ladder and no
scaffold, which is "up is expensive" inverted. The failure would be silent
because it would *work*.

**A seed does not require soil specifically.** Any solid tile below will do.
"A seed needs earth" is thematically right and would be `solidAt` narrowed to
a `#bulk`-tagged substance — one clause and one refusal string away, and
deliberately deferred: it is a second content rule to explain, and the
interesting decision (where do I spend 180 seconds of growth) is not made more
interesting by it.

### 22.5 Growth

`model/growth.js` is a sparse `Map` of accumulated seconds, keyed
`b.ord * 0x1000000 + idx(b, tx, ty)` — verbatim `model/mining.js`'s own key,
because the two address the same coordinates. `model/fields.js` was considered
and rejected: a field *decays* by default and this *accumulates*, and a field
costs a dense `Float32Array(tw × th)` per band (~28 KB for the surface band) to
describe a mechanic with single-digit live instances.

`rules/growth.js` sits **immediately before `fields`** in
`shell/schedule.js#STEPS`, and inherits verbatim the "only so `fields last`
stays literally true" argument the old `tutorial before fields` pair carried.
It costs one frame of latency on `light`/`reveal` seeing a newly grown trunk,
on an event 180 seconds in the making.

**Height comes from `hash2`, never `rand()`.** A positional hash is
deterministic regardless of *when* the seed resolves; a stream draw is not —
two runs from one seed in which the player planted the same tile at different
times would consume `rand()` at different cursors and diverge. The range is
read off `data/world.js`'s own `trees` strata row (**[3, 5]**) rather than
re-literalled, so a planted tree is the same size as a wild one by
construction. §8g plants the same tile twice in one seed, once after a dig
that provably moved the `rand()` cursor, and requires the same height.

**A grown tree is not similar to a worldgen one — it is the same bytes.**
`resolve` writes `h` NATIVE tiles upward from the seed's own tile through
`model/tiles.js#write.set`, the identical call `rules/generate.js:293` makes.
The canopy, the chunk invalidation and the seam repaint are therefore free:
`view/paint.js#decorate` crowns it on the next repaint with no code. Nothing
regrows a tree the player did not plant — worldgen's `trees` row is untouched,
because a world that reforests itself removes the reason to carry a seed.

**No journal row when a tree finishes growing.** The tile appearing *is* the
event, and a notification for something 180 seconds downstream of any input
the player made is noise rather than feedback — the same reason §19 declines a
"vein exhausted" row.

### 22.6 The growth cue

Three discrete silhouettes — a **seed**, a **shoot**, a **sapling** — stepping
at **1/3** and **2/3** of `treeGrowSecs`, drawn in the canopy's own greens
(`vdC`/`vdB`/`vdA`) with the darkest wood tone for the seed itself.

Quantised for the reason §11's darkness quantises its alpha: at 8 px a tile
there are about six usable rows, so a continuous height would spend most of
180 s not visibly changing and then change by one pixel.

**It is an overlay and not a chunk bake**, for the reason §19's depletion cue
gives: a chunk canvas caches the *static rock texture* and a growth stage is a
*live condition*. `model/growth.js#write.add` bumps the epoch and never a
chunk version, so a sprite painted in `paintTile` would only ever be as fresh
as the last time something else in that chunk happened to invalidate it. The
rejected alternative was calling `write.touch` at each stage change so the
sprite could bake — legal and cheap, and rejected because a chunk repaint
triggered by something that is not a tile-byte change is exactly the coupling
`model/world.js`'s comments on `seen` and `light` argue against.

**It shares Phase 14c's pass.** `view/scene.js#drawLiveTiles` (formerly
`drawDepletion`) is one loop with two guarded cases. Two passes doing the same
shape of work would walk the visible tile window twice per frame for one
answer each; a third live per-tile cue joins it there rather than beside it.
The two cases are mutually exclusive by construction — depletion only fires on
a NATIVE `deposit` tile, growth only on a placed `roots` form.

The sprite draws strictly inside its own tile. A sapling poking into the air
above would read marginally better, and is not worth weakening the pixel-scope
assertion (`tests/visual.spec.js`: *the growth cue actually changes pixels, and
only on the tile that was planted*) that is the only proof the pass is doing
anything at all.

---

## 23. The feed verb and the LMB dispatch order (Phase 16a)

Locked here before it was written in code, per `CLAUDE.md`'s own convention.
The design is `docs/PLAN-phase16-interaction-model-v2.md` §5 D16-A and D16-B;
this section is the part of it that other code and other docs may rely on.

### 23.1 Any occupied slot arms

A click on an occupied slot in the Character tab's inventory grid or the
quickbar arms that exact `{sub, form}` pair into `shell/ui.js#ui.armedPlace`.
So does the matching digit key. **There is no form gate on either.** Before
Phase 16a both gates required `FORM[form].tile || form === rig || form ===
phial`, which made every ore, ingot, plate, brand and relic click-inert — a
silent, complete no-op — because the only thing an arm could feed into was
placement.

The two gates (`shell/main.js#applyUiIntents`'s click-to-arm branch and
`shell/input.js`'s digit-arm branch) are **identical by requirement**, not by
coincidence: `view/ui/quickbar.js#DIGITS`'s own "press 3 and the slot showing
3 cannot disagree" property is only true if the two ways of reaching a slot
accept the same slots.

Arming a pair that can neither be placed nor fed is legal and inert. Aiming
it at open ground and pressing LMB refuses through
`rules/placement.js#placeTile`'s existing `'THAT DOES NOT BUILD'`, which is
the same refusal a `log` or a `gravel` already gets (§19.2). One press, one
legible reason, no new string.

### 23.2 The four-rule LMB dispatch, decided once at pointerdown

`shell/input.js`'s `pointerdown` handler resolves LMB **once, at the instant
of the press**, and never re-evaluates it for the rest of a held press. That
is D-A's whole design (`docs/PLAN-phase12.md` §3): a press that decided
"place" never sets `cmd.mouse`, so mining cannot spuriously start on the tile
just placed, and a press that decided "feed" cannot become a mine without
releasing.

| # | condition | action | `aim.mode` |
|---|---|---|---|
| 1 | the armed pair is a `phial` | use the miracle | `place` |
| 2 | a machine is under the reticle, within its own `handFeed.reach` of the player's box, and it carries a `handFeed` block at all | **feed ONE unit into it** (or refuse, per §23.4) | `place` |
| 3 | something is armed and `tileAt(...) === AIR` | place it | `place` |
| 4 | otherwise | mine | `dig` |

Every rule but 4 additionally requires `aim.valid && aim.band`.

**An always-drawn HUD rect takes the press before any of the four rules**
(Phase 6o). `shell/input.js#onAlwaysOnUi` names the two controls drawn with no
panel open — the quickbar strip and the KEYS legend toggle — and a press inside
either routes to the UI intents, exactly as an open panel does. Until 6o it
named only the toggle, so a click on a quickbar cell fell through to rule 4 and
mined: §23.1's "any occupied slot arms" was true of the digit keys always and
of a click only while the Character tab happened to be open. Both rects are the
ones those widgets recorded in `view/ui/state.js#drawn`, so the hit area cannot
drift from what was painted. A press on an empty cell arms nothing and still
does not dig through the strip, which is what every control inside a panel
already does.

**A held rule-4 press also paints the dig queue** (§28.5). Nothing above
changes: the stroke is armed inside rule 4's own branch, so a press that
decided 1, 2 or 3 can never become one.

**Rule 2 sits above rule 3 deliberately**, and the precedent is
`shell/input.js`'s own RMB branch, which already puts "a machine is under the
reticle, so deconstruct" above "place": a machine under the reticle means the
machine. The stated cost is that a machine under the reticle with something
armed cannot be mined through — `z` clears the hand in one press, which is
the same mitigation D-A already accepted for rule 1.

Rule 2 does **not** consult reach in `model/machines.js#feedCheck`. Reach is a
fact about where the player is standing at the moment of the gesture, so it is
asked exactly once, in `shell/input.js`, where the gesture is. `feedCheck`
answers only "would this machine take this pair", which is what
`view/hud.js`'s build ghost must be able to ask about a machine the player has
not walked to yet.

**Rule 2 also does not consult `feedCheck` for whether *this* pair is
welcome** (`shell/input.js#feedTargetAt`): a reachable, hand-feedable machine
under the reticle is **always** the target, and whether this pair is welcome
is `handOne`'s question, downstream, asked once — which is exactly where its
answer needs to turn into the `'refused'` row the player actually sees.
Gating rule 2 itself on `feedCheck(...).ok` instead makes both of §23.4's
refusal strings unreachable from a real press, because the press falls
through to rule 3 (place) the moment the pair is wrong or the machine is
full — `.claude/brain/verification-gaps.md` records how this was found.
`tests/visual.spec.js`'s "REAL CLICK: clicking an ore slot arms it..." test
drives this exact case (a wrong pair, a real click, over a real machine) as
a permanent regression.

### 23.3 One unit per press

`cmd.feed` is **EDGE-triggered**, declared and cleared in
`shell/input.js#clearEdges()` in the same shape `cmd.place` already is. One
physical press moves **exactly one unit** from the pockets into the buffer.

Cycle 1 asks for 10 units (§18.4) and a furnace's ore cap is 8, so ten presses
is the price of the most consequential action in the game and one-per-press is
the rule that lets a player count what they gave. A hold at 120 Hz is what
made the automatic proximity drain unreadable in the first place.

**A successful feed does not clear the arm.** Ten units in a row is one
continuous action; the staleness sweep in `shell/main.js#applyIntents` clears
the arm on its own once the last unit is gone.

### 23.4 The refusal strings, and their order of precedence

`rules/machines.js#handOne` pushes a `'refused'` journal row carrying
`feedCheck`'s own `why`. There are exactly two strings and the order between
them is fixed:

| order | string | condition |
|---|---|---|
| 1 | `'IT DOES NOT WANT THAT'` | no selector in `def.handFeed.from` matches the pair — including a machine with no `handFeed` block at all |
| 2 | `'IT IS FULL'` | a selector matches, and `count(m, sel) >= capOf(def, sel)` |

Wrong material wins over no room: a player holding gravel at a full furnace is
told the furnace does not want gravel, which is the fact that matters, not
that a buffer they cannot fill is full.

There is deliberately **no third string for being out of reach.**
`shell/input.js` never dispatches a feed from out of reach — the press means
"mine" instead (rule 4) — so a reach refusal in `rules` would be unreachable
code claiming a precedence this table does not grant it.

**Both strings are reachable from a real LMB press**, per §23.2's amended rule
2: a reachable, hand-feedable machine under the reticle is always the target,
so `handOne`/`feedCheck` are always consulted and their refusal always reaches
the player, whatever is armed. Tested twice over — `tools/check.mjs` section
8i drives `handOne` directly (bypassing dispatch, to lock the strings and
their precedence in isolation) and `tests/visual.spec.js`'s "REAL CLICK:
clicking an ore slot arms it..." test drives the identical wrong-pair case
through a real `pointerdown` over a real machine, and additionally asserts
that nothing gets placed inside the machine's footprint as a side effect.

### 23.5 What Phase 16a did NOT change

`rules/machines.js#handFeed`, the automatic proximity drain, was **unchanged
and still unconditional** through 16a: standing within `handFeed.reach`
emptied the matching pockets into the machine at one unit per selector per
substep. Nothing in 16a removed anything. §23.6 is what changed that.

### 23.6 The proximity drain is opt-in (Phase 16b)

`ui.autoFeed`, `shell/ui.js`, **default `false`**, surfaced as the **AUTO
FEED** row directly under AUTO COLLECT in the Character tab. It is the exact
shape of `ui.autoCollect` (`docs/PLAN-phase12.md` §3 D-E/D-F) because it is
the same class of fact:

| | items | machines |
|---|---|---|
| the magnet | `ui.autoCollect` | `ui.autoFeed` |
| default | `false` | `false` |
| folded into | `cmd.collect`, `shell/main.js#step` | `cmd.autoFeed`, same place |
| read by | `rules/items.js#step(dt, cmd)` | `rules/machines.js#step(dt, cmd)` |
| the deliberate verb it replaced | hold `c` | click-arm, aim, LMB (§23.1–§23.3) |

**It is INPUT, not a presentation preference, so `newRun()` resets it** —
`shell/boot.js#newRun`'s teardown calls `setAutoFeed(false)` beside
`setAutoCollect(false)`. This is D13-A's answer applied unchanged, not a
second policy (D16-C requires exactly that): the flag decides whether
standing beside a machine spends `run.inv` into it, which moves burden, climb
speed, what a recipe can run, and — through
`rules/cycles.js#drainReceivers` — whether a trial gets paid. A toggle
surviving a restart would make two runs from one seed diverge on what the
player clicked before dying, which is invariant 8's determinism bug.

**`handFeed`'s body is byte-for-byte unchanged.** Only the call site is
gated. The `handFeed:{reach, from}` data block still means what it always
meant to *both* paths: how far "beside it" is, and which selectors a hand may
put in.

**Two guards written against the unconditional drain are kept, with only
their reasoning corrected**: `rules/cycles.js#SPAWN_GAP` (4 tiles between
spawn and the altar) and `tools/check.mjs`'s burden probe digging `+15` tiles
clear of it. Neither hazard is unconditional any more, but both are one click
from returning, and the altar's 4-tile gap is correct staging regardless
(§5's first beat is a walk).

---

## 24. Inventory slots and the pickup fill order (Phase 12c, revised 17i)

| tunable | value | unit | meaning |
|---|---|---|---|
| `invSlots` | 30 | slots | length of the main inventory grid; `run.mainSlots` at reset |
| `quickbarSlots` | 8 | slots | length of the quickbar, the tail of `run.inv` past `run.mainSlots` |

`run.inv` is one fixed-length array of `invSlots + quickbarSlots` entries and
the quickbar is its tail, so total capacity is 38 distinct pairs.

**A pickup merges first.** `model/run.js#write.collect` searches the whole
array for an existing stack of the exact pair before it allocates anything, so
one pair occupies one slot wherever that slot currently sits.

**A brand-new pair fills the quickbar first**, left to right, and reaches the
main grid only once all 8 cells are taken. Mined material therefore lands
under the digit keys and is usable with every panel shut. A player who wants a
different strip drags a pair there, and a drag is still the only thing that
reorders slots.

**A pickup with no stack and no free slot is refused.** `write.collect`
returns false, `rules/items.js#step` pushes a `'refused'` row reading
`INVENTORY FULL`, and the item stays on the ground, per invariant 5.

**Digit keys name cells 1 through 8.** `view/ui/quickbar.js#slotForDigit` is
bounded by `run.inv.length - run.mainSlots`, so `9` and `0` name no slot while
the strip is eight cells and pressing them arms nothing.

## 25. The crafting category row (Phase 17j)

| tab | id | what it lists |
|---|---|---|
| ALL | `all` | every hand recipe, unfiltered |
| RAW | `raw` | the fallback category |
| REFINED | `refined` | the output form carries the `refined` tag |
| TOOLS | `tools` | the output substance carries `item.tool` |
| PLACE | `placeables` | the output form carries a `tile` block |
| DIVINE | `divine` | the output substance is a relic or a miracle, and carries no `item.tool` |

**DIVINE is empty, and the tool clause is why.** `categoryOf` tests
`sub.item?.tool` (`view/ui/mainPanel.js:459`) before the relic tag
(`:460`), and `auger` — the one output in all 19 hand recipes whose
substance carries `tags:['relic']` (`data/recipes.js:329`) — also carries
`item.tool`, so it lands in TOOLS. Reordering the two clauses empties TOOLS
instead and is not the fix. The tab stays until a hand recipe makes a relic
or a miracle that is not a tool.

`ALL` is first and is therefore the default, because
`shell/ui.js#activeTab` falls back to the first row when nothing is stored.
It filters nothing and bypasses `view/ui/mainPanel.js#categoryOf` rather than
adding a sixth branch to it. The five real categories partition the list, so
ALL lists every hand recipe exactly once and lists exactly what the five list
between them.

**The row wraps.** A tab costs `core/font.js#textWidth(label) + 6` px, which
is 23 / 23 / 47 / 35 / 35 / 41 and 204 px in total. The crafting body is 232
px wide at the desktop buffer and 188 px at the 200 px base-buffer floor, so
the row runs one line on a desktop and two on a phone.
`view/ui/tabs.js#drawTabs` flows a tab that would pass its right edge onto the
next line and returns `h` as `TAB_H` per line used. A tab too wide for a line
of its own is still dropped rather than truncated, since drawn text is never
clipped.

### 25.1 The click decides the recipe (Phase 6u)

**A click on a recipe row queues its id, and `rules/crafting.js` makes THAT
row.** One field carries it: `shell/main.js#step` folds
`shell/ui.js#ui.craftQueue[0]` onto `cmd.craftId`, beside the `craft` hold it
already folds, the same way it folds a key and a preference into `dig` and
`collect`. `rules` reads an id as data and never imports `shell`.

| case | what happens |
|---|---|
| the head names an affordable row | that row, at its own `secs` |
| the head names an unaffordable row | nothing is made, the entry is kept, and `shell/main.js#tickCraftQueue` pushes ONE `'refused'` / `CANNOT AFFORD` journal row per stall |
| the head changes mid-craft | the bar restarts at 0 on the new row. Nothing is spent before `secs` is reached, so nothing is lost but the seconds |
| `craft` held with no id | the first affordable `HAND_RECIPES` row (`#choose`). No key binds this; the two harnesses drive it |

**Measured, before and after**, on `docs/PLAYTEST.md` finding 4's own case:
seed 1337, 12 `copper/ore` + 9 `timber/log` + 6 `stone/gravel` in the pockets,
a real click on the GEAR row. Before: one `furnace/rig` after **8.008 s**,
spending 12 ore and 6 logs. After: one `gear/rig` after **2.175 s**, spending
2 logs and 1 gravel, the ore untouched.

Declaration order in `data/recipes.js` no longer decides what a click produces.
It still decides the untargeted hold, and `tools/content.mjs` assertion 23
still proves no row shadows a later one —
docs/DEVELOPER_GUIDE.md#hand-recipe-declaration-order.

## 26. The HUD closeout (Phase 17e)

`docs/PLAN-wave5-closeout.md` §8. Five readouts and one tunable. Nothing
here changes a mechanic; every number is drawn from a `model` query that
already existed.

### 26.1 The TRIBUTE panel's batch row, and an aggregate that cannot lie

A cycle carrying a `batch` block (§18.10) draws one extra `view/ui/bar.js`
row under its demand rows, and that row counts towards the aggregate below
them.

| | |
|---|---|
| bar id | `tribute-batch` |
| value | `min(batchHave(), batch.n) / batch.n` |
| label | `<PAIR> IN m:ss`, abbreviated through `data/forms.js#shortLabelOf` when the full name plus its value would pass the viewport's midpoint |
| aggregate | `Σ min(have, n)` over the demand rows **plus** the clamped batch term, over `Σ n` plus `batch.n` |

**Clamped at `batch.n`, deliberately.** `batchHave()` saturates near that
value because `prunedCredits` discards surplus entries (§18.10), so a raw
"X delivered" readout would print a number smaller than the player handed
over. The clamped fraction is exact.

**The aggregate reads 100% only when `tributeMet()` is true.** Summing the
demand rows alone drew `100%` on an unpaid cycle 4 while the clock ran out
(`docs/REVIEW-wave5-17d.md` D2). The printed percentage is also floored at
99 short of completion, because `Math.round` reaches 100 from a fraction
under 1 once a trial asks for more than 200 units.

### 26.2 The miss tally

`run.misses` was drawn on the win screen and nowhere else. It now sits at the
foot of the TRIBUTE column, in the heart colour, **only once it is non-zero**,
and it survives the frame between trials where `run.tribute` is null. At one
miss it reads `MISSED 1 -- ONE MORE ENDS THIS`, because two misses end the run
(§18.6, `rules/cycles.js#miss`); it wraps to two lines where one would reach
the FAVOUR bars.

### 26.3 One urgency threshold, shared

| tunable | base | unit | read by |
|---|---|---|---|
| `urgentSecs` | 5 | s | `view/hud.js#urgentFlash`, the only reader |

A countdown flashes at 3 Hz — `((clock.t * 6) | 0) % 2` — while it has
`eff('urgentSecs')` or fewer seconds left. The boon stack has flashed on that
rule since Phase 4 and the tribute deadline now reads the same one, so the
HUD cannot come to mean two things by "nearly out". Derived from `clock.t`
and the seconds left; no `rand()` (invariant 7) and no frame counter.

### 26.4 Both end screens carry the same tally

`view/hud.js#tallyLines` builds two rows and `endScreen` draws them for the
win and the death alike:

```
<N> TRIALS PAID -- <F> FAVOUR
MISSES <M> -- DEPTH REACHED <D>M
```

`N` is `max(0, run.cycle - 1)`. A win leaves `run.cycle` one past the last
shipped row, so the same expression reads `CYCLES.length` there and §20.2's
win screen is unchanged pixel for pixel. `F` sums `run.favour` across gods;
`D` is `depthReached()`, the §12 datum both the gauge and placement legality
already use.

### 26.5 The Character tab's stat block scrolls

Of four declared stat rows the desktop buffer drew one and clipped the rest
at the panel's edge (`docs/FINDINGS.md` 16b.3). The equipped-trinket delta
lines and the stat rows are now one scroll region.

- **The mechanism is the inventory grid's, not a second one.** The region's
  rectangle goes into `view/ui/state.js#drawn.grids` under the id `stats`,
  which is what `shell/main.js#applyUiIntents` hit-tests a wheel notch
  against, and the offset lands in `f.ui.scroll['main:stats']`.
- **It records no slots.** There is nothing to click, drag or arm, and every
  click path in that dispatcher is keyed on a slot.
- **A 2 px thumb** marks the region whenever a line is off either end.
- **A fourth tab was the rejected alternative.** `CHARACTER`/`CRAFTING`/
  `LOGISTICS` cost 171 px of the 200 px floor's 188 px of content width, and
  `view/ui/tabs.js` drops a tab it cannot fit rather than truncating it, so
  the feature would be absent at the floor with nothing to say so.
- **The tab's content stops above the quickbar.** The panel covers the strip
  at the floor, and `shell/main.js#uiHitGrid` scans `drawn.grids` in draw
  order, so a grid reaching into the strip's rectangle would hand its wheel
  notches to a widget the player cannot see. The clamp is measured off the
  rectangle the quickbar drew and only bites where the two overlap in x.

### 26.6 The bottom line: a callout under the window, a toast over it

`view/hud.js` draws one line at the bottom of the screen — the toast at the
FRONT of the queue (§26.8), or the SPEC §5 beat's callout when there is
none.

- **It reserves its neighbours' rectangles.** The callout is centred and the
  quickbar is pinned right, so the two met only where the text was wide
  enough to run under the strip, which is the 200 px floor. Both the
  quickbar's grid rect and the `hints-toggle` panel rect are read back out of
  `drawn`, and the line lifts only where it actually overlaps one in x. The
  reserve above the quickbar is `view/ui/quickbar.js#HAND_GAP` (10 px) plus
  2 px of air, held whether or not a pair is armed, because the IN HAND line
  lives in that gap and is not part of the grid's rectangle.
- **A toast draws over the main panel and a callout under it.** Standing
  guidance loses to a window the player opened; a fact that just happened
  does not, or a refusal raised by a click inside the panel would be hidden
  by the panel that raised it.

### 26.7 The depth gauge measures the feet (Phase 6w)

`view/hud.js#depth` measured `player.y`, the TOP of the 16 px body, against
the datum — so a player standing on the spawn floor read **`+2M`** and one
eight tiles down a shaft read `6M` (`docs/PLAYTEST.md` B4). It measures
`player.y + PH`.

| | |
|---|---|
| datum | `worldY(bandOf(SPAWN_BAND), floorTy)`, **unchanged** |
| reading | `round((player.y + PH - datum) / ref.tile)` |
| `depthReached()` | `round((run.deepest + PH - datum) / ref.tile)`, floored at 0 |

**The datum did not move, and that is the constraint that shaped the fix.**
CLAUDE.md D9 anchors this gauge and `data/machines.js#cyclops_maw`'s
`minDepth:200` to one expression, and `model/run.js#placementCheck` reads it
unchanged. That check measures a TILE ROW — `worldY(band, ty) - datum` — so it
has no body height to add and needed no edit. The two agree on where 0 M is;
they differ only in what each measures against it, which is a tile in one case
and a pair of feet in the other.

`depthReached()` takes the same `+ PH` because `run.deepest` is the deepest
`player.y`. Two readings of the player's own depth differing by two tiles
would be worse than either.

### 26.8 The toast slot holds three and shows one (Phase 6x)

`view/fx.js#toast` kept exactly one row and let the newest fact win, so a
frame carrying two facts lost one. The measured case is the First Trial:
`rules/grants.js#step` awards the furnace and the cloud dock in the same
substep (§20.3), so `CRUDE FURNACE IS GRANTED` — the whole reward of §4 — was
overwritten inside its own frame and the player never saw it
(`docs/PLAYTEST.md` B3).

| | |
|---|---|
| held | 3 rows, oldest first; the FRONT is drawn |
| drained | front only, by `step(dt)`; a row expiring shifts the next one up |
| a repeat | matches on the text and refreshes that row rather than queueing |
| over the cap | drops the FRONT, which has already had its glance |
| handoff | anything waiting cuts the front row to **1.0 s** |

**The handoff is what keeps a queue from burying the newest fact**, which is
why the slot was single in the first place. A refusal arriving behind three
stale lines would be read late or not at all, so the newest row is on screen
within a second however many are queued. 1.0 s is one glance, about four short
words at 250 ms each.

**A repeat refreshes because eleven hand-feeds push eleven identical rows.**
`shell/notify.js#TEXT.tribute` names the pair rather than a running total, and
one unit moves per selector per substep, so ten ore is ten rows in ten
consecutive steps. Stacking those would be 35 s of one sentence.

**The banner keeps its single slot, deliberately.**
`shell/notify.js#BANNERS` maps exactly one journal kind to it (a paid trial)
and `shell/boot.js` raises the opening title; two of those cannot land in one
frame, so a banner queue would be machinery for a collision that cannot occur.
A banner is two lines across the middle of the screen, so two in a row would
hold the centre for five seconds and the second would read as though the first
had not happened.

Measured: the paid First Trial holds `['CRUDE FURNACE IS GRANTED', 'THE CLOUD
DOCK IS GRANTED']` with the furnace drawn and the god's own line on the banner
beside it; a miss holds the debt line and the heart line in that order (§20.5).

## 27. The save slot (Phase 6h)

`src/shell/save.js` exports `save()`, `load(newRun)`, `hasSave()`,
`clearSave()` and `loadError`. It wires no input and draws nothing. Wave 6 U1
retires `CLAUDE.md`'s no-`localStorage` convention for it, accepting that the
game may fail in a sandboxed embed.

### 27.1 The payload is the seed plus what the player changed

Wave 6 U2. A run is bit-reproducible from its seed (invariant 7), so the
terrain is not stored. `load()` regenerates the world from the seed and replays
the edits over it. Serialising the three bands' `mat` arrays instead is ~1.3 MB
raw and was rejected.

Two `localStorage` keys, one slot.

| key | holds |
|---|---|
| `mythos-factory/save-head` | `{ v, world, content, seed }`, ~58 bytes |
| `mythos-factory/save` | the header's four fields plus everything below |

| field | shape | restored through |
|---|---|---|
| `cursor` | one int32, where the run's `rand()` stream stands | `core/rng.js#seedRng`, last of all |
| `run` | the whole plain record | one `model/run.js#write` call per field |
| `player` | position, velocity and the nine presentation flags, band as an id | `player.js#write.band` / `move` / `vel` / `set` |
| `bands[]` | per band `{ id, gen, edits, work, seen }` | see 27.4 |
| `growth[]` | `{ band, tx, ty, secs }` | `growth.js#write.plant` then `add` |
| `items[]` | `{ band, x, y, vx, vy, sub, form }` | `items.js#write.spawn` |
| `machines[]` | `{ band, id, tx, ty, buf, prog, made, charges, fire, running, torque, turn }` | `machines.js#write.place` and its per-field writers |
| `segments[]` | `{ a, b, t, dir, load }`, hubs by index into `machines[]` | `segments.js#write.link` / `carrier` / `load` |
| `boons[]` | `{ id, left }` | `boons.js#write.grant` |

`edits` is a flat `[tx, ty, byte, ...]` per band and `work` is a flat
`[tx, ty, secs, ...]`. `seen` is one bit per tile, base64 over the packed
bitset, indexed by `model/world.js#idx`.

**The edit set is a diff, not a journal.** Nothing records which tiles the
player changed, so `save()` regenerates the band from the seed and compares.
The measured cost is 25 ms at the three shipped bands (53,248 tiles), against
permanent per-write bookkeeping and a hook in `model/tiles.js#write.setByte`
for the alternative. A diff cannot drift from the world it describes.

Two things must not leak out of that regeneration, and both are held and put
back in a `finally`.

- **The RNG cursor.** `seedRng` replaces the stream, so `rng.next` is saved and
  restored. Without it a save rewinds the run's randomness to boot. `save()`
  reads `core/rng.js#cursor()` before the regenerate for the same reason.
- **The modifier store.** `shell/boot.js#newRun` clears `model/mods.js` before
  it generates and `rules/generate.js` reads `eff('hollowOre')`, so the
  baseline is taken with mods cleared and the rows are re-added by source
  afterwards.

The scratch band records carry `ord + 64`, because `generate` writes through
`model/tiles.js#write.setByte`, which addresses the dig and growth ledgers by a
key prefixed with the band ordinal. Every other field is shared with the live
band, which is safe because `generate` writes `mat` and `ver` and nothing else.

### 27.2 What is deliberately not stored

| state | why |
|---|---|
| band `mat` arrays | U2. Regenerated from the seed. |
| band `light` | `rules/light.js` recomputes it within a frame. |
| `model/fields.js` heat | Decays by default and is re-established by a running machine. |
| `model/mods.js` rows | `rules/trinkets.js` and `rules/boons.js` rebuild them from `run.equipped` and `boons.active` every step, so storing them would double them for one frame. |
| `run.mainSlots`, `run.maxHearts`, `run.known` | No writer can set them and `write.reset` already produces the same value. `known` is seeded from every `HAND_RECIPES` id and nothing in `src/` adds to it. A recipe-unlock source would need a `write.learn` and a line here. |
| `run.invuln` | Bounded by `invulnSecs` and expires unobserved. |
| item `rest` and `age` | Both are re-established by the first `rules/items.js` step. Support is a tile query re-asked every frame and `age` only gates the pickup magnet delay. |
| `meta` | Page-scoped, not run-scoped. `newRun()` does not reset it, so a load does not disturb it, and `model/run.js#RUN_SCHEMA.favour` already records that `meta` has no save. |
| `shell/ui.js` session state | Open panels, the armed pair, AUTO COLLECT and AUTO FEED. `newRun()` resets all of it (D13-A), and the save follows. |
| `clock.t` and the camera | `shell/main.js` owns both. A caller that boots straight into a loaded run re-clamps the camera itself. |

**The `rand()` cursor IS stored** (`cursor`, one int32), and it is the one row
that argues with invariant 7 rather than following from it. Without it a loaded
run keeps the world it was saved with and draws a different future from it, and
reloading the same slot always replays the same stream — so no bug found after
a load could be reported against its seed. It costs one accessor in
`core/rng.js`: the whole state of mulberry32 is its own seed word, so
`mulberry(state)` continues the stream exactly and the cursor needs neither a
draw counter nor a fast-forward.

Measured over a scripted 1,200 frames, a save, a fresh process, a load and 600
more frames of the same script: every band's `mat` and `seen`, the whole `run`
record, items, machines, segments, the dig and growth ledgers, boons and mods
are identical, and one field differs — `player.digging`, which
`shell/main.js:163` blinks off `clock.t` and which this table already says is
not run state.

### 27.3 Four versions, and the last two cover the generator

| field | is | checked in | catches |
|---|---|---|---|
| `v` | a literal, 2 | `hasSave()` | the payload shape changing |
| `world` | FNV-1a of `JSON.stringify(BANDS)` | `hasSave()` | a band dimension, origin or strata change, which invalidates every stored tile coordinate |
| `content` | FNV-1a of the `SUB`, `FORM` and `MACH` id lists | `hasSave()` | an ordinal coming to mean another row |
| `gen` | FNV-1a of each band's freshly generated `mat` | `load()`, after `newRun()` | `rules/generate.js` itself changing |

`gen` needs a world to exist, so it is the one check `hasSave()` cannot make.
`load()` calls `newRun(seed)` first and checks it then. A mismatch discards the
save and returns false, which leaves a clean run of the same seed rather than
edits replayed onto ground that moved.

**Every field is validated before `newRun()` runs, and the validation is what
makes the apply unable to throw.** The apply writes through a dozen model
writers and not one of them checks its argument, so anything a `typeof` gate
let past landed in the world: a `seen` string of `'!!!!'` reached `atob` and
threw out of the restore with band 0's tile edits already written. Rolling that
back is not on offer, because `run` has no whole-record setter — which is why
`applyRun` exists at all — so the payload is proved usable instead. The fog
bitset is decoded during validation and the bytes are handed to `applyBand` on
the row, so there is one `atob` per band and the check cannot disagree with the
use.

What is checked: every array is an array, every number is finite, every tile
coordinate is inside its own band, every tile byte is 0..255, `made >= charges`,
a segment's two hub indices are inside the machine list, and `misses` and
`tutorialBeat` are integers under 10,000 because both are restored by repeated
one-way increments and an edited 1e9 would hang the boot.

Which ids are resolved: the ones this module or `model` itself dereferences —
machine ids through `data/machines.js#M`, boon ids through `data/boons.js#BOON`,
band ids through `BANDS`, substance and form ordinals as indices, buffer keys
through `model/items.js#parseKey`, and the live demand's cycle id through
`data/cycles.js#CYCLE`, which `model/run.js#write.tribute` reads to bound the
batch ledger. Ids that only `rules` looks up, and looks up optionally — a
recipe in `run.craftRecipe`, a god in `run.favour`, the draft ids in
`run.offer` — are checked as strings and no further. An unknown one is ignored
downstream, and refusing a whole run over a renamed recipe is the worse trade.
`CONTENT_SIG` does not cover the recipe, god or cycle tables, so those three
can change under a save with no hash moving.

**`hasSave()` is cheap enough for a menu to ask every frame.** It parses the
~58-byte header key and never reads the body. Both signatures are computed once
at import, since both tables are frozen.

**A header from another build is a third state, and `slotState()` names it**
(Phase 6z). It returns `'ok'`, `'stale'` or `'none'` off the one header parse,
and `hasSave()` is `slotState() === 'ok'`. `hasSave()` being false for a stale
header is what made `load()`'s own `STALE SAVE` unreachable from a menu:
CONTINUE was dead, `load()` was never called, and another build's save
presented as an empty slot. The menu now draws `STALE SAVE` on the dead row
(§30.1). The row stays dead — the payload really is unusable — and only the
word changes.

### 27.4 The round-trip contract

`load(newRun)` calls `newRun` itself, so a payload can never be applied to a
world it did not generate and invariant 8 still holds with persistence in the
game. `newRun` is an argument rather than an import, which keeps `shell/save.js`
importing no other `shell` module and leaves `shell/boot.js` and
`shell/main.js` free to import it without a cycle. Pass
`shell/boot.js#newRun`.

**The caller's half of that contract is checked, not assumed.** `load()`
compares `run.seed` against the stored seed after `newRun` returns, and a
caller that generated another world gets `WRONG SEED` with the slot untouched.
It used to get the `gen` mismatch that a wrong world inevitably causes, which
deleted the save — one slip in the caller destroyed the player's only slot for
a bug that was never the save's. A wrong seed is a programming error, so it
also goes to `console.warn`; the same check catches a `newRun` that allocated
no bands at all, which used to return **true** and half-apply.

Order within `load()`:

1. `newRun(seed)`, then the seed check, then the `gen` check per band.
2. Per band, the tile edits, then the dig ledger, then the fog bitset.
   **The ledgers come after the edits**, because `write.setByte` clears the dig
   entry and plants the growth entry for every coordinate it writes.
3. The growth ledger, after every band's edits for the same reason. `plant`
   then `add` restores the saved total exactly.
4. Items. The list is cleared first, because `newRun` plants the starting pick
   and the stored list already says whether it is still lying there.
5. Machines, then segments, which name their hubs by index into the machine
   list. `charges` and `made` are restored by adding the lifetime total through
   `write.charge` and spending the difference back down through
   `write.spendCharge`, since `charge` raises both together.
6. Boons, then `run`, then the player.
7. The `rand()` cursor, last of all, so nothing above can leave the stream
   anywhere but where the save found it.

Within `run`, `write.arrival` runs before `write.tick`, so a director placement
from earlier in the run stamps `t = 0` and reads as long finished rather than
replaying its rise and its shaft of light. `write.tick` runs before
`write.tribute`, so the batch ledger prunes against the right `run.t`.
`write.hurt` is the only writer of `hearts` and it sets `dead` and `deathCause`
too, so a stored 0 restores the death with it.

`run.inv` is position-significant and `write.collect` picks the slot by its own
fill order, so each stack is collected and then swapped into the slot it was
saved in. Working upward, the slots below the target already hold their final
pair, so `collect` cannot have taken one of them and the swap can only displace
an empty slot or one still to be filled.

### 27.5 Measured

One run at the three shipped bands, seed 1337, a 19-tile shaft, 3 part-worked
tiles, a planted seed, 3 dropped items, 2 hubs, 1 segment, 1 boon, 1 trinket
equipped.

| quantity | value |
|---|---|
| body | 11,267 bytes, and 21 more once `cursor` was added |
| header | 58 bytes |
| fog bitsets | 8,886 bytes, 79% of the body |
| tile edits | 158 bytes for 19 edits |
| dig ledger | 83 bytes for 3 tiles |
| `run` | 944 bytes |
| `save()` | 23.8 ms, of which 25 ms is the baseline regenerate |
| `load()` | 16.3 ms |

The fog bitsets are the whole growth curve. They are one bit per tile, so
1,024-wide bands (wave 6 U3) take them to 53 KB packed and ~71 KB base64, and
the baseline regenerate to roughly 200 ms.

### 27.6 Storage is allowed to fail

`localStorage` throws in private-mode and sandboxed contexts rather than
returning null, so every call goes through a guarded helper and a failure reads
as "no save" rather than breaking the run. Verified against storage that is
absent, throwing on every call, refusing every write, and holding garbage:
`hasSave()` and `load()` are false, `save()` is false where the write is
refused, nothing throws, and 40 real `step()` calls run afterwards.

**The header is the claim that a complete body exists**, so `save()` removes it
first and writes it last, and clears both keys on any failure. A refused write
therefore takes the previous slot with it. That is the deliberate trade: the
alternative order kept a good header in front of a body the failed write had
already overwritten, and a menu then offered CONTINUE forever and it never did
anything. `hasSave()` reads the header alone, so it cannot prove a body; when
`load()` finds the claim false — no body, an unparseable body, a body whose
seed disagrees with the header, or any validation fault — it drops the header,
which is what stops the offer. The body's bytes stay for a post-mortem and the
next `save()` overwrites them.

### 27.7 Every refusal is named

`load()` has no journal at boot, so it reports why it refused on `loadError`
and returns false. An object rather than an exported scalar, because module
bindings are read-only for importers.

| `loadError.reason` | means | the slot |
|---|---|---|
| `null` | the load succeeded | kept |
| `NO SAVE` | no header, or storage is unreadable | untouched |
| `STALE SAVE` | the header's `v`, `world` or `content` is not this build's | kept, and `hasSave()` is already false; `slotState()` returns `'stale'` |
| `CORRUPT SAVE: <field>` | the body is missing, torn, or failed validation at that field path | the header is dropped |
| `WRONG SEED` | the caller's `newRun` built another world, or none | **kept** |
| `WORLD MOVED` | a band's `gen` hash mismatches, so the generator changed | cleared |

Only `WORLD MOVED` discards a valid save, and it discards one that describes
ground that no longer exists. The player is left standing in a clean run of the
same seed.

### 27.8 When the slot is written (Phase 6o)

**There is no save key, and the trigger is the page going away.** `save()`
costs about 25 ms of baseline regenerate (§27.5), which is three dropped frames
wherever it lands, so `shell/main.js#persist` is hung on the two events where
there is no next frame to drop: `visibilitychange` to `hidden`, which fires on
a reload, a tab switch and a close alike, with `pagehide` behind it for the
browsers that skip it. Both firing on one reload costs a second identical
write and nothing else.

| condition | what happens to the slot |
|---|---|
| a live run, menu closed | written |
| `run.dead` or `run.won` | **cleared** |
| the menu stands over a run in progress | **written** |
| the menu stands over a run nobody has played | untouched |
| no band allocated yet | untouched |
| `?test=1` | no triggers are installed at all |

**A dead or won run clears the slot rather than writing it.** Health is five
hearts with no respawn (invariant 6), and a slot that resumes the run from
before the fall is a respawn with extra steps. Leaving the previous slot in
place would be the same thing one save older.

**A menu over a run nobody has played persists nothing**, because that run is
either the one `boot()` generated behind the menu or the one CONTINUE just
refused, and neither is worth the player's only slot (§30.5).

**A menu opened from inside a run does persist** (Phase 6z). The run behind it
is the player's, `Escape` is the one key that leaves it, and losing a run to
that key would make the menu a trap. The predicate is `run.t > 0` and not
alive-and-well: a generated run and a refused load both sit at `t = 0` because
the menu freezes `step()`, so the two cases separate without a flag to keep in
sync (§30.6).

**The triggers are not installed under `?test=1`.** There is no RAF loop there
and the page is a harness: a hidden-page autosave would overwrite the slot a
save test had just written, in the gap between the write and the reload it is
measuring. `tests/save.spec.js` drives `save()` itself for that reason.

## 28. The dig queue (Phase 6i)

Locked with `docs/PLAN-wave6.md` U5. Holding the dig button and sweeping
already mined continuously — `cmd.mouse` latches at `pointerdown` and `aim`
follows the pointer every frame — so what the queue adds is **not having to
hold it**. A drag marks tiles; the player then mines marked tiles inside
`eff('reach')`, nearest first, with no button held. The queue **commits to one
tile and finishes it** before asking which is nearest again (§28.6).

**There is no pathfinding and no auto-walk.** A mark out of reach persists and
resumes when the player walks into range, and the player does the walking. That
is the premise at player scale: the currency is standing presence and
attention, the same thing D10 says about the crank. A queue that fetched the
player to the ore would make mining something you watch.

`src/model/digqueue.js` owns the marked set and the queries;
`src/rules/mining.js` owns the decision to swing.

### 28.1 The one number

| tunable | base | unit | what it bounds |
|---|---|---|---|
| `digQueueMax` | 256 | tiles | marks the set holds at once |

256 is a 16x16 block, about eight times the ~32 tiles `eff('reach')` covers
from one standing position, so marking well past where you stand is the normal
use and hitting the cap is not. It bounds two things at once: the O(n) nearest
query `rules/mining.js` runs once per substep, and the answer to "did I mean to
paint the whole screen".

`eff('reach')` (25.6 px, 3.2 tiles) is the gate on what gets mined, unchanged
and not a second number. Distance is measured **centre to centre** — the
player's centre against the tile's own middle — so the queue reaches exactly as
far as hand aim does.

### 28.2 What the model owns

| call | answers |
|---|---|
| `write.mark(b, tx, ty)` | `'ok'`, `'full'` at the cap, `'nothing'` for air, the world edge or an already-marked tile |
| `write.unmark(b, tx, ty)` | drops one mark |
| `write.prune()` | drops every stale mark; returns how many |
| `write.commit(b, tx, ty)` | records the mark `rules/mining.js` is working; coordinates with no live mark clear it instead |
| `write.abandon()` | gives up the committed target, leaving the mark |
| `write.clearAll()` | drops all of them, commitment included |
| `markedAt(b, tx, ty)` | is there a live mark here |
| `nearestWithin(px, py, reach)` | the nearest live mark within `reach` of a world point, or null |
| `committedWithin(px, py, reach)` | the committed target, if it is still live and still within `reach`, or null |
| `withinReach(m, px, py, reach)` | is one mark within `reach` of a world point |
| `queued()` | the live map, for `view` to draw |
| `activeCount()`, `isFull()` | size, and whether the cap is reached |

Marks are keyed the way `model/mining.js` and `model/growth.js` key theirs:
the band ordinal prefixing the band-local tile index, because two bands may be
marked at once. A mark record carries its band, its tile coordinates and **the
byte it was marked on**.

**A stale mark is collected lazily, not cleared from
`model/tiles.js#write.setByte`.** That funnel is where `model/mining.js` and
`model/growth.js` both hang their clears, and the argument D14-E makes there
holds here too — a mark whose tile changed is not about anything any more. It
is not used here because the change a mark cares about is overwhelmingly the
queue's own success: a marked tile becoming air is the normal outcome rather
than an anomaly, so the funnel would fire on the one case that needs no repair.
The byte on the record answers the same question locally. Reads skip a stale
mark and `write.prune` collects it, called once per substep from
`rules/mining.js#step`.

**Reads never mutate.** `view` draws the marks, `view` may not write to
`model`, and the epoch assertion in `npm run check` proves it — so pruning is a
`write` and is never folded into the query that notices the staleness.

**Ties in `nearestWithin` break on the key, ascending**, which makes the answer
a function of the marked set rather than of the order it was painted in.

### 28.3 What the rules own

- **A hand-aimed swing always wins.** While the dig button is held,
  `rules/mining.js` swings at the reticle and the queue waits, even if the
  reticle is on air, and the commitment is abandoned rather than fought over.
  The marks and the partial work stay; only the choice is given up. The queue
  is what happens when nothing else is asking.
- **Both routes go through one `swing`**, so a queued tile costs exactly the
  seconds a hand-swung one costs at any framerate (invariant 10). There is no
  second progress store and no second rate; `model/mining.js`'s float-seconds
  ledger is still the only one.
- **Mined material becomes a falling item** (invariant 5), by the same line.
  Nothing is credited to the pockets.
- **A tile this pick cannot break loses its mark.** A tier-gated or unmineable
  tile pushes the same rate-limited `'refused'` journal row
  (`TOO HARD FOR THIS PICK`, `TIER_REFUSAL_GAP` 1.0 s) a manual swing pushes,
  and the mark is then dropped. Leaving it would make the nearest query hand
  back the same impossible tile every substep forever — a stalled queue, and a
  mark that reads as merely deferred when the HUD draws it. A 256-tile drag
  across granite therefore says it once and empties, rather than 256 times.
- **The queue does not move the reticle.** `model/aim.js` is where the player
  is pointing; a queued swing leaves it alone.

There is **no separate queue step** in `src/shell/schedule.js`. Choosing a
target and swinging at it are one decision, and a sibling `rules` module would
need `rules/mining.js#swing`, which siblings may not import. The pair the queue
rests on is `player before mining`, argued there: reach is measured from this
frame's position, so a player who walks into range of a deferred mark starts
breaking it on the frame they arrive.

### 28.4 A mark does not survive a restart

Invariant 8. Two mechanisms, and the first is the belt:

1. `write.clearAll()` is what `shell/boot.js#newRun` calls, beside
   `digw.clearAll()` and `growthw.clearAll()` (wired in 6o). It drops the
   committed target with the marks, because a commitment names one of them.
   The second mechanism below makes this line's absence **unobservable**, which
   is exactly why it is written down here and commented there.
2. A mark holds its **band record**, and `newRun` replaces every band record
   (`model/world.js#write.clear`, then `allocate` per row). So a mark of a
   previous run fails `bands[ord] === m.band` and is stale by construction,
   and `rules/mining.js` collects it on the first substep of the new run.

The same identity test is what stops the committed target surviving a restart,
because the commitment holds the mark record rather than its coordinates: a
commitment whose band was reallocated reads as suspended and is dropped by the
prune that collects its mark.

The second exists because the first is not enough on its own reasoning: the
same seed regenerates the same bytes at the same coordinates, so a byte test
alone would find every mark of the previous run perfectly valid. That is the
determinism bug `docs/FINDINGS.md` (8d, #2) records happening to `segments`.

### 28.5 The drag-paint gesture (Phase 6o)

Phase 6i landed the model and the rules with no input at all
(`docs/PLAN-wave6.md` §3, S2). This is the gesture 6o wired, and it lives
entirely in `shell/input.js`.

**A drag that started on rule 4 paints; one that started on rules 1–3 never
does.** Which rule fired is decided once at `pointerdown` (§23.2) and the
stroke is armed in rule 4's own branch, so a press meaning "place" or "feed"
cannot become a stroke by moving the mouse.

**The press alone marks nothing.** A stroke begins on the first `pointermove`
that leaves the tile the press landed on, and that first line includes the
press tile — so a sweep is contiguous and an ordinary mining click leaves no
mark behind on the tile it is already breaking.

**The tile comes from the pointer, not from the reticle.** `model/aim.js` is
clamped to `eff('reach')` (`rules/mining.js#aimAtWorld`) and U5's whole point
is marking well past where you stand, so `shell/input.js` resolves the tile
from the pointer's own world position through `bandAt`/`tileX`/`tileY`.

**Consecutive samples are joined by a straight line, both ends included.** A
fast drag reports positions several tiles apart, and a gap in a painted run
reads as dropped input rather than as a stroke. A sample in another band ends
the line and marks only the tile it landed on.

**The cap's refusal is one journal row per stroke.** `write.mark` returning
`'full'` pushes `'refused'` with `DIG QUEUE FULL` at that tile — no `model`
module imports `model/journal.js`, so the refusal is the caller's — and a
latch holds it until the stroke ends, for the reason §28.3 gives for granite: a
256-tile drag into a full queue says it once.

**The stroke ends on `pointerup`, on `pointerleave`, or on window blur**, which
is the same "losing focus must release everything" rule `shell/input.js` states
for the keyboard.

The hand still wins while the button is down (§28.3). A drag therefore mines at
the reticle and paints at the pointer at the same time, and the queue takes the
marks over the moment the button is released.

### 28.6 The queue commits to one tile (Phase 6i-2)

`nearestWithin` is asked **only when nothing is committed**. This is the
hysteresis §23.2's pointerdown dispatch already applies to itself: decide once,
then stop re-deciding every frame. Asking every substep does not work, and the
number is 6i's own -- at `eff('walk')` (60 px/s) a column is the nearest mark
for about 8 px of travel, 0.13 s against soil's 0.50 s hardness, so a player
who paints a seam and walks along it finishes nothing.

**Four things end a commitment**, and `committedWithin` answers all four from
the record rather than needing a caller to notice them:

| what happened | how it is seen | the mark |
|---|---|---|
| the tile broke, or was placed over | the byte on the record (`stale`) | gone, pruned |
| the mark was dropped | the map no longer holds that record (`live`) | gone |
| a restart replaced the band | the band record on the record (`stale`) | gone, invariant 8 |
| the player walked out of range | `reach`, measured centre to centre | **kept, suspended** |

Only the last is a suspension. The target goes back to being an ordinary mark
and is picked up again by whichever query reaches it next, which is U5's
"a mark out of reach persists and resumes when the player walks into range"
applied to the one being worked. A hand-aimed swing abandons the commitment
the same way (§28.3).

**The committed target is `model` state, not a `rules` scalar,** for
`model/aim.js`'s one reason: `view` draws which tile is being worked and `view`
may not import `rules`. It is written only by `rules/mining.js`, exactly as the
aim reticle is. `view` reads `committedWithin` with the same
`playerCentre()`/`eff('reach')` pair the step passes, so a pass that drew a
target as live while the step had already suspended it is not expressible.

**One tile at a time is the visible consequence.** Two marks in reach break one
after the other -- the first at its stated hardness, the second starting from
zero once the first is gone -- rather than both creeping toward completion
together. What it does not buy is a tile finished during a full-speed walk
across a seam. That is bounded by reach geometry rather than by the retarget
rule, and `docs/FINDINGS.md` (phase 6i-2) holds the arithmetic.

### 28.7 What `view` draws (Phase 6n)

`view/hud.js#digMarks`, in world space, immediately BEFORE the aim reticle and
the build ghosts so those stay on top of it. Three states, and telling them
apart is the whole feature.

| state | test | glyph | tone | px on an 8 px tile |
|---|---|---|---|---|
| worked | `committedWithin(playerCentre(), eff('reach'))` names this tile | the X inside a 1 px frame | `ui` | 48 |
| in reach | centre-to-centre distance <= `eff('reach')` | the X | `ui` | 22 |
| deferred | beyond it | two pixels of each of the X's four ends | `uiDim` | 16 |

**Every mark is drawn over a shadow of itself one row lower**, in `uiShade`
(Phase 6z). That is the tone `core/font.js#drawText` already uses against the
same problem — a 1 px figure drawn straight onto rendered world with nothing
behind it — and it is what makes a diagonal read on ground of any tone: the
light pixels carry on unlit rock, the dark ones carry on lit grass. Shadows go
down in their own pass first, so one can never land on top of a mark pixel, and
the lowest falls on the tile's last row and therefore never leaves the tile.

**The unshadowed deferred state did not read at all.** Measured over the four
deferred tiles of the `dig-marks` scene at the desktop buffer, against the same
tiles with the queue cleared:

| state | 6n | 6z |
|---|---|---|
| worked | 40 px, mean \|ΔL\| 92 | 48 px, mean 93 |
| in reach | 12 px, mean 80 | 22 px, mean 92 |
| deferred | **4 px, mean 27** | **16 px, mean 69** |

Phase 6n's four single tips were indistinguishable from the grass dither even
at 6x. The deferred state still carries the lowest mean contrast of the three,
which is the ordering the feature wants. On unlit rock the deferred mark
measures 16 px at mean 69 as well — the light half carries where the shadow
cannot, which is the whole reason a shadow works.

**Density and tone carry the read, and alpha does not.** 16, 22 and 48 opaque
pixels are three states at a glance. The same ladder drawn at 0.5 / 0.7 / 1.0
alpha lost the deferred state entirely over grass, measured at 7x on the spawn
shelf.

**An X, because the other two world overlays are not one.** `reticle` draws
corner elbows and `drawFootprintGhost` fills the tile; three overlays that can
land on one tile in one frame must not share a shape.

**Deferred reads as waiting rather than refused.** The same glyph gone sparse
on the STATE tone, never the heart colour: a mark out of reach resumes when the
player walks over (§28.3), so it is not an error. `uiDim` already means
"inactive, waiting" at every other site in `view/hud.js`.

**Reach is measured once and handed to both reads.** `committedWithin` and
`withinReach` take `reach` as a parameter rather than reading `eff` themselves
(§28.6), so this pass is passed the same value the step measures with.
`model/digqueue.js#withinReach` is the per-mark predicate, added in 6z: the HUD
mirrored that module's private `d2` until then, which `docs/FINDINGS.md` (6n)
recorded.

**A stale mark is skipped, never cleared.** Reads never mutate (§28.2), so the
draw asks `markedAt` and leaves the pruning to `rules/mining.js#step`.

## 29. Named debug scenarios (Phase 6j)

Locked with `docs/PLAN-wave6.md` U6. A **scenario** is a named diorama applied
**after** `newRun()`: it carves tiles, places machines, links segments, fills
buffers and pockets and arms a cycle, on a world already generated from its
seed. `src/data/scenarios.js` is the frozen table; `src/rules/scenarios.js`
applies one. The debug mode the scenarios make legible is documented in
`docs/DEVELOPER_GUIDE.md`, not here — this section owns the schema and the
numbers.

### 29.1 The one rule the whole section rests on

**A scenario is applied on top of a clean run, never instead of one**
(invariant 8). `apply(id)` is one call, immediately after `newRun()`, and there
is no second code path through boot. A scenario consumes no `rand()` draws
either (invariant 7): every coordinate is derived from `spawnTx` and `floorTy`,
so the same seed still produces the same terrain under the same diorama.

### 29.2 The row schema

| key | shape | meaning |
|---|---|---|
| `id` | string | `?scenario=<id>` and the menu's debug list both name it |
| `name` | string | what the menu draws |
| `note` | string | one line saying what the scenario is **for** |
| `band` | band id | the band every coordinate below defaults to |
| `cycle` | 1..`CYCLES.length` | written to `run.cycle`, live tribute cleared |
| `grant` | [machine id] | appended to `run.granted` |
| `chart` | [band id] | appended to `run.charted` |
| `favour` | `{ [godId]: int }` | added to `run.favour` |
| `carve` | `[{ dx, dy, w, h, band? }]` | tile rects set to AIR |
| `tiles` | `[{ dx, dy, w, h, sub, form, band? }]` | tile rects set to a packed pair |
| `machines` | `[{ id, dx, dy, band?, buf?, charges? }]` | `dx`/`dy` is the footprint's top-left tile |
| `segments` | `[[i, j]]` | indices into this row's own `machines` |
| `items` | `[{ sub, form, n, dx, dy, band? }]` | `n` falling items at that tile's centre |
| `give` | `[{ sub, form, n }]` | straight into `run.inv` |

**The coordinate datum.** `dx` is tiles right of the **spawn** band's own
`spawnTx`; `dy` is tiles below the **named** band's own `floorTy`, so `dy:0` is
that band's first solid row and `dy:-1` the air above it. One column datum
serves all three bands because all three carry `tile:8` (§18.2), which
`tools/content.mjs` asserts rather than assumes — so a cross-band chain is
vertical by construction.

**Surface columns stay inside `dx` -9..+9.** That is `rules/generate.js#SHELF`'s
guaranteed-flat spawn shelf and the only stretch where `floorTy` really is the
ground row.

**Every row carries a pick.** A fixture that needs the developer to remember
the one lying at spawn is a fixture that wastes the first ten seconds of every
use, and `belt-line`'s own belt drags that pick into the furnace pit.

### 29.3 Why the writes are `model` writes

`rules/scenarios.js` imports no other `rules` module — the sibling ban, section
0 of `npm run check`. So machines go in through `model/machines.js#write.place`,
the director route `rules/cycles.js#ensureAltarPlaced` already uses, and tiles
through `model/tiles.js#write.set`/`#clear`.

**The cost, and where it is paid.** `model/run.js#placementCheck` never runs, so
a row could stand a machine where a player could not build it. The band gate and
the `minDepth` gate are therefore re-derived at build time by
`tools/content.mjs` assertion 27, which also proves every id resolves, every
pair is holdable, every buffer entry is consumed by some recipe on that row, and
every segment is inside the smaller hub's own `hub.reach`. Footing and the
clear-path sweep are questions about live tiles after the carve, so they are
not linted: `model/segments.js#linkCheck` asks the path question at apply time
and journals its refusal, and footing is proved by driving each scenario.

### 29.4 The shipped table

| id | what it stands up | verified by |
|---|---|---|
| `winch` | one 88 px vertical segment, two hubs, a gear, a crank, 4 `copper/ore` in the carrier | 10 s at the crank lifts the carrier 34 px; by 30 s it is at `t = 1` and the haul is released |
| `belt-line` | a fuelled belt on the flat feeding a furnace sunk in a 2-row pit | 4 ore leave the belt in 1 s, 4 charges spent; 8 ore + 2 logs become 2 `copper/ingot` in the pit |
| `cycle2` | cycle 2 armed, cycle 1's rewards paid, 3 `copper/plate` + 2 hubs + crank + gear held (33.7 T of a 40 T cap) | `run.tribute.id` is `first-delivery` with 480 s on the clock |
| `cycle3` | cycle 3 armed, both halves of the demand held (26.5 T) | `run.tribute.id` is `grey-eyed-tithe` |
| `ascent` | the whole three-segment chain to the Cloud Dock, with a crank at each stage and a rung ladder beside it | all three carriers rise; 3 plates delivered at the dock pay cycle 2 and advance `run.cycle` to 3 |

**`winch`'s two measured geometry facts**, both of which read as arbitrary and
are not:

- **the drivetrain stands on the spawn side of the hub.** With the crank past
  the shaft, the walk to it crosses the open mouth and the player falls in
  before they ever turn it.
- **the cargo loads in the left column.** An arriving haul is released at the
  `x` it was loaded at, and the right column is the open mouth — cargo loaded
  there is carried to the top and falls straight back down the hole.

**`winch`'s climb rate is 3.4 px/s under its 4 T of ore**, measured, which is
4.5 px/s empty by the same arithmetic: one crank through one gear is
`1.5 x (1 - 0.06) = 1.41` drive against a vertical carrier's `segBase` of 1.0
(§17.8). That is the cost of ascension, not a stall.

### 29.5 The ascent, stage by stage

Anchors are footprint centres (§17.5). The span is 240 px from the surface
ground line (world y 480) to the astral ground line (world y 240), of which the
middle 80 px is astral's own 10-row stone slab.

| stage | from | to | px | through |
|---|---|---|---|---|
| 1 | surface ground, y 472 | y 384 | 88 | open air, upper hub on a placed `stone/block` platform |
| 2 | y 384 | astral y 296 | 88 | the slab, into a carved pocket |
| 3 | astral y 296 | the dock, y 236 | 60 | astral air |

**Each stage's high anchor is the next stage's low anchor**, so a haul released
at the top of one stage lands inside the next carrier's own box and the chain
hands off with no code that knows about chains. Astral row 39 is carved because
it is the one slab row no headframe exemption covers (§17.6).

## 30. The main menu (Phase 6l)

`docs/PLAN-wave6.md` request 2. `src/view/ui/menu.js` draws it, canvas-drawn
per `CLAUDE.md` D2: `R()`, the 5x7 bitmap font, integer pixels, no `fillText`,
no DOM. It reports the rectangles it drew and hit-tests nothing. Phase 6l wired
no input (`docs/PLAN-wave6.md` §3 S2); §30.5 is the boot state, the navigation
and the dispatch 6o added over it.

### 30.1 Four pages

| page | rows, in order | ids |
|---|---|---|
| `root` | NEW RUN, SEED, CONTINUE, CONTROLS, SETTINGS, DEBUG | `new`, `seed`, `continue`, `controls`, `settings`, `debug` |
| `root`, mid-run | RESUME first, then the six above | `resume`, then as above |
| `controls` | none; the shortcuts table, plus BACK | `back` |
| `settings` | six toggles, plus BACK | `set-grid`, `set-chunks`, `set-debug`, `set-collect`, `set-feed`, `set-hints`, `back` |
| `debug` | one row per `data/scenarios.js#SCENARIOS`, plus BACK | `scenario-<id>`, `back` |

`root` carries the wordmark and the tagline; a sub-page spends those lines on
content and takes its heading from the panel title. BACK is the **last** row
index on every sub-page and is drawn in the footer, so the cursor reaches it by
moving past the content and a click reaches the same id.

**CONTINUE is gated on `hasSave`, and states why when it is dead.** A dim row
reading `NO SAVE` is drawn and recorded with `live:false`; a caller must not
dispatch it. The row is not hidden, because a menu that silently lacks an
option teaches nothing (D17-B). **A header written by another build reads
`STALE SAVE`** off `ui.menu.stale` (§27.3), because an absent slot and an
unusable one are different events.

**A refused load names its reason.** `ui.menu.notice` carries
`shell/save.js#loadError.reason` verbatim — §27.7's five strings — and the menu
draws it in `uiAmber`, wrapped, under a rule. `NO SAVE` and `CORRUPT SAVE:
bands[0].edits` are different events and the player is told which. 6o widened
the field to every refusal the boot path can raise, on the same terms: a
`?scenario=` naming no row parks `NO SCENARIO: <id>` and a `?seed=` that is not
a number parks `BAD SEED: <text>` (§30.5). The field is a refusal reason, not
specifically the save's.

The SETTINGS page shows only what `frameCtx` already carries: `f.flags`'s
`showGrid`/`showChunks`/`showDebug` and `f.ui`'s
`autoCollect`/`autoFeed`/`hintsOpen`. **MUTE is deliberately absent** —
`shell/audio.js#audio.muted` is not in the frame context and a mirror for it in
`view` would be a second copy of the truth (`docs/FINDINGS.md`).

The DEBUG page says out loud what debug mode is, which was the undocumented
half of request 8: `h` toggles `flags.showDebug` and `t`/`b`/`k`/`y`/`p` do
nothing until it is on.

### 30.2 The state shape

`src/shell/ui.js#ui.menu`, a fact about the session like every other field in
that file. `view` reads it through `shell/main.js#frameCtx` and never writes it.

| field | shape | meaning |
|---|---|---|
| `open` | bool | is the menu standing |
| `page` | `'root'`\|`'controls'`\|`'settings'`\|`'debug'` | which page |
| `index` | int | the focused row, counted over the page **currently drawn** |
| `scroll` | int | the CONTROLS list's **page index**, not a line offset |
| `seed` | string | digits typed into the SEED field; `''` means random |
| `seedFocus` | bool | is the SEED field capturing keys |
| `hasSave` | bool | `shell/save.js#slotState()` is `'ok'` |
| `stale` | bool | `slotState()` is `'stale'` — another build's header |
| `inRun` | bool | a run in progress stands behind the menu (§30.6) |
| `confirm` | string\|null | the one row taken once and waiting to be taken again |
| `notice` | string\|null | a mirror of `loadError.reason` |

`hasSave`, `stale` and `notice` are mirrors because **storage is a device**:
`view` may not reach `localStorage`, so `shell` answers the question once and
parks the answer. `inRun` is a mirror for the same reason one layer down —
`view` reads the world only through the frame context. Accessors: `openMenu`,
`closeMenu`, `menuPage`, `menuFocus`, `menuMove`, `menuScrollTo`,
`setMenuSeed`, `setMenuSeedFocus`, `setMenuSave`, `setMenuStale`,
`setMenuInRun`, `setMenuConfirm`, `setMenuNotice`. `menuMove` and
`menuScrollTo` take the count they clamp against, because only the drawn record
knows it.

`view/ui/state.js#drawn.menu` is what was painted, or `null`:
`{ page, rows:[{id,x,y,w,h,live,focused,label}], keys:[{id,keys,label,x,y,w,h}],
focus, scroll, pages, notice }`. The record carries its own `page`, so a
dispatcher cannot act on a CONTROLS row while the DEBUG page is showing.

### 30.3 The keymap has one declaration

`src/shell/ui.js#KEYMAP`, a frozen array of `{ when, debug?, rows }` whose rows
are `{ id, codes, keys, label, hold? }`. `codes` holds the lowercased `e.key`
values `shell/input.js` compares, `keys` is the display string, `id` is the verb
a dispatcher binds.

It lives in `shell` because a binding is a device fact, and it reaches `view`
without an illegal import because `ui.keymap` references it and `frameCtx`
already hands `ui` to every render. `shell/input.js` imports `KEYMAP` directly.
**There is no second list.** A shortcuts page hand-copied from
`shell/input.js`'s prose header would have drifted from it the first time a
letter moved.

**What 6o did with this table, and what it did not.** The menu's four verbs
are dispatched off their own rows: `shell/input.js#MENU_BIND` is built at
import from the rows whose `id` is `menuMove`, `menuPage`, `menuSelect` or
`menuBack`, so the CONTROLS page and the handler that obeys it cannot disagree
about which key moves the cursor. **Every other verb in `shell/input.js` still
dispatches on an `if (key === 'x')` literal**, so for those the table and the
handler remain two statements of one fact and can drift. Finishing it needs a
machine-readable context per group — the `when` strings are display prose, and
`escape`, `r`, `a` and the digits each mean different things in the menu, on
foot, under the map and under a draft — which is a refactor of every branch of
that file and was deliberately not landed beside the rest of 6o.
`docs/FINDINGS.md` (6o) carries the interim net: a `tools/check.mjs` assertion
that every single-key literal in `shell/input.js` appears in some row's
`codes`.

### 30.4 It survives the 200 px floor

`core/canvas.js#resize` clamps the base buffer at 200x180 and that is a desktop
condition. Every page is placed by a layout pass over measured text (D8), never
from a hardcoded origin.

- a row label **wraps** rather than overrunning its frame.
  `data/scenarios.js`'s longest trial name measures 185 px against the 184 px
  of content the floor affords.
- the shortcuts table flows into as many columns as the width really affords
  (two at 640x400, one at the floor) and **pages** when it runs out of height —
  50 lines against about 18, so three pages at the floor and one at the desktop
  size. The panel keeps its full height while paging, so the frame does not
  jump under the cursor.
- degradation order inside a list panel, last dropped first and dropped whole:
  the page's blurb, then the focused row's note, then the refusal notice. Half
  a sentence reads as a rendering fault.

`tests/visual.spec.js` asserts the geometry rather than only photographing it:
every drawn row lies inside the buffer at both sizes with exactly one focused,
and every `KEYMAP` id is drawn exactly once across the CONTROLS page's pages.
Dropping one column of the table fails that second assertion by 16 bindings.

### 30.5 Boot, navigation and dispatch (Phase 6o)

**The world stands behind the menu rather than after it.** `boot()` generates a
run in the order `shell/boot.js`'s header locks and the menu is opened over the
result, so there is one boot path rather than two, `view/scene.js` always has a
world to draw under the wash, and NEW RUN is the same `newRun()` call a restart
already makes. The cost is one worldgen that a CONTINUE then throws away, which
is about 25 ms against the load's own 16 ms.

**The menu is the default boot state and a URL that names a world is the
exception.**

| URL | boots into | seed |
|---|---|---|
| `/` | the menu, `root` page | random, behind the menu |
| `/?test=1` | a live run, **no menu** | 1337 |
| `/?seed=<int>` | a live run, no menu | the integer |
| `/?scenario=<id>` | the diorama, no menu | `?seed=` if given, else 1337 |
| `/?scenario=<unknown>` | the menu, `debug` page, `NO SCENARIO: <id>` | 1337 |
| `/?seed=<not a number>` | the menu, `root` page, `BAD SEED: <text>` | random |
| a headless import | a live run, no menu | random |

`?test=1` must reach a live run without passing through the menu, and that is
the load-bearing row: `shell/main.js#installTestHook` exposes `__mf.newRun`,
which starts a run directly, and every one of the ~148 screenshot baselines
photographs a scene rather than a menu. The menu tests open the menu
themselves through `shell/ui.js`'s accessors. A **headless** import has no
`location` and no player at all — `tools/check.mjs` stands in a `document` and
drives `step()` itself — so the menu, which freezes `step()`, must not open in
front of it.

**The menu freezes the run.** `shell/main.js#step` and `#applyIntents` both
return while `ui.menu.open`, the same guard `flags.showMap` and `run.won`
already have and in the same place, so the pause is a fact about `step()` and
not something only the RAF loop honours. `clock.t` does not advance, so a run
started after ten minutes on the CONTROLS page starts at t = 0.

**`newRun()` deliberately does not close the menu.** `ui.menu` is session
state, not run state, and `shell/save.js#load` calls `newRun` while the menu is
still standing precisely so a refusal can be drawn on it (§27.7). `shell` closes
the menu itself once a row has been taken and succeeded.

**Navigation.** The menu claims the whole keyboard above everything, the draft
modal included, and swallows what it does not recognise. The four verbs come
from `KEYMAP` (§30.3): `menuMove` W/S and the up/down arrows, `menuPage` A/D and
the left/right arrows, `menuSelect` ENTER or SPACE, `menuBack` ESC. ESC is back
**then** play — a sub-page returns to the root, and the root closes the menu
into the run already standing behind it. The SEED field captures keys above the
verbs once ENTER has been taken on the SEED row, accepts digits only, holds ten
of them, and is left by ENTER or ESC. A key with ctrl, cmd or alt held passes
through untouched, so reload still reloads.

**The pointer.** A press inside a recorded row's rect takes that row; a press
on a dead row (CONTINUE with no save) or on the wash does nothing at all rather
than reaching the world under the menu. The rects are hit-tested in the screen
space `drawn` records in, and the record's own `page` is checked against the
live one, so a press cannot take a CONTROLS row while DEBUG is showing.

**The dispatch**, `shell/main.js#applyMenuIntents`, by row id:

| id | consequence |
|---|---|
| `resume` | the menu closes. Drawn only mid-run (§30.6) |
| `new` | `newRun(<seed field>)`, camera snapped, menu closed |
| `seed` | the SEED field takes the keyboard |
| `continue` | `load(newRun)`; on success the menu closes, on refusal the reason is parked and `hasSave` re-mirrored |
| `controls`, `settings`, `debug` | that page |
| `back` | the `root` page |
| `set-*` | the matching `flags` or `ui` toggle, per `SETTING` in `shell/main.js` |
| `scenario-<id>` | `newRun(<seed field> or 1337)`, then `rules/scenarios.js#apply(id)` |

`ui.menu.hasSave`, `ui.menu.stale` and `ui.menu.inRun` are re-mirrored on every
frame the menu stands, which is affordable because `shell/save.js#slotState()`
parses a 58-byte header and never reads the body (§27.3) and `inRun` is three
field reads.

### 30.6 Escape escalates, and the menu is its last step (Phase 6z)

`Escape` opens the menu **only when nothing else claims the key.** The order,
stated once in `shell/input.js`'s Escape branch and once as the `KEYMAP` group
`WITH NOTHING ELSE OPEN`:

| what is standing | Escape means |
|---|---|
| a raised draft | nothing at all. An un-taken permanent gift must not be losable to a reflex keypress, and this is the one place Escape is deliberately inert |
| the CRAFTING search field | blur the field, then pop the panel under it |
| the map | leave the mode |
| a panel | pop exactly the top entry of the stack |
| an armed pair or link endpoint | cancel it, panel or no panel |
| nothing | **open the menu** |

**A press takes exactly one step.** Whether a panel was open and whether
anything was armed are both read before anything is cleared, so the press that
closes a panel does only that and the menu needs a second press. Escape inside
the menu is BACK, THEN PLAY (§30.5), so once nothing else is standing the two
are a toggle.

**Escape rather than a free letter**, because the escalation is already what
the key means at five sites and a sixth binding would be a second way out of
one thing. The cost, stated: a player who wants the menu while a panel is open
presses it twice.

**Opening the menu mid-run freezes the run and the camera.** Both fall out of
§30.5's existing guards — `step()` returns on `ui.menu.open` before it ticks
`clock.t` or eases the camera — and nothing was added for it. Measured over a
live RAF page: 1.5 s on the CONTROLS page advanced `run.t` by 0 and moved
`cam.x`/`cam.y` by 0.

**Two rows mean something new mid-run, so the root page gains a third.**

- **RESUME**, first, live, and drawn **only** while a run is in progress. The
  row the cursor starts on has to be the one that changes nothing, or a reflex
  ENTER on a menu opened mid-run destroys the run. With nothing played there is
  nothing to resume and the boot page is unchanged, which is also why the
  committed `menu-root` baselines did not move.
- **NEW RUN mid-run abandons the run behind the menu.** It is the same
  `newRun()` call it always was; what is new is that the run it replaces is
  somebody's.
- **CONTINUE mid-run drops that run and loads the slot.** The slot is whatever
  was last persisted and never the current run, since a menu standing over a
  played run writes on the way out rather than on the way in (§27.8). With no
  save it stays dead, as before.

**A row that would discard the run in progress asks twice.** The first press
records the row in `ui.menu.confirm` and the row draws `CONFIRM?` in `uiAmber`
beside its own note; only a second press on the same row goes through. Any
other row taken clears it, as does changing page and closing the menu. The row
is the confirmation — no modal, and no second owner of the keyboard. `new`,
`continue` and every `scenario-<id>` are on that list; a scenario row is a
`newRun()` with a diorama on top.

**A run in progress is `run.t > 0`, and is not remembered.** `boot()` generates
a world behind the menu and a refused CONTINUE leaves a clean run of the stored
seed, and both sit at `t = 0` because the menu freezes `step()`. So the
predicate is derived every frame in `shell/main.js#inRun`, read by three
callers — the `ui.menu.inRun` mirror, the confirmation gate and `persist()` —
rather than being a flag set by whoever opened the menu. A dead or won run is
not in progress: there is nothing to go back to.

**The pointer reaches all of it.** RESUME and a confirming row are ordinary
recorded rows with `id` and `live`, so `shell/input.js` hit-tests and
dispatches them through the one path §30.5 already describes.

## 31. The overview map's projection (Phase 6f)

`view/overview.js` fits the world's width by default and scrolls the vertical
axis (its own header records why: fitting the height collapsed the world to a
111 px strip). At 128 tiles the widest level that fits is **zoom 4**, 4 screen
pixels per tile, and the whole width is on screen.

At **1,024 tiles** no level fits. The world is 8,192 px wide against a 609 px
map body, and the coarsest level in `MAP_ZOOM` is one screen pixel per tile —
1,024 px of map. `docs/PLAN-horizontal-chunks-SCOPE.md` §3.8 raises this as a
design question and deliberately does not answer it.

### 31.1 The decision

**One screen pixel per tile is the floor, so the overview is depth-complete and
width-windowed.** `MAP_ZOOM[0]` stops being a fallback for an absurdly narrow
viewport and becomes the projection: the map shows every row of the world's
depth and a window of its width, and the window's position is drawn.

| | at 128 tiles, zoom 4 | at 1,024 tiles, zoom 1 |
|---|---|---|
| of the width, on screen | 1,024 of 1,024 px — **all of it** | 4,872 of 8,192 px — **609 of 1,024 columns, 59%** |
| of the depth, on screen | 774 of 3,328 px, 23% | 3,096 of 3,328 px — **387 of 416 rows, 93%** |

Three arguments, in the order they bind.

1. **A level below one pixel per tile is a resampling, and this mode's
   invariant forbids one.** The overview may never draw an unseen tile — it is
   a map assembled from memory, not an X-ray, and worldgen spends real effort
   making a hollow a discovery. A pixel covering four tiles has to choose: drop
   the tiles it cannot show, and a one-tile shaft the player dug disappears
   from the map of their own work; or take the block's colour from a sample,
   and a sample may be a tile they have never seen. The first is a map that
   lies by omission about the player's own excavation, the second is a fog
   leak. Neither is better than not fitting.
2. **Cost.** A full-world pixel map at 1,024 tiles reads about 426,000 tiles
   per frame, eight times the 52,000 the viewport cull in `drawTerrain` was
   written to avoid.
3. **The axis.** `docs/DESIGN.md`'s thesis is that the interesting axis is
   vertical ("depth band = act"), and depth is the axis a floor of one pixel
   per tile still shows whole. At 1,024 x 416 tiles the world becomes wider
   than it is tall and the constrained axis flips; the projection keeps the
   axis the game is about.

**Rejected, and recorded so it is not re-argued.** A coverage view — one pixel
per N tiles, reading "how much of this world have I touched" rather than which
tile is which — is a *different widget* from a projection of the tile grid, and
it could be added beside this one without breaking either. It is not the
overview, because the overview's every layer (ore, piles, machines, the chain
and its gaps) is a statement about a tile.

### 31.2 The extent ribbon

The affordance §3.8 says is missing is not a zoom-to-fit but an answer to
"which slice am I looking at". The band ruler on the right edge answers it for
depth, down to the numeral. `view/overview.js#extentRibbon` is its horizontal
twin:

- **A scrollbar, two rows tall, along the bottom edge of the map body.** A dim
  track the full width of the body stands for the world's width; a lit thumb
  stands for the window. No words — "which part of a whole" is the one question
  a scrollbar answers without any.
- **Drawn only when the width does not fit.** A thumb spanning its whole track
  has never once been wrong, and it would cost the body two rows to say so. At
  128 tiles it is therefore absent at the default zoom and present at zoom 8,
  which is the same case 1,024 tiles makes the default.
- **Both rects are recorded** into `view/ui/state.js#drawn` as `map-extent`
  (the track) and `map-extent-window` (the thumb), each carrying its own world
  range as `wx0`/`wx1` in world pixels, the way `view/ui/ruler.js` records
  `wy0`/`wy1`. Neither records a `wy0`, so nothing that hit-tests for a band
  segment can mistake a ribbon for one. No `shell` dispatch reads them yet; a
  press on the map body is a drag.

### 31.3 Measured

On this machine, at 1280x800 (a 640x400 base buffer, a 609x387 map body), seed
1337, every band revealed, at the default layer set:

| zoom | window, in tiles | map frame |
|---|---|---|
| 8 | 76 x 48 | 0.88 ms |
| 4 | 152 x 97 | 1.24 ms |
| 2 | 305 x 194 | 1.66 ms |
| 1 | 609 x 387, clamped to each band's 128 columns | **2.8 ms** |

The per-tile slope is **0.054 microseconds** (zoom 1 against zoom 2, which
differ by 126 rows of 128 columns), so the same zoom-1 frame at 1,024 tiles wide
projects to about **13 ms** — the map freezes the run, so that is a draw cost
and not a simulation one. It was 20 ms before `inkOf`, the per-byte
lookup table that resolves a tile's terrain colour, its ore tag and its ore
mark colour once per packed byte instead of once per tile; the ORE layer alone
was 1.5 ms of a 3.9 ms frame and is now 0.9 of 2.5. The table is a complete
memo rather than a cache with a policy: `model/tiles.js#rowOf` is a pure
function of the byte and there are 256 of them.
