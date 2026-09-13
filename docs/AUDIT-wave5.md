# Audit — wave 5, phase 17a

Every verdict below is against the code at `f59f672`, read directly. Where a
citation in `docs/PLAN-phase13.md` §5.2 or `docs/PLAN-wave5-closeout.md` has
drifted, both the old and the current `file:line` are given. `npm run check`
passes (exit 0) at this commit.

**Counts: 6 already fixed (one partial), 12 still open, 2 closed as
acknowledged.**

---

## 1. The twenty-item punch list (`docs/PLAN-phase13.md` §5.2)

| # | verdict | evidence |
|---|---|---|
| 1 | **ALREADY FIXED, complete** | `rules/cycles.js:176-178` resolves `CYCLE[run.tribute.id].at` and returns when `M[at]` is undefined; the loop at `:179-181` skips every machine that is not that id. The header at `:141-170` was rewritten to argue the reversal instead of contradicting it. |
| 2 | **ALREADY FIXED, complete** | `data/machines.js:753` carries `band:'astral'`; the gate is `model/run.js:465-466`, refusing with the band's display name. |
| 3 | **ALREADY FIXED, partial** | The end state exists: `rules/cycles.js:88-94` fires `rw.win()` once past `CYCLES.length`, `view/hud.js:1052-1065` draws it, `shell/main.js:92` stops stepping. The *content* half is untouched — `data/cycles.js` still holds four rows, acknowledged at `data/cycles.js:52-58`. §1.2's routing to `FUTURE_IDEAS.md` is correct. |
| 4 | **STILL OPEN** | `shell/main.js:356-375` — four `draftable()[0]` branches, auto-granted, no offer and no pause. The completion bridge is `:353`. Punch-list citation `:297-316` is stale. |
| 5 | **STILL OPEN** | `data/grants.js:13-18` (1 row), `data/trinkets.js:20-27` (1), `data/miracles.js:24-29` (1). `data/boons.js` has 5 (`:21, :27, :32, :38, :47`). |
| 6 | **STILL OPEN** | `data/drops.js:17` is `chance:1` on `trigger:'tribute'`; `rules/cycles.js:288-299` rolls it on the first completion; `data/cycles.js:137` is cycle 4's `draft:'trinket'`; `rules/trinkets.js#draftable` then has nothing to offer. |
| 7 | **STILL OPEN, AND MISDIAGNOSED — see §1.1** | The stated mechanism is wrong and the real defect is worse. |
| 8 | **ALREADY FIXED, complete** | `shell/notify.js:44-47` (`tribute`/`cycle`/`debt` chip counts), `:101-116` (`tribute` and `debt` text; `cycle` deliberately takes the banner slot instead, `:104-108`), `data/sfx.js:38-41`. |
| 9 | **ALREADY FIXED, complete** | `rules/cycles.js:238` writes `rw.award([...reward.grants])`; `rules/grants.js:58-63` drains it into `award()` at `:69-76`, which pushes the `'grant'` row. `model/run.js#write.grant` now has exactly one caller module. |
| 10 | **ALREADY FIXED, complete** | `data/callouts.js:38-52` has 11 entries with indices 6-9 filled for cycle 2's four first-time asks; `rules/tutorial.js:250-252` asserts `CALLOUTS.length === BEATS.length` at import. |
| 11 | **STILL OPEN, narrowed** | `run.misses` is read in exactly one view site, `view/hud.js:1062`, which is the **win screen** — after the run. Nothing draws it during play. `view/hud.js:1049-1051` says so itself ("narrowed, not closed"). |
| 12 | **STILL OPEN** | Writers: `rules/cycles.js:223` and `:261`. Readers: `view/hud.js:493-545` (the panel), `:1053` (the win total), `shell/notify.js:112` (the debt toast). No gate, no threshold, no spender anywhere in `src/`. |
| 13 | **CLOSED AS ACKNOWLEDGED** | `model/run.js:78-81`, `data/cycles.js:43-46`, `view/ui/ruler.js:104-110` all state "knowledge and not access" explicitly. Punch-list citation `ruler.js:102-117` is one line off. |
| 14 | **STILL OPEN** | No `rate` key anywhere in `data/cycles.js`; `model/run.js#tributeMet` (`:580-584`) is a flat count over `row.demand`. |
| 15 | **STILL OPEN** | The deadline is plain `UI.ink2` at `view/hud.js:301-306`; the boon flash rule is `view/hud.js:427-428` (`a.left <= 5`, `(f.t * 6) | 0`). Both punch-list citations (`:268-272` / `:388`) are stale. |
| 16 | **STILL OPEN, partially prepared** | `deathScreen` (`view/hud.js:1023-1037`) still draws cause + depth only. The shared `endScreen` the plan's 17e.4 asks for **already exists** at `view/hud.js:992-1011`, and `winScreen` (`:1052-1065`) already prints trials/favour/misses/depth — so 17e.4 is a three-line array edit, not a refactor. |
| 17 | **STILL OPEN** | `view/hud.js:489` — `GOD_NAME` names 3 of the 5 god ids in use (`ares` and `hades` appear in `data/boons.js`/`data/miracles.js` and are missing). No `src/data/gods.js`. Punch-list citation `:450` is stale. |
| 18 | **STILL OPEN** | `rules/cycles.js:97` calls `ensureAltarPlaced()` the frame cycle 1 arms; `:134-139` places it fully formed with no presentation. Punch-list citation `:95-100` is stale. **`data/callouts.js:12-14` has since taken a documented dependency on this** — index 4 is `null` on the stated grounds that "`rules/cycles.js` places the altar unconditionally from frame 0". Phase 17f must fix that comment and probably that `null`. |
| 19 | **CLOSED AS ACKNOWLEDGED** | `model/run.js:73-76` ("`meta` has no save and that would be a cross-run promise the build cannot keep"), `META_SCHEMA` at `:183-187`, `write.retire` at `:229-232`. `CLAUDE.md` forbids the only storage that would change this. |
| 20 | **STILL OPEN, but the stated fact is no longer true** | `RUN_SCHEMA.known` is still seeded with every `HAND_RECIPES` id (`model/run.js:157`, `:212`) — but `isKnown` (`:610-614`) now composes that with `machineOutputOf` (`:600-604`) and `canPlace`, so **every machine-build recipe is already locked behind its grant**. What remains absent is a *source that reveals* a recipe, which is the half the item is really about. |

