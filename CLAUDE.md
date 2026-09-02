# CLAUDE.md

Working notes for this repo. Read this before changing anything.

## What this is

A **playable prototype** of a gravity-fed vertical factory roguelike (Greek
myth, underground alchemy). Scaffolding, not a game yet: the architecture is
complete and the core loop runs, and content is deliberately thin.

Read **`ARCHITECTURE.md` before changing anything.** It was written before the
code so it governs rather than describes, and section 7 records what was
rejected so those arguments are not re-litigated. `docs/rfc/` holds the full
reasoning: six competing proposals, a graded review, three built prototypes and
a final code review.

`reference/mockup/` is the original non-interactive pixel-art mockup, preserved
as the art target. **Do not develop it.**

The project's premise is one sentence: **down is free, up is expensive.**
Anything that makes ascent cheap is a bug, not a feature, unless the change is
explicitly about that trade.

## Commands

```bash
npm install              # dev tooling only; the game ships zero runtime deps
npm start                # dev server on :5173, UNTRANSFORMED native ES modules
npm run check            # headless verification — RUN THIS AFTER ANY CHANGE
npm run build            # esbuild -> dist/mythos-factory.html, one file
npm run preview          # serve the built artifact on :5174
npm run parity           # build, then assert dev and dist render identically
npm run test             # check + build + full visual suite
npm run lint             # oxlint, no config
npm run test:visual:update   # re-accept deliberate visual changes
```

## Where to look

```
src/core/    pure utilities — rng, palette, bitmap font, pixel ops, canvas
src/data/    frozen content tables — substances, forms, machines, tuning, world
src/model/   world state and queries. Owns numbers, makes no decisions.
src/rules/   mechanics. Owns decisions and consequences.
src/view/    rendering and HUD. Reads the model, never mutates it.
src/shell/   the loop, input, devices, wiring. schedule.js states the rules order.
tools/       serve, build, check, layers
docs/        SPEC (locked numbers), DESIGN (the game), MIGRATION, rfc/
```

**Nothing may import upward. `rules` and `view` may never import each other.**
`rules` modules are siblings and do not import one another — their order is
stated once, in `src/shell/schedule.js`, with a comment explaining every
adjacent pair. `tools/layers.mjs` enforces all of it as section 0 of
`npm run check`, with a budget of 0 that may only go down.

Two rules answer most "where does this go?" questions:

1. **`model` owns the number and the query; `rules` owns the decision and the
   consequence.** Storage has the lifetime of the world, a decision the
   lifetime of a frame. This is not cosmetic — mining progress used to live in
   the tile store, which is *why* it was a truncated byte, which is why hard
   material became unmineable above a threshold framerate.
2. **A substance is an element; anything you can hold is substance x form.** A
   thing with no element of its own is a form of the element it came from.

## The two things that make content cheap

**Tunables are split by name.** `data/tuning.js` is the frozen design;
`model/mods.js` is the run-scoped modifier list; `eff(id, scope)` is the only
reader. **No file except `model/mods.js` may import `data/tuning.js`**, and the
layer checker enforces it — which is what makes the store unbypassable and
therefore what lets a god's trinket change walk speed at all. A scoped key
narrows to a substance or a machine, so `rate.kiln_divine` speeds one machine.

**Notification flows downward as data.** `rules` never calls `play()` or
`toast()`; it pushes a row onto `model/journal.js` and `shell/notify.js` drains
it once a frame. Measured cost: 0.49 microseconds per frame. The real cost is
one frame of latency, which is fine for sound and wrong for anything needing a
same-frame response.

## Invariants — breaking these breaks the premise

1. **The tile grid is the only source of truth for terrain.** Never a second
   collision model.
2. **World coordinates are absolute per band**, and a band carries its own
   dimensions and tile size. Resizing the window moves the camera and nothing
   else. World size is not a module constant and tile arrays are not allocated
   at import — that was the biggest structural blocker in the old code.
