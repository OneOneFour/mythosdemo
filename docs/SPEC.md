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
| `press` | 2x2 | 4 `copper/plate` + 2 `copper/ingot` | 12.8 T | no longer the one free-provisional row `data/boons.js#STARTING_MACHINES`'s own comment named; a player may still hand-press (`data/recipes.js#press`, `hand:true`) toward this bill without owning one |
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
first-match rule — the exact tie class `daedalan`/`auger`'s differing log
counts exist specifically to avoid, with no quantity left to differentiate
here since retuning would invent a number Phase 3 never set. It remains
grantable (`data/grants.js#gift-kiln`) but not currently placeable; see
`docs/FINDINGS.md`.

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
a twelfth form (`block`), so the live figures are `STRIDE` 13 and
`1 + n * 13 + (f + 1)`;** the shape of the arithmetic is unchanged.

A new FORM does cost every substance one byte of stride, and that reads as if
a form were the expensive thing. **It is the cheap one.** Measured against the
real modules at the twelve forms shipped today: the guard's own figure is
`1 + 8 * 13 + 12 = 117` of 255, and `PACKABLE_LIMIT` is 18. Two more forms
would take it to 135 and 15. A form is affordable; a tile-capable substance is
not appendable at all — see the correction below.

This section used to say **two substance rows left**, which was true of the
guard as it was written and false of the game (corrected in Phase 8c,
`docs/PLAN-gears-and-winches.md` §2.5 and §6.1). The old guard measured from
`SUB.length - 1`, pricing *every* row as if it were tile-capable:
`1 + 18 * 12 + 11 = 228` of 255, so the third new row overflowed at 264. But
twelve of the nineteen rows can never be packed at all — `bellows`, `pick`,
`auger` (relics), `chasm` (a miracle) and all **eight** machine substances.
`rules/placement.js#placeTile` refuses any form with no `tile` block,
`#placeableFromPockets` sends `rig` down `placeMachine` instead, and no
tile-capable form's `subTags` (`gravel`: metal/rock, `log`/`rung`: organic,
`stair`: metal) cross with a `relic`, `miracle` or `machine` substance.

**The real figures.** The guard now measures from the highest **packable**
ordinal — native terrain, or a legal crossing with a form carrying a `tile`
block:

| | as measured, post-Phase-14a |
|---|---|
| substance rows | 23 |
| forms | 12, so `STRIDE` 13 |
| packable substances | 7 of 23 (`copper`, `tin`, `timber`, `stone`, `soil`, `granite`, `adamant`) |
| highest packable ordinal | 8 (`adamant`) |
| byte in use at that ordinal | `1 + 8 * 13 + 12 = 117` of 255 |
| last ordinal that still fits (`PACKABLE_LIMIT`) | 18, at `1 + 18 * 13 + 12 = 247` |

Rows that can never be packed — relics, miracles, machine items — now cost
the tile byte **nothing**. They do still consume ordinals, so a *tile-capable*
row must land at an ordinal ≤ `PACKABLE_LIMIT`.

**CORRECTION (Phase 14a): appendable headroom for a tile-capable row is ZERO,
and has been for some time.** This table used to end with a row reading
"**tile-capable headroom — 12 rows** (ordinals 9–20)". That was arithmetically
true as a *slot count* and thoroughly misleading as advice, because **every
one of those twelve ordinals is already occupied** by a non-packable row:
9–20 are `auger`, `chasm`, `furnace`, `press`, `belt_r`, `brazier`, `hearth`,
`talos_head`, `cyclops_maw`, `hub`, `crank`, `gear`. `SUB.length` is 23, so
the next **appended** row lands at ordinal 23, and if it were packable:

