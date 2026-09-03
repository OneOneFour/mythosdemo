/* LAYER view — PAINTING. Per-chunk terrain into cached offscreen canvases, plus
   the live item and machine passes. Imports `core`, `data` and READ-ONLY `model`
   queries. Imports no `write` namespace and no `rules` module.

   NO SUBSTANCE NAME AND NO MACHINE NAME APPEARS ANYWHERE IN THIS LAYER.
   Everything drawn below comes from a `look` block: `base`/`hi`/`lo` for rock,
   `item` for a dropped unit, `body`/`trim`/`base`/`fire`/`pips` for a machine,
   and `treatments` for anything a colour triple cannot say. See
   docs/DEVELOPER_GUIDE.md#colour-and-appearance

   A DIG REPAINTS ITS CHUNK, NOT THE WORLD (invariant 3). The mockup baked one
   1024x2520 strip; this paints 128x128 px, about 1/1500th of a full bake.

   INVALIDATION IS A VERSION COUNTER, NOT A DIRTY FLAG, and that is forced by
   the epoch assertion: `view` may not write to `model`, so it cannot clear a
   flag. See docs/DEVELOPER_GUIDE.md#view-cache-invalidation */

import { offscreen } from '../core/canvas.js';
import { drawText } from '../core/font.js';
import { blend, mix } from '../core/palette.js';
import { LIGHT, R, lineTo, noiseFill } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { AIR, NATIVE } from '../data/forms.js';
import { MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { SUB } from '../data/substances.js';
import { fill, machines, statusOf } from '../model/machines.js';
import { unitProgressAt } from '../model/mining.js';
import { sizeOf } from '../model/items.js';
import { eff } from '../model/mods.js';
import { CARRIER_H, CARRIER_W, carrierPos, segmentsAt } from '../model/segments.js';
import { baseChargeAt, baseHardAt, formAt, formRowOf, rowAt, skyExposedAt, solidAt, subAt, tileAt } from '../model/tiles.js';
import { bands, chunkPx, chunkVer, heightPx } from '../model/world.js';
import { EXTENT, TREAT, seedAt, treat } from './treatments.js';
import { SPRITE } from './sprites.js';

/* Repaints per frame. A first paint is never budgeted — a chunk with no canvas
   has nothing stale to show — but a re-paint is, so walking a long tunnel while
   digging cannot stack forty bakes into one frame.

   STILL 8, AND THAT WAS RE-EXAMINED RATHER THAN ASSUMED, because the decoration
   margin below changed both sides of the trade at once: a tile write now makes
   up to nine chunks stale instead of one to three, so the budget is genuinely
   REACHED where it used to be approached, and a chunk repaint got dearer.
   Measured on this machine, cold-baking the 23 chunks a 640x400 viewport holds
   (a frame with nothing stale is 0.2 ms either way):

     before Phase 8 (commit 0da2a06)   23.5 ms, 1.02 ms per chunk
     after                             35.3 ms, 1.53 ms per chunk

   So the worst case is 8 x 1.53 = 12.2 ms, in the one frame a tile breaks,
   roughly twice a second while digging — inside a 16.7 ms frame, and the
   simulation is a fixed 1/120 s step that does not care what the draw costs.
   Five was tried and is worse: it caps the spike at 7.6 ms but the chunk being
   dug is mid-raster-order among the nine, so it loses its turn and the shaft
   visibly lags several tiles behind the pick (caught by `digging.png`, whose
   diff was exactly the shaft column and nothing else). A skipped chunk shows its
   own previous canvas, never a blank one — that is the trade this budget exists
   to make, and paying it on the tile you are looking at is the wrong place. */
const REPAINT_BUDGET = 8;

/* HOW WIDE A NEIGHBOURHOOD A CHUNK'S APPEARANCE DEPENDS ON, in tiles. Taken
   from the decorations' own declared reach (`view/treatments.js#EXTENT`) so the
   two can never drift: whatever the widest decoration is, that is how far
   outside its own range a chunk has to look for the tiles that emit into it. */
const DECO_MARGIN = Math.max(...Object.values(EXTENT));

export const stats = { painted: 0, repainted: 0, cached: 0, skipped: 0 };

/* band ord + chunk index -> { canvas, g, ver }. */
const cache = new Map();
let budget = REPAINT_BUDGET;

/* Called by `shell/boot.js` on every new run. The canvases hold the previous
   world and a stale blit is worse than a black frame. */
export function resetChunks() {
  cache.clear();
  looks.clear();
  worldBottom = 0;
  stats.painted = 0; stats.repainted = 0; stats.cached = 0; stats.skipped = 0;
}

/* Give each frame its own repaint budget. Called once per frame by `view/scene.js`. */
export function beginFrame() {
  budget = REPAINT_BUDGET;
  stats.cached = cache.size;
}

/* THE VERSION A CACHED CANVAS IS CHECKED AGAINST, and it is not this chunk's
   own version alone.

   `model/tiles.js#write.touch` bumps the written tile's chunk and, when the tile
   sits on a seam, the one chunk over the seam from it — sized for the 1-2 px of
   edge shading a neighbouring tile contributes and nothing wider. A decoration
   reaching `DECO_MARGIN` tiles means a chunk's pixels also depend on tiles up to
   that far outside it, and `view` may not extend `touch` (it may not write to
   `model` at all, which is what the epoch assertion proves). So the dependency
   is expressed on the READ side instead: sum the versions of this chunk and all
   eight neighbours. Versions only ever increase, so a sum is strictly increasing
   and two different neighbourhoods can never collide on one number.

   The cost is stated at `REPAINT_BUDGET` above: one tile write now invalidates
   up to nine chunks rather than one. That is the price of a decoration wider
   than a tile, and the alternative — leaving it — is the silent permanent
   pixel loss docs/AUDIT-2.md section 5 measured. The margin SCAN itself is
   nearly free by comparison: forcing `DECO_MARGIN` to 0 takes a cold bake of
   the visible viewport from 35.3 ms to 33.1 ms, about 0.1 ms of the 1.5 ms a
   chunk costs. It is the extra invalidation, not the extra reading, that has to
   be paid for. */
function stackVer(b, cx, cy) {
  let v = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= b.cx || ny >= b.cy) continue;
      v += chunkVer(b, nx, ny);
    }
  return v;
}

