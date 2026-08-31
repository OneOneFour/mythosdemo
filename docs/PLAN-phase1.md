# Phase 1 plan — extend the registry

Planning-only output per `docs/BUILD_PLAN.md` Phase 1. No `src/` or `tools/`
file has been touched. This is the exact row list, the tile-byte headroom
arithmetic, and the exact `tools/content.mjs` assertion list, for review
before editing.

---

## 0. Tile-byte headroom arithmetic

Guard, verbatim from `src/data/forms.js:128-129`:

```
if (1 + (SUB.length - 1) * STRIDE + FORM.length >= BEDROCK) throw ...
STRIDE = FORM.length + 1
BEDROCK = 255
```

**Today:** `FORM.length = 6` (ore, gravel, ingot, log, relic, plate) →
`STRIDE = 7`. `SUB.length = 7` (copper, tin, timber, stone, bellows, pick,
soil). Max byte in use today: `1 + 6*7 + 6 = 49`. Max substances the current
`STRIDE=7` could ever hold before the guard fires: solve
`1 + (n-1)*7 + 6 < 255` → `n ≤ 36`. Headroom today: `36 - 7 = 29` substances.

**After Phase 1 adds 2 forms** (`brand`, `phial`): `FORM.length = 8` →
`STRIDE = 9`. Solve `1 + (n-1)*9 + 8 < 255` → `(n-1)*9 < 246` → `n-1 ≤ 27`
(27×9=243<246; 28×9=252≥246 fails) → **`n ≤ 28` substances, max, ever, once
these two forms exist.**

**After Phase 1 also adds 2 substances** (`granite`, `adamant`):
`SUB.length = 9`. Max byte in use: `1 + 8*9 + 8 = 81` (well under 255, guard
does not fire). **New headroom: `28 - 9 = 19` substances** may still be added
before the tile byte overflows, versus 29 before this phase. Adding 2 forms
cost 10 substances of headroom (36→28 before any new substance rows); adding
the 2 new substances then spent 2 of what remained.

I will run `npm run check` after editing to confirm this arithmetic against
the live guard (it throws at import if wrong, so a mistake here fails loud,
not silently).

---

## 1. New forms — exact rows, appended to `FORMS` in `src/data/forms.js`

Appended after the existing `plate` row (index 5), so `brand` is index 6 and
`phial` is index 7. `hudOrder` continues the existing sequence (6 is already
used by `plate`).

```js
  /* ---- brand: the carried light, and the first form whose substance is not
     metal. A hollow fennel stalk carrying stolen fire (Prometheus) -- held
     and burned down over `eff('brandSecs')`, never placed, so it carries no
     `tile` block. `subTags:['organic']` is the same restriction `log`
     already uses, which is why timber is the only substance that can take
     it today. Lighter than a log: a brand is a stripped stick, not a whole
     trunk. */
  { id:'brand', label:'BRAND',
    size:3, massK:0.5, hudOrder:7,
    tags:['fuel', 'light'],
    subTags:['organic'] },

  /* ---- phial: the one form a miracle may take (docs/CLAUDE.md D1). Kept
     separate from `relic` on purpose: `crossable()`'s whole mechanism is the
     `subTags` gate, and folding a miracle into `relic` would let it satisfy
     any trinket selector that reads `#relic` by accident. `subTags:
     ['miracle']` means only a miracle-tagged substance (one row per miracle,
     added in Phase 4) may ever cross into it. No `tile` block: a miracle is
     a held one-shot, never terrain. */
  { id:'phial', label:'PHIAL',
    size:3, massK:0.2, hudOrder:8,
    tags:['miracle'],
    subTags:['miracle'] }
```

Notes on values not dictated by the task, so the reviewer can push back:
- `size:3` for both, matching `gravel`'s size (a small held object, not a
  full-tile block like `ore`/`ingot`/`log`/`plate`/`relic` at `size:4`).
