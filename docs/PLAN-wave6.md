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

## 5. Explicitly not in this wave

- **Unbounded horizontal generation.** U3. `docs/PLAN-horizontal-chunks-SCOPE.md`
  §8's recon pass stays unscheduled, and invariants 2 and 7 are untouched.
- **Acting on 6b's findings.** U7. The report lands; what gets built from it
  is a wave-7 decision.
- **Auto-walk or pathfinding.** U5. The dig queue is reach-bounded.
- **Multiple save slots.** A roguelike needs one.
- **New icons.** 6a says what needs drawing; the drawing is not this wave.
