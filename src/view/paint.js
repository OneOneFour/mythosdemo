/* LAYER view — PAINTING. Per-chunk terrain into cached offscreen canvases, plus
   the live item and machine passes. Imports `core`, `data` and READ-ONLY `model`
   queries. Imports no `write` namespace and no `rules` module.

   ============================================================================
   NO SUBSTANCE NAME AND NO MACHINE NAME APPEARS ANYWHERE IN THIS LAYER.
   Everything drawn below comes from a `look` block: `base`/`hi`/`lo` for rock,
   `item` for a dropped unit, `body`/`trim`/`base`/`fire`/`pips` for a machine,
   and `treatments` for anything a colour triple cannot say. The previous
   renderer named `copper` and could only do it because it imported the gameplay
   table; the sibling rule now makes that import illegal, and `look` makes it
   unnecessary.
   ============================================================================

   A DIG REPAINTS ITS CHUNK, NOT THE WORLD (invariant 3). The mockup baked one
   1024x2520 strip; this paints 128x128 px, about 1/1500th of a full bake.

   INVALIDATION IS A VERSION COUNTER, NOT A DIRTY FLAG, and that is forced by
   the epoch assertion: `view` may not write to `model`, so it cannot clear a
   flag. `model/world.js` bumps `b.ver[chunk]` on every tile write and this file
   remembers the version it last painted. It is a better scheme than the flag it
   replaced — two viewports could not share one flag. */

import { offscreen } from '../core/canvas.js';
import { mix } from '../core/palette.js';
import { R } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { AIR } from '../data/forms.js';
import { MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { SUB } from '../data/substances.js';
import { fill } from '../model/machines.js';
import { progressAt } from '../model/mining.js';
import { sizeOf } from '../model/items.js';
import { eff } from '../model/mods.js';
import { baseHardAt, rowAt, skyExposedAt, solidAt, subAt, tileAt } from '../model/tiles.js';
import { chunkPx, chunkVer } from '../model/world.js';
import { TREAT, treat } from './treatments.js';

/* Repaints per frame. A first paint is never budgeted — a chunk with no canvas
   has nothing stale to show — but a re-paint is, so walking a long tunnel while
   digging cannot stack forty bakes into one frame. */
const REPAINT_BUDGET = 8;

export const stats = { painted: 0, repainted: 0, cached: 0, skipped: 0 };

/* band ord + chunk index -> { canvas, g, ver }. */
const cache = new Map();
let budget = REPAINT_BUDGET;

/* Called by `shell/boot.js` on every new run. The canvases hold the previous
   world and a stale blit is worse than a black frame. */
export function resetChunks() {
  cache.clear();
  stats.painted = 0; stats.repainted = 0; stats.cached = 0; stats.skipped = 0;
}

/* Give each frame its own repaint budget. Called once per frame by `view/scene.js`. */
export function beginFrame() {
  budget = REPAINT_BUDGET;
  stats.cached = cache.size;
}

/* The painted canvas for a chunk, repainted if the model moved on. Returns null
   headless, where `core/canvas.js#offscreen` has no document to work with. */
export function chunkCanvas(b, cx, cy) {
  const key = b.ord * 0x10000 + cy * b.cx + cx;
  const ver = chunkVer(b, cx, cy);
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
      paintTile(g, b, tx, ty, dx, dy);
    }
  }
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
   treatments, and crack marks as the pick does its work. */
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
     a dug corridor legible -- any open neighbour qualifies, a cave ceiling
     included, which is correct for lighting and wrong for grass (below). */
  if (!solidAt(b, tx, ty - 1))
    for (let x = 0; x < t; x++) {
      const jit = ((hash2(tx * t + x, ty * 7) * 3) | 0) - 1;
      R(g, dx + x, dy + Math.max(0, jit), 1, 2, L.hi);
    }
  /* A trunk's top grows a canopy, and soil under open air grows a grass cap --
     both gated on `skyExposedAt`, a full walk to the top of the band's own
     grid, rather than "the one tile above is air": a tunnel ceiling satisfies
     the latter but was never under the sun, and grass on a cave roof was
     exactly the bug this check exists to prevent. Only walked for rows that
     could possibly care, so ordinary rock pays nothing for it. */
  if (L.row.look.canopy || L.row.look.grassCap) {
    const cell = { px: dx, py: dy, tx, ty, tile: t };
    if (skyExposedAt(b, tx, ty)) {
      if (L.row.look.canopy) TREAT.canopy(g, cell, L.row.look.canopy);
      if (L.row.look.grassCap) TREAT.grassCap(g, cell, L.row.look.grassCap);
    }
  }
  if (!solidAt(b, tx - 1, ty)) R(g, dx, dy, 1, t, L.edgeL);
  if (!solidAt(b, tx + 1, ty)) R(g, dx + t - 1, dy, 1, t, L.edgeR);
  if (!solidAt(b, tx, ty + 1)) R(g, dx, dy + t - 1, t, 1, L.lo);

  /* THE LINE THAT USED TO SAY `if (M.id === 'copper')`. */
  treat(g, L.row.look, { px: dx, py: dy, tx, ty, tile: t });

  /* Cracks use the EFFECTIVE hardness, so a trinket that softens a material
     also makes it visibly crack sooner. Same `eff` call the rule makes. */
  const sub = subAt(b, tx, ty);
  const hard = baseHardAt(b, tx, ty) * (sub < 0 ? 1 : eff('hard', SUB[sub].id));
  const d = progressAt(b, tx, ty, hard);
  if (d > 0.05) cracks(g, dx, dy, tx, ty, d, t);
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
  ui:     colour('ui')
};

