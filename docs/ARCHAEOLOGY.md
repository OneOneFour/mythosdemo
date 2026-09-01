# Archaeology — terrain, ore, tree, relic and tutorial rendering

Phase 6.6 (`docs/BUILD_PLAN.md` Wave 2). Read-only history dig, no code changes.
Every commit below was inspected with `git show`/`git log -p`; nothing here is
paraphrased from a screenshot or from memory of the code.

## 0. Method and the commit list that actually matters

```
git log --all --oneline                              # 86 commits, single branch (main);
                                                       # no stashes, no other local branches
git log --all --diff-filter=A --name-only -- '*scene.js'
git log --all --diff-filter=A --name-only -- '*paint.js' '*treatments.js' '*generate.js'
git log --all -S'glow' -- src/
git log --all -S'oliveTree' -- src/ reference/
git log --all -S'canopy' -- src/
git log --all -S'TAKE THE' -- .
git log --all -S'pickaxe' -- src/
```

There is exactly one branch (`main`) and no stashes or tags, so "history" is
this one linear log. The terrain/render code went through three distinct eras,
not a slow drift:

| era | commit | what it is |
|---|---|---|
| **mockup** | `e3f63559c5fc1751a6cf225d4d919dea49c4fc7d` "Import: pixel-art visual mockup" | raw, non-interactive, screen-space painter. `src/world/strata.js` (320 lines), `src/render/scene.js` (132 lines). No tile grid at all — one continuous 1024x2520 bake. |
| **flat prototype** | `8880d6fab670ee3a32cddf01587713fa2b3529a9` "Playable prototype: tile world, player, digging, first two minutes" | moves the mockup verbatim to `reference/mockup/` and writes the FIRST tile-grid implementation: `src/world/generate.js`, `src/world/paint.js`, `src/render/scene.js` (rewritten, 324 lines), `src/sim/tutorial.js`, `src/render/hud.js`. This is the richest `src/` ever got. |
| **archived, then deleted** | `a4e839b70fc734a9a01b251986c23a0bf01b8b4a` "Phase 1: layer directories…" renames the whole flat prototype to `_old_src/` (pure `git mv`, zero content change) as the layered-architecture migration begins. | |
| **layered reimplementation** | `6f93f3b19018b2bf8386fdc7a3ab4e42ae84ef21` "midway reimplement thxs claude" | writes `src/rules/generate.js`, `src/view/paint.js`, `src/view/scene.js`, `src/view/treatments.js` from scratch against the new `rules`/`view`/`model` split — 22 files, 2,918 lines, one commit. This is the direct ancestor of today's code. |
| **cleanup** | `f87e66911fd6504f02a36ef965812784ba1e23e2` "Phase 4-7: rules, view, shell, verification, cleanup" | deletes `_old_src/` outright (`render/scene.js`, `world/generate.js`, `world/paint.js`, `sim/tutorial.js`, `render/hud.js` — all removed, none ported first). |
| **canopy/grass content** | `50402c43cd6e45e33febd7ce118a39c7b9913840` "green green gass" | adds `TREAT.canopy` and `TREAT.grassCap`, and `lip:false` on `data/world.js`'s stone row. Last commit to touch `rules/generate.js` or `view/treatments.js` besides pure comment trims. |

Everything after `50402c4` that touches `view/scene.js` (`55c7a90` fog of war,
`131c6f2` map overview, `4206b03` light/darkness, `e80a3fc` comment trim) adds
an *overlay pass* (fog, light, minimap) and does not change how a tile itself
is painted. Confirmed by `git show <sha> --stat -- src/view/paint.js
src/view/scene.js src/view/treatments.js src/rules/generate.js
src/data/world.js src/data/substances.js` for each: only `scene.js` changes,
and the diffs are additive passes, not edits to `paintTile`/`paintChunk`.

**No commit, on any branch, in any prototype, ever produced a cruciform ore
blob or a multi-tile-thick dithered strata contact at the tile-generation
level.** See §2.2 and §2.3.

---

## 1. The surface/strata painting function

### 1a. `reference/mockup/src/world/strata.js`, current tree (`drawSurface`)

This is the mockup's own surface painter, a screen-space (not tile-space) bake
run once over the whole 1024x2520 canvas. Verbatim:

```js
export function drawSurface(g) {
  R(g, 0, 300, W, 40, P.skyLo);
  R(g, 0, SURFACE_Y - 6, W, 8, P.grassA);
  R(g, 0, SURFACE_Y + 2, W, 4, P.grassB);
  R(g, 0, SURFACE_Y + 6, W, 10, P.soil);
  noiseFill(g, 0, SURFACE_Y - 6, W, 22, [P.grassC, P.grassB], 0.14, 991);
  for (let x = 0; x < W; x += 2)                          // grass tufts
    if (hash2(x, 3) < 0.30) R(g, x, SURFACE_Y - 8, 1, 2, P.grassA);
  // olive trees
  for (let i = 0; i < 14; i++) {
    const x = (hash2(i, 101) * W) | 0;
    if (Math.abs(x - CX) < 70) continue;
    oliveTree(g, x, SURFACE_Y - 7, 8 + ((hash2(i, 103) * 6) | 0));
  }
  digSite(g, CX - 118, SURFACE_Y - 6);
}
```

Note what this is: five flat screen-wide bands (sky, two grass tones, soil, a
`noiseFill` speckle pass), no per-tile material array, and no soil/stone
*contact* zone at all in this function — the mockup's "stone" reads (limestone,
ochre, etc.) are separate, much-deeper functions (`drawLimestone`,
`drawOchre`, …) with their own flat top boundary at a fixed `y0`. **The mockup
itself never paints an interdigitated soil→stone seam** — see §2.2.

### 1b. `8880d6fab670ee3a32cddf01587713fa2b3529a9:src/world/paint.js` — first tile-grid port

The first `src/` tile painter, ported from the mockup's helpers per-chunk
rather than per-world. Full file (158 lines):