3. **A dig repaints its chunk, not the world.**
4. **Down is free, up is expensive.** Falling is fast and costs hearts;
   climbing is half walk speed and costs material; a carrier rises only while
   something is actively turning it and slides back down under its own weight
   for nothing. **Transport is bounded segments between placed endpoints,
   never one continuous cage:** a segment joins exactly two hub machines
   within `hub.reach x eff('segReach', <hub>)` of each other over an
   unobstructed path, and reaching further means placing another hub and
   another segment. No object in the code may describe a route longer than one
   segment — a route is a derived query over segments
   (`model/segments.js#chains`), never a record. A segment may run at any
   angle, and the shallower it runs the less gravity gives back, so a
   horizontal line needs power in both directions. **Load is physical, not a
   permission:** cargo and a riding player both weigh on the carrier, and past
   what the drivetrain can turn it slows, stops, and then runs backwards. That
   is the premise enforced by arithmetic instead of by a refusal.
5. **Mined material becomes a falling item**, never a direct inventory credit.
   Machines are catch boxes: material that falls in is free.
6. **Health is five discrete hearts.** No partials, no regeneration, no respawn.
7. **A run is bit-reproducible from its seed.** All randomness through `rand()`;
   **rendering consumes none.** A `rand()` call in a draw path breaks seed
   sharing, replay and screenshot testing at once.
8. **`newRun()` resets everything.** A field surviving a restart is a
   determinism bug.
9. **`view` never mutates `model`.** The epoch counter proves it: `model` bumps
   on every write and the check asserts the counter is unchanged across a
   render.
10. **Hardness is seconds-to-break at any framerate.** The simulation runs a
    fixed 1/120 s step and no `rules` module ever sees a variable dt, so a tile
    takes its stated time and a 5-tile drop measures 40 px at 30 fps and at
    144 fps alike.
11. **Integer pixels only.** No `fillText`.
12. **No runtime dependencies.** Dev tooling is a separate question and is
    allowed.

## Verification, and what each layer can actually tell you

| layer | catches | blind to |
|---|---|---|
| `npm run check` | dependency direction, unresolved content names, render purity, hardness at 8 framerates, the fall table, a 7,200-frame collision fuzz, seed determinism, every band rendering | anything visual |
| `npm run test:visual` | appearance *changing* — chunk seams, palette drift, font off-by-ones, z-order — plus real-browser boot errors and dev/dist parity | whether the art is any *good* |
| `npm run lint` | unused and undefined identifiers, where the mutable-state-object convention fails silently | everything else |

`tools/layers.mjs` checks **direction and names, not sense.** It will not notice
an unreachable recipe, a machine with no way to be fed, or a wrong number.

Screenshots are bit-exact (`maxDiffPixels: 0`) because the renderer is
deterministic by construction. **Do not raise that threshold to make a test
pass.** A nonzero diff is either a regression or an intended change — in the
second case run `npm run test:visual:update` and say in the commit why the
pixels moved.

**The current baselines are UNREVIEWED.** They were re-taken mechanically after
the architecture refactor to catch future regressions, not because anyone judged
them good.

## Conventions

- **Integer pixels only.** Everything renders at ~1/2 to 1/6 window resolution
  and is upscaled nearest-neighbour by CSS. Draw via `R()` / `lineTo()`. Never
  introduce sub-pixel positioning or antialiased text.
- **The HUD is drawn in the same pixel space** using the 5x7 bitmap font in
  `core/font.js`. Do not use `fillText` — mixed resolutions break the look.
- **No runtime dependencies.** Not a preference, a constraint. The shipped
  module graph is `src/` plus `vendor/` and nothing else: no bundler, no
  framework, no CDN, no import maps. If something seems to need a library at
  runtime, it doesn't.
- **Dev dependencies are a separate question, and are allowed.** esbuild,
  Playwright and oxlint never enter the shipped artifact, so they do not
  violate the rule above. Keep the distinction sharp: a `dependencies` entry is
  close to forbidden, a `devDependencies` entry needs only to earn its keep.
- **`vendor/` is for single-file, MIT-or-similar drop-ins**, copied in with
  provenance and any local edits documented inline. `vendor/zzfx.micro.js` is
  the model. This is not an npm install and must not become one.
- **No `localStorage` / `sessionStorage`.** They fail in some embed contexts.
- **Palette lives in `core/palette.js`.** Add named entries rather than
  inlining hex.
- **ES module bindings are read-only for importers.** Any scalar written in one
  module and read in another must live on an object in `sim/state.js` and be
  mutated by property. This is why `clock.t`, `cam.y` and the view flags are
  properties. Do not "simplify" them back to bare `let`.
- Prefer editing the **data tables** (`MAT` in `tiles.js`, the beat sheet in
  `tutorial.js`, `FURNACE` in `structures.js`) over editing logic. Most
  requests are data changes.
