# Comment audit

Classification of every multi-line prose comment block under `src/`, `tools/`
and `tests/`. 794 blocks. One-line comments, single-expression inline remarks
and single-line section rules (`/* ---------- the step ---------- */`) are out
of scope and not listed.

**Buckets**

| code | meaning | action in pass 2 |
|---|---|---|
| `1` | KEEP — docstring. Factual description of what a thing is / param / return / row shape. | none |
| `2` | KEEP — gotcha. Non-obvious constraint, ordering requirement, recorded bug at the exact line where a plausible "fix" would reintroduce it. | none |
| `3` | EXTRACT — developer guide. Reusable pattern prose. | replace with pointer to `docs/DEVELOPER_GUIDE.md#<anchor>` |
| `4b` | EXTRACT — brain. Real observation or revisitable decision, not needed by a reader of the code. | move to `.claude/brain/notes.md` |
| `4t` | TRIM — redundant. Process commentary, phase/file-ownership narration, restatement of what another doc already says. | delete, no replacement |

A block spanning two buckets is marked `1+3`, `2+4t` and so on, with the split described in
the summary. **`LAYER x — ... Imports ... May be imported by ...` declarations
are always `1` and never trimmed**, even when the rest of their block is `3`.

Collapsed rows (`several`) group adjacent blocks in the same file that are all
plain docstrings; their line ranges are listed so nothing is unaccounted for.

**Distribution, approximate.** Many blocks span two buckets and adjacent
docstrings are grouped, so a per-block tally is not exact. Counting each block
by its *primary* bucket: roughly 270 `1`, 220 `2`, 95 `3`, 70 `4b`, 140 `4t`.
The shape that matters: **`2` is the largest bucket and most of `src/rules/`
and `tests/` is in it** — the trimming pass should expect to remove far less
than the raw comment volume suggests.

---

## src/core/ — almost nothing to extract

Five of the six files are pure docstring plus one real gotcha each. No bucket-3
content except the two project-wide conventions noted.

| file:line | content | bucket | target |
|---|---|---|---|
| core/canvas.js:1-12 | LAYER header; canvas not resolved at module load, `stage` mutated by `attach()`, headless runs with `ctx===null` | 1+3 | mutable-state-on-an-object convention → guide §"Cross-module mutable state" |
| core/canvas.js:14-15, 20-21 | base resolution / `attach()` contract | 1 | — |
| core/canvas.js:45-47 | `offscreen()` returns `{canvas:null,g:null}` headless rather than throwing | 2 | — |
| core/font.js:1-15 | LAYER header; `fillText` forbidden project-wide; row 7 (descenders) dropped so every glyph fits the existing 7-row cell and no caller's line pitch changes | 1+2 | — |
| core/math.js:1-2, 8-9, 12-13 | LAYER header; rect shape; one overlap impl so catch box and hand-feed cannot disagree | 1 | — |
| core/palette.js:1-8 | LAYER header; hex lives here, checked names live in `data/palette.js`; add a name, never inline hex | 1+3 | guide §"Colour and appearance" |
| core/palette.js:33-38 | Phase 5b UI status colours; identical hex to what `hud.js` had inlined | 4t | delete; keep the one-line "same hex as hud.js's UI row" |
| core/palette.js:40-44 | why granite reads cool-grey vs iron-grey, adamant teal + glint | 1 | — |
| core/pixels.js:1-10 | LAYER header; every coordinate floored **here**, so there is no path to a sub-pixel anywhere in the renderer | 1+2 | — |
| core/pixels.js:36-37 | speckle uses a caller-seeded local generator, not `rand()` — a repaint must consume no run randomness | 2 | — |
| core/pixels.js:55-56 | glow is the one non-integer effect; additive light, so it cannot produce a half-pixel edge | 2 | — |
| core/rng.js:1-13 | `rand()` (stateful run stream, forbidden in render) vs `hash2()` (stateless, the only randomness `view` may use). Confusing them is a determinism bug | 2 | — |
| core/rng.js:32-34 | generator lives on an object because ES bindings are read-only to importers | 3 | guide §"Cross-module mutable state" |

## src/data/

### data/substances.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-58 | LAYER header; **substance-is-an-element rule**; full row-shape reference (`tags`/`tile.hard,drops,tier`/`item.mass,hud,tool`/`look`); "hard is SECONDS not a 0..255 byte, that byte made granite unmineable above 106 fps"; rows are append-only because index is half the tile byte | 1+2+3 | row shape stays; the element rule and append-only reasoning → guide §"Adding a substance" |
| 62-63 | "the commented row — copy the nearest one" | 1 | — |
| 76-80 | tin proves substance×form: adding it added no row to forms/recipes/machines | 3 | guide §"Adding a substance" |
| 88-90 | timber is fuel and ladder; its `log` form is tile-capable | 1 | — |
| 96-102 | canopy grows on a timber column's top tile via `skyExposedAt`, not "this is a trunk"; solid blocks beat a stochastic dot-cloud at this viewport | 2 | — |
| 105-107 | stone: no ingot because the crossing is limited by the FORM's `subTags`, not by a row here | 1+3 | guide §"Adding a form" |
| 113-115 | bedding planes free once `banded` treatment exists | 1 | — |
| 118-125 | bellows: **a trinket is a substance because it refines from nothing — it IS the element**; `TRINKET[id].mods` hangs off a substance id so there is no parallel "equipped" list | 3 | guide §"The four gift tiers" |
| 130-137 | pick: a capability GATE, not a `mods` row; planted near spawn, picked up like any material | 2 | — |
| 139-144 | `tool:{tier:1,power:1.0}` is behaviourally a no-op; `hasPick()` moved from `invCount` to `bestTool()!==null` under an identical condition | 4b | brain (migration record) |
| 148-156 | soil's `hi` is a soil tone, not green, because `paintTile`'s generic exposed-face pass fires for any open neighbour | 2 | — |
| 163-168 | grass cap gated on `skyExposedAt`; painting `hi` green put grass on cave ceilings | 2 | — |
| 171-176 | granite: first rock harder than stone; `tile.tier:2`, absent means 1 so existing rows unaffected | 1 | — |
| 184-191 | adamant: first rock also tagged `metal`; the tag admits a future ore/ingot path, mining still only yields gravel | 2 | — |
| 199-214 | auger: appended last per append-only rule; `tool.power:1.8` is the one number the T2/T3 equality proof rests on, read back generically by `rules/machines.js` | 2+3 | guide §"Tools are relic substances" |
| 219-240 | chasm: a miracle needs its own element for the same reason a trinket does; `tags:['miracle']` not `relic` so it can never satisfy a trinket selector — **plus** three paragraphs of "outside this phase's FILE OWNERSHIP, added anyway, loudly" | 2+4t | keep the tag/gate reasoning; delete the file-ownership narration |
| 245-263 | machine substances: one row per machine, `item.mass` is the machine's former `cost` bill summed via `massOfPair`, crosses into `rig`; no `tile`, `look.item` only — **plus** the Phase 3 design-reversal argument | 3+4b | pattern → guide §"A machine is a held item"; reversal history → brain |
| 265-268, 273-274, 279-280, 305, 310-312, 317-320, 325-328 | per-machine mass arithmetic (`12x1.0 + 6x0.8 = 16.8 T`) tied to SPEC §13 | 1 | — |
| 285-300 | mirrored pair `belt_r`/`belt_l` share ONE substance; `machineIdFor` resolves facing off `player.face`; two hand recipes with a bit-identical bill would be an unbreakable `choose()` tie | 2+3 | guide §"Mirrored machine pairs" |
| 333-342 | `kiln_divine` deliberately has no substance: its inherited bill is bit-identical to `furnace`'s, so a hand recipe could never fire; grantable but not placeable — a real gap | 2+4b | keep the tie reasoning; the gap → brain |
| 345-346, 350, 353 | derived indices built once, frozen | 1 | — |
| 359-364 | air and bedrock are pseudo-rows so `model/tiles.js` needs no boundary special case | 2 | — |

### data/forms.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-35 | LAYER header; the substance/form decision rule verbatim; row-shape reference (`massK`/`hudOrder`/`tags`/`subTags`/`tile`/`climbK`) | 1+3 | shape stays; the rule → guide §"Adding a form" |
| 51-62 | placeable rubble: gravel goes back through the same `placeTile` path; `hardK:0.5` is deliberately softer than any of the four native sources | 2 | — |
| 67-71 | `ingot` tag added beside `refined` so a press cannot also eat a plate fed back into it | 2 | — |
| 75-76 | `log` is the only tile-capable form; `solid:false,climb:true` is the ladder and is why a standing tree can be climbed | 1 | — |
| 83-87 | `relic`: `subTags:['relic']` keeps it out of every ore selector; one form covers every trinket, stride cost paid once | 2+3 | guide §"Adding a form" |
| 93-105 | plate: DESIGN's 12:1 ratio; same `subTags` as ingot; no `tile` block; `hudOrder` appended rather than renumbered | 1+2 | — |
| 111-123 | brand: `subTags:['organic']`; `massK:0.3` not 0.5 because `kindle` makes 3 brands from 1 log and the mass-conservation lint caught 3×0.5 > 1.0 | 2 | — |
| 129-135 | phial kept separate from `relic` on purpose — folding them would let a miracle satisfy a `#relic` selector | 2 | — |
| 141-159 | rung: `peg_rungs` makes 4 from 2 logs, not the 1 originally planned; mass and hand-craft-priority reasoning | 2 | — |
| 166-180 | stair: `climbK` is a new per-form multiplier; `massK:3.0` chosen against `daedalan`'s 4.0 mass ceiling | 2 | — |
| 187-215 | rig: the shared held-machine form; reverses Phase 3's cost-at-placement; **no `tile` block on purpose** — a machine places as a multi-tile structure through `placeMachine`, never as terrain | 2+3+4b | the no-`tile` warning stays; pattern → guide; the reversal argument → brain |
| 230 | `crossable()`: `subTags` is the whole rule | 1 | — |
| 237-248 | **tile-id packing**: `1 + subOrd*STRIDE + (formOrd+1)`, `NATIVE` vs placed, byte holds 50 substances, guard fails the build rather than wrapping | 1+2 | — |
| 263-277 | **the one selector grammar**, spelled in words because `*/` would close the comment | 1+2 | grammar reference also mirrored into guide §"Selectors" |
| 284-285, 299-300, 308-310, 320-322, 327-328 | memoisation of parsed selectors; `matches` null-side semantics; `expand` proves a selector is not empty (an empty one let tin pile up in a buffer no recipe consumed); `byHudOrder`; `labelOf` | 1+2 | `expand`-as-validator → guide §"Checkers" |
| 332-341 | `shortLabelOf`: `short` is authored data, not runtime truncation, because there is no `clip()` and no ellipsis | 2 | — |

