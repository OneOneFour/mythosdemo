# Tidy-all progress

Plan approved 2026-09-03. One commit per batch, `tidy: <directory or file>`.
Resume by finding the first `pending` batch below.

| # | Batch | Files | Status | Commit |
|---|---|---|---|---|
| 1 | tools | tools/check.mjs, tools/content.mjs, tools/worldgen-check.mjs, tools/layers.mjs, tools/build.mjs | pending | |
| 2 | tests | tests/visual.spec.js | pending | |
| 3 | view-1 | src/view/overview.js, src/view/hud.js, src/view/paint.js, src/view/treatments.js, src/view/scene.js | pending | |
| 4 | shell-1 | src/shell/main.js, src/shell/input.js, src/shell/boot.js, src/shell/ui.js, src/shell/notify.js | pending | |
| 5 | rules-1 | src/rules/generate.js, src/rules/machines.js, src/rules/player.js, src/rules/drive.js, src/rules/tutorial.js | pending | |
| 6 | model-1 | src/model/run.js, src/model/segments.js, src/model/world.js, src/model/tiles.js, src/model/machines.js | pending | |
| 7 | view-2 | src/view/ui/mainPanel.js, src/view/ui/ruler.js, src/view/hover.js, src/view/ui/quickbar.js, src/view/fx.js | pending | |
| 8 | rules-2 | src/rules/mining.js, src/rules/items.js, src/rules/placement.js, src/rules/cycles.js, src/rules/growth.js | pending | |
| 9 | model-2 | src/model/growth.js, src/model/mods.js, src/model/mining.js, src/model/items.js, src/model/player.js | pending | |
| 10 | rules-3 | src/rules/trinkets.js, src/rules/light.js, src/rules/boons.js, src/rules/reveal.js, src/rules/miracles.js | pending | |
| 11 | core-1 | src/core/pixels.js, src/core/palette.js, src/core/rng.js | pending | |
| 12 | rules-4 | src/rules/crafting.js, src/rules/belts.js | pending | |
| 13 | shell-2 | src/shell/audio.js | pending | |
| 14 | data-1 | src/data/substances.js, src/data/machines.js, src/data/forms.js, src/data/recipes.js, src/data/world.js | pending | |
| 15 | data-2 | src/data/tuning.js, src/data/sfx.js, src/data/cycles.js, src/data/sources.js | pending | |

Excluded from the whole run: `reference/mockup/**` (CLAUDE.md: "do not develop it") and `vendor/*` (drop-in, not ours to edit) — neither had files over the 5-comment-line threshold anyway.

Note: several filenames collide across directories (`machines.js` in `data/`, `model/`, `rules/`; `items.js`/`mining.js`/`player.js`/`cycles.js`/`growth.js` each in two of the three) — always use the full path.