### 1.1 Item 7 is wrong about the mechanism, and the truth is worse

The punch list says cycle 2's grant draft yields `kiln_divine`, "which has
`minDepth:200` and is unplaceable anywhere a cycle-2 player has plausibly
reached", citing `data/machines.js:420`.

Two corrections:

- **`kiln_divine` has no `minDepth` at all.** It is `variantOf:'furnace'`
  (`data/machines.js:201-204`) and `furnace` carries none. The only shipped row
  with `minDepth:200` is `cyclops_maw` (`data/machines.js:440`) — which is what
  the cited line number actually pointed at.
- **`kiln_divine` cannot be placed at any depth, by any player, ever.** It is
  deliberately given no substance row (`data/substances.js:463-470`) and no
  recipe (`data/recipes.js:107`). `model/run.js#placementCheck` refuses at
  `:492-493` — `machineHeldSub` returns `undefined`, so the check returns
  `'NOTHING BUILT YET'` before depth is ever consulted. `model/run.js:390-393`
  states this outcome in so many words.

Since `gift-kiln` is the **only** row in `GRANTS` (`data/grants.js:13-18`), the
whole machine-grant tier is presently a no-op: cycle 2's `draft:'grant'` grants
a BUILD-list row that nothing can build and nothing can place. This makes
item 7 a *loop-defeating* item rather than a "design smell", and it is the
single largest sizing error in the punch list.

---

## 2. The parked items

