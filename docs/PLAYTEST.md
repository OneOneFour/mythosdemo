# Playtest — cycles 1 to 3

Phase 6b of wave 6. Read `ARCHITECTURE.md`, `CLAUDE.md`, `docs/SPEC.md` §4/§5/§17/§18/§20/§23
and `docs/DESIGN.md` first; this file assumes them.

Seed **1337** throughout, desktop viewport 1280x800, driven through
`src/shell/main.js#installTestHook` under `?test=1`. Every number below is
**simulated seconds** (`run.t`, the fixed 1/120 s substep), never wall clock.
Where a figure is arithmetic over a measured rate rather than a figure I drove,
it says so.

---

## Verdict

**No, this is not fun yet, and the reason is not that the content is thin.** The
prototype's whole thesis is "down is free, up is expensive", and in play ascent
is *free too*: a 28-rung timber ladder built once turns the 240 px climb to the
Heavens into **7.5 seconds of holding one key at any load under 30 T**, which
pays cycle 2 with 410 s left on a 480 s clock and never touches a hub, a
segment, a carrier, a crank or a gear. The single biggest thing missing is a
reason to build the transport system the game is named around — measured, the
three-segment chain the spec prices the ascent against moves the same cargo
**14x slower than the player's own legs** (105 s of held `r` against 7.5 s of
held `up`) for a bill of nine extra copper plates, so no rational player will
ever build one. Under that, cycle 1 is 81% one held mouse button (29.8 s of
mining out of 36.7 s total) with no decision in it, and the CRAFTING panel does
not craft what you click — `rules/crafting.js#choose()` ignores the queued
recipe id and runs the first affordable row instead, which makes two of the
nineteen hand recipes (including the adamant auger `docs/SPEC.md` §18.4 calls
necessary for cycle 4) permanently unobtainable. The bones are genuinely good:
the altar's arrival, the astral shelf and the draft modal all land, and three of
the top five findings below are tuning or content changes rather than rewrites.

---

## Method, and what I actually drove

- `__mf.newRun(1337)`, then primitives built on `__mf.hold`/`frames`/`intent`
  and on `cmd.mx/my` set to world pixels. LMB was dispatched by re-implementing
  `shell/input.js#pointerdown`'s four rules in the driver, so every press in the
  log below resolved through the same rule order the real game uses and the log
  records which rule fired.
- **Cycle 1 was played end to end from a fresh run**, no state injected.
- **Cycle 2 was played end to end for the ascent half** (ladder, slab, dock
  placement, delivery, draft) with the *material bill* injected via
  `__mf.give`, because the bill is 100 copper ore and 27 logs and its cost is
  fully determined by rates I measured separately. The production arithmetic is
  labelled as arithmetic.
- **Cycle 3 was not played.** It requires ~100 tiles of new vertical
  infrastructure; I measured the rates that decide it and tested the mechanisms
  (tin exists and is reachable, the dock credits `tin/ingot`-class cargo, the
  miss/death path fires) rather than driving 12 minutes of digging. Said plainly
  in "What I could not test".
- Screenshots were taken into the scratchpad and looked at, not just captured.

### Measured rates (all directly driven)

| thing | measured | where |
|---|---|---|
| soil tile | **0.500 s** | `data/substances.js` `hard:0.5`, charge 1 |
| stone tile | **1.608 s** | `hard:1.6` |
| timber trunk tile | **0.35 s** -> 1 log | |
| copper tile | **3.808 s** -> 4 ore (0.95 s/ore) | `hard:0.95`, `charge:4` |
| walk | **60 px/s** | `eff('walk')` |
| climb a rung ladder, 0–28.8 T | **30.0 px/s** | `eff('climb')`, no burden penalty |
| climb a rung ladder, 38.4 T | **14.9 px/s** (0.50x) | `burdenSoft` falloff |
| climb a rung ladder, 40.8 T | **refused** | `rules/player.js:117` |
| carrier ascent, 96 px vertical, 1 crank | see the table in finding 2 | `rules/drive.js:227` |
| hand smelt | 4.0 s -> 1 ingot (4 ore + 1 fuel) | |
| hand press | 8.0 s -> 1 plate (3 ingot + 1 fuel) | |
| `kindle` | 1.5 s: **1 log -> 3 fuel** | `data/recipes.js#kindle` |
| `peg_rungs` | 1.5 s: 2 logs -> 4 rungs | |

---

## What actually happened

### Cycle 1 — completable, and 3.3x faster than the beat sheet

One continuous run, no injected state. `run.t` at each beat against
`docs/SPEC.md` §5's own window:

