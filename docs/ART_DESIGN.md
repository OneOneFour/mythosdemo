# Art direction, mined from concept art

Source: `docs/art/*.png` (three Gemini generations) plus their prompts in
`docs/concept-art-prompts.md`. Direction only — the prompts ask for painterly
illustration but two of the three renders came back as clean saturated pixel
art with UI labels (a "factory overview" mockup, not a style plate), so treat
those two as a **systems/vocabulary reference** (what zones and machines the
world implies: cooling water, an ore-sorting stage, a still, a packager — see
`FUTURE_IDEAS.md` and `docs/DESIGN.md` before inventing new ones) and the
vertical key-art piece (`mfz6ig...png`) as the one genuinely useful **style**
reference. Everything below is checked against what `core/palette.js`,
`view/treatments.js` and `core/pixels.js` already have, so nothing here
requires new rendering infrastructure — most of it is unused capability, not
missing capability.

## What's left

`core/pixels.js` exports `noiseFill()` and `walk()`, ported from
`reference/mockup/src/core/canvas.js` almost verbatim. `noiseFill()` is wired
in now (`view/paint.js`'s two-pass tile grain, `view/treatments.js#grassCap`).
**`walk()` is still uncalled anywhere in `view/`** — it is the one primitive
this document names that still has no caller, and it is specifically what a
branching `vein` treatment (below) would use.

## Palette: what already fits, what's missing

The key art's warm-bronze-machinery / cool-stone / hot-fire / bone-white-divine
split is already the palette's structure, not a change to it:

| concept art element | already covered by |
|---|---|
| copper/bronze machinery, warm ochre glow | `cuA-D`, `ochreA-D`, `veinA-C` |
| oxidised copper-green machine casing | `vdA-D` (verdigris) — present, unused in any current `look` row |
| cold blue-grey stone strata | `irA-D`, `snA-D` |
| marble / divine strata, Greek-key trim | `marbleA-C`, `limeA-D` |
| water, waterfalls | `watA-D`, `aquA-C` |
| fire, lava | `lavaA-D` |
| the Abyss, bone architecture | `abyA-C`, `bone`, `boneD` |
| divine light shafts | `hadC`/`shade` region reads closest; no dedicated "cloud/temple" white — `marbleA` already serves |

Nothing needs adding to `core/palette.js` for the strata work below. The one
genuine gap: the key art's thin reddish root/vein squiggles through tan dirt
are a slightly warmer, redder thread than `veinA-C` (which read orange-metal,
correctly, for copper) — if roots and ore veins should read as different
things at a glance, that wants its own two-tone pair. Not urgent; `veinA-C`
can carry both for now.

## Treatments worth adding to `view/treatments.js`

All follow the existing contract: `(g, cell, p)`, `hash2` only, no `rand`.

- **`vein(g, c, p)`** — a branching thread using `core/pixels.js#walk()`,
  seeded from something like `c.tx * 9176 + c.ty` rather than a live counter,
  so it paints identically every repaint of the same chunk. Confirmed safe to
  wire into a render path: both `walk()` and `noiseFill()` already take their
  own `seed` parameter and run a local `mulberry(seed)` instance internally —
  neither touches the global `rand()` stream or `Math.random`, so calling them
  from `view/` does not violate invariant 7. Apply to `copper`/`tin`'s `look`
  as an alternative or supplement to `glint` for the ore-field strata rows
  specifically (`data/world.js`'s `blobs`/`vein` kinds), so a vein reads as a
  branching thread through rock rather than a speckled blob at close range.
- **`banded` shipped** — `stone`, `soil` and `granite` all carry it in
  `data/substances.js` today, giving the topsoil/surface bands their
  sedimentary striation exactly as suggested here: zero new code, a data-row
  edit apiece.
- **`frieze(g, c, p)`** — the Greek key / meander border the key art puts at
  the limestone-to-soil seam. Port `reference/mockup/src/world/strata.js`'s
  `friezeBand()` 7-row bitmap almost directly, but drive it off `c.ty` (a
  single stratum-boundary row) rather than a hardcoded world-space `y`, so it
  can be declared as a `data/world.js` strata row property (e.g. a `frieze`
  key on a `layer` row's top boundary) instead of a screen-space constant.
  This is the single highest-impact, lowest-cost addition for matching the key
  art's "ancient, built" feel at the surface/topsoil seam specifically —
  everywhere else should stay plain rock.
- **Canopy shipped, close to this shape.** `TREAT.canopy` (`view/treatments.js`)
  is a handful of fixed-offset, `hash2`-jittered blobs in three leaf tones,
  sunk over the trunk's top tile, driven by `skyExposedAt` — tile content, not
  a separate decoration list, so felling the tree removes the canopy with it.

## Terrain layering: the concrete recipe

`view/paint.js#paintTile` already does per-tile `hash2` speckle (a "salt and
pepper" grain) plus edge-lighting and mining cracks — all local to one 8x8
tile, with no continuity across tiles. The key art's richer look comes from
effects that operate on a **whole stratum**, not a whole tile:

1. **Still open: depth gradient within a band.** `drawLimestone`/`drawOchre`
   in the mockup tint every row by `mix(colA, colB, t)` where `t` is
   depth-within-stratum. The direct analogue here: `paintTile` (or a new
   per-chunk pass ahead of it) could bias `L.base`/`L.hi`/`L.lo` toward a
   second colour as `ty` approaches a stratum's `toTy`, using the band's own
   `strata` row bounds — already available data, not new data.
2. **Shipped: two-pass noise.** `view/paint.js`'s tile grain calls `noiseFill`
   twice at different densities (`GRAIN_LO`/`GRAIN_HI`) for exactly the reason
   the mockup did — a single density reads as uniform "TV static."
3. **Shipped: bedding planes are the `banded` treatment**, wired up per
   substance above.

None of this touches `rules/` or the tile grid. It is entirely a `view/`-side
richening of how an already-decided tile renders, which is exactly the kind of
change the layer architecture is built to make cheap.

## What to ignore from the two factory-overview images

`n3coy...png` and `kn4fv0...png` are the same composition twice (a labelled
cutaway with "GOD'S FAVOR: 85%", cryogenic/ambrosia/offering-packager zones).
Useful for confirming zone *names* already tracked elsewhere
(`docs/DESIGN.md`'s tribute cycles, `FUTURE_IDEAS.md`'s buoyant heat) exist in
someone's mental model of the game, but the rendering style — dense UI label
callouts, saturated AAA-pixel-art outlines, a busy multi-character god lineup —
does not match this project's flat, label-free, `R()`-rectangle aesthetic and
should not be treated as a style target.
