# Plan — the Heavens, and closing the loop

**Status: PROPOSAL. Nothing here is built. No `src/` file has been touched.**
This is the document `docs/BUILD_PLAN.md` Phase 10's own plan-mode step asks
for. It gives the astral band something to arrive at, makes cargo able to get
there, and turns "the gods ask" into a real event with a real ledger.

Read `CLAUDE.md` (D1–D10), `ARCHITECTURE.md` §7 §9, `docs/SPEC.md` §3 §4 §5 §8
§12 §13 §14 §15 §17, `docs/DESIGN.md` "Run structure" and "The Hades act", and
`docs/PLAN-gears-and-winches.md` §4 §7 first. Everything cited below was read
in the repo at commit `f444126`; every `file:line` is real, and every number
attributed to a live probe was produced by executing the actual modules
(`model/world.js#write.allocate` + `rules/generate.js#generate` at seed 1337,
then `model/segments.js#linkCheck` against machines placed through
`model/run.js#placementCheck`). Where the brief's own numbers turned out to be
wrong, the brief is corrected here and the correction is marked.

**The headline: Step 3's "there are ONLY TWO candidates" is wrong. There is a
third, it is the one that actually fires, and it makes the phase's acceptance
walkthrough impossible today.** §2.6 measures it; §3.1 fixes it; it is the
reason this plan has a Phase 10a at all.

---

## 1. The brief, as given, and what changed under it

Phase 10's goal, verbatim: *"The Heavens become a real destination, cargo can
reach them, and delivering cargo there drives the cycle loop. This is the
game's win condition acquiring a location."*

Six things the brief asks for:

1. **Widen astral** to `tw:128, origin.x:0`, closing two 16-column dead strips.
2. **Content in astral** — something to arrive at, something to receive cargo,
   a reason to look up.
3. **A Cloud Dock**: a 2-tile platform, an ordinary `data/machines.js` row,
   which consumes arriving cargo and credits a tribute ledger. No invisible
   wall; gravity is the gate. The gods take the cargo and never speak.
4. **A cycle director**: `data/cycles.js` + `rules/cycles.js`. Cycle 1 unmoved
   at the surface altar (SPEC §4/§5). Cycle 2+ delivers to the dock. Reward on
   completion, punishment on miss, two misses ends the run.
5. **TRIBUTE and FAVOUR HUD panels**, anchored over measured text, FAVOUR
   masking unmet gods with Phase 9's own predicate.
6. **Docs**: a new locked SPEC section, a DESIGN.md status-table update, and
   two live DESIGN.md divergences fixed.

Three things have moved under the brief since it was written, and all three
matter:

- **The winch is gone** (Phase 8f). There is no `lift:{span,toBand}`, no
  `rules/lift.js`, no `'NO SHAFT TO SERVE'` branch. Transport is hubs, cranks,
  gears and runtime segments; a chain is derived, never stored (D10). §2.3.
- **Phase 9 landed real overview mode and the band ruler**, and with it the one
  masked-id predicate this phase was told to reuse. It is exported, it is
  content-agnostic, and its own header names this phase as its second reader.
  §2.7.
- **`model/segments.js#linkCheck` gained boundary-exact sampling** in
  `b48203d`, which fixed a real bug and, as a side effect, re-created the
  footing-blocks-the-cable failure SPEC §17.2 believed it had retired. §2.6.

---

## 2. Recon — what actually exists today

### 2.1 The astral band, re-derived by execution

`src/data/world.js:42-50`, and confirmed by importing `BANDS` and computing:

| band | tiles | tile px | origin (px) | world x | world y | floorTy |
|---|---|---|---|---|---|---|
| `astral` | 96 × 40 | 8 | `{x:128, y:0}` | `[128, 896)` | `[0, 320)` | 30 |
| `surface` | 128 × 56 | 8 | `{x:0, y:320}` | `[0, 1024)` | `[320, 768)` | 20 |
| `topsoil` | 128 × 320 | 8 | `{x:0, y:768}` | `[0, 1024)` | `[768, 3328)` | 0 |

So every claim Step 1 asks to be confirmed **is confirmed**:

- `BANDS[0]` is `astral`, name `'THE MINOR HEAVENS'`, `tw:96, th:40, tile:8,
  chunk:16, origin:{x:128,y:0}, floorTy:30, fields:[]`, one stratum
  (`{kind:'layer', sub:'stone', fromTy:30, toTy:40}`, `data/world.js:48`),
  `look:{sky:'skyHi', tint:'marbleA', ambient:1.0}`.
- The `lift` block is gone: `grep -n "lift:" src/data/machines.js` returns
  nothing, and `model/run.js:303-314` is the paragraph recording its deletion
  and arguing against reintroducing any "which band may this reach" gate.
- Bands are separate records with absolute origins, each allocated its own
  typed arrays by `model/world.js#write.allocate(cfg)` (`:27-75`) called per
  row from `shell/boot.js:96-100`. There is no single array, nothing to grow,
  nothing to reindex. `model/world.js` is the only file that converts between
  band-local tiles and world pixels (`:175-179`) and the only file that knows
  bands share a space at all (`bandAt`, `:157-159`).

`docs/AUDIT-2.md` §1 (`:18-83`) and §3 (`:158-241`) agree, and §3's own
correction (`:206-241`) already re-derived these ranges by execution. **AUDIT-2
does not contradict Step 1**, so there is nothing to stop on. It *is* stale in
one place — `AUDIT-2.md:62-64` and `:181-187` still cite
`data/machines.js:148`'s `lift.toBand:'astral'` as a live reference — which is
Phase 6.5 predating Phase 8f, not a disagreement about geometry. §7.3 lists it.

**The geometry nobody has written down yet, and it governs everything below:**

- Astral's **standable floor top** is world y **240** (`floorTy:30` × 8 px), not
  y 320. y 320 is the band's *bottom*. Rows 30–39 (**80 px, ten tiles**) are a
  **solid stone slab spanning the band's entire width**.
- `layer()`'s ragged-lip carve makes that top edge uneven: probed at seed 1337,
  the first solid row is 30 in some columns and 31 in others.
- The surface band's ground line is world y **480**; relief runs upward only, up
  to `amp:6` tiles, so a hilltop reaches y 432 (`SPEC.md:626-633`).
- **Surface ground to astral's floor top is 240 px = 30 tiles.** From a hilltop,
  192 px = 24 tiles.
- Rows 0–29 of astral (y 0–240) are never written by worldgen and stay AIR
  (`AUDIT-2.md:56-60`).

### 2.2 The overlap, and what the widening actually buys

Astral's x range is a proper subset of surface's. In surface tile columns the
overlap is `tx ∈ [16, 112)` — **96 of surface's 128 columns already have astral
directly above them.** Probed directly:

```
surface col   4  world x   40   bandAt(y=100): ---      bandAt(y=300): ---
surface col  15  world x  128   bandAt(y=100): astral   bandAt(y=300): astral
surface col 110  world x  888   bandAt(y=100): astral   bandAt(y=300): astral
surface col 111  world x  896   bandAt(y=100): ---      bandAt(y=300): ---
surface col 120  world x  968   bandAt(y=100): ---      bandAt(y=300): ---
```

So the widening to `tw:128, origin.x:0` closes exactly two 16-column strips
(`tx 0-15`, `tx 112-127`) in which **nothing above y 320 resolves to a band at
all**, and in which therefore no hub can be placed above the surface and no
span may rise past y 320 without `'OUTSIDE THE WORLD'`. That is a real dead
zone worth closing, and it is 25% of the world's width. It is **not** what
makes a chain able to reach astral. Do not reason from "nothing connects
today".

Per D9, **0 M stays the spawn floor**: the datum is `worldY(spawnBand,
floorTy)` = 480, computed identically at `model/run.js:298`, `view/hud.js:222`
and `view/ui/ruler.js:111-113`. Astral is negative depth and already renders
that way — `view/ui/ruler.js:121` is `depthText = d => (d >= 0 ? d : '+' + -d)
+ 'M'`, and `view/hud.js:222-227` does the same and dims the text at `d <= 0`.
Moving the datum would relocate `cyclops_maw`'s `minDepth:200`
(`data/machines.js:400`, SPEC §12 `:301-306`). **Nothing moves.**

### 2.3 Segment transport, as built

- `model/segments.js` — `segments[]`, `write.link/unlink/unlinkAll/carrier/
  load/band/clear` (`:58-101`), `geometryOf` (`:116-136`), `carrierBox`
  (`:157-161`), `linkCheck` (`:198-222`), `solidNear` (`:239-245`), the
  half-tile `sweepSpan` (`:257-273`), `chains()` (`:286-313`), `breaks()`
  (`:321-330`), `carries()` (`:337-340`), `carrierTop` (`:346`),
  `carrierUnder` (`:367-377`), `riddenSegment` (`:391-395`).
- **An anchor is the hub footprint's own centre** (`:114`), which for the 2×2
  hub is exactly on a tile-column boundary and exactly on a tile-row boundary.
  SPEC §17.5 (`:901-903`) locks this.
- `linkCheck` refusals, in the order SPEC §17.6 (`:918-924`) locks: `NOT A HUB`
  → `ALREADY LINKED` → `TOO FAR APART` → `THE PATH IS BLOCKED` → `OUTSIDE THE
  WORLD`.
- `hub` row: `data/machines.js:480-483`, `tw:2, th:2, footing:1`,
  `hub:{reach:96, carries:['material','player']}`. 96 px is 12 tiles.
  `reachOf` (`segments.js:177-180`) multiplies by `eff('segReach', def.id)`,
  base 1.0.
- `rules/drive.js` — `step` (`:98-158`), `supplyOf` (`:179-204`), `drive`
  (`:207-264`), `haul` (`:279-307`), `ride` (`:321-343`), the per-band
  component cache (`:402-456`).
- **The arrival handoff, which is the mechanism Step 3 asks about**, is
  `rules/drive.js:260-263`:

  ```js
  if (!arrived || !aboard.length) return;
  for (const it of aboard) it.rest = 0;
  push('winch', { x: after.x, y: after.y },
       { to: (seg.band || player.band)?.id, units: aboard.length });
  ```

  `arrived` is `nt >= 1 && t0 < 1` (`:239`) — only the HIGH end is an arrival
  (`:255-259`). The cargo is **released, not delivered**: `it.rest = 0` is the
  `rules/items.js` wake idiom, so it falls the last pixel onto whatever the
  upper hub is standing on. **Nothing consumes it.** A hub has no `ports`, no
  `buffer` and no `recipes`, and `data/machines.js:474-479` says so on purpose:
  *"A hub receives cargo by having a carrier arrive at it, which is
  `rules/drive.js`'s job … not a buffer's."*
- **Band handoff already works and declares nothing** (`haul`, `:289-296`): the
  moment `bandAt(carrier)` changes, the item is respawned at the same world
  pixel in the new band and re-indexed. SPEC §17.11 `:1133-1138`.