```js
import { R, offscreen } from '../core/canvas.js';
import { P, mix } from '../core/palette.js';
import { hash2 } from '../core/rng.js';
import { CHUNK, CHUNKS_X, CHUNKS_Y, CHUNK_PX, TILE, grid, idx, tileAt } from './grid.js';
import { AIR, MAT, isSolid } from './tiles.js';
import { surface } from './generate.js';


/* ============================================================
   CHUNK PAINTING

   The mockup baked one 1024x2520 strip with painterly helpers. The
   same helpers run here, but per 128x128 chunk, so a dig repaints
   ~1/1500th of what a full bake cost. Each chunk keeps its own
   offscreen canvas; the renderer only blits.
   ============================================================ */
const chunks = new Array(CHUNKS_X * CHUNKS_Y).fill(null);

export const stats = { painted: 0, repaints: 0 };

/* Cave interior darkness by depth — the mockup's rockOf().dark, which
   is what made carved space read as cut rather than painted. */
export function darkAt(ty) {
  const y = ty * TILE;
  if (y <  360) return '#2b1e12';
  if (y <  960) return '#453f36';
  if (y < 1600) return '#33210f';
  return '#1a1520';
}

export function resetChunks() {
  chunks.fill(null);
  stats.painted = 0; stats.repaints = 0;
}

export function chunkAt(cx, cy) {
  const k = cy * CHUNKS_X + cx;
  if (!chunks[k]) {
    chunks[k] = offscreen(CHUNK_PX, CHUNK_PX);
    grid.dirty[k] = 1;
  }
  if (grid.dirty[k]) { paintChunk(cx, cy, chunks[k]); grid.dirty[k] = 0; }
  return chunks[k].canvas;
}

export function paintChunk(cx, cy, ch) {
  const g = ch.g;
  const t0x = cx * CHUNK, t0y = cy * CHUNK;
  g.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
  stats.painted++;
  if (chunks[cy * CHUNKS_X + cx]) stats.repaints++;

  for (let j = 0; j < CHUNK; j++) {
    const ty = t0y + j, py = j * TILE;
    for (let i = 0; i < CHUNK; i++) {
      const tx = t0x + i, px = i * TILE;
      const m = tileAt(tx, ty);
      if (m === -1) { R(g, px, py, TILE, TILE, '#000000'); continue; }

      if (m === AIR) {
        // open sky stays transparent so the scene's sky shows through;
        // anything at or below the turf line is excavated rock
        const s = surface[tx] !== undefined ? surface[tx] : 0;
        if (ty >= s) paintCavity(g, px, py, tx, ty);
        continue;
      }
      paintTile(g, px, py, tx, ty, m);
    }
  }
}

/* --- excavated space: dark, with a floor lip and roof fringe so the
       void reads as cut out of the rock rather than simply absent --- */
function paintCavity(g, px, py, tx, ty) {
  const dark = darkAt(ty);
  R(g, px, py, TILE, TILE, dark);
  // faint grain, otherwise large caves read as flat holes
  for (let k = 0; k < 3; k++) {
    const h = hash2(tx * 31 + k, ty * 17);
    if (h < 0.45)
      R(g, px + ((h * 8) | 0), py + ((hash2(k, ty + tx) * 8) | 0), 1, 1,
        mix(dark, '#ffffff', 0.07));
  }
  const below = tileAt(tx, ty + 1), above = tileAt(tx, ty - 1);
  // floor lip: the top edge of the rock under an open space
  if (below !== AIR && below !== -1 && isSolid(below)) {
    const lip = MAT[below].a;
    for (let x = 0; x < TILE; x++) {
      const j = ((hash2(tx * TILE + x, ty) * 3) | 0) - 1;
      R(g, px + x, py + TILE - 1 + j, 1, 1, lip);
      if (hash2(tx * TILE + x, 91) < 0.28)
        R(g, px + x, py + TILE - 2 + j, 1, 1, MAT[below].c);
    }
  }
  // stalactite fringe hanging from a rock ceiling
  if (above !== AIR && above !== -1 && isSolid(above))
    for (let x = 0; x < TILE; x += 3) {
      const d = (hash2(tx * TILE + x, 77) * 4) | 0;
      if (d > 1) R(g, px + x, py, 2, d, MAT[above].c);
    }
}

/* --- solid rock: base tone, hash grain, lit top edge where exposed,
       and crack marks as the pick does its work --- */
function paintTile(g, px, py, tx, ty, m) {
  const M = MAT[m];
  R(g, px, py, TILE, TILE, M.b);

  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const h = hash2(tx * TILE + x, ty * TILE + y);
      if (h < 0.16)      R(g, px + x, py + y, 1, 1, M.c);
      else if (h > 0.90) R(g, px + x, py + y, 1, 1, M.a);
    }

  // exposed faces catch light; buried faces do not
  if (!solidNb(tx, ty - 1))
    for (let x = 0; x < TILE; x++) {
      const j = ((hash2(tx * TILE + x, ty * 7) * 3) | 0) - 1;
      R(g, px + x, py + Math.max(0, j), 1, 2, M.a);
    }
  if (!solidNb(tx - 1, ty)) R(g, px, py, 1, TILE, mix(M.b, M.a, 0.45));
  if (!solidNb(tx + 1, ty)) R(g, px + TILE - 1, py, 1, TILE, mix(M.b, M.c, 0.5));
  if (!solidNb(tx, ty + 1)) R(g, px, py + TILE - 1, TILE, 1, M.c);

  // ore glints, so a vein is spottable from a distance
  if (M.id === 'copper')
    for (let k = 0; k < 2; k++) {
      const hx = (hash2(tx + k * 13, ty * 5) * TILE) | 0;
      const hy = (hash2(ty + k * 7, tx * 3) * TILE) | 0;
      R(g, px + hx, py + hy, 1, 1, P.veinA);
    }

  const d = grid.dmg[idx(tx, ty)] / 255;
  if (d > 0.05) paintCracks(g, px, py, tx, ty, d);
}
```

(`paintCracks` and `solidNb` omitted here — unchanged in spirit from what
survives today; see §1c.)

### 1c. `6f93f3b19018b2bf8386fdc7a3ab4e42ae84ef21:src/view/paint.js` — the layered rewrite, and today

`paintTile`/`paintChunk` at `6f93f3b` are, line for line, the SAME algorithm as
§1b with names generalised from a hardcoded `MAT[m]` lookup to the
`look:{base,hi,lo}` indirection SPEC §12 requires:

```js
function paintTile(g, b, tx, ty, dx, dy) {
  const t = b.tile;
  const L = look(b, tx, ty);
  if (!L) return;

  R(g, dx, dy, t, t, L.base);

  for (let y = 0; y < t; y++)
    for (let x = 0; x < t; x++) {
      const h = hash2(tx * t + x, ty * t + y);
      if (h < 0.16)      R(g, dx + x, dy + y, 1, 1, L.lo);
      else if (h > 0.90) R(g, dx + x, dy + y, 1, 1, L.hi);
    }

  /* Exposed faces catch light; buried faces do not. This is most of what makes
     a dug corridor legible. */
  if (!solidAt(b, tx, ty - 1))
    for (let x = 0; x < t; x++) {
      const jit = ((hash2(tx * t + x, ty * 7) * 3) | 0) - 1;
      R(g, dx + x, dy + Math.max(0, jit), 1, 2, L.hi);
    }
  if (!solidAt(b, tx - 1, ty)) R(g, dx, dy, 1, t, L.edgeL);
  if (!solidAt(b, tx + 1, ty)) R(g, dx + t - 1, dy, 1, t, L.edgeR);
  if (!solidAt(b, tx, ty + 1)) R(g, dx, dy + t - 1, t, 1, L.lo);

  /* THE LINE THAT USED TO SAY `if (M.id === 'copper')`. */
  treat(g, L.row.look, { px: dx, py: dy, tx, ty, tile: t });

  const sub = subAt(b, tx, ty);
  const hard = baseHardAt(b, tx, ty) * (sub < 0 ? 1 : eff('hard', SUB[sub].id));
  const d = progressAt(b, tx, ty, hard);
  if (d > 0.05) cracks(g, dx, dy, tx, ty, d, t);
}
```

This is the direct ancestor of the CURRENT `src/view/paint.js#paintTile`
(read in full at `/Users/robcking/MiscProjects/mythos-factory/src/view/paint.js:146-194`).
The only content-level addition since `6f93f3b` is the `50402c4` "green green
gass" commit's `canopy`/`grassCap` block (current lines 168-180), gated on
`skyExposedAt`:

```js
  if (L.row.look.canopy || L.row.look.grassCap) {
    const cell = { px: dx, py: dy, tx, ty, tile: t };
    if (skyExposedAt(b, tx, ty)) {
      if (L.row.look.canopy) TREAT.canopy(g, cell, L.row.look.canopy);
      if (L.row.look.grassCap) TREAT.grassCap(g, cell, L.row.look.grassCap);
    }
  }
```

`paintCavity` is likewise the same algorithm as §1b's, generalised the same
way (`look(b, tx, ty±1).hi/.lo` instead of `MAT[below].a/.c`). Unchanged since
`6f93f3b`, present today at `src/view/paint.js:113-142`.

**Diagnosis for this section:** no loss. The algorithm (base tone, hash-grain
speckle at two thresholds, per-face directional highlight, crack overlay) is
identical in shape from the very first tile port (`8880d6f`) through today.
The generalisation at `6f93f3b` (raw `MAT[m]` → `look` indirection) is the SPEC
§12 rule working as intended, not a thinning: every colour the old code had
(`M.b`/`M.c`/`M.a`) has a same-cardinality replacement (`L.base`/`L.lo`/`L.hi`).

---

## 2. The soil→stone contact — worldgen, tile-level

### 2.1 What the mockup does — never tile-level, never interdigitated

The mockup has no tile array. `drawSurface` (§1a) paints five flat screen bands
with a noise SPECKLE pass laid over the grass, and stone strata (`drawLimestone`,
`drawOchre`, …) are separate functions with their own hardcoded `y0`/`y1` and
`noiseFill` speckle — never a contact zone between two named materials. **The
"interdigitated fingers, several tiles thick" look was never produced by the
mockup either.** It is not carried-over content that got lost; if it is meant
to exist, it has to be designed new.

### 2.2 The flat prototype (`8880d6f`) DID have a multi-row dithered contact — and it is the one real loss here

`8880d6fab670ee3a32cddf01587713fa2b3529a9:src/world/generate.js`, full file:

```js
import { mulberry, hash2 } from '../core/rng.js';
import { WORLD_TH, WORLD_TW, clearGrid, grid, idx, setTile } from './grid.js';
import { T } from './tiles.js';


/* ============================================================
   GENERATION — tutorial band

   Only the first band exists in the prototype. It is generated
   rather than authored, but with hard guarantees around the spawn
   point so the first two minutes always play the same way.
   ============================================================ */

export const SPAWN_TX   = 42;            // player spawn column
export const SURFACE_TY = 26;            // nominal turf row

/* Filled in by generate(): the turf row for every column. */
export const surface = new Int16Array(WORLD_TW);

export const SITE = {};                  // landmark tile coords for other systems

const FLAT_LO = SPAWN_TX - 9, FLAT_HI = SPAWN_TX + 9;   // guaranteed level ground

export function generate(seed = 1337) {
  const rng = mulberry(seed);
  clearGrid();

  /* --- surface profile: gentle rolling, with a cliff wall on the left
         and a flat shelf around spawn so the tutorial is deterministic --- */
  for (let x = 0; x < WORLD_TW; x++) {
    let h = SURFACE_TY
      + Math.round(Math.sin(x * 0.055) * 2.2)
      + Math.round(Math.sin(x * 0.17 + 1.3) * 1.1);
    if (x < 14) h -= 7 - Math.round(x * 0.4);            // the cliff you wake at
    if (x >= FLAT_LO && x <= FLAT_HI) h = SURFACE_TY;    // the shelf
    surface[x] = h;
  }

  /* --- strata fill --- */
  for (let x = 0; x < WORLD_TW; x++) {
    const s = surface[x];
    for (let y = s; y < WORLD_TH; y++) {
      let m;
      if (y === s)              m = T.grass;
      else if (y < s + 7)       m = T.soil;
      else if (y < 120)         m = T.lime;
      else                      m = T.granite;
      // ragged strata boundary rather than a ruled line
      if (y >= s + 5 && y < s + 9 && hash2(x, y) < 0.35) m = T.lime;
      if (y >= 116 && y < 124 && hash2(x, y * 3) < 0.4)  m = T.granite;
      grid.mat[idx(x, y)] = m;
    }
  }
  /* … copper vein / scattered ore / caves / olive tree / landmarks, see §3, §4 … */
}
```

