# AUDIT — Phase 0 targeted hardcode census

Scope: exactly `docs/BUILD_PLAN.md` Phase 0. Read-only. Dense tables,
`file:line`, no proposals, no code. Cross-reference: `ARCHITECTURE.md`,
`CLAUDE.md`, `docs/BUILD_PLAN.md` phases 1-4.

---

## 1. Literals that must become tunables

| file:line | literal | meaning | tuning.js row |
|---|---|---|---|
| `src/rules/mining.js:38` | `HARD_BREAK = 0.5` | base-seconds threshold above which a break pushes journal kind `breakHard` instead of `breakSoft` | **keep — journal-kind selector, not a mechanic.** Agree with the file's own comment: the tile-break test (`work < hard`, line 96) and the drop (line 99-110) run identically on both sides of this constant; it only chooses which string `push()` carries, which only ever reaches `shell/notify.js` for sound/chip selection. Nothing downstream gates on it. |
| `src/rules/player.js:113` | `hurt(5, 'THE VOID')` | hearts of damage for falling out of the world (bottom of the last band) | should read `eff('fallMax')` (already a `tuning.js` row, base `5`, `unit:'hearts'`) instead of a bare literal — it is meant to equal "the whole heart bar", and a boon that ever changes `fallMax` would silently desync void-death lethality from ordinary fall lethality. Not a new row; a wiring fix. See `docs/FINDINGS.md`. |
| `src/rules/player.js:140` | `else if (v > 60)` | impact-speed threshold (px/s) above which a damage-free landing still pushes a `'land'` journal row (thud sound) | keep for now — no phase 2-4 mechanic reads or needs to bend this; candidate row `landThud` (value, px/s) only if a boon ever wants quieter/louder landings. |
| `src/rules/items.js:35` | `MAX_ITEMS = 400` | hard cap on live falling items, oldest evicted past it | keep — global engine safety valve, not scoped to a substance or machine; no phase 2-4 mechanic needs to change it. |
| `src/rules/items.js:40` | `MAGNET_DELAY = 0.35` | seconds before a freshly spawned item may be pocketed | candidate `pickupDelay` (value, s). Phase 2a's new drop verb (BUILD_PLAN Phase 2a step 0) reuses the falling-item idiom this delay already gates, so a player who drops ore to shed burden and immediately tries to re-pocket it is bound by this same number — worth exposing once burden exists. |
| `src/rules/items.js:44` | `BOUNCE = 0.3` | fraction of horizontal speed kept after a bounce | keep — physics feel constant, not named by any phase 2-4 mechanic. |
| `src/rules/items.js:112` | `if (Math.abs(it.vx) < 3) it.vx = 0;` | settle epsilon (px/s) to stop micro-sliding | keep — geometry/physics epsilon. |
| `src/rules/machines.js:113` | `m.fire - dt * 0.7` | per-frame decay rate of every machine's presentational "fire" glow value, shared across all machines | candidate `fireDecay` (value, /s), same shape as the existing `heatDecay` row (`src/data/tuning.js:68`) — currently a single magic number machine-agnostic and un-named. No phase 2-4 step explicitly asks to bend it, but Phase 2b's `light:{level, whileRunning}` key sits right next to this mechanism and a reviewer will ask why one is tunable and the other is not. |
| `src/rules/mining.js:109` | `(rand() - 0.5) * 24, -30 - rand() * 20` | horizontal scatter (±12 px/s) and vertical toss (−30 to −50 px/s) for a mined drop | see combined finding below. |
| `src/rules/trinkets.js:43` | `c.y - 24, 0, -60` | vertical spawn offset (24 px) and upward toss (60 px/s) for a drafted trinket | see combined finding below. |
| `src/rules/crafting.js:101` | `iw.spawn(player.band, c.x, c.y, sub, form, 0, -50)` | upward toss (50 px/s) for a hand-crafted output | see combined finding below. |
| `src/rules/machines.js:186` | `iw.spawn(m.band, mouth.x + mouth.w/2, mouth.y, sub, form, 0, -70)` | upward toss (70 px/s) for a machine's ejected output | see combined finding below. |

**Combined finding — the toss-velocity family.** Four call sites independently
hardcode a different upward-toss magnitude for the same `invariant 5` idiom
("mined/made/granted material becomes a falling item"): mining `-30..-50`,
trinkets `-60`, crafting `-50`, machines `-70`. `docs/BUILD_PLAN.md` Phase 2a
step 0 instructs the new drop verb to copy "exactly the idiom `rules/crafting.js`
and `rules/trinkets.js#grant` already use" — which is itself two different
numbers. Without a `tossUp`/`tossSpread` tuning row, the drop verb becomes a
**fifth** independently-chosen magic velocity. Candidate rows: `tossUp` (value,
px/s) and `tossSpread` (value, px/s), read through `eff()` at each of the five
call sites (four existing + the new drop verb).

