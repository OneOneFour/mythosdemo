# Plan — wave 4, part 1: legibility, the ladder, the collect default, and the loop's punch list

**Status: BUILT.** Phases 13a-13d all landed. Kept below as the design
record; the "PROPOSAL" framing that follows describes the plan before it
was executed.

Everything below was read directly out of the repo at commit `818236e`
(Phase 12d gap-fix, the tip at time of writing); every `file:line` is real
and was verified by reading the file, not recalled.

This document covers four of the seven items in the brief. The other three
have their own documents, and the four are cross-linked because they share a
budget:

| item | document | phase |
|---|---|---|
| UI text contrast | **here**, §2 | **13a** |
| the ladder's sprite | **here**, §3 | **13b** |
| the auto-collect default | **here**, §4 | **13c** |
| the game-loop punch list | **here**, §5 | audit + proposed **13d** |
| mining drops become prerequisites; deposits deplete | `docs/PLAN-phase14-mining-and-drops.md` | 14a–14e |
| trees regrow from seeds | `docs/PLAN-phase15-trees.md` | 15 |
| a horizontal, procedural, unbounded world | `docs/PLAN-horizontal-chunks-SCOPE.md` | **scoping only** |

**Read first, every phase, no exceptions:** `CLAUDE.md` in full (especially
the twelve invariants and D1–D10) and `ARCHITECTURE.md` §1, §5 and §7.
`docs/SPEC.md` holds the locked numbers; `docs/DESIGN.md` holds the
reasoning.

---

## 2. Phase 13a — UI text contrast

### 2.1 The brief

> A lot of HUD/panel text currently renders in grey and is hard to read over
> the background.

True, and the codebase has already diagnosed it once: `view/overview.js:497-500`
says in so many words that *"a 5x7 character on top of mottled rock is
unreadable"*, and fixes it there with a backing rect. That fix was never
generalised.

### 2.2 Recon

**The two ink tones** (`src/core/palette.js:32`):

```
ui:'#d2c9b2'      the bright ink. ~12.9:1 against uiBack.
uiDim:'#7b7361'   the dim ink. ~4.3:1 against uiBack at full opacity --
                  and panels draw uiBack at 0.6-0.92 ALPHA over the live
                  world, so the effective figure is lower, and drops under
                  2:1 with no panel behind it at all.
uiBack:'#0d0b12'
```

`src/data/palette.js` adds no hex — it re-exports `core/palette.js` through a
throwing resolver (`colour(name)`), which is what `tools/content.mjs` checks a
`look` key against. So a new named tone is **one row in `core/palette.js`**
and nothing else, per the convention in that file's own header.

**Every module that reads the dim tone** (grepped, exhaustive):
`view/scene.js:534`, `view/overview.js:94`, `view/paint.js:381`,
`view/hud.js:76`, and `view/ui/{tooltip,ruler,quickbar,panel,slot,grid,tabs,bar,mainPanel}.js`
each bind it once at module scope.

**The text primitive** (`src/core/font.js:32-47`) has exactly two exports and
**no shadow, outline, weight or alpha parameter**:

```js
export function textWidth(s, sc = 1, tr = 1) { return s.length * (5 * sc + tr) - tr; }
export function drawText(g, s, x, y, col, sc = 1, tr = 1)
```

`fillStyle` is set **once per call**, outside the glyph loop. So a two-pass
shadow (whole string in the shadow tone, then whole string in the ink tone)
costs exactly **two** `fillStyle` writes per `drawText`, not two per glyph.
Interleaving per-bit would force a `fillStyle` swap per pixel and must not be
done. At ~11–14 `fillRect`s per glyph and ~500 glyphs on the heaviest screen
(overview mode), the second pass is a few thousand extra 1×1 fills a frame —
negligible beside world painting, which is per-pixel over the viewport.
`textWidth` needs no change: a 1 px offset does not alter advance width. No
existing call site passes more than 7 arguments.

**There is no text shadow, outline or halo anywhere in `src/` today.**
Grepped `shadow|outline|halo|stroke|glow` across `src/view/`. What exists
instead, and is the stronger precedent:

- **the backing-rect idiom**, used in exactly three places and for exactly
  this problem: `view/ui/ruler.js:209` (a `BACK` rect behind each band
  label), `view/overview.js:478-481` and `:512` (a backing block behind a
  pile count and a machine glyph, with the reasoning written at
  `overview.js:497-500`).
- `view/ui/panel.js:22` — `SHADOW = mix(BACK, DIM, 0.35)`, used for panel
  bevels rather than glyphs, but it is the naming and derivation precedent
  for a new shadow constant.