### data/machines.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-106 | LAYER header; "read this block before adding a row"; the **full interpreter-key reference** (`tw/th`, `footing`, `ports`, `buffer.cap`, `catchBox`, `handFeed`, `emit`, `servo`, `recipes`, `lift`, `variantOf`, `look`, `light`, `mine`, `minDepth`); rows append-only. Plus a 20-line "NO `cost` KEY HERE ANY MORE" reversal narrative | 1+3+4b | key reference stays as the row's own docs; "how the interpreter reads a row" framing → guide §"Adding a machine"; the reversal → brain |
| 112-116 | furnace is the commented row; the recipe is the shared `smelt` row | 1 | — |
| 123-126 | ore cap 8 keeps the same 2-runs headroom fuel has at 2 — an asymmetric CAP, not an asymmetric ratio | 2 | — |
| 137-139, 191-197, 238-246, 418-422, 460-464 | per-machine "building one now costs `recipes.js#X`, a held `<id>/rig` spent at placement" | 4t | delete; the pattern is one guide section, and the bill is already in the recipe row |
| 145-153 | `kiln_divine`: the variant proof — six-line row plus one tuning line, no engine code learned "kiln" | 3 | guide §"Variants are nearly free" |
| 159-172 | lift stage: five stages are five records, never one continuous cage; **recipe ORDER IS THE DESIGN** (timber before hearts); `heart` is a bare unit from `sources.js` | 2+3 | ordering gotcha stays; charge/bare-unit mechanism → guide |
| 203-222 | press earns its own row rather than `variantOf` because its recipe shape differs; **no `needs:{heat}` gate** because `rules/fields.js` does not transport heat, so the gate would be permanently shut or trivially open | 2 | — |
| 229-230 | same 2×-recipe headroom rule as the furnace | 1 | — |
| 248-252, 312-317, 383-385 | `look.sfx` borrows an existing sound row; no dedicated sound is this machine's data to invent; a no-input/no-output recipe pushes neither `accept` nor `produce` | 1+2 | — |
| 257-297 | belt: deliberately rare and priced in plate; **runs no transform** so it needs a sibling rules module rather than a new `out` shape; the fuel recipe is the lift's honest-fuel row verbatim; `footing:4` works because the footing loop already walked every column; `belt.dir`; held belt places facing | 2+3 | keep the "runs no transform" and `dir` gotchas; charge/honest-fuel pattern → guide |
| 325-335 | brazier: same honest-fuel shape; `light:{level:12,whileRunning:true}` is "lit while fuelled" for free because `m.running` tracks a banked charge | 2+3 | guide §"Light emitters" |
| 354-365 | hearth: priced provisionally in plate rather than essence; no `recipes` so `m.running` never goes true; `light:{level:'max'}` with no `whileRunning` means "lit as long as it exists" | 2+4b | mechanism stays; provisional pricing → brain |
| 369-378 | an `in:{}` recipe is satisfied by construction and `secs:Infinity` means nothing is ever spent — present ONLY so the generic fire-glow look reads as lit | 2 | — |
| 388-406 | talos_head: `tier:2` deliberately identical to the auger's; `secs` is fuel duration, not rate; **the rate itself is not a row here at all** — `rules/machines.js#mine` reads the same two numbers hand mining does | 2+3 | guide §"Placed miners" |
| 433-448 | cyclops_maw: three tiles tall is WIDTH not speed; `tier:3` is unreachable by hand, so its own bill must be priced in granite-tier goods or nothing could build the first one; `minDepth:200` derived from adamant's own strata rows | 2 | — |
| 478-483 | variant expansion is a SHALLOW merge on purpose: a variant changing one port restates the whole array, which is legible where a deep array merge is not | 2 | — |
| 497-498 | fail at import on a mistyped colour name rather than paint a black box at depth 300 | 2 | — |

### data/recipes.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-48 | LAYER header; named vs inline rows; **the one smelt row** and the defect it fixes (two ores both `smeltsTo:'ingot'` made a tin ingot byte-identical to copper); full row shape (`in`/`from`/`needs`/`secs`/`out`/`hand`); `hand:true` is the SAME row, never a duplicate with different numbers | 1+3 | shape stays; smelt-row and hand/machine-sharing rules → guide §"Adding a recipe" |
| 52-93 | **machine-build recipes are declared before every other hand recipe, and the order is load-bearing**; the full pairwise containment table (`furnace`/`brazier` ⊃ smelt; `lift` ⊃ daedalan/auger; `cyclops_maw` ⊃ talos_head/press_machine; `hearth` ⊂ everything, so declared last) | 2+3 | the containment table stays verbatim; the first-match-wins rule → guide §"Hand-recipe declaration order" |
| 99-101, 121-124 | `secs` framed as the commitment the old placement toll expressed | 4t | delete |
| 106-107 | no `kiln_divine` row — see substances.js | 2 | — |
| 145-147 | named `press_machine` not `press`; two unrelated transforms share an English word | 2 | — |
| 164-168 | smelt reads 4, not the round 2 an earlier draft shipped; SPEC names it so the two cannot drift | 1 | — |
| 177-188 | press selects `#ingot`, not `#refined`, or a press would eat its own output; `subFrom` carries the substance the way smelt does | 2 | — |
| 197-218 | `peg_rungs` requires 2 logs and is declared before `kindle` because both fire off `timber/log:1` alone and `choose()` cannot see a tie; either order at 1 log starves one of them permanently | 2 | — |
| 227-234 | kindle: the first recipe whose output form is not a compression tier; declared after `peg_rungs` | 1+2 | — |
| 243-246 | daedalan: hand-only, no machine builds a ladder | 1 | — |
| 255-270 | auger declared last after `daedalan`: identical input keys at different log counts, so the stronger recipe must come first; a player wanting the auger keeps their log stock under 4 | 2 | — |
| 279-288 | hearth declared absolute last: 2 plate is a strict subset of every other plate-consuming recipe | 2 | — |
| 298-305 | `HAND_RECIPES` derived once so `hud.js`'s CRAFT list and `choose()` cannot disagree | 1+2 | — |
| 309-311 | `recipesOf` throws on an unknown name — a silently missing recipe is a machine that never runs and never says why | 2 | — |

### data/tuning.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-32 | LAYER header; **only `model/mods.js` may import this**, enforced; why (ES bindings read-only, frozen table, one lazy direct import would silently opt out of every trinket); `kind:'value'` vs `kind:'scale'` vs `scoped` | 1+3 | the import rule stays as a one-liner; the whole pipeline explanation → guide §"The tunable pipeline" |
| 45-48 | the fall table locked in SPEC §3, with the arithmetic | 1 | — |
| 59-64 | belt speed deliberately nearer `walk` than either lift speed | 1 | — |
| 70-79 | `sightRadius` is a GRAPH distance, not a straight line; Pass A is unbounded and reads nothing here | 2 | — |
| 87-89 | the variant proof: `rate.kiln_divine` is the only reason the kiln is twice as fast | 3 | guide §"Variants are nearly free" |
| 97-102 | burden triple (`burden`/`burdenSoft`/`burdenClimbFloor`); level walking and all downward movement are never scaled | 1+2 | — |
| 107-109 | `run.equipped` is a selection over `run.inv`, not a second inventory | 3 | guide §"The four gift tiers" |
| 112-115 | `lightMax` is both daylight and the emitter ceiling; two per-tile falloffs, rock lossier than air | 1 | — |
| 120-124 | `brandLight` added in a later phase because the brand is a pair, not a machine, so a `machines.js` literal had nowhere to live | 4b | brain (why a tunable exists rather than a row literal) |
| 127-130 | `toolTier` is a separate gate from `hard`, scoped the same way | 1+2 | — |
| 134-140 | `tossUp`/`tossSpread` exist so the new drop verb is not a fifth independently chosen toss magnitude; **the four existing call sites are deliberately left as-is** | 4b | brain (open cleanup) |

### data/world.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-36 | LAYER header; **the defect this file exists to fix** (module-constant world size + import-time allocation made multiple bands impossible); a band is a row, ordinals never assumed zero; `origin` in PIXELS not tiles; `fields`/`strata`/`look` shapes | 1+2+3 | the pixels-not-tiles gotcha stays; band-as-row pattern → guide §"Bands and worldgen" |
| 40-43, 54-57, 88-91 | per-band notes (astral inset, no heat by omission; `floorTy`/`spawnTx` band-local; topsoil shares tile size so a shaft crosses the seam cleanly) | 1 | — |
| 64-69 | **`lip:false` on the stone row is load-bearing** — without it `layer()`'s ragged carve punches air pockets along the soil/stone seam seven tiles underground | 2 | — |
| 72-79 | `toTy` must reach past `fromTy:20` or `trees()`'s base scan finds no solid ground and every column is skipped — it did, for every seed | 2 | — |
| 81-82 | the guaranteed first vein; `near:'spawn'` resolved by worldgen | 1 | — |
| 101-104 | deeper strata give the tier gate somewhere meaningful to bite | 1 | — |
| 114-116, 119-120, 126-127 | declaration order is depth rank; exactly one `spawn:true`; `STRATA_KINDS` for the generator's coverage assertion | 1+2 | — |

### data/sources.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-42 | LAYER header; **the one file in `data/` where a row carries code**; `from:` defaults to `'buffer'`; the full injected `api` surface; `units:'pair'` vs `'named'`; **the price**: not serialisable, not diffable, invisible to the resolver — three rows is worth it, thirty means the architecture chose wrong | 1+2+3 | the price paragraph stays; the mechanism → guide §"Non-item inputs" |
| 54-55, 78-79 | pocket source; `NAMED_UNITS` for the resolver | 1 | — |
| 63-68 | the refusal to spend the last heart lives on the SOURCE, not the lift row, so any future blood-fuelled thing inherits it | 2 | — |

### data/ — remaining tables

| file:line | content | bucket | target |
|---|---|---|---|
| boons.js:1-42 | LAYER header; the TIMED tier; `secs` refresh-not-stack; `conflictsWith` `suppress`/`invert` semantics resolved fresh every frame off the active list; `trap` is a reserved field. Opens with three paragraphs on the rename from the machine-grant tier | 1+3+4t | semantics → guide §"The four gift tiers"; rename narration deleted |
| boons.js:50-55, 65-70, 76-80 | the two worked conflict examples and the miracle-side-effect boon | 1+3 | guide §"The four gift tiers" (as the canonical examples) |
| grants.js:1-27 | LAYER header; grants change WHAT MAY BE PLACED, not a number; a run-state set, not a registry edit, which is why granting mid-run costs no architecture. Opens with the rename narration | 3+4t | pattern → guide; rename deleted |
| grants.js:39-59 | `STARTING_MACHINES`; `press`, `belt_r`, `belt_l` are PROVISIONAL and should move to `GRANTS` once a director exists | 4b | brain |
| grants.js:60-67 | `brazier`/`hearth` added outside the phase's file ownership for the same testability reason | 4t | delete (the provisional fact is already captured above) |
| drops.js:1-31 | LAYER header; the three trinket sources in priority order, of which only `mine` is live; row shape (`trigger`/`minTier`/`chance`/`give`) | 1+4b | shape stays; "tribute rows are unconsumed scaffolding" → brain |
| miracles.js:1-29 | LAYER header; a miracle is a held pair, `invCount(S[id], F.phial) > 0`; `effect.kind:'collapse'` picked over petrify because it needs no new tile-write verb; `effect.boon` | 1+3 | guide §"The four gift tiers" |
| trinkets.js:1-21 | LAYER header; a trinket is a name, a god and a list of mods; **no trinket code anywhere**; dotted scoped keys; order of application is a determinism requirement, not a nicety | 1+3 | guide §"The four gift tiers" + §"The tunable pipeline" |
| trinkets.js:27-29 | the scoped-key example: speeds `furnace`, not `kiln_divine`, and stacks on top | 3 | guide §"The tunable pipeline" |
| sfx.js:1-19 | LAYER header; **notification flows downward**; a kind with no `KIND_SFX` entry is silent on purpose; no assets, no loader; ZzFX covers one-shots only, ambience deliberately absent | 1+3+4b | pattern → guide §"Notification and the journal"; the ambience limitation → brain |
| sfx.js:21-24, 42-45 | the mapping is the `rules`↔`shell` vocabulary; ZzFX parameter order | 1 | — |
| sfx.js:63-65 | voice limiting is a cost problem as much as a loudness one — ZzFX builds a fresh buffer per call | 2 | — |
| palette.js:1-10 | LAYER header; why a checked name-set exists separately from the hex table | 1+3 | guide §"Colour and appearance" |
| palette.js:18-19 | `colour()` throws rather than returning a plausible black | 2 | — |

## src/model/

### Files with no extractable prose

All blocks below are plain docstrings (`1`) — row shapes, return contracts,
"called once per band from `shell/boot.js`". No bucket 3/4 content.

- `model/aim.js:1-13, 25-26` — but the first block's "in `model` because `view` draws the reticle and may not import `rules`" is `2+3` → guide §"Where does state go?"
- `model/space.js:21-22, 26-27, 34-36`; `1-13` closes with "NOT in the file list the brief gave; declared as an addition" → `4t`
- `model/mining.js:17-18, 45-46`
- `model/fields.js:24-26, 54-55`
- `model/items.js:47-50, 55-56, 71-72, 82-83`
- `model/journal.js:48-49`
- `model/boons.js:20-22, 30-33, 45-47`
- `model/tiles.js:30-31, 38-39, 51-53, 76-78, 88-90, 104-105`
- `model/world.js:28-29, 85-88, 116-118, 141-142, 146-148, 151-153, 161-162, 167-168`
- `model/machines.js:25-26, 41-43, 95-100, 110-111, 132-133`
- `model/mods.js:39-41, 69-70, 86-88, 91-92`
- `model/player.js:26-27`

### model/ — the rest

