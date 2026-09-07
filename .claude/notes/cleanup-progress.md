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
| 3 | tidy: drop bare Phase-N tags | Track B2, 41 of 48 files touched (7 had zero bare hits) | done | 42127aa |
| 4 | docs: fix stale tools/resolve.mjs and file:line references | Part 2 §2H + DEVELOPER_GUIDE facts (§2K) | done | c727393 |
| 5 | docs: retire the spent REVIEW, AUDIT and MIGRATION artifacts | Part 2 §2A, 23 deletions + 2 brain salvages | done | 787e05d |
| 6 | docs: extract TRANSPORT.md and adr/0001 from the shipped plans | new user-facing files (+ PLAN-phase17-drafts.md) | done | 9f0f6b6 |
| 7a | docs: trim PLAN-gears-and-winches.md's spent scaffolding | §1 brief salvaged to .claude/brain/transport-brief.md; §2.1-2.5, §3, §6.0-6.5, §7 trimmed to pointers; §5/§9 tables cut to the rows with lasting content; 1442 -> 554 lines | done | c661d8d + 1 more (citation fixes in FINDINGS.md/SPEC.md) |
| 7b | docs: trim PLAN-phase10.md spent scaffolding | §1 trimmed, §2.5/§2.10 deleted, §6.1-6.3 and §7.1-7.3 bodies trimmed (§7.3/AUDIT-2.md moot since that file's already deleted), §9 cut to rows 1-3; 1433 -> 1114 lines | done | (pending commit) |
| 7c | docs: trim PLAN-phase12.md spent scaffolding | §1 salvaged to .claude/brain/interaction-model-brief.md; §2.7 (dead dict-shape recon) deleted; §4.2 factual error fixed (no quickbar wheel-scroll); §4.4 annotated superseded-by-4-rules; §6/§7 executed prompts trimmed; §9 cut to rows 1/2/8/9; 1794 -> 1286 lines | done | (pending commit) |
| 7d | docs: trim PLAN-phase14-mining-and-drops.md spent scaffolding | Status banner fixed; §5's numbering-diary paragraph trimmed; D14-F's retune-method narrative salvaged to .claude/brain/worldgen-retune-method.md and its self-scoring paragraph deleted; D14-H's coordination note deleted; §6.1-6.5 (five executed prompts) and §7 (sequencing table) deleted; §9 cut to rows 1/3/4/12. §8 kept verbatim (cited by three tools/src files). tools/worldgen-check.mjs:69's citation repointed to SPEC §19.7 in the same commit. 1136 -> 827 lines | done | (pending commit) |
| 7d2 | docs: trim PLAN-phase15-trees.md spent scaffolding | Status banner fixed; §2.4's form-budget table, D15-A's/D15-C's "if 14 not landed yet" narration trimmed; §4's touched-file list deleted (kept the "Not touched" half); §5's 12-step prompt collapsed to a landed-summary pointer; §7's risk register collapsed to a summary, its one live gameplay hazard (fell-every-tree-before-a-seed) moved to FUTURE_IDEAS.md. New .claude/brain/phase-plan-conventions.md absorbs the "one view/-owning phase at a time" + "additive phase lands before its replacement is removed" rules (also recovers PLAN-phase14's deleted §7 content). Fixed 2 citations broken by the §5 trim (view/scene.js:352 -> brain file; growth.js:79/tuning.js:210 checked fine, no fix needed). 562 -> 468 lines | done | (pending commit) |
| 7d3 | docs: trim PLAN-phase16-interaction-model-v2.md spent scaffolding | Status banner fixed; §1 sizing table deleted (content was redundant with §3's audit); 3 first-person/self-referential asides deleted (§3.5, §4 intro, §4.4); D16-A's 30-line post-Phase-14 revision narration compressed to 1 durable paragraph; §6's three FILE OWNERSHIP blocks + 3 executed prompts collapsed to a landed-summary; §7.1/§7.2's sequencing reasoning (all now-moot, every dependency landed) compressed to one paragraph; §9's risk register (all landed clean) collapsed to 2 sentences on the two risks worth remembering. KEPT §3/§4/§5 headings verbatim (cited by visual.spec.js:3112, check.mjs:213, and a dozen src/ comments by section number) and §7.3 (already extracted to PLAN-phase17-drafts.md, kept here as the pointer). 1129 -> 715 lines | done | (pending commit) |
| 7d4 | docs: fix PLAN-horizontal-chunks-SCOPE.md's §7 phase-letter collision | Relettered the never-executed candidate table from 16a-16e to W-a-W-e (16a-16c since taken by the shipped interaction-model wave); fixed the one other 16d reference. File otherwise untouched -- it is explicitly NOT spent scaffolding per the plan | done | (pending commit) |
| 7e | docs: trim PLAN-phase13.md spent scaffolding | Status banner fixed; §1 sizing table deleted; §3.1's instructional heading/opening tightened; §4.5 rewritten from "note, do not fix" to a landed fact (setter added, one still-live idiom kept); three FILE OWNERSHIP blocks + four prompts (13a/13b/13c/13d) collapsed to landed-summaries; §6's sequencing table absorbed into .claude/brain/phase-plan-conventions.md (already existed, now pointed to). KEPT §2.3, §4.3 (D13-A), §5.2's 20-item punch list, §7 -- all cited elsewhere by section number. Fixed FINDINGS.md:1728's stale line-number citation (§794 -> §5.3) in the same commit. 877 -> 621 lines | done | (pending commit) |
| 8 | docs: trim session narration from FINDINGS, SPEC and BUILD_PLAN | FINDINGS.md 2199->2032 lines (orchestrator process notes moved to .claude/brain/agent-orchestration.md; oxlint-devDependency/invPanel-RESOLVED/Tier-3-fixture/phone-blank/3x test-run-confirmation/why-not-fixed-here items deleted, all verified already resolved in the repo; caught and reverted an over-eager deletion of item 8d #2 which 4 live files cite by number -- restored and marked resolved instead; GEOMETRY-UNDER-TEST and scene-through-model rules relocated to DEVELOPER_GUIDE.md, reviewer-consideration asides trimmed). SPEC.md 2463->2452 (brandLeft/starting-kit paragraph corrected to current reality -- no starting brand exists at all, beyond what the plan asked; self-scoring and stale-paragraph asides deleted; 2 "found by hand" narratives moved to .claude/brain/verification-gaps.md). BUILD_PLAN.md 2712->2666 (never-updated-for-wave-3 meta deleted; the whole "Ground truth this wave was corrected against" table deleted as duplicate of the phase bodies, resolving 3 previously-flagged dead line-number citations for free; a matching diary aside in the Phase 10 body trimmed; paint-data-indirection diary trimmed to the surviving CLAUDE.md D7 rule; redundant "(Done -- see RESOLVED note above)" deleted; wave-4's "five facts" list cut to 3 real facts, the other 2 marked fixed with a corrected D14-H-aware rewrite of the feedstock-overlap item since it was flagged stale mid-edit). | done | (pending commit) |

## Findings to report to the user at the end

- CLAUDE.md D9 states astral band is `tw:96, origin:{x:128,y:0}`;
  `src/data/world.js:53-56` reads `tw:128, origin:{x:0,y:0}`. Not fixed (out of scope).
- CLAUDE.md D2 cites `view/hud.js#pocketHits` as "the canonical idiom"; no such
  export exists in `view/hud.js` today (only `hoverInfo`, `drawHUD`, `pairLabel`).
  `pocketHits` survives only in comments in `view/ui/{grid,panel,state}.js`.
  Not fixed (out of scope) — `docs/DEVELOPER_GUIDE.md:1140` and
  `docs/PLAN-phase10.md:385-388` also need this fix per the plan (in scope there).
- `docs/BUILD_PLAN.md`'s status header (top of file) tracks waves 1-2 and
  notes wave 3 (Phase 12) was never added to its sequencing tables; wave 4
  (Phases 13-16, all now shipped) has the same gap and isn't mentioned at
  all. Not fixed -- out of the plan's specific scope for this pass, but a
  real, growing staleness gap the same shape as the wave-3 one already
  flagged in the file's own text.

## Notes / deviations from plan (fill in as encountered)

- Commit 5 (§2A): actual file count was 23, not the plan's "21 deleted, 3
  collapsed" (arithmetic didn't quite match the plan's own listing --
  REVIEW-phase-* was 11 real files, not 12, and PLAN-phase1.md + MIGRATION.md
  both turned out to be genuine deletes rather than pure brain-collapses,
  giving 2 brain salvages not 3). Verified every file against `ls docs/`
  before deleting rather than trusting the plan's count.
- Commit 5: per CLAUDE.md D2's own rule ("a comment naming a deleted file is
  a lie the layer checker cannot catch"), grepped the whole repo for
  citations to every file being deleted before deleting it. Found and fixed
  live citations in src/view/paint.js (3), src/view/overview.js (2),
  src/view/treatments.js (1) citing docs/AUDIT-2.md, plus docs/SPEC.md and
  docs/FINDINGS.md citing docs/AUDIT.md/AUDIT-2.md/COMMENT_AUDIT.md directly
  (FINDINGS.md:1511's passage was itself doubly stale -- it said these three
  files "remain... correct as history" and separately asked "whoever owns"
  DEVELOPER_GUIDE.md to update the lift-stage sections commit 4 already
  fixed). Citations inside already-executed BUILD_PLAN.md/PLAN-*.md phase
  prompts ("Read docs/AUDIT.md...") were left alone as historical record,
  same treatment as the docs/reference/ citations in commit 4.
- Commit 6: skipped `docs/PLAYTEST-walkthroughs.md` (the plan itself flagged
  it "lower confidence... skip if the trim is already large enough" -- and
  by this point it is). Did the other three: TRANSPORT.md, adr/0001, and
  PLAN-phase17-drafts.md (this last one must happen before commit 7's
  PLAN-phase16 trim or its content -- the one piece of unshipped work in any
  of the five shipped plans -- would be destroyed). Verified the cycle-4
  bellows bug PLAN-phase17-drafts.md documents is still live today
  (`data/drops.js#tribute-bellows` still `chance:1`) before extracting it.
- Did NOT remove `MIGRATION.md` from CLAUDE.md's `docs/` listing, even
  though §2L says to do so in the same commit -- CLAUDE.md is out of scope
  per the user's explicit instruction for this whole task. Flagging so the
  user can do it themselves if they want it.

- Commit 4 (§2H): skipped the "dead line-number citations" list inside
  BUILD_PLAN.md (SPEC §12 line, shell/input.js:181, paint.js:174-180,
  scene.js/treatments.js citations, hud.js:324/120-121, check.mjs:789-815 +
  forms.js:225-228). All of these sit inside already-EXECUTED historical
  phase prompts that commit 7 (§2I/§2J trim) is about to cut down heavily --
  chasing exact current line numbers for content about to be partially
  deleted is low value. Not fixed; flagging instead of silently dropping.
- Commit 4 (§2H): skipped the 14 `docs/reference/` citations in BUILD_PLAN.md
  -- verified real (grep confirms), but every one sits inside a historical,
  already-executed phase prompt telling a past agent to save ad-hoc
  comparison screenshots to a scratch path that was never meant to be
  permanent (the doc's own text at the point of first use already says so:
  "docs/reference/ does not exist yet; docs/art/ holds unrelated concept
  images and is not it"). Not the same shape as a citation to a file that
  should resolve today; left alone.
- BUILD_PLAN.md's `.claude/agents/` subagent roster (cartographer/systems/
  ui/harness/reviewer) is fixed with an added note rather than renamed
  throughout the file -- only `bug-investigator.md` exists, but the roster
  names recur across dozens of already-executed phase prompts and renaming
  them all would misrepresent history for no reader benefit.
- Commit 4 (§2K DEVELOPER_GUIDE.md): covered every item the plan named --
  the six rules/lift.js references (rewrote the "when a machine needs its
  own rules module" section to cover rules/drive.js/segment transport
  instead of leaving a gap), the vital/SOURCES claim, the blood-winch
  "needs no code" claim, the 14-vs-24 assertion count (added 15-24),
  the 12-forms/stride-13/PACKABLE_LIMIT-18 numbers (now 13/14/17),
  pocketHits (now hoverInfo + a note explaining pocketHits' retirement),
  feedCheck's real location (model/machines.js not rules/), brandLight (no
  such tunable; brandLevel/brandSecs), the view/ui/ file list (added
  mainPanel/quickbar/ruler), the missing check:worldgen row and script
  aliases, and the two self-referential monologue passages (the schedule.js
  history narrative's doc-side twin, and the "three comments... four
  phases" aside). Also fixed 6 drifted file:line citations (copper/tin/
  stone/granite substances.js lines, crossable()/expand() forms.js lines,
  brand's massK value and line). NOT done: adding brand-new sections for
  rules/cycles.js, rules/growth.js and rules/tutorial.js (the plan noted
  their absence but this is a coverage gap, not a stale fact, and would be
  substantial new content rather than a correction); a handful of low-value
  bare Phase-N tags remaining in DEVELOPER_GUIDE.md (10 total, most already
  cited) were left alone -- markdown files were never in Track B2's scope.

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