/* The painted canvas for a chunk, repainted if the model moved on. Returns null
   headless, where `core/canvas.js#offscreen` has no document to work with. */
export function chunkCanvas(b, cx, cy) {
  const key = b.ord * 0x10000 + cy * b.cx + cx;
  const ver = stackVer(b, cx, cy);
  let e = cache.get(key);

  if (!e) {
    const px = chunkPx(b);
    const s = offscreen(px, px);
    if (!s.g) return null;
    e = { canvas: s.canvas, g: s.g, ver: -1 };
    cache.set(key, e);
  } else if (e.ver !== ver && budget <= 0) {
    stats.skipped++;
    return e.canvas;                        // stale for one frame, never blank
  }

  if (e.ver !== ver) {
    if (e.ver !== -1) { budget--; stats.repainted++; }
    paintChunk(b, cx, cy, e.g);
    e.ver = ver;
    stats.painted++;
  }
  return e.canvas;
}

/* ---------- terrain ---------- */

function paintChunk(b, cx, cy, g) {
  const t = b.tile, k = b.chunk, px = chunkPx(b);
  const t0x = cx * k, t0y = cy * k;
  g.clearRect(0, 0, px, px);

  /* Open sky stays TRANSPARENT so the scene's sky gradient shows through; air
     at or below the band's ground line is excavated rock and reads as cut. That
     one distinction is `floorTy` from `data/world.js` and nothing else — the
     previous painter needed a per-column surface array for it. */
  const floorTy = b.cfg.floorTy ?? 0;
  const dark = cavityColour(b);

  for (let j = 0; j < k; j++) {
    const ty = t0y + j, dy = j * t;
    for (let i = 0; i < k; i++) {
      const tx = t0x + i, dx = i * t;
      if (tileAt(b, tx, ty) === AIR) {
        if (ty >= floorTy) paintCavity(g, b, tx, ty, dx, dy, dark);
        continue;
      }
      paintTile(g, b, tx, ty, dx, dy, dark);
    }
  }

  /* DECORATIONS ARE A SECOND PASS OVER A WIDER RANGE, for two reasons.

     Range: a tile up to `DECO_MARGIN` outside this chunk can paint INTO it, so
     this loop visits those tiles too and lets the canvas clip what falls
     outside. Without it a canopy or a turf drape is cut off at every chunk
     seam — see `stackVer` above and docs/AUDIT-2.md section 5.

     Separate pass: a decoration drawn from inside the tile loop would be
     overpainted by whichever tiles happen to be painted after it, so the same
     tree would sit in front of the rock in its own chunk and behind it in the
     neighbour that redraws its overflow. All rock, then all decoration, gives
     one z-order that every chunk agrees on. */
  const lo = -DECO_MARGIN, hi = k + DECO_MARGIN;
  for (let j = lo; j < hi; j++)
    for (let i = lo; i < hi; i++)
      decorate(g, b, t0x + i, t0y + j, i * t, j * t, px);
}

/* A tile that has seen the sun grows something. `skyExposedAt` is a full walk to
   the top of the band's own grid, not "the tile above is air": a tunnel ceiling
   satisfies the latter but was never under the sun, and grass on a cave roof was
   exactly the bug that check exists to prevent (see `data/substances.js`'s soil
   row). Only rows that declare a decoration pay for the walk.

   The two `look` keys checked by name here are the pre-existing exception the
   generic `treatments:[...]` list does not cover — a decoration is geometry
   (which neighbours are open, whether this tile has sky) rather than a texture,
   and geometry is a `model` query `view/treatments.js` may not make itself.
   A THIRD name check does not belong here: see docs/DEVELOPER_GUIDE.md and
   CLAUDE.md D7. */
function decorate(g, b, tx, ty, dx, dy, clip) {
  const l = rowAt(b, tx, ty).look;
  if (!l.canopy && !l.grassCap) return;
  if (!skyExposedAt(b, tx, ty)) return;

  const t = b.tile;
  const cell = {
    px: dx, py: dy, tx, ty, tile: t, clip,
    openL: !solidAt(b, tx - 1, ty),
    openR: !solidAt(b, tx + 1, ty),
    solidBelow: solidAt(b, tx, ty + 1)
  };
  /* NATIVE only for a canopy: a placed log is a LADDER, and a ladder climbing
     out of a shaft into open sky satisfies every other condition a trunk top
     does. A rung sprouting a five-tile olive crown is not a tree. Felling is
     unaffected — the trunk left standing is still native, so its new top grows
     the crown on its next repaint, which is the whole point of testing geometry
     rather than testing "this is a tree". */
  if (l.canopy && formAt(b, tx, ty) === NATIVE) TREAT.canopy(g, cell, l.canopy);
  if (l.grassCap) TREAT.grassCap(g, cell, l.grassCap);
}

