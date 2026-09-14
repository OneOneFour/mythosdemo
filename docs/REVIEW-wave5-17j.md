# Review — Phase 17j (an ALL category in the crafting tab)

Commit `89bf1c9`. Spec: `docs/PLAN-wave5-closeout.md` §6b.

## 1. Verdict

PASS WITH FINDINGS

The phase does what §6b asked and nothing else, the wrap is correct for every
input the project can produce today, and the two re-accepted baselines move
only inside the crafting panel — but one latent layout bug and one wrong
sentence in `docs/FINDINGS.md` should be fixed before they are quoted.

## 2. Brief coverage

| brief line | state | where |
|---|---|---|
| `CATEGORY_TABS` gains an `all` entry that filters nothing | done | `src/view/ui/mainPanel.js:374`, filter at `:438` |
| `categoryOf` unchanged; `all` bypasses it | done | `src/view/ui/mainPanel.js:385-396` untouched; `:438` short-circuits on `catActive === 'all'` |
| `ALL` first, and therefore the default | done | `src/view/ui/mainPanel.js:374`; `activeOf` at `:70`; locked in pixels by `ui-crafting.png`, which sets no category tab |
| option 1, wrap the row, and say why in the commit | done | `src/view/ui/tabs.js:36`; the commit's third paragraph rejects options 2 and 3 by name |
| `drawTabs` returns the real height so callers anchor below it | done | `src/view/ui/tabs.js:56,61`; both callers already read `tabs.h` (`mainPanel.js:140,427`) |
| the other callers' baselines checked | done | two callers, not the plan's five; `docs/FINDINGS.md` 17j records the correction, and MENU costs 171 px against 188 so it never wraps |
| acceptance: a test counts the recorded tab rects at the 200 px floor | done | `tests/visual.spec.js:1731-1732` |
| acceptance: ALL equals the five categories, as set equality, nothing twice, nothing missing | done | `tests/visual.spec.js:1769-1775` |
| set equality "against `RECIPES`, filtered by `isKnown`" | done, deviated | `tests/visual.spec.js:1759` compares against `HAND_RECIPES`. The deviation is right — `mainPanel.js:449-452` puts unknown recipes in the grid as `?` slots, so an `isKnown` filter would have asserted against a list the panel does not draw. The phase did not record the deviation anywhere. |
| `docs/SPEC.md` holds the row | done | `docs/SPEC.md:2720-2745`, §25 |

## 3. Out of scope

Nothing outside the ownership block was touched. Within it:

- `src/view/ui/tabs.js:1` — header reworded from "One row, one active tab" to
  "One row of tabs, one active". Harmless.
- `src/view/ui/mainPanel.js:364-372` — a nine-line comment above
  `CATEGORY_TABS` that restates most of SPEC §25. Harmless, see the style note
  in §4.

## 4. Defects

### D1 — a dropped tab leaves a phantom line (low, latent)

`src/view/ui/tabs.js:36,46,56`. The wrap at `:36` advances `cy` and resets
`cx` using the same predicate the drop at `:46` then re-tests, so a tab too
wide for a whole line opens a line before it is dropped. `cy` is never wound
back, so `h` at `:56` counts an empty line, the rule at `:59` is drawn 9 px
below the last tab, and the caller anchors its body 9 px too low.

Inputs that break it: any row where a tab after the first is wider than
`maxRight - x`. Labels `['AB', 'SUPERCALIFRAGILISTIC']` in a 40 px row
reproduce it. Not reachable with today's content — the widest label is
REFINED at 47 px against 188 px of content at the narrowest supported
buffer — so no current pixel is wrong.

### D2 — `docs/FINDINGS.md` states the wrong cause for the empty DIVINE tab (low)

`docs/FINDINGS.md:2370-2373` says no `HAND_RECIPES` row's output substance
carries `relic` or `miracle`. One does. `data/recipes.js:344` outputs
`{ sub:'auger', form:'relic' }`, and `auger` carries `tags:['relic']`.
`categoryOf` tests `sub.item?.tool` at `mainPanel.js:390` before the relic tag
at `:391`, and `auger` carries `item.tool`, so it is the single TOOLS row.
DIVINE is empty because the tool branch wins, not because no relic is
craftable. `docs/SPEC.md:2727` inherits the same gap — its DIVINE row reads
"the output substance is a relic or a miracle" without the tool branch that
overrides it.

The count the phase reports is right. I re-derived it against the live tables:
13 raw, 2 refined, 1 tool, 3 placeables, 0 divine, 19 total. The emptiness
predates the phase — the `divine` tab id was written in `4e75029` (Phase 5b)
and `data/recipes.js` has never carried a non-tool relic or miracle output.

**Recommendation on record.** An always-empty tab should not ship as an empty
tab. Two cheap resolutions, both content or one-line decisions and neither in
17j's block. Test the relic and miracle tags before `item.tool` in
`categoryOf`, which moves ADAMANT AUGER into DIVINE and leaves TOOLS empty
instead — worse. Or drop the DIVINE tab until a divine hand recipe exists,
which also reclaims 41 px and unwraps the row at the phone floor. The second
is the better trade today, and it carries the warning in §6 below.

### D3 — the viewport-bounds loop in the wrap test is close to vacuous (style note)

`tests/visual.spec.js:1735-1739`. `drawTabs` clamps every tab except the first
to `maxRight`, which is already `min(x + w, vw - 2)`, so `h.x + h.w <= 200`
can only fail through the deliberate first-tab exception. The `h.y + h.h <=
180` bound has about 130 px of slack at the phone floor, where the second line
ends near y 44. Neither assertion is wrong; neither is what makes the test
bite. The id-list assertion at `:1731` is the one that does.

### D4 — the no-overlap assertion cannot fail (style note)