- `phial` `massK:0.2` — lighter than everything else in the table (a vial,
  not a chunk); no source dictates this number since no miracle content
  exists yet. Flagged for `docs/FINDINGS.md` if Phase 4 wants a different
  figure once real miracles are written.

---

## 2. New substances — exact rows, appended to `SUBSTANCES` in `src/data/substances.js`

Appended after `soil` (index 6), so `granite` is index 7 and `adamant` is
index 8. `hud.order` continues the sequence (7 is used by `soil`).

```js
  /* ---- granite: the first ROCK harder than stone, for the deep strata pick
     tiers Phase 2c gates against. `tile.tier:2` is the NEW optional key this
     phase adds to the header block below -- absent means tier 1, so every
     existing substance (copper, tin, timber, stone, soil) is unaffected.
     Mines to `gravel`, same as stone and soil, so no new rubble form is
     needed for it. */
  { id:'granite', name:'GRANITE', tags:['rock', 'mineable'],
    tile:{ solid:true, hard:2.4, drops:'gravel', tier:2 },
    item:{ mass:0.9, hud:{ order:8 } },
    look:{ base:'graniteB', hi:'graniteA', lo:'graniteD',
           item:['graniteA', 'graniteC'],
           treatments:[ { fn:'banded', col:'graniteD', every:8 } ] } },

  /* ---- adamant: the hardest rock in the game, tier 3. The first ROCK
     substance also tagged `metal` -- `tags` carries both `rock` (mines like
     stone/granite, to `gravel`, per `tile.drops` below) and `metal`
     (`crossable()` will let a future ore/ingot/plate form cross into it once
     a smelt path is designed for that; nothing in THIS phase adds that
     recipe, and mining it still only ever yields gravel). `tile.tier:3`
     gates it behind Phase 2c's auger/Talos-head tools -- a bronze pickaxe
     cannot scratch it. */
  { id:'adamant', name:'ADAMANT', tags:['rock', 'metal', 'mineable'],
    tile:{ solid:true, hard:5.0, drops:'gravel', tier:3 },
    item:{ mass:1.4, hud:{ order:9 } },
    look:{ base:'adamantB', hi:'adamantA', lo:'adamantD',
           item:['adamantA', 'adamantC'],
           treatments:[ { fn:'glint', col:'adamantA', n:2 } ] } }
```

**Header-comment addition**, beside the existing `hard` / `drops` bullets in
`src/data/substances.js`'s top block:

```
     tile.tier -> OPTIONAL. Absent means tier 1. A SEPARATE gate from `hard`:
                  `hard` decides how long a legal swing against this
                  substance takes; `tier` decides whether a swing is legal at
                  all, checked against the held tool's tier in
                  rules/mining.js (Phase 2c). Monotonic against `hard` by
                  convention and by `tools/content.mjs`'s check: nothing at a
                  higher tier may be softer than something at a lower one.
```

**`granite`/`adamant` are tier 2/3 and `hard` 2.4/5.0, both above stone's
1.60 (tier 1, implicit) and soil's 0.50** — satisfies the monotonic check by
construction; I will still run the lint (section 5) to prove it rather than
eyeball it.

---

## 3. New tunables — exact rows, appended to `TUNABLES` in `src/data/tuning.js`

