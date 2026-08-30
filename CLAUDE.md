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
   climbing is half walk speed and costs material; the winch ascends only with
   a lit burner. Five independent lift stages, never one continuous cage.
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
image-generation prompt pack.
