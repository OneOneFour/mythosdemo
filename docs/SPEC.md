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

## 13. Buildable machine costs (Phase 3)

**SUPERSEDED by section 15.** This section is kept as the historical record
of Phase 3's own reasoning (the numbers below are unchanged, and still exactly
what section 15's held items cost to build) — but "cost at placement" itself
is gone, reversed on direct post-launch feedback. See section 15 for the
current mechanic: a machine is now a held `<id>/rig` item, crafted like any
other recipe and spent at placement, not a bill charged there.

Locked with `docs/BUILD_PLAN.md` Phase 3: `furnace` and `lift` were free and
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
| `lift` (winch stage) | 2x3 | 6 `copper/plate` + 4 `timber/log` + 2 `copper/ingot` | 20.8 T | refined, not raw — the game's own bottleneck (invariant 4) priced like the investment it is |
| `press` | 2x2 | 4 `copper/plate` + 2 `copper/ingot` | 12.8 T | no longer the one free-provisional row `data/boons.js#STARTING_MACHINES`'s own comment named; a player may still hand-press (`data/recipes.js#press`, `hand:true`) toward this bill without owning one |
| `belt_r` / `belt_l` | 4x1 | 2 `copper/plate` + 4 `stone/gravel` | unchanged (priced since the belts commit) | — |

Mass is `Σ substance.item.mass x form.massK x n` — the identical arithmetic
`model/items.js#massOfPair` already uses for the pockets and the burden gauge,
so "the HUD says 16.8 T" and "this is what the furnace bill weighs" can never
disagree.

**`placementCheck(band, machineId, tx, ty)`** (`src/model/run.js`) is the
single decision every reader of a placement's legality now calls: footprint
clear, footing satisfied, granted, depth allowed (`minDepth`), a lift's own
`lift.span` actually reaching `lift.toBand` from the exact footprint proposed
(new this phase — see below), and affordability LAST, in that order — the
same order `rules/placement.js#placeMachine` always checked in, now read from
one place instead of copied into it. `rules/placement.js#placeMachine` calls
it and turns a refusal into a journal row; `view/hud.js`'s new build-menu
ghost (hover a BUILD row with the panel open) calls the identical query to
tint a footprint preview at the aim reticle and print the same one-word
reason beside it — `view` may not import `rules`, so this is the same move
`canAfford`'s own greyed-out BUILD row already made, generalised.

**The winch shaft check.** A stage whose `lift.span` does not reach
`lift.toBand` from where it is about to stand would place, run, and never
once deliver a haul — `placementCheck` refuses it with `'NO SHAFT TO SERVE'`
before it ever costs a talent, using the identical arithmetic
`rules/lift.js#reaches` already applies to an already-placed stage
(`box.x + box.w/2`, `box.y - lift.span`, tested against `bandAt(...)`),
computed here from the proposed footprint instead. `rules/lift.js` is a
`rules` sibling `model/run.js` may not import (rules do not import rules, and
a model query may not import `rules` at all), so this one fact is duplicated
across the layer boundary rather than shared past it — the same trade
`rules/machines.js`'s own `HARD_BREAK` mirror already accepted for the
identical reason.

**Deconstruct** (`rules/placement.js#deconstruct`, new intent on `Backspace`,
`shell/input.js`/`shell/main.js`) returns a machine's FULL cost, as falling
items (invariant 5 — never a direct pocket credit), the moment it is proven
to hold nothing: `m.buf` has no keys and `m.charges` is 0. A machine still
holding buffered material or a banked fuel charge refuses, with a reason, so
the bill can never quietly outlive the ore that was sitting inside it.

**`F`/`L`.** Removed as unconditional spawns; `docs/AUDIT.md` section 3 had
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

**Miracles.** `data/miracles.js` ships one row, `chasm` ("RIFT OF HADES"): a
held `chasm/phial` pair (substance tagged `miracle`, crossed with Phase 1's
`phial` form) that, on use, clears every tile in a 1-tile radius square
around the aim reticle to AIR (`model/tiles.js#write.clear`) and grants
`hades-passage` (above) as its side-effect boon — one of the timed tier's
three stated sources (god grant, altar use, miracle side-effect).

**Trinket equip slots.** `run.equipped`, length `eff('trinketSlots')` (3,
Phase 1), a fixed-length array of substance ordinals or `null`. A trinket's
modifier is active only while its id is BOTH equipped AND held —
`rules/trinkets.js#step` clears a slot whose id the pockets no longer hold in
the same pass it syncs `model/mods.js`, so the two can never disagree.

**Trinket sources.** The unconditional `T` debug spawn is gone (behind
`flags.showDebug` only, alongside the other three tiers' debug grants). Real
sources this phase: a 3% chance per broken tile at `tile.tier >= 2` (granite,
adamant) named in `data/drops.js` and rolled in `rules/mining.js`'s rare-drop
hook, through `rand()` only (invariant 7). A drop-table row for tribute
completion is also in `data/drops.js` but not yet consumed — tribute
completion is not a real event yet (see `docs/FINDINGS.md`).

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
| `lift` | `lift` | 20.0 | 20.8 T |
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
first-match rule — the exact tie class `daedalan`/`auger`'s differing log
counts exist specifically to avoid, with no quantity left to differentiate
here since retuning would invent a number Phase 3 never set. It remains
grantable (`data/grants.js#gift-kiln`) but not currently placeable; see
`docs/FINDINGS.md`.

**Mirrored pairs share one substance.** `belt_r`/`belt_l`,
`talos_head`/`talos_head_l` and `cyclops_maw`/`cyclops_maw_l` are each one
`variantOf` row differing only in a `belt.dir`/`mine.facing` flip — giving
each its own substance would need a SECOND hand-recipe with a bit-identical
bill (the same unbreakable tie `kiln_divine` hits) AND would have overflowed
the tile-byte budget (see below). Instead, `model/run.js#machineIdFor`
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

**Placeable rubble.** `data/forms.js#gravel` gained a `tile` block
(`solid:true, climb:false, hardK:0.5`) so mined rubble (`stone/gravel`,
`soil/gravel`, `granite/gravel`, `adamant/gravel`) can be shovelled back into
a dug-out hole through the same `placeTile` path `log`/`rung`/`stair` use —
loose backfill, easier to dig back out than any native rock it came from.

**Tile-byte headroom.** Adding one form (`rig`, `data/forms.js`'s 11th) and
eight machine substances (19 total) leaves 2 more substances before the tile
id byte overflows — down from the pre-reversal headroom, since a new FORM
costs disproportionately (every substance's stride grows by one). Verified
by `npm run check`'s own guard at import time.
