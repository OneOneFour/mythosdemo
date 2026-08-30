# Architecture RFC brief

Shared brief for the architecture redesign. Every plan is written against this
document so the plans are directly comparable.

**Read this, then `CLAUDE.md`, `docs/SPEC.md`, `docs/DESIGN.md`,
`FUTURE_IDEAS.md`, and all of `src/` (1,889 lines, 16 modules).**

---

## 1. What is wrong with the current architecture

Not the *what* — the game content is fine. The *how*. Verified, with counts:

**Hardcoding.** 13 references to specific substance names live outside the two
data tables. The worst offenders:

- `src/world/paint.js:127` — `if (M.id === 'copper')`. The **renderer**
  special-cases a material by string comparison.
- `src/sim/structures.js:52,68,69` — the furnace's catch box and hand-feeding
  hardcode `'copper'` and `'timber'`, with buffer caps of `4` and `2` as bare
  literals.
- `src/render/hud.js:57-62` — the inventory row hardcodes four substance names
  plus a special case for `ingot`.
- `src/sim/mining.js:63` — material→sound mapping via a hardcoded `0.5`
  hardness threshold and a string compare.

**No single source of truth for a substance.** "Copper" is defined twice:
`MAT` in `world/tiles.js` (as a `drop:` target, with rock colours, hardness,
solidity) and `KIND` in `sim/items.js` (item colours, label, size). Neither is
authoritative. Same for soil, stone, timber.

**One hardcoded machine.** `sim/structures.js` is 92 lines implementing exactly
one furnace. `FURNACE` is a module constant, `placeFurnace()` is a bespoke
function, the recipe check names its two ingredients explicitly. There is no
concept of a machine *type*, of ports, or of a recipe graph.

**Logic in the wrong module.** `damage()` — the pick mechanic, which decides
what item a broken tile drops — lives in `world/grid.js`, a storage module.
This is not merely untidy: mining progress got stored as a `Uint8Array` byte
*because* it lives in the tile store, and the resulting truncation is why
granite takes 4.25s against a specified 2.40s.

**Config as module constants.** `world/grid.js` sets `WORLD_TW`/`WORLD_TH` at
module scope and allocates the arrays at import time, so **world size is fixed
at import and cannot change at runtime.** This is the single biggest blocker to
generating multiple depth bands.

**Barebones painting.** `world/paint.js` has 7 inline hex colours, a `darkAt()`
that hardcodes four depth bands, and two monolithic functions
(`paintTile`/`paintCavity`). There is no way to add a visual treatment without
editing those functions. Painting is also the only consumer of some material
fields, so appearance and physics are tangled in one table.

## 2. Findings from a prior code audit — do not rediscover these

- The item→structure loop is **O(structures x items)** (`structures.js:48-59`),
  and it rescans *resting* items every frame. There is **no spatial index for
  entities anywhere**; the tile grid is the only index in the codebase.
- Chunk repaint has **no budget**. One chunk repaint is ~4,300 `fillRect`; a
  4x4-chunk region dirtied in one frame is ~66,000, all in that frame. A
  cave-in or a flood front produces a guaranteed hitch.
- The chunk canvas cache **never evicts** (12 MB if all resident today).
- The `run` object's schema is declared in **four disagreeing places**
  (`state.js`, `main.js`, `mining.js:90`, `tutorial.js`), which is a hard
  blocker on save serialisation.
- `tileAt()` returns **`-1` as an out-of-bounds sentinel**, special-cased at 7
  sites; `MAT[-1]` throws. A `bedrock` material row would delete the whole
  class of bug.
- `mix()` (`palette.js`) does two `parseInt`s and builds a string **per call**,
  on the chunk-paint hot path, for values that are compile-time constants.
- Items have no identity: `{x,y,vx,vy,kind,rest,age,magnet}` in a plain-object
  array, and `run.inv` is a `{kind: count}` bag.

## 3. Hard constraints — a plan that breaks these is disqualified

1. **No runtime dependencies.** The shipped module graph is `src/` plus
   `vendor/`. Dev tooling (esbuild, Playwright, oxlint) is fine.
2. **Native ES modules, no transform in dev.** `npm start` serves `src/`
   directly. No syntax requiring a build step: no TypeScript, no JSX, no
   decorators.
3. **Integer pixels only**, drawn through `R()`/`lineTo()`. No `fillText`.
4. **No `localStorage`/`sessionStorage`.**
5. **A run stays bit-reproducible from its seed.** All randomness through
   `rand()` in `core/rng.js`; **rendering must consume no randomness**.
