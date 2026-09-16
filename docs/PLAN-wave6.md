# Wave 6 — terrain, width, the menu, and the missing verbs

**Status: PLAN. Phases 6a and 6b are running; nothing else has started.**

Eight feature requests, scoped against the repo at `1e511c3`, with the four
open design questions already answered by the user (§2). Every `file:line`
below was read out of the working tree.

Read `CLAUDE.md` (especially §"Resolved decisions") and `ARCHITECTURE.md`
(§1 the layer graph, §5 the tunable store, §7 what was already rejected)
before touching anything. `docs/BUILD_PLAN.md` §1 states the process rules
this wave inherits unchanged.

---

## 1. What the requests turned out to be

Three of the eight are much smaller than they read, and one is already built.
That is the most useful output of the scoping pass, so it goes first.

| # | request | what it actually is | size |
|---|---|---|---|
| 1 | better surface terrain | `rules/generate.js`'s relief is 3 octaves capped at 6 tiles that may only go **up** from `floorTy`, plus a ±1-tile-per-column slope limit. That is the sawtooth. | **large** — full rewrite, user's call |
| 2 | main menu | nothing exists; `index.html` boots straight into `newRun()`. Needs a menu, a save, and a storage-rule amendment. | **large** |
| 3 | ore remaining | depletion is fully modelled (`model/mining.js#progressAt`) and already drawn as notches (`view/scene.js:388`). The tooltip just never prints the number (`view/hover.js:89-93`). | **small** |
| 4 | quickbar left-click | already dispatched (`shell/main.js:684`), but `shell/input.js#onAlwaysOnUi:511` only whitelists the `hints-toggle` rect, so with no panel open the click falls through to the world and mines. | **~5 lines** |
| 5 | resource/craftable list | a generated reference doc. | **small** (running, 6a) |
| 6 | queue digging | holding LMB and sweeping **already** mines continuously — `cmd.mouse` latches at `pointerdown` and `aim` follows the pointer. The ask is to stop having to hold it. | **medium** |
| 7a | infinite horizontal | `docs/PLAN-horizontal-chunks-SCOPE.md` §7's W-a…W-e intermediate. | **medium** |
| 7b | farm trees | **already shipped** (Phase 15): seed drops on the last trunk tile, `timber/seed` plants via `placeTile`, `rules/growth.js` grows it in `eff('treeGrowSecs')` 180 s. `seedYield` is **1**, so a grove can never expand. | **2 numbers** |
| 8 | debug clarity + scenarios + find the fun | debug mode exists and is undocumented: `h` toggles `flags.showDebug`, and `t/b/k/y/p` sit behind it (`shell/input.js:416`). Scenarios and a playtest report are new. | **medium** |

---

## 2. Decisions taken by the user, binding on every phase below

**U1 — `localStorage` is now allowed.** `CLAUDE.md`'s "No `localStorage` /
`sessionStorage`" convention is retired, accepting that the game may fail in
some sandboxed embeds. The phase that lands the save amends that bullet in
the same commit and says why.

**U2 — the save payload is seed + player edits, never a world snapshot.** A
run is bit-reproducible from its seed (invariant 7), so the save stores the
seed plus only what the player changed: the tile edit set, the dig ledger,
the growth map, machines, segments, and the `run` ledger. Load regenerates
the world from the seed and replays the edits. Kilobytes, and exact.

**U3 — the world widens to a bounded 1,024 tiles, not to unbounded.**
W-a…W-e from `docs/PLAN-horizontal-chunks-SCOPE.md` §7, which changes **zero**
binding documents and rewrites no generator. The unbounded recon pass (§8 of
that document) stays unscheduled.

**U4 — terrain gets the full heightmap rewrite.** The octave-sum is replaced
by a real landform pipeline, and `docs/SPEC.md` §16's locked numbers are
rewritten with it. **Constraint, and it is the whole trick of this phase:
the depth datum does not move.** See 6c below.

**U5 — the dig queue is drag-painted and reach-bounded.** Drag marks tiles;
on release the player keeps mining marked tiles **within `eff('reach')`**,
nearest first, with no button held. Marks outside reach persist and resume
when the player walks into range. **No pathfinding and no auto-walk** — the
player still has to position themselves, which is what keeps attention a cost.