- `view/treatments.js:511-530` — world sprites already use a 1 px dark
  outline all the way round, for the identical legibility argument.

**Sites with no panel behind them at all** — text straight onto rendered
world, the worst cases: `view/scene.js:534` (a band-name label with zero
backing), `view/hud.js:186, 235, 270, 403, 407, 414, 550, 644, 760, 768, 773, 775`,
`view/overview.js:481, 514, 834`.

**Two choke points carry most of the visible grey**: `view/ui/bar.js:54`
(every bar's value text — burden, tribute, aggregate percentages, frequently
unpaneled) and `view/ui/tooltip.js:38` (every tooltip body line except line
0, which covers band tips, recipe tooltips, pair tooltips and machine
tooltips — the single highest-traffic grey text in the game).

### 2.3 The ten places grey is load-bearing — DO NOT BLANKET-WHITEN

This is the reason this phase is medium and not trivial. Each of these
encodes state in dim-vs-ink; whitening them deletes information:

| # | site | what dim MEANS |
|---|---|---|
| 1 | `view/ui/ruler.js:192, 211` | band **not yet discovered** — doubled with the `????????` mask. The file header owns this convention. |
| 2 | `view/overview.js:652` | the same masked-unknown-band convention, in a tooltip |
| 3 | `view/ui/mainPanel.js:561` (`STATE_COLOUR`) | machine state **UNFUELLED/IDLE**, one of a 5-colour scale, also consumed by the overview's map glyphs |
| 4 | `view/ui/mainPanel.js:170, 173` | AUTO COLLECT is **off** (green = on) |
| 5 | `view/ui/mainPanel.js:397` | the search box's **empty placeholder**. Whitening makes an empty box look like it contains the word SEARCH. |
| 6 | `view/ui/tabs.js:40` | **inactive tab**. The only other cue is a subtle background tint. |
| 7 | `view/overview.js:892` | FOLLOW mode is **off** |
| 8 | `view/overview.js:923` | a map layer is **toggled off** in the legend |
| 9 | `view/hud.js:325` | depth is **at or above the spawn datum**. The weakest of the ten; arguably safe to whiten. |
| 10 | `view/ui/mainPanel.js:411-413, 485` | an **undiscovered** recipe ("UNKNOWN — NOT YET STOLEN") |

**Safe to whiten outright** (pure de-emphasis, no state encoded):
`view/hud.js:270, 312, 407, 414, 775` and the death-screen depth row
(`:755-760`); `view/ui/bar.js:54`; `view/ui/mainPanel.js:240, 576, 580-582, 592, 595, 599`;
`view/ui/tooltip.js:38` **except** where the line is a mask or an UNKNOWN
notice; `view/overview.js:834, 888, 897`; `view/scene.js:534`.

### 2.4 The design

Three moves, in this order, and the third is deliberately narrow.

**(a) Two new named tones, one row each in `core/palette.js`.**

```
uiInk2  a near-white body tone for de-emphasised text that must still read.
        Proposed '#e8e2d2' -- brighter than `ui`, so the hierarchy survives:
        `ui` stays the PRIMARY tone (labels, line 0 of a tooltip) and
        `uiInk2` becomes the SECONDARY one, instead of secondary meaning
        "illegible".
uiShade a text shadow tone. Derived, not picked: mix(uiBack, '#000000', 0.5),
        following `panel.js:22#SHADOW`'s own derivation idiom. Must be
        OPAQUE, not an alpha, because several call sites run under a live
        `g.globalAlpha < 1` (hud.js's callout/banner fades, the overview
        legend) and an alpha shadow would let the ink pass bleed through it.
```

`uiDim` **stays**, unchanged in role and slightly raised in lightness
(proposed `#98907c`), because the ten sites above need a tone that reads as
*secondary/off/unknown* while still being legible. This is the whole point:
the fix for "the dim tone is illegible" is not "delete the dim tone".

**(b) Reclassify the safe sites** from `UI.dim`/`DIM` to `uiInk2`, per the
table in §2.3. Every one of the ten load-bearing sites keeps `uiDim`.

**(c) An optional shadow argument on `drawText`**, used only where a site is
genuinely unpaneled:

```js
export function drawText(g, s, x, y, col, sc = 1, tr = 1, shadow = null)
```

`shadow` is a colour string or `null`. When set, the whole string is drawn
once at `(x + sc, y + sc)` in the shadow tone, then once at `(x, y)` in
`col` — two full string traversals, two `fillStyle` writes, no per-glyph
swap. `textWidth` is untouched.

