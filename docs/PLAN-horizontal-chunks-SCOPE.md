# SCOPING DOCUMENT — a horizontal, procedural, unbounded world

**Status: SCOPING ONLY. This is NOT a phase plan and must not be executed.**

It exists to answer three questions and nothing else:

1. Is it feasible in this codebase, and what exactly stands in the way?
2. How big is it, honestly, against the waves that have already shipped?
3. What is the right next step — and is that step "start building" or "go
   find out more"?

The answer to (3) is **go find out more**, and §8 says exactly what the
follow-up pass must establish before a single line is written. §7 offers a
cheaper intermediate that gets most of the feeling for a fraction of the
cost, and recommends it.

This follows the precedent of `docs/PLAN-gears-and-winches.md`: because the
change amends binding documents, §5 drafts the `CLAUDE.md` and
`ARCHITECTURE.md` diffs **for review and deliberately leaves them
unapplied**, and §4 fixes a vocabulary before any code can invent a second
one.

Everything below was read out of the repo at commit `818236e`; every
`file:line` is real.

---

## 1. The brief

> The player should be able to explore left/right without bound, generating
> new horizontal chunks on demand.

---

## 2. What exists today, precisely — and the two things called "chunk"

**The single most important clarification in this document: this codebase
already has horizontal *render* chunking, and has no *generation* chunking at
all. They are different concepts and the word "chunk" currently means only
the first.**

### 2.1 Render chunking — real, working, and unrelated to world size

