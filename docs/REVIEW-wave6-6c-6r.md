# Review — wave 6, phases 6c and 6r

Reviewed at `a7e8dec`. Commits under review are `8a4a47d` (6c, the surface
heightmap rewrite) and `086f25e` (6r, the sky reaches the skyline). Plan is
`docs/PLAN-wave6.md` §2 U4, §4 6c and §4's wave 6.6.

## 1. Verdicts

| phase | verdict | one sentence |
|---|---|---|
| **6c** | **PASS WITH FINDINGS** | The pipeline does what it claims and I reproduced every walkability and statistics figure, but the `rand()` shift invalidated two scene-test comments that nobody parked, and two numbers in `docs/SPEC.md` §16 do not match what the code produces. |
| **6r** | **PASS** | One memoised number replaces a hardcoded horizon in two passes, the pixel-neutrality argument holds, and the reasoning it parked for 6s is correct. |

---

## 2. Phase 6c — the heightmap rewrite

### 2.1 Brief against diff

| plan requirement (§4 6c) | status | where |
|---|---|---|
| Replace the octave sum with a real landform pipeline | done | `src/rules/generate.js:479-527` (`heightmap`), `:530-545` (`summits`), `:549-556` (`smooth`) |
| The datum does not move; `floorTy` stays the spawn-shelf row | done | `src/data/world.js:70` still `floorTy:20`; `src/view/hud.js:453`, `src/model/run.js:573` and `src/data/machines.js:440` untouched by both commits |
| `view/paint.js`'s excavated test stops calling every sub-`floorTy` air tile cut rock | partial, and deliberately so | `src/view/paint.js:195-196` is a union, not the pure sky test the plan asked for. See 2.2. |
| Re-derive the ±1-tile slope limit rather than delete it | done | `src/rules/generate.js:105` `HILL_SLOPE = 1.6`, and `:561-573` `stepPass` still caps an outward rise at 1 unconditionally (`else if (d < -1) d = -1`) |
| Keep `SHELF`'s 19 guaranteed-flat spawn columns | done | `src/rules/generate.js:55` `SHELF = 9`, unchanged |
| Keep every `rand()` call in a fixed traversal order | done | `src/rules/generate.js:530-545`, three draws per summit as three separate statements in centre/height/width order |
| `hash2` stays banned from the generator | done | no `hash2` import in `src/rules/generate.js` |
| Hills read as landforms with valleys between them, no sawtooth | done for the silhouette, not for the flanks | see §4 |
| No cave shading in the sky | done | `src/view/paint.js:195`, and the hilltop-tunnel probe in §6 |
| The spawn shelf is flat | done | measured flat run containing spawn is 21 columns minimum over 200 seeds |
| A walk from spawn to each map edge is unblocked | done, terrain only | reproduced independently, §6 |
| `npm run check`'s worldgen and seam sections pass | done | 1063 checks, 0 violations; `check:worldgen` 200 seeds, 0 violations |
| `docs/SPEC.md` §16 rewritten with the new numbers | done, two figures wrong | `docs/SPEC.md:900-960`. See 2.3. |

### 2.2 Deviations from the written brief, and whether each was right

**`excavated` is a union rather than the pure sky test.** Right, and the phase
was right to stop. The plan assumed transparent air below `floorTy` would show
sky. `view/scene.js#drawSky` clamped at `floorTy * tile` and the frame backdrop
below it is `INK.void` (`src/view/scene.js:108`), so the pure test would have
revealed black. Shipping `dip:0` and keeping `ty >= floorTy` as the second term
cost nothing and bought the real fix, because a tunnel driven sideways into a
hilltop used to fill with sky gradient and no longer does. I confirmed that
payoff on the phase's own `dip:4` probe image, where the tunnel at column 76
reads as a cavity.

**The per-column ragged lip was deleted for any band with a height map, which
the plan did not ask for.** Right. An independent coin flip per column laid on
top of a height map leaves a two-tile face beside a raised column, and
`rules/player.js#moveX` clears one tile. `KINDS.layer` still carves it when
`ctx.off` is absent (`src/rules/generate.js:191`), so `astral` keeps it.
Measured consequence, over 200 seeds: the ground row now never reaches
`floorTy + 1`, where the old generator reached it routinely.

**`BLEND` went from 3 to 10 and became a smoothstep.** In scope and correct.
The linear ramp held one slope for its whole width, which is the staircase the
phase was hired to remove.

