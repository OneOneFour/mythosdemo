# AUDIT-2 — Phase 6.5 recon for Wave 2 (surface relief, painting, overview, the Heavens)

Scope: exactly the Phase 6.5 recon brief in `docs/BUILD_PLAN.md` (Wave 2, "Phase
6.5 — Recon"). Read-only. Dense tables, `file:line`, no proposals, no code.
Cross-referenced against `docs/SPEC.md`, `ARCHITECTURE.md`, `docs/AUDIT.md`,
`CLAUDE.md`, `docs/DEVELOPER_GUIDE.md`, `docs/BUILD_PLAN.md`.

**Headline correction up front (see §3).** `docs/BUILD_PLAN.md`'s own "ground
truth" table (around line 1288) asserts the astral and surface bands are
disjoint in x and "no column on the surface has anything above it today." That
claim is **wrong**, verified by direct execution against `data/world.js`:
`astral` spans world-pixel x `[128,896)`, a **subset** of `surface`'s x
`[0,1024)`. They overlap. See §3 for the exact numbers and what is actually
true.

---

## 1. Vertical layout

Three per-band records, not one array. Each carries its own `origin` (world
**pixels**, `data/world.js:24-27`), `tw`/`th` (tiles), `tile` (px/tile) and
`floorTy` (band-local row).

| band | `tw`x`th` (tiles) | `tile` | `origin` (px) | world-px x-range | world-px y-range | `floorTy` | `spawnTx` |
|---|---|---|---|---|---|---|---|
| `astral` | 96x40 | 8 | `{x:128,y:0}` | `[128,896)` | `[0,320)` | 30 | — |
| `surface` | 128x56 | 8 | `{x:0,y:320)` | `[0,1024)` | `[320,768)` | 20 | 42 |
| `topsoil` | 128x320 | 8 | `{x:0,y:768}` | `[0,1024)` | `[768,3328)` | 0 | — |

Source: `src/data/world.js:42-106`. Verified against the live code (not just
read off the file) with a one-line `node --input-type=module` import of
`BANDS`, computing `[origin.x, origin.x+tw*tile)` / `[origin.y, origin.y+th*tile)`
per row — output matched the table above exactly.

- **Combined world-pixel span**: y `[0,3328)` (3328 px = 416 rows if the three
  bands' `th` were summed, but they are **not** one continuous row index — see
  below). x span (union) `[0,1024)` (`astral` contributes no extra width; it is
  a proper x-subset of `surface`/`topsoil`).
- **The exact row of the surface's ground line** (the "topsoil surface" — the
  soil/stone seam a player stands on): `surface.floorTy = 20`
  (`data/world.js:59`). Within the surface band's own strata: soil cap rows
  `20..27`, stone rows `27..56`, both `lip:false` on the stone row
  (`data/world.js:68-69`).
- **The spawn band's `floorTy`**: also 20 (surface **is** the spawn band,
  `spawn:true`, `data/world.js:59`). The player spawns at tile row
  `floorTy - 2 = 18` (`shell/boot.js:103`), two tiles above ground so the first
  frame is a landing, not an ejection.
- **`topsoil`'s own "surface"**: `floorTy:0`, and its single `layer` stratum
  covers `fromTy:0, toTy:320` (`data/world.js:96`) — i.e. `topsoil` starts
  as solid stone from its own row 0, which is exactly where `surface` band's
  bottom edge sits in world pixels (`surface.origin.y + 56*8 = 768 ==
  topsoil.origin.y`). The two bands are **vertically contiguous with no gap**
  (confirmed by the origin arithmetic, not merely documented).
- **Rows above the surface, and what's written there.** `astral`'s own strata
  is one `layer` row: `{ kind:'layer', sub:'stone', fromTy:30, toTy:40 }`
  (`data/world.js:47-49`). `astral.th = 40`, so band-local rows `0..29` (30 of
  its 40 rows) are **never written by worldgen** — they stay `AIR` (a freshly
  allocated `Uint8Array` defaults to 0, `model/world.js:35`, and `generate()`
  only ever calls `KINDS[row.kind]` for rows a band's `strata` array lists,
  `rules/generate.js:118-120`). Only band-local rows `30..39` (10 rows) are
  solid rock. Nothing else — no items, no machines, no spawn point — is ever
  placed in `astral`; the only other reference to the id anywhere in `src/` is
  `data/machines.js:148`'s `lift.toBand:'astral'` and a camera-inset comment in
  `shell/main.js:507-508` (§6). `astral`'s `fields:[]` (`data/world.js:46`)
  also means it has no heat field at all — "nothing burns up here," by
  omission, per the row's own comment.