- **Tuning numbers belong in `docs/SPEC.md` first**, then in code. If they
  disagree, the spec is stale — fix it in the same commit.

## Mistakes already made here — don't repeat them

- **Boot order.** `resize()` sets `VIEW.w/h`, `generate()` fills the grid and
  `SITE`, `resetChunks()` drops stale chunk canvases, and `spawnPlayer()` /
  `resetTutorial()` need `SITE`. The order in `newRun()` is load-bearing.
- **`moveY` must report every landing.** It originally returned `false` when the
  player came to rest without a collision step, so fall damage silently never
  fired. A 26-tile drop was survivable and the harness caught it.
- **Auto-step must work on ladders.** A player who climbs to the top of a ladder
  hangs with their feet in the last rung, a pixel or two below the lip. Gating
  auto-step on `onGround` wedged them in their own shaft permanently.
- **Ladders stack on the ladder below.** Requiring rock support meant the last
  two rungs out of a shaft could not be placed. The shaft became a grave.
- **The player is 6 px wide in an 8 px tile** so a one-tile corridor has slack.
  At 8 px they only fit when perfectly aligned.
- **A test that measures the wrong thing passes and teaches nothing.** The
  furnace check originally sampled the player's column *after* they had walked
  to the altar, so it tested a hole at the surface and reported success. If an
  assertion passes suspiciously easily, verify it is looking where it claims.
- **Don't overwrite source with bundler output.** The mockup's `input.js`
  shipped with `export let d = 0;` inside a function body — it did not parse,
  and nothing imported it, so nobody noticed. `check.mjs` now imports every
  module for exactly this reason.
- **`String.replace` interprets `$` in the *replacement* string.**
  `tools/build.mjs` inlined the bundle with `shell.replace(TAG, bundleText)`.
  Minified JS contains `$` in identifiers, and one `$&` in the bundle expanded
  to the matched text — re-inserting the very `<script src="./src/main.js">`
  tag it was replacing, into the middle of the JS. The artifact was corrupt but
  looked plausible: correct file size, no build error. Always pass a replacer
  **function**, which disables `$` expansion. The build script's own
  self-contained check is what caught it; keep that check.
- **A build step can silently drop a licence.** The vendored ZzFX MIT notice
  was minified away on the first `npm run build`; nothing failed, the artifact
  was simply non-compliant. Licence markers now guard it, and the build script
  prints whether the output is self-contained.
- **I removed the bundler and did not say so.** Restructuring moved the
  mockup's `tools/bundle.mjs` into `reference/` and left the project with no
  way to produce a shippable artifact for two commits. If you move a tool,
  either port it or record its absence.
- **A fixed-`DT` harness cannot see framerate bugs.** `check.mjs` re-implements
  the frame loop at `DT = 1/60` instead of calling the real `step()`, which is
  why three known framerate-dependent bugs pass green. Fixing that is queued.
- **Rendering must stay pure.** The furnace flame briefly used `rand()`, which
  meant a screenshot depended on how many times you had drawn. Derive
  animation from `clock.t` and a position hash instead.
- **A harness can be wrong about correct code.** Rewriting `check.mjs` after the
  refactor produced ten failures, and every single one was the harness, not the
  game: `TUNE` maps id to a *row* rather than a number, a trinket key is dotted
  (`rate.furnace` is tunable `rate` scoped to `furnace`), `NAMED_UNITS` is an
  array, and a recipe with `from:` draws named units from a source rather than
  substance-form selectors. Before believing a new assertion, check the shape of
  what you are asserting against.
- **Use the validator that already exists.** `data/forms.js` exports
  `expand(sel)` specifically to prove a selector is not empty — the failure mode
  that would let a substance pile up in a buffer no recipe consumes. A
  hand-rolled string check was written first and was strictly worse.
- **A test can silently test nothing.** Two screenshot tests set `flags.grid`
  when the real name is `flags.showGrid`, so they baselined a scene with the
  overlays off and passed. If a test asserts a feature is visible, prove the
  pixels differ with it off.
- **Hardcoded click coordinates break at other viewports.** A test clicking at
  (400, 300) fails on the phone project, where the base buffer is 200x422. Drive
  input through the keyboard or through the model, not through geometry.
- **Testing honestly.** Run `npm run check` and `npm run test:visual` and report
  what they actually say. Screenshots prove appearance has not *changed*; they
  do not prove it is good. That still needs a human.

