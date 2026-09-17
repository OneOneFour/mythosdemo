# The comment overhaul: what happened

Branch `chore/comment-overhaul`, 39 commits over `9e783d7`. Companion to
`comment-audit.md`, which is the plan; this is the account.

## 1. The numbers

19,516 comment lines to 12,255 — **37.2% removed**, tree-wide, across 102
tracked `.js`/`.mjs` files. Total lines 45,621 to 38,351.

| area | comment lines | cut | total lines |
|---|---|---|---|
| `src/core` | 177 → 138 | 22.0% | 400 → 361 |
| `src/data` | 2,730 → 1,509 | 44.7% | 3,975 → 2,754 |
| `src/model` | 1,642 → 1,180 | 28.1% | 3,113 → 2,651 |
| `src/rules` | 2,831 → 1,930 | 31.8% | 5,426 → 4,525 |
| `src/shell` | 2,233 → 1,185 | 46.9% | 4,341 → 3,293 |
| `src/view` | 3,577 → 2,323 | 35.1% | 7,865 → 6,612 |
| `tools` | 3,734 → 2,154 | 42.3% | 11,949 → 10,359 |
| `tests` | 2,570 → 1,815 | 29.4% | 8,502 → 7,747 |
| **tree** | **19,516 → 12,255** | **37.2%** | **45,621 → 38,351** |

Violations under `tools/check-comments.mjs`, measured by running today's
checker against the branch point and against HEAD:

| rule | before | after |
|---|---|---|
| references a document | 661 | 0 |
| block over the 10-line cap | 440 | 0 |
| section banner | 418 | 0 |
| cites a document section | 386 | 0 |
| names a phase, gate or wave | 188 | 0 |
| cites a decision number | 187 | 0 |
| cites an invariant by number | 144 | 0 |
| cites an assertion by number | 38 | 0 |
| describes a previous version | 30 | 0 |
| banned word ("load-bearing", "crux") | 28 | 0 |
| file-top block over the 36-line cap | 15 | 0 |
| more than four consecutive `//` lines | 11 | 0 |
| defers to a future version / to a document | 5 | 0 |
| restates acceptance criteria | 1 | 0 |
| **total** | **2,552** | **0** |

## 2. Where the prose went

Twenty files under `.claude/brain/`, each with a provenance line naming the
source file and what was cut from it. Two were written in the closing passes:
`harness-assertion-method.md` (what makes an assertion non-vacuous here, named
against the furnace check that sampled the wrong column and the two screenshot
tests that set `flags.grid` for `flags.showGrid`) and
`content-lint-arguments.md` (why each of the 28 content-lint assertions is
shaped the way it is). `view-ui-widgets.md` holds the widget layer's rejected
alternatives and floor measurements.

Nothing in `src/`, `tools/` or `tests/` references any of them. They are for a
future session reading the repo, not for a reader of the code.

## 3. The ASK items, and how they resolved

**Trim or delete only?** Trim, aggressively — "I'd rather you overtrim at this
point than undertrim". This superseded the brief's own delete-don't-rewrite
rule, and most of the pass is rewriting rather than deletion.

**Doc references?** Every one, without exception, including inside data and
output strings. See section 6.

**The two harnesses.** `tools/check.mjs` and `tests/visual.spec.js` held 5,362
comment lines between them. Resolved as: each probe keeps one statement of what
it proves, the method goes to `.claude/brain/harness-assertion-method.md`, and
citations, phase labels and banners go. Done — 5,362 → 3,451.

**Banners in a 9,000-line harness.** The audit called a banner inside a long
harness "navigation, not decoration" and deferred it. Resolved as: they go. All
418 are gone, replaced where useful by an ordinary sentence carrying the
section's name.

## 4. Every threshold that moved, and the comment that moved it

| change | forced by |
|---|---|
| comment-longer-than-code **ratio rule removed**, not retuned | seven `shell/main.js` comments the audit protects by name — a four-line hazard note above `if (run.dead) return;`, the dispatcher contract above `let prevUiDown = false`. In this codebase the comments most worth keeping sit above a single subtle line, so the rule is wrong in principle here. |
| file-top cap 30 → 36 | `data/machines.js`'s field key: 22 keys at one line each plus the layer declaration is 34 lines. |
| phase rule narrowed to `Phase 13d` or `phase 6e` | `data/machines.js`'s gear row: `teeth:8 keeps one tooth on each axis at phase 0` is a *rotational* phase. |
| aligned-table exemption added, floor 5 rows | `model/run.js`'s field key — the third time the cap fought a table. Exempting the shape beat raising the number again. |
| table floor 5 → 4 rows | `data/forms.js`'s selector grammar table. |
| table test changed to **column agreement** | `view/overview.js`'s lift-chain layer list, whose keys are multi-word (`the two hubs`, `the carrier`). Column agreement is stricter about prose containing a double space and more permissive about real tables, at once. |
| header cap applies to a file's FIRST block, at line ≤ 8 | `tools/ast-same.mjs` (shebang first) and `tests/save.spec.js` (an import first). |

One rule was **added**: `docs/STYLE.md` bans "load-bearing" and "crux", and the
checker now rejects both. Nine comments in `src/` and five in `tools/` used the
first; each now states what breaks instead of labelling the line important.

## 5. Where the audit and the execution disagree