- **The relay between two stacked segments is automatic, by construction.** A
  fresh carrier parks at `t = 0`, which `posOf` (`:140-144`) defines as the LOW
  end, which for the upper segment of a pair sharing a hub is that hub's own
  anchor — the exact world pixel the lower segment releases its cargo at. The
  released item is inside the upper carrier's `carrierBox` on the frame it is
  released, so `itemsIn(carrierBox(seg))` (`drive.js:120`) picks it up. No
  transfer code exists and none is needed.

### 2.4 Machines: how anything ingests anything

`rules/machines.js#catchFalling` (`:118-132`), called from `step` at `:106`
when `def.catchBox` exists. It tests `m.mouth[def.catchBox.mouth]` inflated by
`def.catchBox.slack` (`:119-121`) — mouth rects are precomputed at placement,
`model/machines.js:34-40`. Intake is gated by **two** things and neither is a
recipe:

1. `acceptedBy(def, sub, form)` (`:266-272`) — the first `mode:'in'` port whose
   `accepts` selector matches, or `null`.
2. `capOf(def, sel)` (`model/machines.js:126-134`), which **returns 0 when
   `def.buffer?.cap` is absent**. A row with ports but no buffer swallows
   nothing.

An item matching no `accepts` selector **falls straight through the
footprint**: `rules/items.js` collides only against tiles (`solidAt` at
`:160/:169/:192/:202`) and never mentions machines. And a machine holding
inputs no recipe wants simply never drains — `produce` bails at `:153`.

**There is no receiver row in the game today.** The three near-misses are the
`out:[]` honest-fuel rows (`belt_r:263`, `brazier:297`), `hearth`'s
`{in:{},out:[],secs:Infinity}` (`:327`), and the hub. `rules/machines.js:174-177`
states the position this phase deliberately crosses: *"a machine that consumed
its inputs and produced nothing is a sink, not a recipe."* **A tribute receiver
IS a sink. Say so in the row's comment rather than smuggling it in as a recipe
with an empty `out`.**

Also relevant:

- `handFeed:{reach, from}` (`data/machines.js:23-24`, impl
  `rules/machines.js:138-148`) transfers a matching pair from the pockets into
  the buffer while the player stands within `reach`. This is how a **hand
  delivery** to a surface altar works with zero new code.
- **Machines are not terrain.** `solidAt` reads the tile grid only
  (`model/tiles.js:60`); `machineAt` has four callers and none of them is a
  collision path. **A player cannot stand on a machine footprint.** §4.4.
- `model/machines.js#write.place(band, defIdx, tx, ty)` (`:28-58`) asks nothing
  about footing, grants or held items. `rules/placement.js#placeMachine`
  (`:48-57`) is what calls `placementCheck` first. Two existing callers bypass
  it deliberately: `tools/check.mjs:761/:775/:776`, and Phase 8e's screenshot
  scenes — which `data/machines.js:465-467` records as exactly how the
  `footing:2` bug escaped detection. **This is the sanctioned mechanism for a
  worldgen- or director-placed machine, and it is what the altar will use.**
- There is **no `band:` key** on any machine row, and `placementCheck`
  (`model/run.js:277-323`) has no band clause.
- A row with **no substance** is never placeable by the player and needs no
  recipe — `kiln_divine` is the precedent (`model/run.js:231-236`,
  SPEC §15 `:507-515`).

### 2.5 Dead scaffolding this phase is supposed to consume

| thing | file:line | state |
|---|---|---|
| `run.tribute` | `model/run.js:35`, reset `:107`, setter `write.tribute` `:178` | zero callers in `src/` |
| `run.cycle` | `model/run.js:35` (`cycle: 1`) | never read, never incremented |
| `tribute-bellows` | `data/drops.js:17` (`trigger:'tribute', chance:1, give:'bellows'`) | nothing fires a `'tribute'` roll |
| beats 5 & 6 | `rules/tutorial.js:134,137` (both `null`), `data/callouts.js:23-24` (both `null`), `model/run.js:80-82` | reserved, in writing, for this phase |
| `meta.godsMet` | `model/run.js:93`, reset `:124` | zero callers |
| "future tribute panel" | `view/hud.js:585`, `data/forms.js:341-343` (`byHudOrder`) | comment pre-written for this phase |

The drop-roll for `trigger:'mine'` has **no shared helper**: it is an inline
8-line loop inside `rules/mining.js#step` at `:197-206`. A `rules` sibling may
not import another (`tools/layers.mjs:29-34`, enforced `:103-107`), so
`rules/cycles.js` must either duplicate those eight lines or hoist them to
`model`. §4.7 recommends duplication, with precedent.

### 2.6 THE BLOCKER — a legally-placed hub cannot be linked to the hub below it

`docs/BUILD_PLAN.md` Phase 10 Step 3 says: *"IF A CHAIN BUILT THERE CANNOT
REACH ASTRAL, THE CAUSE IS `model/segments.js#linkCheck`, AND THERE ARE ONLY
TWO CANDIDATES: 'TOO FAR APART' … or 'OUTSIDE THE WORLD'."*

**There is a third, it is `'THE PATH IS BLOCKED'`, and it fires on every
straight vertical link between two legally-placed hubs.**

Why. A hub's anchor is `box.x + w/2, box.y + h/2` (`segments.js:114`), which
for a 2×2 footprint is exactly on a column boundary and exactly on a row
boundary. `solidNear` (`:239-245`) — correctly, per `b48203d` — samples **both**
tiles sharing a boundary-exact coordinate. Every legally-placed hub has at
least one solid tile directly beneath its footprint (`footing:1`,
`model/run.js:290-292`). A span rising from the hub below terminates at the
upper hub's anchor, which is *inside* its footprint — so the span necessarily
passes through the upper hub's own footing row, and `solidNear` sees the
footing tile in *either* column.

Measured, seed 1337, flat ground at surface `tx 40`, ground row 20, two hubs
exactly 12 tiles apart (96 px, the reach limit):

| upper hub's footing tile | `linkCheck` |
|---|---|
| none at all (`write.place`, no footing) | `{ok:true}` |
| under its LEFT column | `{ok:false, why:'THE PATH IS BLOCKED', at:{x:328,y:392}}` |
| under its RIGHT column | `{ok:false, why:'THE PATH IS BLOCKED', at:{x:328,y:392}}` |
| under both columns | `{ok:false, why:'THE PATH IS BLOCKED', at:{x:328,y:392}}` |

y 392 is the footing row's own lower boundary. **This is SPEC §17.2's
`footing:2` bug (`SPEC.md:802-812`), recurring at `footing:1` because
boundary-exact sampling now checks both columns instead of whichever
`Math.floor` favoured.** Reducing `footing` from 2 to 1 did not fix the class
of defect; it fixed the one instance that boundary sampling then reopened.

It is invisible to the harness for exactly the reason 8e missed the original:
`tools/check.mjs:761/:775-779` place hubs through `machs.write.place`, which
asks nothing about footing, so no footing tile exists in any test and every
vertical link passes.

**A full search over `dx ∈ [-2,2]`, `dy ∈ [6,13]` and both footing columns,
with placement legality checked through `model/run.js#placementCheck` (granted
+ held rig stubbed in), found the complete set of buildable pairs:**

```
dx = 0 (straight up)      : NEVER. blocked at dy 6..11, too far at dy 12..13
dx = -1 or -2, footing LEFT : OK for dy 6..11
dx = +1 or +2, footing RIGHT: OK for dy 6..11
```

That is: a chain **can** climb today, but only by leaning one or two columns
sideways per stage with the footing tile on the *far* side of the lean, and it
gains at most **11** tiles per segment instead of 12 (at `dx=±1, dy=12` the
span is `sqrt(8² + 96²) = 96.33 px > 96` and refuses with `'TOO FAR APART'`).

**And that is not enough to reach a dock on astral's floor.** The highest hub
placeable in the surface band sits at surface `ty 0` (anchor y 328). A dock
whose footprint is astral rows 28–29 with footing on row 30 has anchor y 232 —
96 px away, which needs `dx = 0`, which is refused. Push the dock one row lower
(mine astral row 30, footprint 29–30, footing 31) and the gap is 88 px, which
`dx = ±1` clears at 88.36 px. So today the *only* way to link a dock to the
world requires a hub in the topmost row of the surface band on a hand-placed
footing tile 30 tiles above the ground, a one-column lean, and a dock hung one
row deeper than its own floor. **The acceptance walkthrough Phase 10 ends with
is not performable.** §3.1 is the fix.

### 2.7 Phase 9's ruler, and the masked-id predicate — confirmed by reading it

`src/view/ui/ruler.js`. **Both symbols exist, both are exported, and the names
in Phase 9's report are correct:**

- `export const MASK = '????????'` — `:75`
- `export const masked = (label, known) => (known ? label : MASK)` — `:76`
- `export function bandKnown(b)` — `:97-105`

Also exported: `RULER_W` `:60`, `rulerWidth()` `:65-69`, `depthDatum()`
`:111-114`, `depthAt(wy)` `:116-119`, `depthText` `:121`, `roman` `:130`,
`drawRuler(g, opts)` `:142-206`. Mounted twice: `view/hud.js:259` (compact, no
labels, called from `drawHUD:118`) and `view/overview.js:268-271`
(`labels:true`).

`ruler.js:21-33` is a block comment that names this phase:

> *"THE MASKED-ID PREDICATE LIVES HERE, AND THIS IS THE ONE PLACE IT LIVES …
> A future cycle-director phase's FAVOUR panel should import `masked` from this
> file (same-layer imports are legal) rather than write a second one."*

**One correction to the brief.** `masked(label, known)` takes a *boolean*, so
it is directly reusable for gods with no change. `bandKnown(b)` is **not**
reusable for gods — it reads `player.band` and `seenAt` (`:100-103`) and knows
nothing about run state. FAVOUR reuses `masked`; it needs its own `known`
argument. §4.6.

`bandKnown` is also the reason "unlock the next depth band" needs a decision:
it answers *has the player ever entered or revealed this band*, derived and
never stored. **There is no band lock anywhere in the game** — nothing stops a
player digging into topsoil on minute three. §3.4.

### 2.8 The HUD, and where the free space actually is

`view/hud.js#drawHUD` (`:95-130`), draw order and anchors:

| element | line | anchor | occupies |
|---|---|---|---|
| hearts | `:102` → `:135-147` | top-left `(6,6)` | y 7–11 |
| **burden bar** | `:103` → `:161-177` | top-left `(6,14)`, `w:50` | bar y 14–16; **returns `by+2` = 19 (28 when locked) and the return value is DISCARDED at `:103`** |
| depth readout | `:104` → `:219-228` | top-right `(W-w-6, 4)` | y 4–14 |
| **boon stack** | `:108` → `:278-321` | top-right, `startY = 19`, `BOON_ROW_H = 9` (`:276`) | y 19 + 9·n; **returns `boonBottom`** |
| quickbar | `:111` → `quickbar.js:51-85` | bottom-right, `y = H-42` | y H-42 … H-13 |
| HUD ruler | `:118` → `:254-260` | right edge, `y = boonBottom + 6`, `x = W - rulerWidth() - 2`, skipped if height < 40 | |
| main panel | `:124` | centred, ≤ 236×176 | |
| callout/toast | `:125` → `:509-532` | bottom-centre, `y = H-16` | |
| debug panel | `:126` → `:534-551` | top-right, `y = max(22, boonBottom)` | |