/* Excavated space: dark, with a floor lip and a hanging fringe, so the void
   reads as cut out of the rock rather than simply absent. */
function paintCavity(g, b, tx, ty, dx, dy, dark) {
  const t = b.tile;
  R(g, dx, dy, t, t, dark);

  /* Faint grain, or a large cavern reads as a flat hole. */
  for (let k = 0; k < 3; k++) {
    const h = hash2(tx * 31 + k, ty * 17);
    if (h < 0.45)
      R(g, dx + ((h * t) | 0), dy + ((hash2(k, ty + tx) * t) | 0), 1, 1,
        mix(dark, INK.white, 0.07));
  }

  if (solidAt(b, tx, ty + 1)) {
    const L = look(b, tx, ty + 1);
    for (let x = 0; x < t; x++) {
      const jit = ((hash2(tx * t + x, ty) * 3) | 0) - 1;
      R(g, dx + x, dy + t - 1 + jit, 1, 1, L.hi);
      if (hash2(tx * t + x, 91) < 0.28) R(g, dx + x, dy + t - 2 + jit, 1, 1, L.lo);
    }
  }
  if (solidAt(b, tx, ty - 1)) {
    const L = look(b, tx, ty - 1);
    for (let x = 0; x < t; x += 3) {
      const d = (hash2(tx * t + x, 77) * 4) | 0;
      if (d > 1) R(g, dx + x, dy, 2, d, L.lo);
    }
  }
}

/* Solid rock: base tone, hash grain, lit faces where exposed, the row's own
   treatments, and crack marks as the pick does its work.
   A PLACED FORM THAT DECLARES ITS OWN `look` TAKES NONE OF THAT -- see the
   branch below. */
function paintTile(g, b, tx, ty, dx, dy, dark) {
  const t = b.tile;
  const L = look(b, tx, ty);
  if (!L) return;

  const cell = { px: dx, py: dy, tx, ty, tile: t };

  /* A FORM MAY DRAW ITSELF, AND THEN IT IS NOT A CUBE (Phase 13b,
     docs/PLAN-phase13.md section 3.3). Terrain painting is otherwise entirely
     substance-driven and form-blind, which is why a placed ladder used to be
     pixel-identical to a native trunk minus its canopy: `rung.tile.solid` is
     false, so an open shaft gave it a lit top face, a jittered cliff face on
     BOTH sides and a bottom shade line, and it read as an edge-lit wooden cube
     floating in the void.

     So the generic cube passes are SUPPRESSED here rather than drawn under the
     sprite. All of them, including the base fill, the grain and the substance's
     own treatments -- the sprite in `view/treatments.js#ladder` is two rails
     and a rung, with the tile empty between them, and it can only read that way
     over the space the tile actually occupies. Drawn over an 8x8 block of
     timber it would be a wooden cube with faint stripes on it, which is the
     thing being fixed. Copper's `glint` speckles are suppressed for the same
     reason: they belong on a vein face, not floating in a stairwell.

     WHAT GOES BEHIND IT IS WHATEVER THE SPACE WOULD OTHERWISE HAVE BEEN, by the
     one rule `paintChunk` already uses for air -- excavated rock at or below the
     band's ground line, transparent sky above it -- so a ladder in a shaft sits
     in the dark with the floor lip and ceiling fringe of its neighbours intact,
     and a ladder climbing into open sky does not carry a black square with it.

     Keyed on the PRESENCE of a form-level `look` block and nothing else. Not a
     name check: `decorate` above already carries the only two the project
     allows, and CLAUDE.md D7 forbids a third. A future form draws itself by
     adding a `look` to its own row, with no edit here. */
  const fl = formRowOf(tileAt(b, tx, ty))?.look;
  if (fl) {
    if (ty >= (b.cfg.floorTy ?? 0)) paintCavity(g, b, tx, ty, dx, dy, dark);
    treat(g, fl, cell);
    cracked(g, b, tx, ty, dx, dy, t);
    return;
  }

  R(g, dx, dy, t, t, L.base);
  grain(g, dx, dy, tx, ty, t, L);

  /* Exposed faces catch light; buried faces do not. This is most of what makes
     a dug corridor legible -- any open neighbour qualifies, a cave ceiling
     included, which is correct for lighting and wrong for grass (which is why
     turf is gated on `skyExposedAt` in `decorate`, not on this).

     A TOP face is lit because `LIGHT` comes from above. Nothing here picks a
     direction of its own; the one declaration in `core/pixels.js` is why the
     top face, the two side faces below and the canopy all agree on where the
     sun is. */
  if (!solidAt(b, tx, ty - 1)) {
    if (LIGHT.fromY < 0)
      for (let x = 0; x < t; x++) {
        const jit = ((hash2(tx * t + x, ty * 7) * 3) | 0) - 1;
        R(g, dx + x, dy + Math.max(0, jit), 1, 2, L.hi);
      }
  } else if (subAt(b, tx, ty - 1) !== subAt(b, tx, ty)) {
    /* A STRATA CONTACT, not a ruled line. Where the substance above this one
       differs, the boundary between them gets a 1 px line in the lower
       material's own contact tone, wobbling within the top three pixels on the
       tile's own hash -- so a seam reads as geology rather than as the edge of
       a fill rectangle. Phase 7's `kind:'contact'` interdigitates the TILES;
       this draws the line those tiles imply, and it costs one `subAt` on the
       tile above, only for tiles that are actually buried. */
    for (let x = 0; x < t; x++)
      R(g, dx + x, dy + ((hash2(tx * t + x, ty * 23 + 3) * 3) | 0), 1, 1, L.contact);
  }

  /* AN EXPOSED VERTICAL FACE IS A CLIFF FACE, not a 1 px edge. A hillside is
     otherwise a stack of cut cubes: a one-pixel tint down the side of each tile
     says "these are blocks", where a face two or three pixels deep with a
     hash-jittered width down its length says "this is a bank of rock that broke
     here". Same jitter idiom as the top face, and the wider face is what makes
     Phase 7's relief read as landform rather than as staircase. */
  if (!solidAt(b, tx - 1, ty))
    cliffFace(g, dx, dy, tx, ty, t, LIGHT.fromX < 0 ? L.faceSun : L.faceShade, false);
  if (!solidAt(b, tx + 1, ty))
    cliffFace(g, dx, dy, tx, ty, t, LIGHT.fromX < 0 ? L.faceShade : L.faceSun, true);
  if (!solidAt(b, tx, ty + 1)) R(g, dx, dy + t - 1, t, 1, L.lo);

  /* Appearance is data: docs/DEVELOPER_GUIDE.md#colour-and-appearance */
  treat(g, L.row.look, cell);

  cracked(g, b, tx, ty, dx, dy, t);
}