## Working style

Be direct and technically precise; skip preamble. Quantify tradeoffs rather
than asserting them. When something is verified, say what verified it; when
it's only eyeballed or unverified, say that instead. If a request implies a
structural change, name the cost before starting.

## Design context

`docs/SPEC.md` holds the locked numbers and the first-two-minutes beat sheet —
check it before tuning anything. `docs/DESIGN.md` holds the game design
reasoning (run structure, cost-of-ascension maths, god boons, the Hades act);
much of it is not implemented and that file marks which is which.
`FUTURE_IDEAS.md` is the backlog. `docs/concept-art-prompts.md` holds the
image-generation prompt pack. `docs/BUILD_PLAN.md` is the ordered, phased plan
for taking the prototype to a fuller game, and `docs/FINDINGS.md` is where a
phase agent parks anything out of its own scope.

---

## Resolved decisions — vocabulary, units and gates

These four were decided before the `docs/BUILD_PLAN.md` phases began, so that
every phase inherits one answer rather than re-litigating it. They are binding
on `docs/DESIGN.md` too: doc and code may not drift on the vocabulary.

### D1 — four modifier tiers, and the word for each

`docs/DESIGN.md` used to call all three drafted tiers "boons" and treat trinkets
as a subtype. It no longer does. There are **four** tiers, because the code
already had one the old three-way split had no slot for:

| term | lifetime | source | where it lives | surfaced as |
|---|---|---|---|---|
| **Boon** | TIMED, N seconds | god grant, altar, miracle side-effect | `data/boons.js` (new content), `model/boons.js`, `rules/boons.js` | top-right timer stack in `view/hud.js` |
| **Trinket** | whole run, while equipped | drop, tribute reward, cycle draft | `data/trinkets.js` (unchanged), `rules/trinkets.js` | equipment slots in the Character tab |
| **Miracle** | one shot | draft | `data/miracles.js`, `rules/miracles.js` | a consumable held pair in the pockets |
| **Machine grant** | whole run, permanent | cycle reward | `data/grants.js`, `rules/grants.js` | a new row in the BUILD list |

**What happens to today's `data/boons.js`.** Its content is the *machine-grant*
tier — `gift-kiln` grants `kiln_divine`, and `STARTING_MACHINES` seeds
`run.granted`. That is `docs/DESIGN.md`'s **Machines** tier, which the file was
simply misnamed for. So: today's `BOONS` / `BOON` / `STARTING_MACHINES` move
verbatim to **`src/data/grants.js`** as `GRANTS` / `GRANT` /
`STARTING_MACHINES`, and `rules/boons.js` moves verbatim to
**`src/rules/grants.js`**. The name `boons` is then free for the timed tier,
which is new content in a new `data/boons.js`.

All four tiers stay `data/` tables in the existing frozen-table style. Every
tier that carries a *modifier* — Boons and Trinkets — reaches it only through
`model/mods.js`, using the same `{ key, mul, add }` row shape `data/trinkets.js`
already uses and the same fixed order of application stated in
`model/mods.js`. There is no second stat pipeline; a modifier that cannot reach
a tunable is a modifier that does not exist. `mods.rows[].src` is the trinket id
today, so a timed boon's rows are keyed **`'boon:' + id`** to guarantee the two
tiers can never remove each other's rows.

A **miracle is a held pair**, per the substance × form rule: a new `phial` form
with `subTags:['miracle']`, crossed with a `miracle`-tagged substance row per
miracle. That keeps a miracle from ever satisfying a `relic` selector by
accident, exactly as `relic`'s own `subTags` keeps a trinket out of an ore
selector.

**Trinket equip slots are a selection, not a second inventory.** `run.equipped`
is a fixed-length array of substance ids, capped by a new `trinketSlots`
tunable, and `rules/trinkets.js` syncs `model/mods.js` from
`run.equipped ∩ run.inv` rather than from `run.inv` alone. An id in a slot that
is no longer held is ignored and cleared by the same sync, so the two cannot
disagree — which was the whole reason the old `run.trinkets` list was deleted.

### D2 — the GUI is canvas-drawn, and it is `view`

Retained-mode widget layer, drawn with `R()` / `lineTo()` and the 5x7 bitmap
font, integer pixels, no `fillText`. This is not a new constraint; it is the
HUD convention already in force. There is no DOM overlay and no new top-level
`ui/` directory:

- **primitives and panels** are `view`, under **`src/view/ui/`**. Same-layer
  imports are legal, so `view/hud.js` may import `view/ui/panel.js`.
- **which panel is open, the focused slot, the drag payload** are `shell` — a
  state object in **`src/shell/ui.js`**, handed to `view` through `frameCtx`
  exactly as `shell/input.js#flags` already is. `view` may not import `shell`.
- **a click that does something** is `shell` calling `rules`. `view` reports the
  rectangles it drew (the `view/hud.js#pocketHits` idiom); `shell` hit-tests and
  dispatches. `view` never calls `rules` and never mutates `model` — the epoch
  check in `npm run check` proves the second half of that.
- **`__mf.ui`** is the serialisable projection of the live widget tree, exposed
  on the existing single test handle rather than a second `window.__ui` global.
  It is a projection of real state, never a copy.

### D3 — mass is in talents, and a carry cap is new state

The unit is the **talent (T)**, displayed `BURDEN 12.5 / 40 T`. Mass semantics
already exist and do not change: `model/items.js#massOf` /
`#massOfPair` return `SUB[sub].item.mass * FORM[form].massK`, and
`view/hud.js`'s inventory panel already prints it. What is new is **a cap and a
total**: `burdenOf()` in `model/run.js` sums `massOfPair × n` over `run.inv`,
and the cap is a `data/tuning.js` row read through `eff('burden')`.

### D4 — encumbrance gates ascent, and nothing else

The player-scale expression of "down is free, up is expensive". Three tunables,
never constants: `burden` (hard cap, base 40 T), `burdenSoft` (0.75) and
`burdenClimbFloor` (0.40).

- below the soft cap: normal climb.
- soft → hard: climb speed falls linearly from 1.0 to `burdenClimbFloor`.
- at or over the hard cap: **climbing is impossible.** Ladder-up and hop are
  refused, legibly, through a journal row.
- **a carrier is the one exception, and it is physics rather than permission.**
  Boarding is never refused at any weight. The player's body plus everything
  in their pockets is real load on the segment (see D10 and
  `docs/PLAN-gears-and-winches.md`), so an over-cap player standing on a
  carrier makes it slow, stall, or run backwards under them. The ascent is
  still impossible; nothing had to say so.
- **walking on level ground and every downward movement are never affected.**
  You can always fall.
- a pickup that would cross the hard cap is refused, with a journal row.

Two deliberate exceptions, both for reasons already recorded in this file:

1. **The one-tile auto-step in `rules/player.js#moveX` is not gated.** Gating a
   height gain on state is exactly the mistake that wedged a player in their own
   shaft permanently, and an over-cap player must be able to walk over rubble to
   reach the ledge they need to drop ore onto.
2. **A drop verb is a prerequisite, not a nicety.** There is no way to put
   material down today. Shipping the lockout without one is a soft-lock, so
   `rules/items.js` gains a drop before `rules/player.js` gains the gate. This
   is called out again in `docs/BUILD_PLAN.md` Phase 2a.

### D5 — cargo ascends to the Heavens; the player is not walled out of them

`docs/DESIGN.md`'s "The Hades act" is explicit that the sky gods "shout demands
from clouds you cannot reach and never address you directly", and that Hades'
whole characterisation is that he walks up to you underground, in person, and
asks politely. A walkable cloud level with rooms in it spends the best reveal in
the game to buy a space with nothing in it.

So: **cargo ascends, the player does not — and gravity is the gate, not a
wall.** The topmost lift stage terminates at a 2-tile Cloud Dock in the
`astral` band. The player *can* ride up and stand on it. Step off and you fall
the full world height, which `docs/SPEC.md` §3's table already makes lethal at
20 tiles. No invisible wall, no "you cannot go here" message, no new mechanic:
the existing fall-damage curve is the fence, and the myth it evokes is the
correct one. You watch hands take your cargo and you go back down.

The gods are never drawn as figures and never speak to the player directly in
the Heavens. That first-person address is Hades', and it is not spent here.

### D6 — the First Trial does not move

`docs/SPEC.md` §4 and §5 lock cycle 1 as an altar **on the surface**, 10 raw
copper, no clock, the furnace as the reward. Changing it breaks a beat sheet
where every beat teaches exactly one thing. The Heavens become the
**cycle-2-and-later** delivery target, which is what makes the lift chain the
actual win condition rather than a convenience. Cycle 1 teaches "the gods ask";
cycle 2 teaches "and they are not where you are."