Note the two lines that produce the actual multi-tile "fingers" effect:

```js
if (y >= s + 5 && y < s + 9 && hash2(x, y) < 0.35) m = T.lime;
if (y >= 116 && y < 124 && hash2(x, y * 3) < 0.4)  m = T.granite;
```

A **4-tile-deep window** (`s+5` to `s+9`) where any given tile has a 35% chance
of flipping from soil to stone (`T.lime`), independently per-column via
`hash2(x,y)`. That is a real dithered, several-tile-thick, per-tile-random
contact zone — the "blocky fingers of brown into beige and back" the known-good
look describes. The deep granite boundary (rows 116–124, 8 tiles, 40% flip
chance) does the same thing one stratum down.

### 2.3 What replaced it, and when it was lost

`6f93f3b`'s `rules/generate.js#KINDS.layer` (full function, unchanged today
except the `lip:false` guard added in `50402c4`):

```js
layer(b, row) {
  const sub = S[row.sub];
  const top = Math.max(0, row.fromTy);
  const bot = Math.min(b.th, row.toTy);
  for (let ty = top; ty < bot; ty++)
    for (let tx = 0; tx < b.tw; tx++) {
      if (ty === top && row.lip !== false && !onShelf(b, tx) && rand() < LIP) continue;
      tw.set(b, tx, ty, sub, NATIVE);
    }
},
```

`LIP = 0.35` and it is applied to **exactly one row** — `ty === top` — of a
layer, never a multi-row window. And in the actual content
(`src/data/world.js:61-69`, the `surface` band, quoted in full):

```js
{ id:'surface', name:'THE SUN\'S FLOOR',
  ...
  strata:[
    { kind:'layer', sub:'soil',   fromTy:20, toTy:27 },
    { kind:'layer', sub:'stone',  fromTy:27, toTy:56, lip:false },
    ...
  ]
```

