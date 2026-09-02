# Plan — wave 4, part 2: mined material becomes a prerequisite, and a deposit depletes

**Status: PROPOSAL. Nothing here is committed.** Part of wave 4; see
`docs/PLAN-phase13.md` §1 for the wave map and `docs/PLAN-phase15-trees.md`
for the phase that shares this one's form budget.

This is the largest item in the wave and the one most likely to break
something silently, so it is its own document — the same treatment
`docs/PLAN-gears-and-winches.md` got, and for the same reason: it changes what
a material *is*, and half a dozen existing systems have an opinion about
that.

Everything below was read out of the repo at commit `818236e`; every
`file:line` is real, and every arithmetic claim in §2.1 was **executed**
against the real modules rather than reasoned about.

---

## 1. The brief, as given

> Mining **soil** should drop **dirt**, and 5 dirt should be required to
> craft/place a new **soil** block.
>
> Stone splits: **plain background stone** follows the soil-like pattern —
> mining it drops a raw prereq piece, and N of those craft back into a
> placeable stone block. **Distinct named stone-tier deposits** — granite,
> marble, adamant — follow the ore-like pattern.
>
> **Ore and any other non-soil/non-plain-stone resource**: mining must never
> let the player place a new deposit of that resource. Deposits are
> natural-generation-only, never player-placeable, ever.
>
> Ore mining should be **encouraged**: instead of one hit deleting the tile
> and dropping a fixed yield, a deposit tile carries a depletion counter
> (example: a copper deposit starts with ~500 charge) and each successful
> hit drops ore and decrements the counter without deleting the tile, until
> it reaches zero.

Four separate mechanics, one content model. §4 answers each as a numbered
decision.

---

## 2. Recon — what is actually here

### 2.1 THE TILE-BYTE BUDGET IS AT ZERO, AND NOTHING SAYS SO

**Read this before designing any content.** `docs/SPEC.md` §15's headroom
table is *arithmetically correct and practically misleading*, and the
distinction is the single most important fact in this document.

There is **no `src/data/tiles.js` and no `MAT` table** — `CLAUDE.md`'s
"Prefer editing the data tables (`MAT` in `tiles.js` ...)" line is stale,
inherited from the mockup. The material table is `SUBSTANCES` in
`src/data/substances.js`, 23 rows.

Packing (`src/data/forms.js:209-279`):
`packTile(sub, form) = 1 + sub * STRIDE + (form + 1)`, `STRIDE = FORM.length + 1`,
ceiling `BEDROCK = 255`. The guard at `forms.js:269-274` throws **at import**
if `1 + PACKABLE_MAX * STRIDE + FORM.length >= BEDROCK`.

Executed against the live modules:

```
SUB.length      23
FORM.length     11        STRIDE 12
PACKABLE_MAX     8        (adamant)
PACKABLE_LIMIT  20
guard LHS      108        of 255 -- lots of room
packable rows    7        copper, tin, timber, stone, soil, granite, adamant
```

SPEC §15's "tile-capable headroom **12 rows** (ordinals 9–20)" is true as a
*slot count*. But **every one of those twelve slots is already occupied** by a
non-packable row: ordinals 9–20 are `auger, chasm, furnace, press, belt_r,
brazier, hearth, talos_head, cyclops_maw, hub, crank, gear`. And
`SUB.length` is 23, so the **next appended row lands at ordinal 23**. If it
is packable:

```
1 + 23 * 12 + 11 = 288  >=  255      ->  data/forms.js THROWS at import
```

