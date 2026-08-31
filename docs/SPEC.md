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