/* A CRACK MEANS "THIS SWING", NOT "THIS VEIN" (Phase 14c, D14-G). It read
   `progressAt` while every tile broke on its first unit, which was the same
   number; since Phase 14b a deposit tile takes `charge` swings, and a crack
   pattern that crept on across all four of them would say nothing about the
   hit actually landing. `unitProgressAt` resets per unit, so each swing
   cracks the rock from scratch and the moment a unit falls out is visible in
   the cracks vanishing. HOW SPENT THE WHOLE VEIN IS is the other question,
   and it is deliberately NOT drawn here: it is a live condition and this is
   a chunk bake (see this file's header and `view/scene.js#drawDepletion`).

   ITS OWN FUNCTION SINCE PHASE 13b, because a form that draws its own sprite
   skips every OTHER pass in `paintTile` and must not skip this one: a ladder
   being mined back out is exactly as much "this swing landed" as a rock face
   is, and it is the one cue that says the pick is working at all. */
function cracked(g, b, tx, ty, dx, dy, t) {
  const d = unitProgressAt(b, tx, ty, effHardAt(b, tx, ty), effChargeAt(b, tx, ty));
  if (d > 0.05) cracks(g, dx, dy, tx, ty, d, t);
}

/* THE TWO NUMBERS `rules/mining.js` MINES A TILE BY, RESOLVED ONCE FOR `view`.
   Both are the substance's base value times its own scoped modifier, exactly
   as the rule reads them (`rules/mining.js:163` and `:176`) -- so a trinket
   that softens a material also makes it visibly crack sooner, and a boon that
   enriches a vein also makes it take visibly longer to look spent.

   Exported because TWO view passes need them and must never disagree: the
   crack above (a chunk bake, this file) and the depletion cue
   (`view/scene.js#drawDepletion`, a live overlay). One formula in one place is
   what keeps "how cracked" and "how spent" two readings of the same tile
   rather than two guesses about it. `view/scene.js` already imports this
   module, and a same-layer import is legal (ARCHITECTURE section 1). */
export function effHardAt(b, tx, ty) {
  const sub = subAt(b, tx, ty);
  return baseHardAt(b, tx, ty) * (sub < 0 ? 1 : eff('hard', SUB[sub].id));
}

export function effChargeAt(b, tx, ty) {
  const sub = subAt(b, tx, ty);
  if (sub < 0) return 1;
  return Math.max(1, Math.round(baseChargeAt(b, tx, ty) * eff('richness', SUB[sub].id)));
}

/* The deepest a cliff face cuts into a tile, in pixels. Three of eight: enough
   that the face reads as a face at this viewport, not enough to swallow the
   tile's own colour. */
const FACE_MAX = 3;

function cliffFace(g, dx, dy, tx, ty, t, col, right) {
  for (let y = 0; y < t; y++) {
    const w = 1 + ((hash2(tx * 31 + y, ty * 17 + (right ? 7 : 3)) * FACE_MAX) | 0);
    R(g, right ? dx + t - w : dx, dy + y, w, 1, col);
  }
}

/* ---------- grain ----------
   HOW ROUGH A MATERIAL LOOKS IS THE ROW'S OWN BUSINESS. This used to be a fixed
   pair of thresholds on a per-pixel `hash2` — 16% of pixels toward the dark
   tone, 10% toward the light — identical for soil and for adamant, which is a
   large part of why every stratum read as the same texture in a different
   colour. `look.speckle` is now the FRACTION of a tile's pixels that get a
   grain dot at all: soil is noisy, adamant is nearly smooth.

   Drawn with `core/pixels.js#noiseFill`, which was ported from the mockup with
   the rest of `core/` and then called by nothing at all for the whole life of
   the layered rewrite (docs/AUDIT-2.md section 4 grepped it: zero call sites).
   Its seed is positional, never `rand()` — a repaint may not advance anything
   (ARCHITECTURE invariant 7) and, just as importantly, the same tile has to
   speckle identically when a neighbouring chunk redraws it.

   TWO passes rather than one array of two colours, because the ratio matters:
   dark grain reads as pitting and light grain as a facet catching the light,
   and an even mix of the two looks like static. 62/38 is the ratio the old
   16/10 thresholds had. */
const SPECKLE = 0.26;                      // default, and exactly the old density
const GRAIN_LO = 0.62, GRAIN_HI = 0.38;