**U6 — debug scenarios are a named data table**, reachable from the menu's
debug section and by `?scenario=<id>`, and reusable as test fixtures.

**U7 — the playtest phase reports and implements nothing.** Findings are
ranked and classified; what gets built is decided after reading it.

**U8 — the icon reference is a doc only.** No generated contact sheet.

---

## 3. The two serialisation constraints that shape the wave

Neither is negotiable, and together they are why this wave is five waves and
not one.

**S1 — `src/view/**` is a single serial chain.** Not a file-overlap rule: a
view change re-accepts screenshot baselines, and two agents re-accepting
concurrently produce a baseline set neither of them verified. This is the
same rule that kept Phases 8, 8b, 8e, 9 and 13a→13b→14c→15→16c serial.

**S2 — `shell/input.js` and `shell/main.js` have one owner per wave.** They
are the central wiring files; nearly every feature here wants a line in
both. Rather than serialising the whole wave behind them, every feature
phase lands its own `data`/`model`/`rules`/`view` pieces with **no input
wiring at all**, and one late phase (6o) wires them all at once.

Consequence worth stating: **6i and 6n leave the dig queue unreachable by a
player until 6o lands.** That is deliberate and is not a broken build — the
model and the renderer are both exercised by the test hook in the meantime.

Additional single-owner-per-wave files: `src/data/tuning.js`,
`src/data/world.js`, `src/model/world.js`.

---

## 4. The phases

Reviewer after every phase, per `docs/BUILD_PLAN.md` §1.2, output to
`docs/REVIEW-wave6-<phase>.md`. Definition of done is `docs/BUILD_PLAN.md`
§1.4 unchanged: `npm run check` at 0 layer violations, `npm run lint`,
`npm run test:visual` (or a re-accepted baseline **with the commit saying why
the pixels moved**), only files in the ownership block touched, every new
number a `data/tuning.js` row read through `eff()`, and every number
`docs/SPEC.md` should own in `docs/SPEC.md` first.

### Wave 6.1 — read-only (parallel, running)

| phase | agent | owns | what |
|---|---|---|---|
| **6a** | `cartographer` | `docs/ICONS.md` | every legal substance × form pair, machine, recipe and modifier row, enumerated from the tables via `forms.js#expand`/`holdable`, with the pixel constraints an icon must satisfy. Request 5. |
| **6b** | `general-purpose` | `docs/PLAYTEST.md` | drives the real game through `__mf` to cycles 1–3, times every beat, reports where the fun is missing, ranked and classified `tuning-only` / `content-only` / `small rules change` / `structural`. Implements nothing (U7). Request 8, first half. |

### Wave 6.2 — terrain (serial; 6c is in the view chain)

**6c — the heightmap rewrite.** `systems`.
Owns `src/rules/generate.js`, `src/data/world.js`, `src/model/tiles.js`,
`src/view/paint.js` **(the sky test only)**, `docs/SPEC.md` §16.

One agent owns both the generator and that one view file deliberately: with
relief able to fall below `floorTy`, `view/paint.js`'s excavated test paints
cave shading into open sky, so splitting them leaves a commit that renders
wrong.

**THE DATUM DOES NOT MOVE, AND HERE IS HOW.** `CLAUDE.md` D9 anchors the HUD
gauge and `cyclops_maw`'s `minDepth:200` to the same datum — `worldY` of the
spawn band's `floorTy` (`view/hud.js:450-455`, `model/run.js`). Lowering
`floorTy` to make room for valleys would silently move 0 M and re-price
every depth-gated placement. So **`floorTy` stays the spawn-shelf row**, and
what changes instead is `view/paint.js`'s rule: air below `floorTy` is
"excavated" only when it is **not sky-exposed**. `model/tiles.js#skyExposedAt`
and `#worldSkyAt` already exist and are already trusted by
`npm run check`'s section 8o. Valleys become legal without the datum, the
depth gauge, or `minDepth` changing meaning at all.

Also in scope: the ±1-tile slope limit is re-derived rather than deleted —
`rules/player.js#moveX`'s auto-step clears exactly one tile, so a two-tile
rise is still a wall. Rolling hills must be walkable hills. Keep `SHELF`'s
19 guaranteed-flat spawn columns and keep every `rand()` call in a fixed
traversal order (invariant 7); `hash2` stays banned from the generator for
the reason its header gives.