the stone row explicitly sets `lip:false` — its own code comment says why
(`layer()`'s ragged-edge carve would otherwise treat row 27 as "another exposed
surface" and punch random air pockets seven tiles underground). **The practical
effect: the soil→stone seam at ty=27 is drawn as a dead-flat, perfectly ruled
horizontal line today**, with zero randomisation — not even the single-row lip
the mockup-derived flat prototype had at its OWN stone boundary (`s+7`, no
`hash2` dither at all there either, actually — the flat prototype's dither was
specifically at the soil/LIMESTONE line, not soil/first-stone; today's single
`soil`→`stone` transition in `surface` band is a closer analogue of the flat
prototype's un-dithered `s..s+7` soil band than of its dithered zone).

Either way, the multi-row `hash2`-dithered transition band that DID exist at
`8880d6f` was **deleted, unported, at `f87e669`** (`_old_src/world/generate.js`
removed outright — no successor commit's diff carries these two lines forward
into `rules/generate.js`). `6f93f3b`'s `layer()` kind was written from a
description of the goal, not a port of this file's actual randomisation.

**Diagnosis: this is a genuine casualty of the flat→layered reimplementation,
not a deliberate simplification and not a documented judgment call.** No
commit message or code comment anywhere states a reason for dropping the
multi-row dither; `6f93f3b`'s commit message ("midway reimplement thxs claude")
gives no rationale for any specific pixel decision. It reads as the new
generator having been designed against SPEC's prose rather than against the
old file's code.

---

## 2.4. The ore blob shape — never cruciform, anywhere, at any layer

Checked explicitly per the task's own caveat ("it may never have existed as
tile-level generation — check"). It never did, at any level:

- **Mockup** (`reference/mockup/src/world/strata.js#orePocket`, quoted in full):
  ```js
  export function orePocket(g, x, y, s) {
    for (let i = 0; i < 6; i++) {
      const ox = (hash2(s + i, 701) * 10 - 5) | 0, oy = (hash2(s + i, 703) * 8 - 4) | 0;
      R(g, x + ox - 1, y + oy - 1, 4, 4, P.veinC);
      R(g, x + ox, y + oy, 2, 2, P.veinA);
    }
  }
  ```
  6 scattered 4x4/2x2 speckles around a centre — a loose cluster, not a blob,
  not cruciform. The mockup's copper VEINS are separately drawn with `walk()`
  (a drunken random walk, branching thread-like lines), also not blobs.

- **Flat prototype** (`8880d6f:src/world/generate.js#blob`, quoted in full):
  ```js
  function blob(cx, cy, r, mat, seed) {
    const rr = r * r;
    const ri = Math.ceil(r);
    for (let y = cy - ri; y <= cy + ri; y++)
      for (let x = cx - ri; x <= cx + ri; x++) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d > rr) continue;
        if (d > rr * 0.45 && hash2(x * 7 + seed, y * 13) < 0.42) continue;  // ragged rim
        setTile(x, y, mat);
      }
  }
  ```
  A circular disc (`d > rr` cutoff) with a ragged, randomly-eroded rim. Round,
  not cruciform.

- **Layered rewrite, and today** (`6f93f3b`/current `rules/generate.js#blob`,
  identical algorithm, generalised to any substance):
  ```js
  function blob(b, cx, cy, r, sub) {
    const rr = r * r, ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const d = dx * dx + dy * dy;
        if (d > rr) continue;
        if (d > rr * 0.45 && rand() < 0.42) continue;          // ragged rim
        const tx = cx + dx, ty = cy + dy;
        if (inBounds(b, tx, ty)) tw.set(b, tx, ty, sub, NATIVE);
      }
  }
  ```
  Same circular-disc-with-ragged-rim shape, `hash2` swapped for `rand()`
  (worldgen consumes the run stream; painting must not — ARCHITECTURE invariant
  7). Used identically for copper/tin/granite/adamant blobs and the guaranteed
  spawn vein (`data/world.js:81-82, 97-104`).

**Diagnosis: "cruciform ore blobs" is not a regression from any commit — it
was never built.** A round, ragged-rimmed disc at low pixel density (an 8px
tile, `r` in the 1.2–3.8 tile range) can look angular/cross-like by chance at a
given seed and viewport, which is the most likely source of that description
in `known-good.png` — a perceptual read of a small raggedy circle, not a
distinct generator. This is a "build new if wanted" item, not a "recover" item.

---

## 3. The tree draw

### 3.1 Mockup's `oliveTree()` — `reference/mockup/src/world/strata.js:70-77`, verbatim

```js
export function oliveTree(g, x, y, s) {
  R(g, x, y - s, 2, s, P.woodC);
  const cols = [P.grassB, P.grassA, P.grassC];
  for (let i = 0; i < 26; i++) {
    const a = hash2(x + i, 17) * 6.283, r = hash2(x + i, 19) * s * 0.8;
    R(g, x + 1 + Math.cos(a) * r, y - s - 2 + Math.sin(a) * r * 0.7, 2, 2,
      cols[(hash2(x + i, 23) * 3) | 0]);
  }
}
```

A 2px trunk plus 26 individually-placed 2x2 dots scattered in a polar-random
disc (`hash2`-driven angle and radius) around the canopy centre, in three green
tones — a "dot-cloud" stochastic canopy, per the code's own later description
of it.

### 3.2 The flat prototype's tree — `8880d6f:src/world/generate.js`, its own intermediate approach (neither `oliveTree` nor today's canopy)

```js
/* --- the dead olive tree: the only timber on the surface, and so the
       only ladder material until you find more --- */
const otx = SPAWN_TX + 7, oty = surface[otx];
for (let y = oty - 1; y >= oty - 6; y--) setTile(otx, y, T.timber);
blob(otx, oty - 7, 2.6, T.leaves, 555);
setTile(otx, oty - 7, T.timber);
SITE.tree = { tx: otx, ty: oty - 6 };
```

This is a THIRD, previously undocumented approach: a 6-tile timber trunk with
a round ragged-rim BLOB (§2.4's `blob()`, radius 2.6) of a dedicated `T.leaves`
tile material dropped on top. Not the mockup's dot-cloud, and not today's
rectangular canopy — a circular tile cluster, tile-level (so it is diggable and
persists like any other tile, unlike the mockup's pure paint or today's
paint-only canopy).

### 3.3 Today's `TREAT.canopy` — `src/data/substances.js:72-87` and `src/view/treatments.js:53-68`, and why it is NOT a loss

Substance row (`src/data/substances.js`):
```js
{ id:'timber', name:'TIMBER', short:'WOOD', tags:['organic', 'mineable'],
  tile:{ solid:true, hard:0.35, drops:'log' },
  item:{ mass:0.8, hud:{ order:3, always:true } },
  look:{ base:'woodB', hi:'woodA', lo:'woodD',
         item:['woodA', 'woodC'],
         /* `view/paint.js` grows this on a timber column's TOP tile only --
            a felled trunk's new top grows one the next time that tile
            repaints, with no code change, because the geometry test is
            "nothing solid above, all the way up" (`skyExposedAt`), not
            "this is a trunk". Solid blocks, not a scatter: a chunky
            Terraria-style canopy reads at this project's small viewport in a
            way a stochastic dot-cloud did not. */
         canopy:{ leaves:['vdB', 'vdA'], w:3, h:2 } } },
```

Treatment function (`src/view/treatments.js`):
```js
  /* A blocky canopy over a trunk's TOP tile: `w` x `h` TILES of solid colour,
     centred on the trunk and sitting flush on top of it, with a lighter top
     course rather than a dithered edge -- deliberately closer to Terraria's
     leaf blocks than to the preserved mockup's stochastic dot-cloud
     `oliveTree()` (`reference/mockup/src/world/strata.js`), which reads as
     fuzzy rather than as a tree at this project's small viewport. `paint.js`
     is the only caller, and only when `skyExposedAt` is true -- "a clear shot
     to the sky", which is a `model/tiles.js` query this file may not make
     itself (data + core only, see the file header). */
  canopy(g, c, p) {
    const base = colour(p.leaves?.[0] || 'vdB'), hi = colour(p.leaves?.[1] || 'vdA');
    const w = (p.w || 3) * c.tile, h = (p.h || 2) * c.tile;
    const bx = (c.px + c.tile / 2 - w / 2) | 0, by = c.py - h;
    R(g, bx, by, w, h, base);
    R(g, bx, by, w, Math.max(1, (c.tile / 4) | 0), hi);
  },
```

**Diagnosis, confirming the ground-truth table's own finding: deliberate
simplification, stated in the code's own comment, added in `50402c4` ("green
green gass"), not a regression.** It replaced the flat-prototype's leaf-BLOB
tile cluster (§3.2), not the mockup's dot-cloud directly (that path was never
in `src/` at tile level to begin with — the mockup's `oliveTree` was pure paint
over a mockup that had no tile grid).

---

## 4. The pickaxe sprite and its `glow()` call site

### 4.1 The mockup has no pickaxe sprite at all

`grep -rn pick reference/mockup/src/` finds nothing except an unrelated comment
in `sim/lift.js` ("pick up what's waiting"). There is no relic, no pickaxe
drawing function, nowhere in the mockup.

### 4.2 The flat prototype's `drawPickup()` — `8880d6f:src/render/scene.js:167-176`, verbatim — THIS is the known-good sprite

```js
function drawPickup(cx, cy) {
  if (pickup.taken) return;
  const bob = Math.sin(pickup.bob) * 1.6;
  const x = (pickup.tx * TILE + 2 - cx) | 0;
  const y = (pickup.ty * TILE + bob - cy) | 0;
  if (x < -20 || x > VIEW.w + 20 || y < -20 || y > VIEW.h + 20) return;
  lineTo(ctx, x, y + 8, x + 3, y, P.woodB);              // haft
  R(ctx, x + 1, y - 2, 5, 2, P.irA);                     // head
  R(ctx, x + 1, y - 1, 5, 1, P.irC);
  glow(ctx, x + 3, y + 2, 12 + Math.sin(pickup.bob * 1.3) * 3, '#ffe9a8', 0.4);
}
```

Driven by `sim/tutorial.js`'s dedicated state (`8880d6f:src/sim/tutorial.js:35`):
```js
export const pickup = { tx: 0, ty: 0, taken: false, bob: 0 };
```
and its own per-frame update (`updateTutorial`):
```js
pickup.bob += dt * 2.4;
```

This is the angled haft (`lineTo`, a Bresenham diagonal from foot to head),
the iron head (two flat rects), a sine-driven bob, and a `glow()` halo in a
warm gold (`#ffe9a8`) tied to the SAME bob phase — "planted upright, with a
soft glow marking it as a divine relic" describes this function exactly.

The same file's `drawAltar` and `drawAim` also call `glow()` (altar rise glow,
same gold; the mockup's own lavafall/eye/lake glows carried over — see
`e3f6355:src/render/scene.js` in §0's table, already using `glow()` for lava
and monster eyes). `glow()` itself is untouched core machinery across all three
eras — see §4.4.

### 4.3 What replaced it, and when it was lost

`core/pixels.js#glow` is defined once, at `59323c1` ("Phase 2-3: core, data and
model layers"), and is **byte-for-byte unchanged since** (confirmed:
`git log --oneline -- src/core/pixels.js` shows exactly one commit touching the
file, ever):

```js
/* The one non-integer effect in the project, and it is additive light rather
   than geometry, so it cannot produce a half-pixel edge. */
export function glow(g, x, y, r, col, a = 0.5) {
  if (!(r > 0)) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
```

`glow()` is called TODAY in exactly two places:

1. `view/treatments.js#TREAT.halo` (added `6f93f3b`, unchanged since):
   ```js
   halo(g, c, p) {
     glow(g, c.px + c.tile / 2, c.py + c.tile / 2, p.r || c.tile, colour(p.col), p.a ?? 0.3);
   },
   ```
   — a treatment ANY substance row can request via `look.treatments`, but
   **no substance row does** (`grep -n "fn:'halo'" src/data/substances.js`
   returns nothing). It exists and is wired end-to-end, but unused by content.

2. `view/scene.js#atmosphere`, for a running machine's fire (`src/view/scene.js:457-461`):
   ```js
   for (const m of machines) {
     if (!(m.fire > 0.02) || !seenAt(m.band, m.tx, m.ty)) continue;
     glow(g, m.box.x + m.box.w / 2 - cam.x, m.box.y + m.box.h - 2 - cam.y,
          12 + m.fire * 8, INK.heat, 0.4 * m.fire);
   }
   ```
   — furnace/kiln fire glow, a direct descendant of `8880d6f`'s
   `drawStructures`'s own `glow(ctx, x + s.w / 2, y + s.h - 2, 12 + fire * 8,
   P.lavaB, 0.4 * fire)` (also quoted in full in that commit).

The pickaxe **item substance row** (`src/data/substances.js:115-117`) is:
```js
{ id:'pick', name:'STOCK PICKAXE', short:'PICK', tags:['relic'],
  ...
  look:{ item:['irB', 'woodC'] } },