| file:line | content | bucket | target |
|---|---|---|---|
| mods.js:1-34 | LAYER header; **the whole tunable pipeline**: base vs effective, the three-way split, why a save is a seed plus trinket ids, the cost (one call per read plus a discipline that is a build failure), and the fixed order of application | 1+3 | the import rule and order formula stay; the explanation → guide §"The tunable pipeline" |
| mods.js:62-64 | per-scope base override is what makes a variant machine faster purely by tuning | 3 | guide §"The tunable pipeline" |
| mods.js:73-75 | a missing tunable throws because the resolver already proved every key in `data/` resolves | 2 | — |
| epoch.js:1-12 | LAYER header; the dynamic half of "view may not mutate model"; **honest limit**: covers writes through `write.*`, which is all of them by convention and none by proof | 1+2 | — |
| journal.js:1-24 | LAYER header; **a journal row is a FACT, not an instruction**; the cost (one frame late, implicit ordering, silent loss if nobody drains); `drain()` warns past a frame's worth | 1+3 | pattern → guide §"Notification and the journal" |
| mining.js:1-12 | LAYER header; a Map not a `Float32Array` (196 KB to describe three tiles); **seconds compared against seconds, so no framerate makes anything unbreakable** | 1+2 | — |
| tiles.js:1-16 | LAYER header; **mining progress is NOT here** and the byte-in-the-material-array bug that placement caused; out-of-bounds is BEDROCK, above a band is AIR, so no boundary special cases below this line | 1+2 | — |
| tiles.js:63-70 | `skyExposedAt` is a full walk to row 0 — true sky, not "the tile above is air"; only called from the chunk-paint pass, never per frame | 2 | — |
| tiles.js:123-125 | bump the neighbour chunk's version too when a tile sits on a seam, because edge shading bleeds | 2 | — |
| fields.js:1-15 | LAYER header; the heat seam; **diffusion deliberately not implemented** and where a solver would go; deliberately does not bump chunk paint version | 1+2+4b | the seam note → brain as an open design decision |
| items.js:1-17 | LAYER header; an item is a pair plus a mass, nothing else — purity/fragility/temperature deliberately absent; monomorphic ten-slot objects, not struct-of-arrays | 1+2 | — |
| items.js:28-32 | the `'sub/form'` string key: the slower representation chosen on purpose because a buffer is read by a human debugging a stuck factory | 2+3 | guide §"Buffers and pockets" |
| machines.js:1-12 | LAYER header; `def` is an index so the ROW is the definition and the RECORD is only what changes; buffers keyed by the pair string | 1+3 | guide §"Adding a machine" |
| machines.js:122-124 | `capOf`'s selector expansion memoised per selector — called per machine per frame by the servo | 2 | — |
| machines.js:141-154 | `fuelSelectorOf` FINDS the fuel selector rather than re-declaring it, so `statusOf` can never disagree with what the machine accepts; memoised per definition | 2+3 | guide §"Machine status queries" |
| machines.js:172-181 | `statusOf`'s three states; `'no-fuel'` is reserved for a machine that actually needs fuel; this function never has to know WHY a recipe did not fire | 1+2 | — |
| world.js:1-21 | LAYER header; **no module-scope dimension constant exists here, and that is the point**; threading `b` costs one parameter on forty call sites and buys three coexisting bands; the two coordinate spaces; `origin` in pixels | 1+2+3 | the two-spaces reference → guide §"Bands and worldgen" |
| world.js:39-44 | a per-chunk VERSION counter, not a dirty flag, because `view` cannot clear a flag; the epoch assertion forced this | 2+3 | guide §"View cache invalidation" |
| world.js:46-55 | fog `seen` is a dense `Uint8Array` not a sparse Set (unlike `fields#act`) because most tiles eventually get seen; does NOT bump `ver`; never reset short of `newRun()` | 2 | — |
| world.js:57-64 | `light` goes down as well as up, unlike `seen`; also does not bump `ver` | 2 | — |
| world.js:66-72 | `lightVer` exists because `setLight` fires per tile and would make one recompute look like hundreds of changes; it is the signal `reveal#passB` folds into its throttle | 2 | — |
| world.js:98-102 | `revealAll` is TEST-ONLY, exposed through `__mf`; nothing in real play calls it | 2 | — |
| world.js:105-113 | the starting skyline reveal exists because Pass A's per-column walk stops at a tree trunk and never reaches the ground it stands on; rows are contiguous so this is one `fill` | 2 | — |
| world.js:120-125 | `setLight` only ever raises, so a recompute lands at the brightest source; the caller clears first | 2 | — |
| world.js:135-138 | `clearLight` exists because raise-only cannot go dark on its own | 2 | — |
| player.js:1-11 | LAYER header; in `model` because `view` must draw the player; every physics number is a tunable, only the hitbox lives here because a hitbox is geometry | 1+3 | guide §"Where does state go?" |
| player.js:35-38 | every field is reset on spawn, not just position — surviving `coyote`/`walkPhase` made two runs of one seed render differently | 2 | — |
| player.js:57-65 | the fall table with its arithmetic; a query, not a decision; reads through `eff` so a trinket can add to `fallSafe` | 1+2 | — |
| run.js:1-26 | LAYER header; **the split**: does a death erase it? `run` vs `meta`; no save string yet but the shape is right; RUN_SCHEMA declares every reset field once (the old code disagreed with itself in four places) | 1+3 | guide §"Run state and RUN_SCHEMA" |
| run.js:47-48 | trinket and starting pick live in `inv` too | 1 | — |
| run.js:53-60 | `equipped` is a selection, not a second inventory; built fresh in `reset()` because an array on a shared frozen template would be one mutable reference every run shared | 2 | — |
| run.js:63-70 | `craftProgress` is a scalar not a Map — one pair of hands; a recipe change mid-hold restarts the bar | 1+2 | — |
| run.js:73-89 | `run.known` added out of ownership for the locked-recipe silhouette; shaped as an array to match `granted`; **seeded with every `HAND_RECIPES` id because no locking source exists** | 2+4b | the seeding fact stays; ownership narration and the open gap → brain |
| run.js:92-102 | `brandLeft` is a scalar for the same one-pair-of-hands reason; written by `rules/light.js`, outside this file's ownership | 1+4t | keep the scalar rationale; delete the ownership paragraph |
| run.js:116-117, 124-127, 129-133 | `reset()` is the whole of `newRun()` here; fresh arrays every run; `eff('trinketSlots')` read after `mods.clear()` per the load-bearing boot order | 1+2 | — |
| run.js:144 | `finishRun` is the only writer of `meta` | 1 | — |
| run.js:170-172 | hearts are SPENT, never an inventory item; the lift reaches them through `sources.js` | 2 | — |
| run.js:189-196 | `equip` out-of-range is a silent no-op, not a throw — a shrinking `trinketSlots` must not crash a frame iterating the old length | 2 | — |
| run.js:203-204 | the craft bar written as one pair so a recipe change and its reset cannot be observed half-applied | 2 | — |
| run.js:217-231 | machine items: "may this be placed" is "is one held"; **mirrored pairs derived from the `variantOf` + facing-override SHAPE, not hand-listed**, so a future pair needs no edit | 2+3 | guide §"Mirrored machine pairs" |
| run.js:237-241 | a machine id with no substance simply will not resolve, which is "never placeable" with no special case | 2 | — |
| run.js:244-248, 253-259 | `machineHeldSub` / `machineIdFor` contracts and their callers | 1 | — |
| run.js:267-284 | `placementCheck` is one implementation with two readers (`rules` turns false into a journal row, `view` into a tinted ghost) because `view` may not import `rules`; the check ORDER is structural-before-affordability | 2+3 | guide §"One decision, two readers" |
| run.js:302-303 | the depth gate uses the identical datum the HUD's gauge reads | 2 | — |
| run.js:311-321 | the winch reach check: **the same arithmetic `rules/lift.js#reaches` uses, deliberately duplicated across a layer boundary** because a model query may not import `rules` | 2+4b | keep the gotcha; log the duplication in brain |
| run.js:328-330, 337-341, 342-346, 356-358 | affordability now means holding an item; `pocketsHave` mirrors `rules/machines.js#best` because `view` needs it; `burden`/`burdenFrac` are queries, the decisions live in four `rules` files | 1+2 | — |
| run.js:370-376 | `canCraft` is display; `choose()` asks a strictly stronger question (one pair per clause) — related but deliberately not the same code | 2 | — |
| run.js:380-392 | a machine-build recipe is known only once its machine is granted, derived from the recipe's OWN output clause rather than a second id list | 2+3 | guide §"Adding a recipe" |
| run.js:399-403, 410-417, 430-435, 438-441 | `isKnown`; `bestTool` is a straight scan, not a cached field, because a field that can disagree with the pockets will; `hasPick` widened to any tool; `pocketRows` is the HUD's data source | 1+2 | — |

## src/rules/

### rules/machines.js — the interpreter

| file:line | content | bucket | target |
|---|---|---|---|
| 1-28 | LAYER header; **no machine name, no substance name, no magic number**; "if you want to add a machine you are in the wrong file"; the reading order; **THE HONEST COMPLAINT** and its three defences | 1+3 | the "wrong file, go to data/machines.js" pointer stays; the rest → guide §"Adding a machine" |
| 47-57 | the injected source api is the entire surface a `sources.js` row may touch; `buffered`/`pocketed` count the LARGEST SINGLE PAIR, not the sum, because a derived output takes its substance from the pair that satisfied it — buffer FULLNESS is the sum and is a different query | 2+3 | guide §"Non-item inputs" |
| 62-65 | both spends return the concrete pair taken — that return value is the whole of how one `smelt` row covers every ore | 2+3 | guide §"Adding a recipe" |
| 82-84, 103-105 | `best` over a `{pair: units}` ledger; `recipesOf` memoised per definition index | 1+2 | — |
| 126-129 | catch box: this one key is the thesis of the game | 1+3 | guide §"Adding a machine" |
| 146-149 | hand feed: the trap the design wants (hauling ore to a machine in the wrong place) is this working as intended | 1 | — |
| 172-174, 186-188 | spend through the declared source keeping each clause's pair; `yield` floored, never below one — a machine that consumed inputs and produced nothing is a sink | 1+2 | — |
| 196-198 | `out:[]` banks a CHARGE; `rules/lift.js` cannot tell a timber charge from a heart charge | 2+3 | guide §"Charges and honest fuel" |
| 204-206, 208-209 | first satisfiable recipe wins — ORDER IN THE ROW IS THE DESIGN; a stage holding an unspent haul does not burn more fuel | 2 | — |
| 227-229 | the `needs` field gate; delete the line and the recipe runs cold; a `max` beside a `min` is a temperature band | 1 | — |
| 241-243 | `rate` × servo; the servo is what keeps buffers bounded — without it a small surplus reaches FULL over ~20 minutes | 2 | — |
| 253-254, 266-268 | `emit`; `portFor` returns the selector because the cap is per selector | 1+2 | — |
| 277-290 | `mine`: gates on top of hardness, not a second hardness; "hands lose on headcount" enforced by both call sites reading the same formula off shared data; only the gate and the width vary between tiers | 2+3 | guide §"Placed miners" |
| 292-296 | `bestHandToolPower` scans every substance's `item.tool` rather than naming the auger, so a future tool raises miners and players the same day | 2+3 | guide §"Tools are relic substances" |
| 303-307 | first non-air tile in the face, top to bottom — once the top breaks it reads AIR and the loop finds the next one, so there is no "advance the target" state | 2 | — |
| 318-321, 331-336 | a WeakMap rate-limiter because more than one miner can stall at once; a WeakMap fuel accumulator rather than a machine-record field | 2+4t | keep the mechanism; delete the "not this phase's file to extend" clause |
| 348-350, 360-362 | tier refusal is a rate-limited journal row, not a silent stall; no-fuel IS a silent stall and is ordinary | 2 | — |
| 368-369, 373-375 | the one rate line; fuel drains with TIME chewing, not per tile broken | 2 | — |
| 384-385, 389-392 | read the drop BEFORE clearing the tile; `0.5` mirrors `mining.js#HARD_BREAK` **duplicated because `rules` siblings may not import one another** | 2 | — |
| 396-401 | invariant 5: the output DROPS at the out port, downward, and gravity (which already ran this frame) carries it | 2 | — |