**Where the shadow is used, and where a backing rect is used instead.** The
rule, stated so the phase does not turn into taste:

- a site **already inside a panel** gets **no** shadow. The panel is the
  backing.
- a site **with no panel** and **adjacent to other backed sites** gets a
  **backing rect**, extending the existing idiom (`ruler.js:209`,
  `overview.js:478-481`) rather than inventing a second mechanism next to it.
  This covers `view/overview.js:481, 514, 834`.
- a site **with no panel** and **nothing to back it against** gets the
  **shadow**. This is `view/scene.js:534` (the band-name label) and the
  `view/hud.js` unpaneled list in §2.2.

**Known cosmetic caveat, stated so it is not discovered.** With a 1 px
diagonal offset, ink and shadow overlap wherever two adjacent bits are set —
common inside strokes in a 5×7 font. If that reads as double-darkening on a
real screen, the fallback is the project's own existing answer: a backing
rect. Do not solve it by raising `maxDiffPixels`.

### 2.5 What is NOT in this phase

- **No layout change of any kind.** D8 (anchored layout over measured text)
  is *already* the rule and `view/ui/bar.js:45-54` already implements the
  measured-value clamp. `docs/FINDINGS.md` #13 ("a HUD label can overlap the
  burden bar at wide values") is parked and stays parked — it is a layout
  bug, this is a contrast phase, and fixing both in one commit makes the
  baseline diff unreviewable.
- **No new panel, no repositioning, no font scale change.**
- **No `fillText`.** Ever. Invariant 11.

**Landed**: `uiInk2`/`uiShade` in `core/palette.js`, `drawText`'s 8th
parameter in `core/font.js`, the classified recolour across `view/hud.js`,
`view/scene.js`, `view/overview.js` and the `view/ui/` files this section's
FILE OWNERSHIP named, with the ten load-bearing sites in §2.3 left on
`uiDim`. The executed prompt is git history.

---

## 3. Phase 13b — the ladder

### 3.1 The rename already landed

`src/data/forms.js:148-152`:

```js
  { id:'rung', label:'LADDER',
    size:3, massK:0.3, hudOrder:9,
    tags:[],
    subTags:['organic'],
    tile:{ solid:false, climb:true, hardK:0.20 } },
```

Commit `7c6993c` ("Rename the rung form's display label from RUNG to
LADDER") did it, one line, one file. `labelOf()` composes
`SUB.name + ' ' + FORM.label`, so a held one reads **TIMBER LADDER** today.
The internal id is still `rung`.

**Recommendation: do not rename the id.** The blast radius is 2 lines of
`src/` (`forms.js:148`, and `recipes.js:289`'s `out:[{sub:'timber',
form:'rung', n:4}]`), 11 `F.rung` uses in `tests/visual.spec.js` (lines
1662, 1791, 2030, 2069, 2099, 2107, 2119, 2247, 2261, 2278) and mentions in
ten docs plus `CLAUDE.md`/`README.md`/`FUTURE_IDEAS.md`. No save format is
at risk (a tile stores a packed ordinal, never a string id). But it buys
nothing a player can see, and `data/forms.js`'s own header calls rows
append-only for reasons that make id churn the wrong kind of edit. If the
orchestrator wants it anyway it is a separate one-commit chore, not part of
this phase.

There is a second ladder tier and it is unaffected: `stair`
(`forms.js:169-173`, `copper/stair`, `climbK:1.8`).

### 3.2 So the real work is the sprite — and there is no sprite

**A placed ladder currently renders as a plain 8×8 timber square**,
pixel-identical to a native trunk minus its canopy.

No `look:{}` block exists on any *form* row — `look` lives only on
substances and machines — and terrain painting is entirely substance-driven
and form-blind. `view/paint.js#paintTile` (`:259-315`) resolves the
**substance** row through `look()`→`rowAt()`. The only place `view` consults
the form at all is `paint.js:222`, and solely to suppress canopy on a placed
log or rung.

So a placed `timber/rung` goes down the shared `paintTile` path: base fill,
hash grain, lit top row (`:276-281`), `cliffFace` on each open left/right
neighbour (`:300-303`), a bottom shade line (`:304`), then
`treat(g, L.row.look, cell)` (`:307`). Because `rung.tile.solid === false`, a
ladder in an open shaft gets a lit top **and both** jittered cliff faces
**and** the bottom line — which is why it reads as a floating, edge-lit wood
cube rather than as rungs and rails.