```
Two flat colours, no `treatments`, no `halo`. It is placed at boot
(`src/shell/boot.js:122`):
```js
itemw.spawn(home, worldX(home, spawnTx + 4), worldY(home, floorTy - 1), S.pick, F.relic, 0, 0);
```
and rendered by the fully generic dropped-item painter
(`src/view/paint.js#paintItem`, unchanged since `6f93f3b`):
```js
export function paintItem(g, it, px, py, t) {
  const l = SUB[it.sub].look;
  if (!l?.item) return;
  const s = sizeOf(it), h = s >> 1;
  const a = colour(l.item[0]), bcol = colour(l.item[1] ?? l.item[0]);
  R(g, px - h, py - h, s, s, a);
  R(g, px - h, py + h - 1, s, 1, bcol);
  R(g, px - h, py - h, 1, 1, mix(a, INK.white, 0.5));
  treat(g, l, { px: px - h, py: py - h, tx: px | 0, ty: py | 0, tile: s });
  ...
}
```
— the SAME two-colour square-plus-highlight every other dropped ore/log/gravel
gets, with no bob, no haft/head silhouette, and no glow (because `look.item`
carries no `treatments`).

**One piece did survive, faithfully**: the PLAYER's held-pick sprite. Compare
`8880d6f:src/render/scene.js:122-126` —
```js
if (run.hasPick) {                                   // the pick, held out front
  const hx = x + (p.face > 0 ? PW : -1), hy = y + 6;
  const sw = p.digAnim ? 1 : 0;
  lineTo(ctx, hx, hy + sw, hx + p.face * 4, hy - 3 + sw * 4, P.woodB);
  R(ctx, hx + p.face * 4, hy - 4 + sw * 4, 2, 2, P.irA);
}
```
to today's `src/view/scene.js:272-277`:
```js
if (hasPick()) {                                          // held out front
  const hx = x + (p.face > 0 ? PW : -1), hy = y + 6;
  const sw = p.digging ? 1 : 0;
  lineTo(g, hx, hy + sw, hx + p.face * 4, hy - 3 + sw * 4, INK.haft);
  R(g, hx + p.face * 4, hy - 4 + sw * 4, 2, 2, INK.head);
}
```
Identical algorithm, colours resolved through `INK` instead of `P` directly.
This piece was never lost — it was never glowing in the original either (only
the ON-GROUND relic bobbed and glowed; the held one never did).

**Diagnosis: casualty of the chunk-bake/layered refactor, specifically of the
`_old_src` deletion at `f87e669` outrunning the port.** `sim/tutorial.js` (and
its `pickup`/`altar` state, and `drawPickup`/`drawAltar`) were archived at
`a4e839b`, never referenced by any file written in `6f93f3b`'s reimplementation,
and permanently deleted eleven commits later at `f87e669` with the rest of
`_old_src/`. This is not the SPEC §12 "no substance name in `view/`" rule biting
— `look.treatments`/`TREAT.halo` already exists and could carry a glow on the
`pick` row today with a one-line content change; nobody has asked for it since.
It is a straightforward dropped-during-rewrite feature, same shape as §2's
strata dither.

### 4.4 `view/treatments.js#halo`, today, in full (for completeness — quoted already above; repeated once as the exact extract requested)

```js
  halo(g, c, p) {
    glow(g, c.px + c.tile / 2, c.py + c.tile / 2, p.r || c.tile, colour(p.col), p.a ?? 0.3);
  },
```

---

## 5. The tutorial callout widget