So: **the left strip below y 19 is entirely free** down to the callout at
`H-16`, and `boonBottom` is **already consumed twice** (`:118` and `:126`). A
FAVOUR panel under the boon stack must be inserted into that anchor chain, not
dropped on top of it.

The measuring helper is exactly one function: `core/font.js:32`,
`textWidth(s, sc=1, tr=1)`. The cleanest existing anchored-layout pass to copy
is `view/overview.js:886`'s `put()`.

Primitives: `view/ui/panel.js#drawPanel` (`:30-66`, returns `contentY` and
registers a hit rect), `view/ui/bar.js#drawBar` (`:24-43`, registers into
`drawn.bars`), `view/ui/tabs.js#drawTabs` (`:19-49`), `view/ui/state.js#drawn`
(`:15-21`) + `resetDrawn()` (`:23-30`).

**Two corrections to the brief.** (a) `view/hud.js#pocketHits` **does not
exist** — it is a deleted Phase-5-era array surviving only in prose
(`CLAUDE.md:327`, `state.js:4`, `panel.js:6`). The live idiom is
`view/ui/state.js#drawn`. Cite that. (b) `machineState` is **not** in
`model/machines.js`; it is `view/ui/mainPanel.js:520-539` (with `STATE_COLOUR`
at `:541-543`), imported by the overview at `:84`. `model/machines.js`'s status
query is `statusOf(m)` (`:194-199`). §3.5.

`view/hud.js` also has a **private** `panel()` at `:580-583` that registers
nothing in `drawn.panels`. Anything clickable must use `view/ui/panel.js`.

### 2.9 The click path, and why an always-on panel is not free

- `frameCtx` is declared at `shell/main.js:64` and handed to `render` at
  `:591-599`, carrying the live `ui` object by reference.
- Hit-test helpers `shell/main.js:327-362`; dispatch `applyUiIntents()` at
  `:364`, called from `:299`; screen conversion at `:388`.
- **`applyUiIntents` early-returns whenever the main panel is closed**
  (`:371-385`), and in that branch dispatches exactly one always-on rect:
  `uiHitPanel(...)?.id === 'hints-toggle'` (`:381`). Symmetrically
  `shell/input.js#onAlwaysOnUi` (`:424-428`, used at `:481`) is hardcoded to
  the same single id.
- The HUD ruler registers `hud-ruler-band-<id>` rects (`ruler.js:188-190`) and
  **nothing hit-tests them** — only `map-ruler-band-*` is dispatched
  (`input.js:441-448`).

So a *clickable* TRIBUTE or FAVOUR panel costs a widening of both
`input.js:426` and `main.js:381` from one hardcoded id to a set. §3.6
recommends both panels be **read-only** in this phase, which costs nothing.

### 2.10 Two open FINDINGS in this phase's blast radius

- **#10** (`FINDINGS.md:1530-1547`, re-opened by #11 at `:1557`): `view/hud.js#hint`
  falls back to `data/callouts.js#CALLOUTS[beat(run)]` (`:515-516`), and a
  fresh `newRun()` starts at beat 0, so **every** early-game screenshot picks up
  a tutorial callout. Filling beats 5–6 adds two more strings to that table and
  therefore two more scenes that can acquire one. Not this phase's to fix, but
  10c must not make it worse: any new baseline must set the beat explicitly.
- **#13** (`FINDINGS.md:1578-1588`): the burden bar's value label overlaps the
  bar. The real defect is `view/ui/bar.js:38` — `drawText(g, valueText, x + w +
  3, barY - 2, …)`: a hardcoded 3 px gap, **no clamp against `vw`**, and
  `barY - 2` with a 7 px glyph straddles the 3 px bar's own rows. `view/hud.js:166-169`
  compounds it with a hardcoded `w: 50`. TRIBUTE lands directly under this and
  will use the same primitive. §3.6 says fix it in 10c and says why.

### 2.11 Idioms this plan reuses rather than reinvents

- **One decision, two readers**: `model/run.js#placementCheck`,
  `model/segments.js#linkCheck`. A tribute-completion predicate belongs in
  `model`, not in the director.
- **Notification flows downward as data**: `model/journal.js#push`, drained by
  `shell/notify.js`. `rules/cycles.js` never calls `play()` or `toast()`.
- **Rate-limited refusal**: `rules/machines.js:304-311`, mirrored at
  `rules/drive.js:358-365`.
- **Monotonic one-way writers**: `model/run.js#write.advanceBeat` (`:206`) takes
  no argument on purpose (`:201-205`).
- **Duplicate rather than import a sibling**: `rules/drive.js#boxSolid`
  (`:345-352`, with the trade stated at `:334-340`) and
  `rules/machines.js`'s `HARD_BREAK` mirror.
- **Signature-keyed recompute** for a rarely-changing graph:
  `rules/drive.js:402-417`, `rules/light.js:114-135`.
- **A machine with no substance is never placeable**: `kiln_divine`.

---

## 3. Open decisions — each with a recommendation

These are the calls a human should make before 10a starts. Every one is
answered here; none is left as "the implementer will decide".

### 3.1 D-A — how the footing-blocks-the-cable defect is fixed. **THE BIG ONE.**

§2.6 proves a straight vertical link between two legally-placed hubs is
impossible. Four candidate fixes:

| option | change | cost |
|---|---|---|
| **A1 — exempt each endpoint's own footing tiles from the sweep** (RECOMMENDED) | in `sweepSpan`, skip solidity for a sample that lies within an endpoint hub's own footprint columns and at or below that endpoint's anchor, down to footprint bottom + 1 row | ~10 lines in `model/segments.js`, one SPEC §17.6 amendment. A 2-tile blind spot directly under each endpoint |
| A2 — move the anchor off the footprint centre | e.g. a `hub.mouth` offset | breaks SPEC §17.5's locked anchor, moves every carrier, churns every 8e/8f baseline |
| A3 — accept it and teach the lean | content + a callout | the most obvious build (stack hubs straight up) always refuses, and the refusal points at a tile the player deliberately placed as the hub's floor. Legibility disaster |
| A4 — `footing:0` on hubs | one row edit | hubs float anywhere; kills the headframe-straddles-the-shaft reading SPEC §17.2 `:802-812` argues for |

**Recommend A1.** The exemption is defensible on the same ground
`geometryOf`'s own comment (`segments.js:104-113`) already stands on: the
anchor is *inside* a footprint `placementCheck` has proved clear, and the
footing tile is what makes that footprint legal. The cable visibly leaves the
headframe, and a headframe straddles its own floor. The blind spot is exactly
two tiles per endpoint, both immediately under a machine, and it cannot hide a
meaningful obstruction because the footprint above it is *required* clear and
the footing tile below it is *required* present.

Two things A1 must land with, or it is not a fix:

1. **The harness must place hubs legally.** Add a real footing tile under every
   hub in `tools/check.mjs`'s §5 segment scenes (`:1256` onward, placements at
   `:761/:775-779`), and add an assertion that a vertical link between two
   *legally-placed* hubs succeeds. That assertion must be **seen to fail**
   before A1 lands. This is the same blind spot `data/machines.js:465-467`
   already records; closing it is part of the fix.
2. **`docs/FINDINGS.md`** gets the measurement, because the next person to touch
   `solidNear` needs to know what the exemption is holding up.

Gains after A1: 12 tiles per segment straight up, so surface ground (anchor y
472) to a dock on astral's floor (anchor y 232) is 240 px = **3 segments, 4
hubs**, no lean required.

### 3.2 D-B — is the Cloud Dock a hub?

**Yes, and it must be.** Nothing today can deliver cargo to a machine that is
not a segment endpoint (§2.3), and Step 3 asks the question directly. So the
dock row carries `hub:{ reach, carries }` like any other hub. It introduces no
sixth transport noun (SPEC §17.1 / D10): a machine row with a `hub` block *is*
a hub, the way `belt_r` is a belt. "Dock" names the machine, not a part of the
transport system — the same status `furnace` has.

`carries` should be `['material','player']`: the player must be able to ride up
(Step 3 requires it), and a `['material']`-only dock would refuse the ride
silently through `carries()` (`segments.js:337-340`).

### 3.3 D-C — how the dock consumes cargo

Two mechanisms, and the difference matters.

| option | how | cost |
|---|---|---|
| **C1 — `catchBox` + `ports.in` + `buffer.cap`, drained by the director** (RECOMMENDED) | `rules/drive.js` releases the haul at the dock's anchor (`:260-263`); `rules/machines.js#catchFalling` swallows it into `m.buf` the next frame; `rules/cycles.js` drains every machine whose def carries a `tribute:{}` block | reuses two existing interpreters unchanged; **one** drain path serves both the dock and the hand-fed altar; hand-feed and rider-drop work for free |
| C2 — the director reads the arriving carrier directly | `rules/cycles.js` calls `itemsIn(carrierBox(seg))` for any segment whose high-end hub carries `tribute:{}` and whose `t >= 1` | fewer moving parts, but a second delivery path is then needed for the hand-fed altar, and it depends on frame-order luck between release and consumption |

**Recommend C1.** One drain, two feeders. The dock row becomes:

```
hub:{ reach:96, carries:['material','player'] }
ports:[{ side:'top', mode:'in', accepts:[ …material form tags… ]}]
buffer:{ cap:{ …the same selectors…: 64 } }
catchBox:{ mouth:'top', slack:4 }
handFeed:{ reach:10, from:'*/#ore' }        // and the other material tags
tribute:{}                                  // the new marker key
```

Two details the implementer must get right and verify:

- **`accepts` must name material form tags, never `*/*`.** A `*/*` dock would
  swallow a `relic` trinket or a `phial` miracle that fell in. This is exactly
  the protection D1 gives `relic` and `phial` through `subTags`; use it.
- **The `slack` arithmetic must be checked against the released item's actual
  resting position, not assumed.** The item is released *inside* the footprint
  at the anchor, not falling in through the top mouth. Compute
  `m.mouth.top` inflated by `slack` against the anchor and prove the anchor is
  inside it, in the harness, before believing it works.

### 3.4 D-D — what "unlock the next depth band" means

**There is no band lock in this game.** All three bands are resident from boot
(`shell/boot.js:96-100`) and nothing gates digging between them. `bandKnown` is
*knowledge*, derived from `seenAt`, and there is no `run` field behind it.

| option | meaning | cost |
|---|---|---|
| **D1 — the reward is CHARTING, not access** (RECOMMENDED) | a new `run.charted` array of band ids; `bandKnown(b)` gains a second clause `\|\| run.charted.includes(b.id)`; the mask comes off the ruler | 3 lines in `ruler.js`, one RUN_SCHEMA field. Uses Phase 9's predicate rather than writing a second one, exactly as D8 requires |
| D2 — build a real lock | bedrock at band seams a pick cannot break | contradicts "down is free"; large; and no content needs it yet |
| D3 — drop the reward | — | the brief asks for it and DESIGN's run structure is built on it |