`docs/DESIGN.md`'s "Run structure" still says "Cycle 1: 20 copper plates",
which contradicts §4. **`docs/SPEC.md` wins**; DESIGN.md is stale there and is
fixed in the same commit as the cycle director.

### D7 — non-interactive scenery is paint, never a substance row

`docs/SPEC.md` §15 records **12 tile-capable substance rows** left before the
tile-id byte overflows (`src/data/forms.js`'s import-time guard, narrowed to
the packable maximum in Phase 8c — was 2). Spending one on foliage would still
be the worst trade available: headroom is not the argument for D7, paint
already being the cheaper and more flexible mechanism is.

So: **a trunk stays a `timber/log` tile** — felling is unchanged and §5's "fell
the olive tree for a ladder" still works — and **canopy, grass fringe, cliff
moss and every other non-interactive detail are render-only decoration**, baked
into the chunk canvas and deterministic from tile coordinates through `hash2`.
Zero tile cost, zero collision, zero byte budget.

This is not new machinery: `view/treatments.js#TREAT` is already that table,
already reached by name from a `look:{ treatments:[...] }` row, and already
holds a `canopy` entry. **Extend `look:{}` and `TREAT`; do not add a second
paint pipeline.** A parallel `paint:{}` block beside `look:{}` would be the same
mistake a second stat pipeline beside `model/mods.js` would be.

### D8 — HUD real estate is anchored, never hardcoded

The screen edges are already contended. Today `view/hud.js` draws the depth
gauge top-right (`depth(g, W, 6)`) and the Phase 4 boon timer stack **below**
it; the mockup wants FAVOUR top-right as well. The map:

| anchor | panel | state |
|---|---|---|
| top-left | hearts, burden bar | exists |
| under top-left | TRIBUTE — demand list, progress, deadline | new |
| top-right | depth readout, then the BOON timer stack under it | exists |
| under the boons, right | FAVOUR — per-god bars, masked ids | new |
| right edge, vertical | DEPTH band ruler | new, shared with overview |
| bottom-right | SUSPICION | hidden until Hades exists |
| bottom-left | journal | exists |

And a rule the mockup itself argues for: in the mockup, FAVOUR's "HEPHAESTUS"
overruns its frame, the boon cards clip off the bottom edge, and TRIBUTE's rows
are cut mid-word. **Panels are positioned by an anchored layout pass over
measured text, never by hardcoded pixel origins.** The mockup is a target for
density and framing, not for its overflow bugs. `view/hud.js`'s existing clamp
comments (line ~23) are the same argument, made once already.

**The masked-id predicate is created once and shared.** Nothing in `src/` masks
anything today — there is no FAVOUR panel, no TRIBUTE state and no `????????`
rule yet. Whichever phase lands the band ruler writes that predicate, and the
FAVOUR panel reuses it. Not the other way round.

### D9 — the depth datum does not move, and the Heavens already exist

`docs/SPEC.md` §12 anchors `cyclops_maw`'s `minDepth:200` and the HUD gauge to
the **same** datum — `worldY` of the spawn band's own `floorTy` — specifically
so the gauge and placement legality can never disagree. **0 M stays the spawn
floor.** The Heavens are negative depth, displayed as `ABOVE` or `-32 M`, never
as a new zero.

There is no array to grow upward, and nothing to reindex. `src/model/world.js`
holds `bands` as separate records, each with its own absolute `origin` and its
own typed arrays, allocated per band by `world.write.allocate(cfg)` at boot —
which is the whole point of ARCHITECTURE §6. A band above the surface is
therefore already expressible, and one already exists:
`src/data/world.js#BANDS[0]` is `astral` / **"THE MINOR HEAVENS"** (`tw:96`,
`th:40`, `tile:8`, `origin:{x:128, y:0}`, `floorTy:30`), and
`src/data/machines.js`'s winch stage already declares
`lift:{ span:64, toBand:'astral' }`. The world is three bands and 416 rows
(40 + 56 + 320) spanning world-Y 0..3328 px.

### D10 — one word per part, and where the cable stops being physical