Tile size is **8×8 px** in every band (`tile:8, chunk:16` → 128×128 px chunk
canvases). Timber's palette (`substances.js:93-104`) is
`base:'woodB', hi:'woodA', lo:'woodD'` →
`woodA:'#8f6739' woodB:'#6d4b28' woodC:'#4d3419' woodD:'#33220f'`
(`core/palette.js:27`), depth-blended toward `INK.deep` in 12 steps.

**The drawing vocabulary** is `view/treatments.js`: `TREAT[fn](g, cell, p)`
with `cell = {px, py, tx, ty, tile}`; params must name colours from
`tools/content.mjs#COLOUR_KEYS`; `hash2` is allowed and `rand()` is
forbidden (invariant 7). Ten treatments exist (`glint, halo, banded, canopy,
grassCap, gearWheel, drum, frame, crankArm, shaft`) plus helpers `disc`,
`discShaded`, `seedAt`. Primitives: `R`, `lineTo`, `glow`, `noiseFill`,
`hash2`. No canvas transforms, no per-pixel arrays.

**The one trap.** `treat()` is called with the **substance's**
`look.treatments`, never the form's, so a `look` block written on the `rung`
row would be read by nothing. And a third name-check inside `decorate` is
explicitly forbidden — `CLAUDE.md` D7's own reasoning, and `decorate`'s own
comment, say a third name check does not belong there. **So the shape is a
form-aware branch in `paintTile`**, keyed off the form's `tile` block, not a
name check bolted onto `decorate`.

### 3.3 The design

**A new optional `look` block on a FORM row**, read in exactly one new place.

```
FORM[f].look = { treatments:[ { fn:'ladder', rail:'woodC', rung:'woodA' } ] }
```

`paintTile` gains one branch, after the substance's own `treat()` call:

```
const fr = formRowOf(tileAt(b, tx, ty));      // model/tiles.js, already exported
if (fr?.look) treat(g, fr.look, cell);
```

And the generic cube passes are **suppressed for a form that declares its own
look**: no lit top row, no `cliffFace`, no bottom line. A ladder is not a
bank of rock and should not be lit like one. That suppression is what
actually makes it read as a ladder; the treatment alone, drawn over the cube,
would still look like a cube.

**The sprite, at 8×8, integer pixels:**

```
. X . . . . X .        two side rails, 1 px wide, at x=1 and x=6, in `rail`
. X X X X X X .        a rung across the full inner width every 3rd row,
. X . . . . X .        in `rung` (the lighter tone), so a stacked column of
. X . . . . X .        ladder tiles produces evenly spaced rungs with no
. X X X X X X .        tile-to-tile seam
. X . . . . X .
. X . . . . X .
. X X X X X X .
```

Rung rows are chosen from `ty` (`ty * 8 + y` modulo the pitch), **not** from
a per-tile counter, so the pattern is continuous down a shaft and a ladder
placed at any row still lines up with the one above it. That is the whole
reason to derive from the absolute row rather than from the tile: a 3-row
pitch computed per tile would reset at every tile boundary and produce a
visible stutter.

`copper/stair` gets the same mechanism with a different tone and a wider
tread (proposal: rails at x=0 and x=7, treads 2 px deep every 4th row), so
the two tiers read apart at a glance — which is the tier's whole point per
SPEC §10.

**Held/dropped and inventory appearance are out of scope**, named so the
omission is a decision: on the ground a ladder uses `paint.js:470-488`'s
generic swatch (`look.item` colours × `FORM.size` = 3 px) and in a slot it
uses `view/ui/mainPanel.js:186-190`'s `swatchOf(slot.sub)` plus a `'#'`
glyph shared with `log`, `stair` and `gravel`. Differentiating those is a
separate, larger inventory-iconography question.

### 3.4 Why this moves zero baselines, if scoped right

Zero of the 73 existing baselines are named for ladder or rung, and none of
the rung/ladder tests takes a screenshot at all — they are assertion-only.
The baselines at *indirect* risk are the ones sharing `paintTile`'s generic
wood path (`ui-crafting`, `ui-character*`, and native-timber scenes
`digging`, `topsoil`, `surface*`, `shaft-*`). **If the branch fires only for
a tile whose FORM declares a `look` block, native timber's path is untouched
and no existing baseline moves.** One new baseline is added, following the
`shaft-unlit`/`shaft-lit` precedent.

Invariant 3 holds unchanged: a ladder is a real terrain tile baked into the
chunk canvas (`rules/placement.js:191-213` → `model/tiles.js#write.set` →
`write.touch` bumps the chunk and its seam neighbours; `paint.js#chunkCanvas`
re-bakes under `REPAINT_BUDGET = 8`). A richer sprite is a bake-time cost,
not a per-frame one. Climbing is form-blind (`rules/player.js#boxClimb`/
`climbAt` key off `FORM[f].tile.climb`) and is unaffected by anything
visual.

