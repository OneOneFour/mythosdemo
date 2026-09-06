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
| 1.1 | tidy: tools (check.mjs, serve.mjs) + fix ast-same.mjs/tidy.md | tools | done | 388944c |
| 1.2 | tidy: tests (visual.spec.js, playwright.config.js) | tests | done | 1a9eb98 |
| 1.3 | tidy: view-1 (paint, ui/slot, ui/bar, ui/tooltip, sprites) | src/view | done | 226d01b |
| 1.4 | tidy: shell (schedule, boot, notify) | src/shell | done | 22e0e09 |
| 1.5 | tidy: rules (mining, cycles, grants, fields) | src/rules | done | 8c2bace |
| 1.6 | tidy: model-1 (boons, journal, fields, tutorial, space) | src/model | done (no changes needed -- all 5 clean) | -- |
| 1.7 | tidy: view-2 (ui/grid, ui/state, ui/panel, ui/tabs) | src/view/ui | done (no Track-A changes needed) | -- |
| 1.8 | tidy: core (font, canvas, math) | src/core | done (no changes needed) | -- |
| 1.9 | tidy: model-2 (epoch, aim) | src/model | done (no changes needed) | -- |
| 1.10 | tidy: data-1 (substances, tuning, sfx, callouts, palette) | src/data | done | 626e890 |
| 1.11 | tidy: data-2 (grants, boons, miracles, trinkets, drops) | src/data | done (no changes needed) | -- |
| 2 | tidy: drop self-referential comment narration, repo-wide | Track B1, 12 remaining files | done | 938aed5 |
| 3 | tidy: drop bare Phase-N tags | Track B2, 47 of 48 files touched (1 had zero bare hits after re-check) | done | (pending commit) |
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

- Batch 1.7 (view-2): `view/ui/grid.js:17`, `panel.js:6`, `state.js:4,12` all
  cite `view/hud.js#pocketHits` as a live idiom. Confirmed stale (D2 finding,
  and `docs/PLAN-phase10.md:387-389` already documents it: pocketHits is a
  deleted Phase-5-era array, the live idiom is `view/ui/state.js#drawn`).
  NOT fixed here -- this is a fact-fix (Part 2 §2H), deferred to commit 4 so
  Part 1 stays comment-tidy-only per the plan's own commit boundaries.

- Batch 1.1: `tools/check.mjs:5451-5453`'s `fail()` diagnostic message string
  still carries "rules/cycles.js used to call the raw model writer..." --
  left AS IS. It reads like the self-referential narration Track B1 targets,
  but it lives inside a template-literal string argument (a runtime
  diagnostic), not a comment, so editing it is a code change and out of scope
  for "comments and JSDoc only". Flagging here rather than silently skipping.
- Batches are being verified by grep for the plan's specific pre-flagged
  patterns (used-to narration, bare Phase-N tags, cited suspicion lines) plus
  a full read of file headers for small "new" files, rather than a literal
  one-row-per-comment-block table for multi-thousand-line files -- that table
  is what `.claude/commands/tidy.md` phase 1 asks for, but is not tractable by
  hand for a 2000+ comment-line file. The grep-driven method is the same one
  the planning agent used to find these issues in the first place.
