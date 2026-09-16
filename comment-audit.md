# Comment audit

Branch `chore/comment-overhaul`, from `main` at `9e783d7`. Baseline green across
lint, `check`, `check:content`, `check:worldgen`, `build` and 161 Playwright tests.

## 1. Scope

In scope: 101 tracked `.js`/`.mjs` files — `src/` (91), `tools/` (7),
`tests/` (2), `playwright.config.js`.

Excluded: `vendor/` (drop-in, carries the `/*! @license` marker that
`tools/build.mjs`'s `legalComments:'inline'` preserves), `reference/mockup/`
(preserved art target), `dist/` (build output), `node_modules/`.

45,722 lines, 22,034 code, 19,978 comment (44% of the tree), 3,693 blank.

## 2. JSDoc regime

There is none. The repo contains **zero** `/** */` blocks, no `tsconfig.json`,
no `jsconfig.json`, no `checkJs`, and no doc generator in `devDependencies`.
The whole surface is 2,395 plain `/* */` blocks (19,342 lines, mean 8.1 lines)
plus 636 single `//` lines. The brief's empty-JSDoc category is therefore
empty, and no type annotation anywhere is executable-equivalent.

## 3. Why this is a policy audit and not a worksheet

A previous comment pass already ran to completion on 2026-09-04, fifteen
batches over the same tree, recorded in `.claude/notes/tidy-progress.md`. It
deleted the classic agent tells, which is why this tree measures **zero**
TODOs, zero commented-out code, zero "I chose / we decided", and zero "as
discussed above". Its own retrospective (`.claude/brain/comment-audit-method.md`)
records that its 794-row `file:line` worksheet went stale the moment any listed
file was edited again.

So this audit fixes decision rules and a per-file sequence. Per-comment
decisions happen during execution, with the file open, and every one lands in a
single-file commit that states its counts.

## 4. Policy

Approved 2026-09-15, and it overrides the older conventions where they differ.

1. **A comment references code and concepts, never an external document.** No
   `SPEC.md`, `DESIGN.md`, `PLAN-*.md`, `DEVELOPER_GUIDE.md`, `ARCHITECTURE.md`,
   `FINDINGS.md`, `CLAUDE.md`, no `§` section number, no phase, wave, gate or
   D-number label, no assertion number. 580 blocks carry one.
2. **Overtrim rather than undertrim.** Where a block mixes a real constraint
   with padding, it is cut to the constraint. Where the code already says it,
   the comment goes entirely.
3. **A comment the code makes unnecessary is a signal about the code.** It is
   still deleted, and the file is noted in the final report rather than
   restructured, because this pass changes no executable code.
4. Wording is reused from the sentences already in the file. Nothing is
   composed fresh, so a survivor is a subset of what was there.
5. Rationale is never relocated into a new comment elsewhere.

This supersedes two things previously in force. `CLAUDE.md`'s "Why a magic
number is that number — cite the tuning pass" no longer licenses a `SPEC.md`
citation, and the previous pass's ruling that a `LAYER` header is always kept
intact no longer holds. Both are corrected in `CLAUDE.md` in Phase 3a.

## 5. DELETE

Counts are comment lines, and a block can fall in several categories at once,
so these do not sum.

| category | lines | example |
|---|---|---|
| cites an external document | 9,404 | `src/core/palette.js:1` — `See docs/DEVELOPER_GUIDE.md#colour-and-appearance.` |
| phase / wave / gate / D-number label | 8,533 | `src/data/callouts.js:20` — `INDEX 5 NAMES A VERB NOW, AND HAS TO (Phase 16c, docs/PLAN-phase16-interaction-model-v2.md §5 D16-E #5)` |
| banner rule | 4,238 | `src/core/palette.js:71` — `/* ---------- colour arithmetic ---------- */` |
| stale history | 2,586 | `src/data/grants.js:1` — `` `gift-kiln` used to be the …`` |
| `LAYER` header prose beyond the declaration | 2,758 total in 91 headers | `src/shell/schedule.js:1-230` |
| restatement | counted per file during execution | `src/model/run.js:636` — `/* First matching pair holding at least need units, or null. */` above a function that reads as exactly that |
| self-referential comment archaeology | 86 blocks | a comment describing what an earlier version of the same comment claimed |

Two sub-rules worth stating, because they are where a mechanical pass would go
wrong.

**A citation inside a sentence that carries a constraint loses the citation, not
the sentence.** `src/shell/boot.js:88` reads "a field surviving a restart is
invariant 8's determinism bug whether or not…". The statement stands alone once
"invariant 8's" is gone. The eleven `invariant N` references in `boot.js` and
`shell/ui.js` are handled this way.

**A banner rule inside a 9,426-line harness is navigation, not decoration.**
The 87 banners in files under 400 lines go unconditionally. The 331 in longer
files go in `src/`, and are ASK item 1 for `tools/check.mjs` and
`tests/visual.spec.js`.

## 6. KEEP

Located by name so an aggressive pass cannot take them by accident.

| category | examples |
|---|---|
| coordinate space | `src/shell/ui.js:253` world pixels of the map viewport's top-left, not tiles · `src/model/machines.js:28` `tx`/`ty` is the band-local tile of the top-left corner · `src/view/sprites.js:20` `px,py` is the sprite's centre, not a tile's top-left · `src/rules/placement.js:46` `tx`/`ty` is the top-left tile of the footprint |
| units | `src/model/growth.js:1` and `src/model/mining.js:1` accumulated time in seconds as a float · `src/core/canvas.js:14` `scale` is the nearest-neighbour upscale factor applied by CSS · talents throughout `src/view/paint.js:950`, `src/model/segments.js:97` |
| determinism | `src/core/rng.js:4` two different things live here and confusing them is a determinism bug · `src/shell/boot.js:30` every model module with a `clear` is cleared on restart · `src/model/machines.js:116` the tie-break is deterministic and is not a design statement |
| step order | `src/shell/schedule.js` one line per adjacent pair, subject to ASK item 2 |
| mutation during iteration | `src/rules/boons.js:46` mutating while iterating would skip an entry, so it filters |
| allocation and hot paths | `src/shell/main.js:61` one frame-context object, reused · `src/model/tiles.js:97` per-tile use over a 128x320 band is close to quadratic |
| off-by-one and geometry | `src/core/pixels.js:14` the one light direction · inclusive/exclusive tile bounds wherever stated |
| browser workaround | `src/shell/save.js:75` `localStorage` throws in private-mode and sandboxed contexts rather than returning null · `src/shell/audio.js:24` `webkitAudioContext` |
| registry coupling | a literal that must match a key in `src/data/*.js`, stated as the owning file |
| licence | `vendor/zzfx.micro.js`, out of scope and untouched |

## 7. Per-file sequence

Descending comment lines, `src/` first so the aggression is calibrated on the
game before the harnesses. `tools/` and `tests/` last, pending ASK item 1.

`doc` cites a document · `prc` phase/wave/D-number · `bnr` banner · `stl` stale
history · `lyr` `LAYER` header · `>=8L` lines sitting in blocks of eight or more.

```
  cl   doc   prc   bnr   stl   lyr  >=8L  blks  file
 695   378   263    59   124    12   414   102  src/shell/main.js
 672   367   359   244   117    37   514    74  src/view/hud.js
 586   459   374   271     4   164   506    33  src/data/machines.js
 520   100   114    79    82    16   391    79  src/view/paint.js
 517   281   244    52   121    20   341    71  src/shell/input.js
 492   237   241   200    95    88   322    56  src/view/overview.js
 489   196   192   245    63    20   353    65  src/view/scene.js
 486   213   226   100    66    11   338    69  src/model/run.js
 397   293   320   259   210    67   364    25  src/data/forms.js
 366   170   191    47    42    42   258    52  src/view/treatments.js
 365   157   157    49    33    31   201    73  src/rules/generate.js
 351   240   206   108   119   107   261    44  src/data/substances.js
 344   224   235   178    78    19   262    43  src/shell/ui.js
 295   245   131   233    73    39   264    20  src/data/recipes.js
 287   152   156    58     0    75   218    26  src/rules/drive.js
 277   167   124    83     7    31   224    30  src/rules/mining.js
 249   249   237     0   230   230   238     4  src/shell/schedule.js
 245   105    87     4    29    19   128    36  src/view/ui/mainPanel.js
 241    81    98    47     5    48   134    40  src/shell/save.js
 239   200   167   188    60    23   181    25  src/data/tuning.js
 237   108   113    87     0    33   178    27  src/model/segments.js
 230   175   175     0    19    48   208    17  src/rules/cycles.js
 220    68    45    81    25    29   150    32  src/rules/player.js
 202   107    58    80    39    12   101    37  src/rules/machines.js
 196   143   109    23    61    34   157    19  src/data/world.js
 182   167   150    79     0    83   162    14  src/data/scenarios.js
 180   101   104    13     0    37   134    20  src/rules/tutorial.js
 169    77    65    57     0    49   153    12  src/rules/reveal.js
 163    85     0    47    20    43   143    16  src/rules/light.js
 151   111    68    43     0    30   111    15  src/rules/placement.js
 146    71    97     0    60    60   126    11  src/rules/growth.js
 144    91    91     0     5    56   102    17  src/model/digqueue.js
 142    45    44    13     0    37    37    39  src/view/ui/menu.js
 139   133   133    51     0    85   133     6  src/data/cycles.js
 135    88    63    65     4    13   110    16  src/model/machines.js
 132    35     0     7    10    18    78    28  src/model/world.js
 124    54    60    40     0    42    69    16  src/view/ui/ruler.js
 116    44    14     0     0    31    49    59  src/shell/boot.js
 112     0    37     6     0    16    86    17  src/model/tiles.js
 111    63    63     0     0    63    79    11  src/model/growth.js
```
Then the 50 remaining `src/` files, each under 111 comment lines, in the same
descending order. Then `tools/content.mjs` (590), `tools/worldgen-check.mjs`
(248), `tools/layers.mjs` (24), `tools/build.mjs` (16), `tools/ast-same.mjs`
(25), `tools/serve.mjs` (3), `playwright.config.js` (22), and last
`tools/check.mjs` (2,906) and `tests/visual.spec.js` (2,722).

## 8. Estimate

Between 13,000 and 15,500 of 19,978 comment lines removed, so 65% to 78%. The
survivors are roughly the categories in section 6, stated at one to three lines
each rather than at eight. The 91 file headers fall from 2,758 lines to about
300. This firms up per file and the real figure goes in the final report.

## 9. ASK — resolved 2026-09-16

Rule for all four: prose worth keeping goes to `.claude/brain/*.md`, which
already holds exactly this kind of salvage and already states its provenance
per file. Where `CLAUDE.md` contradicts the policy, `CLAUDE.md` changes.

**1. The two harnesses — salvage the method, trim the instances.**
`tools/check.mjs` and `tests/visual.spec.js` hold 5,628 comment lines. The
reusable part is not each assertion's paragraph but the method behind them,
so a new `.claude/brain/harness-assertion-method.md` takes what makes an
assertion non-vacuous here, named against the two real incidents — the furnace
check that sampled the player's column after they had walked to the altar and
so tested a hole at the surface, and the two screenshot tests that set
`flags.grid` when the name is `flags.showGrid` and baselined the overlay off.
Each assertion in the source then keeps one line saying what it proves.
Citations, phase labels and banners go.

**2. `src/shell/schedule.js` — salvage the pairs, trim the header.** The
230-line header becomes one line per adjacent pair, about 15 lines. The full
per-pair reasoning moves verbatim to `.claude/brain/rules-order.md`, because a
future session reordering that array needs it and the file itself does not.
`CLAUDE.md` currently mandates the long form and is edited alongside, see
section 12 edit A.

**3. `note:` strings — two citations, both deleted.** The survey found exactly
two spec citations in any string literal in `src/`, both in
`src/data/tuning.js` and both in `TUNE[].note`, which nothing reads at runtime.
`riderMass` carries "(D4 as amended)" and `tossUp` carries "see
docs/FINDINGS.md". Both clauses go; the descriptive text stays, because the
instruction's stated target is spec citations in operational code and the
remaining 47 notes name a unit or a meaning and cite nothing.

The five `note:` fields in `src/data/scenarios.js` are rendered on screen by
`src/view/ui/menu.js` and contain no citations, so they are untouched and the
visual baselines are not at risk. This item is the one change in the pass that
edits a string literal rather than a comment, which is a data change rather
than a comment-only one, so it lands in its own commit.

**4. `docs/DEVELOPER_GUIDE.md` becomes unreachable from code, as intended.**
All 165 references go. The document stays valid in `docs/`. Nothing is
relocated, since the guide already holds the prose and the pass is only
removing the pointers into it.

## 10. Surviving TODOs

None. The tree contains no `TODO` or `FIXME` in any comment.

## 11. Verification

`tools/ast-same.mjs` already exists and does this job. It strips comments with a
state machine that tracks strings, template literals and regex literals, drops
blank and whitespace-only lines, and compares the remainder byte for byte. Per
file, pre-edit against post-edit, before the commit. No `acorn` needed and no
new dependency.

It is not a parser, so it is a strong rather than an airtight guarantee. It
would miss an edit that changed token spacing in a way that re-strips
identically, which a comment-only edit does not do. The full suite from the
baseline runs per file and again at the end of Phase 2.

## 12. Proposed CLAUDE.md edits

Four, all required by the policy, none applied without approval.

**A. The rules-order requirement, line 53-56.** It mandates the long header
that item 2 trims.

> `rules` modules are siblings and do not import one another — their order is
> stated once, in `src/shell/schedule.js`, with a comment explaining every
> ~~adjacent pair~~ **adjacent pair in one line. The reasoning behind each pair
> is in `.claude/brain/rules-order.md`.**

**B. The magic-number bullet, line 240.** "Cite the tuning pass" is the clause
that licensed 255 `SPEC.md` references.

> - **Why a magic number is that number.** ~~Cite the tuning pass, the physical
>   derivation, or the constraint it satisfies.~~ **Give the derivation or the
>   constraint it satisfies, in terms of the code.** Naming the number is not a
>   reason.

**C. The Comments section gains an absolute rule.** Today the only bar on
document references is `// as per SPEC.md` buried in the diff-commentary
bullet, which reads as a style note rather than a prohibition. Full replacement
text is in section 13.

**D. One line in Working style, line 362.** So the rule is reachable from the
section an agent reads while writing code rather than only from a section it
may skip.

> **A comment references code and concepts, never a document. Spec compliance
> goes in the commit message. Reasoning a future session needs goes in
> `.claude/brain/`. See the Comments section.**

## 13. Proposed replacement for CLAUDE.md's Comments section

Keeps the eight KEEP categories already there, minus the "cite the tuning
pass" clause, and states the prohibition first rather than in passing.

```markdown
## Comments

Write a comment only when the code cannot carry the information itself.
That means coordinate space and index conventions, units, array and object
shape contracts, determinism and step-order constraints, performance
contracts in hot paths, named algorithms, registry coupling, and
workarounds for a specific browser or library bug.

**A comment references code and concepts, never a document.** No SPEC.md,
DESIGN.md, PLAN-*.md, DEVELOPER_GUIDE.md, ARCHITECTURE.md, FINDINGS.md or
CLAUDE.md, no section number, no phase, wave or gate label, no D-number, no
assertion number. A comment that only makes sense with a document open is
not a comment. State the constraint itself.

Never write:

- a comment restating what the adjacent code does
- narration of your own process ("first we...", "I chose...", "as
  discussed above", "for now")
- rationale or history for a previous version of the code, or a comment
  describing what an earlier version of the same comment claimed
- commented-out code — delete it, git has it
- section banner comments
- a JSDoc block that restates the signature without adding a type, unit or
  constraint
- a speculative TODO; a TODO names a concrete defect actionable today
- eslint-disable without a reason on the same line

One line unless the constraint genuinely needs two. Default to zero
comments — every comment is a claim that a competent reader of this
codebase would otherwise get it wrong. If the code needs a paragraph to be
understandable, that is a fact about the code.

Spec compliance goes in the commit message or the PR body. Game design
rationale goes in DESIGN.md. Reasoning a future session needs, but a reader
of the code does not, goes in `.claude/brain/`. None of the three is
referenced from source.
```