| beat | §5 window | measured | what I did |
|---|---|---|---|
| 1 walk | 0:00–0:12 | **0.44 s** | walked 25 px toward the pickaxe |
| 2 pick taken | 0:12–0:30 | **0.45 s** | one substep of `c` |
| 3 six copper mined | 0:30–1:00 | **16.85 s** | vertical shaft at tx 42: 5 soil + 3 copper tiles, 12 ore on the floor |
| 4 back at the surface | 1:00–1:20 | **36.49 s** | cut a diagonal stair out, leftward, 7 levels |
| 5 altar risen | 1:20–1:40 | **36.49 s** | fires the same frame as beat 4 |
| 6 cycle 1 paid | 1:40–2:00 | **36.67 s** | 11 LMB presses into the altar, `rule2-feed` every time |

Beat 2's "**hold** `c` to collect" is not a hold: pickup completed in **one
substep, 0.008 s** (`rules/items.js`, `cmd.collect` gated only on reach). The
beat teaches a hold that does not exist.

Beat 3 works exactly as designed and is the best moment in the game so far — 12
copper ore visibly falls to the bottom of the shaft you dug and the callout
changes to `GET BACK UP -- FELL A TREE OR CUT A STAIR`
(`data/callouts.js`, index 3). Screenshot `02-bottom-of-shaft.png`.

Beat 4 is where the premise first fails to land. §5 claims "ascent takes ~4x the
descent". Measured on this seed:

- descent, 8 rows of vertical shaft: **13.99 s** of mining (5 soil at 0.5, 3
  copper at 3.808)
- ascent, a 3-tile-per-level diagonal stair, 7 levels: **15.79 s** of mining plus
  2.3 s of walking

That is **1.29x**, not 4x. Like-for-like through soil only it is 3.0x (8 rows
down = 4.0 s; 24 stair tiles up = 12.0 s). But the ratio is the wrong number to
quote, because **the stair is permanent**: the second ascent of the same shaft
costs 0 s of mining and 1.5 s of walking. Up is expensive exactly once.

A diagonal stair needs **three** tiles per level, not two —
`rules/player.js#moveX`'s auto-step probes headroom in the destination column
*and* the current one (`src/rules/player.js:388-390`), so the transition column
has to be cleared one row higher than the corridor. Nothing says so; my first
two attempts wedged.

Two seed-1337 accidents worth recording because they are not accidents of the
seed, they are accidents of the design:

- **The nearest tree is 18 tiles away** (tx 60; then tx 13 at 29 tiles). The
  whole surface band holds **12 tree columns / 45 trunk tiles**. §5 offers
  "fell the olive tree for a ladder" as a peer option to cutting a stair; on
  this seed it is a 36-tile round trip before you can start.
- **The altar is always to the *left* of spawn** (`rules/cycles.js`,
  `spawnTx - def.tw - SPAWN_GAP`), and it does not exist until you are already
  back at the surface. So the direction you cut your stair is a blind coin
  flip, and cutting it rightward (which I did first) leaves your own 8-deep
  1-tile shaft between you and the altar with a ramp leading down into it. My
  driver walked straight back down its own staircase into the pit and could not
  get out; a real player hops the mouth, but nothing indicates the hazard and
  the reticle-clamped press at the bottom reads `THAT DOES NOT BUILD` (see
  finding 6).

Cycle 1 pays with zero fanfare problems except one: two grants arrive in the
same frame and `view/fx.js:53` keeps one toast line, so
`THE CLOUD DOCK IS GRANTED` overwrites `THE FURNACE IS GRANTED` inside its own
frame. Screenshot `05-cycle1-paid.png` — the furnace, which is §5 beat 6's
entire payoff, is never announced.

### Cycle 2 — completable, but not by the route the spec prices

Cycle 2 (`data/cycles.js#first-delivery`): 3 `copper/plate` at `cloud_dock` in
`astral`, 480 s, punishment 1 heart / -1 favour.

**What I built (measured, materials injected):** a 28-rung `timber/rung` ladder
at tx 54 from surface row 18 to surface row 0, then mined 10 astral stone tiles
(14.57 s) laddering up through the slab, emerged on the astral floor, placed the
dock, walked two tiles and hand-fed three plates. `run.t` = **70.05 s** total,
cycle 2 paid, `favour.hephaestus` 2, the grant draft raised
(`gift-maw` / `gift-talos`, reroll dimmed `THIS IS ALL THERE IS` — correct).
Screenshots `10-ladder.png`, `12-dock-placed.png`, `13-cycle2-paid.png`. The
dock shot is the best image in the build: a marble shelf in the sky with a
ladder running down through it.