**Recommend D1**, and make **cycle 1's charted band `astral`**. That is the
single best answer to Step 2's third missing item — *a reason for a player to
look up*. Today the top of the ruler says `????????` and always will, because
no player enters astral early. Completing cycle 1 turns it into `THE MINOR
HEAVENS`, at exactly the moment the game has finished teaching "up is
expensive". The reward for the first trial is the *knowledge that there is
somewhere above you*, and it costs three lines.

Be honest in SPEC about the rest: with only three bands, charting `topsoil` as
cycle 2's reward is nearly a no-op because any digging player has already
entered it. The band-unlock reward is a **hook whose payoff arrives with more
bands**; say that in the locked section rather than pretending otherwise.

### 3.5 D-E — who writes beats 5 and 6

The brief says *"write it directly here … this is the one and only place beats
5-6 ever fire"*. But `model/run.js#write.advanceBeat()` (`:206`) takes no
argument by design (`:201-205`), `rules/tutorial.js:145-152` is the only writer
today, and its header (`:12-16`) requires *"EVERY PREDICATE IS A READ OF STATE
THAT ALREADY EXISTS"*.

| option | how | cost |
|---|---|---|
| **E1 — the director writes the state, `rules/tutorial.js` fires the beat** (RECOMMENDED) | `BEATS[5] = () => altarExists()`, `BEATS[6] = () => run.cycle > 1`; both are reads of state `rules/cycles.js` wrote earlier in the same frame | one writer of `tutorialBeat`, monotonicity argument untouched. Costs two predicate lines in `rules/tutorial.js` + two strings in `data/callouts.js`, both **outside the brief's file-ownership list** — §5 amends it |
| E2 — the director calls `advanceBeat()` guarded on `beat(run) === 4` / `=== 5` | literal reading of the brief | two rules modules become writers of `tutorialBeat`; `rules/tutorial.js:18-22`'s "at most ONE beat fires per frame" no longer holds globally and must be re-argued |

**Recommend E1.** It satisfies the brief's intent — beats 5–6 fire *because of*
the director and nowhere else — while keeping one writer. `rules/cycles.js` is
scheduled *before* `rules/tutorial.js` (§3.7), so both predicates read the same
frame's truth.

### 3.6 D-F — where TRIBUTE and FAVOUR go, and whether they are clickable

**Recommend, per D8's layout map and §2.8's measurements:**

- **TRIBUTE** in the **left column**, anchored at the burden bar's own returned
  bottom (`view/hud.js:103` — capture the value it already computes and
  currently throws away). Demand rows (`have / need` per row, drawn through
  `view/ui/bar.js#drawBar` with `label` + `valueText`), one aggregate progress
  bar, and the deadline as `mm:ss` **only when `left !== null`** — cycle 1 has
  no clock and must not show a zero.
- **FAVOUR** in the **right column**, inserted into the `boonBottom` anchor
  chain: `const favourBottom = favour(g, f, W, boonBottom)`, then pass
  `favourBottom` to *both* `hudRuler` (`:118`) and `debug` (`:126`). One
  `drawBar` per god, label `masked(GOD_NAME, godKnown(id))`.
- **Both read-only.** Neither registers a clickable rect, so neither forces the
  always-on-UI widening at `input.js:426` / `main.js:381` (§2.9). Nothing in
  the brief needs a click.
