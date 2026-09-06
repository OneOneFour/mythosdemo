# Cleanup progress — comment tidy (Part 1) + markdown sweep (Part 2)

Executing the plan at
`/private/tmp/claude-502/-Users-robcking-MiscProjects-mythos-factory/05680624-25f5-48f2-bb96-15e6519fb042/scratchpad/tidy-plan.md`
(a copy of it should be kept around, or re-derive from this file + git log if
lost — the commit table below is the authoritative TODO list).

Decisions locked in by the user for this run (do not re-ask):
- Track B2 (bare Phase-N sweep) is full scope, all 48 files, not just Track A's 40.
- Full plan proceeds as written, including README rewrite, PROPOSAL banners,
  tools/resolve.mjs markdown fixes, DEVELOPER_GUIDE facts, BUILD_PLAN status corrections.
- CLAUDE.md itself is NOT edited. Its D9 (astral band dims) and D2
  (`view/hud.js#pocketHits`) staleness findings are reported to the user, not fixed.

## Commit table (one row = one commit, per the plan's "Execution order")

| # | commit | scope | status | sha |
|---|---|---|---|---|
| 0a | docs: rewrite README controls and drop the deleted winch | README.md | done | 77e28d6 |
| 0b | docs: mark the gears and phase10 plans BUILT, not PROPOSAL | 2 files | done | 1c10986 |
| 1.1 | tidy: tools (check.mjs, serve.mjs) + fix ast-same.mjs/tidy.md | tools | pending | |
| 1.2 | tidy: tests (visual.spec.js, playwright.config.js) | tests | pending | |
| 1.3 | tidy: view-1 (paint, ui/slot, ui/bar, ui/tooltip, sprites) | src/view | pending | |
| 1.4 | tidy: shell (schedule, boot, notify) | src/shell | pending | |
| 1.5 | tidy: rules (mining, cycles, grants, fields) | src/rules | pending | |
| 1.6 | tidy: model-1 (boons, journal, fields, tutorial, space) | src/model | pending | |
| 1.7 | tidy: view-2 (ui/grid, ui/state, ui/panel, ui/tabs) | src/view/ui | pending | |
| 1.8 | tidy: core (font, canvas, math) | src/core | pending | |
| 1.9 | tidy: model-2 (epoch, aim) | src/model | pending | |
| 1.10 | tidy: data-1 (substances, tuning, sfx, callouts, palette) | src/data | pending | |
| 1.11 | tidy: data-2 (grants, boons, miracles, trinkets, drops) | src/data | pending | |
| 2 | tidy: drop self-referential comment narration, repo-wide | Track B1, 12 remaining files | pending | |
| 3 | tidy: drop bare Phase-N tags | Track B2, 48 files | pending | |
| 4 | docs: fix stale tools/resolve.mjs and file:line references | Part 2 §2H + DEVELOPER_GUIDE facts (§2K) | pending | |
| 5 | docs: retire the spent REVIEW, AUDIT and MIGRATION artifacts | Part 2 §2A, 21 deletions + 3 brain salvages | pending | |
| 6 | docs: extract TRANSPORT.md and adr/0001 from the shipped plans | new user-facing files | pending | |
| 7 | docs: trim spent scaffolding from the shipped phase plans | Part 2 §2I/§2J | pending | |
| 8 | docs: trim session narration from FINDINGS, SPEC and BUILD_PLAN | Part 2 §2C/§2D/§2E | pending | |

## Findings to report to the user at the end

- CLAUDE.md D9 states astral band is `tw:96, origin:{x:128,y:0}`;
  `src/data/world.js:53-56` reads `tw:128, origin:{x:0,y:0}`. Not fixed (out of scope).
- CLAUDE.md D2 cites `view/hud.js#pocketHits` as "the canonical idiom"; no such
  export exists in `view/hud.js` today (only `hoverInfo`, `drawHUD`, `pairLabel`).
  `pocketHits` survives only in comments in `view/ui/{grid,panel,state}.js`.
  Not fixed (out of scope) — `docs/DEVELOPER_GUIDE.md:1140` and
  `docs/PLAN-phase10.md:385-388` also need this fix per the plan (in scope there).

## Notes / deviations from plan (fill in as encountered)

(none yet)