| file:line | literal | meaning | recommendation |
|---|---|---|---|
| `src/model/run.js:114` | `if (run.hearts - n < 1) return false;` | floor: spending hearts through a `vital` source (the lift's blood-winch fuel) may never drop the player to 0 | keep — this literal is how "a machine may not kill you" is enforced; no phase 2-4 step asks to bend it, and turning it into a tunable would let a boon defeat that guarantee, which nothing in the plan authorizes. |
| `src/model/run.js:36,38` | `RUN_SCHEMA` `hearts:5, maxHearts:5` | starting/max hearts | keep — ARCHITECTURE invariant 6 locks health at five discrete hearts; a tunable here would let a boon violate an explicit invariant. |
| `src/model/player.js:18` | `PW = 6, PH = 16` | player hitbox | keep — file's own header states this is geometry, not a tunable (matches `CLAUDE.md`'s note that the 6px player in an 8px tile is deliberate). |

---

## 2. Literals that must become content rows

| file:line | literal | meaning | recommendation |
|---|---|---|---|
| `src/rules/items.js:35` | `MAX_ITEMS = 400` | global item-count cap | keep as engine constant — see section 1; not per-substance/per-machine, so it does not belong on a `data/` row. |
| `src/rules/items.js:40` | `MAGNET_DELAY = 0.35` | pickup-delay duration | candidate tuning row (section 1), not a content row — applies uniformly, not per item/substance. |
| `src/model/items.js:57` | `write.spawn(band, x, y, sub, form, vx = 0, vy = -40)` | default toss velocity, **never actually used** — every current caller (`rules/mining.js:108`, `rules/trinkets.js:43`, `rules/crafting.js:101`, `rules/machines.js:186`, `rules/lift.js:100`) passes explicit `vx`/`vy` | flag: a dead default that Phase 2a's new drop verb could be tempted to rely on implicitly rather than passing an explicit, tuned value (see the toss-velocity finding in section 1). |
| `src/rules/lift.js:33` | `DECK_GRAB = 3` | px slack around a lift stage's deck within which an item counts as "on the deck" | keep — shared physical constant of the deck mechanism itself, not per-machine content, even though the same machine row's `catchBox.slack` (data, value `2`) is content. No phase 2-4 step asks for a lift stage with a different grab window. |
| `src/rules/belts.js:47` | `GRAB = 4` | same idiom as `DECK_GRAB`, vertical settle band around a belt's ground line | keep, same reasoning. |
| `src/model/machines.js:34-37` | mouth rect insets: `y - 2`, height/width `4` (all four sides) | physical thickness of every machine's catch-mouth "lip", fixed regardless of footprint | keep — geometry shared by every machine uniformly, same category as `DECK_GRAB`/`GRAB` above. |
| `src/rules/machines.js:184` | `Math.max(1, Math.floor(clause.n * eff('yield', def.id)))` | floor of at least 1 output unit per recipe run | keep — a correctness floor ("a recipe that produced nothing is a sink"), not content to omit. |
| `src/model/journal.js:37` | `if (journal.length > 512)` | diagnostic-only console warning threshold ("is shell draining?") | keep — not a gameplay capacity. |
| `src/shell/notify.js:38-47` | `CHIPS` table: `{n, spread}` per journal kind (e.g. `breakHard:{n:9,spread:110}`) | particle-chip count/spread per event | **already deliberately excluded from `data/`** — the file's own comment (lines 36-37) states "Cosmetic, so the numbers live here rather than on a content row: a designer tuning copper does not want to think about sparks." Agree; no phase 2-4 step needs this data-driven. |

No mass/duration/count/capacity literals were found in `src/model/machines.js`
beyond the mouth-rect geometry above — buffer capacities are correctly sourced
from `def.buffer.cap` (data), and `catchBox.slack` is correctly a per-row
value.

---

## 3. Debug spawn paths

Every `if (k === ...)` / `KEYS` entry in `src/shell/input.js`, traced to
consumer.