### 3.5 Two pre-existing doc inaccuracies to fix while in the area

Not part of the sprite work; one line each, and both are in files this phase
opens anyway:

- `src/data/forms.js:63-64` and `README.md:59` claim a standing tree is
  climbable via `log`'s `climb:true`. **False today** —
  `rules/generate.js:293` writes trunks as NATIVE tiles, which fall back to
  the substance's own `tile` block (no `climb`), and
  `rules/player.js:293-294` documents the correct behaviour.
- `src/data/forms.js:63` calls `log` "the only tile-capable form". Stale:
  `rung`, `stair` and `gravel` are too. (And `docs/PLAN-phase14-mining-and-drops.md`
  changed that list again once it landed.)

**Landed**: `TREAT.ladder` in `view/treatments.js`, `paintTile`'s form-look
branch in `view/paint.js`, `look` blocks on `rung` and `stair` in
`data/forms.js`, and both stale comments above fixed. Zero existing
baselines moved. The executed prompt is git history.

---

## 4. Phase 13c — the auto-collect default

### 4.1 What is actually live today

**The field is `ui.autoCollect`, in `src/shell/ui.js:55-68`, and its declared
default is `false`.** It is a UI preference: not on `run`, no `RUN_SCHEMA`
entry, no tuning row. Its only mutator is
`src/shell/ui.js:265#toggleAutoCollect()`.

**There is exactly one gate and no bypass.** `run.inv` is only ever added to
by `model/run.js#write.collect`, which has exactly one real caller —
`src/rules/items.js:127`, inside the pickup branch gated at
`src/rules/items.js:119`:

```js
if (cmd.collect && it.age > MAGNET_DELAY && !run.dead && near(it, c, pickupR)) { ... }
```

(The only other caller is `shell/main.js:878`'s `give()`, which is
test-hook-only behind `?test=1`.) Every gift path in the game — the starter
kit, a trinket or miracle draft, a tribute reward, a crafting output, a
machine ejection, a mining drop, the `q` drop verb — spawns a **falling
item** rather than crediting inventory (invariant 5), so all of them are
correctly behind that one gate. **No leftover always-on magnet branch
survives anywhere in `src/rules/`.**

