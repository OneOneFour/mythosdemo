# Working notes

**What this file is.** A scratchpad for Claude sessions working in this repo:
observations about the codebase's quirks, decisions that were made
provisionally and will probably be revisited, gaps that are known and
deliberate, and inventories (key bindings, retired features) that are annoying
to re-derive. Most of it was extracted from source comments that were really
commentary *about writing the code* rather than something a reader of the code
needs — see `docs/COMMENT_AUDIT.md` bucket `4b`.

**What this file is not, and its authority level.**

| file | authority |
|---|---|
| `CLAUDE.md`, `ARCHITECTURE.md` | **policy.** Follow them. `ARCHITECTURE.md` governs rather than describes. |
| `docs/SPEC.md`, `docs/DESIGN.md` | locked numbers / design intent. Check before tuning. |
| `docs/DEVELOPER_GUIDE.md` | how to do a task correctly inside the rules. |
| `docs/FINDINGS.md` | the curated log of scope exceptions and deviations. Additions there are deliberate and reviewed. |
| **this file** | **scratch. Not policy.** Nothing here authorises anything. If it contradicts CLAUDE.md, CLAUDE.md wins. Facts here may be stale. |

Keep entries terse. Date anything time-sensitive. Delete an entry when it stops
being true rather than annotating it.

---

## Provisional content decisions, likely to be revisited

- **`STARTING_MACHINES` is a testability list, not a design.** `data/grants.js`
  hands out `furnace`, `lift`, `press`, `belt_r`, `belt_l`, `brazier`, `hearth`
  free at spawn purely because there is no director to decide when a god would
  offer one.
  - `press` free from spawn "is just an unused row on the HUD"; earned late it
    is refinement-quota pressure.
  - **`belt_r`/`belt_l` are the strongest candidates to move to `GRANTS`.**
    Belts are supposed to be rare per `docs/DESIGN.md`; a belt that costs plate
    *and* is handed out free at spawn makes the cost a tax rather than a gate.
  - `brazier`/`hearth` were added to the list only because nothing else can
    grant a machine yet, and their phase required them placeable without a debug
    key.
- **`hearth` is priced in plate (2 copper/plate, 4.8 T) rather than the essence
  tier `docs/DESIGN.md` actually wants for it.** Essence does not exist. Repricing
  it also means re-checking its position in the hand-recipe declaration order —
  it is currently declared absolute last *because* its bill is the weakest in
  the table.
- **The two placed miners are currently unreachable in play.** (Verified
  2026-08.) `talos_head`, `talos_head_l`, `cyclops_maw` and `cyclops_maw_l`
  appear in neither `STARTING_MACHINES` nor `GRANTS` — and `GRANTS` has exactly
  one row, `gift-kiln`. `rules/placement.js` refuses anything not in
  `run.granted`, so nothing in a real session can place either miner, despite
  the mechanic having interpreter support (`mine` key), tuning, build recipes,
  substances, `tools/content.mjs` assertion 14 and a structural T2==T3 proof in
  `tools/check.mjs`. Exactly the class of thing `ARCHITECTURE.md` §8 warns the
  checkers cannot see ("a machine with no way to be fed"). Either add `GRANTS`
  rows or add them to `STARTING_MACHINES` for testability like every other
  machine on that list.
- **`kiln_divine` is grantable but not placeable.** It has no substance row and
  therefore no build recipe, because its inherited bill is bit-identical to
  `furnace`'s and `rules/crafting.js#choose`'s first-match rule could never fire
  it. Fixing this means either retuning its bill (inventing a number nobody set)
  or giving `choose()` a real menu.
- **The placeholder identity glyph** (`view/ui/mainPanel.js#glyphOf`) is a 1-2
  letter code off the substance's `short`/`name`, standing in until real
  iconography exists.

## Known gaps and unwired scaffolding

- **`run.tribute` is written but nothing ever completes it.** Consequently
  `data/drops.js`'s `trigger:'tribute'` rows are never consumed; only the `mine`
  trigger is live.
- **`run.known` has no locking source.** It is seeded with *every*
  `HAND_RECIPES` id at reset, so nothing is actually locked. The
  locked-silhouette render path in `view/ui/mainPanel.js` is real and wired but
  unexercised, and the screenshot test says so explicitly.