### 5.1 The flat prototype's widget — `8880d6f:src/render/hud.js:96-109`, verbatim

```js
/* the current beat's instruction, plus transient toasts */
function hint(W, H) {
  let msg = '', col = P.uiDim;
  if (run.toastT > 0) { msg = run.toast; col = P.ui; }
  else {
    const b = BEATS[Math.min(run.beat, BEATS.length - 1)];
    msg = b.hint;
  }
  if (!msg) return;
  const w = textWidth(msg) + 12;
  const x = Math.max(2, (W - w) >> 1);
  const y = H - 16;
  panel(x, y, Math.min(w, W - 4), 12, 0.78);
  drawText(ctx, msg, x + 6, y + 3, col, 1, 1);
}
```

with its `panel()` primitive (`8880d6f:src/render/hud.js:30-33`):
```js
function panel(x, y, w, h, a = 0.72) {
  ctx.globalAlpha = a; R(ctx, x, y, w, h, P.uiBack); ctx.globalAlpha = 1;
  R(ctx, x, y, w, 1, mix(P.uiBack, P.uiDim, 0.6));
}
```

and driven by the actual content that made "TAKE THE PICKAXE" appear —
`8880d6f:src/sim/tutorial.js:14-24`, the full beat sheet:
```js
export const BEATS = [
  { id: 'walk',    hint: 'LEFT / RIGHT TO WALK' },
  { id: 'pick',    hint: 'TAKE THE PICKAXE' },
  { id: 'dig',     hint: 'HOLD DIG TO CUT ROCK — TRY THE PALE SEAM UNDERFOOT' },
  { id: 'copper',  hint: 'DIG DOWN. SOMETHING IS DOWN THERE' },
  { id: 'ascend',  hint: 'GET BACK UP. FELL THE OLIVE TREE FOR LADDERS' },
  { id: 'trial',   hint: 'SOMETHING IS WATCHING FROM ABOVE' },
  { id: 'deliver', hint: 'BRING 10 COPPER TO THE ALTAR' },
  { id: 'furnace', hint: 'PLACE THE FURNACE — THINK ABOUT WHERE' },
  { id: 'done',    hint: '' }
];
```
i.e. exactly `docs/SPEC.md` §5's beat sheet, implemented as a state machine
(`updateTutorial`, `advance()`, `beatId()`) that watches player state and
advances on evidence, never a timer.