| item | verdict | evidence |
|---|---|---|
| `docs/FINDINGS.md` #13 (burden bar label/value overlap) | **CLOSED — but not for the reason the finding stated, and not on the widget it named** | See §2.1. |
| `docs/FINDINGS.md` #14 (`winch-lit`/`winch-unlit` flake) | **STILL OPEN, undiagnosed** | Both tests still exist (`tests/visual.spec.js:4150-4169`) and both baselines are committed. Nothing in the repo records a diagnosis. One of the plan's two hypotheses can be ruled out — see §3.4. |
| Phase 16b parked item 3 (Character tab vertical budget) | **STILL OPEN** | See §2.2. |

### 2.1 FINDINGS #13

The fix at `view/ui/bar.js:69-74` is real, and its own comment
(`:58-68`) is accurate: the overlap the finding *reported* — value text running
into the bar — "was never true here, by measurement".

The load-bearing detail is that **the HUD burden bar passes no `label`**
(`view/hud.js:209-215` supplies `valueText` and no `label`). With `label` empty,
`Math.max(w, label ? textWidth(label) : 0)` at `bar.js:70` reduces to `w`, i.e.
exactly the `x + w + 3` the finding complained about. So the fix does not touch
the widget the finding named, and cannot have changed
`drive-reversing-overcap.png` at all.

What the fix *does* close is the same class of defect on the **TRIBUTE demand
rows**, which do pass a `label` (`view/hud.js:250-253` argues this explicitly,
and `TRIBUTE_BAR_W` is 50 against a 71 px "COPPER PLATE"). That is a genuine
D8 compliance win, on a different mount.

Verdict: **close #13 as "not real as reported; the real instance of the class
was found and fixed elsewhere"**, citing `view/ui/bar.js:69-74` and
`view/hud.js:209-215`. Do not record it as "the burden bar was fixed" — it was
not, because it was not broken.

One residual, unverified by screenshot: `bar.js:72`'s clamp
(`Math.min(startX, Math.max(x, vw - vtw - 2))`) can pull a value string *left*,
back over its own bar, at a sufficiently narrow `vw`. At the 200 px floor the
burden bar's `startX` is 59 and the clamp ceiling is ~133, so it does not fire
today.

### 2.2 Phase 16b parked item 3

Still structurally true. `MAIN_TABS` is still three rows
(`view/ui/mainPanel.js:60-64`); the panel is still capped
(`:132`, `h = min(vh - 8, vh < 300 ? vh - 8 : 176)`); `drawCharacterTab` still
declares four stat rows (`:261-266`) and still clips them to `body.bottom - 8`
(`:269`).

The *count* has drifted. Working the layout arithmetic through at the desktop
buffer (`VIEW.w/h` = 640×400 from `core/canvas.js:32-34` at 1280×800) with a
fresh run and nothing equipped, the stat cursor reaches y=255 with
`body.bottom` at 286, so **two of four rows draw** (WALK, CLIMB) before the
break — not the one that 16b.3 recorded. Equip a single trinket and its one
`trinketDeltaLines` row (`:251-255`) costs 8 px, which takes it back to one.
**This is computed from the layout code, not observed in a screenshot** — treat
the exact number as indicative and the conclusion (the tab overflows) as solid.

**The plan's proposed fix does not fit.** §8.6 says a fourth tab "still fits
`drawTabs` at the 188 px content width of the phone floor — verify that before
committing to it". Measured through `core/font.js#textWidth`, the three existing
labels already cost 171 px (`CHARACTER` 59, `CRAFTING` 53, `LOGISTICS` 59, each
`textWidth + 6` per `view/ui/tabs.js:28`). The shortest plausible fourth label —
four characters — costs 29 px, for 200 px against a content width of
`236 - 4 = 232` on desktop but `192 - 4 = 188` at the 200 px floor. At the floor
`view/ui/tabs.js:37` would silently **drop** the fourth tab, making it
unreachable rather than cramped. The plan's own stated fallback — a scroll
region in the existing tab — is the branch that survives.

---

## 3. The plan's own claims

### 3.1 `talos_head` / `cyclops_maw` are unreachable — **VERIFIED, and stronger than stated**