Acceptance: boot three seeds, screenshot the surface band, and look at it.
Hills read as landforms with valleys between them; no sawtooth; no cave
shading in the sky; the spawn shelf is flat; a walk from spawn to each map
edge is unblocked; `npm run check`'s worldgen and seam sections pass.

**6d — reviewer** on 6c.

### Wave 6.3 — world width, W-a…W-e (serial after 6c)

| phase | agent | owns | what |
|---|---|---|---|
| **6e** | `systems` | `src/data/world.js`, `src/model/world.js`, `src/rules/reveal.js`, `src/rules/light.js`, `docs/SPEC.md` §1 | W-a `tw:128 → 1024` on all three bands; W-b's overflow-proof coordinate keys (§3.2, without going signed); W-c `reveal.js` Pass A scoped to a radius/viewport (§3.3) and `light.js`'s per-recompute allocation made proportional to the lit region (§3.4). Re-measure and report boot time, allocation and worldgen time. |
| **6f** | `ui` | `src/view/paint.js`, `src/view/overview.js` | W-b's paint-cache eviction (§3.7 — 1,280 chunks ≈ 84 MB unevicted at the new width) and W-d's fit-to-width overview projection (§3.8), the design decision included. |
| **6g** | `harness` | `tools/`, `tests/` | W-e band-edge camera and player-clamp tests (§3.12 — no test exercises a band edge at all today), plus the Phase 11 property sweep re-run at 1,024. |

Reviewer after each. `docs/PLAN-horizontal-chunks-SCOPE.md` §3 is the
blocker list these three retire; cite its item numbers in each commit.

### Wave 6.4 — systems features (6h, 6i, 6j parallel; 6k after 6i)

Disjoint ownership, no view files, no `shell/input.js`, no `shell/main.js`.

**6h — save and load.** `systems`.
Owns `src/shell/save.js` (new), `docs/SPEC.md` §27 (new), and the
`CLAUDE.md` storage bullet (U1, amended in this commit with its reason).
Seed + edit set per U2. `localStorage`, one slot, versioned schema that
refuses a payload it does not recognise rather than half-loading it. The
load path must go through `newRun(seed)` first so invariant 8 still holds —
a save is applied **on top of** a clean run, never instead of one. Exposes
`save()`, `load()`, `hasSave()`, `clearSave()` and nothing else; wires no
input. A round-trip must be bit-exact: save, reload, and the epoch-visible
state matches.

**6i — the dig queue.** `systems`.
Owns `src/model/digqueue.js` (new), `src/rules/mining.js`,
`src/data/tuning.js`, `src/shell/schedule.js`, `docs/SPEC.md` §28 (new).
Per U5. `model/digqueue.js` owns the marked set and the "nearest marked tile
within reach" query — a number and a query. `rules/mining.js` owns the
decision to swing at it. Key the set the way `model/mining.js` and
`model/growth.js` both key theirs (band ordinal prefixing the band-local tile
index) and clear an entry from `model/tiles.js#write.setByte`, the one funnel
every terrain edit passes through — the same argument D14-E and
`model/growth.js`'s header both already make. Cleared by `newRun()`
(invariant 8). Its place in the rules order goes in `schedule.js` with a
comment on every adjacent pair. **No input wiring** (S2).

**6j — debug scenarios.** `systems`.
Owns `src/data/scenarios.js` (new), `src/rules/scenarios.js` (new),
`docs/SPEC.md` §29 (new). Per U6: a frozen table of named builders, each a
function applied **after** `newRun()` that places machines, fills pockets and
advances cycle state. Ship at least `winch` (a working segment + drivetrain
the player can ride), `belt-line` (a fed production chain), `cycle2` and
`cycle3` (armed at the trial, stocked to attempt it). Every machine id,
substance and form a row names must be validated the way
`tools/content.mjs` assertion 19 validates a cycle's demands — a scenario
naming content that cannot exist must fail the build, not the click. **No
menu entry and no URL parsing here** (both are 6l/6o).

