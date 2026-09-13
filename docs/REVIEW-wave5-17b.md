# Review — Phase 17b (content: three rows per gift tier, and the grant roster)

Commit under review: `f2c3d1a`. Spec: `docs/PLAN-wave5-closeout.md` §5, §5.1,
§2 (D17-D, D17-E); `docs/AUDIT-wave5.md` §4.

## 1. Verdict

**PASS WITH FINDINGS**

Every line of the brief landed, no file outside the ownership block was
touched, the reachability assertion genuinely has the property D17-D demanded
(verified by reconstructing the red test), and the tile-byte arithmetic is
independently correct — but the new `transmute` branch and the new assertion
26 that is supposed to guard it leave two silent tile-corruption paths open to
the next content row, and one verification claim in `docs/FINDINGS.md` is
false.

Nothing here blocks Phase 17c.

## 2. Brief coverage

| brief line | verdict | where |
|---|---|---|
| §5.1 four substance rows appended, two `relic` two `miracle`, each with `item:{mass,hud:{order}}` and a `halo` | **done** | `src/data/substances.js:462,467,472,477` (orders 25–28; `halo` on all four; `pulse:0.1` at `:475` is a real `TREAT.halo` parameter, `src/view/treatments.js:93`) |
| §5.2 two trinket rows, keys resolving through `data/tuning.js`, at least one with a real cost | **done** | `src/data/trinkets.js:28` (`owl`, `sightRadius` ×1.5), `:46` (`girdle`, `burden` ×1.25 + `climb` ×0.8). All three keys exist: `data/tuning.js:110,132,30`. The audit's demand that the premise trade be named out loud is met in the row comment (`:36-45`), the row `text`, the commit body and `docs/SPEC.md:~470` |
| §5.3 two miracle rows, one needing no code, one adding **one** `kind` branch on an existing tile-write verb | **done** | `src/data/miracles.js:55` (`tide`, pure boon — confirmed `kind`-independent at `src/rules/miracles.js:68`), `:64` (`lodestone`). Exactly one new branch, `src/rules/miracles.js:57-61`, using `model/tiles.js#write.set` and adding one import (`solidAt`). No other behaviour in that file changed |
| §5.4 two grant rows for `talos_head` and `cyclops_maw` | **done** | `src/data/grants.js:27,31` |
| §5.5 delete `gift-kiln`; `kiln_divine` becomes the second exemption | **done** | removed from `src/data/grants.js`; exemption with its reason at `tools/content.mjs:1147-1163` |
| §5.6 export `mirrorOf` from `model/run.js`; `grant`/`award` grant the mirror | **done** | `src/model/run.js:395`; `src/rules/grants.js:26-30`, called at `:38` and `:83`. `write.grant` already dedupes (`src/model/run.js:304`), so the double call is safe |
| §5.7 `data/gods.js`, five rows, `view/hud.js` untouched | **done** | `src/data/gods.js:18-24`. `view/hud.js` is not in the diff. Ids in use == GODS, verified by enumeration |
| §5.8 decide and record `tribute-bellows`'s `chance` | **done** (kept at 1) | `src/data/drops.js:15-24` and `docs/SPEC.md:543-551`. SPEC's newly-added claim that `rules/cycles.js#rollTributeDrop` is live is true (`src/rules/cycles.js:241`) |
| §5.9 two `tools/content.mjs` assertions | **done** | 25 at `:1120`, 26 at `:1194` |
| §5 file ownership | **respected** | all 12 touched files are in the block; `src/model/run.js` is +7/−0 and is the `mirrorOf` export and its comment, nothing else |

### The five things this phase could specifically get wrong

**1. The reachability assertion's property — CORRECT, and verified by
reconstruction.** I copied `src/` and `tools/` to a scratch tree, restored
`gift-kiln` verbatim, and ran `checkContent`. Result:

```
FAIL machine "kiln_divine": something grants it, but machineHeldSub() is
undefined -- ... A grant of an unplaceable machine is a tier that does
nothing: give it a substance row and a recipe, or retire the grant
FAIL content lint: 835 checks, 1 violation(s)
```

Exactly one violation, on exactly the placeability half, which is what the
commit body claims. The weaker "named by a grant" form would indeed have
passed `kiln_divine` green — it is named by the restored row. The sponsorship
half is also live, not vacuous: deleting `gift-talos` in the same scratch tree
produces two failures (`talos_head`, `talos_head_l`), so the mirror expansion
at `tools/content.mjs:1145` is doing real work. Both exemptions are from the
first half only, the second half has no exemption path, and the staleness
guard at `:1183-1186` fires if an exempt row ever becomes both sponsored and
placeable.

**2. Append safety — CORRECT, and the header arithmetic is right, not merely
changed.** Executed against the real modules: `SUB.length` 27, `FORM.length`
13, `STRIDE` 14, `PACKABLE_MAX` **8 (`adamant`) — unmoved**, guard value
`1 + 8*14 + 13 = 126` of 255, `PACKABLE_LIMIT` `((255-2-13)/14)|0 = 17`, and an
appended packable row would price `1 + 27*14 + 13 = 392`. Every figure in the
rewritten `src/data/substances.js:96-97` and in the `docs/SPEC.md` §15 table
matches. The two derived claims also check out: SPEC's "two more forms would
take it to 144 and 14" (`1+8*16+15 = 144`; `((255-2-15)/16)|0 = 14`), and the
ordinal list "9–17 are `auger`, `chasm`, `furnace`, `press`, `belt_r`,
`brazier`, `hearth`, `talos_head`, `cyclops_maw`" is the actual declaration
order. The "already stale" claim is also true: `docs/SPEC.md` §22.2 (line
~2220) already carried 13 / 14 / 17 / 126 while §15 still said 12 / 13 / 18 /
117, so §15 was the drifted copy and the commit aligned it to §22.

**3. The girdle's balance claim — TRUE in the metric the commit names, and not
in two others. Not a defect; state it so nobody "fixes" the pair.**
`burdenFrac()` (`src/model/run.js:520`) is `burdenOf() / eff('burden')`, and
the falloff at `src/rules/player.js:119-121` is `lerp(1, floor, (frac-soft)/(1-soft))`
— a function of the **fraction only**. Climb throughput is therefore
`frac × cap × climb × mult(frac)`, and since `50 × 24 = 1200 = 40 × 30`, the
girdle is exactly neutral at *every* fraction, not only at the extremes. The
commit's framing (50 T at 24 px/s == 40 T at 30 px/s) is the matched-fraction
comparison and it is right. Three things it does not say:

- At the same **absolute** load the girdle is worse below ≈31 T (30 T: 900 vs
  720 talent·px/s) and better between ≈32 T and 40 T. An empty-handed player
  wearing it climbs 20% slower for nothing.
- `climb` scales the **descending** half of the ladder too
  (`src/rules/player.js:107-111` uses the same `laddSpeed`), so ladder descent
  is also 20% slower. An extra cost, in the right direction.
- Per **round trip** the girdle is a net gain: climb seconds per talent are
  flat, but the fixed overhead (the fall, the walk, the mining) amortises over
  25% more cargo. That is exactly the "fewer trips" the commit and SPEC name,
  and D4 permits it as a stated trade — but "premise-neutral" is true of the
  climb, not of the run.

The hard-cap lockout also moves from 40 T to 50 T, and the pickup refusal with
it (`src/rules/items.js:124`). Both read the modded `eff('burden')`, so cap,
bar (`view/hud.js:205`) and refusal cannot disagree.