Three mechanical notes from the build:

- A free-standing ladder **cannot be started on flat ground**:
  `rules/placement.js:235` requires solid left/right/above or a climbable
  above/below, and `rung` carries no `tile.roots`, so the first rung needs a
  wall. On this seed the nearest usable wall is the 1-tile relief step at
  tx 54/55, twelve tiles from spawn. Once one rung exists, rungs stack on rungs
  forever via `climbAt(tx, ty+1)`. That is a genuinely good rule and completely
  undiscoverable.
- The **astral floor is ragged** (`layer()`'s lip carve), so `cloud_dock`
  (`footing:2`) refuses on most columns with `NEEDS A FLOOR`. I had to scan for
  a legal pair. A player will click five times before it takes.
- The depth gauge reads **`+31M`/`+32M`** on the dock, and **`+2M` standing on
  the spawn floor** — see bug B4.

**The ladder route against the intended route, priced out.** The ladder route's
minimum bill is 3 plates (tribute) + the dock (5 plate + 1 ingot + 2 log) = 25
ingots = **100 copper ore, 33 fuel, 27 logs**. The intended route
(`docs/SPEC.md` §18.2: three segments across the 240 px gap) adds **3 `hub`
rigs = 9 plates + 3 ingots + 6 logs**, which is **120 more ore and 39 more
fuel**, plus three cranks, plus a chimney through the astral slab (below).
Arithmetic over the measured rates:

| | ladder route | 3-segment route |
|---|---|---|
| copper ore to mine | 100 (95 s) | 220 (209 s) |
| fuel units | 33 (11 logs kindled) | 72 (24 logs kindled) |
| logs total | 27 | 41 of the world's 45 |
| smelts / presses | 25 / 8 (164 s of machine time) | 55 / 17 (356 s) |
| ascent infrastructure | 28 rungs, 14.6 s of slab mining | 3 hubs, 3 cranks, 60.8 s of chimney mining |
| **per-trip ascent cost** | **7.5 s** of held `up` | **105 s** of held `r`, at three different cranks |
| fits 480 s? | yes, ~340 s with machines running | **no**, ~700 s serial |

**The intended route misses cycle 2's deadline; the unintended route beats it
with 140 s to spare.** That is the report's central finding.

I did verify the intended route *works*, because it matters that it is possible
at all. Measured (`deliver3.mjs`): dock at astral (52,29), a hub 93 px below it
in the surface band, a crank adjacent to the hub, three plates (7.2 T) on the
carrier. Held `r` continuously: the carrier rose 93 px in **24.5 s**,
`run.tribute.have['copper/plate']` reached 3, and the credit landed while the
carrier was still ~15 px short of the deck (the dock's `catchBox` slack, §18.3).
`rules/drive.js` and `model/segments.js` are correct.

But the link only resolves after a **hole is mined through the astral slab**.
The slab is 10 rows of stone (astral 30–39) and the dock stands on top of it, so
the straight cable from any hub below runs into it:
`linkCheck` returns `{ok:false, why:'THE PATH IS BLOCKED', at:{x:408,y:316}}` —
astral row 39. The headframe exemption (`model/segments.js#headframe`) covers
only two tiles per endpoint. The fix a player has to *invent* is: place the dock
so its two footing tiles survive, then mine an 18–38 tile chimney beside and
under them so the cable can pass, at 1.608 s a tile (**60.8 s** for the 38-tile
version I drove). Nothing hints at it and the refusal names a pixel.

### Cycle 3 — not reached; the arithmetic says it costs one miss, and a miss is nearly fatal

Cycle 3 (`grey-eyed-tithe`): 6 `copper/plate` + 4 `tin/ingot` at the dock,
420 s, punishment **2 hearts** / -1 favour.

Where the tin is, measured by scanning the grid: the first `tin` tile in
`topsoil` is **row 64 = 100 M below the datum**, 800 px down. (Granite, cycle 4,
first appears at row 120 = **156 M**; adamant at row 227 = 263 M.)

Getting 100 tiles down *and back* is the whole cycle:

- a **vertical shaft** is 100 stone tiles = 161 s, and you cannot climb out of
  it: 100 rungs is 50 logs and the world contains 45.
- a **diagonal stair** is 3 stone tiles per level = 4.82 s/level =
  **482 s for 100 levels**, against a 420 s clock. It is reusable afterwards.
- riding a carrier down is free, but `docs/SPEC.md` §17.6 already records
  (and I re-derived) that **a rider cannot power their own segment**, so the
  return trip still needs the stair or the ladder.

So cycle 3 costs **one guaranteed miss** (2 hearts, -1 favour), after which the
stair exists and the retry is ~250 s and comfortable. The problem is what a miss
costs. I drove the miss path (`miss.mjs`):

| event | result |
|---|---|
| deadline reaches 0 | 1 heart lost, `favour.hephaestus` -1, `run.misses` 1, same row re-arms with a fresh 480 s |
| a **second** miss, any cycle | `hearts` -> **0**, `run.dead` true |

`run.misses` is **global, not per cycle** (`docs/SPEC.md` §18.5, confirmed in
play). So the whole four-cycle run has a budget of exactly **one** missed
deadline, and cycle 3's own arithmetic consumes it. Cycle 4 (granite at 156 M,
56 tiles deeper, 360 s) then has to be first-try or the run ends.

I also confirmed cycle 4 is not *hard*-blocked despite bug B1: the adamant auger
is uncraftable, but `data/machines.js#talos_head` carries `mine:{tier:2}` and is
the sane pick from cycle 2's two-of-two grant draft, so tier-2 granite is
reachable by machine.

---

## Where the time actually goes

Cycle 1 is measured directly. Cycle 2 splits a measured ascent half from an
arithmetic production half (rates above; machine time assumed overlapped with
mining). Cycle 3 is arithmetic throughout and is marked so.

| activity | cycle 1 (measured) | cycle 2, ladder route | cycle 2, 3-segment route | cycle 3 (est.) |
|---|---|---|---|---|
| mining ore | 14.0 s | 95 s | 209 s | 86 s |
| mining rock/soil for access | 15.8 s (the stair out) | 15 s (astral slab) | 76 s (slab + chimney) | **482 s** (the stair to 100 M) |
| felling timber | 0 s | 10 s | 15 s | 4 s |
| walking | 2.6 s | ~50 s (tree trips, vein trips) | ~70 s | ~40 s |
| climbing | 0 s | **7.5 s** | 7.5 s | 27 s |
| cranking | 0 s | **0 s** | **105 s** | 0 s |
| waiting on a machine | 0 s | 0 s (overlapped) | 0 s (overlapped) | 0 s |
| hand-crafting the bill | 0 s | 41 s (kindle+rungs+dock) | 60 s | 30 s |
| in menus | **0 s** | ~5 s | ~5 s | ~5 s |
| settle / fall | 2.0 s | 0 s | 0 s | 0 s |
| collecting | 2.0 s | ~15 s | ~30 s | ~12 s |
| **total** | **36.7 s** | **~340 s** (deadline 480) | **~700 s** (deadline 480) | **~700 s** (deadline 420) |

Read the first column as the diagnosis of the first two minutes: **81% of
cycle 1 is one held mouse button**, and 0% of it is spent choosing anything.
Read the "cranking" row as the diagnosis of the transport system: the design's
centrepiece is either 0 s of the run or 15% of it, and the 0 s version is
strictly faster.

---

## Ranked findings

Ranked by fun per unit of work.

### 1. Ascent is free, so the premise never fires — and the fix is a number
**Size: `tuning-only`** (then `content-only` if you want more).

What is wrong: a rung ladder makes the 240 px climb cost 7.5 s at any load below
30 T, and it is built once. `timber/rung` is 0.3 `massK`, `peg_rungs` yields
4 rungs for 2 logs, and `eff('climb')` is 30 px/s — half walk, which is not a
tax, it is a rounding error against a 480 s clock.

Evidence: measured full-height climb, 224 px, at five burdens — 7.47 s at 0 /
9.6 / 28.8 T, 15.06 s at 38.4 T, refused at 40.8 T. The soft cap is 30 T and a
cycle-2 tribute load is **7.2 T**, so D4's falloff is never encountered on the
critical path. Cycle 2 paid at `run.t` 70.05 with 410 s spare.

Why it costs fun: it is the entire thesis. "Down is free, up is expensive" is
currently "down is free, up is 7 seconds".

Recommendation, cheapest first, all in `data/tuning.js`:
- **`climb` 30 -> 10 px/s** makes the same climb 22.4 s and a cycle-3 return
  trip 80 s — enough that a carrier chain starts to pay.
- **`burdenSoft` 0.75 -> 0.30** (12 T) puts a 5-plate load inside the falloff,
  so "carry less, or climb slower" becomes a decision every trip instead of a
  fact you never meet.
- A content follow-up worth one row: rungs are currently recoverable
  (`rules/placement.js#isPlaced`), so a ladder is a reusable free asset. Making
  the placeable ascent a *consumable* (a `rung` that does not drop itself back,
  or a `climbWear` on the tile) is the honest version of "climbing costs
  material" that `CLAUDE.md` invariant 4 already claims.

### 2. The transport system is 14x slower than walking, so nobody will ever build it
**Size: `tuning-only` for the speed; `small rules change` for the chimney.**

What is wrong: one 96 px vertical segment with one crank, measured:

| aboard | px/s | s per 96 px | T/s throughput |
|---|---|---|---|
| 0 T | 5.50 | 17.5 | — |
| 4 T | 4.40 | 21.8 | 0.183 |
| 8 T | 3.30 | 29.1 | 0.275 |
| **10 T** | 2.75 | 34.9 | **0.287 (peak)** |
| 12 T | 2.20 | 43.6 | 0.275 |
| 16 T | 1.10 | 87.3 | 0.183 |
| 20 T | 0 | never | 0 |

Exactly `docs/SPEC.md` §17.8's table, so the code is right and the *numbers* are
the problem. The full 240 px ascent is three segments: **105 s of holding `r`**
at peak throughput, at three different cranks the player has to walk between,
for 10 T. The ladder moves the same 10 T in **7.5 s**. And the chain costs 9
extra plates (108 extra ore) and a 60.8 s chimney through the astral slab that
the player has to deduce from `THE PATH IS BLOCKED` and a pixel coordinate.

Why it costs fun: it is five nouns, two model modules, four machines and eight
tunables that a competent player will correctly ignore. The one thing that
*would* make it earn its keep is exactly what it is missing: it does not work
while you are somewhere else.

Recommendation:
- `segUp` **11 -> 40 px/s** and `segLoad` **0.025 -> 0.010** makes a 10 T haul
  cross 240 px in ~19 s and keeps the 20 T stall boundary near 40 T, i.e. still
  the burden cap. Combined with finding 1's `climb` 10, the chain becomes ~4x
  faster than the legs, which is the *point* of building it.
- `small rules change`: exempt an endpoint's whole band-crossing column from
  `linkCheck`'s path sweep, or widen `model/segments.js#headframe` to the
  endpoint's footprint columns for the full band thickness. The chimney is not
  a puzzle, it is a 60 s tax on discovering the refusal string.
- **Do not** make the crank passive. D10 is right that the cost of power is
  standing there; the bug is the exchange rate, not the currency.

### 3. Cycle 1 is 81% one held button with nothing to decide
**Size: `content-only`.**

What is wrong: 29.78 s of the 36.67 s run is holding LMB on a tile, and the
remaining 7 s is walking and one 11-press feed. There is no choice in the first
two minutes: the vein is directly below spawn, the tool is four tiles away, the
altar places itself, and the only branch (which way to cut the stair) is
unknowable because the altar does not exist yet.

Evidence: the time table above; screenshots `02` and `03`.

Why it costs fun: the beat sheet claims each beat teaches one thing, and beats
1, 2, 5 and 6 all complete in under half a second of real input. The two-minute
window is real (my 36.7 s is machine-perfect; a human will take 2–4 minutes),
but the *decisions per minute* is zero.

Recommendation, `content-only`, in `data/world.js` and `rules/cycles.js`:
- put the guaranteed spawn vein **off the spawn column** — two or three tiles
  lateral — so beat 3 is "find it" rather than "hold down".
- **place the altar before beat 4**, or reveal its light shaft from beat 3, so
  the stair direction is a decision. One line in
  `rules/cycles.js#ensureAltarPlaced`'s gate; the presentation already exists
  and is the best thing in the build.
- give beat 2 a real hold, or change the callout. One substep is not a hold.

### 4. Two of nineteen hand recipes cannot be made, and the panel does not craft what you click
**Size: `small rules change`.** See bugs B1 and B2 for the mechanism.

What is wrong: clicking a recipe queues its id, but `rules/crafting.js#choose()`
runs the first affordable `HAND_RECIPES` row regardless. Driven: with 12
`copper/ore` + 9 `timber/log` + 6 `stone/gravel` in the pockets, a real click on
the **GEAR** row (verified by its own hover tooltip: `GEAR / LOG 2/2 /
GRAVEL 1/1 / -> 1 GEAR RIG / BY HAND: 2.0 S`) produced a **`furnace/rig` after
8.0 s**, spending 12 ore and 6 logs.

I then tested every hand recipe at its own minimal bill. Because adding items
can only enable *more* earlier rows, the minimal bill is the best case, so this
is a complete reachability result:

| recipe | minimal bill | what you get |
|---|---|---|
| `daedalan` (copper stair) | 2 `copper/plate` + 4 `timber/log` | **4 `timber/rung`** (`peg_rungs`, 1.5 s) |
| `auger` (ADAMANT AUGER) | 2 `copper/plate` + 1 `timber/log` | **3 `timber/brand`** (`kindle`, 1.5 s) |

The other 17 resolve correctly. Both failures are shadowed by cheap timber rows
declared earlier, and `auger` is worse than a curiosity: it is **tier 2 / power
1.8**, i.e. a flat 1.8x on every swing in the game for 2 plates and a log, and
`docs/SPEC.md` §18.4 names it as cycle 4's answer to the granite gate.

Why it costs fun: the player's only lever on production is unusable, and the
strongest cheap upgrade in the game is unobtainable.

Recommendation: `rules/crafting.js#choose()` takes the queue head as a hint —
`ui.craftQueue[0]` is already threaded into `cmd.craft` at
`shell/main.js:114`; pass the id the same way `autoFeed` is passed, and fall
back to first-match only when the named row is unaffordable. Roughly 10 lines in
`rules/crafting.js` plus one field on the narrowed command object. The
declaration-order containment argument in `data/recipes.js` then stops being
load-bearing, which is a second win.

### 5. Timber is the real constraint on the whole run, and the world ships 45 logs
**Size: `content-only`.**

What is wrong: fuel is only `timber/log` and `timber/brand`
(`data/forms.js`, `tags:['fuel']`), and `brand` comes from `log`. The whole
world contains **45 trunk tiles in 12 columns, all in the surface band**;
`topsoil` and `astral` have none. Measured bills:

| | fuel units | logs (kindled at 3:1) | + direct logs | total logs |
|---|---|---|---|---|
| cycle 2, ladder route | 33 | 11 | 16 | **27** |
| cycle 2, 3-segment route | 72 | 24 | 17 | **41** |
| cycle 3 | 28 | 10 | 0 | **10** |
| cycle 4 | 32 | 11 | 1 | **12** |

The ladder route spends 27 of 45 on cycle 2 alone and the intended route spends
41. Regrowth exists but is slow and opt-in: felling the *last* trunk tile drops
one `timber/seed`, planting is ordinary placement, and `treeGrowSecs` is 180 s
(`rules/growth.js`).

A second, smaller thing inside this: **`kindle` is a 3x fuel multiplier**
(1 log -> 3 `brand`, each 1 fuel unit) reachable from minute one, so the
rational player never burns a log directly and the furnace's `*/#fuel` bill is
really "one third of a log". That is content deciding balance by accident.

Why it costs fun: the binding resource is invisible, undersupplied and 18 tiles
from spawn, and the player finds out four minutes in when the furnace stops.

Recommendation, `content-only`:
- raise `data/world.js#BANDS[1]` trees `chance` 0.06 -> ~0.12, or add a
  `trees`-kind row to a shallow `topsoil` hollow band, so fuel is renewable by
  exploring rather than by waiting 180 s.
- price `kindle` honestly: 1 log -> 1 brand plus the light, or 2 logs -> 3. One
  number in `data/recipes.js`.

### 6. Out of reach reads as "wrong material"
**Size: `small rules change`.**

What is wrong: `docs/SPEC.md` §23.4 deliberately has no out-of-reach refusal
string, on the argument that a press from out of reach means "mine" (rule 4).
That holds only when the reticle lands on rock. `rules/mining.js#aimAtWorld`
clamps the cursor to `eff('reach')` = 25.6 px, so a press aimed at a machine
you are too far from usually lands on **air**, which is rule 3, and rule 3 with
a non-placeable pair armed pushes `THAT DOES NOT BUILD`.

Evidence: driven. Standing in my own excavated ramp four tiles below the altar
with `copper/ore` armed — exactly what callout index 5
(`CLICK YOUR ORE, THEN THE ALTAR -- 10 COPPER`) instructs — twelve consecutive
presses resolved `rule3-place` and refused `THAT DOES NOT BUILD`, and the
tribute stayed at 0/10. The material was correct; the distance was not.

Why it costs fun: this is the first-run failure mode for the single most
consequential action in the game, and the message actively misdirects.

Recommendation: in `shell/input.js`'s rule-3 branch, if the *unclamped* pointer
was over a machine carrying `handFeed`, dispatch the feed anyway and let
`rules/machines.js#handOne` refuse — or add the third string §23.4 argues
against, now that there is a measured case where its absence lies. The second is
one row in `feedCheck`'s `why` table and honest.

### 7. The HUD's left column overlaps itself
**Size: `small rules change`** (a layout pass, not a rewrite).

What is wrong: `CLAUDE.md` D8 says panels are positioned by an anchored layout
pass over measured text and explicitly warns against reproducing the mockup's
overflow. The build reproduces it. At the native buffer
(`shots/20-hud-topleft.png`, cropped and read pixel by pixel):

- the burden bar's bottom rows cut through the cap height of `TRIBUTE II`
- `33%` is drawn over the progress bar's fill rather than beside it
- `5:11` is drawn as dark text on top of a light bar
- top-right (`shots/21-hud-topright.png`): `HEPHAESTUS`'s value digit is pushed
  onto the favour bar's row, and the `+2M` badge's right border is clipped by
  the canvas edge

Why it costs fun: it is the first thing every player sees and it reads as
unfinished.

Recommendation: one `y` cursor threaded through the top-left stack in
`view/hud.js` (hearts -> burden bar -> TRIBUTE), and right-align the favour
value inside the measured frame instead of after the name. No new mechanism;
`view/hud.js#depth` and the ruler already do exactly this.

### 8. The underground is unreadable, and the thing cycle 3 sends you for is invisible
**Size: `tuning-only`.**

What is wrong: at 97 M with no light source the viewport is **entirely black** —
no walls, no floor, no player sprite (`shots/30-deep-dark.png`). With a
`timber/brand` lit (`brandLevel` 9, `lightFalloffAir` 1) the lit pool reads as
two or three tiles of very dim brown and the player is barely visible
(`shots/31-deep-brand.png`). With `revealAll` on the tin seam at 98 M, the tin
sparkle is a faint blue speckle on near-black (`shots/32-tin-seam.png`).

Why it costs fun: the reward for the longest journey in the game cannot be seen,
and 482 s of stair mining happens in the dark.

Recommendation: raise `brandLevel` (9 -> 12) and add a floor to the emitter
term so the player's own two tiles never render below a readable level. Both are
`data/tuning.js` rows; `lightMax` is 15 so there is headroom.

### 9. There is nothing in the Heavens
**Size: `content-only`, and it is the next thing worth building.**

What is wrong: the astral band is a 128-tile stone shelf, a solid black
interior, and one 2x1 dock. `shots/12-dock-placed.png` is genuinely beautiful
and genuinely empty. D5 is right that the player should not be walled out and
that the gods should not speak here — but "cargo ascends" currently means "you
walk two tiles and press LMB three times".

Recommendation: the cheapest thing that would pay is a **ledger** — a drawn
record on the dock of what this god has taken this run, readable from the
surface through the existing hover tooltip. `data/machines.js#cloud_dock`
already has the buffer and `run.tribute.have` already has the numbers.

---

## Bugs found

A bug, not a design problem. Each is reproducible from seed 1337 through the
test hook.

**B1 — the craft queue's recipe id is never read; two hand recipes are
unreachable.**
`src/rules/crafting.js:35` (`choose()` scans `HAND_RECIPES` in declaration order
and ignores the queue), `src/shell/main.js:114` (the queue only asserts
`cmd.craft`), `src/shell/ui.js:290` (`queueCraft` pushes an id nothing reads),
`src/shell/main.js:742` (`tickCraftQueue` dequeues on *any* `'produce'` row, so
the queue drains cleanly while making the wrong item).
Driven: click GEAR holding 12 ore + 9 logs + 6 gravel -> `furnace/rig` in 8.0 s.
Complete reachability sweep: `daedalan` and `auger` are unobtainable at any
inventory. `src/shell/main.js:601-610`'s own comment shows the first-match
behaviour was known; the consequence for an *affordable* queued row was not.

**B2 — the ADAMANT AUGER cannot exist in any run.** Follows from B1:
`data/recipes.js#kindle` (1 `timber/log`) is declared before `auger`
(2 `copper/plate` + 1 `timber/log`) and is a strict subset of it, so every
inventory that can afford the auger produces brands instead. Consequences:
`docs/SPEC.md` §18.4's "the auger becomes necessary" for cycle 4 is false, and
the only tier-2 tool in the game is a drafted `talos_head`. Same for
`daedalan`/`copper/stair`, shadowed by `peg_rungs`.

**B3 — the furnace grant is never announced.** `src/view/fx.js:53` keeps exactly
one toast line; `rules/grants.js#step` awards `furnace` and `cloud_dock` in the
same substep, so `THE CLOUD DOCK IS GRANTED` overwrites the furnace line inside
its own frame. `src/shell/notify.js:106-126` already documents this class of
collision for `cycle`-vs-`grant` and solves it with the banner slot; the
grant-vs-grant case was missed. Screenshot `05-cycle1-paid.png`.

**B4 — the depth gauge is off by two tiles and never reads 0M on the spawn
floor.** `src/view/hud.js:454` measures `player.y` (the top of the 16 px body)
against the datum, so a player standing on the spawn floor reads **`+2M`**, and
standing 8 tiles down the beat-3 shaft reads **6M**. `CLAUDE.md` D9 and
`docs/SPEC.md` §18.2 both fix 0 M at the spawn floor. `depthReached()` at
`src/view/hud.js:1173` has the same offset, masked by its `Math.max(0, ...)`.
Fix is `player.y + PH`.

**B5 — the title banner draws over the main panel.** Opening the Character or
Crafting tab while the boot banner is still up (`shell/boot.js`'s own 2.6 s)
paints `MYTHOS FACTORY / TORMENT I`
across the inventory grid and the recipe list (`shots/22-crafting.png`,
`shots/25-crafting-hover.png`). `docs/SPEC.md` §18.9 places the draft modal
above the banner; the main panel is below it.

**B6 — the Character tab's burden label is drawn outside the panel frame.**
Read back from `__mf.ui.bars`: the `burden` bar is `{x:204, w:232}` in buffer
pixels, i.e. flush to the panel's inner right edge, and its `valueText`
(`26.4 / 40 T`) is then painted immediately after the bar — past the frame, onto
the world. Confirmed in `shots/26-character.png`.

**B7 — doc drift, `docs/SPEC.md` §17.11.** It states the crank verb is "`f`, a
HOLD, in `cmd.craft`'s shape". It is `r` / `cmd.action`
(`src/shell/input.js`'s binding-set comment records the Phase 12d rename, and
`src/rules/drive.js:183` reads `cmd.action`). Also §5's "ascent takes ~4x the
descent" measures 1.29x on the shipped stair (3.0x like-for-like), and §5's
beat 2 "hold `c`" completes in one substep.

**B8 — `docs/SPEC.md` §4 and §5's window for cycle 1 is 5x the measured time.**
Machine-perfect play pays the first trial at `run.t` **36.67 s** against a
0:00–2:00 sheet. Not a code bug; the sheet should either say what it is (an
upper bound for a first-time human) or the beats should carry enough content to
fill it. Finding 3 is the same observation as a design note.

---

## What I could not test, and why

- **Cycle 3 and cycle 4 end to end.** Cycle 3's dominant term is ~482 s of
  diagonal stair mining to reach tin at 100 M, and cycle 4 adds ~270 s more to
  reach granite at 156 M. Driving that through the test hook is 12–20 minutes of
  simulated time and several hundred scripted mine-and-walk steps; I measured
  the rates that decide it (stone 1.608 s/tile, 3 tiles per stair level,
  tin row 64, granite row 120) and tested the mechanisms in isolation instead.
  **The cycle-3 and cycle-4 rows of the time table are arithmetic, not
  observation**, and the "one guaranteed miss" conclusion should be re-checked
  by someone who plays it.
- **Whether the intended 3-segment chain can be *built* by a player**, as
  opposed to whether it runs. I proved the motion, the band handoff and the
  tribute credit on a real segment, but I placed the two intermediate hubs
  through `model/machines.js#write.place` (the director route, which asks nothing
  about footing) because a hub in the 20-row air gap needs a placed-`block`
  platform and I ran out of budget before building one. The chimney requirement
  and the ragged astral floor are both measured; the platform chain is not.
- **The trinket, boon and miracle tiers.** Cycle 2's draft raised correctly
  (grant tier, 2-of-2, reroll refused with `THIS IS ALL THERE IS`) and I took no
  card in a run that continued, so nothing below was exercised: no trinket was
  equipped, no boon ran, no miracle was used, and `conflictsWith` was never
  observed. `docs/DESIGN.md` claims all four work; this playtest neither
  confirms nor denies it.
- **Whether the art is good.** Screenshots prove appearance, not quality.
  `12-dock-placed.png` and `03-out-of-shaft.png` read as genuinely handsome to
  me; `30-deep-dark.png` reads as broken. That still needs a human.
- **Audio.** Headless; `shell/audio.js` never unlocked. Every claim about
  feedback above is about text and pixels only.
- **Real pointer input and other viewports.** Every press was dispatched by
  re-implementing `shell/input.js#pointerdown`'s rule order in the driver rather
  than by a DOM event, so a defect in the handler itself — as opposed to in the
  rules it dispatches to — would not show here. `tests/visual.spec.js` has one
  real-click regression test for rule 2; nothing covers rules 1 and 3.