Both are real machine rows (`data/machines.js:393-407` and `:429-446`) with
mirrors (`:410-411`, `:448-449`), real held substances
(`data/substances.js:374-376`, `:382-384`) and real hand recipes
(`data/recipes.js:199-213`). None of the four ids appears in
`data/grants.js#GRANTS` (`:13-18`, one row, `kiln_divine`), in
`STARTING_MACHINES` (`:37-39`), or in any cycle's `reward.grants`
(`data/cycles.js:97` is the only `grants` key, and it names `furnace` and
`cloud_dock`).

**They are not craftable either.** `model/run.js#isKnown` (`:610-614`) gates a
recipe whose `out[0]` is a `<machineId>/rig` pair (`machineOutputOf`,
`:600-604`) on `canPlace(machineId)`. Since neither is ever granted, both
recipes are permanently unknown, so the CRAFTING tab draws them as locked
silhouettes forever. The plan's D17-D wording ("in `data/recipes.js` as
craftables") and §5.4's "are crafted by existing recipes" both overstate it:
the recipes exist but are unreachable by construction, so this is **four dead
machine rows, two dead substance rows and two dead recipe rows**, not merely
"ungranted".

D17-E is also *necessary*, not just tidy: `placementCheck` calls
`canPlace(machineId)` with the **concrete mirrored id** (`model/run.js:440`),
and `machineIdFor` (`:413-418`) resolves `talos_head_l` off `player.face` from
the one shared substance. So a left-facing placement needs `talos_head_l` in
`run.granted` on its own. That is exactly why `STARTING_MACHINES` lists both
`belt_r` and `belt_l`.

### 3.2 `run.t` is the fixed-step accumulator — **VERIFIED**

`model/run.js:235` is `tick(dt) { run.t += dt; ... }`, and it has exactly one
caller in `src/`: `shell/schedule.js:241`, the first entry in `STEPS`. The real
loop calls `step(STEP)` with `STEP = 1/120` (`shell/main.js:45`, `:748`), and
the test hook's `frames`/`hold` default to the same (`:873`, `:883`). Nothing
reads `Date.now()` into it.

Two properties worth D17-C relying on explicitly:

- `shell/main.js:81` and `:92` return from `step()` **before** `stepAll` runs,
  so `run.t` does not advance while the map overview is open or after a win.
  Per D17-A the draft modal joins those guards, which means a rolling window on
  `run.t` correctly excludes paused time with no extra work. Say so in 17d.
- `__mf.frames(n, dt)` accepts an arbitrary `dt` (`shell/main.js:873`), which
  is how 17g's 8-framerate assertion will drive it. That is a harness knob, not
  a production path.

### 3.3 `MIRROR_TO_BASE`/`BASE_TO_MIRROR` are derived — **VERIFIED**

`model/run.js:385-388`. `MIRROR_TO_BASE` filters `MACHINES` on
`m.variantOf && (m.belt || m.mine)` and maps `id → variantOf`;
`BASE_TO_MIRROR` inverts it. No id is hand-listed, and `:379-384` states the
shape rule. The plan's line range is exact.

### 3.4 `view/fx.js#reset()` does not reseed `spark` — **VERIFIED as a code fact; NO, it cannot move a committed baseline today**

The fact: `spark` is created once at module scope from a constant
(`view/fx.js:25`, `mulberry(0x5EEDCAFE)`), `burst()` draws three values per chip
(`:40-42`), and `reset()` (`:75-79`) clears `chips`/`toasts`/`banner` and does
not rewind the generator. So chip positions are a function of how many chips the
**page** has ever emitted, not of the run seed. Worth closing on its own merits.

It cannot affect a baseline as things stand, and the trace is:

- Playwright gives each test its own page (`playwright.config.js` declares no
  shared context or `test.describe.serial` reuse), and every visual test calls
  `boot(page)` → `page.goto('/?test=1')` (`tests/visual.spec.js:21-28`). The
  module re-imports, so `spark` is re-created at a fixed seed **per test**.