The staged winch (`rules/lift.js`, `data/machines.js`'s `lift` row) is
replaced by player-driven, gear-linked **segment transport**
(`docs/PLAN-gears-and-winches.md`). Five nouns, and nothing in code, docs or
a commit message may use a sixth:

| term | what it is | where it lives |
|---|---|---|
| **hub** | a placed machine that a segment may be anchored to. Gears and a drum. | `data/machines.js` row with a `hub:{}` block |
| **segment** | ONE cable between exactly TWO hubs, carrying one carrier. Runtime, not a machine. | `model/segments.js` (state) + `rules/drive.js` (motion) |
| **carrier** | the bucket/platform that rides a segment. One per segment. | a field on the segment record |
| **chain** | a maximal connected run of segments. DERIVED, never stored. | `model/segments.js#chains()` |
| **drivetrain** | the placed crank/gear/axle graph that supplies torque. | `crank:{}` / `gear:{}` blocks, solved in `rules/drive.js` |

**The reconciliation.** Everything that supplies or transmits POWER is
physical, placed and adjacent: a crank, a gear, an axle, and the hub they
feed. Power flows only through footprint adjacency between those machines.
The one thing that is NOT tile-by-tile placed is the CABLE between two hubs:
once both hubs exist, are within reach, and the straight path between them is
clear, the segment resolves itself. So the player places endpoints and
drivetrains, never cable — and a belt is still the tile-by-tile thing a belt
always was.

**Torque is a component scalar, not a per-edge flow.** One crank feeding
three segments through gears turns all three at a third speed. That is the
whole of "gears connect multiple systems together": a shared, divisible
resource with a visible cost, not a graph-flow simulation.

**Manual only, for now.** The crank turns only while the player holds it —
the same hold-to-act idiom as mining and hand-crafting, not a switch. There
is no heart-powered or otherwise passive fallback: the earlier blood-winch
trap (paying a heart to power the lift with no fuel) does not carry forward
onto the crank. The cost of power is the player's own standing presence and
attention, full stop; a passive alternative is a generator, explicitly
deferred, and unrelated to hearts or `data/sources.js#vital`.

What the Heavens lack is not a location but content: a dock, a ledger, and a
reason to go. That is the cycle director's job, not worldgen's.

### D12 — a form is either feedstock or buildable, never both

**A form carrying a `tile` block may not also be named by any recipe's `in:`
selector, any machine's `handFeed.from` selector, or any tribute demand.** The
thing you build with and the thing you consume are different rows in
`data/forms.js`, and the recipe between them is the whole point.

This is not a style rule; it is what makes mined material a *prerequisite*
rather than a placeable unit, and it is the premise stated in content instead
of in a check. When one form is both, nothing ever forces the player through
the recipe, so the recipe might as well not exist.

Two worked examples, both real and both built:

- **`gravel` → `block`.** `gravel` used to carry
  `tile:{ solid:true, climb:false, hardK:0.5 }` *and* be consumed by
  `brazier`/`crank`/`gear`/`belt_r` *and* be the literal tribute currency of
  `data/cycles.js#salt-tribute`. Mined rubble shovelled 1:1 straight back into
  the hole it came out of, for nothing. `gravel` is now feedstock only, and
  `data/recipes.js#pack` packs **5 rubble of one `bulk` element into 1
  `block`** of that element, recovered at native hardness rather than half.
- **`log` → `rung` + `stair`.** `log` used to carry
  `tile:{ solid:false, climb:true, hardK:0.30 }` *and* be `tags:['fuel']` a
  furnace drains *and* be a bare ingredient in five recipes. Same shape, other
  substance. `log` is now feedstock only, and `recipes.js#peg_rungs` (2 logs →
  4 `rung`, unchanged and already present) is the only route to a placeable
  timber ladder.

Two consequences worth having in one place:

- **A deposit becomes unplaceable by construction, not by permission.** With
  the tile-capable forms reduced to `rung`/`stair`/`block` and `block`'s
  `subTags:['bulk']`, `crossable(granite, block)` is false — the pair cannot
  be *expressed*, so no placement path can be forgotten. `rules/placement.js`
  needed no edit at all. `copper/stair` and `tin/stair` remain legal and
  intentional: a Daedalan stair is refined bronze work, not a vein of copper,
  and D12 is about a form's double duty, not about a substance's.
- **`tools/content.mjs` assertion 20** makes the classification a build
  failure rather than a convention: every substance carrying both a `tile`
  block and the `mineable` tag must carry exactly one of `bulk`, `deposit` or
  `organic`. `docs/SPEC.md` §19 holds the numbers.