### rules/mining.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-30 | LAYER header; the model/rules split and **the byte-progress bug: granite at 2.4 s died above 106 fps, i.e. on any 120 Hz display**; hardness is base plus modifier applied in exactly one place; tool tier is a gate, not a second hardness | 1+2+3 | the bug stays verbatim; the base-vs-effective rule → guide §"The tunable pipeline" |
| 46-47 | `HARD_BREAK` selects a journal kind, not a mechanic — the only number in this file | 1 | — |
| 50-55 | a single scalar rate-limiter, not a WeakMap: exactly one pick swings at one tile | 2 | — |
| 59-64 | the aimed point resolves to a BAND before a tile, which is what lets a shaft cross a seam; band-local-only would make every band floor unbreakable | 2 | — |
| 76-88 | **straight down is special-cased**: `PW` (6 px) is narrower than a tile, walk physics is never grid-snapped, and a fixed centre-x column leaves the other straddled column solid forever — the player wedged on what reads as open air | 2 | — |
| 104-113 | `resolveStraightDown` retargets whichever straddled column is currently solid, recomputed fresh, so the two break sequentially at full cost each; degenerates to centre-x when aligned | 2 | — |
| 145-147, 169-170, 180-182 | tier gate is a rate-limited refusal; a non-breaking strike is still a fact worth reporting; invariant 5 in one line | 2 | — |
| 188-204 | the rare trinket drop: odds live in `data/drops.js`, rolled through `rand()` immediately after the material drop so both draw from a fixed stream position; skips a trinket already held. Opens with "the one explicit exception to this phase's FILE OWNERSHIP" | 2+4t | keep the stream-position and skip rules; delete the ownership paragraph |

### rules/player.js

| file:line | content | bucket | target |
|---|---|---|---|
| 1-29 | LAYER header; **the three ported collision bugs, numbered** (`moveY` must report every landing; auto-step must apply on ladders; every field reset on spawn); "do not simplify this into a single swept AABB — the one-pixel stepping is what makes the snap flush, and flush is what makes a 5-tile drop measure exactly 40 px" | 2 | — |
| 45-47 | band handoff FIRST, or a shaft to the bottom of a band ends at an unbreakable BEDROCK floor | 2 | — |
| 51-52 | presentation timers in `model` because `view` reads them, decayed here because `view` may not write | 1+3 | guide §"Where does state go?" |
| 62-67 | encumbrance gates ASCENT only; walking level and every downward move never read either value | 2 | — |
| 70-71 | no horizontal acceleration on purpose — a momentum model makes a 1-tile corridor infuriating | 1 | — |
| 79-82, 87-89 | `climbK` is a property of what you built, so it multiplies both directions; descending is never scaled by burden | 2 | — |
| 128-130 | `fallFrom` is the APEX of the arc, not the launch point, so impact equals sqrt(2gh) even after a hop | 2 | — |
| 141-142 | clamp inside the band; its width is a row | 1 | — |
| 145-150 | void death reads `eff('fallMax')`, not a bare 5 — the two agreed only by coincidence and a boon would have desynced them | 2 | — |
| 157-167 | impact derived from DISTANCE FALLEN, not a velocity sample, so the SPEC table is exact at any framerate; both landings snap flush so `fallen` is an exact multiple of the tile size | 2 | — |
| 175-176 | report distance actually fallen — terminal velocity would under-report a long drop | 2 | — |
| 184-186 | damage is a decision with a model consequence; the notification is a journal row, never `play()` | 1+3 | guide §"Notification and the journal" |
| 195-197 | band handoff only ever into AIR | 2 | — |
| 212-214 | the tile grid is the only source of truth; no second collision model | 1 | — |
| 233-239 | the fastest `climbK` among occupied tiles; native tiles never carry `climb:true` per the FORM-wins rule, so `formAt` is always a real placed form | 2 | — |
| 253-254 | both axes step one pixel and snap flush | 1 | — |
| 263-271 | auto-step: **THE LADDER CASE IS NOT OPTIONAL**; both headroom probes required or the step teleports through a one-tile ceiling gap; **deliberately not gated on burden** because gating a height gain on state is exactly what wedged a player in their own shaft | 2 | — |
| 289-291 | both exits must report a landing (bug 1) | 2 | — |

### rules/reveal.js and rules/light.js

