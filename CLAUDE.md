# CLAUDE.md

Working notes for this repo. Read this before changing anything.

## What this is

A pixel-art **visual mockup** for a gravity-fed vertical factory roguelike
(Greek myth, underground alchemy). It is deliberately not playable: nothing is
interactive except the camera. Its job is to look right and to prove the world
model is geometrically coherent.

Do not add gameplay unless asked. If asked to "make it playable", that is a
rewrite, not an edit — say so first.

## Commands

```bash
npm install        # zero dependencies; instant
npm start          # dev server on :5173 (ES modules need an HTTP origin)
npm run check      # headless verification — RUN THIS AFTER ANY GEOMETRY CHANGE
npm run bundle     # inline all modules -> dist/mythos-factory.html
```

`npm run check` stubs the DOM, builds the world at four viewport sizes, runs 60
simulated seconds, renders every depth band, and asserts no material ends up
outside carved rock. It catches broken imports, non-finite draw coordinates,
off-canvas placement on narrow screens, and material falling through solid
stone. **It cannot tell you whether anything looks good.** Visual changes need
a human to eyeball them; say so rather than claiming a visual result is verified.

## Where to look

`src/world/layout.js` is the file that matters. It defines the excavation
model, and everything else is presentation derived from it. Read it before
touching `strata.js`, `excavate.js`, or `structures.js`.

```
src/core/      canvas scaling, pixel primitives, palette, bitmap font, RNG
src/world/     baked once into an offscreen strip (config, layout, strata,
               excavate, structures, build)
src/sim/       per-frame dynamics (mines, carts, drops, piles, stations, lift)
src/render/    per-frame drawing (scene, entities, hud)
src/main.js    RAF loop        src/bootstrap.js  rebuild()
```

## Invariants — breaking these breaks the premise

1. **Rock is solid unless it appears in `VOIDS`.** Material may only occupy
   carved space. `npm run check` enforces this; if it reports escapes, the fix
   is to carve a path, not to widen the tolerance.
2. **Falling material only travels inside a shaft**, and every shaft terminates
   on a real floor listed in `LEVELS` (or the lava surface).
3. **A pile only shrinks if something consumes it.** A pile with no consumer
   must fill and flag `FULL`. That is the mechanic, not a bug — `dead` and
   `deep` are supposed to back up.
4. **The lift is five independent stages**, one per level pair, each with its
   own drum, deck and counterweight. Never make it one continuous cage; the
   staged relay is a deliberate design statement.
5. **Down is free, up is expensive.** Cages ascend at 11 px/s and descend at
   26 px/s, and only ascend with a lit burner. Preserve that asymmetry.
6. **Placement is drift-aware.** Drifts narrow with depth, so use
   `placeShaft()` / `placeOn()`, never raw `clampX()`, or things land in solid
   rock on a phone.

## Conventions

- **Integer pixels only.** Everything renders at ~1/3 window resolution and is
  upscaled nearest-neighbour by CSS. Draw via the `R()` / `lineTo()` helpers.
  Never introduce sub-pixel positioning or antialiased text.
- **The HUD is drawn in the same pixel space** using the 5x7 bitmap font in
  `core/font.js`. Do not use `fillText` — mixed resolutions break the look.
- **No dependencies.** Not a preference, a constraint. No bundler, no
  framework, no CDN. If something seems to need a library, it doesn't.
- **No `localStorage` / `sessionStorage`.** They fail in some embed contexts.
- **Palette lives in `core/palette.js`**, lifted from the concept art. Add
  named entries rather than inlining hex.
- **ES module bindings are read-only for importers.** Any scalar written in one
  module and read in another must live on an object in `sim/state.js` and be
  mutated by property. This is why `tNow`, `camY` and the view flags are
  `clock.t`, `cam.y`, `view.*`. Do not "simplify" them back to bare `let`.
- Prefer editing the **data tables** (`LEVELS`, `SHAFTS`, `PILES`, `STATIONS`,
  rig entries) over editing drawing code. Most requests are data changes.

## Throughput model

If you rebalance, do the arithmetic — do not guess.

- A rig yields **one cart per breakout**, i.e. every `4 * period` seconds.
  Single pick strikes only throw chips.
- A station consumes **one of each input per `rate` seconds**, and emits one
  output per `perOut` charges. `perOut` is where refinement ratios live.
- A station runs **38% faster when its feed pile is over 55% full**
  (`cool = rate * 0.62`). This servo is what keeps piles bounded; without it
  small surpluses accumulate to `FULL` over ~20 minutes.
- Lift stage throughput ≈ `4 / (span/11 + span/26 + 2.5)` units per second.
  The lift is intended to be the bottleneck.

Target state: ore piles visibly breathing between roughly 5% and 60%, deck
piles fluctuating, and exactly three piles pinned full for the three distinct
reasons in invariant 3.

## Mistakes already made here — don't repeat them

- **Boot order.** `resize()` sets `W/H/CX`, `layoutContent()` needs those, and
  `buildWorld()` needs the tables `layoutContent()` builds. The order in
  `bootstrap.js` is load-bearing. Getting it wrong throws during boot and
  renders nothing at all.
- **Don't overwrite the source with bundler output.** `dist/` output has
  imports stripped and state already converted; re-processing it corrupts the
  state objects. `dist/` is gitignored for this reason.
- **`bandAt()` past the world floor.** `findIndex` returning `-1` used to clamp
  to index 0 and report "THE HEAVENS" at the bottom of hell.
- **Narrow viewports.** Below ~240px base width, HUD panels overlap and boon
  cards collide with the depth gauge. `drawHUD` clamps for this; keep those
  clamps if you touch it.
- **Testing honestly.** I shipped a version once that threw on boot and
  claimed it worked. Run `npm run check` and report what it actually says.

## Working style

Be direct and technically precise; skip preamble. Quantify tradeoffs rather
than asserting them. When something is verified, say what verified it; when
it's only eyeballed or unverified, say that instead. If a request implies a
structural change, name the cost before starting.

## Design context

`docs/DESIGN.md` holds the game design decisions from the conversation that
produced this mockup — run structure, the cost-of-ascension maths, god boons,
the Hades act. Much of it is not implemented here; that file marks which is
which. `docs/concept-art-prompts.md` holds the image-generation prompt pack.