**4. One new branch, existing verb, `tide` needs no code — ALL THREE
CONFIRMED.** `src/rules/miracles.js` gains exactly one `if (e.kind ===
'transmute')` block and one import. `applyEffect`'s boon clause (`:68`) is
outside every `kind` branch, so `tide` is pure content. The `transmute` guard
cannot write into air (`solidOf` is false for `AIR`, and `tileAt` returns
`AIR` for `ty < 0`) and cannot write across a band boundary: `solidAt` returns
*true* out of bounds (`tileAt` → `BEDROCK`, which is solid), but
`write.set`/`write.setByte` both bail on `!inBounds` (`src/model/tiles.js:136,143`),
and `BEDROCK` is never written in-bounds — it is only the out-of-range
sentinel. `rung` and `stair` are `solid:false`, so a placed ladder is never
transmuted. Placed `block` (`solid:true`) is. See defect 1 for what the guard
does *not* cover.

**5. `mirrorOf` is the only export — CONFIRMED.** `git diff --numstat` on
`src/model/run.js` is `7 0`, and the seven lines are the doc comment and the
one-line arrow export at `:389-395`.

## 3. Out of scope

| change | `file:line` | verdict |
|---|---|---|
| `godName` helper, exported and imported by nothing | `src/data/gods.js:31` | harmless; forward-looking for 17c/17e, which the plan schedules |
| `GOD` frozen index, likewise unused | `src/data/gods.js:27` | harmless, same reason |
| Assertion 26 checks `effect.radius` is a whole non-negative number — not asked for | `tools/content.mjs:1224-1228` | harmless and useful; it is live (verified red on `radius:1.5`) |
| Assertion 26 checks `effect.sub` resolves — not asked for | `tools/content.mjs:1219-1222` | harmless; live (verified red) |
| `docs/SPEC.md` §14's `tribute-bellows`-is-live paragraph | `docs/SPEC.md:536-541` | in scope by §5.8's "SPEC owns it first"; the correction is factually right |
| `docs/SPEC.md` §18.6 draft paragraph rewrite | `docs/SPEC.md:~1613` | arguably 17c's or 17h's, but it corrects a statement this phase falsified. Harmless |

Nothing was touched outside the ownership block. No `src/view/`, no
`shell/`, no baselines, no `package.json`.

## 4. Defects

### D1 — MEDIUM. A future `transmute` row can clear rock to air or conjure a stair, and assertion 26 will not stop it
`src/rules/miracles.js:57-61`; `tools/content.mjs:1204-1229`.

The branch's own comment promises it "can neither wall the player in nor
conjure a step under their feet". Two content shapes break that promise and
pass the build:

- **`effect:{ kind:'transmute', radius:1 }` with no `sub`.** `S[undefined]` is
  `undefined`; `write.set(b,tx,ty,undefined)` takes the `sub < 0 ? AIR : ...`
  branch false (`undefined < 0` is `false`), so it calls
  `packTile(undefined, NATIVE)` = `NaN`; `setByte`'s `b.mat[i] === byte` is
  false for `NaN`, and the `Uint8Array` store coerces `NaN` to **0 = AIR**.
  The miracle clears a 3×3 of solid rock — the exact "step upward" it says it
  cannot make. Verified: `packTile(undefined, NATIVE)` returns `NaN`, and
  `new Uint8Array(1)[0] = NaN` reads back `0`.
  Assertion 26 only validates `e.sub` `if (e.sub !== undefined)`; it never
  requires one for a `transmute`.
- **`effect:{ kind:'transmute', sub:<any non-packable row> }`,** i.e. any
  `relic`, `miracle` or `machine` substance. `sub:'lodestone'` is ordinal 26;
  `packTile(26, NATIVE)` = 365, which the `Uint8Array` truncates to **109** —
  decoding as `subOfTile(109) = 7` (granite) in `formOfTile(109) = 9`
  (`stair`), a **climbable** tile nobody placed. Assertion 26 checks that
  `S[e.sub]` resolves, not that it is `packable()`.