**The estimate was wrong, and by a lot.** The audit predicted 65–78% of comment
lines removed. The real figure is 37.2%. The audit also predicted the 91 `src/`
file headers would fall from 2,758 lines to about 300; they fell to 1,601. Its
count of what existed was accurate to within 2.5%; what it got wrong was how
short the survivors would be. A surviving claim in this codebase generally
lands at four to ten lines, not one to three, because the thing worth keeping
is usually an argument about why an assertion is not vacuous or why a number is
that number — and that does not compress to a line without becoming a label.

If 37% is too little, the remaining fat is concentrated and easy to name:
`view/treatments.js` (234 comment lines in 555), `tools/check.mjs` (1,682 in
8,247) and `tests/visual.spec.js` (1,769 in 7,570).

**One file's comment count did not move at all.** `tools/check.mjs` and
`tools/content.mjs` show 0 net comment change in their final commit because
that commit only touched output strings. Their comment reductions are in the
two commits before it.

## 6. The code that changed, and why

The pass was comments-only except for **116 string literals**, every one of
them text a person reads rather than anything the program branches on. They
changed because a citation printed to a terminal is still a citation in
operational code:

- `src/data/tuning.js` — 2 `note` strings dropped "(D4 as amended)" and
  ", see docs/FINDINGS.md".
- `tools/worldgen-check.mjs` — 3 failure messages named the thing instead of
  the section: "the First Trial needs 10", "the furnace bill wants 12 more",
  "under this file's floor of 71".
- `tools/content.mjs` — 13 failure messages, including "a charge must be spent
  on work, not on being placed" where a DEVELOPER_GUIDE anchor used to be.
- `tools/check.mjs` — 98 lines of `console.log`, `ok()` and `fail()` text.
  Section headers lost their phase and spec labels; failure messages replaced a
  cited section with what it says ("the motion expression gives", "the fall
  table", "the locked refusal order"); and the twelve invariant numbers are
  named rather than numbered ("view may never mutate model", not
  "invariant 9").

Every other file is verified comments-only by `tools/ast-same.mjs`, per file,
against its own pre-edit copy and against `HEAD`.

Two automated passes damaged code before being reverted, both caught by
`npm run lint` on the same turn: one stripped `()` out of
`function makeCtx()`, and one ate a whole `ok('...docs/SPEC.md...')` call
because its parenthetical pattern allowed quotes inside. A third, earlier one
(`decite.mjs`, never committed) turned `write.reset()` into `write.reset` and
left a sentence ungrammatical; it was discarded for a conservative version.
`src/data/substances.js` reported CODE CHANGED once for a real reason: deleting
a one-line comment glued its two spaces of indentation onto the next line.

## 7. The escape hatch

`comment-lint-ignore-next-line`, defined in `tools/check-comments.mjs:26`. It
is used **twice in the whole tree, both inside the checker's own rule table** —
the rule that rejects `Phase 13d` has to be able to quote `Phase 13d`, and the
rule that rejects "load-bearing" has to name it.

How it could be misused: it suppresses **every** rule for the comment it sits
in, not one, and it is a substring match anywhere in that comment, so a comment
that merely *mentions* the token in prose is silently exempt. There is no
required reason field and nothing counts uses, so the honest failure mode is
drift — a file picks up three of them over a year and nobody notices the number
went up. If that starts happening, the cheap fix is to make the hatch take a
rule name and print a census at the end of `--all`.

## 8. Prevention

- `npm run lint:comments` — the checker, whole tree, zero dependencies.
- `tools/hook-comments.mjs` + `.claude/settings.json` — a PostToolUse hook that
  lints the one file an edit just touched and exits 2 so the violation comes
  back as a correction. Verified against a deliberately offending scratch file:
  eight of the nineteen rules fired. It never fails an edit for its own reasons
  (bad payload, missing path, non-js file, unrunnable checker all exit 0).
- `.github/workflows/verify.yml` — `lint:comments` in whole-tree mode, plus
  lint, check, check:content, check:worldgen and build. The visual suite is
  deliberately absent and the workflow says why.
- `CLAUDE.md`'s Comments section now carries the absolute rule ("Never
  reference a working document"), the two caps, the destination paragraph for
  prose that is worth keeping, and the banned-word rule.

**One gap the hook verification exposed:** a file-top block gets 36 lines, so
the hook cannot catch an over-long file header. Whole-tree CI can and does.

## 9. What I kept that I am not sure about

- **The 10-line cap itself.** Most surviving blocks in the harnesses sit at
  eight to ten lines. That is the cap doing its job, not a judgement that ten
  is right. If you want one-to-three-line comments, the cap is the dial and
  roughly 2,000 more lines would come out.
- **`data/machines.js`'s 34-line field key**, and the other reference tables
  the table exemption protects. They are genuinely useful in the file and they
  are also the single largest surviving block category.
- **Prose replacements for self-references.** "Section 8e owns this" became
  "the depletion section owns this". That cannot go stale against a
  renumbering, but it can go stale against a rename, and nothing checks it.
- **The named invariants in harness output.** "view may never mutate model" is
  better than "invariant 9" for a reader, and worse if `CLAUDE.md` ever rewords
  that invariant, because the two copies can now disagree in wording without
  disagreeing in number.
- **Twenty `.claude/brain/` files** with no staleness check of any kind. They
  record measurements taken against the code as it was on 2026-09-16.