- Under `?test=1` no RAF loop runs (`shell/main.js:769-771`), so the only chip
  emitters are `drainJournal`, called once per `__mf.frames`/`__mf.hold` **call**
  (not per substep — `shell/main.js:877`, `:894`) and once per `frame()` in the
  real loop (`:762`).
- `newRun` clears the journal (`shell/boot.js:96`) and the chips
  (`:120`) before any of that.
- Within a test the call sequence is therefore a deterministic function of the
  seeded model and a fixed substep count, so the same test produces the same
  `spark` draws on every run.

**Consequence for FINDINGS #14: the chip stream is not a candidate.** Both
`winch-unlit` and `winch-lit` (`tests/visual.spec.js:4150-4169`) do
`boot` → one `settle` → `winchScene`, on their own fresh page. Their `spark`
state at every burst is identical run to run and identical under `-g` or full
parallelism. 17g should record this hypothesis as ruled out by inspection rather
than re-test it.

The residual risk the reseed does close is a *future* one: a test that calls
`newRun` twice (e.g. `tests/visual.spec.js:3106`) makes the second run's chip
positions depend on the first run's burst count, so an unrelated edit to what the
first run emits would silently move the second run's pixels.

### 3.5 Appending a relic/miracle row is safe; a tile-capable one throws — **VERIFIED**

Measured by importing the tables: `SUB.length` 23, `FORM.length` 13,
`STRIDE` 14 (`data/forms.js:411`), `PACKABLE_MAX` 8 (`adamant`),
`PACKABLE_LIMIT` 17 (`:456-457`). `packable` (`:451-452`) is
`SUB[o].tile || TILE_FORMS.some(f => crossable(o, f))`; the `relic` form's
`subTags` is `['relic']` and `phial`'s is `['miracle']`, so neither crosses a
terrain substance and neither moves `PACKABLE_MAX`. The import guard is
`data/forms.js:459-464` — the plan's `:459` citation is exact.

A tile-capable row appended at ordinal 23 would pack to
`1 + 23*14 + 13 = 336`, past `BEDROCK` 255, and throw at import.

**One stale number found.** `data/substances.js:96-97` says "at 23 rows and 12
forms an appended packable row packs to `1 + 23 * 13 + 12 = 312` of 255". There
are 13 forms now, `STRIDE` is 14, and the figure is 336. The conclusion is
unchanged; the arithmetic in the comment is wrong. `docs/SPEC.md` §15/§19 own
these numbers and should be checked in the same pass.

### 3.6 `applyEffect` grants `effect.boon` independently of `effect.kind` — **VERIFIED**

`rules/miracles.js:39-65`. The `e.kind === 'collapse'` branch (`:46-50`) and the
`e.boon` branch (`:58-64`) are sequential and unguarded by each other, so a row
carrying only `effect:{ boon:'…' }` grants the boon and edits no tiles, with no
engine change. `data/miracles.js:21-22` documents `effect.boon` as OPTIONAL.

**One caveat the plan does not state.** `use()` returns `false` before spending
anything when `!band` (`rules/miracles.js:29`), i.e. when the aim reticle
resolves nowhere. A pure-boon phial therefore still cannot be used while aiming
at open sky. That is defensible (it is consistent with every other aimed verb)
but it is a behaviour the content author should know about, because a boon-only
miracle reads as if it should be usable anywhere.

---

## 4. Contradictions with recorded decisions

Checked against `ARCHITECTURE.md` §7 and `CLAUDE.md` D1–D12. Four things to
resolve before the phases start; one is substantive.

**D17-D's reachability assertion, as specified, would pass the worst row in the
table.** The assertion is "every `data/machines.js` row is in
`STARTING_MACHINES`, named by a `GRANTS` row, named by some cycle's
`reward.grants`, or a mirror of one of those". `kiln_divine` is named by a
`GRANTS` row, so it passes — while being, per §1.1, less placeable than
`talos_head` is. "Named by a grant" is not the property that matters;
**"a granted machine id resolves to a held substance, so `placementCheck` can
return `ok`"** is. Either widen the assertion to test that
`model/run.js#machineHeldSub(id) !== undefined` for every granted-or-starting
id, with `altar` exempted (and `kiln_divine` then either given a substance and a
recipe with a broken cost tie, or dropped from `GRANTS`) — or state in the
commit why `kiln_divine` is a second exemption. As drafted the assertion would
go green over a dead tier. This is the one finding that changes what 17b should
build.