- **Row indices are band-local**, always `0..b.tw-1` / `0..b.th-1`
  (`idx(b,tx,ty) = ty*b.tw+tx`, `model/world.js:168`; `inBounds`,
  `model/world.js:170-171`). The **only** file that converts between band-local
  tiles and the one shared world-pixel space is `model/world.js`:
  `tileX`/`tileY` (px→tile, `:175-176`), `worldX`/`worldY` (tile→px,
  `:178-179`), `bandAt(x,y)` (world px → band, `:157-159`). Nothing outside
  this file does that conversion; every other reader either stays in
  world-pixels (the camera, the item/machine physics) or in one band's own
  tile space (everything under `model/tiles.js`).
- **The depth datum.** Never the array top — always
  `worldY(spawnBand, spawnBand.cfg.floorTy ?? 0)` = `worldY(surface,20)` =
  `320 + 20*8 = 480` world px. Three independent call sites read the identical
  expression: `model/run.js:267` (the `minDepth` placement gate),
  `view/hud.js:324-325` (the live depth gauge) and `view/hud.js:501,506` (the
  death-screen "DEPTH REACHED"). This is D9's "the depth datum does not move,"
  confirmed as one arithmetic expression duplicated at three sites, not a
  stored constant.

---

## 2. Worldgen

Worldgen lives entirely in `src/rules/generate.js` (confirmed, not
`data/world.js`, which is purely the declarative `BANDS` table read at
`rules/generate.js:29`). Entry point: `generate(b)` (`generate.js:118-120`),
called once per band from `shell/boot.js:94`, inside the `for (const cfg of
BANDS)` loop — so **every band is generated at boot, in `BANDS` declaration
order**, immediately after that band's own `world.write.allocate` and
`fields.write.allocate`.

**The kind table (`KINDS`, `generate.js:45-111`) is the whole file.** Four
kinds exist today, applied in `b.cfg.strata`'s own row order (never reordered
by the engine):