**`amp` went from 6 to 10.** In scope (`src/data/world.js` is 6c's file), and
`docs/SPEC.md:905` carries the number. The justification stands, because the
clamp at `amp:6` truncates a summit drawn at `HILL_SHARE` of the budget.

**`src/model/tiles.js` was owned and never touched.** Correct. `skyExposedAt`
already existed (`2539e85`) and needed no change.

### 2.3 Defects

**D1 — `tests/visual.spec.js:5693-5698` photographs a cliff that no longer
exists. Severity: medium.** The `a cliff face` test's header states "At seed
1337 it fires exactly once, at tx 109". Under the new generator seed 1337 has
**no** adjacent-column step over 1 tile anywhere in the surface band, which I
measured directly. The re-accepted baseline still guards that region against
change, so nothing is red, but the test's stated subject — the steepest face
the generator will ever produce — is absent from the picture, and the comment
now asserts something false. This is the softer form of the failure mode
`CLAUDE.md` warns about. The seed the test uses has to be re-picked from the
new generator, or the test has to stop claiming a `STEP_BIG` face.

**D2 — `docs/SPEC.md:944` overstates the flat run at spawn. Severity: low.**
§16.1 says the blend "widens the guaranteed-flat ground at spawn from `SHELF`'s
19 columns to 21–23 measured". §16.2's own table two paragraphs earlier gives
"longest flat run 21–38". Measured over seeds 1..200, the flat run containing
spawn is min 21, median 22, **max 38** — the same metric as the table row, so
the two SPEC statements disagree and the "21–23" is wrong at the top end.

**D3 — `docs/SPEC.md:941` misstates the two-tile-step rate. Severity: low.**
§16.2 says "roughly one seed in ten (0.1 per seed over 200, against 0.8
before)". Measured on the same metric: 10 of 200 seeds carry one, which is one
seed in **twenty**, at a mean of 0.05 per seed. The "0.8 before" figure
reproduces exactly at 0.78, so the methodology matches and only the new number
is off.