| file:line | content | bucket | target |
|---|---|---|---|
| reveal.js:1-59 | LAYER header; a tile once revealed is never re-hidden and the storage enforces it; Pass A unbounded / Pass B bounded flood and why two cheap passes beat one shadowcaster; the Phase 2b unlit-air gate; **occupied tiles, not one centre point** (a point would follow the player's waist) | 1+2+3 | pass structure → guide §"Fog, sight and light"; the permanence and hitbox gotchas stay |
| reveal.js:66-73 | perf cache module-local and keyed by the band OBJECT, because `newRun()` hands out fresh bands so there is no reset to wire up or forget | 2+3 | guide §"Module-local perf caches" |
| reveal.js:88-94 | Pass A gated on a cheap `skyExposedAt` over the hitbox only, so an underground player never pays for the band-wide pass | 2 | — |
| reveal.js:102-121 | **never call `skyExposedAt` per tile** — it walks to row 0 every call, close to quadratic over a 128×320 band; walk DOWN once per column instead; **REVEAL, THEN CHECK SOLID**, or the walkable surface stays fogged under a fully lit sky (a bug the screenshots caught) | 2 | — |
| reveal.js:129-162 | Pass B; **the throttle must not key on player position alone** — digging sideways while standing still is a WORLD change; chunk versions summed over the player's chunk plus neighbours because reach crosses a seam; `b.lightVer` folds in because a brazier never touches a tile byte | 2 | — |
| reveal.js:199-202 | past the first ring the flood may not continue into unlit air | 2 | — |
| light.js:1-42 | LAYER header; **`seen` is memory, `light` is a current condition** and this file owns only the second; weighted spread implemented as Dial's algorithm because a weighted flood cannot be visited in insertion order; no `rand()`; recompute gated on chunk versions summed band-wide PLUS an emitter signature | 1+2+3 | the two-facts split and the dirty-check design → guide §"Fog, sight and light" |
| light.js:63-78 | `brandLeft` is a scalar for the one-pair-of-hands reason; **auto-relights** with no separate verb. Includes a file-ownership deviation note | 1+2+4t | keep the mechanism; delete the ownership note |
| light.js:86-94 | emitters: no machine name here; `def.light` is a generic key; `level:'max'` is a sentinel because data cannot call `eff()` | 2+3 | guide §"Light emitters" |
| light.js:116-119 | a rolling hash of the emitter set, so "a brazier ran dry" is detectable without a deep equal | 2 | — |
| light.js:127-132 | dirty cache keyed by band object, same reasoning as `reveal.js` | 2 | — |
| light.js:143-150 | Dial's algorithm: buckets walked brightest-first; `best[i] !== lvl` on pop discards a stale entry rather than searching a bucket | 1+2 | — |
| light.js:164-170 | sky seeding walks down per column and never calls `skyExposedAt` — same quadratic trap `reveal.js#passA` documents | 2 | — |

### rules/ — the rest

| file:line | content | bucket | target |
|---|---|---|---|
| items.js:1-23 | LAYER header; **the swept collision is a fix, not a flourish** — one-shot integration point-sampled and an item at terminal velocity travelled 1.5 tiles, so ore fell through thin ledges; invisible at 60 fps, reproducible the moment the tab lost focus | 2 | — |
| items.js:34-35, 38-40, 43-44 | the item cap; `MAGNET_DELAY` exists so a drop is SEEN falling; bounce damping | 1+2 | — |
| items.js:47-48 | float slack so a pickup landing exactly on the hard cap succeeds | 2 | — |
| items.js:51-61 | a refused pickup must not re-push the journal every frame; keyed by object identity so a removed item needs no cleanup. Includes a phase-ownership aside | 2+4t | keep the mechanism; trim the aside |
| items.js:71-81 | the drop verb sheds the HEAVIEST held pair, not the first in HUD order; reads `eff('tossUp')` rather than a fifth independently chosen magnitude | 2+4b | keep; the four legacy magnitudes → brain |
| items.js:99-103, 120-121 | reuses the `'place'` journal kind because a dedicated kind was out of scope; a pickup crossing the hard cap is refused, never partial | 2+4b | keep the refusal; the borrowed kind → brain |
| items.js:136-137 | the spatial index is rebuilt once, AFTER every item has moved | 2 | — |
| items.js:148-149, 160-161 | no substep longer than half a tile — this is the whole of the sweep; x then y separately so an item sliding a wall keeps its fall | 2 | — |
| items.js:191-193, 204-206 | band handoff only into AIR; `rest` is a flag rather than a deletion so a pile whose support is dug out spills | 2 | — |
| lift.js:1-23 | LAYER header; invariant 4 (independent stages, never one cage) and why modelling a stage AS a machine keeps it that way; **the charge indirection is why the blood winch needs no code** | 1+3 | guide §"Charges and honest fuel" |
| lift.js:34-35, 62, 84, 94-95 | `DECK_GRAB` slack; ascend slow with a charge, descend free; items are world-positioned so carrying is one addition, no parenting | 1+2 | — |
| lift.js:47-53 | boarding upward is refused over the hard cap; the winch carries only material, so this is the one place the player's hitbox is tested against a stage | 2 | — |
| lift.js:72-76, 107-109 | the haul goes to whichever band the deck top physically occupies; changing an item's band means remove-and-respawn at the same world pixel | 2 | — |
| lift.js:121-123 | `reaches()` is a query, not an assertion — a short stage is a mistake a player is allowed to make | 1+2 | — |
| belts.js:1-36 | LAYER header; **a belt runs no transform**, so it is a sibling module rather than a new interpreter key; the mechanism is `lift#carry()` turned 90° and works because machines are not solid; power is the lift's own charge; deliberately rare | 1+2+3 | guide §"When a machine needs its own rules module" |
| belts.js:42-46, 60-64 | vertical slack mirrors `DECK_GRAB`; an item mid-fall is still `items.js`'s business, which is what lets a belt sit under a vein | 1+2 | — |
| belts.js:80-82 | backpressure, not a bug: no charge this frame means the item piles at the lip | 2 | — |
| belts.js:91-97 | **re-index NOW** — this is the whole of why `schedule.js` puts `belts` before `machines`; a catch box queries the grid `items.js` last rebuilt | 2 | — |
| crafting.js:1-23 | LAYER header; hands must not be strictly worse than the machine running the same recipe, or a machine earns its keep by having no substitute; progress is a scalar; unlike mining, releasing the key forgets the bar entirely | 1+3 | guide §"Adding a recipe" |
| crafting.js:33-37 | `bestPocketed` re-derived rather than shared because `rules` siblings may not import one another — eight lines is cheaper than a module neither may import | 2+3 | guide §"Duplication across a layer boundary" |
| crafting.js:47-52 | **first match wins; a real menu would let you choose**; returns which pair satisfied each selector so completion can spend and derive without re-matching | 2+3 | guide §"Hand-recipe declaration order" |
| crafting.js:80-82, 90-93 | a different recipe restarts the bar; the output falls at the player's feet, never a direct credit | 2 | — |
| crafting.js:97-111 | **PRE-EXISTING BUG, fixed**: `clause.sub` is a bare content id and needed translating through `S`, so every literal-`sub` output silently produced nothing — `kindle` had been producing nothing since it shipped | 2 | — |
| fields.js:1-18 | LAYER header; **diffusion deliberately not implemented**; exactly where a solver would go; does not touch `b.ver` | 1+2+4b | the seam → brain |
| fields.js:25-27 | without a floor the active set only grows and "an empty world costs nothing" is a lie | 2 | — |
| fields.js:30-33 | decay tunables named rather than derived so a field added and not decayed is visible here | 2 | — |
| fields.js:45-47 | deleting from a Set while iterating it is safe in JS; collecting doomed indices first would allocate every frame | 2 | — |
| generate.js:1-26 | LAYER header; **why worldgen is `rules` not `model`**; the kind table is the whole file and the import assertion makes a typo'd kind a build error; adding a layer/vein costs one row, a new kind costs a handler; **all randomness through `rand()` in a fixed traversal order** | 1+2+3 | guide §"Bands and worldgen" |
| generate.js:35-37, 40-42 | the spawn shelf so the first two minutes cannot depend on the seed; the lip is one tile deep or `floorTy` stops meaning what the row says | 2 | — |
| generate.js:49-56 | `lip:false` opts a row out; without the flag, giving stone its own `fromTy` punches air pockets along the seam because the lip check cannot tell "top of my range" from "top of the world" | 2 | — |
| generate.js:68-69, 82-84 | blob attempts; `near:'spawn'` resolved here because "where is spawn" is a band fact a content row should not know | 1+2 | — |
| generate.js:92-98 | the trunk window is where a BASE may sit, not the trunk's extent; trees are the only timber above ground and therefore the ladder supply | 1+2 | — |
| generate.js:117-119 | the tile array is freshly allocated and therefore all AIR, so there is no clear step | 2 | — |
| generate.js:126-128 | the cluster rim uses `rand()`, not `hash2()`, or two seeds would produce identical rims — worldgen is exactly where consuming the stream is correct | 2 | — |
| generate.js:144-147 | coverage asserted at import: the cheap half of the resolver | 1+2 | — |
| placement.js:1-37 | LAYER header; the footprint check reads `tw`/`th`/`footing` off the row, so there is no `placeFurnace()` (the old code had eighteen lines of furnace-specific checking in a module that also touched the player, tiles, items, toasts and audio); what may be placed is run state, not a registry edit; every refusal is a journal row; **the validity decision lives in `model/run.js#placementCheck`** | 1+2+3 | guide §"Adding a machine" + §"One decision, two readers" |
| placement.js:52-53, 63-67 | `tx`/`ty` is the top-left tile; the item is spent AFTER `mw.place`, so a refused placement never touches the pockets | 1+2 | — |
| placement.js:73-89 | deconstruct: a machine proven EMPTY gives back its own `rig`; "empty" is exactly `m.buf` keyless and `m.charges === 0`; `m.made`/`m.prog` deliberately excluded | 1+2 | — |
| placement.js:101-107 | the refund is a falling item using the same toss tunables, not a sixth magnitude | 2 | — |
| placement.js:115-120 | reuses the `'place'` journal kind — wrong verb, closest shape already wired | 4b | brain |
| placement.js:125-129, 131-136 | only a form with a `tile` block may be placed as terrain — there is no ladder id, recipe or code; `placeableFromPockets` covers tile forms and `rig` pairs, first in HUD order | 1+3 | guide §"Adding a form" |
| placement.js:150-153 | **a ladder may hang from the tile BELOW too** — that is the direction you build climbing out of your own shaft, and without it the last two rungs cannot be placed and the shaft becomes a grave | 2 | — |
| placement.js:165-168 | mining a placed tile gives it back via `dropOf`, so a ladder is recoverable and nothing had to say so | 2 | — |
| trinkets.js:1-27 | LAYER header; `run.trinkets` deleted because two lists could disagree; a trinket IS the element; `run.equipped` is a selection; a modifier is active only on the intersection; `step()` clears stale slots then syncs, so losing a trinket needs no `unequip()` call | 1+3 | guide §"The four gift tiers" |
| trinkets.js:38-41, 44-45, 54-56 | a draft FALLS like everything else material; a missing trinket throws because the resolver proved every id; `draftable()` only says what is available | 1+2+3 | guide §"The four gift tiers" |
| trinkets.js:59-65 | `equipFirst` is the model-driven shell intent; drag-to-equip is UI | 1+4t | keep one line; trim phase references |
| trinkets.js:79-82 | **`step()` is a SYNC, not an event**; `removeBySource` is the half a static field cannot express — `WALK *= 1.15` cannot be undone | 2+3 | guide §"The tunable pipeline" |
| trinkets.js:84-87, 93-95 | the two passes and why they are in that order | 2 | — |
| boons.js:1-20 | LAYER header; **`step()` is a sync, not an event**; full rebuild from scratch each frame is what lets an expiring newer boon hand an older suppressed one its true effect back; registered before `machines` for the same-frame reason | 2+3 | guide §"The four gift tiers" |
| boons.js:35-39 | `draftable()` matches the other tiers' shape so one draft panel can offer all four | 3 | guide §"The four gift tiers" |
| boons.js:42-43 | what "invert" means for a row | 1 | — |
| boons.js:51-55 | grant and expiry both announce themselves; `'lost'` was a pre-existing unused journal kind | 1+4b | brain (unused-kind inventory) |
| boons.js:57-60 | collect first, THEN expire — `write.expire` splices the array being iterated | 2 | — |
| boons.js:67-72, 81-83 | rebuild over the CONTENT table, not the active list; only a LATER boon may act on an earlier one | 2+3 | guide §"The four gift tiers" |
| grants.js:1-19 | LAYER header; **this is the whole grant layer, fifteen lines**, because there is no boot compile step | 3+4t | pattern → guide; the rename paragraph deleted |
| grants.js:37-39 | `draftable()` shape shared with the other tiers | 3 | guide |
| miracles.js:1-11 | LAYER header; `use()` is the whole mechanic; `grant()`/`draftable()` are the debug spawn path | 1 | — |
| miracles.js:24-27, 42-45 | spends nothing if nothing is held or aimed at; `'collapse'` goes through the same `write.clear` every dig uses, so it repaints only the chunks it touches | 1+2 | — |
| miracles.js:52-56 | calls `model/boons.js#write.grant` directly rather than `rules/boons.js#grant` because siblings may not import one another | 2+3 | guide §"Duplication across a layer boundary" |
| miracles.js:66-69, 79-82 | debug spawn falls at the player's feet; `draftable()` so a repeated debug key walks the table | 1+2 | — |

## src/view/

| file:line | content | bucket | target |
|---|---|---|---|
| paint.js:1-22 | LAYER header; **no substance or machine name appears anywhere in this layer** — everything comes from a `look` block; a dig repaints its chunk (128×128 px, ~1/1500th of a full bake); invalidation is a version counter, not a dirty flag, forced by the epoch assertion | 1+2+3 | guide §"Colour and appearance" + §"View cache invalidation" |
| paint.js:41-43 | a first paint is never budgeted, a re-paint is, so walking a tunnel while digging cannot stack forty bakes into one frame | 2 | — |
| paint.js:52-53, 65-66 | the cache is cleared on every new run because a stale blit is worse than a black frame; `chunkCanvas` returns null headless | 2 | — |
| paint.js:99-102 | open sky stays TRANSPARENT so the gradient shows through; air at or below `floorTy` is excavated rock — that one distinction replaced a per-column surface array | 2 | — |
| paint.js:119-120, 125, 150-151 | excavated space reads as cut, not absent; faint grain or a cavern reads flat; the solid-rock pass order | 1 | — |
| paint.js:166-168 | exposed faces catch light — any open neighbour qualifies, cave ceilings included, which is right for lighting and wrong for grass | 2 | — |
| paint.js:174-179 | canopy and grass gated on `skyExposedAt`, a full walk to the top; a tunnel ceiling satisfies "the tile above is air" and grass on a cave roof was the bug | 2 | — |
| paint.js:191 | "the line that used to say `if (M.id === 'copper')`" | 3 | guide §"Colour and appearance" |
| paint.js:194-195, 202-203 | cracks use the EFFECTIVE hardness, the same `eff` call the rule makes; crack positions come from the tile's own hash so they grow in place | 2 | — |
| paint.js:218-222, 238-242, 258-260 | every literal colour resolves through `data/palette.js` at module load; the per-substance look cache; cavity darkness from the band's own `look` (the old painter had three hardcoded depth thresholds) | 1+2 | — |
| paint.js:232-234 | the warning badge reuses the HUD's own red so "this is a warning" reads the same everywhere | 1 | — |
| paint.js:268-269, 279-280 | a dropped unit is two colours off `look.item`; the shine tracks the clock and position, never `rand()` | 1+2 | — |
| paint.js:285-287 | a machine draws from its own `look`; per-machine draw functions were rejected because they make "add a machine" always cost a render edit | 1+3 | guide §"Colour and appearance" |
| paint.js:304-305, 311-312, 319-320 | flicker from position plus time; one drum one deck; pips read a model query | 2 | — |
| paint.js:328-334 | the stalled-machine badge keys off the STATUS VALUE only, never a name | 2 | — |
| scene.js:1-23 | LAYER header; **`render()` performs no model writes and that is provable**, static half plus dynamic half, "two partial nets where a type system would give one guarantee"; bands share one world-pixel space so there is no current band in the renderer; the full pass order and the rule that governs it | 1+2+3 | guide §"Pass order and darkness" |
| scene.js:59-63 | `ichor` reused for the map marker rather than inventing a colour | 1 | — |
| scene.js:69-72 | the frame context is passed in, not imported, because `view` may not import `shell` | 1+3 | guide §"The frame context" |
| scene.js:81-90, 117-145 | **the map overview is a different render path, not a camera trick**; it returns before every normal pass; fog applies by omission; **one shared scale, DERIVED from the smallest band `tile`, not "8 px = 1 map px"** | 1+2 | — |
| scene.js:178-179, 188-192, 207-208 | a fixed 3×3 marker; sky gradient from `look.sky`/`look.tint`; cloud drift from `f.t`, never `rand()` | 1+2 | — |
| scene.js:262-263 | invulnerability blink derived from the clock, not a counter this function would advance | 2 | — |
| scene.js:288-295 | fields and fog do NOT go through the chunk cache: those canvases exist to avoid repainting static rock | 2+3 | guide §"View cache invalidation" |
| scene.js:319-348 | the darkness pass: `seen` vs `light` as two facts, one pass each; runs before `drawFog`, the one pass allowed to win outright; quantised to three alpha steps, and why `DARK_ALPHA[0]` is near-opaque; row-run coalesced; **NOT ADDITIVE**, unlike the machine glow, so it cannot leak an unseen tile | 2 | — |
| scene.js:387-407 | fog: an unrevealed tile is opaque REGARDLESS of what is there, hence its position in the pass order; `seenAt` is the only model call; run-merged with a sentinel column so a run open at the screen edge flushes without a second copy of the flush logic | 2 | — |
| scene.js:432-435, 452-458 | depth tint from the band under the camera; **the machine halo is gated on `seenAt` even though `drawFog` already ran, because `'lighter'` composites straight through an opaque rect** | 2 | — |
| scene.js:473-474, 481-482 | band label uses `drawText`, never `fillText`; chips re-exported so `shell` has one import | 1 | — |
| treatments.js:1-26 | LAYER header; **this table plus a name in a content row is how appearance became data**, with the before/after; the `(g, cell, p)` contract; **may use `hash2`, must not use `rand`** | 1+2+3 | guide §"Colour and appearance" |
| treatments.js:34-35, 44-46, 51 | speckle positions from tile coordinates so they sit still; glow is the one non-integer effect; `banded` courses | 1+2 | — |
| treatments.js:58-66, 75-79 | canopy and grass are blocky rather than the mockup's dot-cloud; both only called when `skyExposedAt` is true, which this file may not check itself | 1+2 | — |
| treatments.js:89-90 | `applyTreatments` exported so item and machine passes share the semantics | 1 | — |
| hover.js:1-22 | LAYER header; **NO STATE** — hover has one writer and one reader so it is a return value, not a field; caching it on a model record would be a `view` write; the priority rule (HUD wins, then item, machine, tile) | 1+2+3 | guide §"Where does state go?" |
| hover.js:32-35, 55-59, 70-73, 76-81, 89-92, 103-105, 116-119 | status words; recipe-name fallback for inline rows; `baseHardOf` returns `Infinity` for a relic and for bedrock; `describePair` reuses one hardness formula; a native tile's form is a sentinel so the label must branch; generous half-tile slack for a moving item; `hudHits` is exactly what was drawn | 1+2 | — |
| hover.js:38-45 | the producing line is display-only and deliberately narrower than `choose()`; re-reads the buffer because `view` may not import `rules` | 2+3 | guide §"One decision, two readers" |
| hover.js:145-152 | **fog must not leak tile identity** — an unseen tile shows NO tooltip, not a placeholder; checked only for terrain, since an item or a machine has its own unrelated reasons | 2 | — |
| hud.js:1-36 | LAYER header; no `fillText` anywhere; the always-on HUD is a bar not a strip, and the deleted `pockets()` strip; **panels clamp below ~240 px of base width, learned the hard way — keep them**; hover is resolved, not stored; `pocketHits`/`hoverInfo` is `view`'s own scratch space | 1+2 | — |
| hud.js:77-81, 95-98, 104-106 | the one accent colour reuses `ichor`; `hoverInfo` is the one introspection point; the widget scratch space is reset once per HUD frame | 1 | — |
| hud.js:85-92 | `resolveHover` hit-tests against exactly these rectangles, so layout and tooltips cannot disagree | 2+3 | guide §"Record what you drew" |
| hud.js:112-116, 117-130 | the panel anchors below the burden bar now that the strip is gone; the old `invPanel` is suppressed when the new window is open, and its BUILD section was retired with `buildableMachines()` | 4b | brain (retired UI inventory) |
| hud.js:134-136, 141-145 | the boon stack sits below the depth gauge and hands its bottom edge to `debug()`; **the main panel draws last and pauses nothing** | 1+2 | — |
| hud.js:154-156 | five discrete hearts: a bar would be a lie because the player must be able to count what a fall costs | 1 | — |
| hud.js:171-182 | the burden bar reuses `ui/bar.js` and the Character tab's three-colour rule; narrow by construction so it never reaches the depth gauge at the 200 px floor | 1+2 | — |
| hud.js:201-206, 207-215, 222-225 | `invPanel` filtered to what is held; `billOf` labels selectors by form/tag word because a selector names no single substance; SHORT names in the bill line | 1+2 | — |
| hud.js:239-244, 251-260, 299-304, 315-317 | the old BUILD/CRAFT list layout, numbering, greying and hit capture | 1+4b | brain (this whole panel is superseded) |
| hud.js:329-331, 333-339, 354-356 | the tooltip lays out whatever `resolveHover` returns; **it must yield to the Phase 5b panel's own single tooltip slot**; clamped to stay on screen | 1+2 | — |
| hud.js:364-365 | one tile reads as one metre, measured from the SPAWN band's ground line | 1+2 | — |
| hud.js:377-389 | the boon stack walks `active` backwards because it is grant-ordered; capped at 5 with `+N`; **derives only from `f.t` and `left`, never `rand()`, per the furnace-flame bug** | 1+2 | — |
| hud.js:408-411 | SHORT name in the timer stack | 1 | — |
| hud.js:438-439 | the reticle is drawn with the HUD because it is a statement about the pick, not the rock | 1 | — |
| hud.js:456-467, 468-471, 507-514 | the build ghost reads the SAME model query the rule calls and anchors the footprint identically; factored so the old and armed ghosts share one implementation; a tile ghost can only check clearness, not the hang-from rule, because `view` may not import `rules` | 2+3 | guide §"One decision, two readers" |
| hud.js:593-595 | `labelOf` exported so nothing hand-writes "COPPER INGOT" | 1 | — |
| ui/state.js:1-15 | LAYER header; the `drawn` scratch idiom; rebuilt every draw, never relied on across frames | 1+3 | guide §"Record what you drew" |
| ui/state.js:18-22, 25-30 | the crafting grid's recipe-id side table; `buttons` added and then removed with the digit BUILD row list | 1+4b | brain |
| ui/panel.js:1-14, 28-30 | LAYER header; registers what it drew; **clamped to `vw`/`vh` — below ~240 px an unclamped panel overlaps the depth gauge**; `opts` shape | 1+2 | — |
| ui/panel.js:43 | bevel direction | 1 | — |
| ui/bar.js:1-6, 16-22 | LAYER header; **a generic widget must not learn what "burden" means** — the caller resolves the colour rule; `opts` shape and why `vw` is optional | 1+2+3 | guide §"Widget primitives" |
| ui/grid.js:1-21 | **scrolling is snapped to whole ROWS because there is no `clip()`** — the headless 2d stub does not implement it, so a real clip would pass in a browser and throw in `npm run check`; **the column count is clamped and `w` is derived from `cols × cell`**, or drawn slots would sit outside the rect the hit test trusts | 2+3 | guide §"Widget primitives" |
| ui/grid.js:43-52 | `opts` and return shape; `cols` is a request | 1 | — |
| ui/slot.js:1-11, 21-29 | LAYER header; **a leaf: it does not push into `drawn` itself** because every caller is already a container; the caller resolves the swatch colour because this file may not import `data/substances.js` | 1+2+3 | guide §"Widget primitives" |
| ui/slot.js:59-67 | the highlight border is a post-hoc overlay against the ABSOLUTE rect `drawGrid` returned — callers never recompute geometry `drawGrid` already settled | 2+3 | guide §"Record what you drew" |
| ui/tabs.js:1-4, 17-18 | LAYER header; drawing and cycling are separate concerns; `opts`/return shape | 1 | — |
| ui/tabs.js:29-36 | a tab that would bleed past `maxRight` is DROPPED, not truncated, because drawn text is never clipped; the first tab is the one exception | 2 | — |
| ui/tooltip.js:1-5, 14-16 | LAYER header; one at a time because only one tooltip can be under the cursor; `opts`/return shape | 1 | — |
| ui/quickbar.js:1-13 | LAYER header; always drawn because a quickbar is permanent HUD; assignment is UI state, the COUNT is read fresh every frame | 1+3 | guide §"Widget primitives" |
| ui/quickbar.js:29-35, 39-42 | **ONE mapping, TWO readers**: `digitOf` and `slotForDigit` index the same array so "press 3" and "the slot showing 3" cannot disagree | 2+3 | guide §"One decision, two readers" |
| ui/quickbar.js:45-48 | the legend is presentation text, not a second source of truth for what a key does | 1+2 | — |
| ui/quickbar.js:67-72, 77-80 | the armed highlight is `mainPanel#frameArmedSlot`'s twin; the hint line has its own panel id so it is hit-testable | 1+2 | — |
| ui/mainPanel.js:1-24 | LAYER header; **it pauses nothing** — the factory keeps running while you read about it; **a click that does something is shell calling rules**: this file only draws and records; the dispatcher reads it one frame stale | 1+2+3 | guide §"Record what you drew" |
| ui/mainPanel.js:61-64, 67-71, 101-106 | `activeTab()`'s fallback restated in one line because `view` may not import `shell/ui.js`; the slot item shape; the frame overlay uses absolute rects rather than teaching the primitive a new field | 1+2 | — |
| ui/mainPanel.js:77-88 | the placeholder identity glyph is a stopgap until real iconography; callers with a more useful glyph keep theirs | 1+4b | brain (placeholder art) |
| ui/mainPanel.js:94-98, 114-122 | `relic`/`phial` framed in `ichor`; the armed highlight uses GOOD, not gold, so arming reads as a placement fact | 1+2 | — |
| ui/mainPanel.js:157-160 | slots are stack-based but the BINDING constraint is mass, so the burden bar is the most legible thing this tab draws | 1+3 | guide §"Buffers and pockets" |
| ui/mainPanel.js:174-176, 181-183, 196, 209-211, 222-223 | the inventory grid source; the `#` tile-capable marker keeps priority; equipment slots from `eff('trinketSlots')`; mods resolved through `explain()`; the stat readout | 1+2 | — |
| ui/mainPanel.js:241-246 | this file cannot read a tunable's `unit` off the frozen row (only `mods.js` may import it), so units are presentation text here | 2+3 | guide §"The tunable pipeline" |
| ui/mainPanel.js:285-287, 337-340, 355-359 | tooltips and categories driven off TAGS, never a per-substance switch; a `subFrom` icon resolves against what is actually held, falling back to `expand()`'s first crossing | 1+3 | guide §"Colour and appearance" |
| ui/mainPanel.js:389-391, 413-416, 429-435 | the search field has its own panel id so it is separately hit-testable; glyph priority; the recipe-id side table exists because a grid slot cannot name a `subFrom` recipe | 1+2 | — |
| ui/mainPanel.js:471-476, 486-491 | SHORT labels inside an already-multi-line tooltip; `bestPocketed` re-derived because `view` may not import `rules` | 1+2+3 | guide §"Duplication across a layer boundary" |
| ui/mainPanel.js:513-515, 517-527 | LOGISTICS is an honest stub; its state is a HEURISTIC over model queries and deliberately collapses several stall causes it cannot tell apart without importing `rules` | 2+4b | keep the "heuristic, not a duplicate of `rules`" line; the collapsed cases → brain |
| ui/mainPanel.js:551-561 | the old BUILD list retired rather than fixed, because `def.cost` no longer exists | 4b | brain |
| fx.js:1-24 | LAYER header; **declared addition to the brief's file list**, with the model/shell/view candidate analysis; **chips must not consume `rand()`** because the journal is drained once per FRAME, so a chip drawing from the run stream would make the world depend on framerate | 2+3+4t | the randomness gotcha stays; the ownership pattern → guide §"Where does state go?"; the brief narration deleted |
| fx.js:41-42, 81-82 | `col` is already resolved hex — this file has no business reading content; cleared on a new run like the chunk cache | 1+2 | — |

## src/shell/

| file:line | content | bucket | target |
|---|---|---|---|
| schedule.js:1-115 | LAYER header; **`rules` may not import each other, so this list IS the simulation**; then a per-adjacent-pair justification for the entire order (aim→player→mining→light→reveal→items→belts→crafting→trinkets→boons→machines→lift→fields), including the parenthetical record of `reveal` having MOVED and why, and the accepted cost of `belts before crafting` | 2+3 | keep every adjacency note verbatim — it is the only record of these constraints; the "why this list exists" framing → guide §"The rules order" |
| schedule.js:150-152, 162-167 | mouse-vs-keyboard aim is a DEVICE question resolved in `shell`; the event-shaped rules (`grant`/`draft`/`use`) are re-exported because putting them in `STEPS` would be a lie about when they happen | 1+2+3 | guide §"The rules order" |
| boot.js:1-31 | LAYER header; **the numbered boot order and what breaks if you move a line** (10 steps, each with its dependency); "getting this wrong throws during boot and renders NOTHING AT ALL"; invariant 8 | 2 | — |
| boot.js:55-56, 68, 70, 77-78, 85 | once per PAGE vs once per RUN; tear down before anything reads a stale array | 1+2 | — |
| boot.js:89-91 | every band is resident at once; a production build would allocate deep bands lazily and the seam is identical | 1+4b | brain |
| boot.js:98-101 | spawn two tiles above the ground line so the first frame is a landing, not an ejection | 2 | — |
| boot.js:106-115 | the starting skyline is AT BOOT ONLY and is not how fog works from here on; `floorTy + 8` need only clear the soil/stone seam | 2 | — |
| boot.js:118-122, 125-131 | the pick and the brand are planted as ordinary items inside the spawn shelf — nothing teleports into your hands; the brand auto-lights on pickup | 1+2 | — |
| input.js:1-20 | LAYER header; the kept warning that this module once existed, was imported by nothing and did not parse; **`hop` and `place` are EDGE-TRIGGERED** (a held space bar turned a hop into flight, a held place key emptied the pockets into a wall); `clearEdges()` runs after the rules have read them; audio unlocks from the first gesture | 1+2 | — |
| input.js:32-35 | `cmd` is one object mutated by property; `craft` is a HOLD, not an edge | 1+3 | guide §"Cross-module mutable state" |
| input.js:42-70 | the UI intent fields; **the open panel stack CAPTURES input**; why `uiClick`/`uiRight` are edge and `uiDown` is a hold (a drag needs "is the button still down"); `uiWheel` accumulates per frame | 1+2+3 | guide §"Input intents" |
| input.js:74-79, 82-86 | one-shot `wants` vs `cmd`; presentation flags passed to `view` rather than imported; `showMap` has two readers | 1+2 | — |
| input.js:106-110, 112-116, 118-126 | `q`/`backspace`/`v` all edge-triggered for the same held-key reason; `v` is a real action so it is NOT debug-gated. Includes mnemonic-selection notes | 2+4b | keep "edge-triggered, same reason"; the key-letter search → brain |
| input.js:128-131 | `p` equips; a real action, ungated | 1+4t | trim phase references |
| input.js:141-153 | **the search field is captured before every other binding in this file**, or a typed search would also walk the player into a wall; unrecognised keys are swallowed, not passed through | 2 | — |
| input.js:155-165 | **BUG FIX**: Escape used to only blur, so leaving the window took two presses; Enter stays blur-only; `i` deliberately not carved out of the search alphabet | 2 | — |
| input.js:185-196 | `i` REUSED, not migrated: it toggles both the old panel and the new stack, mid-migration | 4b | brain |
| input.js:198-201, 203-205 | Escape pops the top of the stack only, and no-ops on an empty stack so it stays free for the browser; it also cancels an armed placement | 2 | — |
| input.js:207-212 | `o` for the map; every other mnemonic was taken | 4b | brain (key inventory) |
| input.js:217-245 | `f`/`l` removed because "spawn a furnace for free" is incoherent once placement costs a held item; `t`/`b`/`k`/`y` moved behind `showDebug` | 4b | brain |
| input.js:253-282 | digit keys arm a quickbar slot; the old digit BUILD menu read a `def.cost` that had been `undefined` since machines became items, so its affordability display was permanently wrong; unconditional because the quickbar is permanent HUD; an empty/stale/unplaceable slot does nothing, mirroring a click | 2+4b | keep the "digit = click on that slot, one mapping" rule; the retirement → brain |
| input.js:297-299 | losing focus must release everything, or the player returns walking into a wall | 2 | — |
| input.js:311-313, 385-387 | pointer position in WORLD px, divided by `VIEW.scale`; the camera is injected rather than imported to avoid a cycle inside `shell` | 1+2 | — |
| input.js:322-330 | the always-drawn quickbar toggle needs the same "cannot dig through" guarantee; hit-tested in SCREEN space, matching where `drawn` records rects | 2 | — |
| input.js:342-345, 350-358 | the panel stack captures input; right-click on a placed machine reuses the same edge flag `Backspace` sets, from a second input source rather than a second implementation; `aim` read directly because it is already this frame's answer | 2+3 | guide §"Input intents" |
| input.js:373-377, 398-401 | the wheel is only routed and `preventDefault`ed while a panel is open; clearing edge flags every frame still leaves exactly one true frame per press because a held pointer fires no repeat | 2 | — |
| main.js:1-15 | LAYER header; **a fixed 1/120 s step, and not for performance** — no `rules` module ever sees a variable dt; the accumulator is capped so a backgrounded tab does not teleport the player through the floor; the journal drains once per FRAME because sound is a frame-rate phenomenon | 1+2+3 | guide §"The frame loop and determinism" |
| main.js:50-52, 556-567 | `drawCam` is the cam as of the last `draw()`; **`render()` rounds `cam` in place and `updateCamera` eases it again**, so the live cam can differ from the one that produced `drawn` by more than a pixel — snapshotting after the rounding is what lets the dispatcher recover the screen coordinate a click landed on | 2 | — |
| main.js:55-65 | the frame context is one reused object because `view` may not import `shell`; `ui` is passed through read-only exactly as `flags` is | 1+3 | guide §"The frame context" |
| main.js:70-80 | **the map freeze is guarded inside `step()`**, not in `frame()`, so the headless hook honours it too; the accumulator still drains so no backlog waits | 2 | — |
| main.js:83-89 | the craft queue re-asserts the same one intent every substep; `rules/crafting.js` cannot tell it from a held key | 2+3 | guide §"Adding a recipe" |
| main.js:96-97, 107-108 | mouse and X are one intent, resolved here because which DEVICE asked is a shell question; the pick swing is presentational | 1+2 | — |
| main.js:113-130 | **`applyIntents` runs once per real animation frame, not per substep**: below 120 Hz a frame ran several substeps and retried the same intent; above 120 Hz a frame can run ZERO substeps and `clearEdges()` still wiped it; each branch self-clears what it consumed | 2 | — |
| main.js:132-137 | the same freeze, because these intents resolve against an `aim` the player cannot currently see | 2 | — |
| main.js:140-147 | **the armed pair must be re-checked against the pockets before anything acts on it** | 2 | — |
| main.js:150-160 | auto-hide the panel when placement starts, gated on the intent being present this frame so merely having the menu open does not close it | 2 | — |
| main.js:164-173, 179-182 | armed pair first, re-checked as still held, falling through to HUD order; `machineIdFor` resolves facing; the footprint anchors bottom-row at the aimed tile | 2+3 | guide §"Mirrored machine pairs" |
| main.js:193-195, 201-204, 210-214, 220-222 | drop/deconstruct/use/equip: which need an aim gate and which act at the player's feet | 1+2 | — |
| main.js:228-230 | drafting is bound to a key so all four tiers are exercisable; the director that would decide when is not built | 1+4b | brain |
| main.js:255-267 | **the UI dispatcher**: `view` records rects, `shell` hit-tests them and calls `rules`, never the reverse; one frame of lag accepted for the same reason `buildGhost` already accepts it | 2+3 | guide §"Record what you drew" |
| main.js:271-279, 419-420, 428-435 | the click-vs-drag movement threshold; checked every frame the button is down so a slow drag is still caught; a plain click on the same slot arms rather than drag-resolves | 2 | — |
| main.js:322-327 | a panel closing mid-drag strands `uiDown` with no pointerup to clear it, so both halves are reset here | 2 | — |
| main.js:332-337 | the always-drawn quickbar toggle needs one dispatch before the closed-panel early return | 2 | — |
| main.js:366-375 | **BUG FIX**: an unaffordable queued recipe never spent and never completed — it sat indistinguishable from one progressing; refused outright with the standard `'refused'` row instead | 2 | — |
| main.js:384-386, 396-400, 407-410 | any other click blurs search; the rising edge picks a payload and the falling edge resolves against whatever slot is under the cursor NOW; `index` added so a per-slot unequip knows which slot | 2 | — |
| main.js:444-457, 467-472 | **BUG FIX**: drag-onto-equip always called `equipFirst()` regardless of target and drag-out did nothing; `write.equip(slot, sub)` was already exported for exactly this; `form === F.relic` is the same test `data/forms.js` uses | 2 | — |
| main.js:480-486 | the craft queue's completion signal is READ, not invented: `crafting`'s `'produce'` row has no `def` key, which is what distinguishes it from `machines`'s; `peek()` is the non-destructive read that exists for this | 2+3 | guide §"Notification and the journal" |
| main.js:496-499, 514-517 | the camera leads travel and looks further down; a band narrower than the viewport centres rather than clamping to a corner | 1+2 | — |
| main.js:522-534 | **Y clamps to the UNION of every band**: per-band clamping pinned the camera short of a seam and then snapped a full viewport in one frame when `player.band` flipped — "digging glitches at the bottom of the screen" | 2 | — |
| main.js:579-582, 593-598 | restart self-clears because `clearEdges()` is skipped on a zero-substep frame; **`cmd.hop` must only be cleared once a substep has actually run**, or above 120 Hz a hop is erased before physics sees it | 2 | — |
| main.js:607-611 | the test hook: with `?test=1` the RAF loop does not start | 1+2 | — |
| main.js:618-622, 625-638, 647-649, 651-654 | read-backs of what the HUD and widget layer actually drew; `__mf.ui` is a GETTER composed in `shell` because it merges two layers that may not import each other; the exposed `ui` fields | 1+2+3 | guide §"The test hook" |
| main.js:666-670, 673-676, 776-784 | `revealAll`, `mouseAt` and `give` are TEST ONLY and why each exists (arrange a scenario without re-proving mining, pickup or DOM gestures) | 1+2+3 | guide §"The test hook" |
| main.js:679-685, 694-695, 711-723 | `frames`/`hold`/`intent`: `applyIntents` per substep because it self-clears; edge commands released after the first substep; **`intent` locates its target from `__mf.ui()`, never a hardcoded pixel** | 2+3 | guide §"The test hook" |
| notify.js:1-25 | LAYER header; **this is where notification flowing downward closes the loop**; a row is a fact, not an instruction; the cost restated; a machine row may override its own sound via `look.sfx` with no machine name in this file | 1+3 | guide §"Notification and the journal" |
| notify.js:36-37, 49-50, 69-70, 82-83, 90-92 | chip counts are cosmetic so they live here, not on a content row; only some kinds deserve text; an unmapped kind is silent by design, not a warning; chip colour from `look` with a machine-trim fallback | 1+2 | — |
| ui.js:1-27 | LAYER header; **why UI state is `shell` and not `view` or `model`**; `ui.stack` is a stack so a modal can sit over the window; every export mutates properties on one object per the repo convention | 1+3 | guide §"Where does state go?" |
| ui.js:38-62 | `craftQueue` re-asserts one intent rather than changing the one-pair-of-hands mechanic, and drains on a `'produce'` row; nothing to refund because nothing is spent until `secs`; `quickbar` is ASSIGNMENT ONLY | 2+4b | keep the "queue is not a mechanic change" rule; the open design question → brain |
| ui.js:65-67, 98-99, 108-112, 129, 159 | hint line collapsed by default; Escape pops the top only; the tab list is passed in rather than cached so it cannot go stale against what was drawn | 1+2 | — |
| ui.js:70-80 | `armedPlace` replaces the "first placeable in HUD order" placeholder with a real choice; the three clear triggers | 1+2 | — |
| ui.js:138-143 | scroll keyed by `panel:grid`, the same flattening `mods.js`'s scoped keys use | 1+3 | guide §"The tunable pipeline" |
| ui.js:162-166, 174-177, 182-185, 189-194, 204-207 | queue ceiling of 99; cancel refunds nothing because nothing was spent; `cancelQueued(0)` IS dequeue — one splice, two callers; quickbar counts read fresh, never cached | 1+2 | — |
| audio.js:1-17 | LAYER header; **why audio is in `shell` and nothing above may call it**; guarded three ways because a missing AudioContext must never break a frame, and a synth that throws once is disabled rather than retried 60×/s | 1+2+3 | guide §"Notification and the journal" |
| audio.js:32-33, 39-40, 46-48 | safe to call `unlock` repeatedly; the gap is measured in SIMULATED seconds so a paused tab cannot bank a hundred strikes; the numbers are content, the enforcement is here | 2 | — |

## tools/

| file:line | content | bucket | target |
|---|---|---|---|
| layers.mjs:1-9 | what it proves and what it cannot ("direction and names, not sense") | 1+3 | guide §"Checkers" |
| layers.mjs:30-32, 37-38 | `rules` siblings; the one declared exception (a driver may bind leaf helpers below itself); the tunable store is only unbypassable if exactly one file may read the frozen table | 1+2 | — |
| build.mjs:1-8 | one self-contained file; **dev does not go through here** — `npm start` serves untransformed modules, and `npm run parity` asserts the two agree | 1+2 | — |
| build.mjs:38-39 | a literal `</script>` would close the tag early; splitting the sequence is safe | 2 | — |
| build.mjs:42-46 | **use a replacer FUNCTION**: `String.replace` interprets `$&` in a replacement string, and a bundle containing `$&` re-inserted the very `<script src>` tag it was replacing, producing a plausible-looking broken artifact | 2 | — |
| serve.mjs:1-2 | ES modules need a real origin but not a bundler | 1 | — |
| check.mjs:1-10 | the four sections in order of what they can prove; it cannot tell you whether anything looks good | 1+3 | guide §"Checkers" |
| check.mjs:16-18 | the canvas stub is not pure: `fillRect`/`drawImage` also assert finiteness, which is where much of the harness's value comes from | 2 | — |
| check.mjs:130-146 | **the real `step()`, not a reimplemented loop**: earlier drafts called `sched.stepAll` directly, bypassing the only place `clock` advances, the map freeze, the craft-queue re-assertion and the dig-intent merge — "smaller" is exactly the gap a framerate bug hides in | 2 | — |
| check.mjs:161-165, 172-177 | a rolling checksum because three typed arrays per band is too much weight for a fingerprint; `epoch` deliberately excluded from snapshots because it only increases | 2 | — |
| check.mjs:211-218, 233-240 | the scripted session uses its OWN seeded generator, separate from the game's stream; a run that dies restarts on the same seed so the script always runs full length; `--determinism-probe` prints the fingerprint as its LAST stdout line so earlier logging need not be suppressed | 2 | — |
| check.mjs:256-259, 262-265 | **use `forms.expand(sel)`, do not hand-roll a string check** (CLAUDE.md records that mistake); a recipe with `from:` draws NAMED UNITS, not selectors | 2+3 | guide §"Checkers" |
| check.mjs:286-290, 304-306, 316-317, 325 | a mod key is dotted and splits on the FIRST dot; `conflictsWith` ids resolve; miracle/drop ids resolve; kept here as the quicker layer even though `content.mjs` does the deep version | 1+2 | — |
| check.mjs:375-377 | render purity: snapshot the stream, draw a lot, check the next value is the un-drawn one | 1+2 | — |
| check.mjs:425-426 | **`TUNE` maps id → ROW, not id → number** | 2 | — |
| check.mjs:470-475, 487, 493-495 | a trinket is an item: draft drops a relic, pickup and EQUIP change a value, spending restores the base; holding alone is no longer enough | 1+3 | guide §"The four gift tiers" |
| check.mjs:551-556, 576-584 | determinism twice in-process plus once in a fresh process; the `newRun()` probe dirties every model object and compares byte-identical fingerprints | 1+2 | — |
| check.mjs:616-629, 635-638 | **conservation is a bookkeeping check**, not a re-run of the static mass lint: what it catches is a future path that pokes `run.inv`/`items`/`m.buf` around the write API | 2+3 | guide §"Checkers" |
| check.mjs:693-698 | hand recipes are the SAME OBJECT a machine names; asserted from two angles because it costs nothing | 1+3 | guide §"Adding a recipe" |
| check.mjs:716-732 | **T2 = T3 proven structurally**: both sides go through the same `write.add`, `eff('pickPower')` and tool `power`, at two DIFFERENT tiles or the two accumulators would be the same Map entry; the hand side calls the model primitive directly because routing a player would prove the input plumbing, not the rate | 2 | — |
| check.mjs:770-785 | break-even depth computed against LIVE numbers; only the ORDERING of tiers is asserted, plus a broad sanity band, so an honest retune does not fail | 2+3 | guide §"Checkers" |
| check.mjs:813-819, 834-837, 864 | burden set by a direct model write because the point is the MOVEMENT rule, not the pickup refusal; measure free-fall from an open shaft, not from standing on the surface | 2 | — |
| check.mjs:886-890, 902-906, 928-934, 957-959 | a narrow light-determinism restatement so a regression reads as a light failure; an enclosed chamber reads 0 and the player is in a different band's array entirely; "enough rock" computed from live tunables (12 over 3-per-tile needs four tiles, not the plan's illustrative two), bounded on both sides; recompute is not per frame | 2 | — |
| check.mjs:973-977 | render purity extended over `view/ui/` with real content drawn | 1 | — |
| content.mjs:1-15 | what this lints and why `tools/` importing `src/data` is not a layer violation | 1+3 | guide §"Checkers" |
| content.mjs:32-35, 42-44 | every recipe deduplicated by reference; every mined pair as the fixpoint seed | 1 | — |
| content.mjs:56-60, 63-68 | `worldY` re-derived over raw rows because nothing is booted yet, safe because it is pure arithmetic; depth uses the same datum the HUD and `minDepth` use | 2 | — |
| content.mjs:73-84 | `minMineDepth` scans strata directly; **a strata row's `sub` is a STRING and must go through `S[...]`** — an early draft compared a string to an ordinal and the depth-gate check never once fired, on real content or on deliberately broken content | 2 | — |
| content.mjs:107-109 | assertion 1; use `expand`/`holdable`, do not hand-roll | 2+3 | guide §"Checkers" |
| content.mjs:132-133, 146-147 | assertions 2 and 3 | 1 | — |
| content.mjs:150-165 | **the reachability fixpoint**: ties `subFrom` to substances already reachable via `matches()` against the reachable set, never `expand()`'s full crossable scan, which is what keeps `adamant/ingot` out by construction rather than by exemption | 2+3 | guide §"Checkers" |
| content.mjs:209-216, 223-238, 240-247 | assertions 4 and 5; transitive membership is strictly stronger than the one-hop check this shipped with; machine cost keys excluded from the orphan graph so the check is not implemented twice; a `subFrom` clause resolving to nothing is still a dead recipe | 2 | — |
| content.mjs:264-267, 280-283 | assertion 6 mirrors `massOfPair` and the two are asserted to agree for one known pair; the cartesian product is small by construction | 1+2 | — |
| content.mjs:310-313, 327-331, 352-353 | assertion 7 asserts a guarantee rather than re-deriving it; assertion 8 written generically over "any data row with a `mods` array" and needed no edit when boons gained mods; assertion 9 tier/hard monotonicity | 1+2+3 | guide §"Checkers" |
| content.mjs:369-388 | assertion 10: never self-referential; **symmetry is not required, but where both directions exist the modes must agree** — today's content is deliberately one-directional and that is accepted design | 2 | — |
| content.mjs:409-411, 424-425, 439-447 | assertions 11-13: miracle/drop/trinket ids resolve to holdable pairs | 1 | — |
| content.mjs:455-470 | assertion 14: depth gates monotonic — nothing a machine's bill needs may be gated deeper than the machine; a substance already Infinity is skipped so failures stay legible | 2 | — |