**6k — tree farming.** `systems`. After 6i (shares `data/tuning.js`).
Owns `src/data/tuning.js`, `src/data/drops.js`, `docs/SPEC.md` §22.
Request 7b is two numbers: `seedYield` is 1 (`data/tuning.js:269`), so
felling a tree returns exactly one seed and a grove can never grow. Raise it
so planting is expansion rather than break-even, and re-check
`treeGrowSecs` 180 s against what 6b measured a cycle actually takes. Read
`data/tuning.js:262`'s own note first — `seedYield` is deliberately a yield
and **not** a `chance`, and that stays true.

Reviewer after each.

### Wave 6.5 — view chain and wiring (strictly serial)

| phase | agent | owns | what |
|---|---|---|---|
| **6l** | `ui` | `src/view/ui/menu.js` (new), `src/view/scene.js`, `src/view/ui/state.js` | the main menu and the keyboard-shortcuts page, canvas-drawn per D2: `R()`/`lineTo()`, the 5×7 bitmap font, integer pixels, no `fillText`, no DOM. NEW RUN / SEED / CONTINUE (gated on `hasSave()`) / CONTROLS / SETTINGS / DEBUG. The shortcuts page is generated from one keymap declaration, not a second hand-written list that can drift from `shell/input.js:109`'s. Reports its rects into `view/ui/state.js#drawn`; hit-tests nothing (D2). Needs 6h's API to exist. |
| **6m** | `ui` | `src/view/hover.js` | request 3: print units remaining on a deposit tile. `model/mining.js#progressAt(b,tx,ty,hard,charge)` is the number and `baseChargeAt` the denominator; the tooltip today stops at label/mass/hardness/tile-capable (`:89-93`). |
| **6n** | `ui` | `src/view/hud.js` | draw the dig queue's marks (6i). Distinguishable from the reticle and from the build ghost; marks out of reach must read as deferred rather than as broken. |
| **6o** | `systems` | `src/shell/input.js`, `src/shell/main.js`, `src/shell/ui.js`, `src/shell/boot.js`, `index.html` | **the wiring phase.** Boot into the menu instead of into a run; menu navigation and the run/menu state machine; `?scenario=` and `?seed=`; save/load triggers; the dig queue's drag-paint gesture on LMB (it must not disturb `docs/SPEC.md` §23.2's four-rule pointerdown dispatch — a drag that starts on rule 4 paints, a drag that starts on rules 1–3 does not); and request 4, extending `onAlwaysOnUi:511` to the quickbar's own recorded rect so an always-drawn quickbar cell takes the click instead of the world. |
| **6p** | `harness` | `tools/`, `tests/` | tests for all of it: a save round-trip proved bit-exact, menu boot and navigation, every scenario booting and being playable, the dig queue mining hands-free within reach and deferring outside it, and a quickbar click arming rather than mining. `CLAUDE.md`: drive input through the keyboard or the model, never through hardcoded screen geometry. |

Reviewer after each.

---

### Wave 6.6 — finishing request 1 (added mid-wave, from 6c)

6c delivered the landform pipeline and killed the sawtooth — direction changes
per 128 columns went from a median of 43 to a median of 8 over 200 seeds — but
**two thirds of request 1, not all of it.** Two things are left, and both were
found by 6c rather than planned.

**6r — the sky reaches the real skyline.** `ui`. View chain, before 6s.
Owns `src/view/scene.js`.

**My own §4 6c plan had a hole and 6c was right to stop at it.** Making air
below `floorTy` transparent does not reveal sky, because
`view/scene.js#drawSky:236` paints sky only down to
`horizon = origin.y + floorTy * tile` and the backdrop below that is
`INK.void` (`scene.js:108`). 6c photographed the result at `dip:4` — a hard
black band hugging every valley floor, and a hand-dug shaft (geometrically a
one-column valley) turning from a warm lit hole into a flat black slot. So it
shipped `dip` at **0** and made `paint.js#excavated` a *union*
(`ty >= floorTy || !skyExposedAt(...)`) rather than the pure sky test I
specified. That union still bought the real fix — a tunnel driven sideways
into a hilltop used to paint sky gradient *inside the hill* — but it left
below-datum valleys unbuilt.

This phase makes `drawSky` paint to the actual skyline per column instead of
clamping at `floorTy`. Then `excavated` can become the pure sky test and `dip`
can be spent. Note `tools/worldgen-check.mjs:342-350`'s relief budget is
one-sided and will fail the day `dip` is nonzero; 6c wrote out the one-line
fix in `docs/FINDINGS.md`.