**D4 — `tools/worldgen-check.mjs:342-345` carries a comment for a mechanism 6c
deleted. Severity: low.** The comment justifies the assertion's `+ 1` of lower
slack as room for "the one-row ragged LIP carve
(rules/generate.js#heightmap)... folded in AFTER the amp clamp". That carve is
gone from any band with a height map, and I measured the ground row never
reaching `floorTy + 1` over 200 seeds, so the slack is now dead and its stated
reason is false. `tools/` was outside 6c's ownership block, which is why the
comment survived, but the phase parked the adjacent `dip` fix in
`docs/FINDINGS.md` and did not park this one. It belongs in the same 6s edit.

**D5 — `tests/visual.spec.js:5447-5457` asserts a copper/granite adjacency the
new generator does not produce. Severity: low, and mostly pre-existing.** The
`an ore blob against pale stone` header claims a copper cluster at tx 96-108
beside granite at tx 109-111, ty 120-130, at seed 1337. At HEAD that window
holds no granite at all and gains a hollow at ty 118-125. I read both
baselines, and the picture was already too dark to show either substance before
6c, so 6c did not break the test — it invalidated the comment's factual claim
about a test that was already vacuous. Worth parking rather than fixing here.

**Style note, not a defect.** `HILL_SLOPE`'s derivation is exact before
rounding only. `w = round(hh * 1.6 * k)` can round down, so at `hh = 3.4, k = 1`
the drawn half-width is 5 and the cosine's maximum slope is 1.07 tiles per
column. `stepPass`'s unconditional `d < -1` clamp catches it, and I found zero
outward rises over 1 tile in 200 seeds, so the guarantee holds structurally.
The comment at `src/rules/generate.js:100-104` reads as though the inequality
alone is the guarantee.

### 2.4 Out of scope

| change | verdict |
|---|---|
| `tests/visual.spec.js:2813` — `__mf.frames(240)` before `realClick` | Harmless and legitimate. The phase declared it in the commit and in `docs/FINDINGS.md`. `updateCamera` runs inside `step()` at `k = min(1, dt*6)`, so 240 substeps leave a 0.95^240 residual and `drawCam` then matches `cam`, which is exactly the mismatch that broke the click. No assertion was relaxed, and the same `frames(240)` idiom already appears at five other sites in that file. It loses the accidental coverage of clicking against a moving camera, which was never the test's subject and was passing on a 1 px margin. |
| `docs/FINDINGS.md:2846-2884` | Expected. That file is the parking lot. |
| 105 baselines re-accepted | Justified in the commit, which states that the surface moved on purpose and that the `rand()` shift moves ore and hollows behind every panel scene. The commit says "111 visual baselines"; the real count is 105, and 111 is the total file count including source and docs. |

---

## 3. Phase 6r — the sky reaches the skyline

### 3.1 Brief against diff

| plan requirement (§4, wave 6.6, 6r) | status | where |
|---|---|---|
| `drawSky` paints to the actual skyline instead of clamping at `floorTy` | done | `src/view/scene.js:240-241, 264-265` |
| The last row of sky and the first row of cavity agree | done | both read `src/view/paint.js:163` `skyBottomTy` |
| `excavated` becomes the pure sky test | **deliberately not done**, argued in the commit and in `docs/FINDINGS.md`. See 3.2. | `src/view/paint.js:195-196` |
| `dip` becomes spendable | done, and not spent | `src/data/world.js:86` still declares no `dip` |
| Note the one-sided relief budget in `tools/worldgen-check.mjs` for 6s | done, with a measured figure | `docs/FINDINGS.md` wave 6 phase 6r, second bullet |
| `docs/SPEC.md` §16.1 updated | done | `docs/SPEC.md:944-962` |

### 3.2 Deviations, and whether each was right

**No per-column query and no cache, one memoised number instead.** Right, and
the reasoning checks out on both halves. Below the horizon the ramp is a single
tone, so run-length encoding a skyline there buys back only fill area that
opaque rock covers anyway. Above the horizon a per-column skyline would stop
painting sky behind a hill, and that is invisible because `chunkCanvas` sends a
first-sight chunk straight to `paintChunk` without consulting `budget` — the
budget test sits in the `else if (e.ver !== ver && budget <= 0)` branch, which a
chunk with no cache entry never reaches (`src/view/paint.js:128-138`). I
verified `fillRect 1,344,909` at HEAD, identical to the figure the commit
reports.

One nuance the argument gets slightly over-broad. `paintTile` fills a solid
tile opaquely at `src/view/paint.js:337` only for ordinary terrain; a form
carrying its own `look` takes the branch at `:338-344` and does **not** fill the
cell, so sky shows through behind a placed rung. That strengthens the
conclusion rather than weakening it, because a per-column skyline clipped to
the ground row would have been wrong behind a ladder standing above that row,
not merely wasteful.

**`excavated` stays a union.** The argument is correct and it is the important
constraint to hand 6s. A valley floor and the bottom of a hand-dug shaft are
the same geometry — one sky-exposed column — and invariant 1 says the tile grid
is the only source of truth for terrain, so it holds the terrain as it is now
and not the profile `heightmap` started from. No `model` query records that
profile. So `view` genuinely cannot separate the two cases, and the union's
depth term is not removable by any phase that does not first make `model`
remember the generated ground row per column. Stated crisply for 6s: **inside
the relief envelope the sky wins, past it the cavity wins, and a quarry open to
the sky is impossible until `model` stores a per-column generated ground row.**

**`skyBottomTy` exported from `paint.js`, one export beyond `excavated`.**
Correct, and better than the alternatives. `view/scene.js` importing a sibling
`view` module is legal, `skyRamps` at `src/view/scene.js:231` already uses the
identical memoise-by-`b.cfg.id` idiom, and the number has exactly one
definition that both passes read. Putting it in `model/world.js` would have
been defensible and no better; duplicating the expression in `scene.js` would
have recreated the disagreement the phase set out to remove.

**`docs/SPEC.md` and `docs/FINDINGS.md` touched outside the stated ownership of
`src/view/scene.js`.** Both are required by the wave's own definition of done,
and the SPEC number is the one 6s reads. `src/view/paint.js` is the real
ownership extension, and it is the file 6c's own block named for the sky test,
in a serial view chain with 6c already closed. Acceptable.

### 3.3 Defects

**D6 — nothing binds `view/paint.js` to the `dip` field name, and no test
covers `dip > 0`. Severity: low today, medium the day 6s lands.**
`src/view/paint.js:166-167` finds the relief row by the literal `'relief'` and
reads the literal `dip`. If 6s spells the field differently or puts it on
another strata row, `skyBottomTy` silently returns `floorTy`, `excavated`
reverts to the datum, and the black band comes back with no test going red.
`npm run check` passes clean at `dip:4`, which I verified, so the whole
mechanism is currently unguarded by anything except a screenshot of a band that
declares no `dip`. 6s should land one assertion that ties the two together.

**D7 — `src/data/world.js:77-80` states behaviour that no longer exists.
Severity: low.** The relief row's comment still says `drawSky` paints only down
to `floorTy * tile` and that a valley floor would show `INK.void`. 6r made that
false and parked the correction for 6s, which owns the `dip` value on the same
row. The parking note is in `docs/FINDINGS.md`, so this is bookkeeping rather
than a miss, but the comment actively misinforms until 6s lands.

**D8 — the memoised `skyBottoms` map forecloses a run-scoped `dip`. Severity:
informational.** `src/view/paint.js:162` never invalidates, which the comment
justifies by `b.cfg` being frozen content. That is true today. Any later phase
that wants `dip` to vary by run, by band instance or through `eff()` has to
delete the memo, and the comment says so only indirectly.

### 3.4 Out of scope

Nothing. Four files, all four accounted for.

### 3.5 Claims I checked and confirmed

- `dip` is absent from `src/data/world.js:86` at HEAD, and no `dip:4` probe
  survives in the commit. The probe images sit in the scratchpad, not in the
  tree.
- Pixel neutrality is by construction at `dip:0`, because `skyBottomTy` returns
  `floorTy`, `y2 === y1`, and the guard `if (y2 > hz)` is false. The screenshot
  suite therefore proves nothing about this phase, exactly as the phase says.
  The 142 green tests confirm the neutrality claim and no more.
- The `159 failures over 200 seeds at dip:4` figure is exact. See §6.

---

## 4. The terracing question

My reading agrees with both of yours, and I would add one thing neither of you
named.

`cliff-face` reads as real landforms. The silhouette is hill, saddle, hill,
then a broad shelf, and it is legible as terrain at a glance. Set against the
pre-6c baseline, which is a flat ribbon of one-tile jitter running the full
width of the frame, the improvement is not marginal. The flanks are terraces,
and the soil cap makes them worse than bare geometry would, because every tread
gets its own grass line and every riser gets its own 8 px face of brown dirt.
The steps are therefore outlined rather than blended.

`surface-hills` reads as terraces first and hills second. The reason is
specific and it is not the 1-tile-per-column limit on its own. Out in the
landform the tread widths vary, because the summit cosine changes slope
continuously, and irregular treads read as a rough slope. Across the shelf
blend the slope is nearly constant by design, so the tread widths coincide and
you get four or five identical steps in a row on each side of spawn. The
smoothstep that 6c added to stop the linear ramp reading as stairs produces the
most regular staircase in the frame, because a constant-slope region is exactly
where tread widths agree. That is a narrow, fixable thing and it is worth
telling 6s.

The part neither of you flagged is the crown. Both summits in `cliff-face` come
to a literal one-tile point with a single step on each side, so they read as a
child's drawing of a mountain rather than as a hill. A raised cosine has zero
slope at its apex, so the true profile is rounded and the point is an artefact
of quantising a rounded crown at one tile per column. For "landform" legibility
I would rate the crown a bigger loss than the flank bevel, and it is the same
kind of fix — paint on the top corner, not geometry.

So 6s has three targets and only the first is the one the plan names. A
bevel/scree treatment on the outer corner of a riser is the flank fix. Breaking
the tread-width regularity across the blend, or widening the blend's
low-slope head, is the shelf fix. Softening the one-tile crown is the third.
`view/treatments.js#TREAT` reached from a `look:{}` row covers all three at zero
tile cost, per D7.

---

## 5. What a later phase must not undo

- **`stepPass`'s `else if (d < -1) d = -1`** (`src/rules/generate.js:569`) is
  the only unconditional guarantee that an outward rise never exceeds one tile.
  `HILL_SLOPE` makes the backstop rarely bind; it does not replace it. Removing
  the clamp because "the summits are already walkable" would reintroduce the
  wall at the rounding cases.
- **`LIP`'s `!ctx.off` gate** (`src/rules/generate.js:191`). The carve is
  correct for `astral` and wrong for any band with a height map.
- **The union in `excavated`** (`src/view/paint.js:195-196`). The `floorTy`
  term is now a `skyBottomTy` term, and it is not removable for the reason in
  §3.2. Anyone reaching for the "pure sky test" the 6c plan described has to
  add a `model` query first.
- **`__mf.frames(240)` at `tests/visual.spec.js:2813`.** It looks like padding.
  It is what makes `drawCam` agree with `cam` before a 16 px slot is clicked.
- **`floorTy:20` and the absence of `dip` on the relief row.** 6s spends the
  `dip`; the `floorTy` stays, per D9.

---

## 6. What I verified by running, and what by reading

### Ran

| command or probe | result |
|---|---|
| `npm run check` | 1063 checks, 0 violations; 89 files, 529 edges, 0 layer violations; `fillRect 1,344,909`; render purity and both determinism probes green. Matches 6c's report and 6r's `fillRect` figure exactly. |
| `npm run check:worldgen` | 200 seeds, 0 violations. Matches 6c's report. |
| `npm run lint` | exit 0, no output. |
| `npm run test:visual` | 142 passed in 18.7 s. Nothing on :5173 before the run, so it tested this tree. |
| Geometric walkability, seeds 1..200, `groundRow` skipping timber, outward direction from `spawnTx` | worst outward rise **1 tile**, zero pairs rising by more than 1. Confirms 6c's geometric claim. |
| Real player through `main.step` at 1/120 s, 12 seeds, trunks cleared, **no hop pressed** | 12 of 12 reach column 0 and column 127. Stronger than 6c's claim, which allowed the hop. |
| Same probe with trunks standing | 0 of 12. Under the pre-6c generator, also 0 of 12. Confirms the trunk blockage is pre-existing. |
| `docs/SPEC.md` §16 statistics, seeds 1..200 | direction changes 4–15 median 8 ✔; flat fraction 54–79% median 67% ✔; hilltop 6–10 rows ✔; steps over 1 tile 0–1 median 0 ✔; old generator 26–57 median 43 and 0.78 big steps per seed ✔. Two figures do not reproduce, D2 and D3. |
| `dip:4` in a scratchpad copy of HEAD, then `tools/worldgen-check.mjs` | **159 FAILURE(S) over 200 seeds**, every one of the form `RELIEF -- column N at row M is K tile(s) outside [floorTy-10, floorTy+1]`. Exactly 6r's figure. |
| `dip:4`, then `tools/check.mjs` | 1063 checks, 0 violations. Confirms the relief budget lives only in the worldgen tool. |
| Seed 1337 step profile, surface band | no step over 1 tile anywhere. This is D1. |
| Seed 1337 topsoil tx 94-114 / ty 118-132, new against old | granite gone from the window, hollow added. This is D5. |
| Ground-row range, seeds 1..200 | new 10..20, old 14..21. The `+1` slack in the relief assertion is dead. This is D4. |

Every probe above ran against `git archive HEAD` unpacked into the scratchpad,
so nothing in the working tree was modified. No `tools/serve.mjs` was listening
on :5173 or :5174 at any point.

One caveat on the tree state. A concurrent phase left an uncommitted edit to
`src/data/tuning.js` (`segUp` 11 to 26, `burdenSoft` 0.75 to 0.20) at 10:57,
which is after the visual suite finished at 10:45. Every figure quoted above
came either from before that edit or from the pristine `git archive HEAD` copy,
and I re-ran `check` and `lint` on the pristine copy to be sure. Neither
tunable touches worldgen or the sky, so it does not bear on these two phases.

### Read

- Both commit diffs in full, source and docs.
- `src/rules/generate.js#heightmap`, `#summits`, `#smooth`, `#stepPass`,
  `#octave`, and `KINDS.layer`'s lip gate.
- `src/view/paint.js#skyBottomTy`, `#excavated`, `#chunkCanvas`, `#paintTile`.
- `src/view/scene.js#drawSky`.
- `shell/main.js#updateCamera` and `__mf.frames`, to judge the test exception.
- `tools/worldgen-check.mjs` properties 5 and 6.
- Baselines `surface-hills`, `cliff-face` and `ore-against-pale-stone` at HEAD
  and at `8a4a47d^`, plus 6r's own `dip:4` probe images for the valley, the
  shaft and the hilltop tunnel. The valley at column 17 does change from a
  black band to sky, the shaft stays a lit hole, and the tunnel stays a cavity.