This is a bottom-centre bordered panel (not literally "centre-screen" — `y =
H - 16` is the bottom edge, matching how `hint(W, H)` positions it in every
subsequent version too; the BUILD_PLAN prompt's "centre-screen" description of
`known-good.png` is the one place this archaeology finds a discrepancy between
the described screenshot and any commit's actual code — see §7).

### 5.2 Today's widget — `src/view/hud.js:469-477`, and its `panel()` — verbatim, and NOT lost

```js
/* Transient text, drained out of the journal by `shell/notify.js`. */
function hint(g, W, H) {
  const t = toasts[toasts.length - 1];
  if (!t) return;
  const w = Math.min(textWidth(t.text) + 12, W - 4);
  const x = Math.max(2, (W - w) >> 1);
  const y = H - 16;
  panel(g, x, y, w, 12, 0.78);
  drawText(g, t.text, x + 6, y + 3, UI.ink, 1, 1);
}
```
```js
function panel(g, x, y, w, h, a = 0.72) {
  g.globalAlpha = a; R(g, x, y, w, h, UI.back); g.globalAlpha = 1;
  R(g, x, y, w, 1, mix(UI.back, UI.dim, 0.6));
}
```

Line for line the same widget: same bottom-centre placement math
(`(W - w) >> 1`, `H - 16`), same bordered-panel primitive (alpha-blended fill
plus a lighter top rule), same 12px height, same clamp-to-viewport width. The
only change is where the TEXT comes from: `run.toast`/`BEATS[run.beat].hint`
(a direct read of tutorial state) became `toasts[toasts.length-1].text` (the
generic journal-drained toast queue every `rules` module now pushes through,
per `CLAUDE.md`'s "notification flows downward as data").

### 5.3 What is actually missing

**Not the widget. The content.** `find src -iname '*tutorial*'` and
`grep -rln 'BEATS\|beatId' src/` both return nothing today. The entire beat
sheet — `docs/SPEC.md` §5's nine-beat state machine, the altar/trial flow, the
pickup/bob linkage in §4 — was archived whole at `a4e839b` (`{src =>
_old_src}/sim/tutorial.js`) and permanently deleted at `f87e669`
(`_old_src/sim/tutorial.js | 143 -----`), with **no successor file written
anywhere in `rules/` or `model/`**. The rendering widget that would show its
text is alive and well; it currently has nothing beat-driven to say, only
whatever transient toast the last `rules` action happened to push (e.g. a mining
refusal reason). A player today gets no "TAKE THE PICKAXE"-equivalent guidance
at all.

---

## 6. Loss ledger — classification per feature

| feature | last commit with the richer version | what replaced it / current state | classification |
|---|---|---|---|
| strata base paint algorithm (speckle, face-lit edges, cracks) | n/a — never lost | `view/paint.js#paintTile`, same algorithm since `8880d6f`, generalised at `6f93f3b` per SPEC §12 | **not a loss.** `look:{base,hi,lo}` is a same-cardinality replacement for `M.b/M.c/M.a`. |
| multi-row dithered soil→stone contact | `8880d6f` (`src/world/generate.js`'s `s+5..s+9` / `116..124` hash-flip windows) | `rules/generate.js#KINDS.layer`'s single-row 35% `LIP`, and `lip:false` on the live `surface` band's stone row → today the seam is a dead-flat ruled line | **casualty of the flat→layered reimplementation (`6f93f3b`)**, finalized by `f87e669` deleting the unported original. No comment or commit message states a reason. |
| cruciform ore blobs | never existed | round, ragged-rimmed disc (`blob()`), identical shape mockup → flat prototype → today | **never actually built.** Not in the mockup, not in any `src/` era. Likely a perceptual read of a small ragged circle in the reference screenshot. Phase 8+ must design this fresh if wanted. |
| tree canopy | `8880d6f` (round leaf-BLOB tile cluster) / mockup (`oliveTree` dot-cloud, pure paint) | `TREAT.canopy`, rectangular Terraria-style leaf blocks, added `50402c4` | **deliberate simplification, stated in-code.** Neither predecessor form is what it replaced 1:1 — the flat prototype's tile-level leaf blob was never explicitly discussed in the comment, only the mockup's paint-only dot-cloud was. |
| pickaxe relic sprite (haft+head silhouette, bob, glow halo) on the ground | `8880d6f` (`drawPickup`, `sim/tutorial.js#pickup`) | generic `paintItem()` two-colour square, no glow, no bob, no distinct shape | **casualty of the reimplementation**, same shape as the strata loss: archived at `a4e839b`, never ported into `6f93f3b`, deleted at `f87e669`. The machinery to fix it (`look.treatments`, `TREAT.halo`, `glow()`) all still exists and works (proven by machine fire glow) — only the CONTENT ROW (`pick`'s `look`) was never given a `halo`/shape treatment. |
| player's held-pick sprite | n/a — never lost | `view/scene.js#drawPlayer`, identical `lineTo`+`R` shape since `8880d6f` | **not a loss.** |
| tutorial callout WIDGET (bordered bottom-centre panel) | n/a — never lost | `view/hud.js#hint`/`#panel`, line-for-line identical placement/paint math since `8880d6f`, only the text source changed | **not a loss.** The rendering code ported perfectly. |
| tutorial callout CONTENT (the beat sheet itself, SPEC §5) | `8880d6f` (`sim/tutorial.js#BEATS`, `updateTutorial`, altar/trial flow) | nothing — `find src -iname '*tutorial*'` is empty | **casualty of the reimplementation**: archived at `a4e839b`, deleted unported at `f87e669`. Docs (`SPEC.md` §5) still describe it as if current; it is not implemented anywhere in `rules/`/`model/`. |

---

## 7. What can and cannot be ported

**Strata dither (§2.2).** The two `hash2` lines CANNOT be pasted back as-is:
they index a flat `WORLD_TH`-tall single array by absolute row (`s+5`..`s+9`
relative to a per-column `surface[x]`), whereas today's model is band-local
tile rows plus a `data/world.js` strata-row `{fromTy,toTy}` window with no
concept of "distance below THIS row's own top" baked into `KINDS.layer`. To
port the effect: add a new `KINDS` entry (say `fringe`) that takes a row like
`{ kind:'fringe', sub:'stone', under:'soil', depth:4, chance:0.35 }` and, for
each column, walks down from where the ABOVE layer's material stops, flipping
tiles to `sub` with `rand() < chance` for `depth` rows — i.e. re-expressed as
a new strata kind per `docs/BUILD_PLAN.md` Phase 7's own stated extension
point ("a new pass is a new `KINDS` entry plus a new strata row"), not a
revert. It must use `rand()`, not `hash2` (worldgen consumes the run stream;
`hash2` is for paint, which may not).

**Ore blobs.** Nothing to port — round-with-ragged-rim already IS the live
code, unchanged since `6f93f3b`. If a cruciform (or any non-round) shape is
wanted, it is new content: a new `KINDS.blobs`-adjacent shape function, still
gated through `rand()` for the same reason.

**Tree canopy.** The mockup's `oliveTree()` still typechecks as pure JS against
nothing in particular — it draws in raw screen pixels off a `(x,y,s)` triple
with no tile/band awareness at all, so it cannot be called as-is against the
band/chunk model; every coordinate would need to become `cell.px/py/tile` the
way `TREAT.canopy` already receives them, and the dot-cloud's 26 individually
hashed points would need to become `hash2`-seeded (never `rand()`, since this
is a paint-time treatment) using `c.tx`/`c.ty` for stability across repaints —
exactly the pattern `TREAT.glint` already uses. The flat prototype's leaf-BLOB
tile cluster (§3.2) is closer to portable in spirit (it's tile-level, so it
would become a `trees`-adjacent `KINDS` entry that also stamps a `leaves`
substance blob) but nobody has asked to revisit the `50402c4` decision, and
CLAUDE.md/BUILD_PLAN both flag it as a judgment call, not a bug.

**Pickaxe glow.** Fully portable with a content-only change, no engine work:
add `treatments:[{ fn:'halo', col:'ichor', r:12, a:0.4 }]` (or a new named
colour) to the `pick` substance's `look` block in `src/data/substances.js`.
`paintItem()` already calls `treat(g, l, cell)` for every dropped item
(`src/view/paint.js:272`), so this alone restores the glow. The BOB animation
and the distinct haft/head silhouette are a different matter: `paintItem()` is
generic by design (SPEC §12 — no per-substance draw function), so a bobbing,
non-square sprite would need either (a) a new `treatments` fn that overlays a
haft+head shape on top of the generic square (cheap, keeps the "no per-item
draw function" rule intact), or (b) a dedicated exception the `paintItem`
header comment explicitly says was rejected for machines ("no machine name, no
per-machine draw function — that was rejected precisely because it makes 'add
a machine' always cost a render edit"); the same argument applies to items.
Route (a) is the only one consistent with the existing architecture.

**Tutorial beat sheet.** The widget needs no work — it already renders
whatever the journal's last toast says. The content (`BEATS`, `advance()`,
the altar/trial/furnace-gift flow) must be re-expressed as a new
`rules/tutorial.js` (or similar) sibling, scheduled per `shell/schedule.js`,
that pushes journal rows (`CLAUDE.md`: "notification flows downward as data;
`rules` never calls `play()`/`toast()` directly") instead of calling `toast()`
imperatively the way `8880d6f`'s version did — that direct call is itself
now against the architecture, so this is a rewrite-against-current-APIs case,
not a port, even though the STATE MACHINE'S LOGIC (nine beats, evidence-based
advancement, no timers) can be carried over essentially unchanged in shape.

**One note on the screenshot description itself.** §5.1 found that the
tutorial widget was always bottom-centre (`y = H - 16`), in every version
checked, from the first flat prototype through today. If `known-good.png`
truly shows it centred vertically in the middle of the screen, that is either
a different, unfound version (none turned up in `git log --all`, and there are
no other branches or stashes to search) or a description mismatch worth
re-checking against the actual PNG before Phase 8 spends effort moving the
widget's anchor.