6. **`newRun()` must fully reset state.** Any field surviving a restart is a
   determinism bug.
7. **Down is free, up is expensive.** Preserve the asymmetry: falling is fast
   and costs hearts, climbing is half walk speed and costs timber.
8. **Mined material becomes a falling item**, never a direct inventory credit.
   Machines are catch boxes; material that falls in is free.

## 4. Explicitly OUT of scope

- **Visual design and art style. Entirely.** Do not tune the palette, the zoom,
  the rock textures, or the look of anything. The existing screenshot baselines
  *will* fail and that is expected and acceptable — they are a regression net
  for a stable codebase, not an acceptance test for this work. Do not spend
  effort reproducing pixels, and do not propose art improvements.
- Monsters, pathfinding, god boons, meta-progression, persistence format,
  replay, audio design. Name them as extension points if your design creates a
  natural seam; do not build abstractions for them.

## 5. IN scope, and required

Design for what `docs/DESIGN.md` treats as core:

- **Item identity** — mass, purity, fragility, temperature per item or per
  stack, without changing the container's shape each time a property is added.
- **Fluid and heat fields** — per-tile scalar fields with an active-cell notion
  so idle regions are skipped. A demonstrated *seam* is required; a working
  implementation is not.
- **A real production graph** — many machine types, multi-input/multi-output
  recipes, ports, and item routing between machines.

## 6. The extensibility benchmark — address every point explicitly

Your plan is graded on these. Show real code, not prose, for 1-4.

1. **Add a substance.** Adding `tin` (a mineable ore that smelts to an ingot)
   must be **one table row with no other file edited.** Show the row.
2. **Add machines.** Adding a *crusher* (1 ore -> 2 gravel) and a *washery*
   (2 gravel + 1 water -> 1 concentrate, needs a fluid input) must require
   **no engine code**. Show both declarations.
3. **Data-driven painting.** The copper glint at `paint.js:127` must become
   data. Show how, and how a new treatment (e.g. "this material glows") is
   added without editing a paint function.
4. **Configurable world.** `WORLD_TW`/`WORLD_TH` must become injected config so
   a second, differently-sized depth band is possible. Show the seam.
5. **Where does mining live**, and why is that defensible?
6. **Item identity** representation, with the memory layout named.
7. **Fluid/heat field seam**, and how it reuses (or does not reuse) the
   existing chunk-dirty machinery.
8. **HUD inventory** driven by data, not four hardcoded names.
9. **Entity spatial indexing** — what replaces the O(n·m) item/structure scan.
10. **The three known bugs must be fixed by construction**, i.e. the
    architecture should make them hard to reintroduce:
    - granite honours its specified 2.40s (currently 4.25s at 60fps, and it
      gets *faster* on slower machines — a byte-truncation artifact)
    - a 20-tile drop is lethal at any framerate (currently 4 hearts at 60fps
      against a specified 5)
    - items never tunnel through a 1-tile floor (currently 3 of 8 sub-pixel
      offsets pass through at dt=0.05)

## 7. Required plan structure

Write to `docs/rfc/<NN>-<slug>.md`. **900–1,800 words plus code blocks.**
Longer is not better; the reviewer is comparing five of these.

```
# <NN> — <name of the architecture>
## Core model            (one paragraph: the central idea)
## Benchmark             (all 10 points from section 6, with code for 1-4)
## Directory layout      (the proposed src/ tree)
## Migration path        (ordered steps from today's code, est. LOC touched each)
## What this is bad at   (REQUIRED — at least three honest weaknesses)
## Rejected alternatives (what you considered and discarded, and why)
```

The **"what this is bad at"** section is not optional and is weighted heavily.
A plan that claims no downsides is a plan that has not been thought through.

## 8. Grading criteria the reviewer will apply

1. **Extensibility** — does adding content genuinely avoid touching engine code?
2. **Separation of concerns** — is appearance separable from physics from
   gameplay? Can the renderer be swapped without touching the sim?
3. **No hardcoding** — is there a single source of truth per concept?
4. **Simplicity proportionate to the problem.** This is a 1,889-line game, not
   an engine. Speculative generality is a defect, not a virtue. An abstraction
   with exactly one implementation and no second one in sight will be marked
   against.
5. **Migration realism** — can this land incrementally, or is it a stop-the-
   world rewrite?
6. **Fit with the project's grain** — zero deps, native modules, data tables
   over code, integer pixels, honest verification.
