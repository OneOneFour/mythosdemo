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
npm install              # dev tooling only; the game ships zero runtime deps
npm start                # dev server on :5173, UNTRANSFORMED native ES modules
npm run check            # headless verification — RUN THIS AFTER ANY CHANGE
npm run build            # esbuild -> dist/mythos-factory.html, one file
npm run preview          # serve the built artifact on :5174
npm run parity           # build, then assert dev and dist render identically
npm run test             # check + build + full visual suite
npm run lint             # oxlint, no config
npm run test:visual:update   # re-accept deliberate visual changes
npm run check:mockup     # the preserved mockup's own harness
```

## The build, and why dev does not use it

Two paths, deliberately:

- **Dev (`npm start`)** serves `src/` as native ES modules with **no transform
  at all**. What you debug is what you wrote — real line numbers, no source
  maps, the module graph inspectable in devtools. This is the property the
  project's old no-build rule existed to protect, and it is worth keeping.
- **Release (`npm run build`)** runs esbuild: bundle, minify, inline into one
  self-contained `dist/mythos-factory.html`. ~36 KB, no external requests,
  verified to boot from `file://`.

esbuild was chosen over Rollup and Vite on measured cost: esbuild is **2
packages** with bundling, minification and `node_modules` resolution built in.
Rollup needs `@rollup/plugin-node-resolve` and `@rollup/plugin-terser` for the
same job, which is **31 packages**. Vite is 16 and would also replace the dev
server — reasonable, but it buys most of its value for frameworks this project
does not use. esbuild also provides `--serve`/`--servedir`/`--watch`, so no
second tool is needed; `npm run preview` uses it.

**Two paths means a divergence risk, so it is asserted, not assumed.** The
parity test drives both the dev page and the built artifact through the same
scripted scene and compares the canvas pixel-for-pixel. If minification or
bundling ever changes behaviour, `npm run parity` fails. Do not delete that
test to make a build pass.

### Can I `npm install` a runtime library?

For the **build**, yes — esbuild resolves bare specifiers from `node_modules`
and inlines them. Verified end to end with `simplex-noise`: installed,
imported as `from 'simplex-noise'`, built, and the artifact booted from
`file://` returning correct values.

For **dev**, no, not on its own. `npm start` serves untransformed modules, and
a browser cannot resolve a bare specifier:

```
TypeError: Failed to resolve module specifier "simplex-noise".
Relative references must start with either "/", "./", or "../".
```

The fix is **an import map in `index.html`**, which is a native browser feature
and needs no build step:

```html
<script type="importmap">
{ "imports": { "simplex-noise": "/node_modules/simplex-noise/dist/esm/simplex-noise.js" } }
</script>
```

Verified: with that map, dev boots clean AND the build still works, because
esbuild ignores the map and resolves from `node_modules` directly. The cost is
that `node_modules/` must be served in dev, and the map needs one entry per
package pointing at that package's real ESM file.

So a runtime dependency is *possible* and costs about three lines. It is still
governed by the rule above — possible is not the same as warranted, and the
library research concluded almost nothing is worth installing at runtime.
Vendoring stays preferable for anything small enough to read.

**`vendor/zzfx.micro.js` opens with `/*! @license`.** Those markers are
load-bearing: esbuild strips comments without them, which silently dropped the
MIT copyright notice from the shipped artifact once already. Any future
vendored file needs the same marker.

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
8. **A run is bit-reproducible from its seed.** Everything in `sim/` and
   `render/` draws randomness from `rand()` in `core/rng.js`, never from
   `Math.random()`, and `newRun()` reseeds it. Rendering consumes no randomness
   at all, so drawing twice cannot change the outcome. This buys seed sharing,
   deterministic replay, and screenshot tests that diff at threshold zero — a
   `Math.random()` call in a draw path silently breaks all three.
9. **`newRun()` must reset *everything*.** Any field that survives a restart is
   a determinism bug. `pickup.bob`, the player's animation phases and `clock.t`
   all leaked once, and the screenshot test caught it as "the same seed renders
   differently twice."

## Verification, and what each layer can actually tell you

| layer | catches | blind to |
|---|---|---|
| `npm run check` | imports, generation guarantees, the fall-damage table, all nine tutorial beats, collision fuzz at four viewports, dig repaint cost | anything visual; anything framerate-dependent, because it runs at a fixed `DT` |
| `npm run test:visual` | appearance — chunk seams, palette drift, font off-by-ones, z-order, camera jitter — plus real-browser boot errors and seed determinism | whether the art is any *good*; only that it has not changed |
| `npm run lint` | unused and undefined identifiers, which is where the mutable-state-object convention fails silently | everything else |

Screenshots are bit-exact (`maxDiffPixels: 0`) because the renderer is
deterministic by construction. **Do not raise that threshold to make a test
pass.** A nonzero diff is a real change; either it is a regression, or it is
intended and you run `npm run test:visual:update` and say in the commit why the
pixels moved. A human approves the baseline; the machine guards it after that.

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
image-generation prompt pack.