Wider than the row: `src/data/forms.js:414-425` narrows `PACKABLE_MAX` on the
stated basis that "Only two things ever reach `packTile`" — native worldgen,
and a form-crossing `rules/placement.js#placeTile` has already validated.
`transmute` is a third caller and is subject to neither constraint. `forms.js`
was outside this phase's ownership, but `tools/content.mjs` was not, and
`docs/FINDINGS.md` was not; neither records it.

Not reachable today: `sub:'copper'` is ordinal 0 and packable, and the shipped
row has both a `sub` and a `radius`. This is a defect in the guard, not in the
shipped content.

### D2 — LOW/MEDIUM. `docs/SPEC.md` states a behavioural property of `lodestone` that is not quite true
`docs/SPEC.md:~500` ("it pays in mining walked-to rather than in free ore");
same claim at `src/data/miracles.js:60-63` and in the commit body.

`copper.tile.charge` is 4 (`src/data/substances.js:118`), so a radius-1
`transmute` converts up to 9 tiles into **36 copper ore**, from ordinary soil
or stone, at whatever depth the player is standing — including 0 M. Cycle 1's
whole demand is 10 raw copper. What is true is that the ore still costs 9 ×
4 × 0.95 s ≈ 34 s of mining; what is not true is that no ore is created. The
loop is also closed: `recipes.js#pack` turns 5 mining spoil into 1
`block` (`solid:true`), which `transmute` will convert, so spoil → copper is a
repeatable conversion given phials.

This is a design call, not a mechanical failure, and the phial is one-shot and
drafted — but SPEC wins, and SPEC currently asserts a property the code does
not have. Either the sentence or the number should move.

### D3 — LOW. A verification claim in `docs/FINDINGS.md` is false
`docs/FINDINGS.md`, the "one thing worth stating rather than parking"
paragraph: "the only thing exercising the module is `tools/check.mjs`'s
'import every module' pass".

It does not. `tools/check.mjs:94-108` is a hand-written literal list of
`await import(...)` calls and `src/data/gods.js` is not in it. `tools/layers.mjs`
reads every file as **text** (`readFile` at `:10`, `readdir` at `:49`) and
never executes one, so its "84 files" count includes `gods.js` without running
it. esbuild drops an unimported module from the bundle. Net: `src/data/gods.js`
is executed by nothing in `npm run check`, `npm run build`, `npm run parity`
or the visual suite. Only `oxlint` parses it, which catches a syntax error and
not a runtime throw.