```
before Phase 14a (11 forms, STRIDE 12):  1 + 23 * 12 + 11 = 288  >= 255
after  Phase 14a (12 forms, STRIDE 13):  1 + 23 * 13 + 12 = 312  >= 255
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
`topsoil`). Three octaves of value noise over a lattice drawn from `rand()`,
summed, then clamped, then pinned, then step-limited, in that order.

| number | value | where | meaning |
|---|---|---|---|
| octaves | `[48, 2] [16, 1] [5, 0.5]` | `OCT`, `generate.js` | `[period tiles, amplitude tiles]`: landform, hills, roughness |
| `amp` | 6 | strata row (`RELIEF` is the default) | total relief, 48 px at an 8 px tile |
| `FADE` | 36 rows | `generate.js` | depth at which a boundary's relief offset reaches 0 |
| `BLEND` | 3 columns | `generate.js` | the fade-in either side of the spawn shelf |
| `LIP` | 0.35 | `generate.js` (unchanged) | fraction of columns dipped one row — see below |

**Relief runs UP from `floorTy`, never below it.** Offsets are `-amp..0` (plus
the one-row lip dip), so the declared ground row is the *lowest* ground and a
hilltop is up to 6 rows above it. This is not cosmetic: `view/paint.js#
paintChunk` treats an AIR tile at `ty >= floorTy` as excavated and paints it
dark cavity texture, so a valley floor *below* `floorTy` would fill its own
open sky with cave shading. Keeping the base row as the valley floor also
keeps `floorTy` meaning exactly what `shell/boot.js`'s spawn, the depth datum
(`view/hud.js`, `model/run.js`) and that sky test already assume.

**The ragged lip moved into the map.** `KINDS.layer` still carves `LIP` of its
own top row in a band with no relief row, but in a band WITH one the same
probability and the same one-row depth are applied to the height map instead
(`heightmap()`), and `layer` skips its carve. A random one-tile carve laid on
top of a height map is a two-tile face, and the hop clears one; folding it in
means the step pass below can see it. The rendered result is identical — that
column's top tile is still air over soil.

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
always; a DESCENT away from spawn may take `STEP_BIG` where both its columns
are outside `SAFE_R + 1` and the last big step was `STEP_GAP` columns ago.
Down is free, so walking out is never blocked — measured at roughly 0.5
two-tile drops per seed. Walking back up one wants a dig or a ladder, which is
the premise, not a bug.

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
room. Worth about 155 extra ore cells per seed in `topsoil`.

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

`blobs` writes into SOLID cells only, so a field never fills a hollow.
`vein` (the guaranteed first copper, `near:'spawn'`) writes into air as well,
because the guarantee is the whole point of the row, and is now `dy:6, r:3.6,
n:3` — three overlapping stars, which puts its top at row 25 even on the
unluckiest arm roll. That is the 5-tile dig §5's beat 3 promises.

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
`rules/placement.js` at all. Found by physically performing Phase 8f's
acceptance walkthrough; Phase 8e never saw it because a screenshot scene places
machines through `model/machines.js#write.place`, which asks nothing about
footing.

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
| `segUp` | value | 11 | px/s | carrier ascent at full surplus and full drive |
| `segDown` | value | 26 | px/s | free descent on a vertical segment, scaled by slope |
| `segBase` | value | 1.0 | drive | the unit `crank.torque` is denominated in, and the divisor both speed ramps use |
| `segLoad` | value | 0.025 | drive/talent | added drive per talent aboard, at full slope |
| `riderMass` | value | 8 | talents | the player's own body on a carrier |
| `segReach` | scale | 1.0 | x, scope `machine` | multiplies `hub.reach` (`linkCheck`) |
| `crankTorque` | scale | 1.0 | x, scope `machine` | multiplies `crank.torque` |
| `torqueLoss` | scale | 1.0 | x, scope `machine` | multiplies `gear.loss` |

All eight are live as of Phase 8f; `rules/drive.js` is the only reader of the
first five and of the last two.

`segUp`/`segDown` carry the retired `liftUp`/`liftDown`'s **exact** bases (11
and 26): a carrier is not faster than the deck it replaced. Those two tunables
were deleted in Phase 8f, in the same commit as the module that read them — two
live readers of one number is the drift `CLAUDE.md` warns about, and they never
coexisted for longer than the two phases it took to make the new ones move.

At `segLoad` 0.025, the whole 40 T burden cap doubles the drive requirement on
a vertical segment (`1.0 + 0.025 x 40 x 1.0 = 2.0`), which is the arithmetic
that makes D4's "boarding is never refused" honest: an over-cap rider is load a
single 1.5-torque crank cannot lift, so the carrier runs backwards under them
and nothing had to say so. The break-even is **20 T aboard** — half the burden
cap — which is the whole trade in one number: ride up with half a load, or
crank a full one up empty-handed.

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
| nothing | 1.00 | climbs at 5.5 px/s |
| 4 T of ore | 1.10 | climbs at 4.4 px/s |
| 20 T | 1.50 | **holds still** (the exact `surplus == 0` boundary) |
| 38 T (8 T body + 30 T pockets) | 1.95 | runs backwards at 11.7 px/s |
| 40 T (the burden cap) | 2.00 | runs backwards at 13 px/s |

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