| kind | file:line | what it does |
|---|---|---|
| `layer` | `generate.js:55-64` | Fills a solid rectangular band (`fromTy..toTy`, full width) with one substance, `NATIVE` form. The **top row only** gets a ragged "lip" carve — `rand() < LIP(0.35)` skips a tile, unless `onShelf(b,tx)` (inside the spawn shelf) or the row sets `lip:false`. |
| `blobs` | `generate.js:68-78` | `row.count` independent `blob()` calls, each at a uniform-random column and a random row inside `[fromTy,toTy)`. |
| `vein` | `generate.js:83-88` | **One** guaranteed `blob()`, centred at `(spawnTx, floorTy+dy)` if `row.near==='spawn'` and the band has a `spawnTx`, else band-centre. |
| `trees` | `generate.js:97-110` | Per column, `rand() < row.chance` and not `onShelf`, scans down from `row.fromTy` for the first solid tile (the trunk's base), then stacks `randInt(height[0],height[1])` `NATIVE` timber tiles upward from it. |

Coverage is enforced at **import time**: `data/world.js` exports
`STRATA_KINDS` (the de-duplicated set of every `kind` string any band's
`strata` array uses, `data/world.js:126-127`), and `generate.js:146-148`
throws if any kind has no `KINDS` handler — a typo'd kind fails the build
rather than silently generating nothing.

**Is the surface height a constant?** No — it is `surface.floorTy:20`
(a per-band data row, `data/world.js:59`) plus the `layer` pass's own LIP carve
(`generate.js:61`, `±1` ragged tile on the topmost row only, everywhere except
the spawn shelf). There is **no per-column height function today** — every
column of a `layer` row starts at the identical `fromTy`, so the surface is
flat except for that one-tile-deep ragged lip. This is exactly the gap Phase 7
exists to fill.

**Where the guaranteed copper vein is placed**: `data/world.js:82`,
`{ kind:'vein', sub:'copper', near:'spawn', dy:8, r:3.1 }`, resolved by
`KINDS.vein` (`generate.js:83-88`) to a `blob()` centred at
`(surface.cfg.spawnTx, surface.cfg.floorTy + 8)` = tile `(42, 28)` — 8 rows
below the ground line, directly under the spawn column, radius 3.1 tiles.
`near:'spawn'` is resolved **here**, not in the data row, specifically because
"where is spawn" is a fact about the band record the content row should not
have to know (`generate.js:80-82`'s own comment).

**Where the spawn shelf, stock pickaxe and brand are planted.** The shelf
itself (`SHELF = 6` tiles half-width, `generate.js:36`) is **worldgen**: the
`onShelf(b,tx)` predicate (`generate.js:139-140`) suppresses the `layer` lip
carve and the `trees` roll for any column within 6 tiles of `spawnTx`,
guaranteeing a flat, treeless patch regardless of seed. The **pickaxe and the
brand are not worldgen at all** — they are ordinary falling items spawned by
`shell/boot.js`, *after* `generate()` has run for every band and the player has
spawned: pickaxe at `shell/boot.js:122` (`worldX(home,spawnTx+4),
worldY(home,floorTy-1)`), brand at `shell/boot.js:131` (mirrored, `spawnTx-4`),
both `S.pick`/`S.timber` + `F.relic`/`F.brand`, `vx:0,vy:0` — they fall the
last tile onto the ground like anything else, per the "material never
teleports into your hands" idiom the code comment states explicitly.

**RNG stream.** Every `KINDS` handler and `blob()` draws exclusively from
`rand()` (`core/rng.js`, imported `generate.js:26`) — **never** `hash2()`,
because `hash2` is a pure positional hash that would produce the identical rim
shape at the identical coordinates across two different seeds
(`generate.js:124-126`'s own comment). Traversal order is fixed and is what
makes a run bit-reproducible from its seed (ARCHITECTURE invariant 7): bands in
`BANDS` declaration order (`shell/boot.js:91` loop), strata rows in row order
within a band (`generate.js:119`), and inside `layer`/`blobs`/`trees`, columns
left to right (`generate.js:59-60, 101`). `seedRng(seed)` (`shell/boot.js:86`)
runs strictly before the `BANDS` loop, so nothing consumes the stream before
worldgen does.

---

## 3. Bands

A band is a **plain object allocated at run time** by
`model/world.js#write.allocate(cfg)` (`model/world.js:27-75`) from one
`data/world.js#BANDS` row; the row itself never mutates (`Object.freeze`,
`data/world.js:109-110`). `bands` (`model/world.js:22`) is a **module-level
array** of these allocated records, in `BANDS` declaration order — not a
single global, but not band-agnostic either: every tile/light/fog query takes
the record as its first argument (`b`).

Record shape (`model/world.js:28-70`): `id, name, ord` (stable declaration
index, used as a cache-key prefix elsewhere), `tw, th, tile, chunk, origin,
cx, cy` (chunk grid dimensions), `mat` (`Uint8Array` tile bytes), `ver`
(`Uint32Array`, per-chunk paint-cache version), `seen` (`Uint8Array`, fog,
permanent), `light` (`Uint8Array`, current lighting, volatile), `lightVer`
(recompute counter), `fields` (filled by `model/fields.js`), `cfg` (the frozen
source row, for `strata`/`look`).

- **`bandAt(x, y)`** (`model/world.js:157-159`): `(worldPx, worldPx) -> band |
  null`. Takes **world pixels**, not a band id or ordinal — "the only place
  that knows bands are laid out in a shared space at all" (the file's own
  comment). Confirmed it takes pixels, not tiles, by its guard clause:
  `x >= b.origin.x && x < b.origin.x + b.tw*b.tile`.
- **`lift.toBand`** (`data/machines.js:148`, `lift:{span:64, toBand:'astral'}`)
  holds a **band id string**, resolved through `bandOf(id)`
  (`model/world.js:152`) wherever it's read: `rules/lift.js:125`
  (`reaches()`, live check against an already-placed stage) and
  `model/run.js:286` (`placementCheck`'s pre-placement duplicate of the same
  check — the deliberate duplication `docs/DEVELOPER_GUIDE.md`
  #duplication-across-a-layer-boundary names).
- **Every reader of band identity found**: `bandOf(id)` / `bandByOrd(ord)`
  (`model/world.js:152-153`), `bandAt(x,y)` (`:157-159`), `bandBelow(b)` /
  `bandAbove(b)` (declaration-order neighbours, `:163-164`). Consumers:
  `rules/lift.js` (shaft-reach), `model/run.js#placementCheck`
  (shaft-reach duplicate + depth gate), `view/scene.js#atmosphere`
  (`bandAt(cam centre)` for ambient tint, `:436`), the camera/overview code
  (§6).

**Is a band above the surface already expressible, and does anything treat it
as special?** Yes to the first — `astral` exists exactly as any other band
would, through the identical `BANDS` row shape, and nothing in
`model/world.js` or `rules/generate.js` special-cases it. The **only**
special-casing anywhere is presentational: `shell/main.js:506-512`'s
`clampCam` centres the camera on the x-axis rather than clamping to a corner
"which is what a 96-tile astral platform on a wide monitor needs" — i.e. the
one place the engine acknowledges a band narrower than the viewport, generic
over any band, not astral-specific in code (just astral-motivated in comment).

### Astral's actual dimensions — the correction

`docs/BUILD_PLAN.md`'s "ground truth" table (line ~1288) states the astral and
surface x-ranges "do not overlap at all," reading `astral.origin.x:128` as if
it meant tile-column 128 (matching `surface.tw:128`). **That is not what the
row says.** `origin` is documented in `data/world.js:24-27` and enforced by
convention throughout as **world pixels, not tiles** — the same units
`bandAt` uses. Re-deriving directly from the frozen `BANDS` array (verified by
executing `import('./src/data/world.js')` and printing each band's derived
px range, not by re-reading the comment):

```
astral  x:[128,896)   y:[0,320)
surface x:[0,1024)     y:[320,768)
topsoil x:[0,1024)     y:[768,3328)
```

`astral`'s x-range `[128,896)` is a **proper subset** of `surface`'s
`[0,1024)` — they overlap over `astral`'s entire width. In `surface`'s own
tile coordinates (`tx = (worldX - 0)/8`), that overlap is `tx ∈ [16,112)`:
**96 of `surface`'s 128 columns already have `astral` directly above them
today** (`astral.origin.y + astral.th*8 = 0+320 = 320 == surface.origin.y`,
so the two bands are also **exactly y-contiguous**, touching with no gap and
no overlap vertically). Only `surface` columns `tx 0..15` and `tx 112..127`
(32 of 128, the two edges) have nothing above them.

This does not make Phase 10's "widen astral to `tw:128, origin.x:0`" pointless
— 32 of 128 surface columns genuinely have nothing above them today, and full
edge-to-edge coverage is still a real gap — but the premise that *no* column
has anything above it, and that this is why the winch/lift cannot reach
astral, is false as stated. Whatever currently prevents (or allows) a lift
built on the surface from reaching astral is a **placement/height** question
(can a stage's footprint + `span` actually clear the 96–224 px gap up to
`astral.origin.y=0`... conflated with wherever the stage is actually built),
not an x-disjointness one. Re-verify any Phase 10 reasoning that assumes the
old "no overlap" premise.

---

## 4. Painting

**No substance or machine name appears in `view/`** (grepped; the only names
in `view/paint.js`/`view/treatments.js`/`view/scene.js` are palette/treatment
*keys*, never a substance id). Everything drawn comes from a `look` block via
two, not one, indirections — this distinction matters for Phase 8:

1. **The generic `treatments:[{fn,...}]` array**, dispatched by
   `treat(g, look, cell)` (`view/treatments.js:86-91`): iterates `look.treatments`,
   looks up `TREAT[t.fn]`, calls it. This is the fully generic, appendable
   mechanism. Used today by `glint` (`copper`, `tin`, `adamant`), `banded`
   (`stone`, `granite`, `soil`), and (unused by any current row) `halo`.
2. **Two special-cased top-level `look` keys**, checked **by name**, directly
   in `view/paint.js#paintTile`, *not* routed through `treat()`/`TREAT[fn]`:
   `look.canopy` and `look.grassCap` (`paint.js:174-180`). Only `timber`
   (`canopy`) and `soil` (`grassCap`) set these. Both are additionally gated
   on `skyExposedAt(b,tx,ty)` (a full walk to the band's own row 0, not "the
   tile above is air" — `model/tiles.js:71-74`), so a cave ceiling never gets
   grass or a canopy. **Any new "extend the look block" content that wants a
   generic per-substance switch (not one more hardcoded key check) must go
   through path 1, or `paintTile` grows a third hardcoded `if`.**

Full paint-data schema in use today, from `data/substances.js`:
`look:{ base, hi, lo, item:[a,b], treatments:[...], canopy:{leaves,w,h},
grassCap:{col,h} }`. `base/hi/lo` and `item[]` are **names into
`data/palette.js`**, resolved once per row and cached (`view/paint.js#looks`
Map, `:237-250`) — never re-resolved per tile per repaint. A band's own
`look:{ sky, tint, ambient }` (`data/world.js`) is separate, band-scale
appearance (`view/scene.js#drawSky`, `#atmosphere`).

**Every function that puts pixels on a chunk canvas, `view/paint.js`, in the
order `paintChunk` calls them** (`paint.js:88-194`):

1. `paintChunk(b,cx,cy,g)` (`:88-111`) — `g.clearRect`, then per tile: `AIR`
   and `ty>=floorTy` → `paintCavity`; solid → `paintTile`. Sky `AIR` (above
   `floorTy`) draws **nothing** (stays transparent, so `drawSky`'s gradient
   shows through from underneath in the live composite).
2. `paintCavity(g,b,tx,ty,dx,dy,dark)` (`:115-142`) — flat `dark` fill (from
   `cavityColour(b)`, `:255-258`, the band's own `tint`/`ambient` pushed toward
   black), 3 `hash2`-seeded grain specks, a floor-lip highlight if the tile
   below is solid, a hanging-fringe shadow if the tile above is solid.
3. `paintTile(g,b,tx,ty,dx,dy)` (`:146-194`) — in order: base rect (`R`,
   `L.base`) → per-pixel `hash2` grain (`L.lo`/`L.hi` speckle) → exposed-top-face
   highlight if `!solidAt(above)` → **canopy/grassCap** special case (path 2
   above) → left/right edge tint if the respective neighbour is open →
   bottom-edge `L.lo` line if open below → **generic `treat()` dispatch**
   (path 1 above) → **cracks**, from `progressAt()` (mining progress) scaled
   by the tile's `eff('hard', substance)`-adjusted hardness.
4. `cracks(g,dx,dy,tx,ty,d,tile)` (`:198-210`) — `hash2`-seeded jagged 1px
   walk, count/length scaled by dig progress `d`.

`core/pixels.js` primitives all of the above compose from: `R` (integer rect,
`core/pixels.js:15-18`), `noiseFill`/`walk` (`:38-53`, **ported from the
mockup and currently called by nothing in `src/` — grepped, zero call sites**;
available for Phase 8/7 to use, not currently wired to anything), `glow`
(`:57-63`, the one non-integer effect, additive, used by `TREAT.halo` and the
live machine-fire glow in `atmosphere()`). `core/rng.js#hash2` is the only RNG
any paint function may use (never `rand()` — ARCHITECTURE invariant 7,
enforced by convention/comment, not by a lint rule).

**Trees today.** `TREAT.canopy` (`view/treatments.js:62-68`): a flat `w x h`
tile rectangle (default 3x2 tiles) of two solid greens, centred on and sitting
flush atop the trunk's sky-exposed top tile, with a lighter top course — no
dither, no scatter. `timber`'s row comment (`data/substances.js:80-86`) and
`treatments.js:53-61`'s own comment both state this was a **deliberate**
choice over the mockup's `oliveTree()`, "closer to Terraria's leaf blocks,"
because a stochastic dot-cloud reads as fuzzy at this project's small
viewport. The mockup version, verbatim (`reference/mockup/src/world/
strata.js:70-78`): a 2px-wide trunk rect, then 26 individual 2x2 blocks
scattered by `hash2`-driven polar coordinates (`angle, radius` both from
`hash2`) around the canopy centre, coloured from a 3-tone green array indexed
by a third `hash2` draw per dot.

---

## 5. Chunk bake — the consequential answer

Entry point: `view/paint.js#chunkCanvas(b, cx, cy)` (`:61-84`), cache keyed by
`b.ord*0x10000 + cy*b.cx + cx` (`:62`) in a module-level `Map` (`:43`).
Re-paints are throttled by `REPAINT_BUDGET = 8` per frame (`:38`) — **a first
paint (no cached entry yet) is never budgeted**; only a re-paint of an
already-cached, now-stale chunk is (`:72-74`, `:78`).

**Invalidation is a monotonic per-chunk version counter** (`model/world.js`'s
`b.ver`, a `Uint32Array`), never a dirty flag — forced by the epoch rule
(`view` cannot write to `model`, so it cannot clear a flag). `model/tiles.js#
write.touch(b,tx,ty)` (`:126-135`) bumps the written tile's own chunk, **and
bumps exactly the one adjacent chunk** when the written tile sits on that
chunk's edge row/column (`tx % chunk === 0` → left neighbour; `=== chunk-1` →
right; same for `ty` / top / bottom). This is sized for **edge shading
bleed** (the 1-2px highlight/side-tint a neighbouring tile's own paint
contributes), not for anything wider.

**What happens to a drawing operation whose extent crosses a chunk
boundary — tested directly, not inferred.** `paintTile` is called **only**
for the tile that is itself solid and non-air, from *inside* the paint pass of
the one chunk that owns that tile's row/column range
(`paintChunk`'s own `for (ty=t0y..t0y+k)` / `for (tx=t0x..t0x+k)` loop,
`:100-110`). Any treatment invoked from there — in practice, `canopy`
(`w:3,h:2` tiles = 24x16 px) — draws in **that owning chunk's own local pixel
space** (`dx,dy` relative to its own canvas, 0..128px). `R()`
(`core/pixels.js:15-18`) is a plain `g.fillRect`; a rect (or part of one) whose
coordinates fall outside `[0,128)` on either axis is **silently clipped by the
canvas itself** — no error, no pixels, and (this is the part that is not
obvious from reading `paintTile` alone) the **neighbouring chunk does not
independently redraw the missing part**, because that chunk's own
`paintChunk` pass only ever calls `paintTile`/`paintCavity` for tiles inside
*its own* row/column range, and the rows/columns a canopy overflows into
(open sky above `floorTy`, or `AIR`) are `continue`d with **nothing drawn** in
`paintChunk`'s own `AIR` branch (`:104-106`) when they're above `floorTy`.

**Verified empirically, not just by code trace.** Ran the live dev server
under Playwright, imported `model/world.js`/`model/tiles.js`/`view/paint.js`
directly in-page, searched seeds for a tree whose top trunk tile lands in
local chunk row ≤1 (top of a 16-row chunk), then read pixel data straight off
the two `chunkCanvas()` outputs involved (seed 1, world tile `(7,17)`,
chunk `(0,1)`, local row 1):

- The canopy's own top row, computed at local pixel `(56, 1*8-16=-8)` inside
  its **owning** chunk `(0,1)`'s canvas: **negative y, out of bounds — not
  drawn** (`inBounds:false`).
- The exact same world location, read from the chunk immediately **above**
  `(0,0)` at its corresponding local pixel `(56, 128-8=120)`: **`rgba(0,0,0,0)`
  — fully transparent, nothing drawn there either.**

That row of the canopy is not deferred, not drawn late, not drawn by the
other chunk on its next repaint — it is **permanently lost**, silently, with
no error and no visual glitch to notice it by (a black/transparent gap over
open sky looks identical to open sky). This is the exact failure mode any
Phase 8 content wider than the existing edge-shading margin (a bigger tree, a
multi-tile ore glow, a hollow's rim decoration) will hit the moment its anchor
tile sits within roughly one treatment-radius of its own chunk's edge.
**Any treatment wider than the ~1-2px edge-shading margin `write.touch`
already bumps for must either (a) stay within one tile in every direction, or
(b) `write.touch` must be extended to bump every chunk a treatment's `p`
parameters could reach, not just the immediate neighbour.**

---

## 6. Camera & overview

**Camera.** `shell/main.js#updateCamera(dt)` (`:492-501`) eases `cam.x/y`
toward a target centred on the player, biased by facing (`x`) and vertical
speed (`y`, "looks further down than up, because down is where the game is"),
then calls `clampCam()` (`:503-533`) every frame. `clampCam` splits its two
axes asymmetrically: **x clamps to the CURRENT band only**
(`widthPx(player.band)`, centring rather than clamping to a corner if the band
is narrower than the viewport — "what a 96-tile astral platform on a wide
monitor needs," `:506-512`); **y clamps to the UNION of every band**
(`bands[0].origin.y` .. `last.origin.y + heightPx(last)`, `:527-532`), because
bands stack contiguously in one seamless world-pixel column and a per-band y
clamp used to pin the camera short of a band seam for one frame on every
band transition (`:514-526`'s own bug-history comment). `render()`
(`view/scene.js:70-112`) then draws only bands `visible()` to the current
camera rect (`:181-183`, an AABB test against `cam`/`W`/`H`).

**Overview (`O`, `flags.showMap`, `view/scene.js#drawMap`, `:143-179`).** Not
a camera trick — a **completely separate render path**: `render()` checks
`f.flags.showMap` first (`:88`) and, if set, calls `drawMap` and **returns
immediately**, skipping sky/chunks/machines/items/player/fields/darkness/fog/
atmosphere/HUD entirely. It **re-reads the tile grid directly, once per
tile, every frame** — it does **not** reuse the baked chunk canvases (no call
to `chunkCanvas` anywhere in `drawMap`), because those canvases are baked at
native tile resolution, wrong for a whole-world overview.

- **Scale**: `base = 1/min(bands.map(tile))` (`:151`, "roughly one screen px
  per game tile," `= 1/8` today since all three bands agree on `tile:8`), then
  `scale = min(base, W/worldW, H/worldH)` (`:152`), where `worldW`/`worldH` are
  the union bounding box of all three bands (`:145-149`) — `worldW=1024`,
  `worldH=3328` (§1). **Verified by computing `scale` for a spread of real
  window sizes** (not assumed): at the harness's headless fallback (1600x900 →
  `VIEW` 800x450), `base` (0.125) wins. At essentially every realistic browser
  window size (1920x1080, 1366x768, 1280x720, 2560x1440, 800x600 — all
  checked), `H/worldH` wins, landing around **scale ≈ 0.09–0.115**, because
  `resize()`'s own `VIEW.scale = clamp(round(ih/400),2,6)` keeps `VIEW.h`
  hovering near 360-450px almost regardless of real window height, and
  `360/3328 ≈ 0.108 < 0.125`. At that scale the drawn world is
  `1024*0.108 ≈ 111px` wide inside a `~640-800px`-wide canvas — **the small
  vertical strip in a black field is exactly `worldW*scale` versus the
  viewport width**, confirmed by direct arithmetic, not by eyeballing the
  screenshot.
- **Centring**: `ox = (W - worldW*scale)/2`, `oy = (H - worldH*scale)/2`
  (`:153-154`) — the whole union box is centred in the viewport on both axes.
- **Fog**: `if (!seenAt(b,tx,ty)) continue` (`:162`) — enforced **by
  omission**, not an opaque rect: an unseen tile draws nothing, leaving the
  void fill (painted once, full-screen, before the per-band loop, `:75`)
  showing through — the identical end result `drawFog`'s opaque rect achieves
  in the normal path, achieved differently because there is no terrain
  painted underneath to cover here.
- **Player marker**: a fixed 3x3 rect (`:177`), not scaled with `sz`, so it
  stays legible at any zoom.

---

## 7. Fog and light readers

`b.seen` (permanent, one-way, `model/world.js#write.reveal/revealAll/
revealRows`) is read in exactly these places, grepped exhaustively:

| reader | file:line | context |
|---|---|---|
| `seenAt` definition | `model/world.js:143` | the query itself |
| `drawMap` | `view/scene.js:162` | overview, by omission (§6) |
| `drawDarkness` | `view/scene.js:371` | gates the darkness overlay per tile |
| `drawFog` | `view/scene.js:419` | the opaque fog rect itself |
| `atmosphere` (machine glow) | `view/scene.js:458` | additive fire-glow gated so it cannot shine through an opaque fog rect painted under it |
| hover tooltip | `view/hover.js:150` | withholds a tile's identity, not just a placeholder, for an unseen tile |

`b.light` (volatile, 0..`eff('lightMax')`) is read in exactly:

| reader | file:line | context |
|---|---|---|
| `lightAt` definition | `model/world.js:148` | the query itself |
| `drawDarkness` | `view/scene.js:371` | `darkBucket(lightAt(...), max)` picks one of 3 alpha steps |
| fog of war's bounded flood, Pass B | `rules/reveal.js:192` | may not enqueue a tile past its first ring unless `lightAt() >= 1` |

**Can any renderer draw an unseen tile?** Not to the player's actual output.
`drawFog` runs unconditionally after every other terrain/entity pass and
before `atmosphere` (`view/scene.js:104-106`), and paints a fully opaque rect
over every unseen tile in the viewport, row-run coalesced (`:406-428`);
`drawMap` withholds unseen tiles by omission (§6); `hover.js` withholds tile
identity for unseen tiles (`:150`). **One nuance worth flagging for Phase 8**:
the **chunk bake itself is fog-blind** — `paintChunk`/`paintTile` paint a
tile's true material into the offscreen chunk canvas regardless of `seenAt`,
because fog is deliberately a separate live overlay pass, not baked into the
bitmap (`docs/DEVELOPER_GUIDE.md#view-cache-invalidation`'s own reasoning:
static rock is cached, "whether the player has earned the right to see it" is
not). The true colours exist in an in-memory canvas the instant a chunk is
first painted (including possibly before the tile is ever revealed, since
`chunkCanvas` paints on ANY call, and `drawMap`/normal play can call it for a
band the player is nowhere near — e.g. `revealAll`'s own test-only purpose
proves screenshot tests already rely on parking the camera at an unvisited
band). Nothing in the normal render path exposes those pixels to the screen
unseen, but the guarantee is "the overlay always wins," not "the data never
existed" — worth being precise about if Phase 8 or a later phase ever adds a
new consumer of chunk canvases (e.g. a minimap thumbnail) that might forget to
gate on `seenAt` itself.

---

## 8. Tribute state

Grepped honestly for `favour`/`tribute`/`suspicion`/`altar` (case-insensitive)
across all of `src/`. Confirmed: **no `altar`, `favour`/`favor` or
`suspicion` string exists anywhere in `src/`.** `tribute` exists as exactly
three lines of dead scaffolding and nothing else:

- `model/run.js:35` — `RUN_SCHEMA` field `tribute: null` (initial value).
- `model/run.js:92` — reset to `null` again on `newRun()`.
- `model/run.js:156` — `write.tribute(t) { run.tribute = t; bump(); }`, a
  setter with **zero callers anywhere in `src/`** (grepped).

`run.cycle` (`model/run.js:35`, initial value `1`) is likewise set once at
init/reset and **never read, incremented, or displayed anywhere** (grepped
`run.cycle` and bare `cycle` in `view/hud.js` — zero hits in the live HUD).
`docs/DESIGN.md`'s claim of "the HUD shows a static cycle-4 tribute panel as
decoration" is **confirmed stale** — no such panel exists; the only trace is
a code comment in `view/hud.js:530` calling `pairLabel` out as useful "for a
future tribute panel," and the death-screen text at `view/hud.js:501-506` uses
the depth datum, not tribute/cycle, for its only numeric readout.

**What a cycle director could already consume:**

| table | file | rows today | what it exposes |
|---|---|---|---|
| `GRANTS` | `data/grants.js:13-18` | 1 (`gift-kiln` → `kiln_divine`) | machine-grant tier; `STARTING_MACHINES` (`:25-26`) lists the 7 machines placeable with no grant at all |
| `BOONS` | `data/boons.js:19-50` | 5 (`hephaestus-forge`, `poseidon-flood`, `athena-focus`, `ares-frenzy`, `hades-passage`) | timed tier; each a `{secs, mods, conflictsWith?}` row already wired through `model/mods.js` |
| `DROPS` | `data/drops.js:15-18` | 2 | `deep-bellows` (`trigger:'mine'`, consumed today by `rules/mining.js`'s rare-drop hook) and **`tribute-bellows`** (`trigger:'tribute'`, `chance:1`, `give:'bellows'`) — **the row itself already exists and is typed for exactly this event, but nothing anywhere fires a `'tribute'`-triggered roll**; `data/drops.js:4-5`'s own header comment says as much ("Only `mine` is consumed today") |

A cycle director has three tables already shaped for it (grants, boons,
drops) and one still-null scalar (`run.tribute`) with a working, unused
setter — but no altar, no completion event, no favour/suspicion state, and no
consumer of the `tribute` drop trigger. All of that is new work, not wiring.

---

## 9. Headroom

**19 substances** (`data/substances.js`, counted both by grep of top-level
`{ id:'` rows and by `SUB.length` at runtime — both 19), **11 forms**
(`data/forms.js`, same double-check — both 11).

The guard, quoted verbatim (`src/data/forms.js:225-228`):

```js
const STRIDE = FORM.length + 1;

if (1 + (SUB.length - 1) * STRIDE + FORM.length >= BEDROCK)
  throw new Error(`forms: ${SUB.length} substances x ${FORM.length} forms overflows the tile byte`);
```

With `FORM.length = 11`, `STRIDE = 12`, `BEDROCK = 255`: the guard is
`1 + (n-1)*12 + 11 < 255`, satisfied up to `n = 21`. **Current `n = 19`, so
exactly 2 more substances may be added before the tile byte overflows the
build.** (Matches `docs/SPEC.md` §15's own count exactly — cross-checked, not
re-derived independently and taken on faith.)

**One thing not previously stated as sharply: form headroom costs far more
than substance headroom.** Adding a **12th form** raises `STRIDE` to 13, and
re-solving `1 + (n-1)*13 + 12 < 255` caps `n` at **19** — i.e. the moment a
new form is added, the *current* 19 substances are already at the ceiling,
with zero room for a new substance in the same change. Phase 7/8 content that
is tempted to add a new tile-capable *form* (as opposed to extending existing
`look` rows) should know it spends headroom roughly an order of magnitude
faster than a new substance does.

---

## 10. The five hazards for this wave

| # | hazard | file:line | one line |
|---|---|---|---|
| 1 | **Non-flat surface** | `rules/generate.js:55-64` (`KINDS.layer`) | Every column of a `layer` row starts at the identical `fromTy`; the only per-column variation today is the LIP's single ragged carve on the top row (`generate.js:61`) — there is no per-column height function to build on, only a rewrite point. |
| 2 | **Hollow carving** | `rules/generate.js:45-111` (whole `KINDS` table) | No kind produces a void inside solid rock — `blobs`/`vein` only ever *fill*; a hollow needs either a new `KINDS` entry that writes `AIR`/clears, or a post-pass, and must not defeat `skyExposedAt` (`model/tiles.js:71-74`), which assumes row 0 is always open air and would misread an underground air pocket as "sky" if the hollow ever reached row 0 in a band with a shallow `fromTy`. |
| 3 | **The `look`/`TREAT` indirection is not fully generic** | `view/paint.js:174-180` vs. `view/treatments.js:86-91` | `canopy`/`grassCap` are hardcoded key checks in `paintTile`, bypassing the generic `treat()`/`TREAT[fn]` dispatch every other treatment uses (§4) — a third special-cased key is one more `if`, not a row edit, unless the new content routes through the existing `treatments:[]` array instead. |
| 4 | **Content in the astral band, and the chunk-crossing paint bug** | `view/paint.js:61-84` (`chunkCanvas`) + `model/tiles.js:126-135` (`write.touch`) | Any paint effect wider than the ~1-2px edge-shading margin silently loses pixels at a chunk seam with no error and no visual tell (§5, empirically reproduced) — astral terrain or a hollow's rim decoration added without checking this will intermittently vanish depending on where worldgen happens to place it relative to a 16-tile chunk grid. |
| 5 | **An overview that scrolls (doesn't, but is worth checking as content grows)** | `view/scene.js:143-179` (`drawMap`) | `drawMap` re-reads every tile of every band every frame it is open, with no camera/pan/zoom state of its own — cheap today (three bands, ≤~53k tiles total) but a hazard the instant map content grows (more bands, or Phase 10 widening `astral` to `tw:128`) since there is currently no incremental redraw path for the overview the way `chunkCanvas` gives the normal view. |