function grain(g, dx, dy, tx, ty, t, L) {
  const blk = L.grainBlk;
  noiseFill(g, dx, dy, t, t, L.grainLo, L.speckle * GRAIN_LO, seedAt(tx, ty, 0x51ed), blk);
  noiseFill(g, dx, dy, t, t, L.grainHi, L.speckle * GRAIN_HI, seedAt(tx, ty, 0x2f9d), blk);
}

/* Cracks come from the tile's own hash, so they grow in place rather than
   flickering between frames. */
function cracks(g, dx, dy, tx, ty, d, tile) {
  const n = 1 + ((d * 5) | 0);
  for (let k = 0; k < n; k++) {
    let x = 1 + ((hash2(tx * 3 + k, ty * 11) * (tile - 2)) | 0);
    let y = 1 + ((hash2(ty * 3 + k, tx * 11) * (tile - 2)) | 0);
    for (let s = 0; s < 1 + ((d * 4) | 0); s++) {
      R(g, dx + x, dy + y, 1, 1, INK.crack);
      x += hash2(x + k, y + s) < 0.5 ? 1 : -1;
      y += hash2(y + s, x + k) < 0.62 ? 1 : 0;
      if (x < 0 || x >= tile || y < 0 || y >= tile) break;
    }
  }
}

/* ---------- resolved ink ----------
   Every literal colour in this file resolves through `data/palette.js` at module
   load, so there is no inline hex at a call site and a typo fails at import.
   These are RENDER decisions with no content meaning — a crack is not a
   substance — which is why they are here and not on a row. */
const INK = {
  crack:  mix(colour('woodD'), '#000000', 0.55),
  mouth:  colour('abyC'),
  pipOff: mix(colour('uiBack'), colour('uiDim'), 0.25),
  fireHi: colour('lavaA'),
  fireLo: colour('lavaB'),
  spark:  mix(colour('ichor'), colour('cloudA'), 0.6),
  white:  colour('cloudA'),
  /* What every tone is pushed toward with depth -- the abyss, so deep rock
     cools rather than merely dimming. */
  deep:   colour('abyC'),
  ui:     colour('ui'),
  /* The stalled-machine warning badge. `uiHeart` is the same red the HUD's
     own hearts/refusal text already uses -- reused, not invented, so "this
     is a warning" reads the same colour everywhere in the game. */
  warn:   colour('uiHeart')
};

/* ---------- the look cache ----------
   Resolving five colour names per tile per repaint is the one place a name
   lookup would show up, so each substance's palette is resolved ONCE. `colour()`
   throws on a name that is not in `data/palette.js`, which is what makes a
   typo'd colour an import-time failure rather than a black tile.

   ONCE PER SUBSTANCE PER DEPTH STEP, now. The same granite has to read deeper
   at row 260 than at row 180 or the deep bands are the shallow ones in a
   different palette; a single shared curve pushes every tone toward the abyss
   colour with depth. The curve is QUANTISED into `DEPTH_STEPS` bands for two
   reasons: the palette is meant to be a palette rather than a per-row gradient,
   and a cache keyed on a continuous depth would hold one entry per tile row.
   Twelve steps over the whole world is about one shade per 280 px, which at
   this tile size is a shift you notice over a shaft and not over a tile.

   Depth is measured in ABSOLUTE WORLD PIXELS against the world's own total
   extent, read from the band records rather than hardcoded: bands are
   allocated at boot with their own origins, and a view constant naming a world
   dimension is exactly what ARCHITECTURE section 6 exists to prevent. */
const DEPTH_STEPS = 12;
const DEPTH_K = 0.34;                   // darkest the curve ever gets

const looks = new Map();
let worldBottom = 0;

function bottom() {
  if (!worldBottom)
    for (const b of bands) worldBottom = Math.max(worldBottom, b.origin.y + heightPx(b));
  return worldBottom || 1;
}

function look(b, tx, ty) {
  const row = rowAt(b, tx, ty);
  const l = row.look;
  if (!l?.base) return null;

  const wy = b.origin.y + ty * b.tile;
  const step = Math.max(0, Math.min(DEPTH_STEPS - 1, (wy / bottom() * DEPTH_STEPS) | 0));
  const key = row.id + ':' + step;

  let e = looks.get(key);
  if (!e) {
    const f = step / (DEPTH_STEPS - 1) * DEPTH_K;
    const deep = INK.deep;
    const base = blend(colour(l.base), deep, f);
    const hi   = blend(colour(l.hi ?? l.base), deep, f);
    const lo   = blend(colour(l.lo ?? l.base), deep, f);
    const face = blend(colour(l.face ?? l.base), deep, f);
    e = { row, base, hi, lo,
          faceSun: mix(face, hi, 0.5), faceShade: mix(face, lo, 0.55),
          contact: blend(colour(l.contact ?? l.lo ?? l.base), deep, 0.35 + f * 0.4),
          speckle: l.speckle ?? SPECKLE, grainBlk: l.grainBlk ?? 1,
          grainLo: [lo], grainHi: [hi] };
    looks.set(key, e);
  }
  return e;
}

/* Cavity darkness from the band's own `look`: its tint pushed towards black by
   how little ambient light the row claims. The previous painter had three
   hardcoded depth thresholds; a band row now says it for itself. */
function cavityColour(b) {
  const l = b.cfg.look || {};
  return mix(colour(l.tint ?? 'abyC'), '#000000', 0.62 + (1 - (l.ambient ?? 1)) * 0.25);
}

/* ---------- live passes ---------- */