## tests/visual.spec.js

94 blocks. Two thirds are `2` — test-setup rationale recording why a naive
setup measures the wrong thing. The recurring reasons are worth stating once in
the guide; the per-test instances stay where they are.

| file:line | content | bucket | target |
|---|---|---|---|
| 3-19 | suite header; a passing screenshot means pixels have not CHANGED, not that they are right; **baselines are UNREVIEWED**; why `maxDiffPixels: 0` is legitimate | 1+2 | — |
| 32, 143-145 | past the title fade; falling drops need to land and clear the magnet delay | 2 | — |
| 60-64 | walk over the stock pickaxe first or `hasPick()` is false; `right` is a HELD key and must be released or the player drifts and no tile accumulates enough work | 2 | — |
| 73-96 | functional-not-visual rationale; **REAL BUG FOUND WHILE WRITING THIS TEST**: the 6 px hitbox straddles two columns but `aim` targeted one, so digging from an unaligned x wedged forever — and `digging.png` had been a screenshot of a stationary player | 2+4b | keep the hand-carve rationale; the baseline finding → brain |
| 180-182, 219-220, 223-224, 244-246, 266-267, 270-271 | depth gained is a sensible multiple of the tile size; clear a wide enough box; both straddled columns are real shaft; the frame budget covers 2×DEPTH sequential breaks; both columns broke; the descent is not the pre-fix sawtooth | 2 | — |
| 192-203 | the regression test for the straddled-column wedge, with the pre-fix behaviour verified by hand | 2 | — |
| 276-283, 298-300 | **fog would make these terrain tests screenshot a uniform rectangle** — exactly the "test that measures the wrong thing" failure; hence `revealAll` | 2 | — |
| 318-327 | **keyboard aim, not mouse**, because a hardcoded click is fragile; no direction held aims to the SIDE, and aiming DOWN lands on the spawn shelf's floor tile — this test had been screenshotting a "NEEDS CLEAR SPACE" refusal because nothing asserted success | 2 | — |
| 329-333 | `reach` exceeds the fog the player's presence earns, so the band is revealed here | 2 | — |
| 338-349, 382-385, 496-500, 1376-1383, 1832-1838, 2051-2054 | design-reversal notes: the machine is now a held `<id>/rig` given directly because the test's point is not the crafting grind | 4t | delete; the pattern belongs in the guide, the history in brain |
| 360-363 | `draw()` again after closing the panel — setting a flag does not repaint | 2 | — |
| 368-378 | proves the SPECIFIC machine at that list position is placed, not merely that some machine is — the failure a looser assertion would hide | 2 | — |
| 404-413 | hand-crafting has no screenshot-visible state, so only a state read-back proves it; the output is a FALLING item and needs time to clear the magnet delay | 2 | — |
| 445-460, 462-466 | BELTS header: a screenshot cannot tell "moved" from "always looked like this"; **every test hand-carves its own patch rather than trusting seed 1337's terrain** | 2+3 | guide §"Writing tests" |
| 504-511 | **land the item on a COLD belt first**: feeding the burner earlier races the two, and the intermediate "resting, not yet dragged" state would never be observed | 2 | — |
| 516-519, 536-539, 564, 578-579 | buffer written directly to avoid needing the player's position; delivered past the lip and resting lower; no fuel this time; the gate actually gates | 2 | — |
| 585-590 | the 400-item cap is global, not per-machine; charges set directly so the frame budget goes to the physics under load | 2 | — |
| 645-672 | FOG header: the two passes; **call `reveal.step()` directly after teleporting rather than walking**, because an 800-tile teleport lands in solid rock; **call `newRun()` inside the page block** because `settle()`'s spawn already triggers Pass A | 2+3 | guide §"Writing tests" |
| 681-688 | astral picked over topsoil because its `look.ambient` is 1.0, so the depth tint does not add a second blend to the sampled pixel | 2 | — |
| 721-726 | 60 tiles away and stepped again: a radius implementation would have nothing left revealing the tile; a memory implementation has no mechanism that could turn a bit off | 2 | — |
| 777-782, 785-787, 789-794, 804-806 | the ground row must sit BELOW boot's free skyline to isolate Pass A; `farTx` is beyond both the old radius and Pass B's cap; carve both columns rather than trust worldgen; the box is two rows tall | 2 | — |
| 837-838, 840-841, 846-850, 867-868 | read the radius from the tunable so this survives a retune; hand-carve a SEALED room so the only route is where the player will stand, isolating Pass B from Pass A | 2 | — |
| 881-891, 893-900, 928-932, 970-978 | MAP header: three claims, three tests; write a known tile and move the player away so the marker does not paint over the sampled pixel; **recompute the scale from the same public band data the renderer reads, not a magic constant**; a pixel test says nothing about layout, hence a screenshot too | 2+3 | guide §"Writing tests" |
| 1010-1014 | `hold()` calls the real `step()`/`applyIntents()` — this is not testing a mock of the pause | 2 | — |
| 1053-1059, 1071-1075, 1077-1082, 1085-1093 | hover has no model state so it is read back through `__mf`; **`settle()` advances the clock but not `stepFx`, so the opening title is still up and `drawHUD` draws it INSTEAD of the tooltip**; `draw()` not `frames()` because a substep moves the camera out from under `mouseAt`; find the rect from `__mf.hits`, never a hardcoded coordinate | 2 | — |
| 1108-1122, 1124-1133 | Tier 3/4 headers: `intent` reads geometry back; `give` is test-only; **every pair of screenshots is taken as a PAIR so a feature made a no-op must change one of them against its own baseline** | 2+3 | guide §"Writing tests" |
| 1135-1138, 1216-1224 | the shared shaft setup; **no recipe is genuinely lockable in this build**, so the locked-silhouette path is screenshotted as it actually renders rather than fabricated | 2+4b | brain |
| 1253-1255 | three MUTUALLY NON-HOSTILE boons, by index, so none suppresses another | 2 | — |
| 1275-1285, 1307-1316 | `give` stands in for the mining grind; the ingot lands past `pickupR` from where the player stood, so teleport rather than re-prove walking | 2 | — |
| 1346, 1353-1355 | peg rungs by hand, not a grant; a sealed dark room with the floor placed so a `footing:1` machine can stand on it | 2 | — |
| 1420-1424, 1435-1442, 1446-1452 | over the hard cap by enough that one drop cannot clear it; **the whole drop burst must stay under `MAGNET_DELAY` or the shed material is picked straight back up**; leave margin because the climb check itself crosses the delay | 2 | — |
| 1485-1492, 1494-1498 | **tick the queue in small batches**: one `frames(1400)` call would hold `cmd.craft` for the whole window and over-craft; the queue empties before the last output has landed | 2 | — |
| 1546-1549 | the no-spawn guard: with `showDebug` off, the debug keys must produce nothing | 1+2 | — |
| 1569-1588 | REAL CLICKS header: **under `?test=1` there is no RAF loop, so a bare `page.mouse.click()` fires down+up with zero time between and `cmd.uiClick` is never processed** — `__mf.frames(1)` between down and up is the faithful stand-in | 2+3 | guide §"Writing tests" |
| 1598-1601, 1615-1617 | `realClick`/`realDrag` shapes and the screen space they use | 1 | — |
| 1642-1645 | `ui.tab.main` is only written by an explicit `setTab`; the default is resolved transiently at render time, so it reads `undefined` | 2 | — |
| 1657-1658, 1683-1685, 1693 | there is always a mouse-only way out; `i` must not close the panel while search has focus; one Escape does both | 2 | — |
| 1815-1817 | no bypass and no silently stuck queue entry | 2 | — |
| 1850-1860 | **`cmd.hasMouse` becomes true on the first real pointer event and flips aim resolution to the cursor**, so a real click's aim lands wherever the panel sits over the world — move the mouse, let a frame resolve `aim`, THEN carve the build site there | 2 | — |
| 1884-1885, 1924-1925 | placing from an open panel closes it; drag out onto empty canvas is the unequip path | 1 | — |
| 1979-1986 | a 5-row room with ONE open cell backed by untouched wall for the hang-from rule; the player centred mid-row so keyboard aim resolves to that row | 2 | — |
| 2026-2030, 2036-2038 | click-to-arm header; a fresh run holds nothing placeable so 'E' places nothing | 1+2 | — |
| 2091-2093, 2124-2128, 2133-2137, 2163-2165 | keyboard aim recipe reused; hand-carved floor and a KNOWN substance; a deterministic backing wall so the hang-from check passes regardless of seed | 2 | — |
| 2215-2225, 2227-2234 | the five-stage furnace lifecycle; **`realRightClick` needs a frame between move and down because `aim` is only resolved inside `step()`** — the gap a real user's mouse motion closes for free | 2 | — |
| 2249-2253 | collect the loose pickaxe first, or `hover`'s item-beats-machine priority wins every check | 2 | — |
| 2267-2272, 2287-2289, 2315-2318, 2330, 2346-2349, 2362-2366, 2380-2383, 2400-2402 | per-stage setup: the banner fix again; close with 'i' not Escape because Escape also clears the arm; hover the machine centre with one camera round trip; exact fuel then exact ore bills so the buffer empties itself; deconstruct refuses while anything is buffered | 2 | — |
| 2425-2433 | the refund is a falling item with a randomised sideways toss, so step in rather than guess a walk direction | 2 | — |
| 2446-2448 | dev serves untransformed, dist is minified — a real divergence risk, asserted rather than assumed | 1+2 | — |