/* ---------- the look cache ----------
   Resolving five colour names per tile per repaint is the one place a name
   lookup would show up, so each substance's palette is resolved ONCE. `colour()`
   throws on a name that is not in `data/palette.js`, which is what makes a
   typo'd colour an import-time failure rather than a black tile. */
const looks = new Map();

function look(b, tx, ty) {
  const row = rowAt(b, tx, ty);
  const l = row.look;
  if (!l?.base) return null;
  let e = looks.get(row.id);
  if (!e) {
    const base = colour(l.base), hi = colour(l.hi ?? l.base), lo = colour(l.lo ?? l.base);
    e = { row, base, hi, lo, edgeL: mix(base, hi, 0.45), edgeR: mix(base, lo, 0.5) };
    looks.set(row.id, e);
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
   form. `px`/`py` are screen pixels at the item's CENTRE. */
export function paintItem(g, it, px, py, t) {
  const l = SUB[it.sub].look;
  if (!l?.item) return;
  const s = sizeOf(it), h = s >> 1;
  const a = colour(l.item[0]), bcol = colour(l.item[1] ?? l.item[0]);
  R(g, px - h, py - h, s, s, a);
  R(g, px - h, py + h - 1, s, 1, bcol);
  R(g, px - h, py - h, 1, 1, mix(a, INK.white, 0.5));
  treat(g, l, { px: px - h, py: py - h, tx: px | 0, ty: py | 0, tile: s });
  /* A shine that tracks the clock and the item's own position — never `rand()`,
     or two draws of the same frame would differ. */
  if (l.item.length > 1 && ((t * 4 + px * 0.3) % 6) > 5.2)
    R(g, px + h - 1, py - h, 1, 1, INK.spark);
}

/* A machine, from its own `look`. No machine name, no per-machine draw
   function — that was rejected precisely because it makes "add a machine"
   always cost a render edit. */
export function paintMachine(g, m, px, py, t) {
  const def = MACH[m.def];
  const l = def.look;
  const w = m.box.w, h = m.box.h;

  R(g, px, py, w, h, colour(l.body));
  R(g, px, py, w, 2, colour(l.trim));
  R(g, px + 1, py + 1, w - 2, 2, INK.mouth);              // the mouth
  R(g, px, py + h - 2, w, 2, colour(l.base));
  R(g, px - 2, py - 1, 2, 3, colour(l.trim));           // hopper lips, so it
  R(g, px + w, py - 1, 2, 3, colour(l.trim));           // reads as a catch box

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

  /* The deck of a lift stage, and its cable. One drum, one deck — five stages
     would be five of these records, never one continuous cage. */
  if (m.deck) {
    const dy = py + (m.deck.y - m.box.y);
    R(g, px, dy, w, 1, colour(l.trim));
    R(g, px + 1, dy + 1, w - 2, 2, colour(l.base));
  }

  /* Buffer readout as pips, so a machine's state is legible in-world. `look.pips`
     names a selector and a row; `fill()` is a model query. */
  for (const p of l.pips || []) {
    const f = fill(m, p.sel);
    const bar = Math.round(f * (w - 4));
    R(g, px + 2, py + 4 + p.row * 3, w - 4, 2, INK.pipOff);
    if (bar > 0) R(g, px + 2, py + 4 + p.row * 3, bar, 2, f > 0.55 ? INK.fireHi : INK.ui);
  }
}