**Appending any new tile-capable substance is broken today.** Not "will break
after twelve more" — broken now, on the next row. SPEC §15 does gesture at the
escape hatch ("such a row may be inserted early in `data/substances.js`
rather than appended if that limit is ever approached") but its own headroom
table reads as reassurance, and `data/substances.js:61`'s header says **"ROWS
ARE APPEND-ONLY"** in flat contradiction with it. Both need fixing, in the
same commit as any content this document adds.

**What a new FORM costs instead** (also executed):

| new forms | STRIDE | PACKABLE_LIMIT | guard LHS at max=8 |
|---|---|---|---|
| 0 (today) | 12 | 20 | 108 |
| **1** (`block`, §4.2) | **13** | **18** | **117** |
| **2** (+ `seed`, Phase 15) | **14** | **17** | **126** |
| 3 | 15 | 15 | 135 |

So the two forms wave 4 wants cost 18 of 255 bytes and drop
`PACKABLE_LIMIT` from 20 to 17 — comfortably safe, because
`PACKABLE_MAX` stays at 8. **A form is cheap here; a substance is not
appendable at all.** That inverts the intuition SPEC §15 leaves you with
("note that a new FORM costs disproportionately"), which was written when
`SUB.length` was 19 and appending still worked.

**Consequence for this design: express everything as forms, tags and
content keys on the seven existing terrain substances. Add no substance
rows.** §4 does exactly that.

### 2.2 The seven terrain substances, as they are

| ord | id | tags | `tile.hard` | `tile.tier` | `tile.drops` | notes |
|---|---|---|---|---|---|---|
| 0 | `copper` | metal, mineable | 0.95 | 1 | `ore` | `look.treatments: glint` |
| 1 | `tin` | metal, mineable | 1.10 | 1 | `ore` | glint |
| 2 | `timber` | organic, mineable | 0.35 | 1 | `log` | trees; `look.canopy` |
| 3 | `stone` | rock, mineable, spoil | 1.60 | 1 | `gravel` | the bulk of the world |
| 6 | `soil` | rock, mineable | 0.50 | 1 | `gravel` | the surface cap; `look.grassCap` |
| 7 | `granite` | rock, mineable | 2.40 | **2** | `gravel` | banded |
| 8 | `adamant` | rock, **metal**, mineable | 5.00 | **3** | `gravel` | glint |

There is **no `marble`** substance today. The brief names it; it does not
exist. `marbleA/B/C` are palette entries only (`core/palette.js:12`), used
for astral's `look.tint` and the Cloud Dock's item swatch. §4.1 classifies
what exists and says explicitly what a future `marble` row would have to do.

Where each is generated (`src/data/world.js`): `soil` is a surface layer at
rows 20–27 with a 4-tile `contact` into `stone` (rows 27–56); `stone` fills
topsoil rows 0–320; the four deposits are `blobs` rows with `line:true`,
graded by depth — copper 4–180 (count 160), tin 60–320 (126), granite
120–320 (78), adamant 220–320 (40) — plus the surface's copper (26) and the
one guaranteed `vein` near spawn (`dy:6, r:3.6, n:3`).

### 2.3 "Mine rubble, shovel it back" already exists

This matters: the brief reads as new plumbing and is mostly a **re-split of an
existing path**.

`soil` and `stone` already drop `gravel` (1:1, no compression), and
`forms.js:35-51`'s `gravel` row already carries
`tile:{ solid:true, climb:false, hardK:0.5 }` — added in the machine-items
reversal (SPEC §15, "Placeable rubble") specifically so mined rubble could be
shovelled back into a hole through the same `placeTile` path
`log`/`rung`/`stair` use. So today: mine one soil tile, get one
`soil/gravel`, place one `soil/gravel` back, at half native hardness.

What the brief asks for is that this stop being 1:1 and free.

### 2.4 An ore vein already cannot be placed — twice over

- the `ore` form has **no `tile` block**, so
  `rules/placement.js:195` (`if (!FORM[form]?.tile) return no('THAT DOES NOT BUILD')`)
  already refuses it, and `#placeableFromPockets` (`:187-189`) never lists it.
- no player-reachable path passes `NATIVE` to `model/tiles.js#write.set` —
  only worldgen does. `formOf(byte) === NATIVE` (`model/tiles.js:33`) is
  therefore **already the exact "natural vein vs. player-placed" test**, free.

So brief clause (c) is already true **for `ore` specifically**. What is *not*
true is the same clause for granite and adamant, which drop `gravel`, and
`gravel` is placeable. And what needs guarding for the future is a new
tile-capable form whose `subTags` happen to admit a deposit — exactly how
`stair`'s `subTags:['metal']` legitimately admits `copper/stair` **and**
`adamant/stair` today (a real, intentional crossing that must not be broken
by accident).

### 2.5 Mining, and the two call sites that break a tile

**`src/rules/mining.js:137-207`** (player) and
**`src/rules/machines.js:340-393`** (the placed miners `talos_head` /
`cyclops_maw`) are the only two places a tile breaks from being mined. They
are `rules` siblings and **may not import each other**, so anything shared
goes in `model/`. `rules/machines.js:371` says in its own comment that it
mirrors "the same order `rules/mining.js` uses" — that parallel must survive
this phase.

The player's break branch, verbatim in shape (`mining.js:175-206`):

```
read dropAt() BEFORE clearing
digw.clear()            model/mining.js -- drop the accumulated seconds
tw.clear()              model/tiles.js -- the tile becomes AIR
push('breakHard'|'breakSoft')
iw.spawn(...)  with (rand()-0.5)*24 and -30-rand()*20
push('drop')
then the DROPS loop: rand() per row for the rare trinket
```

**Do not perturb the `rand()` sequence inside that branch.** The rare-trinket
roll draws from a fixed position in the stream immediately after the drop
spawn, deliberately (invariant 7, and `mining.js:189-196` says so). Adding a
new branch *before* the break test is fine; adding or removing a `rand()`
call *inside* the break branch changes what every existing seed generates
downstream of the first tile broken.

### 2.6 `model/mining.js` is already a run-lifetime, sparse, per-tile counter

This is the finding that makes the depletion design cheap, and it contradicts
the file's own header.

```js
const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);
export const dig = { work: new Map() };
write.add(b, tx, ty, secs) -> returns the new total
write.clear(b, tx, ty)
write.clearAll()
export const workAt / progressAt / activeCount
```

Seconds as a float, never a byte — the header explains at length that the
byte form is what made granite unmineable above 106 fps.

**The header says "a dig also abandons progress the moment the player looks
elsewhere". The code does not do that.** Grepped: `write.clear` has exactly
two callers — `rules/mining.js:177` and `rules/machines.js:373`, both on
break — and `write.clearAll` one, `shell/boot.js:79`. Nothing clears work
when the reticle moves. So accumulated work **already persists per tile for
the whole run**, which is precisely the lifetime a depletion counter needs.
`activeCount`'s comment ("the cheap proof that the Map stays small") is
therefore already optimistic, and gets more so under §4.4.

### 2.7 Two live defects in the neighbourhood, both worth knowing

**(a) Crack rendering is baked into the chunk canvas and nothing invalidates
it during a dig.** `view/paint.js:311-314` calls
`progressAt(b, tx, ty, hard)` inside `paintTile`, which runs only from
`paintChunk`. `model/mining.js#write.add` calls `bump()` — the **epoch**
counter — and never `model/tiles.js#write.touch`, so no chunk version moves
while you swing. `chunkCanvas` (`paint.js:145`) therefore returns the cached
canvas and the cracks you see are whatever was true at the last bake. Read
from the code path, **not eyeballed** — verify in a browser before acting on
it. It matters here because the obvious place to draw a depletion cue is the
same place, and it would inherit the same staleness.

**(b) Accumulated work survives a tile being cleared by something other than
mining.** `rules/miracles.js`'s `chasm` clears a radius to AIR through
`model/tiles.js#write.clear`, which does not touch `dig.work`. So a
half-mined tile that is chasmed away leaves its seconds behind, and a tile
later placed at that coordinate inherits them and breaks early. Minor today
(you get back what you placed); under §4.4 it becomes "a placed block can
inherit a deposit's worth of progress", so this phase must fix it. See
D14-E.

### 2.8 The recipe framework, and what a new recipe must argue

`data/recipes.js` rows are `{ in:{selector:count}, out:[{sub,form,n} | {subFrom,form,n}], secs, hand:true }`.
`HAND_RECIPES` is derived (`:373-374`) as `Object.values(RECIPES).filter(r => r.hand)`,
and `rules/crafting.js#choose` takes **the first row whose inputs are fully
satisfied** — so **declaration order is load-bearing** and every row in that
file carries a comment justifying its position against every containment in
the file. A new row must do the same (§4.3).

`subFrom` is the mechanism that makes one row cover every element:
`smelt`'s `out:[{ subFrom:'*/#ore', form:'ingot' }]` carries the substance
across, which is why a tin ingot differs from a copper one with no row for
tin. **A pack-the-rubble recipe is exactly that shape.**

Closest precedent to copy: `peg_rungs` (`:286-292`).

Crafting output is a **spawned falling item**, never a pocket credit, even
for a hand-craft (invariant 5).

### 2.9 Three pre-existing hand-recipe shadowings

`docs/FINDINGS.md` (Phase 8d, #5) records them, mechanically re-derived:
`peg_rungs {2 log}` and `kindle {1 log}` are strict subsets of
`daedalan {2 plate, 4 log}`, and `kindle` is a strict subset of
`auger {2 plate, 1 log}` — so `daedalan` and `auger` are unreachable by hand
for any player holding a log, which is most of them. **Nothing checks this.**
`tools/content.mjs` has 19 assertions and none of them is a hand-recipe
shadowing check. This document adds a twentieth recipe and so proposes the
check (§4.3), with the honest note that it fails on today's content.

And `docs/FINDINGS.md` (8d, #4): **the craft queue cannot choose a recipe.**
`ui.craftQueue` holds recipe ids, `shell/main.js#step` turns a non-empty
queue into a bare `cmd.craft = true`, and `choose()` then runs the
first-affordable row — which may not be the queued one. Queue GEAR while
holding 4 logs and 2 gravel and you build a BRAZIER. Pre-existing, out of
scope, and directly relevant: it is the reason declaration order has to be
argued rather than left to the UI.

---

## 3. The classification table — every terrain row, no gaps

The brief's split rule, applied to what actually exists. Three buckets, and
the third one is a bucket the brief did not name.

| substance | bucket | why | what changes |
|---|---|---|---|
| `soil` | **bulk** | the surface cap. Filler terrain you tunnel through; it is not a vein of anything. | drops `gravel` (unchanged); 5 → 1 `soil/block`, placeable |
| `stone` | **bulk** | "the bulk of the world" — its own row comment says so. Plain background rock. | drops `gravel` (unchanged); 5 → 1 `stone/block`, placeable |
| `copper` | **deposit** | a `blobs`/`vein` body, glinting, the economy's base unit | gains `tile.charge`; never placeable (already true, §2.4) |
| `tin` | **deposit** | a `blobs` body, depth-graded | gains `tile.charge`; never placeable (already true) |
| `granite` | **deposit** | a named `blobs` body at `tier:2` — the brief names it explicitly | gains `tile.charge`; **loses** placeability (via `gravel`, §4.2) |
| `adamant` | **deposit** | a named `blobs` body at `tier:3` — the brief names it explicitly | gains `tile.charge`; **loses** placeability |
| `timber` | **organic** | neither. It is grown, felled, and regrows from a seed. The brief does not address it and it must not be folded into either bucket by default. | nothing here. `docs/PLAN-phase15-trees.md` owns it. |

**Rows that do not fit and are therefore not in the table:** the three relics
(`bellows`, `pick`, `auger`), the one miracle (`chasm`) and the twelve
machine substances have no `tile` block at all and can never be terrain. They
are not unclassified; they are not terrain.

**`marble` does not exist.** If it is ever added it is a **deposit** by this
table's own logic (a named body, not filler), and — critically — it **cannot
be appended** (§2.1). It would have to be inserted at an ordinal ≤ 17 with
the `deposit` tag, a `tile.charge`, and a `blobs` row in `data/world.js`, or
it is unreachable content. That is a real cost and should be paid
deliberately, not discovered.

**Where the classification lives: two substance tags, not a new key.**

```
soil, stone                       tags: [..., 'bulk']
copper, tin, granite, adamant     tags: [..., 'deposit']
timber                            tags: [..., 'organic']   (already has it)
```

Tags are the mechanism the selector grammar already reads (`#metal` in a
selector means "any row tagged metal", `substances.js:7`), so the split
becomes expressible **in content** — `#bulk/gravel` is a recipe input that
granite can never satisfy — rather than as a branch in code. That is the
whole reason to use tags here and not a boolean key.

---

## 4. The design

Seven decisions. Each states the recommendation, the mechanism, and what was
rejected.

### D14-A — the prereq is `gravel`, and it stops being placeable

**Recommendation: keep `soil`/`stone`'s `tile.drops:'gravel'` exactly as it
is, and DELETE `gravel`'s `tile` block.**

Mining soil already yields `soil/gravel`. That *is* the "dirt" the brief
asks for; it needs no new form and no new substance. What makes it a
**prerequisite** rather than a placeable unit is removing `gravel.tile`
(`forms.js:51`), so the only way back to solid ground is the recipe in
D14-B.

Rejected alternatives:

- **A new `dirt` form crossing soil only.** Needs soil to carry a tag stone
  does not, and then stone needs a second form (`rubble`) for symmetry: two
  forms instead of one, `STRIDE` 14 instead of 13, for a display string. The
  held thing would read "SOIL DIRT" and "STONE RUBBLE", which is not
  obviously better than "SOIL GRAVEL" and "STONE GRAVEL".
- **Keep `gravel` placeable and add the block on top.** Then the recipe is
  optional and the mechanic does not exist: a player shovels 1:1 rubble back
  and never crafts a block. The brief's "5 dirt should be **required**" is
  the operative word.
- **Renaming the `gravel` form's label to DIRT.** Reads wrong for
  `stone/gravel` and `granite/gravel`, both of which are real held pairs
  today (a build bill and a tribute demand).

**The naming shortfall, stated.** The player will see SOIL GRAVEL, not DIRT.
`labelOf` composes `SUB.name + ' ' + FORM.label` and there is no per-pair
name override anywhere in the codebase. Inventing one for one word would be a
new mechanism beside `labelOf`/`shortLabelOf`, which is the same shape of
mistake as a second stat pipeline. If the word matters more than the
mechanism, the cheap answer is to rename the FORM label from GRAVEL to
RUBBLE (one line, reads correctly for all five substances that drop it) and
accept that "dirt" is the player's word, not the game's. **Recommended: do
that**, and say so in the commit.

**Cost of removing `gravel.tile`:** the loose-backfill affordance SPEC §15's
"Placeable rubble" paragraph added is gone, and that paragraph must be marked
superseded in place (§15's own style for its superseded material). Backfill
now costs 5 rubble per tile and digs back out at **native** hardness rather
than half — a strictly harder game, deliberately. `forms.js:39-51`'s comment
arguing for `hardK:0.5` goes with the block it describes.

### D14-B — one new form, one new recipe, covering every bulk substance

**`data/forms.js` gains `block`:**

```js
  { id:'block', label:'BLOCK', short:'BLK',
    size:4, massK:2.0, hudOrder:12,
    tags:['built'],
    subTags:['bulk'],
    tile:{ solid:true, climb:false, hardK:1.0 } },
```

**`data/recipes.js` gains `pack`:**

```js
  pack: Object.freeze({
    id:'pack', name:'PACK EARTH',
    in:{ '#bulk/gravel':5 },
    out:[ { subFrom:'#bulk/gravel', form:'block', n:1 } ],
    secs:2.5,
    hand:true
  }),
```

One row covers soil **and** stone **and** any future bulk substance, because
`subFrom` carries the element across exactly as `smelt` does. Compression is
5:1, which is the brief's number.

**`subTags:['bulk']` is the load-bearing half.** It means `crossable(granite,
block)` is **false**, so `granite/block` is not a legal pair — the "a deposit
is never player-placeable" rule becomes true **by construction**, enforced by
the same `subTags` gate that keeps a miracle out of a trinket selector (D1's
own argument) and needs **zero** placement-time code. Combined with D14-A
(rubble no longer places) and §2.4 (`ore` never could), the four deposit
substances have no tile-capable crossing that any recipe or drop can produce.

**Mass conservation** (`tools/content.mjs` assertion 6, `massOfPair = SUB.mass × FORM.massK`):

| | in | out | ok? |
|---|---|---|---|
| soil | 5 × 0.5 × 0.5 = **1.25** | 1 × 0.5 × 2.0 = **1.00** | yes |
| stone | 5 × 0.6 × 0.5 = **1.50** | 1 × 0.6 × 2.0 = **1.20** | yes |

`massK:2.0` is the largest round value that clears both with real waste;
2.5 is the ceiling. A block being twice the element's base mass is also
physically right — it is compacted, where rubble is loose (`gravel.massK`
0.5).

**`hardK:1.0`** — a packed block recovers at native hardness (soil 0.50 s,
stone 1.60 s), not the old rubble's half. Paired with the 5:1 cost, filling a
hole is now a real decision.

**One legal-but-unobtainable pair to note rather than fix:** `adamant/stair`
(`stair.subTags:['metal']`, and adamant is tagged `metal` for a future
smelt path its own row comment describes). No recipe outputs it and nothing
drops it, so it is unreachable. Assertion 21 (§4.7) checks *obtainability*
rather than crossability precisely so this stays legal without weakening the
rule.

### D14-C — placement needs no new gate, and that is the point

With D14-A and D14-B, the tile-capable forms are `log`, `rung`, `stair`,
`block`:

| form | `subTags` | admits |
|---|---|---|
| `log`, `rung` | `organic` | `timber` |
| `stair` | `metal` | `copper`, `tin`, `adamant` (unobtainable) |
| `block` | `bulk` | `soil`, `stone` |

No deposit substance has an **obtainable** tile-capable crossing.
`rules/placement.js` is **not edited by this phase at all**, and the
"deposits are never placeable" rule is a property of `data/`, checked by
`tools/content.mjs`, not a branch anyone can forget to write.

Rejected alternative: **a `tile.native:true` flag read in
`placeTile`.** It works, it is one line, and it was the first design. It was
rejected because it is a *permission* where `subTags` is a *possibility* —
the same distinction D4/§17.10 already made for boarding a carrier. A
permission check can be bypassed by a second placement path (and there have
been two: `cmd.place` and the retired digit-driven BUILD menu); an illegal
crossing cannot be constructed at all.

### D14-D — depletion is the existing work map, read against a bigger total

**Recommendation: add no new model state. A deposit tile's charge is a
content number, and its depletion is `model/mining.js`'s accumulated
seconds.**

Content: one optional key on a substance's `tile` block, absent meaning 1
(i.e. today's behaviour, unchanged for `soil`, `stone` and `timber`).

```
tile.charge   how many UNITS this element yields before the tile is gone.
              Absent = 1. Each unit costs a full `hard` of accumulated work,
              so the seconds-per-unit is EXACTLY what it is today and the
              economy's rate does not move -- only the walking does.
```

The rule, in both break sites:

```
total  = hard * charge                 (charge via eff('richness', sub), D14-F)
before = workAt(...)                   read BEFORE digw.add
work   = digw.add(...)                 unchanged
unitsBefore = floor(before / hard)
unitsNow    = floor(work  / hard)
for each newly crossed unit:  spawn ONE falling drop  (invariant 5)
if (work < total) return               <- the tile SURVIVES
...then the existing break branch, verbatim and unmoved
```

Why this and not a new counter:

- **Zero new model state**, zero new module, zero new reset to wire up.
  `digw.clearAll()` in `shell/boot.js:79` already satisfies invariant 8, and
  `digw.clear()` on break already handles per-tile cleanup.
- **The placed miners inherit depletion for free.**
  `rules/machines.js:357` already accumulates into the same map with the same
  `eff('pickPower')`, so a Talos Head chewing a copper vein depletes it at
  exactly the hand rate — which is the equality SPEC §12 goes out of its way
  to guarantee ("0.0000 s difference, not merely close"). A separate counter
  would need that equality re-established by hand in two files.
- **The representation is already right.** The historical bug
  `CLAUDE.md` documents was not *where* progress lived, it was *what it
  was*: a truncated byte in the material array. This is a float in seconds in
  a sparse map keyed by band and tile. It is the fix, not the bug.
- **`rand()` ordering inside the break branch is untouched** (§2.5): the new
  per-unit spawns happen in a new branch *before* the break test, so the
  trinket roll keeps its exact position relative to the final drop.

Costs, stated:

- **`model/mining.js`'s header becomes wrong** and must be rewritten. The
  file now owns two facts about one number — "how far through this swing" and
  "how much is left in this rock" — and it must say so, along with the
  correction in §2.6 (progress does *not* abandon when you look away).
- **`activeCount`'s "cheap proof the Map stays small" no longer holds.** An
  entry persists for every ore tile ever *partially* worked. Bounded by ore
  cells: measured figures in SPEC §16.5 are ~3,000 ore cells per topsoil
  seed, so a worst case of a few thousand entries per band at tens of bytes
  each — a few hundred KB, against the 53 KB a dense array would cost. That
  comment must be rewritten to state the new bound honestly.
- **`progressAt(b, tx, ty, hardSecs)`** currently returns
  `min(1, work / hardSecs)`, which saturates after the first unit. It needs
  the *total*, not the per-unit hardness. See D14-G.

**Rejected alternative: a fourth dense per-band `Uint8Array`.**
`b.spent`, allocated in `model/world.js#write.allocate` beside `seen` and
`light`, 0 meaning untouched. It costs ~53 KB across the three bands, resets
free with the band on `newRun()`, and keeps the two meanings separate — a
real argument, and the one `model/world.js:40-59`'s own comment makes for
`seen` over a sparse set. **Take this option instead if, and only if,
depletion ever needs to change for a reason other than accumulated work** —
an enrichment boon that refills a vein, a miner that drains at a different
rate per unit than it mines, or a per-tile charge that varies inside one
body. None of those is in the brief. It also needs an invalidation hook
(§2.7b) that D14-E adds anyway, so the switch stays cheap.

### D14-E — clear the work entry whenever the tile byte changes

Fixes §2.7(b), and is a prerequisite for D14-D rather than a nicety: without
it, a chasmed half-depleted copper tile leaves ~4 hard-seconds of work at
that coordinate, and a `soil/block` placed there afterwards breaks the
instant it is touched.

**One line in `model/tiles.js#write.setByte`**, beside the existing
`write.touch(b, tx, ty)`: clear the tile's accumulated work when the byte
actually changes. `model/tiles.js` importing `model/mining.js` is a legal
model→model edge (`ARCHITECTURE` §1; `tiles.js` already imports
`model/world.js` and `model/epoch.js`, and `mining.js` imports only those
two, so there is no cycle) and `tools/layers.mjs` permits it.

Rejected alternative: **clear it at each caller** (`rules/miracles.js`,
`rules/placement.js#placeTile`, `rules/generate.js`). Three callers today and
a fourth whenever someone adds a terrain-editing verb — exactly the shape of
rule that gets forgotten once and produces a bug nobody can reproduce.

Note the ordering consequence: the two break sites currently call
`digw.clear()` and then `tw.clear()`. With this change the second call makes
the first redundant. Leave both — the explicit clear reads as intent, and
relying on a side effect of the tile write for the *main* path would be
worse.

### D14-F — the numbers, and the rebalance they force

**`tile.charge` per deposit, and a scoped tunable to bend it:**

| substance | `tile.charge` | `hard` | seconds to exhaust one tile | units/second |
|---|---|---|---|---|
| `copper` | **4** | 0.95 | 3.80 | 1.05 |
| `tin` | **4** | 1.10 | 4.40 | 0.91 |
| `granite` | **3** | 2.40 | 7.20 | 0.42 |
| `adamant` | **2** | 5.00 | 10.00 | 0.20 |
| `soil`, `stone`, `timber` | absent (= 1) | — | unchanged | unchanged |

Plus one tuning row, so the pipeline has a handle (`CLAUDE.md`: every number
is read through `eff()`):

```
{ id:'richness', kind:'scale', base:1.0, scope:'substance',
  note:'multiplies a deposit substance tile.charge. A boon could enrich a vein.' }
```

read as `Math.max(1, Math.round(charge * eff('richness', SUB[sub].id)))`.

**Not ~500.** The brief's example number is read here as *per body*, not per
tile: 500 charge on one tile at 0.95 s/unit is 475 seconds — eight minutes —
of standing on one tile, and the ore-per-second figure is what
`docs/DESIGN.md`'s break-even equation and `tools/check.mjs`'s BREAK-EVEN
section are priced against. At charge 4, a **cruciform body** of ~20 cells
carries ~80 units, which is the "a deposit is a real find" feel at a
per-tile number that keeps a swing legible. If the intent really was ~500 per
*tile*, that is a different game (a vein becomes an infinite faucet you park
a miner on) and needs its own decision; this plan does not assume it.

**Rate is deliberately unchanged.** One unit still costs one `hard`, so
copper is still 0.95 s/ore and DESIGN.md's measured break-evens (raw ore
0.62 tiles, ingot 2.40, plate 6.90) do not move. What changes is that the
player stops walking between tiles — which is exactly "mining should be
encouraged".

**Therefore total available ore multiplies by the charge unless worldgen
compensates**, and it must. This is the identical move Phase 7 already made
in the other direction (SPEC §16.5: "because a cruciform cluster is roughly
half the cells a same-radius disc was, every `count` in `data/world.js` rose
to hold total ore near where it was"), so the precedent and the measurement
method both exist. Indicative targets, **to be measured and adjusted rather
than pasted**:

| `data/world.js` row | today | proposed | reason |
|---|---|---|---|
| surface `copper` count | 26 | **8** | ÷ charge 4, held against measured units |
| topsoil `copper` count | 160 | **48** | ÷ 4, rounded up for the lining pass |
| topsoil `tin` count | 126 | **38** | ÷ 4 |
| topsoil `granite` count | 78 | **30** | ÷ 3 |
| topsoil `adamant` count | 40 | **22** | ÷ 2 |
| surface `vein` (`near:'spawn'`) | `dy:6, r:3.6, n:3` | `dy:6, r:2.4, n:1` | must still yield ≥ 10 copper within a 5-tile dig (SPEC §5 beat 3) and ≥ 12 more for the furnace (§15) — at charge 4 that is ~6 cells, and today's 3 overlapping stars are ~30 |

**The consequence is intended and should be said out loud: veins become
fewer, smaller and richer.** That is what makes them read as deposits rather
than as speckle, and it is the same "a hollow is one room" legibility
argument SPEC §16.4 already makes.

Every one of these numbers goes into `docs/SPEC.md` **first** (§19 -- see
the correction note in §5),
per that file's own header rule.

### D14-G — the depletion cue is a live overlay, not a chunk bake

A player must be able to see that a vein is half spent. Two things say where
that drawing goes:

- `model/world.js:52-58`'s own rule, stated twice for `seen` and `light`: a
  chunk canvas caches the **static rock texture**, and a **live condition**
  is an overlay pass in `view/scene.js`. Depletion is a live condition.
- §2.7(a): the existing crack drawing is in the bake and is therefore stale
  during a dig. Putting the depletion cue there would inherit that bug.

So: **a new viewport-culled overlay pass in `view/scene.js`**, alongside
`drawDarkness` and the fields overlay, reading `model/mining.js` (which
`view` already imports for `progressAt`) and drawing over a deposit tile
whose remaining charge is below its full value. Proposal: dim the tile's
`glint`/`banded` treatment progressively and remove one glint pip per unit
spent — so a fully spent-but-one copper tile reads as pale rock with a single
spark left. Integer pixels, `hash2` for any jitter, no `rand()` (invariant 7),
and the pass must consume no `rand()` and mutate no model (the epoch
assertion proves the second).

`progressAt` gains the *total*: `progressAt(b, tx, ty, hardSecs, charge = 1)`
returning `min(1, work / (hardSecs * charge))` for the "how far to gone" read,
plus a sibling `unitProgressAt` returning `(work % hardSecs) / hardSecs` for
the crack read, so a crack still means "this swing" and the overlay means
"this vein". `view/paint.js:313` moves onto `unitProgressAt`.

**Deliberately not fixed here:** moving the crack drawing out of the bake
(§2.7a). It is a real bug, it is a different phase's file, and conflating it
with a new overlay makes the baseline diff unreadable. Park it in
`docs/FINDINGS.md` with the repro.

### D14-H — the general rule, named, and applied a second time to timber

D14-A/B did not set out to invent a principle; they set out to make a
deposit unplaceable and a bulk substance a real prerequisite. But look at
what `gravel` actually was before D14-A: **tile-capable, a recipe ingredient
(`brazier`, `crank`, `gear`, `belt_r`), and the literal tribute currency for
`salt-tribute`, all on one form.** D14-A/B's fix is not "gravel needed a
block" — it is "no form may be both **consumed** (by a recipe, `handFeed`,
or a tribute demand) and **placed**." That is now a real, load-bearing rule
in this codebase and it deserves a name so the next content author does not
have to re-derive it from four other decisions: **`docs/CLAUDE.md` decision
D12 — a form is either feedstock or buildable, never both.** (D11 is already
spoken for, by `docs/PLAN-horizontal-chunks-SCOPE.md` §5.5.) Drafted here for
review and deliberately unapplied to `CLAUDE.md` until this phase and its
timber counterpart below both land — the same convention D10 and D11 both
followed.

**And the rule has a second, pre-existing violator this document's own
classification table set aside rather than fixed: `timber/log`.**
`data/forms.js:65-69` gives `log` a `tile` block (it is the ladder you climb
out of your own shaft with) **and** `tags:['fuel']` (`handFeed:{from:['*/#ore',
'*/#fuel']}` at `data/machines.js:168` drains it into a furnace) **and** it
is a bare ingredient in five recipes — `hub`, `crank`, `gear`, `axle`,
`daedalan` (`data/recipes.js:69-133`, `:314-320`). That is `gravel`'s exact
shape before D14-A, on a different substance. §3's table calls timber
"neither bucket" and hands it to `docs/PLAN-phase15-trees.md` — correctly,
for the *regrowth* mechanic — but the placement/feedstock overlap is not a
regrowth question and does not need to wait for a seed to grow. It is fixed
here, in the same commit as `gravel`'s, because it is the identical edit to
the same file.

**The fix costs nothing new.** `data/recipes.js:286-292`'s `peg_rungs`
already exists — `{in:{'timber/log':2}, out:[{sub:'timber',form:'rung',n:4}],
hand:true}` — and already turns log into the placeable ladder. The only bug
is that raw `log` is *also* directly placeable, so nothing ever forces a
player through that recipe. **Delete `log`'s `tile` block**
(`data/forms.js:65-69`) in the same edit as `gravel`'s. `rung` and `stair`
remain the only placeable wood/metal ladder forms, exactly as `peg_rungs` and
`daedalan` already intend them to be, and `log` becomes pure feedstock: fuel,
five recipe ingredients, nothing else — never both.

**Two real call sites place `F.log` directly as a ladder tile and must move
to `F.rung`**, found by grepping every `F.log` reference in the test suite
(twenty-odd hits; all but these two are fuel, inventory, or a recipe
ingredient, and stay exactly as they are):

- `tests/visual.spec.js:1723` — `tw.set(band, tx, ty + 4, S.timber, F.log);
  // a ladder tile`
- `tools/check.mjs:1163` — `tiles.write.set(band, tx, ty + 4, D_sub.S.timber,
  D_form.F.log); // a ladder tile to climb`

Both are scene setup (a hand-planted ladder out of a test pit), not the
behaviour under test, so the fix is `F.log` → `F.rung` and nothing else
moves. **A third comment must be fixed regardless of whether this document
lands first**, because it will be doubly wrong once `log` cannot be placed
at all: `data/forms.js:63-64`'s *"`solid:false, climb:true` is the ladder,
and it is also why a standing tree can be climbed"* — already false today
(`rules/generate.js` writes trunks as `NATIVE`, which never carries
`climb:true`; `rules/player.js:293-294` says so) and worth folding into the
same edit as step 2 of 14a below, alongside the "only tile-capable form"
correction already scheduled there. If `docs/PLAN-phase13.md`'s ladder
sprite phase has already fixed it, reconcile rather than duplicate — the
same instruction 14a's own prompt already gives for that comment.

**Consequence for `docs/PLAN-phase15-trees.md`.** That document's D15-A and
D15-C were written against a world where `log` is still placeable, and its
risk register carries a row for a placed-log ladder farming seeds. Once this
lands, `log` can never reach `placeTile` at all (`FORM['log'].tile` is
undefined, so `rules/placement.js:195`'s `'THAT DOES NOT BUILD'` refusal
fires before backing is ever checked) — the placed-log case Phase 15 guards
against stops being reachable, which shrinks that document rather than
breaking it. Phase 15 must land after this phase for that reason, not just
for the form-budget reason its own §2.4 already states, and its prompt
should be told to re-read D15-A/D15-C against `log`'s *post-D14-H* row
before writing anything.

**Consequence for `docs/PLAN-phase16-interaction-model-v2.md`.** Its Part C
rejected pure type-dispatch ("placeable → arm to place, else → arm to feed")
specifically because `log` and `gravel` were both counterexamples at the
time it was researched. After D14-A/B and D14-H, **there are no remaining
counterexamples**: every tile-capable form (`gravel` → `block`'s replacement,
`rung`, `stair`) is placement-only, and every feedstock form is
consumption-only. §16's recommendation is revised in that document directly
(see its own revision note) rather than re-litigated here.

---

## 5. Numbers this document locks, and where

**CORRECTION, made while 14a was implemented.** This document was drafted
saying "a new section 21". `docs/SPEC.md`'s last section is **§18**; §19 and
§20 did not exist, and `docs/PLAN-phase13.md` §794 reserves §20 for its own
band gate. Numbering this 21 would have left two holes in a spec nothing
indexes sequentially, so 14a took the next free number, **§19**, and every
reference in this document was updated to match. 14b/14c/14d should read §19.

A new **`docs/SPEC.md` §19 — Deposits, rubble and the packed block**, written
before any code reads it, holding: the three-bucket classification and its
two tags; `gravel` losing its `tile` block (and §15's "Placeable rubble"
paragraph marked superseded in place); **`log` losing its `tile` block for
the identical reason (D14-H), and `peg_rungs` becoming the only route to a
placeable timber ladder**; the `block` form's four numbers; the `pack`
recipe and its 5:1 ratio; the four `tile.charge` values and the `richness`
tunable; the retuned `data/world.js` counts; and the statement that
seconds-per-unit is unchanged so §8's compression table and DESIGN.md's
break-even figures still hold.

And **`CLAUDE.md`'s "Resolved decisions" section gains D12** (§4's D14-H),
worded generally — a form is either feedstock or buildable, never both —
with `gravel`/`block` and `log`/`rung`+`stair` as its two worked examples,
applied in this phase's own commit rather than left proposed-and-unapplied
past it, since by the time 14a lands both examples are real.

And a **correction to §15 in the same commit** (§2.1): the headroom table
must say that all twelve slots are occupied, that appending a packable row
throws today, and that insertion below `PACKABLE_LIMIT` is the sanctioned
escape hatch — reconciling it with `data/substances.js:61`'s "ROWS ARE
APPEND-ONLY", which needs the same qualification.

---

## 6. The phases

**Five, mostly serial.** 14a is content and must land alone, because it is
the commit that changes what a held thing *is*; 14b is the mechanic; 14c
(view) and 14d (worldgen numbers) are parallel-safe against each other; 14e
is the harness.

### 6.1 Phase 14a — the classification, the block, and the recipe (1 × `systems`, serial)

> You are implementing Phase 14a of `docs/PLAN-phase14-mining-and-drops.md`.
> Read `CLAUDE.md` in full (especially invariant 5, the substance × form
> rule, and D7), `ARCHITECTURE.md` §2 and §3, `docs/SPEC.md` §8 §15,
> and this plan's §2, §3 and §4 (D14-A, D14-B, D14-C, **D14-H**) in full.
>
> **This phase is content only. It touches no `rules/` file and adds no
> mechanic.** Depletion is 14b.
>
> 0. **Verify the byte budget yourself before writing anything**, by
>    executing the real modules (not by reading this document): print
>    `SUB.length`, `FORM.length`, `PACKABLE_MAX`, `PACKABLE_LIMIT`, and what
>    `1 + SUB.length * STRIDE + FORM.length` would be. Confirm §2.1's claim
>    that appending a packable substance throws today. Report the numbers. If
>    they differ from §2.1, STOP and report.
> 1. `data/substances.js`: add the tag `bulk` to `soil` and `stone`, and
>    `deposit` to `copper`, `tin`, `granite`, `adamant`. Add **no rows**.
>    Update the file's own "ROWS ARE APPEND-ONLY" header per §5.
> 2. `data/forms.js`: add the `block` row exactly as D14-B gives it, and
>    **delete `gravel`'s `tile` block** together with the comment arguing for
>    its `hardK:0.5`. **Per D14-H, also delete `log`'s `tile` block
>    (`:65-69`)** — `rung` and `stair` remain the only placeable wood/metal
>    ladder forms, and `peg_rungs` (`data/recipes.js:286-292`) is already
>    the recipe that makes one from two logs, unchanged. Fix the two stale
>    comments at `:63-64` (`log` is not the only tile-capable form; a
>    standing tree is not climbable — doubly wrong once `log` cannot be
>    placed at all) — and if Phase 13b has already landed, reconcile rather
>    than duplicate.
> 3. `data/recipes.js`: add `pack` exactly as D14-B gives it. **Derive its
>    declaration position by pairwise containment against every other
>    `hand:true` bill in the file, and write that derivation as a comment in
>    the file's own established style.** Note that `#bulk/gravel` cannot be
>    satisfied by `granite/gravel`, so `cyclops_maw`'s 6-granite bill is not
>    a containment; the rows to check against are `brazier` (2 gravel),
>    `crank` (3), `gear` (1) and `belt_r` (4). State your conclusion
>    explicitly.
> 4. `docs/SPEC.md`: write §19 per §5, and correct §15's headroom table in
>    the same commit.
> 5. `CLAUDE.md`: add **D12** to the "Resolved decisions" section, worded
>    generally per §4's D14-H — *a form is either feedstock or buildable,
>    never both* — with `gravel`/`block` and `log`/`rung`+`stair` given as
>    its two worked examples. This is applied directly, not drafted-and-left,
>    because by the time this commit lands both examples are real (unlike
>    D11 in `docs/PLAN-horizontal-chunks-SCOPE.md`, which stays unapplied
>    because nothing built there yet).
> 6. `tools/content.mjs`: add assertion 20 — every substance carrying a
>    `tile` block and the `mineable` tag must carry exactly one of `bulk`,
>    `deposit` or `organic`, so a future terrain row cannot forget to
>    classify itself. **See it fail**: add a fourth tag to one row, confirm
>    the lint fails, revert.
> 7. Verify by hand: mine soil, confirm you get SOIL GRAVEL and that arming
>    it and pressing LMB on open ground now refuses legibly (say which
>    refusal string fires — `'THAT DOES NOT BUILD'` from
>    `rules/placement.js:195` is the expected one, and if a different one
>    fires, say which and why). Hand-craft 5 into one SOIL BLOCK, place it,
>    mine it back, and confirm you get 1 gravel back and not 5. **Then**
>    confirm raw TIMBER LOG refuses the same way, hand-craft 2 logs into 4
>    rungs via `peg_rungs`, and place/climb/mine one.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Baselines WILL
> move: the CRAFTING tab's RAW grid gains a slot (`pack`'s output), which is
> the exact churn `docs/FINDINGS.md` (8d, #6) already documented for four new
> recipes, and every test that placed `gravel` or `log` as a tile now fails.
> **Grep `tests/visual.spec.js` and `tools/check.mjs` for `F.gravel` and
> `F.log` before you start** and report every test that places either, with
> what you changed each to. Two are known and named in D14-H
> (`tests/visual.spec.js:1723`, `tools/check.mjs:1163`, both `F.log` →
> `F.rung`) — treat that as a floor for the search, not the whole answer,
> since `gravel`'s own placement sites were not enumerated by this document
> either.

**Acceptance:** dig a 5-tile hole in the surface soil, collect the rubble,
and fill the hole back in — and discover it costs you five tiles' worth of
rubble per tile of hole, and that you cannot shovel loose rubble straight
back. Then confirm you cannot place granite or copper anywhere, in any form,
by any route. Then confirm you cannot place a raw log either — only a
crafted rung or stair — and that a rung built this way still climbs exactly
as before.

### 6.2 Phase 14b — depletion (1 × `systems`, serial after 14a)

> You are implementing Phase 14b of `docs/PLAN-phase14-mining-and-drops.md`.
> Phase 14a must be landed. Read `CLAUDE.md`'s "Mistakes already made here"
> in full — **especially the note that mining progress used to live in the
> tile grid as a truncated byte** — then this plan's §2.5, §2.6, §2.7 and §4
> (D14-D, D14-E, D14-F's charge values only).
>
> **This phase touches no `view/` file and no `data/world.js` count.** The
> worldgen rebalance is 14d and the cue is 14c.
>
> 0. Re-read `src/rules/mining.js:137-207` and
>    `src/rules/machines.js:340-393` directly from the files, and confirm
>    §2.5's account of the break branch and §2.6's account of `dig.work`
>    persistence. Report what you found. **If `write.clear` turns out to have
>    a third caller, STOP** — D14-D rests on it having exactly two.
> 1. `data/substances.js`: add `tile.charge` to the four deposit rows per
>    D14-F. `data/tuning.js`: add the `richness` row.
> 2. `model/mining.js`: rewrite the file header — it currently claims
>    progress is abandoned when the player looks elsewhere, which the code
>    does not do (§2.6), and it must now state that this map is also the
>    depletion ledger and why that is not the historical byte bug. Rewrite
>    `activeCount`'s comment with the honest new bound (§4, D14-D's costs).
>    Change `progressAt` to take the charge, and add `unitProgressAt`, per
>    D14-G.
> 3. `model/tiles.js#write.setByte`: clear the tile's accumulated work when
>    the byte changes (D14-E). Confirm by grep that this does not create an
>    import cycle and that `npm run check` section 0 stays at **0**
>    violations.
> 4. `rules/mining.js` and `rules/machines.js#mine`: implement D14-D's
>    per-unit drop in BOTH, in the same commit, with the same arithmetic.
>    The two are `rules` siblings and may not import each other — if you find
>    yourself copying more than a few lines, put the shared arithmetic in
>    `model/` (a `chargeOf(sub)` / `unitsCrossed(before, after, hard)` pair)
>    rather than in two places. **Do not add or remove any `rand()` call
>    inside the existing break branch** (§2.5); the per-unit spawns go in a
>    new branch before the break test.
> 5. Verify with the test hook, and report measured numbers: hold LMB on a
>    copper vein tile and confirm it yields **4** ore over **3.80 s** at the
>    fixed 1/120 s step and only then disappears; that a Talos Head fed fuel
>    depletes an identical tile in the identical time (SPEC §12's equality —
>    report the difference to four decimal places); that a granite tile at
>    charge 3 with a tier-1 pick still refuses with `'TOO HARD FOR THIS
>    PICK'` and yields nothing; and that a `soil/block` placed on a
>    coordinate where a copper tile was previously half-depleted takes its
>    **full** 0.50 s to break (this is D14-E; without it, it breaks
>    instantly).
> 6. Confirm `npm run check`'s hardness-at-8-framerates table still passes at
>    every framerate, and say what it reports for a charge-4 tile.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says. **No visual baseline should move** — this phase changes no
> `view/` file — so any screenshot diff is a bug (most likely a scene whose
> ore count changed), not an intended change.

**Acceptance:** stand on one copper vein tile, hold LMB, and watch four
separate ore units fall out of it before it vanishes. Then place a Talos Head
against the same vein, fuel it, walk away, come back and find the vein has
retreated tile by tile rather than instantly.

### 6.3 Phase 14c — the depletion cue (1 × `ui`, after 14b)

> You are implementing Phase 14c of `docs/PLAN-phase14-mining-and-drops.md`.
> Phase 14b must be landed. Read `CLAUDE.md` invariants 3, 7, 9 and 11,
> `model/world.js:36-67` (the comment explaining why `seen` and `light` are
> live overlays rather than baked), and this plan's §2.7 and §4 (D14-G).
>
> 1. Add a viewport-culled depletion overlay to `view/scene.js`, beside the
>    darkness pass, per D14-G. It reads `model/mining.js` and
>    `model/tiles.js` only. It must consume **no** `rand()` and write **no**
>    model state.
> 2. Move `view/paint.js:313`'s crack read onto `unitProgressAt`, so a crack
>    still means "this swing" once a tile takes four swings.
> 3. Add TWO new baselines at both viewports: a fresh copper vein, and the
>    same vein with one tile at 3-of-4 spent and its neighbour at 1-of-4.
>    Drive the depletion through the test hook, never through hardcoded click
>    coordinates.
> 4. **Prove the overlay is actually visible**: take the same shot with the
>    overlay suppressed and confirm the pixels differ. `CLAUDE.md` records a
>    case of two tests baselining a scene with the overlays off and passing —
>    do not repeat it.
> 5. In your report, state whether §2.7(a) (cracks are baked and stale during
>    a dig) reproduces in a real browser. **Do not fix it** — park it in
>    `docs/FINDINGS.md` with the repro, per this plan's §8.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says and why every moved baseline moved.

**Acceptance:** look at a vein you have half worked and see which tiles are
spent without swinging at them.

### 6.4 Phase 14d — the worldgen rebalance (1 × `systems`, parallel with 14c)

> You are implementing Phase 14d of `docs/PLAN-phase14-mining-and-drops.md`.
> Phase 14b must be landed. Read `docs/SPEC.md` §5, §16.4, §16.5 and the new
> §19, and this plan's D14-F.
>
> This phase moves numbers in `data/world.js` so that total available ore is
> held near where it was, now that a tile yields more than one unit. It is
> the mirror of the retune SPEC §16.5 records for cruciform bodies, and it
> uses the same method.
>
> 1. **Measure first, over at least 40 seeds, and report a table**: total ore
>    UNITS per band per substance today (cells × 1) versus after 14b (cells ×
>    charge), before you change a single count. Include the hollow-lining
>    contribution (`HOLLOW_VEIN`, `eff('hollowOre')`), which multiplies too.
> 2. Retune the five `blobs` counts and the guaranteed `vein` per D14-F's
>    indicative table, then **re-measure** and report the after figures.
>    D14-F's numbers are a starting point, not a target — the target is
>    "total units within ~10% of today's total cells, per substance per
>    band".
> 3. **The one hard constraint**: SPEC §5's beat 3 promises 10 raw copper
>    within a 5-tile dig directly below spawn, and §15's furnace bill wants
>    12 more. Assert it, over the same seed sweep, in
>    `tools/worldgen-check.mjs` — units now, not cells.
> 4. Update `docs/SPEC.md` §16.5 and §19 with the measured figures. If any
>    number in D14-F turns out wrong, SPEC gets the real one and this plan
>    document gets a correction note.
>
> Run `npm run check` (including the worldgen property harness),
> `npm run lint`, `npm run test:visual`. Baselines will move — worldgen
> changed. Re-accept with a stated reason.

**Acceptance:** start a fresh run, dig the tutorial shaft, and reach 10
copper in about the time it takes today — from fewer, richer tiles.

### 6.5 Phase 14e — harness (1 × `harness`, after 14b, may run with 14c/14d)

> You are implementing Phase 14e of `docs/PLAN-phase14-mining-and-drops.md`.
> Read this plan in full plus `CLAUDE.md`'s verification table.
>
> Extend `tools/content.mjs` and `tools/check.mjs`. **Every assertion must be
> SEEN TO FAIL; report each seen-to-fail run.**
>
> Content lint (continuing from assertion 20, which 14a added):
>  - **21. NO DEPOSIT IS OBTAINABLY PLACEABLE.** For every substance tagged
>    `deposit` and every tile-capable form, either the crossing is illegal
>    (`crossable` false) or **no recipe output and no `tile.drops` produces
>    that pair**. This is the assertion that makes D14-C's "by construction"
>    claim checkable, and it is written against obtainability rather than
>    crossability so `adamant/stair` stays legal (§4, D14-B).
>  - **22. EVERY `tile.charge` IS A WHOLE NUMBER >= 1**, and only a
>    `deposit`-tagged substance carries one.
>  - **23. HAND-RECIPE SHADOWING.** For every ordered pair `i < j` in
>    `HAND_RECIPES`, row `i`'s bill must not be satisfiable by every pockets
>    state that satisfies row `j` — otherwise `j` is permanently unreachable
>    by hand. **This assertion FAILS on today's content**: `docs/FINDINGS.md`
>    (8d, #5) records three real shadowings (`peg_rungs`/`kindle` ⊆
>    `daedalan`, `kindle` ⊆ `auger`). Ship it with those three as a named,
>    commented allowlist and a `docs/FINDINGS.md` entry, **or** report that
>    reordering `daedalan`/`auger` above `peg_rungs`/`kindle` fixes them and
>    say what it would change about play. Do not ship it silently disabled,
>    and do not "fix" the content inside a harness phase.
>
> `tools/check.mjs`:
>  - a DEPLETION section: units yielded per tile equals `tile.charge` at
>    every one of the 8 framerates the hardness table already sweeps;
>    hand-mining and a fuelled Talos Head exhaust an identical tile in an
>    identical time; the tile survives until `hard × charge`.
>  - the D14-E probe: work is cleared when a tile byte changes, driven
>    through the real `chasm` miracle and through `placeTile`.
>  - `newRun()` still fingerprints identically across two fresh calls with a
>    partially depleted world in between (invariant 8).
>  - a mass-conservation probe over the `pack` recipe specifically.
>
> Run `npm run check`, `npm run lint`, `npm run test`. Report exactly what
> each says.

**Acceptance:** every new assertion has been observed failing against a
deliberately broken build, and `npm run check` is green against the real one.

---

## 7. Sequencing

| phase | agent | parallel? | gate to proceed |
|---|---|---|---|
| 14a content | 1 × `systems` | no | rubble no longer places; 5 → 1 block does; assertion 20 seen to fail; SPEC §15 corrected |
| 14b depletion | 1 × `systems` | after 14a | 4 units from one copper tile, measured at the fixed step; miner parity to 4 dp; the D14-E probe passes |
| 14c the cue | 1 × `ui` | after 14b | a spent tile is visibly spent; the overlay proven to change pixels |
| 14d rebalance | 1 × `systems` | with 14c (disjoint) | measured before/after unit totals within ~10%; beat 3 asserted in units |
| 14e harness | 1 × `harness` | with/after 14c–14d | every assertion seen to fail |

14c is the only phase in this group touching `src/view/` — and
`docs/PLAN-phase13.md`'s 13a and 13b also live there. **Do not run 14c
concurrently with either.**

---

## 8. Explicitly not designed here

- **A deposit-aware miner machine.** The placed miners already exist
  (`talos_head`, `cyclops_maw`, SPEC §12) and inherit depletion for free
  under D14-D, which is most of the value. What is *not* designed is a
  machine that *reads* remaining charge — parks on the richest tile in
  reach, reports a vein as exhausted, or refuses to start on a spent one.
  **The interface it would need, named so it does not have to be invented
  twice:** `model/mining.js` must export `chargeLeftAt(b, tx, ty)` returning
  remaining units (derivable today as
  `charge - floor(workAt() / hard)`), and nothing else. It writes through
  the same `digw.add` it already uses. That is the whole surface; the
  machine, its row, its cost and its targeting are a separate phase.
- **Moving crack rendering out of the chunk bake** (§2.7a). Real bug, wrong
  phase, parked with a repro.
- **A `marble` substance.** §3 says what it would cost and why it cannot be
  appended. Not added, because nothing asks for it and it would spend the
  one insertion slot cheaply.
- **A second rubble form per substance** (`dirt` vs `rubble`). D14-A's
  rejected alternative; costs a form for a display string.
- **Retuning `hard`, `tier`, `pickPower` or any tool's `power`.** D14-F keeps
  seconds-per-unit identical precisely so none of those has to move, and so
  DESIGN.md's break-even figures and SPEC §8's compression table stay true
  without re-derivation.
- **Fixing the craft queue's inability to choose a recipe** (§2.9,
  `docs/FINDINGS.md` 8d #4). Pre-existing, and the reason `pack`'s
  declaration position has to be argued rather than left to the UI. It is
  the single highest-value follow-up to this document.
- **A "vein exhausted" journal row.** Tempting, and rejected: the tile
  vanishing is the event, and `'breakSoft'`/`'breakHard'` already fire for
  it. A second row saying the same thing one frame later is the kind of
  duplicate notification the journal pattern exists to avoid.
- **Ore quality, richness tiers, or per-body charge variation.** `richness`
  is added as a scoped tunable so a boon *can* bend charge; nothing varies it
  per body, and D14-D's rejected alternative (a dense array) is the design
  to switch to if that is ever wanted.

---

## 9. Risk register

| risk | why it is likely | mitigation in this plan |
|---|---|---|
| **Appending a new packable substance throws at import, and SPEC §15 reads as if there is room.** | §2.1: twelve "free" ordinals are all occupied, `SUB.length` is 23, and the next appended packable row packs to 288 of 255. `data/substances.js:61` says rows are append-only, which is now false for the only kind of row this document is about. | The design adds **no substance rows at all** (§4), 14a's step 0 makes the agent execute the arithmetic and STOP if it disagrees, and 14a corrects both SPEC §15 and `substances.js`'s header in the same commit. |
| **A depletion counter in the tile grid would be the exact historical bug back again.** | The material array is where a per-tile number "obviously" goes, it has no spare bits, and the truncated-byte version of this mistake made granite unmineable above 106 fps. | D14-D puts nothing in the grid: the counter is a float in seconds in the existing sparse map, and the numbers are content on a `data/` row read through `eff()`. 14b's prompt requires the agent to read `CLAUDE.md`'s account of the original bug first. |
| **Reusing `model/mining.js`'s work map conflates "this swing" with "this vein", and the next reader will not know which.** | The file's header currently describes only the first meaning, and describes it *wrongly* (it claims progress is abandoned on look-away; §2.6 shows it is not). | 14b step 2 rewrites the header to own both facts and correct the false one, and splits the read into `progressAt` (vein) and `unitProgressAt` (swing) so the two meanings have two names. If depletion ever needs to move for a non-mining reason, D14-D names the dense-array alternative and the exact trigger for switching. |
| **The Map grows monotonically and `activeCount`'s "cheap proof it stays small" becomes a lie.** | An entry now persists for every ore tile ever partially worked, not just the two or three being hit. | Bounded and stated: ~3,000 ore cells per topsoil seed (SPEC §16.5's own measurement) at tens of bytes each, a few hundred KB worst case against 53 KB for the dense alternative. 14b rewrites the comment with the real bound rather than leaving the old claim standing. |
| **Stale accumulated work makes a newly placed block break instantly.** | §2.7(b): `chasm` and `placeTile` change the tile byte without touching `dig.work`, and depletion makes the stale value large enough to matter. | D14-E clears it in `model/tiles.js#write.setByte` — one place, not three callers — and 14b step 5 tests exactly this case through the real miracle and the real placement path. |
| **The two break sites drift apart.** | `rules/mining.js` and `rules/machines.js#mine` are siblings that may not import each other, both implement the same break sequence today by hand, and SPEC §12 stakes a measured "0.0000 s difference" equality on them agreeing. | 14b lands both in one commit, requires the shared arithmetic to move to `model/` if it exceeds a few lines, and requires the miner-parity time to be reported to four decimal places. 14e asserts it. |
| **Perturbing the `rand()` stream inside the break branch silently changes every existing seed.** | The rare-trinket roll sits immediately after the drop spawn, on purpose, and the natural place to write per-unit drop logic is right there. | §2.5 states the constraint, D14-D puts the per-unit branch *before* the break test, and 14b's prompt forbids adding or removing a `rand()` call inside the break branch in so many words. |
| **Removing `gravel.tile` breaks tests that place gravel, and the failures look like the phase is broken.** | Placeable rubble has shipped since the machine-items reversal and `F.gravel` is used in both `tests/visual.spec.js` and `tools/check.mjs`. | 14a's prompt requires grepping for `F.gravel` **before starting** and reporting every affected test with what changed. The CRAFTING-tab baseline churn is pre-diagnosed (`docs/FINDINGS.md` 8d #6) so it cannot read as a surprise. |
| **Removing `log.tile` (D14-H) is treated as a smaller, safer edit than `gravel`'s and gets less scrutiny — but it is the one that reaches a second document.** | It is genuinely smaller in code (one form, two call sites, both already named), which is exactly what makes it easy to under-review. `docs/PLAN-phase15-trees.md`'s D15-A and D15-C were written assuming `log` stays placeable. | D14-H names both call sites explicitly rather than leaving them to the grep, and states in so many words that Phase 15 must land after this one and must re-read D15-A/D15-C against `log`'s new row before writing anything — not merely re-run its own tests against a changed dependency. |
| **`pack` is declared in the wrong place and permanently starves an existing recipe — or is itself unreachable.** | First-match-wins over declaration order, nineteen `hand:true` rows, and three shadowings already exist unnoticed (§2.9). | 14a requires the containment derivation to be written as a comment in the file's own style, and names the four gravel-consuming rows to check against. 14e's assertion 23 makes the whole class checkable — shipped with the three known violations as a commented allowlist rather than silently disabled. |
| **Total ore in the world quietly multiplies by 4 and the economy inflates.** | Charge multiplies units per cell, and nothing in `data/world.js` knows about charge. | D14-F states the compensation as a requirement, 14d measures before and after over ≥ 40 seeds rather than pasting numbers, and SPEC §5 beat 3's "10 copper within a 5-tile dig" is turned into an asserted property in units. |
| **The guaranteed spawn vein becomes absurdly rich and cycle 1 is over in fifteen seconds.** | `vein` is `r:3.6, n:3` — three overlapping stars, ~30 cells — and at charge 4 that is 120 copper against a demand of 10. | 14d retunes it explicitly (D14-F's last row) and the property assertion is a *floor* on units, so the phase must also report the ceiling. |
| **`'drop'` now fires four times per tile and the ore sound stutters.** | Each unit is a real spawned item and pushes its own `'drop'` row. | Checked: `shell/notify.js:33` gives `drop` zero chips and `data/sfx.js:20,58` gaps the `ore` voice at 0.05 s, so four gapped sounds over 3.8 s is correct feedback rather than mush. Named here so it is a verified non-issue rather than an unexamined one; if it reads badly, the lever is the voice gap, not the mechanic. |
| **The depletion cue is drawn into the chunk bake and is stale, exactly as the cracks are.** | It is the obvious place, `paintTile` already does the analogous thing, and §2.7(a) means the existing precedent in that file is itself broken. | D14-G puts it in a live `view/scene.js` overlay on `model/world.js`'s own stated rule, and 14c requires the agent to report whether the crack staleness reproduces — and to park it rather than fix it. |
| **A future tile-capable form re-opens deposit placement by accident.** | `subTags` is a tag test, and a new form tagged `rock` or `metal` would silently admit granite or adamant. The `stair`/`adamant` crossing shows how easily it happens. | Assertion 21 (14e) checks obtainability for every deposit × every tile-capable form, so the form that reopens it fails the build rather than shipping. |