```js
  /* ---- encumbrance (CLAUDE.md "Resolved decisions" D3/D4). Mass is in
     TALENTS. `burden` is the hard cap; `burdenSoft` is the fraction of it
     where climb speed begins to fall off; `burdenClimbFloor` is the climb
     multiplier AT the hard cap, the tick before ladder-up/hop are refused
     outright. Walking on level ground and every downward movement are never
     scaled by any of these three -- enforced in rules/player.js, Phase 2a. */
  { id:'burden',           kind:'value', base:40,   unit:'talents', note:'hard carry cap; a pickup or a climb over this is refused' },
  { id:'burdenSoft',       kind:'value', base:0.75, unit:'x',       note:'fraction of burden where climb-speed falloff starts' },
  { id:'burdenClimbFloor', kind:'value', base:0.40, unit:'x',       note:'climb-speed multiplier at the hard cap, the tick before lockout' },

  /* ---- trinkets (D1). run.equipped is a fixed-length SELECTION over
     run.inv, not a second inventory -- see CLAUDE.md D1 and
     rules/trinkets.js's header on why run.trinkets was deleted. */
  { id:'trinketSlots', kind:'value', base:3, unit:'slots', note:'length of run.equipped; a boon could someday widen it' },

  /* ---- light (Phase 2b). `lightMax` is both daylight and the ceiling any
     emitter can reach (the hearth). The two falloffs are per-tile-of-travel
     losses a BFS in rules/light.js subtracts, rock lossier than air so
     light does not leak through strata the way sight already does not. */
  { id:'lightMax',         kind:'value', base:15, unit:'levels', note:'daylight level, and the ceiling any emitter can reach' },
  { id:'lightFalloffAir',  kind:'value', base:1,  unit:'levels', note:'lost per tile of open air the light BFS crosses' },
  { id:'lightFalloffRock', kind:'value', base:3,  unit:'levels', note:'lost per tile of solid rock the light BFS crosses' },
  { id:'brandSecs',        kind:'value', base:90, unit:'s',      note:'one lit timber/brand burns this long, then is consumed' },

  /* ---- tool tiers (Phase 2c). `hard` already scales a substance's
     seconds-to-break; this is a SEPARATE gate on whether a tool may swing at
     a tile at all, scoped the same way (`toolTier.copper` narrows to one
     substance) so a boon can lend a tier without touching mining speed. */
  { id:'toolTier', kind:'scale', base:1.0, scope:'substance',
    note:'bends tile.tier gating in rules/mining.js; a boon could lend a tier' },

  /* ---- toss velocity (Phase 1 row, Phase 2a reader). Four existing
     falling-item call sites (rules/mining.js, rules/trinkets.js,
     rules/crafting.js, rules/machines.js) each hardcode a DIFFERENT toss
     magnitude -- docs/FINDINGS.md's toss-velocity finding. These two rows
     exist so the new drop verb (Phase 2a) does not become a fifth
     independently-chosen number. The four existing sites are deliberately
     left as-is this phase; only the new drop verb reads these. */
  { id:'tossUp',     kind:'value', base:50, unit:'px/s', note:'upward toss on a newly dropped item; drop verb only, see docs/FINDINGS.md' },
  { id:'tossSpread', kind:'value', base:12, unit:'px/s', note:'horizontal scatter on the same drop' }
```

---

## 4. New recipe — exact row, appended to `RECIPES` in `src/data/recipes.js`

```js
  /* ---- kindle: timber/log -> timber/brand. THE FIRST RECIPE WHOSE OUTPUT
     FORM IS NOT A COMPRESSION TIER -- smelt and press both compress toward
     density; kindling does the opposite, one log splitting into three
     lighter, burnable brands. hand:true because no machine performs it;
     Phase 2b plants the player's first brand near spawn regardless, and this
     recipe is how they restock once it burns out. */
  kindle: Object.freeze({
    id:'kindle', name:'KINDLE',
    in:{ 'timber/log':1 },
    out:[ { sub:'timber', form:'brand', n:3 } ],
    secs:1.5,
    hand:true
  })
```

`HAND_RECIPES` picks this up automatically (it filters `Object.values(RECIPES)`
for `hand`), so no separate registration is needed.

---

## 5. `src/data/world.js` — placing granite and adamant (strata only)

Appended to the `topsoil` band's `strata` array (the deep band; `astral` and
`surface` are untouched). Depths chosen so granite starts below the existing
copper/tin bands and adamant deeper still, so the tier gate has somewhere
meaningful to bite once Phase 2c exists:

```js
      { kind:'blobs', sub:'granite', fromTy:120, toTy:320, count:40, r:[1.4, 3.0] },
      { kind:'blobs', sub:'adamant', fromTy:220, toTy:320, count:20, r:[1.2, 2.4] }
```

(`topsoil` is `th:320`, so both ranges stay in-band. `count`/`r` chosen by
analogy with the existing `tin` blob row — same kind, roughly half the count
of tin for granite since it should read as "uncommon," and half again for
adamant since it should read as "rare.")

---

## 6. Palette additions — `src/core/palette.js` (hex) and no change needed to `src/data/palette.js`

`src/data/palette.js` re-exports `P` verbatim (`COL = {...P}`), so new names
only need adding to `core/palette.js`; nothing else changes in the data
palette file.

```js
  graniteA:'#d8d6dc', graniteB:'#b3b0ba', graniteC:'#8b8792', graniteD:'#5a5760',
  adamantA:'#8fe3d9', adamantB:'#2b4a52', adamantC:'#1c3238', adamantD:'#0f1c1f',
```

Granite: a cool light grey family, distinct from `ir*` (iron-grey, warmer/
darker) so the two rocks read apart at a glance. Adamant: a dark teal-black
with a pale cyan glint highlight, consistent with the `glint` treatment
already used on `copper` (`veinA`) and `tin` (`snA`) — reads as "worked/
magical metal-rock" rather than plain stone.

---

## 7. `docs/SPEC.md` — new locked-numbers section

Appended as a new `## 9.` section, after the existing `## 8. Compression
ratios`:

```markdown
## 9. Encumbrance, light and tool tiers

Locked with Phase 1 of `docs/BUILD_PLAN.md`. `CLAUDE.md` §"Resolved
decisions" D3/D4 is the reasoning; this is the numbers.

| tunable | value | unit | meaning |
|---|---|---|---|
| `burden` | 40 | talents | hard carry cap |
| `burdenSoft` | 0.75 | x | fraction of `burden` where climb falloff starts |
| `burdenClimbFloor` | 0.40 | x | climb-speed multiplier at the hard cap |
| `trinketSlots` | 3 | slots | length of `run.equipped` |
| `lightMax` | 15 | levels | daylight, and the ceiling any emitter can reach |
| `lightFalloffAir` | 1 | levels | lost per tile of open air the light BFS crosses |
| `lightFalloffRock` | 3 | levels | lost per tile of solid rock the light BFS crosses |
| `brandSecs` | 90 | s | one lit `timber/brand` burns this long |
| `toolTier` | 1.0 | x, scoped `substance` | bends `tile.tier` gating |
| `tossUp` | 50 | px/s | upward toss on a newly dropped item (drop verb only) |
| `tossSpread` | 12 | px/s | horizontal scatter on the same drop |

New substance tiers (`tile.tier`, absent = 1): `granite` tier 2 (hard 2.4s),
`adamant` tier 3 (hard 5.0s). Monotonic against `hard` — nothing at a higher
tier is softer than something at a lower one — and `tools/content.mjs`
asserts it.
```

---

## 8. `tools/content.mjs` — exact assertion list

New file, exported the way `tools/layers.mjs` exports `checkLayers({quiet})`:
`export async function checkContent({ quiet = false } = {}) { … return { checks, violations } }`, plus the same
`if (import.meta.url === \`file://${process.argv[1]}\`)` standalone-run guard
`layers.mjs` uses, exiting 1 on any violation. Imports from `src/data/*` and
`src/model/items.js` only (tools/ is outside the layer graph `layers.mjs`
scans — it only walks `src/`).

Wired in as **section 1b** of `tools/check.mjs`, between the existing
"1. content resolves" and "2. rendering is pure" sections, and as a new
`package.json` script: `"check:content": "node tools/content.mjs"`.

Exact assertions:

1. **Every recipe selector expands.** For every row in `RECIPES` and every
   machine's `recipesOf(def)` result, for every key in `in`/`out` that is
   *not* under a `from:` source clause (named-unit rows, e.g. the lift's
   `heart`, are exempt — they are not substance×form pairs), assert
   `expand(sel).length > 0` using `data/forms.js#expand` directly — no
   hand-rolled string check, per `CLAUDE.md`'s own recorded mistake.

2. **Mass/massK finiteness.** For every `SUBSTANCES` row with an `item`
   block, assert `Number.isFinite(item.mass) && item.mass > 0`. For every
   `FORMS` row, assert `Number.isFinite(massK) && massK > 0`.

3. **Machine cost keys parse to real holdable pairs.** For every `MACH` row
   with a `cost` block, for every key (`'sub/form'`), split it, resolve
   `S[sub]`/`F[form]`, assert both are defined and
   `model/items.js#holdable(sub, form)` is true.

4. **Machine cost keys are reachable — mined or produced.** For each cost
   pair, assert *either* some substance's `tile.drops` equals that pair's
   form and that pair's substance has that `tile` block (mined directly),
   *or* some recipe's `out` clause can produce it (a literal `{sub, form}`
   match, or a `{subFrom, form}` clause whose `subFrom` selector's `expand()`
   includes that substance).