/* A dropped unit: two colours off the substance's `look.item`, sized by the
   form — or, if the row names one, a dedicated `SPRITE`. Either way `px`/`py`
   are screen pixels at the item's CENTRE, and `treat()` still runs after: a
   sprite item can carry a `halo` treatment exactly like a generic square can
   (see the relic glow below), because the two are additions to the same
   `look`, not alternatives to each other. */
export function paintItem(g, it, px, py, t) {
  const l = SUB[it.sub].look;
  if (!l?.item) return;
  const sprite = l.sprite && SPRITE[l.sprite];
  const s = sprite ? sprite.size : sizeOf(it), h = s >> 1;
  if (sprite) {
    sprite.draw(g, px, py, t);
  } else {
    const a = colour(l.item[0]), bcol = colour(l.item[1] ?? l.item[0]);
    R(g, px - h, py - h, s, s, a);
    R(g, px - h, py + h - 1, s, 1, bcol);
    R(g, px - h, py - h, 1, 1, mix(a, INK.white, 0.5));
  }
  treat(g, l, { px: px - h, py: py - h, tx: px | 0, ty: py | 0, tile: s, t });
  /* A shine that tracks the clock and the item's own position — never `rand()`,
     or two draws of the same frame would differ. */
  if (!sprite && l.item.length > 1 && ((t * 4 + px * 0.3) % 6) > 5.2)
    R(g, px + h - 1, py - h, 1, 1, INK.spark);
}

/* A machine, from its own `look`. No machine name, no per-machine draw
   function — see docs/DEVELOPER_GUIDE.md#colour-and-appearance */
export function paintMachine(g, m, px, py, t) {
  const def = MACH[m.def];
  const l = def.look;
  const w = m.box.w, h = m.box.h;

  /* THE CABLE PASS RUNS FIRST, BEFORE THE MACHINE IT IS ANCHORED TO, so a
     span and its bucket chain pass BEHIND the drum they run over instead of
     being drawn across the front of it. The carrier is the other way round
     (`paintCarriers` at the foot of this function) because a bucket parked at
     a hub has to be visible in it, not swallowed by it. */
  if (l.cable) paintCables(g, m, px, py, l);

  /* A ROW WITH `parts` DRAWS ITSELF OUT OF NAMED SHAPES; a row without one
     gets the generic catch box below, unchanged. This is one look key and a
     generic dispatch, NOT a third name check beside `canopy`/`grassCap`: the
     four segment-transport rows are the first machines in the game that are
     not boxes
     with mouths, and "hopper lips, so it reads as a catch box" is a lie on a
     gear. See docs/DEVELOPER_GUIDE.md#colour-and-appearance and CLAUDE.md D7. */
  if (l.parts) {
    const cell = { px, py, w, h, tx: m.tx, ty: m.ty,
                   tile: m.band?.tile ?? 8, turn: m.turn, t };
    for (const p of l.parts) {
      const fn = TREAT[p.fn];
      if (fn) fn(g, cell, p);
    }
  } else {
    R(g, px, py, w, h, colour(l.body));
    R(g, px, py, w, 2, colour(l.trim));
    R(g, px + 1, py + 1, w - 2, 2, INK.mouth);              // the mouth
    R(g, px, py + h - 2, w, 2, colour(l.base));
    R(g, px - 2, py - 1, 2, 3, colour(l.trim));           // hopper lips, so it
    R(g, px + w, py - 1, 2, 3, colour(l.trim));           // reads as a catch box
  }

  if (l.fire) {
    const fire = Math.max(m.fire, m.running ? 0.5 : 0);
    if (fire > 0.02) {
      const f = 3 + (((Math.sin(t * 9) + 1) * 1.5 * fire) | 0);
      /* Flicker from position plus time, never from the RNG: a screenshot must
         not depend on how many times the frame was drawn. */
      const flick = hash2(m.tx * 31 + ((t * 18) | 0), m.ty * 17);
      R(g, px + 2, py + h - 2 - f, w - 4, f, flick < 0.5 ? INK.fireLo : INK.fireHi);
    }
  }

  /* Buffer readout as pips, so a machine's state is legible in-world. `look.pips`
     names a selector and a row; `fill()` is a model query. */
  for (const p of l.pips || []) {
    const f = fill(m, p.sel);
    const bar = Math.round(f * (w - 4));
    R(g, px + 2, py + 4 + p.row * 3, w - 4, 2, INK.pipOff);
    if (bar > 0) R(g, px + 2, py + 4 + p.row * 3, bar, 2, f > 0.55 ? INK.fireHi : INK.ui);
  }

  /* The stalled-machine warning (`model/machines.js#statusOf`). A "silent
     stall" (`rules/machines.js`'s own phrase) otherwise has no visible sign
     at all beyond the fire glow simply never lighting -- easy to miss next
     to a machine that has never once run. Keyed off the STATUS VALUE only,
     never a name: a plain glyph in the badge colour, top-right corner,
     the same "one rect, one glyph" placeholder convention
     `view/ui/mainPanel.js#glyphOf` already uses for an unresolved identity. */
  if (statusOf(m) === 'no-fuel') drawText(g, '!', px + w - 6, py + 1, INK.warn, 1, 1);

  /* LAST, over the hub's own body: see `paintCables` above. */
  if (l.carrier) paintCarriers(g, m, px, py, l);
}