- **No draft director.** All four gift tiers are only reachable from a debug key
  (`t`/`b`/`k`/`y`, behind `flags.showDebug`) or, for trinkets, the rare mining
  drop. `shell/main.js:228` notes these are exactly the calls a director would
  make.
- **No save string.** The `run`/`meta` split is shaped so adding one is a
  serialiser, not a refactor. Keep new `run` fields plain-serialisable.
- **Field diffusion is deliberately not implemented.** `model/fields.js` and
  `rules/fields.js` are a seam, not a solver: storage, an active set, an
  emission path, a recipe gate and an overlay all exist; transport does not. A
  solver goes inside the one decay loop (`i - b.tw` for buoyant heat,
  `i + b.tw` for water) and nothing else changes shape.
  - **Downstream:** `press` deliberately carries *no* `needs:{heat}` gate, even
    though "sit a press above a furnace" is exactly what `needs` is for, because
    heat does not rise. Wire that gate the day diffusion lands.
- **ZzFX covers one-shots only.** Continuous ambience (lava rumble with depth, a
  machine hum tracking production) needs persistent oscillator nodes and is
  deliberately absent.
- **`'lost'` was a pre-existing unused journal kind** before the timed-boon tier
  used it; `shell/notify.js#TEXT` already rendered "THE GIFT IS WITHDRAWN".
  Worth checking for other unused kinds before inventing one.
- **Deep bands are all allocated eagerly at boot.** A production build would
  allocate them lazily; `shell/boot.js:89` notes the seam is identical.

## Open cleanups

- **Four toss magnitudes were never migrated.** `eff('tossUp')`/`eff('tossSpread')`
  exist so new drop verbs stop inventing a magnitude, and the *new* sites use
  them — but `rules/mining.js`, `rules/trinkets.js`, `rules/crafting.js` and
  `rules/machines.js` each still hardcode a different one. Deliberately left;
  see `docs/FINDINGS.md`'s toss-velocity finding.
- **Two journal kinds are borrowed rather than dedicated.** The drop verb
  (`rules/items.js:99`) and deconstruct (`rules/placement.js:115`) both reuse
  `'place'`, which renders as "<X> PLACED" — the wrong verb, the closest shape
  already wired. Adding `'dropped'`/`'deconstruct'` needs a `data/sfx.js` row
  and a `shell/notify.js#TEXT` entry.
- **The `LOGISTICS` tab's machine state is a heuristic** and collapses several
  distinct stall causes into `STALLED` — a full output port, a cold `needs` gate
  and a servo throttle are indistinguishable without importing `rules`, which
  `view` may not do. If this matters, the answer is another `model/machines.js`
  query in the shape of `statusOf`/`fuelSelectorOf`, not a `rules` import.
- **The old text `invPanel`** (`view/hud.js`, `flags.showInv`) is superseded by
  the CHARACTER and CRAFTING tabs and only still draws in a rare desync (Escape
  closing `'main'` without touching `flags.showInv`). `'i'` toggles both systems
  at once. A cleanup would retire the old panel and the flag together.

## Retired features — do not reintroduce

- **`f`/`l` debug keys** spawned a furnace/lift from nothing. Incoherent once
  placement always costs a held item. Use the debug grant key (`k`) plus a
  hand-craft.
- **The digit-driven BUILD menu** and `model/run.js#buildableMachines()`. It read
  a `def.cost` that has been `undefined` on every machine row since machines
  became held items, so its affordability display had been permanently wrong.
  Digits now arm quickbar slots. `canAfford` went with it.
- **`run.trinkets`** as a second inventory beside `run.inv` — the two could
  disagree. Now `run.equipped` is a selection over `run.inv`.
- **The always-on pocket strip** (`view/hud.js#pockets`) — clutter; replaced by a
  compact burden bar, with the detail moved to the CHARACTER tab.
- **`view/ui/state.js#drawn.buttons`** — added for the LOGISTICS tab's BUILD row
  list, removed with it.

## Key binding inventory (as of 2026-08)

Checked before adding a binding. `KEYS` table plus every `if (key === ...)` /
`if (k === ...)` in `src/shell/input.js`.