The two read sites are `src/shell/main.js:115`
(`collect: ui.autoCollect || cmd.collect`, the only functional one) and
`src/view/ui/mainPanel.js:169-170` (the toggle's own label text and colour).

**So the mechanism the brief is worried about does not exist as a bug.** Say
that plainly.

### 4.2 The one real gap: `newRun()` does not reset it

`src/shell/boot.js:70-140`'s teardown clears world, machines, segments,
items, mining, mods, boons, aim, journal, paint, fx and audio and calls
`runw.reset(seed)` — and **never touches `ui`**. `model/run.js#write.reset`
rebuilds `run` from `RUN_SCHEMA`, which has no collect field. So: turn AUTO
COLLECT on once, die, restart — it is still on.

`src/shell/ui.js`'s own header calls this deliberate ("would silently forget
the player's choice on every restart"). But it puts the field in tension with
invariant 8 ("`newRun()` resets everything. A field surviving a restart is a
determinism bug"), and it means "off by default" is unmet across a restart
even though it holds at page load. There is no `localStorage` anywhere
(forbidden by `CLAUDE.md`), so it cannot survive a page reload either way.

**This is the one decision this phase exists to make.**

### 4.3 Decision D13-A — does a restart reset the collect preference?

**Recommendation: yes, reset it.** One line in `shell/boot.js#newRun`'s
teardown block, beside `digw.clearAll()` at `:79`.

The argument is not aesthetic. Invariant 8's *reason* is determinism: two
runs from the same seed and the same inputs must produce the same run.
`ui.autoCollect` **changes simulation state** — it ORs into `cmd.collect`
(`main.js:115`), which gates a `write.collect` that changes `run.inv`, which
changes burden, which changes climb speed and carrier load. It is therefore
**not** a pure presentation preference like mute or the grid overlay; it is
an input. An input that survives `newRun()` makes `newRun(1337)` produce two
different runs depending on what the player clicked before dying, which is
exactly the class of bug invariant 8 names.

Rejected alternative: **keep it sticky and amend the `ui.js` header to argue
it explicitly against invariant 8.** Cheaper (zero code), and defensible on
pure UX grounds — losing a deliberate preference on every death is annoying.
Rejected because the determinism cost is real and the annoyance is small: the
toggle is one click in a panel the player opens anyway, and every other
input-affecting piece of state in the game already resets.

If the orchestrator prefers the sticky reading, that is a legitimate call —
but then `ui.js`'s header must say "this is an input that survives
`newRun()`, and here is why that does not break invariant 8", and
`tools/check.mjs`'s `newRun` fingerprint probe must be taught that it is an
allowed exception. Do not leave it undocumented either way.

### 4.4 Two currently-vacuous test probes

`tools/check.mjs` never mentions `autoCollect`, and `stepReal` resets
`collect:false` on each substep by default, so every probe runs with collect
off unless it explicitly asks. Only one does (the trinket-draft probe,
`:612-617`, correctly updated in Phase 12b). Two others look green and now
prove nothing:

1. **The burden fuzz** (`tools/check.mjs:574-593`) — 7,200 substeps, never
   sets `collect`, asserts burden never exceeds the cap. Nothing can enter
   `run.inv` at all during the fuzz, so `burdenOf()` is identically 0 and the
   assertion is unfalsifiable. It passes while proving nothing about the
   refusal branch at `rules/items.js:124`.
2. **The mass-conservation fuzz** (`tools/check.mjs:867-928`) — wraps
   `write.collect`/`spend` and runs 10,000 substeps with dig and craft but no
   collect. The wrapped `collect` is never invoked through the real path, so
   coverage silently shrank to `items.spawn`/`remove` plus machine
   `take`/`consume`.

Both need a `collect:true` substep mixed in, following the pattern the
trinket probe already uses. This is precisely the danger Phase 12's own risk
register named ("a test asserting automatic pickup silently starts failing
once `cmd.collect`/`ui.autoCollect` gates it") — landing on the other side of
the coin: the test did not fail, it went hollow.

### 4.5 A setter, not a toggle

`toggleAutoCollect()` was a blind **toggle**: its six call sites in
`tests/visual.spec.js` were safe only because each did a fresh `page.goto`
first, and a toggle asserts the caller already knows the current value —
true there only by accident. `setAutoCollect(bool)` replaces it, and the
value is now exposed on `__mf.ui` so a test never has to blind-toggle to
reach a known state.

**Still live, not fixed:** `__mf.hold({collect:1}, n)` never releases —
`clearEdges()` does not clear `collect`, so `cmd.collect` stays latched true
for the rest of that page's life after any use. Not broken today, and
unrelated to the setter above (this is the raw `'c'` hold command, not the
`ui.autoCollect` preference).

### 4.6 Two stale comments

- `src/rules/tutorial.js`, beat 2: "Stock pickaxe planted in the soil. Walk
  into it to take it." Untrue since Phase 12b — you must hold `c` or have the
  toggle on. Not a functional bug (beat 3 counts ground items, so progression
  is not blocked), but the beat sheet's own text is now wrong.
- `src/shell/boot.js:125`: "the existing pickup radius does the rest".
  Same staleness.

`docs/SPEC.md` §5's beat sheet said the same thing in prose ("Walk into it to
take it") and was corrected in the same commit.

**Landed**: D13-A implemented (`ui.autoCollect` resets to `false` in
`shell/boot.js#newRun`), `setAutoCollect(bool)` added and exposed on
`__mf.ui`, the two vacuous probes given teeth, both stale comments and
`docs/SPEC.md` §5 beat 2's prose fixed. The executed prompt is git history.

---

## 5. Item 7 — the game loop: what exists, what is stubbed, what is absent

This section is an **audit, not a phase**. §5.3 proposes one phase out of it.

### 5.1 The headline

The plumbing is real and disciplined. A director ticks every frame
(`shell/schedule.js:200`), deliveries are counted, deadlines count down at
the fixed step, misses hurt, two misses kill, and rewards fire. What is
missing is everything that makes it *feel* like a loop, and everything that
makes a harder task actually *harder*.

### 5.2 The punch list, ordered by how much it blocks the loop

| # | item | verdict | where |
|---|---|---|---|
| 1 | **Cycles 2–4 are payable at the spawn altar.** `drainReceivers` never checks that the receiving machine matches `cyc.at`; the altar is never despawned and accepts `*/#refined` at `handFeed.reach:10`. You can beat cycles 2, 3 and 4 by hand-feeding the starting altar four tiles from spawn — no ascent, no dock, no drivetrain. The file's own header (`:102-108`) documents this as intentional ("regardless of which one `cyc.at` names"). | **loop-defeating** | `src/rules/cycles.js:109-122` |
| 2 | **The Cloud Dock has no `minDepth` or band gate.** The only depth-gated machine in the table is `kiln_divine` (`minDepth:200`). Nothing stops building the dock on flat ground at spawn, so "ascend to the Heavens" is fiction. | **absent gate** | `src/data/machines.js:713-716`, `src/model/run.js:416-421` |
| 3 | **No content past cycle 4 and no end state.** `ensureLiveCycle` hits `run.cycle > CYCLES.length` and returns forever (`src/rules/cycles.js:71`). The TRIBUTE panel vanishes, FAVOUR keeps drawing 8/8, and there is no banner, toast, sound or screen. The game does not end; it runs out. (Cycles 5–6 wait on the unimplemented `essence`/`ambrosia` tiers — that half is an acknowledged gap, not a bug.) | **absent** | `src/rules/cycles.js:71`, `src/data/cycles.js` |
| 4 | **The draft is 1-of-1, not 1-of-3.** `wants.draft` takes `draftable()[0]` and auto-grants it — no offer, no choice, no pause. `docs/SPEC.md` §18.4 promises "draft 1-of-3" for three of four cycles. | **stubbed, contradicts SPEC** | `src/shell/main.js:297-316` |
| 5 | **Three of the four gift tiers have exactly ONE content row** (`data/grants.js:13-18`, `trinkets.js:20-27`, `miracles.js:24-29`, each self-documented "the tier is the point and the content is not"), so 1-of-3 is not constructible regardless of #4. Only `data/boons.js` has enough rows (5). | **stubbed content** | as cited |
| 6 | **Cycle 4's trinket draft is a guaranteed no-op.** The only trinket (`bellows`) is already handed over by cycle 1's `chance:1` drop row, so `draftable()` is empty by cycle 4. | **real bug** | `data/drops.js:17` vs `data/cycles.js:137` |
| 7 | **Cycle 2's grant draft always yields `kiln_divine`**, which has `minDepth:200` and is unplaceable anywhere a cycle-2 player has plausibly reached. | design smell | `data/machines.js:420` |
| 8 | **Completion, payment and debt are all silent.** The `'cycle'`, `'tribute'` and `'debt'` journal kinds appear in none of `shell/notify.js`'s `CHIPS`/`TEXT` tables nor `data/sfx.js#KIND_SFX`. The most important moment in the game — a god accepting your work — has zero feedback. | **absent feedback** | `src/shell/notify.js:29-56`, `src/data/sfx.js:16-31` |
| 9 | **Reward grants bypass `rules/grants.js`.** `rules/cycles.js:155` calls the raw model writer `rw.grant(id)` instead of `rules/grants.js#grant`, so cycle 1's furnace + dock reward pushes no `'grant'` journal row and therefore no toast. | **real bug** | `src/rules/cycles.js:155` |
| 10 | **Tutorial and callouts stop dead at cycle 1.** `BEATS` has 7 entries (padding + 6 real) and `CALLOUTS[6]` is `null` by design. The exact moment the game issues its first real demand — plates, a dock, a three-segment drivetrain and a 480 s clock, every one a first-time-ever ask — is the exact moment all guidance stops. | **absent, high player impact** | `src/rules/tutorial.js:156`, `src/data/callouts.js:26` |
| 11 | `run.misses` is displayed nowhere. The player never knows they are one miss from death. | absent | written only at `cycles.js:180` |
| 12 | **Favour has zero consumers.** A display scoreboard with no spender, no gate and no threshold anywhere. | stubbed | `model/run.js:291` + four read sites, all in `hud.js` |
| 13 | Charting ("a new depth band unlocks") only unmasks a name string. There is no band lock anywhere — `model/run.js:78-81` says so ("KNOWLEDGE AND NOT ACCESS"). | cosmetic, acknowledged | `view/ui/ruler.js:102-117` |
| 14 | **No rate or throughput demand exists.** Every demand is a flat count plus a linear wall-clock budget; nothing measures a sustained production rate. `docs/SPEC.md:75` promises "throughput quotas escalate from cycle 2 onward". Never shipped. | **absent, contradicts SPEC** | `src/data/cycles.js:22-32` |
| 15 | The deadline timer has no urgency treatment (plain dim text) while the boon stack flashes under 5 s. | polish | `hud.js:268-272` vs `:388` |
| 16 | The death screen shows cause and depth only — no cycle reached, favour, or misses. | polish | `hud.js:753-757` |
| 17 | No `data/gods.js`. God display names are hardcoded in `view/hud.js:450` covering 3 of the 5 god ids used elsewhere, so `ares` and `hades` can grant things but can never appear on the FAVOUR panel. | absent | `hud.js:450` |
| 18 | SPEC §5's beat says "sky darkens, clouds part, a shaft of light, an altar rises". The code places the altar fully formed at frame 0 with no presentation. | absent presentation | `rules/cycles.js:95-100` |
| 19 | No meta-progression, despite DESIGN.md's "banked favour carries between runs". `meta` has no save; acknowledged in code. | absent, acknowledged | `run.js:74-76, 201-205` |
| 20 | `run.known` (recipes) is seeded fully-known at run start, so "keeping stolen recipes" has no source that reveals one. | stubbed, acknowledged | `run.js:127-128, 184` |

### 5.3 Proposed Phase 13d — the shortest path to a closed loop

Items **1, 2, 3, 8 and 10**. Everything else in §5.2 is depth, not closure.

- **1** — `drainReceivers` respects `cyc.at`: a receiver whose machine id is
  not the live cycle's `at` does not credit. (The altar can stay standing; it
  simply stops paying for cycles it was not asked to.) This is a deliberate
  reversal of that function's own header comment, and the header must be
  rewritten to say so rather than left contradicting the code.
- **2** — a band gate on `cloud_dock`. Prefer `band:'astral'` over a negative
  `minDepth`, because D9 fixes the datum at the surface floor and a negative
  depth threshold is a second way of saying "in astral" that can drift from
  it. `placementCheck` (`model/run.js:416-421`) already has the slot.
- **3** — a real end: a win screen at `run.cycle > CYCLES.length`, reusing
  the death-screen drawing and hit-test idiom Phase 12d built.
- **8** — three `shell/notify.js#TEXT` rows, three `data/sfx.js#KIND_SFX`
  rows, and chip counts for `'cycle'`, `'tribute'`, `'debt'`. Plus **9**,
  which is one line and belongs in the same commit (route the reward through
  `rules/grants.js#grant` so the toast exists at all).
- **10** — extend `BEATS`/`CALLOUTS` past index 6 to cover cycle 2's four
  first-time asks.

**Docs drift to correct in the same commit** (this is not optional —
`CLAUDE.md`'s rule is that SPEC wins and gets fixed in the same commit):
`docs/SPEC.md` §18.4 says "draft 1-of-3" where the code does 1-of-1 (#4);
`docs/SPEC.md:75` promises throughput quotas that do not exist (#14); and
`docs/DESIGN.md` makes three promises the code does not keep — "the earth
opens further" (access, not a name-unmask), "you draft a boon" (real choice),
and "keeping stolen recipes and banked favour" (meta-progression). Mark each
as not-implemented rather than deleting the design intent.

**Landed**: `drainReceivers`'s `cyc.at` gate and rewritten header,
`cloud_dock`'s `astral`-band gate, the win screen at `run.cycle >
CYCLES.length`, the `'cycle'`/`'tribute'`/`'debt'` notify/sfx rows and the
`grants.grant` reroute, `BEATS`/`CALLOUTS` extended past index 6, and the
SPEC/DESIGN drift named above corrected in the same commit. The executed
prompt is git history; the locked numbers are `docs/SPEC.md` §20.

---

## 6. Sequencing — wave 4, part 1

Landed serially: 13a, then 13b (both owned `src/view/` —
`.claude/brain/phase-plan-conventions.md` rule 1), then 13c, then 13d.

---

## 7. Explicitly not designed here

- **The `rung → ladder` id rename.** §3.1: two `src/` lines, 11 test symbols
  and ten docs, for nothing a player can see. A separate chore if wanted.
- **Held-item and inventory-slot iconography for the ladder.** §3.3 — a
  distinct, larger question (every tile-capable form shares the `'#'` glyph
  today).
- **Any layout change.** §2.5. `docs/FINDINGS.md` #13 stays parked.
- **A text atlas or glyph cache.** `core/font.js` rasterises per-pixel with
  `fillRect` and the measured cost of a second pass is negligible (§2.2).
  Caching glyphs is a real optimisation and is not needed by anything here.
- **A `setAutoCollect` UI affordance beyond the existing row.** §4.5 adds the
  setter for testability only; the Character-tab row stays the one control.
- **Fifteen of the twenty punch-list items** in §5.2. Named, cited, and left
  in the table on purpose — this document is not a redesign of the cycle
  loop.
- **Throughput/rate demands** (#14) and **a real 1-of-3 draft** (#4/#5).
  Both are genuinely the next thing the loop wants after 13d, and both need
  content and a UI surface rather than a fix. They belong in their own plan.
