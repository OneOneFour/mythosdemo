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
| world width | **1024 px = 128 tiles**, fixed, independent of viewport |
| chunk size | 16x16 tiles = 128x128 px |
| storage | `Uint8Array` material id + `Uint8Array` damage, per chunk |

World coordinates are absolute and never depend on `innerWidth`. The camera
windows onto them. Resizing the window changes only the camera, never the world
— this is the single biggest departure from the mockup.

**Rendering.** Each chunk paints to its own offscreen canvas using the mockup's
painting functions (`noiseFill`, `walk`, hash-jittered edges). A dig marks its
chunk dirty and only that chunk repaints: 128x128 px instead of 1024x2520, i.e.
~1/1500th of a full bake. The look is inherited; whether it *survives* being cut
into chunks is a visual question only a human can answer.

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
placed as tiles, climbable at 30 px/s — half walk speed. Down is free, up is
half speed and costs material.

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

Gentle by design. The refinement and throughput quotas escalate from cycle 2
onward; cycle 1 only has to teach that the gods ask and the player answers.
The furnace arrives as the cycle-1 reward, which means minute two ends on
"gods give machines" rather than on a timer.

## 5. First two minutes — beat sheet

Each beat teaches exactly one thing. The gravity thesis lands before any
machine exists.

| t | beat | teaches |
|---|---|---|
| 0:00–0:12 | Wake chained at a cliff face. Chain snaps. Only left/right respond. | walk |
| 0:12–0:30 | Stock pickaxe planted in the soil. Walk into it to take it. A lighter soil seam sits underfoot. | dig, hold-to-break |
| 0:30–1:00 | Dig down 5 tiles. A copper vein is guaranteed directly below spawn. Mine 6 copper — **the ore falls to the bottom of your own shaft** rather than into a backpack. | the thesis: down is free, and you just used it |
| 1:00–1:20 | You are in a 5-tile hole and a 1-tile hop will not clear it. Cut a diagonal stair out, or fell the olive tree for a ladder. Ascent takes ~4x the descent. | up is expensive, felt not told |
| 1:20–1:40 | Sky darkens a notch. Clouds part, a shaft of light lands on the surface, an altar rises. **First Trial: deliver 10 raw copper.** | the gods ask |
| 1:40–2:00 | Deliver. The altar gifts a crude furnace. Place it **at the bottom of the shaft**, under the vein, and ore now falls into it for free. | gods give machines; gravity-fed production |

The trap is deliberate: a player who places the furnace on the *surface* must
haul ore up by hand. Nothing punishes them yet — cycle 1 has no clock — but
they will feel the asymmetry, and cycle 2 has a deadline.

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

## 9. Encumbrance, light and tool tiers

Locked with Phase 1 of `docs/BUILD_PLAN.md`. `CLAUDE.md` §"Resolved
decisions" D3/D4 is the reasoning; this is the numbers.

| tunable | value | unit | meaning |
|---|---|---|---|
| `burden` | 40 | talents | hard carry cap |
| `burdenSoft` | 0.75 | x | fraction of `burden` where climb falloff starts |
| `burdenClimbFloor` | 0.40 | x | climb-speed multiplier at the hard cap |
| `trinketSlots` | 3 | slots | length of `run.equipped` |
| `lightMax` | 15 | levels | daylight, and the ceiling any emitter can reach |
| `lightFalloffAir` | 1 | levels | lost per tile of open air the light BFS crosses |
| `lightFalloffRock` | 3 | levels | lost per tile of solid rock the light BFS crosses |
| `brandSecs` | 90 | s | one lit `timber/brand` burns this long |
| `toolTier` | 1.0 | x, scoped `substance` | bends `tile.tier` gating |
| `tossUp` | 50 | px/s | upward toss on a newly dropped item (drop verb only) |
| `tossSpread` | 12 | px/s | horizontal scatter on the same drop |

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
| `daedalan` | 2 `copper/plate` + 4 `timber/log` | 2 `copper/stair` | 6.0 |

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

Encumbrance (D3/D4) gates ASCENT only: on a ladder, descending is always
`eff('climb') x climbK`, at any burden. Ascending is that same speed, scaled
by burden fraction (1.0 up to `burdenSoft`, linear down to
`burdenClimbFloor` at the hard cap), refused outright at/over the hard cap
(`rules/player.js`) — the same refusal covers a ground/ladder hop and
(`rules/lift.js`) boarding a lift stage going up. A pickup that would cross
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
| `brazier` | 1x1 | 4 `timber/log` + 2 `stone/gravel` | level 12, `whileRunning:true` | honest-fuel recipe (`out:[]`, banks a charge), same shape the lift and belt already use; lit for as long as the buffer holds fuel |
| `hearth` | 2x2 | 2 `copper/plate` (**provisional** — design wants this in the essence tier, which does not exist yet; reprice when it lands) | level `'max'` (tracks `eff('lightMax')`) | no fuel, never expires; an `in:{}, secs:Infinity` recipe keeps `m.running` true purely so the existing fire-glow look renders, no interpreter change |

Both are in `STARTING_MACHINES` (`src/data/machines.js`... `src/data/boons.js`)
for testability, same precedent as `press`/`belt_r`/`belt_l` — no director
exists yet to gate them behind a boon.

The starting kit (`src/shell/boot.js`) plants one `timber/brand` beside the
stock pickaxe, on the opposite side of spawn, inside the same flat shelf.
`run.brandLeft` (new `RUN_SCHEMA` field, `src/model/run.js` — see
`docs/FINDINGS.md` for why this phase touched that file) auto-relights from
the pockets the instant it reaches zero, with no separate "light your torch"
verb.

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

**Recipe-ordering collision, same shape as `peg_rungs`/`kindle` (Phase 2a).**
`data/recipes.js#auger` and `#daedalan` share identical input KEYS
(`copper/plate`, `timber/log`) at the same plate count and different log
counts (1 vs 4). `daedalan` is declared first (the stronger requirement), so
holding 4+ logs always yields a stair; holding 1-3 falls through to the
auger. See `docs/FINDINGS.md`.

**Engine cost, stated per ARCHITECTURE §3.** Two new interpreter keys:
`mine` (`rules/machines.js`) and `minDepth` (`rules/placement.js`). No
machine name appears in `rules/machines.js`; no machine or substance name
appears in `src/view/`.

Tile-byte headroom: adding the `auger` relic substance is the 10th
substance row, dropping headroom from 14 to 13 substances still allowed
before the tile-id byte overflows (`src/data/forms.js`'s guard).