| taken | for |
|---|---|
| `w a s d`, arrows | movement |
| space | hop (edge) |
| `x`, `j` | dig (hold) |
| `e` | place (edge) |
| `u` | craft (hold) |
| `q` | drop heaviest (edge) |
| backspace | deconstruct (edge) |
| `v` | use a miracle (edge) — mnemonic is thin ("vial"), everything nearer "use" was taken |
| `p` | equip first unequipped trinket (edge) |
| `i` | inventory: toggles `flags.showInv` **and** the panel stack |
| `g` | grid overlay · `c` chunk overlay · `h` debug overlay |
| `o` | map overview ("overview"; `m` was mute, every other mnemonic taken) |
| `m` | mute · `r` restart |
| escape | blur search, then pop the top panel, and cancel an armed placement |
| digits 1-9,0 | arm the matching quickbar slot |
| `t` `b` `k` `y` | debug grants: trinket / timed boon / machine grant / miracle — all behind `flags.showDebug` |

Free single letters at time of writing: `f`, `l`, `n`, `z`. (`f`/`l` were
deliberately freed; reusing them for something unrelated is fine.)

Rule of thumb: a key that **spawns something from nothing** goes behind
`flags.showDebug`; a key that **consumes something already held** does not.

## Test-harness traps worth remembering

- **`?test=1` starts no RAF loop.** A bare `page.mouse.click()` fires down+up
  with zero time between and `cmd.uiClick` is never processed. `realClick`
  inserts `__mf.frames(1)` between them. A right-click also needs a frame
  between *move* and *down*, because `aim` only resolves inside `step()`.
- **`settle()` advances `clock.t` but not `stepFx`**, so the 2.6 s opening title
  is still up and `drawHUD` draws the title card *instead of* the tooltip. Every
  hover test has to decay it first.
- **`MAGNET_DELAY` is 0.35 s ≈ 42 substeps.** Anything dropped at the player's
  feet is picked straight back up once it clears the delay. Bursts must stay
  under it; tests that need material to stay dropped need margin.
- **The first real pointer event sets `cmd.hasMouse`** and flips aim resolution
  from keys to the cursor for the rest of the run.
- **`digging.png` was, for a while, a screenshot of a stationary player.** The
  6 px hitbox straddles two 8 px columns; `aim` targeted only the centre one, so
  digging from an unaligned `x` wedged forever. Found while writing the
  functional shaft test, now fixed in `rules/mining.js#resolveStraightDown`. The
  general lesson is CLAUDE.md's: an assertion that passes suspiciously easily is
  probably looking in the wrong place.
- Same class: the furnace placement test had been screenshotting a "NEEDS CLEAR
  SPACE" refusal because nothing asserted the placement succeeded, and the
  baseline never said so.
- **All visual baselines remain UNREVIEWED.** They were taken mechanically after
  the architecture refactor to catch regressions, not because anyone judged them
  good.

## Structural observations

- **Perf caches keyed by the band object** (`rules/reveal.js`, `rules/light.js`)
  are safe without a reset hook only because `model/world.js#write.allocate`
  always hands out a fresh band record. If band records ever get reused, both
  caches become stale-read bugs with no `newRun()` wiring to fix them.
- **`hasPick()` migrated from `invCount(S.pick, F.relic)` to `bestTool() !== null`**
  and the two are true under identical conditions today only because the stock
  pick is the only tool a fresh run starts with.
- **`shell/main.js:522`'s union camera clamp** replaced a per-band clamp that
  pinned the camera short of a band seam and then snapped a full viewport in one
  frame when `player.band` flipped. That was "digging glitches at the bottom of
  the screen". Do not reintroduce per-band Y clamping.
- **`brandLight` exists as a tunable rather than a row literal** because the
  brand is a substance × form pair, not a machine, so `data/machines.js` had
  nowhere to put it. Useful precedent for any future non-machine emitter.
- **The craft queue is a UI convenience, not a mechanic.** `shell/ui.js#craftQueue`
  re-asserts the same single craft intent every frame it is non-empty and drains
  on a `'produce'` journal row. Actually running more than one craft in flight
  would be a change to `rules/crafting.js`'s one-pair-of-hands scalar. Open
  question on record in `docs/FINDINGS.md`.
- **`data/sources.js`'s own stated ceiling: three rows is worth the price, thirty
  would mean the architecture chose wrong.** Currently three (`buffer`,
  `pocket`, `vital`). Worth counting before adding a fourth.
- **`LAYER_BUDGET` is 0 and may only go down.** There is no headroom to spend.