**D1's four-tier vocabulary is not contradicted by the draft modal, but the
plan's own tier names should be checked at the boundary.** D1 binds
`data/grants.js`/`rules/grants.js` as the *Machine grant* tier and reserves
"boon" for the timed tier; `data/cycles.js:47-50`'s `draft` key already uses
`'grant' | 'boon' | 'trinket' | 'miracle'`, which is exactly D1's four words, and
D17-F's `run.offer = { tier, ids }` inherits them unchanged. D1's
`'boon:' + id` keying of `mods.rows[].src` is likewise untouched, because a
drafted boon still goes through `rules/boons.js#grant`. No contradiction.

**D9 is not contradicted by the rate demand — the operative invariant is 10, not
D9 — but D9's own cited geometry is stale.** D17-C measures a window on `run.t`,
which is a time datum and never touches the depth datum; `model/run.js:453-466`
still gates `cloud_dock` by band id rather than by a negative `minDepth`, on
D9's own reasoning, and `view/hud.js#depthReached` (`:1016-1021`) and
`view/ui/ruler.js#depthDatum` (`:121-124`) still share one arithmetic. What has
drifted is `CLAUDE.md` D9's parenthetical: it describes `BANDS[0]` as `tw:96`
with `origin:{x:128, y:0}`, and `src/data/world.js:53-56` says `tw:128` and
`origin:{x:0, y:0}` (the other two bands are `tw:128` as well,
`world.js:68-70`, `:147-148`). The row totals D9 quotes — 40 + 56 + 320 rows,
world-Y 0..3328 px — are still correct. Fix the two numbers in 17h.

**17b step 2's suggested trinket tunables aim straight at the premise, and
should say so out loud.** The brief recommends "`climb`, `pickPower`, `burden`,
a scoped `segReach.hub`". `climb` and `burden` are two of the three tunables
D4 names as the *entire* player-scale expression of "down is free, up is
expensive" (`data/tuning.js:132-134`), and `segReach` multiplies `hub.reach`
(`:82-83`), which is invariant 4's bounded-segment rule. `CLAUDE.md`'s opening
is explicit that a change making ascent cheaper "is a bug, not a feature, unless
the change is explicitly about that trade". None of these is forbidden — a
trinket is precisely where that trade belongs — but the row's `text` and the
commit need to name it as a deliberate loosening, and the plan's "at least one
should have a real cost as well as a benefit" should apply to whichever of these
it picks rather than to some other row.

Two smaller notes, neither a contradiction:

- **17f inherits a documented dependency the plan does not list.**
  `data/callouts.js:12-14` justifies index 4 being `null` on the grounds that
  the altar is placed unconditionally from frame 0. D17-G removes that, so the
  comment becomes false and the `null` becomes a real gap in the beat sheet.
  Add `src/data/callouts.js` to 17f's file ownership or to 17h's doc sweep.
- **The new `tools/content.mjs` assertions are 25 and 26, not 20.** The file
  already carries 24 numbered assertions (`tools/content.mjs:110` … `:1071`).
  `CLAUDE.md` D12's reference to "assertion 20" is still correct (`:841`).

---

## 5. What could not be verified

- **The exact count of visible Character-tab stat rows** (§2.2) is arithmetic
  over the layout code, not a rendered measurement. A screenshot at 1280×800
  with the menu open would settle it in one shot; 17e should take one before
  choosing between a fourth tab and a scroll region.
- **FINDINGS #14's cause.** Ruling the chip stream out (§3.4) is inspection, not
  reproduction. Nothing here tells you what *does* cause it.
- **Whether the current baselines are correct.** Unchanged from `CLAUDE.md`:
  they are unreviewed, and `npm run check` passing says nothing about
  appearance.