/* ---------- segments: the cable, its bucket chain, and the carrier ----------
   WHY THIS IS DRAWN FROM `paintMachine` AND NOT FROM A PASS OF ITS OWN.
   A segment has no footprint and is not a machine (`model/segments.js`'s own
   header), so it has no natural place in `view/scene.js`'s pass order -- but
   it does have exactly two anchors, both of which ARE machines that already
   get a draw call at a known screen position. Hanging the cable off the hub
   that anchors it therefore costs no new pass, no new import in `scene.js`,
   and -- the part that actually matters -- puts the cable INSIDE the machine
   pass, which runs before `drawDarkness` and `drawFog`. A cable in an unlit
   shaft is dark and a cable behind fog is hidden, for free, with nothing
   said about either. Drawn from the HUD instead it would glow through both.

   EXACTLY ONE HUB DRAWS EACH PART OF A SEGMENT, so a span is not painted twice
   with the far hub's own colours on the second pass -- but WHICH hub differs
   between the cable and the carrier, and that is a z-order fact rather than a
   preference. `view/scene.js` paints machines in `machines` order, so anything
   drawn during the EARLIER hub's call is overpainted by the LATER hub's body:

     the CABLE and its chain must pass BEHIND both drums  -> the earlier hub
     the CARRIER must sit IN FRONT of both                -> the later hub

   The second half was found by looking at the matrix, not by reasoning: at
   `t = 1` the carrier sits exactly on the upper hub's own anchor, and drawn
   from `seg.a` (which was the lower hub) it vanished completely behind the
   upper one. `winch-vertical-top.png` is the baseline that caught it.

   `machines.indexOf` over a list that is tens long, twice per segment per
   frame. Placement order is deterministic (invariant 7), so which end draws
   what is reproducible from the seed and the build order.

   WORLD PX TO SCREEN PX WITHOUT THE CAMERA: `paintMachine` is handed `px`/`py`
   for a machine whose world position it also holds, so the camera offset is
   `px - m.box.x`. `view` never needs to be told where the camera is to draw
   something anchored to something it is already drawing. */
function screenOffset(m, px, py) {
  return { ox: px - m.box.x, oy: py - m.box.y };
}

const aFirst = seg => machines.indexOf(seg.a) <= machines.indexOf(seg.b);
const firstHub = seg => (aFirst(seg) ? seg.a : seg.b);
const lastHub  = seg => (aFirst(seg) ? seg.b : seg.a);

/* THE LOW END OF A SPAN, which is where `t = 0` is and therefore where the
   bucket chain's phase is measured from. `seg.hi` is 'a' when A is the UPPER
   anchor, so the low end is the other one -- read off the model's own field
   rather than re-derived from y, or a horizontal span (where the model breaks
   the tie by argument order) would disagree with it. */
function ends(seg) {
  const up = seg.hi === 'a';
  return { lox: up ? seg.bx : seg.ax, loy: up ? seg.by : seg.ay,
           hix: up ? seg.ax : seg.bx, hiy: up ? seg.ay : seg.by };
}

/* HOW A LINE AT AN ARBITRARY ANGLE STAYS INTEGRAL, which is a question this
   project has not had to answer before.

   Both strands are the SAME Bresenham run (`core/pixels.js#lineTo`, which
   floors its own four coordinates) translated by exactly ONE WHOLE PIXEL
   along the axis the line varies LEAST in: vertical-ish spans separate
   horizontally, horizontal-ish spans separate vertically. That is not an
   approximation of a perpendicular offset, it is the only offset that keeps
   the two strands stair-step for stair-step parallel -- a true perpendicular
   would be fractional at every angle except 0, 45 and 90 degrees, and
   rounding it per pixel is exactly how a two-tone cable develops a moire
   along its length. The cost is that a 45-degree span's strands sit 1.41 px
   apart rather than 1, which reads as slightly fatter and is invisible.
   The `1.5 px` of a real perpendicular is not available at this scale, and
   pretending otherwise is what the integer-pixels rule forbids. */
function strandNormal(dx, dy) {
  return Math.abs(dx) >= Math.abs(dy) ? { nx: 0, ny: 1 } : { nx: 1, ny: 0 };
}