**6s — terraces read as slopes, in paint.** `ui`. View chain, after 6r and 6e.
Owns `src/view/treatments.js`, `src/data/world.js` (the `dip` value only).

6c's honest reservation, which I confirmed by reading the committed
`surface-hills` and `cliff-face` baselines: **the flanks read as terraces.** A
±1-tile-per-column slope limit on 8 px tiles cannot produce anything else, and
relaxing the limit is not available — `rules/player.js#moveX`'s auto-step
clears exactly one tile, so a 2-tile rise is a wall and the hills stop being
walkable.

The fix is therefore not geometry, it is **paint**, and `CLAUDE.md` D7 already
argues this exact case: non-interactive detail is a `view/treatments.js#TREAT`
entry reached from a `look:{}` row, deterministic from tile coordinates
through `hash2`, at zero tile cost and zero collision change. A bevel/scree
treatment on the outer corner of a step makes a staircase read as a slope
without the terrain changing at all. The grass fringe and canopy entries are
the precedent; extend `TREAT`, do not add a second paint pipeline.

Spend `dip` in the same phase, once 6r has made it safe.

### Wave 6.8 — acting on the playtest (added mid-wave, from 6b)

`docs/PLAYTEST.md`'s verdict is that the game is not fun yet and that thin
content is not the reason: **ascent is free, so the premise never fires.** A
28-rung timber ladder turns the 240 px climb to the Heavens into 7.5 s of
holding one key at any load under 30 T, and pays cycle 2 with 410 s left on a
480 s clock without touching a hub, segment, carrier, crank or gear. The
transport system the game is named around is strictly dominated by a ladder.

U7 said the playtest reports and implements nothing. The user then read the
report and authorised these five phases.

**6t — the premise retune.** `systems`. After 6k (shares `data/tuning.js`).
Owns `src/data/tuning.js`, `docs/SPEC.md` §2/§3/§9/§17.
Both levers at once, per the user: nerf the ladder and buff the carrier.
6b's numbers, to be re-derived rather than pasted: `climb` 30 -> 10 px/s,
`burdenSoft` 0.75 -> 0.30 (so the 12 T knee actually bites a 7.2 T tribute
load), `segUp` 11 -> 40, `segLoad` 0.025 -> 0.010. Note `climb`'s existing
note already says "half walk, on purpose. Up is expensive." — the number
never matched the sentence. **`segUp`'s note is the harder argument to
answer:** it is 11 because "the retired winch deck ascended at this exact
number: a carrier is not faster than what it replaces." Raising it to 40
retires that constraint deliberately and the commit must say so. D10 is right
that the crank's currency is the player's standing attention; 6b's measurement
is that the exchange rate is wrong, and **the crank must not become passive.**
Acceptance is a re-run of 6b's measurement, not a green test.

**6u — a hand-craft makes the recipe the player clicked.** `systems`. Running.
Owns `src/rules/crafting.js`, `src/shell/main.js`, `src/shell/input.js`.
Not a bug fix: `shell/main.js:107-114` documents the one-intent design and
`crafting.js:28` says "first match wins, a real menu would let you choose."
Phase 17j built the menu; the simulation never caught up, so clicking GEAR
while holding 12 ore and 9 logs produces a `furnace/rig`. The queued id rides
on `cmd` (which `crafting.js#step(dt, cmd)` already takes) rather than `rules`
reading `shell`.

**6v — every recipe is reachable, and kindle stops multiplying fuel.**
`systems`. Running. Owns `src/data/recipes.js`, `src/data/machines.js`,
`tools/content.mjs`, `docs/SPEC.md` §8/§13.
`daedalan` and `auger` are unobtainable at any inventory, and
`tools/content.mjs` has a reachability fixpoint that does not catch them —
establishing whether that is a harness gap is worth more than the content fix.
`kindle` turns 1 log into 3 brands, on the game's binding constraint.

**6w — the depth gauge measures the feet.** `ui`. View chain, after 6r.
Owns `src/view/hud.js`.
`view/hud.js:454` measures `player.y` against the datum, and `PH` is 16 on an
8 px tile, so standing on the spawn floor reads **+2M** instead of 0M. One
line, but it is the HUD's most-read number and D9 anchors `cyclops_maw`'s
`minDepth:200` to the same datum — check whether placement legality reads the
same expression before changing either.