| key(s) | sets | consumer | file:line | creates from nothing? | only entry point for a mechanic? |
|---|---|---|---|---|---|
| `w`/`↑` | `cmd.up` | `rules/player.js#step` (climb/aim-up), `rules/mining.js#aimAtKeys` | `input.js:50` | no — continuous movement | no |
| `a`/`←` | `cmd.left` | `rules/player.js#step` (walk) | `input.js:48` | no | no |
| `s`/`↓` | `cmd.down` | `rules/player.js#step` (climb), `rules/mining.js#aimAtKeys` | `input.js:51` | no | no |
| `d`/`→` | `cmd.right` | `rules/player.js#step` (walk) | `input.js:49` | no | no |
| `space` | `cmd.hop` (edge) | `rules/player.js#step` (hop) | `input.js:59` | no | yes, but expected — hop has no other binding and this is ordinary play, not a debug path |
| `x` / `j` | `cmd.dig` (held) | `rules/mining.js#step`, gated on `hasPick()` | `input.js:60` | no — requires held pick, held ore | no — left mouse button (`cmd.mouse`, `input.js:137`) is an alternate binding, unioned in `shell/main.js:69` |
| `e` | `cmd.place` (edge) | `shell/main.js#applyIntents:114-120` → `rules/placement.js#placeTile` | `input.js:61` | no — spends one pocketed tile-capable pair | **yes for the tile-placement mechanic itself** — right-click (`input.js:137`) is an alternate way to set the same `cmd.place` flag, but the `applyIntents` branch it feeds is the *only* code path that places a tile (ladder/log); there is no build-menu equivalent for tiles today. |
| `u` | `cmd.craft` (held) | `rules/crafting.js#step` | `input.js:62` | no — requires pocketed recipe inputs | **yes** — hand-crafting has no other entry point; only one key can hold it, since a player has one pair of hands. |
| `g` | `flags.showGrid` (toggle) | `view/` grid overlay | `input.js:72` | n/a — view flag | no |
| `c` | `flags.showChunks` (toggle) | `view/` chunk-boundary overlay | `input.js:73` | n/a — view flag | no |
| `h` | `flags.showDebug` (toggle) | today: only `view/hud.js:100` (debug HUD panel) | `input.js:74` | n/a — view flag | no — **not yet a gate on any mechanic.** Phases 3 and 4 both plan to route `F`/`L`/`T`/`B`/grant-debug behind this flag; that wiring does not exist yet. |
| `i` | `flags.showInv` (toggle) | gates the `1`-`9` build-menu digits (`input.js:97`) and the inventory panel (`view/hud.js`) | `input.js:75` | n/a — view flag | no, but it gates the sanctioned build-menu entry point below |
| `o` | `flags.showMap` (toggle) | `shell/main.js#step:61` (freezes simulation), `shell/main.js#applyIntents:103` (drops any press while open), `view/scene.js` (overview render path) | `input.js:82` | n/a — mode flag | no |
| `m` | `audio.muted` (toggle) | `shell/audio.js` | `input.js:83` | n/a — device flag | no |
| `f` | `wants.machine = 'furnace'` **(unconditional)** | `shell/main.js#applyIntents:105-112` → `rules/placement.js#placeMachine` | `input.js:84` | **yes** — `data/machines.js`'s `furnace` row carries no `cost` key, so `canAfford(undefined)` is always `true` (`model/run.js:149-156`); the only gates are `aim.valid`/`aim.band` and `canPlace('furnace')`, and `furnace` is in `STARTING_MACHINES` (`data/boons.js:51`) from run start. Places a complete machine for zero material. | **no** — digit `1` with `flags.showInv` open selects the same `'furnace'` id via the identical `buildableMachines()` list (`model/run.js:186-191`, furnace is index 0 of `STARTING_MACHINES`) and produces an identical free placement today. Removing `f` per Phase 3 step 4 does not remove the only way to place a furnace. |
| `t` | `wants.draft = 'trinket'` **(unconditional)** | `shell/main.js#applyIntents:125-129` → `rules/trinkets.js#draftable()[0]` + `#grant(id)` → `model/items.js#write.spawn` (physical item near player) | `input.js:85` | **yes** — no cost, no gate beyond "not already held" (`rules/trinkets.js:41`) | **YES — this is the only way to obtain any trinket in the game today.** There is no drop table, no rare-mining-drop, no draft UI (`docs/BUILD_PLAN.md` Phase 4 STEP 4 names all three as future work, none built). Deleting `t` without first shipping one of those sources makes `rules/trinkets.js#step` (the mod-sync that is the entire passive-modifier tier) permanently unreachable. Phase 4 itself is aware of this and sequences the replacement before the deletion; flagging so Phase 3 does not accidentally remove it first. |
| `b` | `wants.draft = 'boon'` **(unconditional)** | `shell/main.js#applyIntents:130-134` → `rules/boons.js#draftable()[0]` + `#grant(id)` → `model/run.js#write.grant(machineId)` | `input.js:86` | **yes** — no cost, no gate beyond "not already granted" (`rules/boons.js:25`) | **YES — this is the only way to grant any machine beyond `STARTING_MACHINES` today.** `data/boons.js` has exactly one row (`gift-kiln` → `kiln_divine`), and there is no god/director system that would otherwise offer it. Deleting `b` removes the only way to ever exercise the machine-grant tier (soon `rules/grants.js` per Phase 4 STEP 1's rename) until a director exists. |
| `l` | `wants.machine = 'lift'` **(unconditional)** | same path as `f` | `input.js:87` | **yes**, same reasoning as `f` (`lift` also has no `cost` key) | **no** — digit `2` (lift is index 1 of `STARTING_MACHINES`) reaches it identically while `flags.showInv` is open. |
| `r` | `wants.restart = true` | `shell/main.js#frame:211` → `boot.js#newRun()` | `input.js:88` | no — this is a full reset (invariant 8), not content creation | no — legitimate feature, not a debug path |
| `1`-`9` | `wants.machine = buildableMachines()[slot].id`, only while `flags.showInv` | same consumer as `f`/`l` | `input.js:97-103` | depends entirely on `def.cost` — currently free for every `STARTING_MACHINES` row since none but `belt_r`/`belt_l` carry a `cost` (`data/machines.js:236`) | **this is the sanctioned, surviving path** — `docs/BUILD_PLAN.md` Phase 3 keeps and extends it (adding real costs makes it non-free); it already cannot disagree with the HUD's BUILD list by construction (`model/run.js:182-185`). |

---

## 4. Hooks phases 2-6 will need

| hook | file:line | exists today? |
|---|---|---|
| Per-band `Uint8Array` alongside `model/world.js#b.seen`, for a light field | `src/model/world.js:56` (inside `write.allocate`, immediately after the `seen:` line) for storage; `src/model/world.js:72` (`write.reveal`) is the sibling writer a light writer would sit beside; `src/model/world.js:103` (`seenAt`) is the sibling query a `lightAt` would sit beside. | **No.** `b.seen` (line 56) is the only per-tile `Uint8Array` a band carries. No `b.light` field, writer or query exists anywhere in `model/`. |
| A per-frame rules step slot in `src/shell/schedule.js` for the new light step | `src/shell/schedule.js:100-113` (`STEPS` array) | **Exists as a mechanism (adding an entry is trivial), but the specific slot `docs/BUILD_PLAN.md` Phase 2b asks for does not exist today.** The plan requires the light step to run "AFTER mining ... and BEFORE reveal". The current order is `reveal` (`schedule.js:104`) **then** `mining` (`schedule.js:105`) — the opposite adjacency, justified at length in the header comment at `schedule.js:18-26` ("player before reveal ... it is placed immediately after its one dependency"). There is currently no adjacent `mining`→`reveal` pair to insert between. See `docs/FINDINGS.md`. |
| A drop-material verb | n/a | **Confirmed: does not exist.** No code in `src/rules/` combines `model/run.js#write.spend` (the only debit path for an *already-held* pocketed pair, called today only from `rules/placement.js:104` and `rules/machines.js:150`) with `model/items.js#write.spawn` (the only way to create a falling item, called today only to hand out *newly produced* material: `rules/mining.js:108`, `rules/trinkets.js:43`, `rules/crafting.js:101`, `rules/machines.js:186`, `rules/lift.js:100`). The nearest existing code is that same four-site falling-item idiom; a drop verb is `rw.spend` + `iw.spawn` at the player's feet, which no file currently does together. |
| A "which tool is held" query in `src/model/run.js` next to `hasPick()` | `src/model/run.js:197` (`hasPick`) | **No `bestTool()` exists.** Nor does the data it would read: `grep` of `src/data/substances.js` finds no `item.tool` block on any row, including `pick` (`substances.js:120`) — `docs/BUILD_PLAN.md` Phase 2c's plan to add `item.tool:{tier, power}` to the pick and a new auger row is entirely unstarted. |
| A place for a serialisable UI projection on `globalThis.__mf` | `src/shell/main.js:239-295` (`installTestHook`) | **The mechanism already exists and is the right place** — `hover`/`hits` (`main.js:250`) is the existing precedent for a read-back projection of `view/` state onto `__mf`; a UI-panel projection (Phase 5) would be one more property on this same object, alongside `newRun, step, draw, resize, clock, cam, player, run, aim, items, machines, cmd, flags, hover, hits, revealAll, mouseAt, frames, hold`. |
