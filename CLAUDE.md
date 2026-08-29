# CLAUDE.md

Working notes for this repo. Read this before changing anything.

## What this is

A **playable prototype** of a gravity-fed vertical factory roguelike (Greek
myth, underground alchemy). You walk, dig, place ladders, take fall damage, and
die permanently. The first two minutes are implemented end to end.

It replaced a non-interactive visual mockup, which is preserved verbatim in
`reference/mockup/` as the art target. **Do not develop the mockup.** Read it
for painting technique and composition, then leave it alone.

The project's whole premise is one sentence: **down is free, up is expensive.**
Anything that makes ascent cheap or convenient is a bug, not a feature, unless
the change is explicitly about that trade.

## Commands

```bash
npm install         # zero dependencies; instant
npm start           # dev server on :5173 (ES modules need an HTTP origin)
npm run check       # headless verification — RUN THIS AFTER ANY CHANGE
npm run check:all   # the above, plus the mockup's own harness
```

`npm run check` imports every module (including `input.js`), asserts the world
generates with its tutorial guarantees intact, verifies the fall-damage table
against `docs/SPEC.md`, **drives a scripted bot through all nine tutorial
beats**, fuzzes the player against the tile grid at four viewport sizes, and
measures how many chunks a single dig repaints.

**It cannot tell you whether anything looks good.** Visual changes need a human
to eyeball them; say so rather than claiming a visual result is verified.

## Where to look

`src/world/grid.js` is the file that matters. It is the single source of truth
for solidity, material and mining state. Read it before touching `tiles.js`,
`generate.js`, or `paint.js`.

```
src/core/      canvas + camera-independent viewport, pixel primitives,
               palette, 5x7 bitmap font, RNG
src/world/     tiles (material table), grid (chunked storage),
               generate (tutorial band), paint (per-chunk rendering)
src/sim/       state, player, items, mining, structures, tutorial
src/render/    scene, hud
src/main.js    boot + loop      src/input.js  keyboard and mouse
tools/         serve, check
reference/     the original non-interactive mockup — read-only
docs/          SPEC.md (locked decisions), DESIGN.md (reasoning)
FUTURE_IDEAS.md  parked ideas
```

## Invariants — breaking these breaks the premise

1. **The tile grid is the only truth.** Solidity, appearance and mining state
   all come from `grid.mat`/`grid.dmg`. Never introduce a second collision
   model — the mockup had a bitmap and a rect list that could disagree, and
   that is why it could not support digging.
2. **World coordinates are absolute.** `WORLD_W`/`WORLD_H` never depend on
   `innerWidth`. Resizing moves the camera and nothing else. The mockup
   rebuilt its world on resize; that is exactly what we escaped.
3. **A dig repaints its chunk, not the world.** `markDirty()` flags at most the
   touched chunk plus seam neighbours. The check asserts this. If a change makes
   a dig dirty many chunks, fix the dirty tracking, don't relax the assertion.
4. **Down is free, up is expensive.** Falling is fast and costs hearts. Climbing
   is 30 px/s — half walk speed — and costs timber. Preserve that asymmetry.
5. **Mined material becomes a physical falling item**, never a direct inventory
   credit. This is how the player learns the thesis before any machine exists.
   Machines are catch boxes: material that falls in is free.
6. **Health is five discrete hearts.** No partial hearts, no regeneration, no
   respawn. Death ends the run.
7. **Fall damage follows `docs/SPEC.md`**: 5 tiles safe, one heart per 32 px/s
   above 160 px/s, 20 tiles lethal. The check asserts all seven rows.

## Conventions

- **Integer pixels only.** Everything renders at ~1/2 to 1/6 window resolution
  and is upscaled nearest-neighbour by CSS. Draw via `R()` / `lineTo()`. Never
  introduce sub-pixel positioning or antialiased text.
- **The HUD is drawn in the same pixel space** using the 5x7 bitmap font in
  `core/font.js`. Do not use `fillText` — mixed resolutions break the look.
- **No dependencies.** Not a preference, a constraint. No bundler, no
  framework, no CDN. If something seems to need a library, it doesn't.
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
- **Testing honestly.** Run `npm run check` and report what it actually says.
  Never claim a visual result is verified.

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
image-generation prompt pack.