**6x — the cycle-1 reward is announced.** `ui`. View chain, after 6w.
Owns `src/view/fx.js`.
`view/fx.js:53` — the furnace grant, which is the entire point of the First
Trial (`docs/SPEC.md` §4), is silently overwritten by the cloud dock toast, so
the player may never learn they earned it. `banner`/`title` is a single slot
with no queue.

---

### Wave 6.7 — the catch-box reach bug (added mid-wave, from 6j)

**6q — `itemsIn` re-tests the rect.** `systems`. Sequence after 6p.
Owns `src/model/items.js`, `src/model/space.js` (its header only),
`docs/SPEC.md` §17 and §18.3.

Found and measured by 6j, verified independently. `model/space.js:32-33`
states the contract — "May visit an occupant whose exact position is outside
`r`; callers that care re-test" — and `model/items.js:83#itemsIn` is the only
caller and **never re-tests.** So the real reach of every catch box, every
pickup radius, every carrier grab and every belt is the 32 px `BUCKET` grid
(four tiles), not the rect the caller asked for.

The measured consequence, from 6j's `winch` scenario: a haul released at the
top of a segment comes to rest 6 px below a 10 px carrier box — 1 px outside
it — and is re-grabbed as cargo on the next frame because both sit in the same
bucket. **Releasing the crank carries delivered ore back down the shaft.**

This is one rect test. It is a separate phase rather than a one-line fix
because it narrows every catch box in the game simultaneously and starts
enforcing margins `docs/SPEC.md` §17 and §18.3 currently lock but never
exercise — the dock's `catchBox.slack` of 6 derives to 4.5 px against a real
rect test. Expect tuning to follow, and expect 6j's scenarios and 6b's
playtest timings to be the evidence for it.

---

## 4b. CLOSEOUT — what actually landed, and what the wave learned

**Status: the wave ran to 29 phases, not the 16 planned.** Every extra one was
found *by* a phase rather than scheduled: 6b's playtest drove five, 6c's own
reservation drove two, and reviews and measurements drove the rest. The plan
above is the record of intent; this section is the record of fact.

### The eight requests

| # | request | outcome |
|---|---|---|
| 1 | surface terrain | landform pipeline; direction changes per 128 columns median 43 -> 8 over 200 seeds; valleys below the datum at `dip:2`; one-tile steps read as turf ramps. **Remainder:** the soil courses under the turf still step. |
| 2 | main menu | four pages, one `localStorage` slot, CONTINUE gated on `hasSave()` with the refusal reason shown, Escape reaches it mid-run, shortcuts drawn from a single 29-row `KEYMAP`. |
| 3 | ore remaining | `UNITS n / charge` on a deposit tooltip, sharing `scene.js`'s exact derivation so the number and the depletion notches cannot disagree. |
| 4 | quickbar left-click | `onAlwaysOnUi` extended to the quickbar's recorded rect; a click arms instead of mining. |
| 5 | resource list | `docs/ICONS.md`, generated from the tables. **Its finding reframed the request:** 41 of 44 holdable pairs have no sprite at all, so this is "icons at all", not "better icons". |
| 6 | dig queue | drag-paint, reach-bounded, hands-free, commits to a tile and finishes it; three mark states drawn. **Remainder:** velocity-aware selection, so a full-speed pass finishes a tile. |
| 7a | horizontal extent | 128 -> 1,024 tiles (8,192 px), paint-cache eviction, reveal throttled, light windowed, `count` replaced by width-independent `dens`. **Bounded, not infinite** — see U3 and §5. |
| 7b | tree farming | `seedYield` 2 (the smallest integer that compounds); groves rather than an even scatter. |
| 8 | debug + fun | five driven scenarios reachable by menu and `?scenario=`; `docs/PLAYTEST.md`; and the three-phase premise fix it exposed. |

### The premise fix, which was not on the list

`docs/PLAYTEST.md` measured that a 28-rung timber ladder made the whole
transport system pointless: ascent was free, which `CLAUDE.md` calls a bug
rather than a feature. Three phases (6t, 6t-2, and the harness work between
them) landed `climb` 30 -> 10, `burdenSoft` 0.75 -> 0.20, `segUp` 11 -> 26 and
`segLoad` 0.025 -> 0.0125. The cable now beats the ladder **2.60x** on a
two-crank rig and **5.93x** at 38 T, and the ladder refuses 41 T outright.
One crank remains at parity with legs; the user chose to leave the second
crank as the upgrade.