`tests/visual.spec.js:1772`. `categoryOf` returns exactly one string per
recipe, so the five category lists are disjoint by construction and
`new Set(union).size === union.length` has no failing input. Harmless as
documentation of intent.

### D5 — a nine-line comment for a five-element table (style note)

`src/view/ui/mainPanel.js:364-372`. The first paragraph earns its place; it
records why `all` bypasses `categoryOf`, which a reader would otherwise
undo. The second paragraph restates SPEC §25's measurement, and the closing
"That is the reason it wraps at all" narrates. CLAUDE.md asks for one line
unless the invariant needs two.

## 5. Verification

I ran all three.

```
npm run check   0. dependency direction: ok  86 files, 494 edges, 0 violations
                All checks passed.
npm run lint    oxlint src tools tests — no output, exit 0
npm run test:visual   129 passed (16.6s)
```

The layer numbers and the test count match the phase report exactly.

**The wrap does not change a single-line row.** Verified by reading the
control flow, not by trusting the baselines. `right` is updated to `cx` after
every placement at `:53` and `cx` only grows, so on one line `right === cx` at
the end. The rule at `:59` therefore computes
`min(right, maxRight) - x === min(cx, maxRight) - x`, which is the old
expression; `h === TAB_H`, so `y + h - 1 === y + TAB_H - 1`, which is the old
origin; and `rect.w === cx - x`, which is the old width. Tab rects use
`cy === y`. The old guard `cx > x` and the new `placed` agree whenever no wrap
has fired, since `tw >= 6`. The single-line case emits byte-identical ops. The
one shape that does change is a row that previously *dropped* a tab, which is
the point of the phase, and only two rows exist.

**`h === 18` is a literal, not derived.** `tests/visual.spec.js:1732` asserts
`18` with `// two lines of TAB_H` beside it. Changing `TAB_H` turns the test
red rather than letting it pass on a broken layout, because tab *widths* do
not depend on `TAB_H` and the line count would not change. The one silent-pass
shape is `TAB_H` becoming 18 with the row back on one line, which also needs
the six labels to shrink below 188 px. The id-list assertion covers that.

**The set-equality test reads what was drawn.** `tests/visual.spec.js:1764`
takes `drawn.recipeIndex.recipes`, the list `mainPanel.js:475` recorded for
the click dispatcher, after a real `__mf.draw()` per category. It does not
re-run `categoryOf`. `every` comes from `data/recipes.js`, so both sides
cannot be empty together, and a missing grid would throw on `.slice()` rather
than pass. What turns it red: ALL filtering anything, a category losing a
recipe, a recipe count other than 19, or any per-category count other than
`{raw:13, refined:2, tools:1, placeables:3, divine:0}`. That last group is a
deliberate content tripwire — adding one hand recipe fails this test, by
design, and the comment says so.

**Nothing persists a tab.** There is no storage anywhere in `src/`, and
`shell/ui.js:236` validates the stored id against the list it is handed before
returning it, falling back to `tabs[0]`. A stale `'raw'` in `ui.tab` would
resolve to `raw`, which still exists; a removed id resolves to `all`.
`cycleTab` at `:242` indexes off the same validated value. The only
non-default entry points are `tests/visual.spec.js`'s four
`intent('tab', {row:'main-craft-cat', tab:'placeables'})` calls, all of which
name a live id.

**Both re-accepted baselines moved only for the two stated reasons.** I
decoded the old and new PNGs and diffed them per row at `threshold: 0`
equivalence (exact byte compare). Totals are 16,464 px for `ui-crafting` and
16,500 px for `furnace-lifecycle-1-crafting-ui`, matching the commit. The
desktop buffer is 640x400 at scale 2, and the MENU panel occupies buffer
x 202..438, y 112..288. Every differing pixel falls in three bands, all inside
that panel:

| band (buffer coords) | px | cause |
|---|---|---|
| y 136..144, x 207..408 | 2,004 | the category row's labels, shifted right by the 23 px ALL tab |
| y 158..171, x 392..422 | 1,148 / 1,184 | the last two cells of grid row 1, which now hold a different pair of recipes |
| y 174..190, x 204..424 | 13,312 | grid row 2, which did not exist when the list was 13 long and 13 columns wide |

No pixel outside the panel differs, so the world-layer drift the 17i review
caught did not recur here.

One claim I could not reproduce. The commit says breaking ALL "makes the
set-equality test name the 11 recipes that went missing", and dropping the raw
category would drop 13, which is the number the test itself asserts. The
mutation is gone, so the discrepancy is unresolvable; it does not affect the
shipped assertion.

## 6. What a later phase must not undo

- **The wrap is generic and its only live user is the crafting row.** If a
  later phase drops the DIVINE tab (see D2), the six labels become 163 px, the
  row fits 188 px, and the wrap stops firing anywhere in the project. Do not
  then delete `tabs.js`'s wrap or the test at `visual.spec.js:1712`. The drop
  behaviour it replaced removed a whole category with nothing on screen to say
  so, which is the trap that killed the fourth Character tab in 17e.
- **`placed` at `tabs.js:27` is not a rewrite of `cx > x`.** After a wrap
  `cx === x` again, so restoring the old predicate would make the row never
  drop and never terminate the line.
- **`right` at `tabs.js:53` is the widest line, not the last line.** The rule
  at `:59` spans it on purpose, so a short final line does not leave a ragged
  underline. Collapsing it back to `cx` would shorten the rule to the width of
  whatever landed last.
- **`ALL` bypasses `categoryOf` rather than being a sixth branch in it.**
  `categoryOf` returns the category of a recipe, and no recipe is "all".
- **The per-category counts in the set-equality test are a content tripwire.**
  When they fail after a recipe lands, update the numbers; do not soften the
  assertion to a range.