- **Fix `view/ui/bar.js:38` in the same phase** (FINDINGS #13): measure the
  value text with `textWidth`, clamp it against `vw`, and place it clear of the
  bar's own rows. TRIBUTE draws up to five bars through that line at the 200 px
  phone floor; landing five new instances of a known layout defect and calling
  it done would be the D8 failure mode reproduced on purpose.
- **Also fix `view/ui/mainPanel.js:533`** while in there: `machineState`'s IDLE
  clause keys off *"no `ports` and no `recipes`"*, so a dock **with** ports and
  no recipes reads `BLOCKED` — a red alarm on a working machine. This is
  FINDINGS #15's hub bug with a new instance. Widen the clause to "no
  recipes".

### 3.7 D-G — where `rules/cycles.js` sits in the schedule

`shell/schedule.js#STEPS` (`:173-189`) is 15 entries: clock, aim, player,
mining, light, reveal, items, belts, crafting, trinkets, boons, machines,
drive, tutorial, fields. Both ends are argued shut — `:141-149` states that
`fields`'s position is a claim about the *next* frame and *"nothing may be
appended after it without re-arguing that."*

**Recommend: between `drive` (`:186`) and `tutorial` (`:187`)**, i.e.

```
… machines, drive, cycles, tutorial, fields
```

The two adjacent-pair comments this requires:

- **`drive before cycles`** — the drivetrain is what delivers a haul to the
  dock and releases it (`rules/drive.js:260-263`), and the director is what
  turns a delivery into a credit. Running the director first would credit last
  frame's arrival and report a completion one frame after the carrier reached
  the top. This is the same freshness argument `items before machines`
  (`:85-87`) already makes about the catch box, one link further along the
  chain.
- **`cycles before tutorial`** — and this **replaces**, verbatim in its
  reasoning, today's `drive before tutorial` (`:128-140`). `rules/tutorial.js`
  is a pure observer whose every beat condition is a read of state another step
  wrote; beats 5 and 6 read state the director writes (D-E/E1). So the director
  must be inside "every fact of the frame has settled", and `tutorial` still
  goes as late as it can.

`tutorial before fields` and `fields last` (`:141-151`) are untouched, so the
one adjacency with no freshness argument keeps not needing one.

Rejected: between `machines` and `drive`. It breaks the load-bearing
`machines before drive` pair (`:104-127`) and gains nothing — with C1 the
dock's buffer is filled by `rules/machines.js#catchFalling` a frame after
release either way.

### 3.8 D-H — the furnace is already granted, so beat 6 is currently a lie

SPEC §4 (`:77`) and §5 beat 6 (`:92`) both lock *the furnace arrives as the
cycle-1 reward*. But `data/grants.js:31-33` puts `'furnace'` in
`STARTING_MACHINES`, so it is placeable from run start, and
`model/run.js#isKnown` (`:393-397`) therefore shows its build recipe in the
CRAFT panel from minute zero.

| option | cost |
|---|---|
| **H1 — remove `'furnace'` from `STARTING_MACHINES`; cycle 1 grants it** (RECOMMENDED) | makes SPEC §4/§5 true. Touches `data/grants.js` (outside the brief's ownership list, §5 amends it). Changes the CRAFT panel's contents for the first two minutes → **visual baselines move**, and `tools/check.mjs`'s five `furnace` references need auditing |
| H2 — leave it, and make cycle 1's reward something else | SPEC §4 and §5 both become false and must be rewritten; the first trial then teaches "the gods ask" and pays nothing, which is the beat sheet's own point undone |

**Recommend H1**, in **10b**, in its own commit, with the baseline re-accept
and the reason stated. It is small, it is what the locked spec already says,
and doing it later means doing it twice.

### 3.9 D-I — how favour is scoped, and whether `meta.godsMet` is used

`meta.godsMet` (`model/run.js:93`) is dead scaffolding that survives death;
DESIGN `:88-89` makes banked favour explicitly meta-persistent.

**Recommend**: `run.favour` is the run-scoped ledger the FAVOUR panel draws and
the mask is keyed on **run** state (a god you have never dealt with *this* run
reads `????????`, so the panel is a picture of this Torment). Also push the
asking god's id into `meta.godsMet` on first ask, because the field exists for
exactly that and leaving it dead through the phase that gives it meaning is how
it stays dead. **Do not** draw the panel off `meta` — `meta` has no save
(DESIGN `:279`), so it would be a cross-run promise the build cannot keep.

### 3.10 D-J — cycles 5 and 6 are not shipped

DESIGN `:96-97` runs to cycle 6 ("three bottles of ambrosia, each 400 raw units
deep"). SPEC §8 marks `essence` (60:1) and `ambrosia` (~400:1) **not
implemented**. **Ship four cycles** (§4.9) and say in SPEC that 5–6 wait on
those tiers. A cycle demanding a substance that cannot be made is the orphan
failure `tools/content.mjs`'s reachability fixpoint (`:170-201`) exists to
catch, and it would catch it.

---

## 4. The design

### 4.1 The astral band, widened and populated

`data/world.js`'s astral row changes in exactly two keys:

```
tw:96  -> tw:128
origin:{ x:128, y:0 } -> origin:{ x:0, y:0 }
```

`th`, `tile`, `chunk`, `floorTy`, `fields`, `strata` and `look` are unchanged.
Nothing else in the codebase needs a corresponding edit: `cx`/`cy` are derived
in `write.allocate` (`model/world.js:33-34`), the typed arrays are sized from
`cfg` (`:35-59`), and `bandAt` is a range test (`:157-159`).

Consequences to handle, not discover:

- **`tests/visual.spec.js`'s `astral.png` will move**, because the test parks
  the camera at `astral.origin` (`:277-278`) and `origin.x` changes from 128 to
  0. Re-accept in its own commit, with the reason. Same for the
  `overview`-family shots that draw every band (`:765-775`).
- **`AUDIT-2.md:561`'s hazard 5** names this widening as what turns the
  overview's per-frame full-world re-read into a cost. Measure the overview
  frame time before and after; do not assume.
- **`AUDIT-2.md:560`'s hazard 4**: any astral decoration wider than the 1–2 px
  chunk-edge margin silently loses pixels at a chunk seam (proved at
  `AUDIT-2.md:355-376`). Astral's `chunk:16` at `tile:8` means a seam every
  128 px. Keep new astral art inside one chunk or check the seam.

**Content in astral.** The brief's Step 2 lists three lacks. This plan answers
them as: *something to arrive at* = the Cloud Dock (§4.2); *something to
receive cargo* = the same row; *a reason to look up* = the ruler mask coming
off `THE MINOR HEAVENS` as cycle 1's reward (§3.4/D1). **No new strata kind,
no new worldgen pass, and no decorative pass is proposed.** Astral's ten-row
stone slab already renders and is already baselined; adding cloud-island
geometry is a `view`-and-worldgen project with its own visual review, and it is
not what makes the Heavens a destination. Name it as deferred (§6) rather than
smuggling it in.

**Nothing in any reader assumes depth is positive.** Checked directly, not
inferred:

| reader | file:line | behaviour above the datum |
|---|---|---|
| HUD depth gauge | `view/hud.js:222-227` | prints `+NM`, dims at `d <= 0`. Correct |
| ruler depth text | `view/ui/ruler.js:121` | `d >= 0 ? d : '+' + -d`. Correct |
| ruler band range | `view/overview.js:649,659` | uses the same. Correct |
| `minDepth` gate | `model/run.js:296-301` | one-sided `depth < minDepth`, so negative depth refuses `cyclops_maw` — which is what we want |
| death screen | `view/hud.js:556-561` | `Math.max(0, …)`, and `run.deepest` only ever rises. Correct |
| `run.deepest` | `model/run.js:137` | monotone maximum; astral never affects it. Correct |

**So the smallest change that makes a band above the surface expressible is the
empty change.** That is worth stating in the plan because Step 2 asks for it
and the honest answer is "already done, by D9 and by Phase 9's ruler".

### 4.2 The Cloud Dock

An ordinary `data/machines.js` row, appended per the file's append-only rule
(`:117-124`).

| key | value | why |
|---|---|---|
| `id` / `name` / `glyph` | `cloud_dock` / `'THE CLOUD DOCK'` / one char | `glyph` is required for the overview's machines layer (`overview.js:512`) and the LOGISTICS tab |
| `tw:2, th:1, footing:2` | a 2-tile platform, per Step 3 | `th:1` keeps the anchor (`box.y + 4`) close to the top mouth, which is what makes the `catchBox` arithmetic in D-C work. `footing:2` because it is a *platform*: it sits on astral's floor, not hanging off it |
| `hub:{ reach:96, carries:['material','player'] }` | D-B | it must be a segment endpoint; the player must be able to ride to it |
| `ports` / `buffer.cap` / `catchBox` / `handFeed` | D-C/C1 | the receiving mechanism |
| `tribute:{}` | the new marker key | what `rules/cycles.js` scans for. Content, not code: a second receiver is a row |
| `look` | colours from `data/palette.js` only | `tools/content.mjs` assertion 15 (`:491`) validates every name |

- **A substance and a build recipe.** The dock is placed by the player, so it
  needs a `cloud_dock` substance row with `item.mass` and one `hand:true`
  recipe producing `cloud_dock/rig` (SPEC §15 `:483-492`). Tile-capable
  headroom is **12 rows** and only ordinals ≤ 20 are packable (SPEC §15
  `:582-588`); a machine substance is never packed, so this costs nothing.
- **Granted, not starting.** `cloud_dock` is **not** in `STARTING_MACHINES`; it
  is granted by cycle 1 alongside the furnace (D-H). That is the reward
  sequence the brief wants: cycle 1 pays for the machine that makes cycle 2
  possible.
- **Price it against the chain it terminates.** SPEC §17.3 anchors a hub at
  10.4 T / 10.0 s because two hubs must equal the retired winch stage. The
  dock is the fourth hub of a three-segment chain; price it as a hub plus a
  platform, and check the whole bill fits the trips the player can actually
  make (§4.5).

**Why there is no wall, restated as arithmetic.** Astral's floor is solid stone
across the whole band, so a player standing on it cannot fall off the side —
there is no edge. The lethal drop is the shaft they mined themselves: from
astral's floor top (y 240) to the surface ground (y 480) is 240 px; impact
`v = sqrt(2·320·240) = 392 px/s`, which is 8 hearts before the clamp, so **5
hearts and dead** (SPEC §3 `:58-65`, lethal at 320 px/s = 20 tiles). No
barrier, no special case, nothing softened. **One caveat to state honestly:**
if a carrier happens to be parked in that shaft it will catch the falling
player, because a carrier is a one-way platform (`segments.js:379-395`). That
is correct behaviour, not a bug, and it means "walk off the dock and die" is
*available* rather than *guaranteed*. Do not add a special case to guarantee
it.

**The gods are never drawn and never speak.** `rules/cycles.js` pushes journal
rows whose text is about the cargo and the ledger — `'TRIBUTE ACCEPTED'`,
`'THE DEBT IS PAID'` — never a line of first-person dialogue. `docs/DESIGN.md:218-221`
is explicit that Hades' reveal is carried entirely by his being the first god
to address the player in person; the astral band's own comment
(`data/world.js:20`, *"minor gods. Reachable, which is what makes them
minor"*) is the reconciliation. Minor gods take cargo from an altar and a
dock. Nobody says anything.

### 4.3 The surface altar

Cycle 1 is unmoved (D6): the altar is on the **surface**, 10 raw copper, no
clock, the furnace as the reward (SPEC §4 `:73-77`, §5 beat 5–6 `:91-92`).

There is no altar in `src/` today (`AUDIT-2.md:487-489`, still true for the
noun). It is the second new `data/machines.js` row, and it is **not** a
player-built machine:

- **No substance and no recipe**, so it can never be crafted or placed by the
  player — `kiln_divine` is the precedent (SPEC §15 `:507-515`).
- **Placed by the director**, through `model/machines.js#write.place(band,
  M.altar, tx, ty)`, at the moment beat 5's condition is reached. That call
  asks nothing about footing, grants or held items (`:28-58`), and doing it
  from a `rules` module is the sanctioned route (`tools/check.mjs:761` and
  Phase 8e's scenes are the existing callers).
- **Sited from the spawn shelf**, not from a hardcoded column: read the spawn
  band's `spawnTx`/`floorTy` the way `shell/boot.js:107` does, offset a few
  tiles, and scan down for the first solid row. `rules/generate.js`'s `SHELF`
  is flat there by construction, which SPEC `:662` already relies on for the
  furnace.
- **Receives by hand**: the same `tribute:{}` + `ports` + `buffer` +
  `handFeed:{reach:10, from:'*/#ore'}` block as the dock, minus `hub`. The
  player walks up carrying ore and holds the feed key. One drain path serves
  both (D-C).
- `catchBox` too, so ore that falls in is free — invariant 5's whole point, and
  the altar is a catch box like any other machine.

### 4.4 What "the player can stand on the dock" actually means

**Machines are not terrain.** `solidAt` (`model/tiles.js:60`) reads the tile
grid and nothing else; invariant 1 forbids a second collision model; and no
collision path in `rules/player.js` or `rules/items.js` consults `machineAt`.
**No machine footprint in this game is standable, and the dock will not be an
exception.**

So Step 3's *"the player CAN ride up and stand on it"* resolves as: the player
rides a carrier to the dock, and steps off onto **astral's own stone floor**,
which the dock is standing on. There is no refusal, no wall and no message —
which was the actual requirement. Nothing needs building for this to be true;
it falls out of `footing:2` and a floor that already exists.

**Do not** make machines solid to satisfy this line. That is a second source of
truth for terrain, and it is invariant 1.

### 4.5 The real cost of reaching the Heavens, priced

With D-A/A1 landed (12 tiles per vertical segment), from flat surface ground:

| stage | anchor y | span | what the player must do |
|---|---|---|---|
| hub 1, on the ground | 472 | — | place hub + crank |
| hub 2 | 376 | 96 px | build 12 tiles of ladder/pillar; place a footing tile in mid-air; place hub + crank |
| hub 3, in a mined pocket in astral's slab | 280 | 96 px | mine up through astral rows 39…35 (stone, `hard 1.6 s`, 2 columns wide ⇒ ~16 s of holding per column at pick power 1); place hub + crank |
| Cloud Dock, on astral's floor | 232 | 48 px | place the dock |

**3 segments, 4 hubs (one of them the dock), 3 cranks, ~30 tiles of climbing
scaffold, ~10 tiles of stone mined overhead.** Materials, at SPEC §17.3 and §8:
3 hubs = 9 `copper/plate` + 3 `copper/ingot` + 6 `timber/log`; 3 cranks = 9
`timber/log` + 9 `stone/gravel`; 9 plate = 27 ingots = **108 copper ore** plus
36 fuel, and the ingots another 12. Mass: 3 × 10.4 + 3 × 3.3 = **40.5 T**
against a 40 T burden cap — **more than one trip, by design** (SPEC §9).
Recipe time alone: 3 × 10.0 + 3 × 4.0 = **42 s**.

Two things follow, and both belong in the plan rather than in a playtest
surprise:

- **The final segment is entirely inside astral**, so the component driving it
  is an astral component (`rules/drive.js`'s partition is per band,
  `:404-417`), and it needs a **crank in astral**. The player must carry one up
  on the carrier before the top link can be driven. That is a legitimate
  bootstrap, not a deadlock — segment 2 can carry the crank to hub 3's pocket —
  but it is the kind of thing that reads as a bug when you hit it cold. Give it
  a callout or accept it knowingly.
- **This is "up is expensive" taken to its conclusion, and it may simply be too
  much.** It is a design risk, not an engineering one, and the levers are all
  tunables: `segReach` (scoped, so a longer-reach hub tier is a `variantOf`
  row), `hub.reach`, and the dock's own reach. §7 lists it.

### 4.6 Which `linkCheck` refusal a surface→astral link can still hit

Step 3 asks this directly. After the widening and after A1:

| refusal | can a surface→astral link still hit it? |
|---|---|
| `NOT A HUB` | Yes, and correctly — the dock carries `hub`, so only a mis-aimed second press produces it (SPEC §17.7 `:951-970`: shell does not pre-filter) |
| `ALREADY LINKED` | Yes, unchanged |
| `TOO FAR APART` | **Yes, and this is the one that governs.** Astral's floor is 240 px above the surface ground and one hub reaches 96. The answer is another hub, not a fix (Step 3 says this and it is right) |
| `THE PATH IS BLOCKED` | **Yes — astral's own 80 px stone slab, rows 30–39, spanning the whole band.** Every column of astral has it. The player must mine a shaft through it before any cable can enter the band. This is the refusal the brief does not mention and it is not a defect: it is the floor of heaven, and digging through it is the correct verb. Also, **before A1**, the upper hub's own footing tile — §2.6, and that one *is* a defect |
| `OUTSIDE THE WORLD` | **Only in the two 16-column edge strips, and only for the part of a span above y 320** — which is exactly what the widening closes. Probed: `bandAt(x, 100)` is `null` for surface columns 0–15 and 111–127 today, `astral` for 15–110 |

### 4.7 `data/cycles.js` and `rules/cycles.js`

**`src/data/cycles.js`** — frozen content, `data` layer, imports nothing (or
`data` siblings only; `tools/layers.mjs:20-27` allows `data → core` and
same-layer `data → data`).

```
{ id, god, at, demand:[{ sub, form, n }], deadlineSecs|null,
  reward:{ grants?, charts?, draft? }, punishment:{ hearts?, favour? } }
```

- `at` is `'altar'` or `'dock'` — which `tribute:{}` receiver satisfies this
  cycle. Cycle 1 is `'altar'` and every later cycle is `'dock'`, which is how
  D6 ("cycle 1 is unchanged and unmoved") is expressed as data rather than as a
  special case in the director.
- `demand` rows are **concrete pairs**, so the panel can name them exactly and
  `model/items.js#massOfPair` can price them. Validated two ways in
  `tools/content.mjs`, deliberately: `holdable(sub, form)` (the same call
  assertion 1 makes at `:128-130`) proves the pair can exist, and
  `expand(sub + '/' + form).length > 0` proves the selector is non-empty —
  which is the validator `CLAUDE.md` names and `data/forms.js:326-328` exists
  for.
- `reward.draft` names a tier (`'grant' | 'boon' | 'trinket' | 'miracle'`), and
  the director offers `draftable()` from that tier. All four already exist with
  the identical `() => Row[]` signature: `rules/grants.js:29`,
  `rules/boons.js:31`, `rules/trinkets.js:39`, `rules/miracles.js:84`. **A
  `rules` sibling may not be imported** (`layers.mjs:29-34`), so the director
  cannot call them. Two ways out, and the cheap one is right: **the director
  writes the offer into `run` and `shell/main.js` performs it**, exactly as it
  already does for the four debug keys (`main.js:279/:284/:289/:294`, re-exported
  through `schedule.js:210` with the "these are events, not steps" argument at
  `:204-209`). A draft is an event, not a step.

**`src/rules/cycles.js`** — the director. Imports `core`, `data`, `model` only.

```
step(dt):
  if (run.dead) return
  ensure a live cycle             — run.tribute is null -> arm CYCLES[run.cycle-1]
  place the altar                 — if this cycle's `at` is 'altar' and none exists
  drain every tribute receiver    — for m of machines, if defOf(m).tribute:
                                      move m.buf into run.tribute.have (mw.consume),
                                      push a 'tribute' journal row per pair
  tick the deadline               — run.tribute.left -= dt, when not null
  complete or miss                — one or the other, never both, never twice
```

Every rule this file must obey, and where each comes from:

- **No `rules` sibling import** (`layers.mjs:104-105`). Everything it needs
  from another mechanic it reads through `model`.
- **Deadlines accumulate from `dt`**, never `Date.now()`. And the accumulator
  lives on `run` (inside `run.tribute`), not in module scope — a module-scoped
  timer has no `newRun()` hook, which is exactly the invariant-8 bug
  `RUN_SCHEMA.brandLeft`'s comment (`model/run.js:66-72`) records.
- **Notification through `model/journal.js#push` only.** New kinds:
  `'tribute'` (a pair accepted), `'cycle'` (a cycle completed), `'debt'` (a
  miss). Each needs a `shell/notify.js#TEXT` line and, if it should be audible,
  a `data/sfx.js#KIND_SFX` entry — a kind with no sfx entry is silent on
  purpose (`journal.js` header, `notify.js:60-63`).
- **No `rand()` outside a drop roll**, and the drop roll goes through `rand()`
  and nothing else (invariant 7).
- **The `trigger:'tribute'` roll**: duplicate `rules/mining.js:197-206`'s eight
  lines, filtered on `d.trigger !== 'tribute'`, with a comment naming the
  original and the reason (`rules` siblings may not import each other — the
  same trade `rules/drive.js:334-340` and `rules/machines.js`'s `HARD_BREAK`
  mirror already state). Do **not** hoist it to a new `model/drops.js` for one
  caller; two duplications is the point at which hoisting pays.
- **Completion is a query, not a side effect.** Put `tributeMet()` in
  `model/run.js` beside `burdenOf`/`canCraft` — the TRIBUTE panel needs the same
  yes/no the director enforces, and `view` may not import `rules`
  (`model/segments.js:182-188`'s "one decision, two readers").

### 4.8 `RUN_SCHEMA` additions, and their reset

Reuse two fields, add three. Every one is reset mechanically by
`Object.assign(run, RUN_SCHEMA, …)` in `write.reset` (`model/run.js:102-121`),
so invariant 8 holds for free — **except** for the two that must be arrays or
objects, which have to be built fresh in `reset()` for the same reason `inv`,
`granted`, `known` and `equipped` already are (`:31-46`, `:103-119`): an array
on a shared frozen template would be the one mutable reference every run
shared.

| field | shape | new? | notes |
|---|---|---|---|
| `cycle` | int, starts 1 | **reuse** (`:35`) | which row of `CYCLES` is live. Incremented on completion |
| `tribute` | `null` or `{ id, have:{}, left:secs\|null }` | **reuse** (`:35`, setter `:178`) | the live demand. `have` is keyed by the `sub/form` string from `model/items.js#keyOf`, same convention as `m.buf` and `run.inv`. `left` is the deadline accumulator |
| `favour` | `{ [godId]: int }` | new | built fresh in `reset()` |
| `charted` | `[bandId]` | new | built fresh in `reset()`. D-D/D1 |
| `misses` | int, 0 | new | two ends the run |

- `write.tribute(t)` already exists and is the setter for the whole record.
  `tools/check.mjs:759` already calls `run.write.tribute({ n: 1 })` inside the
  invariant-8 reset fingerprint; that line changes shape with this field and is
  the one place to update.
- `write.favour(god, n)`, `write.chart(bandId)` and `write.miss()` are new
  writers, each bumping the epoch, each in the one-line style of `grant`
  (`:177`).
- Death on the second miss goes through the existing `write.hurt(n, cause)`
  (`:171-175`) with a cause string; no new death path.

### 4.9 The cycle table

Locked in SPEC §18 (§5, step 6). Four cycles ship; 5–6 wait on the essence and
ambrosia tiers, which SPEC §8 marks not implemented (D-J).

| # | god | at | demand | ore-equivalent (SPEC §8) | deadline | reward | punishment |
|---|---|---|---|---|---|---|---|
| 1 | hephaestus | altar | 10 `copper/ore` | 10 | **none** | grant `furnace` + `cloud_dock`; chart `astral` | — (no clock, cannot be missed) |
| 2 | hephaestus | dock | 3 `copper/plate` | 36 ore + 12 fuel | 480 s | draft 1-of-3 `grant`; chart `topsoil` | 1 heart |
| 3 | athena | dock | 6 `copper/plate` + 4 `tin/ingot` | 72 + 16 | 420 s | draft 1-of-3 `boon` | 2 hearts |
| 4 | poseidon | dock | 8 `copper/plate` + 8 `granite/gravel` | 96 + tier-2 rock | 360 s | draft 1-of-3 `trinket` | 2 hearts |

Design notes, each with its authority:

- **Escalation is in refinement, not volume** (DESIGN `:96-98`, and the brief is
  emphatic). Cycle 2 wants **plate**, not more ore. 3 plate is 36 ore against
  cycle 1's 10 — a 3.6× jump in ore that is a 3-plate ask on the panel, which
  is the whole point of pricing in compression.
- **Cycle 3 forces depth**: `tin` starts at topsoil row 60 (`data/world.js:150`).
- **Cycle 4 forces the tier gate**: `granite` is `tile.tier 2`
  (`data/substances.js`), so a stock pick cannot break it (SPEC §12 `:269-272`)
  and the auger becomes necessary.
- **Deadlines shrink as the factory grows.** 480 s for cycle 2 is generous on
  purpose: it is the cycle in which the player builds the entire 3-segment
  chain (§4.5 prices it at ~42 s of crafting alone, plus 108 ore, plus 30 tiles
  of scaffold). Tune it against a real playthrough, not against this table.
- **Hades never asks.** The asker set is `{hephaestus, athena, poseidon}`.
  `ares` is the shipped trap god (SPEC §14 `:439-445`) and stays out of the
  asking; `hades` is protected by DESIGN `:218-221` — he is the first god to
  address the player in person and this phase must not spend that.
- **Cycle 1 has no clock, so `deadlineSecs:null` must be a real branch**, not a
  large number. The TRIBUTE panel draws no timer when `left === null` (D-F).
- **`tribute-bellows` fires on every completion** (`data/drops.js:17`,
  `chance:1`), so the first cycle completion also hands over the `bellows`
  trinket — which is what makes the trinket tier reachable without a 3% granite
  roll, and is exactly why the row was written.

### 4.10 The HUD panels

Per D-F. Both are drawn from `view/hud.js`, both anchored over measured text,
both read-only.

```
TRIBUTE  (left column, anchored at the burden bar's returned bottom)
  ┌ TRIBUTE  II                       heading: label + roman(cycle)
  │ COPPER PLATE      2 / 3           one drawBar per demand row,
  │ TIN INGOT         0 / 4           label = labelOf(sub,form), value = have/need
  │ ████████░░░░░░░   57%             one aggregate bar
  └ 06:12                             only when run.tribute.left !== null

FAVOUR   (right column, inserted into the boonBottom anchor chain)
  HEPHAESTUS  ███░░                   drawBar per god
  ATHENA      █░░░░
  ????????    ░░░░░                   masked(name, godKnown(id))
```

- Row labels through `data/forms.js#labelOf` / `shortLabelOf` and the ordering
  through `byHudOrder` — whose own comment (`forms.js:341-343`) says *"Exported
  so the HUD and a future tribute panel cannot drift apart"*, matching
  `view/hud.js:585`. Use them; that is what they were left for.
- **Match the mockup's density, not its bugs.** `reference/mockup/`'s FAVOUR
  label overruns its own frame and its boon cards clip off the viewport;
  `view/ui/ruler.js:54-59` records hitting the identical failure on the first
  render of the ruler and fixing it by measuring. Every x in both panels comes
  from `textWidth`, and every panel is clamped against `vw`/`vh` the way
  `panel.js:34-37` and `tooltip.js:30-31` already do.
- **The 200 px phone floor is the binding constraint**, not the desktop
  viewport (`FINDINGS.md`'s hardcoded-coordinate lesson, `CLAUDE.md`). Both
  panels get a phone baseline.
- `__mf.ui` (D2) should project both panels so a test can assert the ledger
  without reading pixels.

---

## 5. File ownership

The brief's list, plus five amendments this recon forces. Each amendment names
the decision that requires it.

**As given:**

| file | change |
|---|---|
| `src/data/cycles.js` | NEW — the cycle table |
| `src/rules/cycles.js` | NEW — the director |
| `src/shell/schedule.js` | one insertion + two adjacent-pair comments (D-G) |
| `src/data/machines.js` | the `cloud_dock` row and the `altar` row |
| `src/data/world.js` | astral `tw:128, origin.x:0` |
| `src/model/run.js` | 3 new `RUN_SCHEMA` fields + writers + `tributeMet()` |
| `src/view/hud.js` | TRIBUTE and FAVOUR panels |
| `docs/SPEC.md` | new §18 |
| `docs/DESIGN.md` | status table + two divergence fixes |

**Amendments:**

| file | change | required by |
|---|---|---|
| `src/model/segments.js` | the endpoint-footing sweep exemption | **D-A/A1** — without it the acceptance walkthrough is not performable (§2.6) |
| `src/data/substances.js` + `src/data/recipes.js` | one `cloud_dock` substance + one build recipe | §4.2 — a player-placed machine is a held `<id>/rig` item (SPEC §15) |
| `src/data/grants.js` | remove `'furnace'` from `STARTING_MACHINES` | **D-H/H1** — SPEC §4/§5 lock the furnace as cycle 1's reward |
| `src/rules/tutorial.js` + `src/data/callouts.js` | two predicates, two strings | **D-E/E1** — one writer of `tutorialBeat` |
| `src/view/ui/ruler.js` | one clause in `bandKnown` | **D-D/D1** — reuse Phase 9's predicate, do not write a second |
| `src/view/ui/bar.js` + `src/view/ui/mainPanel.js` | measure/clamp the value text; widen the IDLE clause | **D-F** — FINDINGS #13 and #15, both landing in this phase's own new panels |
| `src/shell/notify.js` + `src/data/sfx.js` | text and sound for three new journal kinds | §4.7 |
| `tools/content.mjs` | one import + assertion 19 (the cycle table) | §6.1 — `content.mjs:17-30` is the table registry and has no discovery |
| `tools/check.mjs` | legal-footing hub placements, the vertical-link assertion, the tribute-loop probes, `:759`'s tribute shape | D-A/A1 and §6 |
| `tests/visual.spec.js` | `astral.png` + overview re-accepts; new TRIBUTE/FAVOUR shots at both viewports | §4.1, §4.10 |
| `docs/FINDINGS.md` | the footing/`solidNear` measurement | D-A/A1 |

---

## 6. The phases

**Three, not five, and not one.** The reasoning:

- The footing defect (D-A) is a **prerequisite** that must land and be proved
  alone. It touches `model/segments.js`, which is Phase 8g's subject; bundling
  it with new content would make "did the fix work" and "did the content work"
  one question with two answers.
- The loop (dock, altar, ledger, director, docs) is one coherent piece of
  systems work with a single acceptance walkthrough. Splitting the dock from
  the director would leave a receiver nothing drains, which is the state the
  repo is already in and the state this phase exists to leave.
- The HUD is `view`, and the repo's own rule (`PLAN-gears-and-winches.md:1396-1397`)
  is that view phases do not run concurrently. It also needs a human to approve
  pixels, which is a different kind of gate.

### 6.1 Phase 10a — unblock the cable (1 × `systems`, small, serial, FIRST)

Paste-ready prompt:

> You are implementing Phase 10a of `docs/PLAN-phase10.md` in the
> mythos-factory repo. Read `CLAUDE.md`, `docs/SPEC.md` §17, and
> `docs/PLAN-phase10.md` §2.6 and §3.1 (decision D-A) in full before touching
> anything. **Scope is exactly one defect. Do not add content, do not touch
> `data/`, do not start the Cloud Dock.**
>
> The defect, measured: a straight vertical link between two *legally placed*
> hubs always refuses with `'THE PATH IS BLOCKED'`, because a hub's anchor sits
> on a tile-column boundary (`model/segments.js:114`), `solidNear`
> (`:239-245`) correctly samples both tiles sharing a boundary-exact
> coordinate, and every legally placed hub has a solid footing tile directly
> under its footprint (`model/run.js:290-292`) which the span from below must
> pass through. Reproduce it first: allocate the bands, generate, place two
> hubs 12 tiles apart on flat surface ground with a real footing tile under the
> upper one, and call `linkCheck`. **Do not proceed until you have seen the
> refusal yourself.**
>
> 1. Implement option A1 from §3.1: in `sweepSpan`, a sample lying within an
>    endpoint hub's own footprint columns, at or below that endpoint's anchor
>    and no lower than that footprint's bottom + 1 row, does not count as
>    blocked. Exactly two tiles per endpoint. Write the comment explaining
>    *why* the exemption is sound (the footprint is required clear, the footing
>    tile is required present, the drawn cable leaves the headframe) and why the
>    alternatives in §3.1 were rejected.
> 2. `tools/check.mjs` §5: place every hub in the segment scenes with a real
>    footing tile, and add an assertion that a vertical link between two
>    legally placed hubs succeeds and that a genuine obstruction mid-span still
>    refuses. **Both assertions must be seen to fail before the fix and pass
>    after — report the exact output of each.** The existing scenes use
>    `machs.write.place`, which asks nothing about footing
>    (`data/machines.js:465-467` records this exact blind spot); that is why
>    this bug survived Phase 8g.
> 3. `docs/SPEC.md` §17.6: amend the `'THE PATH IS BLOCKED'` row with the
>    exemption, in §17.2's own style for the `footing:2` history.
> 4. `docs/FINDINGS.md`: record the measurement and the fact that the
>    `footing:2 -> 1` change did not fix the class of defect, boundary sampling
>    reopened it.
>
> Run `npm run check`, `npm run lint` and `npm run test:visual`. Report exactly
> what each says. No baseline should move; if one does, stop and explain why.

Acceptance: two hubs placed legally 12 tiles apart, straight up, link. A hub
pair with a real obstruction between them still refuses. Both assertions were
seen to fail first. No pixels moved.

### 6.2 Phase 10b — the loop (1 × `systems`, serial after 10a)

Paste-ready prompt:

> You are implementing Phase 10b of `docs/PLAN-phase10.md` in the
> mythos-factory repo. Read `CLAUDE.md` in full (D1–D10), `docs/SPEC.md` §4 §5
> §8 §12 §15 §17, `docs/DESIGN.md` "Run structure" and "The Hades act", and all
> of `docs/PLAN-phase10.md`. Phase 10a must already be landed. **The HUD panels
> are Phase 10c — do not draw anything.**
>
> Land, in this order, each step verified before the next:
>
> 1. **Widen astral** (§4.1): `data/world.js`, `tw:96 -> 128`,
>    `origin.x:128 -> 0`. Nothing else. Then re-accept `astral.png` and any
>    overview baseline that moved, **in its own commit**, stating that the
>    camera parks at `astral.origin` (`tests/visual.spec.js:277-278`) and
>    `origin.x` changed. Measure the overview's frame time before and after —
>    `docs/AUDIT-2.md:561` names this widening as a cost, so measure it rather
>    than assuming.
> 2. **The two receiver rows** (§4.2, §4.3): `cloud_dock` (a hub, with
>    `ports`/`buffer`/`catchBox`/`handFeed`/`tribute:{}`, `tw:2 th:1
>    footing:2`) and `altar` (the same receiver block, no `hub`, **no substance
>    and no recipe** so the player can never build it — `kiln_divine` is the
>    precedent). Give `cloud_dock` a substance and one `hand:true` build recipe;
>    price both against SPEC §17.3's hub anchor. **Prove the `catchBox` slack
>    arithmetic against where a released haul actually comes to rest** — the
>    item is released *inside* the footprint at the anchor
>    (`rules/drive.js:260-263`), not falling in through the top mouth. Assert
>    it; do not eyeball it.
> 3. **`RUN_SCHEMA`** (§4.8): three new fields, fresh containers built in
>    `write.reset()` for the reason `inv`/`granted`/`equipped` already are, plus
>    `write.favour`/`write.chart`/`write.miss` and the `tributeMet()` query.
>    Update `tools/check.mjs:759`, which already writes `run.tribute`.
> 4. **`data/cycles.js`** (§4.7, §4.9): four rows, exactly the locked table.
>    Then `tools/content.mjs`: one import line in the registry at `:17-30` and
>    assertion 19, modelled on assertion 12 (`:429-442`) — closed-set `at` and
>    `reward.draft` vocabularies, `holdable(sub, form)` per demand row, and
>    `expand(sub + '/' + form).length > 0` per demand row. **Every assertion
>    must be seen to fail against a deliberately broken row.**
> 5. **`rules/cycles.js`** (§4.7). A `rules` sibling: it may not import another
>    `rules` module (`tools/layers.mjs:104-105`). No `play()`, no `toast()` —
>    `model/journal.js#push` only. Deadlines accumulate from `dt` and live on
>    `run`, never in module scope and never off `Date.now()`. The
>    `trigger:'tribute'` drop roll duplicates `rules/mining.js:197-206` with a
>    comment naming the original and the sibling rule that forces the copy.
>    The draft is written into `run` for `shell/main.js` to perform, not called
>    directly — `draftable()` lives in four `rules` siblings you may not
>    import, and `schedule.js:204-209` already argues that a draft is an event
>    rather than a step.
> 6. **`shell/schedule.js`** (§3.7): insert `cycles` between `drive` and
>    `tutorial`. Write the `drive before cycles` comment and **replace** the
>    `drive before tutorial` comment with `cycles before tutorial`, carrying its
>    reasoning over verbatim.
> 7. **Beats 5 and 6** (D-E/E1): two predicates in `rules/tutorial.js:134,137`
>    reading state the director wrote, and two strings in
>    `data/callouts.js:23-24`. `rules/tutorial.js` stays the only writer of
>    `run.tutorialBeat`. Be aware of `docs/FINDINGS.md` #10: these two new
>    callout strings can appear in unrelated screenshots, so any scene you
>    baseline must set the beat explicitly.
> 8. **The furnace grant** (D-H/H1): remove `'furnace'` from
>    `STARTING_MACHINES`; cycle 1 grants it. Audit `tools/check.mjs`'s five
>    `furnace` references and re-accept any CRAFT-panel baseline **in its own
>    commit** with the reason.
> 9. **`docs/SPEC.md` §18** (§4.9 and step 6 below) and **`docs/DESIGN.md`**
>    (§7.1).
>
> Harness (`tools/check.mjs`), and each assertion must be seen to fail first:
> a cycle arms; a hand delivery to the altar credits the ledger; the ledger's
> completion predicate fires exactly once; a deadline expires at the same
> wall-clock time at 30 fps and at 144 fps (the fixed 1/120 s step makes this
> checkable — do it, because a deadline is the first wall-clock quantity the
> game has ever had); two misses kill the run; `newRun()` resets all five
> fields (invariant 8); and a full seeded run is still bit-reproducible
> (invariant 7).
>
> Then perform the acceptance walkthrough **by hand, in order, and report what
> happened at each step**, including anything that felt bad:
> finish cycle 1 at the surface altar; watch `run.tutorialBeat` reach 5 when the
> altar appears and 6 on delivery; chain three segments to astral from a column
> under the now-full-width band; crank plate up; watch the ledger fill; get the
> band unlock; then walk off the dock on purpose and die.

Acceptance: as the walkthrough above. Plus `npm run check`, `npm run lint`,
`npm run test:visual` all reported honestly, and every re-accepted baseline in
its own commit with its own reason.

### 6.3 Phase 10c — the panels (1 × `ui`, serial after 10b, THE VISUAL PHASE)

Paste-ready prompt:

> You are implementing Phase 10c of `docs/PLAN-phase10.md` in the
> mythos-factory repo. Read `CLAUDE.md` (especially D2, D8 and the Conventions
> section), `docs/PLAN-phase10.md` §2.8 §2.9 §2.10 §3.6 §4.10, and
> `docs/FINDINGS.md` #10 #13 #15. Phase 10b must already be landed. **This is
> the only phase in this wave that touches `src/view/` — nothing else may run
> concurrently.**
>
> 1. **Fix `view/ui/bar.js:38` first** (FINDINGS #13), before drawing anything
>    on top of it: measure the value text with `core/font.js#textWidth`, clamp
>    it against `vw`, and place it clear of the bar's own rows. Prove the fix
>    with a screenshot diff on the existing over-cap burden scene
>    (`drive-reversing-overcap.png`) — that shot is the finding's own evidence.
> 2. **TRIBUTE**, left column, anchored at the value `view/hud.js:103` already
>    computes and currently throws away. One `drawBar` per demand row plus one
>    aggregate, labels through `data/forms.js#labelOf`, order through
>    `byHudOrder`. **No timer when `run.tribute.left === null`** — cycle 1 has
>    no clock and must not show a zero.
> 3. **FAVOUR**, right column, inserted into the `boonBottom` anchor chain:
>    capture its bottom and pass it to **both** `hudRuler` (`:118`) and `debug`
>    (`:126`), or they will draw through your panel. Mask unmet gods with
>    `masked` imported from `view/ui/ruler.js:76`. **Do not write a second mask
>    predicate** — that file's header (`:21-33`) names this panel as its
>    intended second reader. `bandKnown` is not reusable for gods; the `known`
>    argument is your own query over `run.favour`.
> 4. **Every x and y comes from measured text.** No hardcoded panel origins.
>    The mockup's FAVOUR label overruns its own frame and its boon cards clip
>    off the viewport; `view/ui/ruler.js:54-59` records hitting the identical
>    failure and fixing it by measuring. Match the mockup's density, not its
>    bugs.
> 5. **Fix `view/ui/mainPanel.js:533`** (FINDINGS #15): the IDLE clause keys off
>    "no ports and no recipes", so the Cloud Dock — ports, no recipes — reads
>    `BLOCKED` on the LOGISTICS tab and in the overview's machines layer. Widen
>    it to "no recipes".
> 6. **Both panels read-only.** Register no clickable rect, so neither forces
>    the always-on-UI widening at `shell/input.js:426` and `shell/main.js:381`.
> 7. Project both panels through `__mf.ui` (D2) so a test can assert the ledger
>    without reading pixels.
> 8. New baselines at **both** viewports including the 200 px phone floor: an
>    armed cycle 1 with no clock; a mid-cycle-3 ledger with a running deadline
>    and two of three gods known; an over-cap burden bar with TRIBUTE beneath
>    it (the #13 regression guard). Set `run.tutorialBeat` explicitly in every
>    new scene (FINDINGS #10). **Review each new baseline as an image and say
>    what you judged**, not just that it was captured.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says, and for every baseline that moved, say why the pixels moved.

Acceptance: a human looks at the panels at both viewports and says they are
legible and dense enough. `#13`'s overlap is gone on its own evidence
screenshot. The dock reads IDLE, not BLOCKED. No panel overlaps the depth
readout, the boon stack, the ruler or the debug panel at any viewport down to
200 px.

---

## 7. The docs owed (SPEC §18 and DESIGN.md)

### 7.1 `docs/SPEC.md` — new §18

The next free number is **18** (§17.11 ends at `:1138`; there is no trailing
matter). Follow §17's shape: a provenance line, then `### 18.N` subsections,
numbers in GFM tables with the load-bearing ones bolded, ASCII arrows, code
references backticked and `path#member`-qualified.

Subsections to lock:

- **18.1 The nouns.** `cycle`, `tribute`, `demand`, `favour`, `receiver`. State
  that a Cloud Dock **is a hub** (D-B) so no sixth transport noun is coined
  against §17.1/D10.
- **18.2 The astral band, as widened.** `tw:128, origin.x:0`; world x
  `[0,1024)`, y `[0,320)`; the ten-row stone slab at rows 30–39 (y 240–320) and
  that its top edge is ragged by `layer()`'s lip carve; astral's floor top to
  surface ground = 240 px = 30 tiles; that the surface→astral gap is
  **3 segments at 12 tiles each** and why; and that **0 M does not move** (D9).
- **18.3 The two receivers.** Full rows for `cloud_dock` and `altar`:
  footprint, footing, blocks, `accepts` selectors, `buffer.cap`, `catchBox`
  slack, held substance and mass, build bill and `secs` for the dock; and for
  the altar, that it has no substance and no recipe and is placed by the
  director. Include the sentence that the receiver **is a sink**, quoting
  `rules/machines.js:174-177`, so the deliberate crossing of that line is on
  the record.
- **18.4 The cycle table.** §4.9 verbatim, with the ore-equivalent column
  showing the §8 arithmetic.
- **18.5 The ledger.** `run.cycle`, `run.tribute` (`{id, have, left}`),
  `run.favour`, `run.charted`, `run.misses`; that the deadline accumulates from
  `dt` at the fixed 1/120 s step and never from `Date.now()`; that two misses
  ends the run through `write.hurt`.
- **18.6 Rewards and punishments.** What a draft offers per tier and which
  `draftable()` it comes from; that charting is knowledge and not access (D-D)
  and that its payoff arrives with more bands; the punishment values.
- **18.7 The fall off the dock.** The §3 arithmetic: 240 px, 392 px/s, 5 hearts,
  dead. And the honest caveat that a parked carrier in the shaft will catch the
  player, which is correct and must not be special-cased.
- **§17.6 amendment** (from 10a): the endpoint-footing exemption, written in
  §17.2's own style for its `footing:2` history.

### 7.2 `docs/DESIGN.md`

Two fixes the brief names, both confirmed:

1. **`:96`** — *"Tribute must escalate in **refinement, not volume**. Cycle 1:
   20 copper plates."* SPEC `:73` and `:91` lock **10 raw copper**. SPEC wins;
   the divergence is three-way (quantity 20 vs 10, form plate vs raw, and
   `:91`'s "each cycle … with a deadline" against `:73`'s "No clock"). Fix all
   three in the same commit.
2. **`:100`** — *"The HUD shows a static cycle-4 tribute panel as decoration."*
   Doubly false: no such panel exists (`AUDIT-2.md:500-504`, re-verified — the
   only traces are comments at `view/hud.js:505` and `:585`), and DESIGN's own
   `:96-97` puts the progression at cycles 1–6, so "cycle-4" is not even the
   endpoint it would decorate. Delete the sentence and replace it with the
   truth after this phase.

**Status table** (`:246-279`) rows to flip:

| line | row | after Phase 10 |
|---|---|---|
| `:276` | tribute cycles, boon drafting, favour — *"no (drafting is exercisable by key, no director)"* | **yes** — `data/cycles.js` + `rules/cycles.js`, four cycles, the draft offered on completion |
| `:275` | suspicion meter, Hades gated by depth — *"no"* | still **no**, but say that `masked` now exists and is in use, so the "Hades masked as `????????`" half is one predicate away |
| `:262` | fog of war plus a map overview — cites only `rules/reveal.js` | add `view/overview.js` and `view/ui/ruler.js` (Phase 9 extracted the old `drawMap`; `scene.js:83-85` records it) |
| `:279` | run loop, death, meta-progression — *"`meta` has no save"* | still partial, and now honest about `meta.godsMet` being written but unsaved (D-I) |

**Three more DESIGN.md lines this recon found false**, worth fixing while the
file is open (they are cheap and they mislead):

- `:273` — *"no grid, queue or tabs — Phase 5"*. False: `view/ui/grid.js`,
  `view/ui/tabs.js`, `mainPanel.js:50-54`'s three tabs and
  `shell/ui.js:160-179` all exist. Only "queue" is still absent.
- `:270` / `:181-182` — *"drag-to-equip UI still Phase 5b"*. False:
  `shell/main.js:450-490` implements it; the `p` key (`input.js:129-132`) is
  now a redundant alternative, not the only path.
- `:79-80` — *"the lift's speed asymmetry"* names a machine that no longer
  exists in `src/`. It is describing `reference/mockup/`, which is preserved,
  so a parenthetical is enough — but a reader arriving from `:260` will trip.

### 7.3 `docs/AUDIT-2.md`

Do **not** rewrite it — it is Phase 6.5 recon and dated as such. But
`AUDIT-2.md:62-64`, `:181-187`, `:191-193` and `:236-241` all reason from
`data/machines.js:148`'s `lift.toBand:'astral'`, which no longer exists, and
`:487-489`'s claim that no `altar`/`favour` string exists in `src/` is already
false for both after Phase 9 and 8a. Add a dated staleness banner naming those
five spans. `docs/PLAN-gears-and-winches.md` §7 is the precedent for patching a
document rather than silently letting it rot.

---

## 8. Explicitly not designed here

- **Cloud-island geometry for astral.** Astral's floor is a full-width stone
  slab and stays one. Making the Heavens *look* like heavens is worldgen plus
  `view` plus its own visual review, and it is not what makes the band a
  destination. Deferred, named, not designed.
- **Cycles 5 and 6.** They need `essence` (60:1) and `ambrosia` (~400:1), which
  SPEC §8 marks not implemented. A cycle demanding an unmakeable substance is
  the orphan failure `tools/content.mjs`'s reachability fixpoint exists to
  catch (D-J).
- **The suspicion meter and the Hades act.** DESIGN `:206-242`. This phase must
  not spend the reveal (§4.2) and must not pre-empt it. `suspicion` still has
  zero occurrences in `src/` and should keep them.
- **A real band lock.** D-D rejects it: it needs unbreakable terrain at band
  seams and it contradicts "down is free".
- **A save for `meta`.** DESIGN `:279`. Favour is written to `meta.godsMet` but
  nothing persists it, and this phase should not be the one to invent
  persistence (`CLAUDE.md`: no `localStorage`).
- **Clickable HUD panels.** D-F. It would cost widening two hardcoded
  always-on-UI ids and nothing in the brief needs it.
- **Retuning `burden`, `segUp`/`segDown` or the compression ratios.** SPEC §8,
  §9 and §17.4 stand. What §4.5 measures is a *cost*, and if it is too high the
  lever is `segReach`/`hub.reach`, which are already tunable and scoped.

---

## 9. Risk register

| risk | why it is likely | mitigation in this plan |
|---|---|---|
| **10a's exemption lets a cable through real rock.** | Any blind spot in a clear-path test is a hole. | The exemption is two tiles per endpoint, both under a machine, in a footprint `placementCheck` proved clear with a footing tile it proved present. 10a's harness must assert a genuine mid-span obstruction still refuses, and must see that assertion fail first. |
| **The ascent is priced too high and simply is not fun.** §4.5: 4 hubs, 3 cranks, ~108 ore, 30 tiles of scaffold, 40.5 T against a 40 T cap. | This is the first time "up is expensive" has been asked to carry a whole win condition, and nothing has playtested it. | 10b's acceptance is a physical walkthrough by a human who is asked to report what felt bad. Every lever is a tunable (`segReach` is scoped to the machine, so a longer-reach hub tier is a `variantOf` row and needs no engine edit). |
| **The astral crank bootstrap reads as a deadlock.** The top segment lies wholly in astral and needs a crank there. | Components are per band (`rules/drive.js:404-417`) and the player must carry a crank up on a carrier they have not driven yet. | Named in §4.5. 10b must walk it and either give it a callout or record that it is acceptable. Do not "solve" it by making components cross bands — that breaks §17.9. |
| **Baseline churn.** The astral widening moves the camera; the furnace grant changes the CRAFT panel; 10c adds panels over half the HUD. | Unavoidable given three separate real changes. | Every re-accept is its own commit with its own stated reason, and 10c reviews each new shot as an image rather than merely capturing it. |
| **The `catchBox` slack is wrong and the dock silently swallows nothing.** | The released haul appears *inside* the footprint at the anchor, not falling in through the mouth — the mouth rects are 4 px tall and computed at placement (`model/machines.js:34-40`). | 10b must assert the arithmetic, not eyeball it. A dock that never credits is a phase that looks finished and is not. |
| **The deadline is the game's first wall-clock quantity, and nothing has ever tested one.** | Every existing framerate assertion is about distance or hardness. | 10b's harness must expire a deadline at 30 fps and at 144 fps and compare, in the same style as the existing hardness table. |
| **FINDINGS #10 gets worse.** Two more callout strings means two more unrelated scenes that can acquire one. | It is already open and already re-opened once (`:1557`). | Both 10b and 10c are told to set `run.tutorialBeat` explicitly in every scene they baseline. Fixing #10 itself is still not this phase's. |
| **`tools/content.mjs` does not know about `data/cycles.js` and silently validates nothing.** | Its table registry is a static import block (`:17-30`) with no discovery, so a new table is simply absent rather than failing. | Named as an ownership amendment (§5), with assertion 12 (`:429-442`) as the template and "seen to fail against a deliberately broken row" as the acceptance. |