| | `cloud_dock` | `altar` |
|---|---|---|
| footprint | 2x1 | 2x2 |
| footing | 2 | 2 |
| `hub` | `{ reach:96, carries:['material','player'] }` | none — cycle 1 is unmoved at the surface (§4, §5); the player walks up and holds the feed key |
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
empties them is `rules/cycles.js#drainReceivers`: every frame, for every
machine tagged `tribute:{}`, every non-zero buffer entry is spent through
`model/machines.js#write.consume` and credited to `run.tribute.have` in the
same motion. Material goes in, is subtracted from the buffer, and nothing is
ever produced back out of it — the receiver's buffer is a counting ledger
with a footprint, not a hopper feeding a recipe.

### 18.4 The cycle table

Four rows (`data/cycles.js#CYCLES`); cycles 5–6 wait on the
`essence`/`ambrosia` tiers §8 marks not implemented. The ore-equivalent
column applies §8's compression ratios; `granite/gravel` has no ratio of its
own there (§8 only prices the refined tiers), so it is counted as raw mined
units, gated by `tile.tier` rather than by compression.

| # | god | at | demand | ore-equiv. | deadline | reward | punishment |
|---|---|---|---|---|---|---|---|
| 1 | hephaestus | `altar` | 10 `copper/ore` | 10 | **none** | +1 favour; grant `furnace` + `cloud_dock`; chart `astral` | — (cannot be missed) |
| 2 | hephaestus | `cloud_dock` | 3 `copper/plate` | 36 (+12 fuel across the two compression steps) | 480 s | +2 favour; chart `topsoil`; draft 1-of-3 `grant` | 1 heart, −1 favour |
| 3 | athena | `cloud_dock` | 6 `copper/plate` + 4 `tin/ingot` | 72 + 16 = 88 | 420 s | +2 favour; draft 1-of-3 `boon` | 2 hearts, −1 favour |
| 4 | poseidon | `cloud_dock` | 8 `copper/plate` + 8 `granite/gravel` | 96 + 8 tier-2 rock | 360 s | +3 favour; draft 1-of-3 `trinket` | 2 hearts, −1 favour |

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
player in person is the whole reveal.

### 18.5 The ledger

Five `run` fields (`model/run.js#RUN_SCHEMA`), every one reset by `newRun()`
(invariant 8):

```
run.cycle     1-based, which row of data/cycles.js is live. CYCLES[run.cycle-1]
run.tribute   { id, have, left } | null. REPLACED WHOLE, never patched in
              place -- a demand and its own deadline can never be observed
              half-applied. `have` is keyed the model/items.js#keyOf way, the
              same convention m.buf and run.inv already use.
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
`shell/main.js` performs the identical "first undrafted row" lookup it
already runs for the four debug-key drafts, then clears the field — one
event, one dispatch path, whether a key or a completed trial requested it.

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
- **`draft`** — one of `'grant' | 'boon' | 'trinket' | 'miracle'`, offered
  1-of-3 through `run.offer` (§18.5). Cycles 2–4 each draft a different tier,
  in that order.

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

## 19. Deposits, rubble and the packed block (Phase 14a)

Locked with `docs/PLAN-phase14-mining-and-drops.md` (D14-A, D14-B, D14-C,
D14-H). **Content only: no `rules/` file changed and no mechanic was added.**
Depletion — a deposit tile's charge counter — is Phase 14b and is not in this
section yet.

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

`copper/stair` and `tin/stair` stay legal and obtainable (`daedalan`), and
that is correct: a Daedalan stair is refined bronze work, not a vein of
copper. `adamant/stair` is legal and unobtainable — no recipe outputs it and
nothing drops it.

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
The residual wart is the known one (`docs/FINDINGS.md` 8d #4: the craft queue
cannot choose a recipe), and a real menu is its fix.

### 19.5 What this section does NOT change

Seconds-per-unit, `hard`, `tier`, `pickPower` and every tool's `power` are
untouched, so §8's compression table and `docs/DESIGN.md`'s measured
break-evens (raw ore 0.62 tiles, ingot 2.40, plate 6.90) still hold with no
re-derivation. `tile.drops` is unchanged for every substance. No `data/world.js`
count moved. `rules/mining.js` and `rules/machines.js` were not opened.