### THE LESSON: a gate that was told to look away, four times

Three of these **blocked a correct change** rather than catching a bug:

| where | what it did |
|---|---|
| `tools/content.mjs` assertion 23 | caught all three shadowed recipes and **allowlisted them by name**, with a written deferral |
| `tools/check.mjs` felling probe | hardcoded `seeds !== 1` — pinning the exact tunable 6k existed to raise |
| `tools/check.mjs` seam probes | `seamRun(260, ...)`, a budget calibrated to `climb` 30 — blocked the premise fix for a whole phase |
| `tools/worldgen-check.mjs#keyOf` | packed a 1,000 stride against a `tx` reaching 1,023, aliasing two tiles |
| `.oxlintrc.json` | existed all along with `no-undef` off, while `CLAUDE.md` claimed there was no config and `FINDINGS.md` claimed the file was uncommitted |

**And the worse inverse.** `rules/mining.js#aimAtKeys` resolved one tile at the
player's centre row while the player occupies two, so held `right`+`dig` moved
a player *exactly as far as `right` alone, to the pixel, on all 12 seeds* — for
the entire life of the project. Every gate passed it, because every test and
every screenshot scene drives mining through the mouse or through the model.
A gate that never exercises the path cannot fail. `cmd.up` had the same defect
and was fixed in the following phase.

**The standing rule, now enforced in `tools/`:** a probe may not hardcode a
number it could derive from the tunable or the data row that declares it, and
every new assertion is made to fail on purpose once before it is trusted.

### Still parked, with the reasons

- **The soil staircase under the turf** (request 1's remainder). Geometry and
  the reason it stopped are in `docs/FINDINGS.md`; it needs `decorate` to hand
  `grassCap` a resolved rock swatch.
- **Deferred vs in-reach dig marks** are closer in contrast than deferred vs
  worked. The cheapest next step is named in FINDINGS.
- **Velocity-aware dig-queue selection.** Nearest-first is locked by SPEC
  §28.1/§28.2; preferring the mark *ahead* of the player is a design change.
- **`rules/drive.js` release timing** — the other half of 6j's report: cargo
  rests 4.04 px below the anchor against a ±5 px grab window and falls 0.02 px
  in one substep before `haul()` re-takes it.
- **`rules/belts.js`** — a belt whose lip abuts rock spends a charge every
  other frame forever. Predates the wave.
- **`resolveStraightDown` assumes `tile:8`.** Works only because `PH / 2` and
  `band.tile` coincide; invariant 2 permits a band to declare its own tile size.
- **The miracle tier is unreachable in play.** No cycle drafts it; the only
  path to a phial is a debug key. `rules/miracles.js` is complete.
- **10 of 44 holdable pairs have no source**, including the whole
  `adamant/ingot -> plate -> stair` chain (adamant mines to gravel, so the ore
  never exists).
- **`invSlots` has no save version hash**, so changing that tunable
  mis-restores an old inventory silently while the payload stays internally
  consistent.
- **`__mf.hold` leaves `cmd` set after it returns**, so a partial key set leaks
  into the next scene. A footgun under every test in the suite.

### One correction worth keeping

6q reported that a placed miner's output cannot feed a furnace. **That
overstates it.** `copper` and `tin` declare `drops:'ore'`, `smelt` takes
`'*/#ore'`, and at `cyclops_maw`'s `minDepth:200` (topsoil row ~164) both
blobs exist. A maw biting the *stone matrix* yields gravel that nothing
smelts, which is ordinary "place your miner on the ore".

---

## 5. Explicitly not in this wave

- **Unbounded horizontal generation.** U3. `docs/PLAN-horizontal-chunks-SCOPE.md`
  §8's recon pass stays unscheduled, and invariants 2 and 7 are untouched.
- **Acting on 6b's findings.** U7. The report lands; what gets built from it
  is a wave-7 decision.
- **Auto-walk or pathfinding.** U5. The dig queue is reach-bounded.
- **Multiple save slots.** A roguelike needs one.
- **New icons.** 6a says what needs drawing; the drawing is not this wave.