function paintCables(g, m, px, py, l) {
  const { ox, oy } = screenOffset(m, px, py);
  const p = l.cable;
  const hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);
  const bucketA = colour(p.col ?? p.body);            // the lit rim
  const bucketB = colour(p.low ?? p.col ?? p.body);   // the stave body
  const bucketC = colour(p.dark ?? p.lo ?? p.body);   // the shaded foot and link

  for (const seg of segmentsAt(m)) {
    if (firstHub(seg) !== m) continue;

    const x0 = (seg.ax + ox) | 0, y0 = (seg.ay + oy) | 0;
    const x1 = (seg.bx + ox) | 0, y1 = (seg.by + oy) | 0;
    const { nx, ny } = strandNormal(x1 - x0, y1 - y0);

    /* TWO TONES SO IT READS AS A LOOP, not a wire: the lit strand is the one
       coming up out of the shaft and the shaded one is going back down, which
       is the whole reason the reference image's chain reads as a mechanism
       rather than as a rope.

       ADJACENT, NOT SPACED. The first attempt separated them by two pixels
       with the background showing between, and in an unlit shaft the shaded
       strand vanished into the rock and the lit one read as a taut white
       thread. Side by side they are one two-pixel cable with a lit edge and a
       shaded edge, which is what a rope or a chain actually looks like. */
    lineTo(g, x0, y0, x1, y1, hi);
    lineTo(g, x0 + nx, y0 + ny, x1 + nx, y1 + ny, lo);

    /* THE BUCKET CHAIN. Evenly spaced along the span and PHASE-LOCKED to the
       carrier: the chain has travelled exactly as far as the carrier has, so
       the offset of the whole ladder of buckets is `t * len` reduced modulo
       the spacing. One mechanism, one number, and it is a model number -- no
       frame counter and no `rand()` (invariant 7). */
    const { lox, loy, hix, hiy } = ends(seg);
    const gap = Math.max(4, p.spacing ?? 11);
    const phase = ((seg.t * seg.len) % gap + gap) % gap;
    for (let d = phase; d <= seg.len; d += gap) {
      const f = seg.len > 0 ? d / seg.len : 0;
      const bx = (lerpPx(lox, hix, f) + ox) | 0;
      const by = (lerpPx(loy, hiy, f) + oy) | 0;
      /* A BUCKET HANGS OFF THE SHADED STRAND on a one-pixel link, clear of
         the cable so the two strands stay readable through the chain.

         IT IS TAPERED, and that is the difference between a bucket chain and
         a ladder. Two earlier attempts (3x2, then a flat 4x3 with a lit top
         row) both read as RUNGS: evenly spaced rectangles beside a vertical
         line is a ladder, whatever colour it is. A lit rim over a body that
         is a pixel narrower at the foot reads as a vessel with a mouth, which
         is what the reference image's chain is made of. */
      /* TALLER THAN IT IS WIDE, with a dark mouth under a lit rim. That is
         the third shape tried here and the first that is not a rung: 3x2 and
         then 5x4-with-a-bright-top-row both read as ladder rungs, because a
         horizontal bar beside a vertical line IS a rung no matter what colour
         it is. A vessel is 4 wide, 5 tall, open at the top, and hangs off a
         one-pixel link -- the link being one pixel matters too, since a 3 px
         link is itself a little horizontal bar. */
      const lx = bx + nx * 3, ly = by + ny * 3;
      R(g, bx + nx, by + ny, 1, 1, bucketC);                     // the link
      R(g, bx + nx * 2, by + ny * 2, 1, 1, bucketC);
      R(g, lx - 1, ly, 4, 1, bucketA);                           // the lit rim
      R(g, lx - 1, ly + 1, 4, 1, bucketC);                       // the mouth, in shadow
      R(g, lx - 1, ly + 2, 4, 2, bucketB);                       // the staves
      R(g, lx, ly + 4, 2, 1, bucketC);                           // tapered foot
    }
  }
}

const lerpPx = (a, b, f) => a + (b - a) * f;

/* THE CARRIER. It has to read as STANDABLE, because in Phase 8f the player
   stands on it: so a bright lit deck plank a pixel wider than the body, a
   dark body under it, and two hangers up to the cable. The deck line is the
   thing the eye reads as a surface, and it is the top of
   `model/segments.js#carrierBox` -- the same rectangle the ride branch will
   test against, so what looks standable and what IS standable are the same
   pixels rather than two guesses.

   LOAD IS HOW FULL THE BUCKET LOOKS, never a number (this phase's brief): the
   body fills from the bottom up with the cargo tone, over `look.carrier.full`
   talents. `full` is APPEARANCE, not a tunable -- it says "this many talents
   is a brimming bucket", which is a drawing decision, and a god's trinket has
   no business changing how full a bucket looks. */
function paintCarriers(g, m, px, py, l) {
  const { ox, oy } = screenOffset(m, px, py);
  const p = l.carrier;
  const body = colour(p.body), hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);
  const cargo = colour(p.col ?? p.body), rope = colour(p.trim ?? p.hi ?? p.body);

  for (const seg of segmentsAt(m)) {
    if (lastHub(seg) !== m) continue;
    const c = carrierPos(seg);
    const x = (c.x + ox - CARRIER_W / 2) | 0;
    const y = (c.y + oy - CARRIER_H / 2) | 0;

    /* THE DECK IS THE TOP OF `carrierBox` AND THE BUCKET HANGS BELOW IT.
       `CARRIER_W`/`CARRIER_H` are the model's collision-free stand box (10x4)
       and are not a drawing budget: a 10x4 plank was the first attempt and it
       read as a splinter, with no room for cargo to be visible in. So the
       deck line is drawn exactly on the box's top edge -- the pixels the ride
       branch will actually stand the player on -- and the bucket's body hangs
       DOWN from it, which costs the collision model nothing and gives the
       cargo somewhere to be. */
    const depth = Math.max(CARRIER_H, p.depth ?? 7);

    R(g, x + 1, y - 4, 1, 4, rope);                       // the two hangers
    R(g, x + CARRIER_W - 2, y - 4, 1, 4, rope);
    R(g, x + 1, y - 4, CARRIER_W - 2, 1, rope);           // and the yoke across them

    R(g, x, y + 1, CARRIER_W, depth - 1, body);           // the bucket body
    R(g, x, y + 1, 1, depth - 1, hi);                     // sun-side stave
    R(g, x + CARRIER_W - 1, y + 1, 1, depth - 1, lo);
    R(g, x, y + depth - 1, CARRIER_W, 1, lo);             // and its floor

    /* HOW FULL THE BUCKET LOOKS, filling from the floor up. Inset a pixel on
       each side so the staves still read as staves with a brimming load. */
    const full = Math.max(1, p.full ?? 40);
    const frac = Math.max(0, Math.min(1, seg.load / full));
    const fillH = Math.round(frac * (depth - 3));
    if (fillH > 0) R(g, x + 1, y + depth - 2 - fillH, CARRIER_W - 2, fillH, cargo);

    R(g, x - 1, y, CARRIER_W + 2, 1, hi);                 // the deck, drawn last
    R(g, x - 1, y, 1, 2, lo);                             // deck ends, so the
    R(g, x + CARRIER_W, y, 1, 2, lo);                     //   plank has a thickness
  }
}