CLAUDE.md records this precise failure mode ("`check.mjs` now imports every
module for exactly this reason"). The module as written is trivially safe, so
the cost today is the false claim; the risk is 17e discovering a throw.

### D4 — LOW. No assertion binds `god:` ids to `GODS`
`src/data/gods.js:18`; `tools/content.mjs` has no `god`-field check.

The sets match today — I enumerated `BOONS`/`TRINKETS`/`MIRACLES`/`GRANTS`/
`CYCLES` and got exactly `hephaestus, athena, poseidon, ares, hades`. But
nothing fails the build if a future row names `hermes`, and `godName`
(`src/data/gods.js:31`) silently falls back to the uppercased id, so the drift
would surface as a HUD label rather than as an error. The table was added
specifically because two ids in use could not be named; an assertion that the
two sets are equal is the thing that keeps that true. This phase owned
`tools/content.mjs` and shipped two assertions; this was the cheap third.

### D5 — LOW. One tile-byte figure in SPEC is still stale
`docs/SPEC.md:330-332` (§12): "adding the `auger` relic substance is the 10th
substance row, dropping headroom from 14 to 13 substances still allowed before
the tile-id byte overflows".

Under the narrowed guard that figure is meaningless: `auger` is not packable,
so it cost the guard nothing, and the live headroom is
`PACKABLE_LIMIT − PACKABLE_MAX` = 17 − 8 = **9** by the packable measure and
**0** appendable for a tile-capable row. §15 and §22 now agree with each other
and with the code; §12 is the one copy left disagreeing, and `docs/SPEC.md`
was in the ownership block.

### Style notes (no failure I can describe)

- `tide` and `lodestone` carry no `short`, while `owl` and `girdle` do. This
  matches the existing `chasm` row, and `view/ui/mainPanel.js:88` slices to two
  characters regardless, so nothing overflows — but 'LODESTONE OF THE FORGE'
  is the longest `name` in the table and `view/hud.js:434`'s `b.short || b.name`
  will print it whole. 17c draws these names in cards at the 200 px floor.
- `tide` is the only one of the four new rows to set `pulse`; the other three
  take the 0.08 default. Deliberate or not, it is invisible in any baseline
  because none of the four appears in a scene.

## 5. Verification

Run by me, on `f2c3d1a` with a clean tree (`git status` shows only the
pre-existing untracked `.claude/agents/*`, `docs/AUDIT-wave5.md`,
`docs/PLAN-wave5-closeout.md`, `docs/STYLE.md`):

```
npm run check
  0.  layer direction      ok   84 files, 478 edges, 0 violations
  1b. content lint         ok   833 checks, 0 violations
  ...
  All checks passed.

npm run lint
  (oxlint src tools tests — no output, exit 0)

npm run test:visual
  115 passed (16.4s)
```

The phase reported 833 checks / 0 violations, 84 files / 478 edges / 0
violations, 115 visual tests passed, no baselines re-accepted. **All four
match exactly.** No file under `tests/visual.spec.js-snapshots/` is in the
commit, so the no-re-acceptance claim is true.

The commit's own claim — "Verified by restoring `gift-kiln` locally and
watching assertion 25 go red on exactly that" — I reproduced independently in
a scratch copy and it is accurate down to the message: 835 checks, 1
violation, on the placeability half. I additionally proved assertion 25's
sponsorship half and all four of assertion 26's sub-checks go red on
constructed bad input, so neither new assertion is vacuous.

## 6. What a later phase must not undo

- **The two exemptions in `tools/content.mjs:1147-1163` are from the
  sponsorship half only.** The `if (isSponsored)` gate at `:1176` is what
  makes the second half unexemptable. Moving the `machineHeldSub` check
  inside the `!exempt` branch, or "simplifying" the two-map into an id list,
  destroys the exact property D17-D was written to get and the assertion goes
  green over `gift-kiln` again.
- **`girdle`'s `1.25` and `0.8` are a matched pair, not two numbers.** Their
  product must stay `1.0` against `burden` 40 × `climb` 30 = 1200, or the
  trinket stops being premise-neutral on the climb. Retuning one without the
  other is a silent change to "up is expensive".
- **`grantPair` calls `rw.grant` twice on purpose** (`src/rules/grants.js:26-30`).
  `write.grant` dedupes, and `STARTING_MACHINES`'s explicit `belt_l` entry
  (`src/data/grants.js:54`) is deliberately *not* removed even though
  `grantPair('belt_r')` would now cover it — D17-E says that table is left
  alone.
- **`kiln_divine`'s machine row is kept as documentation, not as content.**
  Four live references depend on it (`rate.kiln_divine` in CLAUDE.md,
  `data/machines.js`'s `variantOf` worked example, `DEVELOPER_GUIDE.md`,
  `shell/notify.js`). A later agent tidying "dead content" would break all
  four and the reasoning lives only at the exemption site and in SPEC §14.
- **`src/data/gods.js` has no importer by design** (17c and 17e are its
  readers). Do not delete it as dead — but see defect D3: it also has no
  execution coverage until then.
- **`transmute` checks `solidAt` before `write.set`.** That test, not
  `write.set`'s own bounds check, is what stops the miracle from creating
  floor. Removing it as "redundant with `write.set`" turns the branch into a
  terrain generator.
