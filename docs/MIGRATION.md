# Migration plan — flat `src/` to layered architecture

Target: the synthesis from `prototypes/00-FINAL-REVIEW.md`. C's layering and
enforcement, C's inline recipes, C's `from:`/sources mechanism, B's
`substance × form` content model, B's boon/grant layer. A's three-way part
split is rejected.

**Scope discipline, per the repo owner:** get the *scaffolding* and the core
loop right. A barebones player who can move, dig, drop items and feed one
machine. Do **not** build lots of machines or recipes. Every architectural
seam present and demonstrated once; content deliberately thin.

---

## Decisions — all settled

| question | answer |
|---|---|
| content model | **substance x form** |
| old `src/` | **deleted.** Git history is the archive; no `reference/v1-flat/` |
| staged lift | **one working stage**, as a machine, pointed **surface -> astral** |
| world bands | **three**: astral / surface / topsoil |
| tutorial | seam only, zero beats |
| item identity | `{sub, form}` + `mass`. Not purity/fragility/temperature |
| heat field | seam only, no diffusion |
| journal | replaces audio **and** `toast()` |
| save string | not in this pass; the run/meta split in the object shape only |
| screenshots | re-baselined, labelled unreviewed |

## Bands — a design addition, not just a count

```
ASTRAL / HEAVENLY   minor gods. Reachable.
SURFACE             spawn.
TOPSOIL             first digging band.
```

This is the reason the lift is worth scaffolding now. Before three bands,
"up is expensive" had no destination — the gods were unreachable clouds and the
lift moved boxes to nowhere. With an astral band the core loop closes inside
the scaffolding: dig down (free), haul to surface, lift up (expensive), deliver.

**Reading being made, which cuts against `docs/DESIGN.md`:** that document says
the sky gods "shout demands from clouds you cannot reach", and that Hades'
characterisation depends on the contrast of arriving in person. Here **minor
gods are reachable** — that is what makes them minor, and the first astral
level is somewhere the player can stand. Major gods stay unreachable. If astral
should be goods-only, that is a small change now and a large one later.

Consequences to build for:
- band ordinals are never assumed to be zero; a band is a value, not a global
- vertical travel between bands is a mechanic (the lift), not a camera trick
- each band carries its own dimensions, tile size and strata, from `data/world.js`

## The content-model decision, in full

**`substance × form`, not flat substances.** The review left this open and I am
taking it, because:

1. It fixes a real defect. C's own content has `copper` and `tin` both carrying
   `smeltsTo:'ingot'` against a single `ingot` row, so a tin ingot is
   byte-identical to a copper one and C's resolver cannot see it.
2. It answers "where does a new thing go" in one sentence — the heaviest-
   weighted criterion: *a substance is an element; anything you can hold is
   substance × form; a thing with no element of its own is a form of the
   element it came from.*
3. Row arithmetic against DESIGN.md's five refinement tiers: at six metals,
   30 flat rows becomes 11.

**Cost, honestly:** every held thing becomes a `{sub, form}` pair, not a single
id. Tiles store one byte, so tile-capable forms need packing. And `grep ingot`
finds a form rather than a thing — a small hit to the greppability that won C
its comprehensibility score.

---

## What this costs that is worth naming before starting

- **All 26 visual screenshot baselines will fail and must be re-taken.** They
  are a regression net for a stable renderer, not an acceptance test for a
  rewrite. Owner has said visuals are out of scope; I will re-baseline rather
  than chase pixels, and say plainly that the new baselines are unreviewed.
- **`tools/check.mjs` is coupled to the old module paths** and must be
  rewritten. Its *assertions* survive; its imports do not.
- **The 9-beat tutorial is deferred.** It is content, it imports across
  gameplay modules, and the owner asked for scaffolding over content. The seam
  stays; the beats do not come across in this pass.
- The tree grows: roughly 2,068 lines becomes ~2,800 across ~40 files. Layer
  separation plus three mechanisms that do not exist today (mods, journal,
  forms) cost lines. That is the price of the coverage.

---

## Phase 0 — record the decisions first

`ARCHITECTURE.md` at the repo root, written **before** the code so it governs
rather than describes:

- the six layers and the one legal dependency direction
- the placement rule: *`model` owns the number and the query; `rules` owns the
  decision and the consequence*
- the content rule: *substance is an element; held things are substance × form*
- why notification flows down through a journal instead of calling `play()`
- why tunables are split into frozen `data/tuning.js` and run-scoped
  `model/mods.js`, and why nothing else may import the frozen table