A band declares `chunk:16` (`data/world.js`), so a chunk is 16 × 16 tiles =
128 × 128 px at every band's `tile:8`. `view/paint.js` lazily bakes one
offscreen canvas per chunk on first draw (`:123-146`), keyed
`b.ord * 0x10000 + cy * b.cx + cx` (`:124`), and re-bakes it when
`stackVer()` (the sum of its own and its eight neighbours' versions) moves.
`model/tiles.js#write.touch` bumps those versions; `REPAINT_BUDGET = 8`
throttles re-bakes per frame; `resetChunks()` clears the cache on `newRun()`.

That is invariant 3 ("a dig repaints its chunk, not the world"), and it works.
**It is not lazy world generation.** The tiles were all generated at boot; the
*canvas* is what is lazy.

### 2.2 Generation and storage — eager, whole-band, and fixed-width

`shell/boot.js:96-100`, once per run:

```js
  for (const cfg of BANDS) {
    const b = worldw.allocate(cfg);
    fieldw.allocate(b, cfg.fields);
    generate(b);
  }
```

`model/world.js#write.allocate` (`:27-75`) reads `cfg.tw`/`cfg.th` off the
frozen row and allocates **three dense typed arrays of `tw × th`** —
`mat`, `seen`, `light` — plus a `Uint32Array(cx × cy)` of chunk versions.
`model/fields.js#write.allocate` adds a `Float32Array(tw × th)` per declared
field. Today's world is 128 × (40 + 56 + 320) = 53,248 tiles, so about
270 KB of typed arrays. `rules/generate.js#generate(b)` then runs every
strata row over the whole band in declaration order.

`data/world.js` fixes `tw:128` on all three bands. `docs/SPEC.md` §1 records
"world width **1024 px = 128 tiles**, fixed, independent of viewport" as a
locked number.

### 2.3 The good news, and it is better than expected

**Nothing outside `model/` reads `b.mat`, `b.seen` or `b.light` directly.**
Grepped `b\.mat|\.seen\[|\.light\[|band\.mat` across `src/rules`, `src/view`
and `src/shell`: **zero hits.** Every reader goes through
`model/tiles.js#tileAt/solidAt/subAt/…`, `model/world.js#seenAt/lightAt`, or
`model/fields.js#fieldAt`.

That means **the storage layout is genuinely swappable behind
`model/world.js#idx` and `model/tiles.js`** — the layer discipline bought
exactly the thing it was supposed to buy. This is the difference between
"large refactor" and "impossible", and it is why §3's answer is *feasible*.

`model/segments.js` is also already clean: it stores **world pixels**
(`ax/ay/bx/by`), never tile indices, `sweepSpan` is bounded by cable reach
rather than world width, off-world is already a first-class refusal
(`'OUTSIDE THE WORLD'`, `:219`), and `chains()` is O(segments²) over "tens,
not thousands". **The whole transport subsystem needs no work.**

---

## 3. What actually stands in the way

Twelve items, ordered by how hard they are. Each is real and cited.

### 3.1 The generator is whole-band and stream-ordered — THE BIG ONE

`rules/generate.js` cannot be made chunk-local by refactoring. Three of its
passes are structurally global:

- **`heightmap()` (`:443-479`)** builds `Int16Array(b.tw)` and
  `Float64Array(b.tw)` and sums three `octave(b.tw, period, amp)` lattices
  drawn from `rand()`. A lattice sized to the band cannot be extended; the
  fix is a *positional* value-noise function of absolute column, which is a
  different function with different output.
- **`stepPass()` (`:481-499`, called twice at `:473-474`)** sweeps **outward
  from the spawn shelf in both directions**, capping each column's rise at 1
  tile and allowing a 2-tile descent only if the last big step was
  `STEP_GAP` columns ago. It is **inherently sequential over the whole
  width**: column *n*'s legal height depends on column *n−1*'s resolved
  height and on how far back the last big step was. There is no chunk-local
  formulation of it. It is what makes SPEC §16.2's traversability guarantee
  true, and that guarantee is what makes the first two minutes playable.
- **`unsealOreBodies()` (`:346-424`)** flood-fills from the surface with
  `cap = b.tw * b.th` to find ore bodies sealed inside adamant shells and
  carve a path. A whole-band reachability fixpoint, asserted over 200 seeds
  by Phase 11's TIER 1 harness.

And every scattering pass — `hollows`, `blobs`, `vein`, `trees` — draws
`row.count` attempts from the **`rand()` stream in band order**. Lazy
generation means generation order depends on where the player walked, so a
sequential stream cannot produce a reproducible world. **This is the
invariant-7 collision** (§5.3).

### 3.2 Signed tile coordinates break four packed integer keys

An unbounded world in *both* directions means negative tile and pixel
coordinates. Four places pack coordinates into one integer and all four
assume non-negative:

| where | key | breaks at |
|---|---|---|
| `model/world.js:168` | `idx = ty * b.tw + tx` | any `tx < 0` aliases to the previous row; `inBounds` (`:170-171`) is `tx >= 0 && tx < b.tw` |
| `model/space.js:22-23` | `cellKey = floor(y/32) * 100000 + floor(x/32)` | a negative x collides with the previous row's high buckets: `cellKey(-1, 0) === cellKey(99999, -32) === -1` |
| `model/mining.js:19` | `b.ord * 0x1000000 + idx(...)` | inherits `idx`; also overflows the 0x1000000 slot at `tw × th ≥ 16.7 M` |
| `view/paint.js:124` | `b.ord * 0x10000 + cy * b.cx + cx` | 65,536 slots per band; at topsoil's `cy = 20` that is `cx ≥ 3277`, i.e. **`tw ≈ 52,400`**, past which band N's chunk keys collide with band N+1's and blit the wrong terrain |

None is hard to fix individually (bias the key, or use a `Map` of `Map`s, or
interleave bits) but all four have to be fixed *consistently*, and one missed
is a silently-wrong answer rather than a crash — the exact failure class
Phase 12's risk register named for the `run.inv` dict→array conversion.

### 3.3 Two per-frame O(band width) loops

- **`rules/reveal.js:111-115`** — every frame where sky exposure matters:
  `for (tx = 0 .. b.tw) { for (ty ...) until first solid }`. The header
  argues the cost is bounded by tiles actually revealed, but the per-column
  floor is O(`tw`) per frame with no viewport or radius cull. **The worst
  offender for unbounded width**, and fixing it is a redesign of Pass A
  (viewport- or radius-scoped rather than whole-row), not a cull.
- **`view/ui/ruler.js:113-115`** — a full `tw × th` `seenAt()` scan, but only
  for a band not yet known, cached in a `WeakSet` once true. Trivially
  fixable regardless (`b.seen.some(v => v)` over the dense array it already
  is), and worth doing whether or not this feature happens.

### 3.4 `rules/light.js` allocates the whole band per recompute

`:148` — `const best = new Int8Array(b.tw * b.th).fill(0)` **per light
recompute**, and `:165` seeds daylight across all `tw` columns. At today's
size that is 40 KB and a 128-iteration loop; at `tw = 8192` it is 2.6 MB
allocated and freed per recompute. A hard blocker, and one the render-side
audit did not reach because it is a `rules` file.

### 3.5 The camera clamp *is* the world's right-hand edge

`shell/main.js:604-606`, in `clampCam()`:

```js
  const w = widthPx(b);
  cam.x = w > VIEW.w ? clamp(cam.x, b.origin.x, b.origin.x + w - VIEW.w)
                     : b.origin.x + (w - VIEW.w) / 2;
```

One line, and it is the whole definition of "the world has an edge" as far as
the camera is concerned. Y clamps against the union of bands and is
unaffected — vertical stays bounded, which is correct and should stay that
way.

`rules/player.js:197-199` has the matching clamp:
`pw.move(clamp(player.x, b.origin.x, b.origin.x + widthPx(b) - PW), player.y)`,
unconditional every frame. It would not eject a player into new ground, but
it silently teleports x on any `tw` *shrink*.

### 3.6 `bandAt` is an x-range test

`model/world.js:157-159` finds a band by testing x **and** y against
`origin + tw × tile`. With unbounded width it becomes a y-only test, which is
a simplification — but it is also the function `model/segments.js#sweepSpan`
relies on to produce `'OUTSIDE THE WORLD'`, and the two 16-column dead strips
that Phase 10b's astral widening existed to close were exactly an artefact of
this test. Anything that changes it must re-read `docs/PLAN-phase10.md` §2.2.

### 3.7 The paint cache is unbounded and never evicted within a run

`view/paint.js:71` — a `Map` cleared only by `resetChunks()` on `newRun()`
(`:74-81`). Today's ceiling is a fixed 264 chunks (~17 MB of canvas). **With
unbounded width, resident canvas memory grows linearly with distance walked
and never comes back.** Eviction is straightforward (a distance-from-camera
cull in `beginFrame`, which already runs once per frame) but it is net-new
policy, and it interacts with `stackVer` — evicting a chunk whose neighbour
is still resident is fine, but evicting and re-baking thrashes at the
frontier.

Cold bakes are *not* a problem: `REPAINT_BUDGET = 8` throttles re-paints
only, and a cold bake costs ~1.53 ms/chunk × chunks-in-viewport, which scales
with viewport area rather than world width. That stays fine.

### 3.8 The overview map stops being an overview — a design question, not a bug

`view/overview.js#MAP_ZOOM = [1, 2, 4, 8]` has no level below one screen
pixel per 8 px tile. `defaultZoom()`'s stated goal — "fits the world's
WIDTH", the file's own header — holds only to about **1,000 tiles** at a
640 px viewport, and to 128 tiles at zoom 8. Past that it silently falls back
to zoom 1 and the overview becomes a scroll window with no zoom-to-fit
affordance at all. The off-screen player chevron already had one bug from
exactly this class (`overview.js:854-860`). **An unbounded world makes that
edge case the permanent default**, so this needs a design decision — a
fractional zoom, a different projection, or an explicit statement that
overview mode means something else now — and not just a constant.

### 3.9 The worldgen guarantees are anchored to spawn, and that is fine

Worth stating because it is the reassuring half. `SHELF` (9 tiles half-width,
pinned flat), `SAFE_R` (24 tiles, no big step and no hollow), the guaranteed
`vein` at `near:'spawn'`, and the spawn shelf's `BLEND` are all **local to
`spawnTx`** and would survive lazy generation unchanged, provided the sector
containing spawn is always generated first. SPEC §5's beat sheet is not at
risk from width per se.

### 3.10 The clouds spread thinner, cosmetically

`view/scene.js:217` — `span = widthPx(b) + 400` as the modulus for
distributing 29 clouds. Constant cost, but at extreme width the sky goes
visually empty rather than erroring. Cosmetic; named so it is not a surprise.

### 3.11 The tile-byte budget is untouched by this

Good news, and worth stating because it is the constraint that dominates
`docs/PLAN-phase14-mining-and-drops.md`: width costs the tile byte nothing.
A tile is still one packed substance × form byte regardless of how many of
them there are.

### 3.12 No test exercises a band edge at all

Grepped: the CHUNK SEAM test (`tools/check.mjs:3672-3752`) and the
tree-chunk-seam baseline (`tests/visual.spec.js:3806-3835`) hardcode absolute
chunk columns (3/4, tx 48-79). Neither assumes a *maximum* width, so both
survive width growth unmodified. But **nothing tests the camera at a left or
right band edge, and nothing tests a band's width changing.** That is a real
gap to close *before* touching the clamp, not after.

---

## 4. Vocabulary, fixed before any code invents a second one

D10's rule ("one word per part, and nothing in code, docs or a commit
message may use a sixth") applies here for the same reason: "chunk" already
means something in this codebase (§2.1) and reusing it for generation would
make every existing comment ambiguous.

| term | what it is | relationship to what exists |
|---|---|---|
| **chunk** | **unchanged.** A 16 × 16-tile RENDER unit with one cached canvas and one version counter. `b.chunk`, `chunkOf`, `chunkCanvas`, `resetChunks`, `flags.showChunks`. | Not touched by this feature except for eviction (§3.7) and its key (§3.2) |
| **sector** | **new.** A fixed-width vertical slab of a band — its own `mat`/`seen`/`light` arrays, generated once, lazily, from `(seed, band, sectorIndex)`. The unit of allocation and of generation. | What `write.allocate` + `generate(b)` currently do to a whole band, done to a slab |
| **frontier** | **new.** The contiguous range of sectors currently resident, and the rule that decides when the next one is generated and when the far one is dropped. | Nothing corresponds today; the whole world is always resident |

And one **rule**, not a noun, because it is the load-bearing part:

> **A positional draw, never a stream draw.** Every worldgen decision in a
> sector must be a pure function of `(seed, band id, absolute tile
> coordinate)` — a hash — and never of how many `rand()` calls have happened
> so far. This is what makes a sector generated on minute nine byte-identical
> to the same sector generated on minute one.

An integer sector width is required (a sector must contain a whole number of
chunks, or `stackVer`'s 3×3 neighbourhood straddles an allocation boundary).
**Proposal: a sector is 8 chunks = 128 tiles = 1024 px** — i.e. exactly
today's whole world width, which makes "today's world" precisely "one
sector" and gives the migration a trivially-checkable first milestone.

---

## 5. The binding-document changes, drafted for review — DELIBERATELY UNAPPLIED

Same treatment as `docs/PLAN-gears-and-winches.md` §3: these are of the same
weight as D1–D10 and are **not applied by this document**. If the feature is
greenlit they land as one orchestrator commit *before* any phase runs. If it
is not, they are simply never applied and this section is the record of what
it would have cost.

### 5.1 `CLAUDE.md` invariant 2 — proposed replacement

Current (`CLAUDE.md`, invariant 2):

```
2. **World coordinates are absolute per band**, and a band carries its own
   dimensions and tile size. Resizing the window moves the camera and nothing
   else. World size is not a module constant and tile arrays are not allocated
   at import — that was the biggest structural blocker in the old code.
```

Proposed:

```
2. **World coordinates are absolute per band**, and a band carries its own
   tile size and its own VERTICAL extent. Resizing the window moves the
   camera and nothing else. World size is not a module constant and tile
   arrays are not allocated at import — that was the biggest structural
   blocker in the old code. **A band's horizontal extent is unbounded and is
   not a number anywhere:** storage is per SECTOR (a fixed-width slab), tile
   coordinates are SIGNED, and `b.tw` does not exist. Anything that needs "the
   width of the world" is asking the wrong question — ask for the frontier, or
   for the viewport.
```

The last sentence is the load-bearing one. `b.tw` is read in **41 places**
across `src/` (grepped; 60 lines match `.tw` once `def.tw` machine footprints
are included), and the honest form of this change is deleting the field so
that every one of those 41 has to be re-argued, rather than leaving it as a
number that happens to be large.

### 5.2 `ARCHITECTURE.md` §9 invariant 2 — proposed replacement

Current (`ARCHITECTURE.md:214-215`):

```
2. World coordinates are absolute per band. Resizing the window moves the
   camera and nothing else.
```

Proposed:

```
2. World coordinates are absolute per band, and signed. Resizing the window
   moves the camera and nothing else. A band is unbounded horizontally and
   resident one sector at a time; vertical extent stays fixed and declared.
```

And `ARCHITECTURE.md` §6 ("Bands: the world is not a global") needs a
paragraph saying that a band is now allocated *per sector* rather than per
band, since that section's whole argument is about `allocate` being called at
run time from a row.

### 5.3 `CLAUDE.md` invariant 7 — proposed AMENDMENT, and this is the real cost

Current (`CLAUDE.md`, invariant 7):

```
7. **A run is bit-reproducible from its seed.** All randomness through `rand()`;
   **rendering consumes none.** A `rand()` call in a draw path breaks seed
   sharing, replay and screenshot testing at once.
```

Proposed:

```
7. **A run is bit-reproducible from its seed.** All randomness through
   `rand()`; **rendering consumes none.** A `rand()` call in a draw path
   breaks seed sharing, replay and screenshot testing at once.
   **Worldgen is the one exception, and it is stricter rather than looser:**
   a sector is generated lazily, in an order that depends on where the player
   walked, so worldgen may not draw from the sequential stream at all. Every
   worldgen decision is a POSITIONAL DRAW — a pure hash of the seed, the band
   id and an absolute tile coordinate. `rand()` in `rules/generate.js` is a
   bug for the same reason `rand()` in a draw path is: the answer depends on
   how many times you have already asked.
```

**This is the single largest conceptual change in the feature.** It inverts
the current rule inside one module: today `rules/generate.js` calls `rand()`
in ~30 places and that is *correct*; afterwards every one of them is a
defect. `tools/layers.mjs` could enforce it the way it already enforces "only
`model/mods.js` may import `data/tuning.js`" — a one-module import ban on
`core/rng.js#rand` from `rules/generate.js` — which is the cheapest possible
guard and should be part of the deal.

### 5.4 `docs/SPEC.md` §1 — proposed replacement of one row

`docs/SPEC.md` §1's table locks `world width **1024 px = 128 tiles**, fixed,
independent of viewport`, and the paragraph under it says world coordinates
"never depend on `innerWidth`". The width row becomes:

```
| world width | UNBOUNDED. Resident one sector (128 tiles / 1024 px) at a
                time; see §23. |
```

with a new §23 locking the sector width, the frontier policy, the positional
hash function, and the eviction rule. The "never depends on `innerWidth`"
paragraph is unaffected and stays — it was always the more important half.

### 5.5 New `CLAUDE.md` decision D11 — vocabulary

§4's table, verbatim, appended after D10 in the same style, including the
positional-draw rule.

---

## 6. Sizing, honestly

**This is larger than any wave that has shipped.** For calibration:

| wave | what it was | rough shape |
|---|---|---|
| wave 2 (8c–8g) | segment transport replacing the staged winch | 5 phases, 2 binding-doc changes, 1 new model module, 1 new rules module, ~22 new baselines |
| wave 3 (12a–12d) | the interaction model + the inventory storage shape | 5 serial phases, no binding-doc change, 1 storage-shape change with a documented "silently wrong, not crash" risk |
| **this** | the world's storage shape, its generator, and one invariant's meaning | **~6 phases minimum**, 3 binding-doc changes including an invariant *inversion* inside one module, a rewrite of `rules/generate.js` (641 lines, and the file with the most content coupling in the repo), a storage-layout change behind `model/world.js`, 4 coordinate-key fixes, 2 per-frame loop redesigns, a new cache-eviction policy, and an open design question about what the overview map even is |

The dangerous part is not the line count. It is that **`rules/generate.js` is
the file Phase 11's entire TIER 1 harness is written against** — determinism
over 200 seeds, the flat spawn shelf, the guaranteed vein, "no surface
feature within 24 tiles yields a fall > 5 tiles", adjacent-column step
limits, relief budget, hollow ceiling clearance, ore reachability. Every one
of those is a property of a *whole band* today. Re-expressing them per sector
means re-deriving what each of them *means* when the world has no edges —
and "adjacent surface columns differ by ≤ 1 tile except for permitted steps
no more often than 1 in 12" is exactly the property §3.1 says has no
chunk-local formulation.

So the honest sizing is: **the storage change is a large refactor with a
clean seam (§2.3). The generator change is a redesign with an unsolved
problem in it (§3.1).** Those are different risks and should not be bought
together.

---

## 7. The recommendation: do the cheaper thing first, and it is not a compromise

**Recommendation: do not start unbounded-width work. Instead widen the bands
to a large fixed number, and fix the four things that a large fixed number
already breaks.** Then decide whether unbounded is still wanted.

The reasoning:

- **Almost everything §3 lists has to be fixed for a *wide* world anyway.**
  At `tw = 1024` (8 × today, ~8,200 px, 1,024 tiles wide): the paint cache
  ceiling becomes 1,280 chunks ≈ **84 MB** of canvas, so §3.7's eviction is
  mandatory. `rules/reveal.js`'s per-frame 1,024-column loop (§3.3) and
  `rules/light.js`'s 1.3 MB-per-recompute allocation (§3.4) both become real
  costs. `view/overview.js` hits exactly its documented fit-to-width ceiling
  (§3.8). The band-edge test gap (§3.12) becomes worth closing.
- **None of the hard parts have to be touched.** Storage stays dense and
  eager (~1 MB of typed arrays for a 1,024 × 320 topsoil — fine).
  `rules/generate.js` stays whole-band, `rand()`-ordered and correct. Every
  Phase 11 property keeps its current meaning and its current
  implementation. **Zero binding documents change** — invariant 2 already
  says a band carries its own dimensions and that world size is not a module
  constant, which is *exactly* what makes this legal today. `docs/SPEC.md`
  §1's width row is the only number that moves.
- **It is probably what the request actually wants.** "Explore left/right
  without bound" is a *feeling*, and 1,024 tiles is a 137-second walk at
  `eff('walk')` 60 px/s in one direction, through terrain the player has to
  dig and light. Set against a game whose thesis is that the interesting axis
  is vertical (`docs/DESIGN.md`: "Every other automation game has flat, cheap
  horizontal logistics. Inverting that forces deep gravity-fed chains") and
  whose run length is four cycles at 360–480 s each, a bounded-but-large
  world may be indistinguishable from an unbounded one *in play* while
  costing a tenth as much.
- **And it de-risks the expensive version if it is still wanted**, because
  every item it fixes is a prerequisite either way, and it produces the one
  thing this scoping document cannot: a measurement of whether width is
  actually the missing thing.

**A concrete shape for that cheaper work**, sized like the other waves and
offered as a candidate rather than a plan:

| phase | what | owner |
|---|---|---|
| 16a | `data/world.js` `tw:128 → 1024` on all three bands; `docs/SPEC.md` §1's width row; re-measure boot time, allocation and worldgen time and report | `systems` |
| 16b | paint-cache eviction (§3.7) + the four coordinate keys made overflow-proof (§3.2, without going signed) | `ui` |
| 16c | `rules/reveal.js` Pass A scoped to a radius/viewport (§3.3) and `rules/light.js`'s per-recompute allocation made proportional to the lit region (§3.4) | `systems` |
| 16d | `view/overview.js` — a fit-to-width projection that actually fits (§3.8), the design decision included | `ui` |
| 16e | harness: band-edge camera and player-clamp tests (§3.12), plus the Phase 11 property sweep re-run at the new width | `harness` |

That is five phases with **no** binding-document change, **no** generator
rewrite, and **no** invariant inversion — and it retires eight of §3's twelve
items permanently.

---

## 8. If unbounded is still wanted: what the follow-up pass must find out first

**This document is not sufficient to start from.** A recon pass — one
`cartographer`, read-only, `docs/` only, in the shape of Phase 6.5 — must
answer these before any implementation phase is written. They are ordered by
how likely a bad answer is to kill the feature.

1. **Can `stepPass`'s traversability guarantee (§3.1) be expressed
   positionally at all?** This is the make-or-break question and it is a
   *mathematics* question, not a code question. The property is "no rise
   greater than 1 away from spawn; a 2-tile descent at most once per 12
   columns, never within `SAFE_R`". Find a formulation that is a pure
   function of absolute column and produces the same *class* of terrain — or
   establish that it cannot be, in which case the honest answer is that
   unbounded terrain is a **different generator** with a different guarantee,
   and SPEC §16.2 has to be rewritten rather than ported. Do not proceed on
   "we'll figure it out in the phase."
2. **What replaces `unsealOreBodies` (§3.1)?** A whole-band reachability
   fixpoint has no lazy equivalent. Options to evaluate: generate ore bodies
   so they cannot seal (a constructive fix in `blobs`), or run the unseal
   pass per sector and accept seams, or drop the guarantee and let a sealed
   body be a legitimate disappointment. Each has a different consequence for
   Phase 11's assertion.
3. **What is the positional hash, exactly, and is it good enough?**
   `core/rng.js` has `hash2` today. Establish whether a 2-input hash is
   sufficient for three octaves of value noise plus per-column bias plus
   per-body draws, or whether a wider mixing function is needed — and whether
   the *existing* worldgen can be reproduced closely enough by it that the
   200-seed property sweep still passes, or whether every baseline and every
   measured figure in SPEC §16 has to be re-taken.
4. **Signed or one-sided?** Establish whether the world grows in both
   directions (signed tile coordinates, §3.2's four keys, `idx`, `inBounds`,
   and every `tx >= 0` in `src/`) or only rightward from a fixed origin
   (cheaper by a lot, and defensible — the spawn cliff face in SPEC §5's beat
   1 is already a wall on one side). Get this decided before anything is
   written; it changes half the diff.
5. **What does the overview map become (§3.8)?** A design decision, needed
   before 16d-equivalent work, and one that might reasonably conclude "the
   overview shows the frontier, not the world".
6. **Does anything about the tribute loop assume a bounded world?** The
   Cloud Dock, the altar's spawn-relative placement, `bandAt`'s x test
   (§3.6), and `docs/PLAN-phase13.md` §5.2's proposed `astral` band gate all
   interact with "where can a thing be". Cheap to check, expensive to
   discover.
7. **A measurement, not an opinion: how far does a player actually walk?**
   Instrument `run.deepest`'s horizontal twin over a few real playthroughs.
   If the answer is 200 tiles, §7's recommendation becomes conclusive rather
   than advisory.

**The recon pass writes `docs/RECON-horizontal.md` and stops.** It must not
propose phases; questions 1 and 2 are capable of returning "no", and a
document that has already committed to a phase list finds it very hard to
say so.

---

## 9. Explicitly not designed here

- **Chunk/sector unloading and memory management** beyond naming that it is
  required (§3.7) and that `beginFrame` is the natural hook. The policy —
  distance, LRU, or frontier-relative — the thrash behaviour at the
  frontier, and what happens to a `seen` bit in an evicted sector (fog of war
  is *permanent* by design, so eviction has to either keep `seen` or admit
  the world can forget it had been explored) are all undesigned. **That last
  one is a real design question, not an implementation detail**: invariant-
  adjacent, since `model/world.js:41-49` says `seen` is "permanent for the
  run" and "there is no un-reveal action, which is the whole feature".
- **The positional hash function itself.** §8 question 3.
- **Vertical unboundedness.** Deliberately excluded. Depth is the run's
  progress bar (`docs/DESIGN.md`: "depth band = act"), D9 fixes the datum,
  and an unbounded depth axis would dissolve the act structure. The bands
  stay declared and finite.
- **Any change to segment transport.** §2.3 — it is already coordinate-clean
  and needs none.
- **Multiplayer, streaming from disk, or a save format.** There is no save
  and `localStorage` is forbidden; a sector is regenerated from its hash, not
  loaded.
- **Whether `docs/SPEC.md` §16's measured worldgen figures survive.** §8
  question 3 — they probably do not, and re-taking them is a phase in its own
  right.
