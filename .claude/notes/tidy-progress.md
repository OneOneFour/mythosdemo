# Tidy-all progress — COMPLETE (2026-09-04)

Plan approved 2026-09-03. All 15 batches done, plus a cross-cutting fix and
one post-run test-baseline update (see bottom of file). `npm test` (check +
build + visual, 115 tests) passes clean at HEAD.

| # | Batch | Files | Status | Commit |
|---|---|---|---|---|
| 1 | tools | tools/check.mjs, tools/content.mjs, tools/worldgen-check.mjs, tools/layers.mjs, tools/build.mjs | done | e2751ef |
| 2 | tests | tests/visual.spec.js | done (no changes — inventory found 0 delete/tighten candidates) | — |
| 3 | view-1 | src/view/overview.js, src/view/hud.js, src/view/paint.js, src/view/treatments.js, src/view/scene.js | done | 49d7d63 |
| 4 | shell-1 | src/shell/main.js, src/shell/input.js, src/shell/boot.js, src/shell/ui.js, src/shell/notify.js | done | dacf90c |
| 5 | rules-1 | src/rules/generate.js, src/rules/machines.js, src/rules/player.js, src/rules/drive.js, src/rules/tutorial.js | done | aba6b63 |
| 6 | model-1 | src/model/run.js, src/model/segments.js, src/model/world.js, src/model/tiles.js, src/model/machines.js | done | fe930e2 |
| 7 | view-2 | src/view/ui/mainPanel.js, src/view/ui/ruler.js, src/view/hover.js, src/view/ui/quickbar.js, src/view/fx.js | done | 435f825 |
| 8 | rules-2 | src/rules/mining.js, src/rules/items.js, src/rules/placement.js, src/rules/cycles.js, src/rules/growth.js | done | ad24747 |
| 9 | model-2 | src/model/growth.js, src/model/mods.js, src/model/mining.js, src/model/items.js, src/model/player.js | done (no changes — inventory found 0 delete/tighten candidates) | — |
| 10 | rules-3 | src/rules/trinkets.js, src/rules/light.js, src/rules/boons.js, src/rules/reveal.js, src/rules/miracles.js | done | 82af57b |
| 11 | core-1 | src/core/pixels.js, src/core/palette.js, src/core/rng.js | done (no changes — verified by direct read after the inventory subagent's 0-tool-call report proved unreliable) | aa6792d (bonus fix to hud.js found while verifying) |
| 12 | rules-4 | src/rules/crafting.js, src/rules/belts.js | done | c78b2b4 |
| 13 | shell-2 | src/shell/audio.js | done (no changes — inventory found 0 delete/tighten candidates) | — |
| 14 | data-1 | src/data/substances.js, src/data/machines.js, src/data/forms.js, src/data/recipes.js, src/data/world.js | done | 3886339 |
| 15 | data-2 | src/data/tuning.js, src/data/sfx.js, src/data/cycles.js, src/data/sources.js | done | 160105c |

Excluded from the whole run: `reference/mockup/**` (CLAUDE.md: "do not develop it") and `vendor/*` (drop-in, not ours to edit) — neither had files over the 5-comment-line threshold anyway.

Note: several filenames collide across directories (`machines.js` in `data/`, `model/`, `rules/`; `items.js`/`mining.js`/`player.js`/`cycles.js`/`growth.js` each in two of the three) — always use the full path.

Cross-cutting fix landed during batch 5 (commit 147294a, outside the normal one-batch-one-commit rule): a nonexistent `tools/resolve.mjs` was cited in 6 file headers as the content-resolution checker; corrected to `tools/content.mjs` everywhere it appeared, including in `src/core/palette.js` (batch 11), `src/data/world.js` (batch 14) and `src/data/tuning.js`/`src/data/sources.js` (batch 15) — those files already carry this fix, so their own batch's inventory pass should find nothing left to do on it.

Approval gate lifted partway through the run (user: "Do everything, stop asking me to approve stuff") — batches from 6 onward are applied and committed without a pause for approval.

One inventory subagent (batch 11, core-1) returned a detailed-looking report with ZERO tool calls — it never actually read the files. Caught by spot-checking rather than trusting it; direct read confirmed its bottom-line ("no changes") happened to be correct anyway, but this is a reminder not to trust a subagent's report at face value just because it's well-formatted. Later batch prompts (14, 15) added an explicit "you MUST use the Read tool, a prior batch returned zero-tool-call garbage" instruction, and both came back with real tool-call counts.

Recurring finding across many batches: a handful of comments narrating what an EARLIER VERSION of the same comment used to claim ("the claim this comment used to make was X, which was false because Y") rather than describing current code — CLAUDE.md's own "diff and phase commentary" delete category, just self-referential instead of about code. Trimmed to the current, true rationale each time it appeared (generate.js, tutorial.js, quickbar.js, mining.js x1 factual, forms.js's log row — the original source of one such claim later paraphrased into generate.js — machines.js's belt_r and tribute-receivers blocks, belts.js, light.js). Also found and fixed one factual error repeated three times verbatim across three files ("log is the only fuel in the game" — false, `brand`, made from a log, is fuel-tagged too: rules/mining.js, data/world.js, data/tuning.js).

Post-run: `npm test`'s full visual suite hadn't been run since this session's earlier collectPrompt feature addition. Two baselines needed re-accepting (commit fcf1da3) because the new "C COLLECT" prompt legitimately draws in those scenes — not a regression, just the first time that suite ran since the feature landed.