5. **No orphans — full reachability graph.** Build the reachable set by
   fixpoint: seed it with every `{sub, form}` pair where `form === tile.drops`
   for a substance with a `tile` block (raw, mined pairs). Repeat scanning
   every recipe (named `RECIPES` rows and every machine's inline rows): a
   recipe fires if, for every non-`from` `in` selector, at least one member of
   that selector's `expand()` is already in the reachable set; when it fires,
   add its `out` pairs (literal, or `subFrom` resolved to the specific
   substance(s) that satisfied the matching `in` selector) to the reachable
   set. Iterate to a fixpoint (bounded by table size, so this terminates).
   Assert every pair for which `holdable(sub, form)` is true is in the
   reachable set — an orphan is a pair nothing can ever legally hold via any
   in-game path.

6. **No recipe manufactures mass**, unless tagged `transmute`. For every
   recipe (named + inline), enumerate every concrete substance assignment
   that satisfies its selectors simultaneously (the cartesian product of each
   distinct selector's `expand()`, small because the content table is small),
   skipping `from:`-sourced clauses (not mass-bearing items). For each
   assignment compute `Σ n × massOfPair(sub, form)` on the input side and the
   same on the output side (literal `sub` clauses use their fixed substance;
   `subFrom` clauses use the assignment's chosen substance), using
   `model/items.js#massOfPair` — **the comment states explicitly that this
   mirrors that function rather than reimplementing the formula**, and one
   known pair (`copper/ingot`: `SUB.copper.item.mass(1.0) × FORM.ingot.massK
   (1.6) = 1.6`) is asserted equal to `massOfPair(S.copper, F.ingot)` directly,
   to prove the two agree. Assert output mass ≤ input mass for every
   assignment of every non-`transmute` recipe.

7. **`hand:true` recipes are object-identical to what a machine names.** For
   every `RECIPES` row with `hand:true`, for every machine whose raw
   `recipes` array names that row's id as a string, assert
   `recipesOf(machineDef).find(...) === RECIPES[thatId]` by reference
   (`===`, not deep-equal) — this is guaranteed today because `recipesOf`
   looks the string up in the same frozen `RECIPES` table, so the assertion
   is proving that guarantee rather than re-deriving it, and the failure
   message says so explicitly if it ever stops holding.

8. **Every tunable key named by a `data/` modifier row resolves, scope
   included.** For every `mods`/`mod` entry on `data/trinkets.js` rows (and
   `data/boons.js` rows, once Phase 4 adds mod-bearing ones — the loop is
   written generically over "any data row with a `mods` array" so it needs no
   edit then), split the key on the first `.`; assert the base is a key of
   `TUNE`; if a scope segment follows the dot, assert it resolves against
   `TUNE[base].scope` — `S[scope] !== undefined` for `scope:'substance'`,
   `M[scope] !== undefined` for `scope:'machine'`. This is strictly more than
   `tools/check.mjs`'s existing trinket-tunable check, which today verifies
   only the base name and not the scope.

9. **`tile.tier` is monotonic against `hard`.** For every pair of
   `SUBSTANCES` rows `X`, `Y` with a `tile` block, where `tier(X) < tier(Y)`
   (`tier` defaulting to 1 when absent), assert `tile.hard(X) ≤ tile.hard(Y)`
   — nothing at a higher tier may be softer than something at a lower one.

**Proving the lint can fail**, per the Phase 1 acceptance criterion: I will
temporarily point `kindle`'s `in` at a nonexistent tag (e.g. `'timber/
#nonexistent':1`), confirm `npm run check:content` fails on assertion 1 with
a clear message, then revert before committing.

---

## Acceptance self-check (once approved and implemented)

- `npm run check` passes, section 0 stays at 0 violations, and the new
  section 1b (content lint) passes.
- `npm run check:content` runs standalone and passes.
- `npm run test:visual` passes with **no** snapshot updates — nothing placed
  or renders the new content yet (no machine, no strata visible without
  digging to the new depths, and even then it is unremarkable new rock until
  a human plays there).
- The tile-byte headroom figure above (**19 substances remaining** after this
  phase, down from 29 before it) is confirmed by `npm run check` not
  throwing at import.

Waiting for approval before editing any file in the FILE OWNERSHIP block.

---

## Post-approval addendum — what shipped differently, and why

Approved as written above, with one correction to assertion 5 (scope it to
DECLARED pairs — a recipe's concrete output, or a machine cost key — not the
full `crossable()` cartesian space; see `docs/BUILD_PLAN.md` Phase 1 section 5
and `docs/FINDINGS.md`'s Phase 1 entry). Implemented as approved, with two
numbers that changed during implementation because testing caught something
this planning pass did not:

1. **`brand`'s `massK` is 0.3, not ~0.5.** `tools/content.mjs`'s own
   mass-conservation assertion caught a real problem at 0.5: `kindle` turns
   one `timber/log` (massK 1.0) into three `timber/brand`, so 3 x 0.5 = 1.5
   would net MORE mass than the log it came from. 0.3 keeps the total (0.9)
   at or under the log's 1.0. See `docs/FINDINGS.md`.

2. **`tests/visual.spec.js-snapshots/digging-desktop-darwin.png` and
   `map-desktop-darwin.png` were re-accepted** via `npm run
   test:visual:update`. `map.png` legitimately shows the new deep rock once
   the whole world is revealed — that is the test's purpose. `digging.png`
   moved by ~20 px for an unrelated reason: worldgen's `rand()` stream is
   shared and ordered across all bands, so adding 60 blob placements to
   `topsoil` shifts every downstream `rand()` draw, including the toss
   scatter on the very first item the (unrelated, shallow, SURFACE-band)
   dig test mines. Confirmed by reverting only the `world.js` strata edit and
   re-running — the diff disappeared. Full account in `docs/FINDINGS.md`.

Final verification: `npm run check` (section 0 at 0 violations, new 1b
content-lint section passing), `npm run check:content` standalone, `npm run
lint` (oxlint, clean), and `npm run test:visual` (48/48, after the two
snapshot updates above) all pass. The tile-byte headroom figure above (19
substances remaining) was confirmed by `npm run check` not throwing at
import. The lint's ability to fail was proven by temporarily pointing
`kindle`'s `in` at `'timber/#nonexistent'` — `npm run check:content` failed
with two clear messages (selector-expansion and reachability) — then reverted
before the final state.