- what was rejected and why (A's part split, B's per-machine draw functions,
  slots as primary, ECS, class hierarchies, content packs)
- the enforcement: what `tools/layers.mjs` checks and what it cannot

## Phase 1 — preserve the old, scaffold the new

1. Delete the old `src/` and `index.html`. Git history is the archive — the
   owner chose deletion over a `reference/` copy, and `reference/mockup/`
   already covers the "read the old one" case for the art.
2. New `src/` with the six layer directories, each carrying a `README` line in
   its first file stating what may import it.
3. `tools/layers.mjs` **first**, before there is anything to check, so no
   illegal edge is ever committed. Rule table plus a `LAYER_BUDGET` of 0.

## Phase 2 — `core` and `data`

- `core/`: rng (seeded `rand()`), palette, 5x7 font, pixel ops, canvas/viewport.
  Ported nearly verbatim — this layer is already correct.
- `data/`: `substances.js`, `forms.js`, `machines.js`, `recipes.js`,
  `tuning.js`, `trinkets.js`, `boons.js`, `sources.js`, `sfx.js`, `world.js`,
  `palette.js` (names, not hex, at call sites).
- Content kept thin: substances `copper`, `tin`, `timber`, `stone`; forms `ore`,
  `ingot`, `gravel`, `log`. One machine (furnace) plus one variant to prove
  variants are free. One trinket. One boon.
- `tools/resolve.mjs`: proves every string key in `data/` resolves, at build
  time, so a typo fails before import rather than at 3am.

## Phase 3 — `model`

State and queries only. No decisions.

`world.js` (bands, injected dimensions — **not** module constants), `tiles.js`,
`mining.js` (a Map of accumulated seconds), `items.js`, `machines.js`,
`fields.js` (heat, active-cell set, seam only), `player.js`, `run.js`
(run-state vs meta-state split), `mods.js` (the only reader of `data/tuning.js`),
`journal.js`, `epoch.js`, `aim.js`.

## Phase 4 — `rules`

Mechanics. Siblings that never import each other; order stated once in
`shell/schedule.js`.

`player.js` (walk, hop, ladder climb, gravity, fall damage), `mining.js`,
`items.js`, `machines.js` (the one generic interpreter), `placement.js`,
`trinkets.js`, `boons.js` (the ~15-line grant layer B has and C lacks),
`fields.js`.

## Phase 5 — `view` and `shell`

- `view/`: `paint.js` (chunk painting, treatments from data — **no** material
  name anywhere in this layer), `scene.js`, `hud.js`, `treatments.js`.
- `shell/`: `boot.js`, `main.js` (the loop), `input.js`, `schedule.js`,
  `notify.js` (drains the journal into sound and text).

## Phase 6 — verification

- Rewrite `tools/check.mjs`: layer check, name resolution, epoch assertion
  (render does not mutate model), then behavioural probes — player walks, digs,
  falls, climbs; a tile breaks in its stated seconds at several framerates; an
  item falls and is caught; the furnace produces; a trinket changes an
  effective value; the variant machine is faster.
- Re-baseline the screenshot suite; state that the baselines are unreviewed.
- `npm run build` must still produce the single self-contained file, and the
  dev/dist parity test must still pass.

## Phase 7 — clean up and document

- **Delete `prototypes/`** entirely. Its value was the decision, which now
  lives in `ARCHITECTURE.md` and `prototypes/00-FINAL-REVIEW.md` — that review
  moves to `docs/rfc/` before the directory goes.
- **Archive the RFCs.** `docs/rfc/` is 36,500 words across 10 files. Keep
  `00-REVIEW.md`, the final review, `BRIEF.md` and `REVIEW-CRITERIA.md` as the
  decision record; delete RFCs 01, 03, 05, 06 (rejected paradigms, superseded)
  and keep 02 and 04 as the sources the synthesis draws from.
- **README**: how to actually run and manually test the result — commands, the
  controls, what to look for, and what is deliberately absent.
- Update `CLAUDE.md` to the new tree, layers, invariants and commands.

---

## Order of work, and why

Layers are built bottom-up because the dependency direction is the whole point:
`core` and `data` first, then `model`, then `rules` and `view` in parallel
(they are siblings and cannot see each other), then `shell` wires it. The layer
checker exists before any of it so no illegal edge is ever introduced.

Verification comes last only for the screenshots. The layer checker, the name
resolver and the epoch assertion run from Phase 1 onward.
