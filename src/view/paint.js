/* view layer — painting: per-chunk terrain into cached offscreen canvases, plus
   the live item and machine passes.

   No substance name and no machine name appears anywhere in this layer.
   Everything drawn below comes from a `look` block: `base`/`hi`/`lo` for rock,
   `item` for a dropped unit, `body`/`trim`/`base`/`fire`/`pips` for a machine,
   and `treatments` for anything a colour triple cannot say.

   A dig repaints its chunk, not the world. Invalidation is a version counter
   rather than a dirty flag, because `view` may not write to `model` and so
   cannot clear a flag. */

import { offscreen } from '../core/canvas.js';
import { drawText } from '../core/font.js';
import { blend, mix } from '../core/palette.js';
import { LIGHT, R, lineTo, noiseFill } from '../core/pixels.js';
import { hash2 } from '../core/rng.js';
import { AIR, FORM, NATIVE } from '../data/forms.js';
import { MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { SUB } from '../data/substances.js';
import { fill, machines, statusOf } from '../model/machines.js';
import { unitProgressAt } from '../model/mining.js';
import { sizeOf } from '../model/items.js';
import { eff } from '../model/mods.js';
import { CARRIER_H, CARRIER_W, carrierPos, segmentsAt, strandOffset } from '../model/segments.js';
import { baseChargeAt, baseHardAt, formAt, formRowOf, rowAt, skyExposedAt, solidAt, subAt, tileAt } from '../model/tiles.js';
import { bands, chunkPx, chunkVer, heightPx } from '../model/world.js';
import { EXTENT, TREAT, seedAt, treat } from './treatments.js';
import { SPRITE } from './sprites.js';

/* Repaints per frame. A first paint is never budgeted, since a chunk with no
   canvas has nothing stale to show. 8 x 1.53 ms is 12.2 ms of a 16.7 ms frame,
   and a skipped chunk shows its own previous canvas rather than a blank one. */
const REPAINT_BUDGET = 8;

/* How wide a neighbourhood a chunk's appearance depends on, in tiles, taken
   from the decorations' own declared reach (`view/treatments.js#EXTENT`) so the
   two can never drift. */
const DECO_MARGIN = Math.max(...Object.values(EXTENT));

/* How much canvas the chunk cache may hold, in bytes of backing store rather
   than a chunk count, since two bands need not agree on a chunk's pixel size.
   On an object because the visual suite lowers it to force the ceiling. */
export const cacheLimit = { bytes: 24 * 1024 * 1024 };

/* `bytes` is resident backing store, `evicted` this frame's drops and
   `evictedTotal` the run's. */
export const stats = { painted: 0, repainted: 0, cached: 0, skipped: 0,
                       bytes: 0, evicted: 0, evictedTotal: 0 };

/* chunk key -> { canvas, g, ver, bytes, frame }. Iteration order is the LRU
   order: a `Map` iterates by insertion and `chunkCanvas` re-inserts on the first
   touch of a new frame, so the front is the least recently drawn chunk. */
const cache = new Map();
let budget = REPAINT_BUDGET;
let frames = 0;
let resident = 0;

/* Band ordinal plus chunk index, multiplied by the band count rather than a
   fixed slot size, so keys cannot collide at any world width. `bands.length` is
   fixed for a run, and `resetChunks` clears the cache when it changes. */
const chunkKey = (b, cx, cy) => (cy * b.cx + cx) * bands.length + b.ord;

/* Called by `shell/boot.js` on every new run: the canvases hold the previous
   world, and a stale blit is worse than a black frame. */
export function resetChunks() {
  cache.clear();
  looks.clear();
  worldBottom = 0;
  resident = 0;
  stats.painted = 0; stats.repainted = 0; stats.cached = 0; stats.skipped = 0;
  stats.bytes = 0; stats.evicted = 0; stats.evictedTotal = 0;
}

/* Give each frame its own repaint budget, and drop what the last two frames
   did not draw. Called once per frame by `view/scene.js`. */
export function beginFrame() {
  budget = REPAINT_BUDGET;
  frames++;
  evict();
  stats.cached = cache.size;
  stats.bytes = resident;
}

/* Eviction is LRU by frame touched: `view/scene.js#drawChunks` asks for exactly
   the chunks the viewport covers, so "touched last frame" is "on screen".
   Running from `beginFrame` means nothing drawn last frame is ever evicted. */
function evict() {
  stats.evicted = 0;
  if (resident <= cacheLimit.bytes) return;
  for (const [key, e] of cache) {
    if (resident <= cacheLimit.bytes) break;
    if (e.frame >= frames - 1) continue;
    cache.delete(key);
    resident -= e.bytes;
    stats.evicted++;
  }
  stats.evictedTotal += stats.evicted;
}

/* Not this chunk's version alone: a decoration reaching `DECO_MARGIN` tiles makes
   a chunk's pixels depend on tiles that far outside it, so this sums this chunk's
   version and all eight neighbours'. Versions only increase, so the sum does. */
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
  const key = chunkKey(b, cx, cy);
  const ver = stackVer(b, cx, cy);
  let e = cache.get(key);

  if (!e) {
    const px = chunkPx(b);
    const s = offscreen(px, px);
    if (!s.g) return null;
    e = { canvas: s.canvas, g: s.g, ver: -1, bytes: px * px * 4, frame: frames };
    cache.set(key, e);
    resident += e.bytes;
  } else {
    /* Re-inserted at the MRU end, and only on the first touch of a frame: a
       chunk asked for twice in one frame must not churn the map's order. */
    if (e.frame !== frames) {
      e.frame = frames;
      cache.delete(key); cache.set(key, e);
    }
    if (e.ver !== ver && budget <= 0) {
      stats.skipped++;
      return e.canvas;                      // stale for one frame, never blank
    }
  }

  if (e.ver !== ver) {
    if (e.ver !== -1) { budget--; stats.repainted++; }
    paintChunk(b, cx, cy, e.g);
    e.ver = ver;
    stats.painted++;
  }
  return e.canvas;
}


/* The deepest row a band's sky reaches, in band-local tiles, half-open: the
   ground line plus the band's own downward relief. `drawSky` paints down to it
   and `excavated` calls anything past it cut rock. Memoised; `b.cfg` is frozen. */
const skyBottoms = new Map();
export function skyBottomTy(b) {
  let ty = skyBottoms.get(b.cfg.id);
  if (ty === undefined) {
    const relief = (b.cfg.strata || []).find(r => r.kind === 'relief');
    ty = (b.cfg.floorTy ?? 0) + (relief?.dip ?? 0);
    skyBottoms.set(b.cfg.id, ty);
  }
  return ty;
}

/* Is this space cut out of rock, or open air over the landscape? Open air stays
   transparent so the sky shows through; an air tile is cut rock when rock stands
   above it in its column, or it sits at or past the row the sky stops at. */
const excavated = (b, tx, ty) =>
  ty >= skyBottomTy(b) || !skyExposedAt(b, tx, ty);

function paintChunk(b, cx, cy, g) {
  const t = b.tile, k = b.chunk, px = chunkPx(b);
  const t0x = cx * k, t0y = cy * k;
  g.clearRect(0, 0, px, px);

  const dark = cavityColour(b);

  for (let j = 0; j < k; j++) {
    const ty = t0y + j, dy = j * t;
    for (let i = 0; i < k; i++) {
      const tx = t0x + i, dx = i * t;
      if (tileAt(b, tx, ty) === AIR) {
        if (excavated(b, tx, ty)) paintCavity(g, b, tx, ty, dx, dy, dark);
        continue;
      }
      paintTile(g, b, tx, ty, dx, dy, dark);
    }
  }

    /* Decorations are a second pass over a wider range: a tile up to
       `DECO_MARGIN` outside this chunk can paint into it, and all rock then all
       decoration is one z-order every chunk agrees on. */
  const lo = -DECO_MARGIN, hi = k + DECO_MARGIN;
  for (let j = lo; j < hi; j++)
    for (let i = lo; i < hi; i++)
      decorate(g, b, t0x + i, t0y + j, i * t, j * t, px);
}

/* A tile that has seen the sun grows something. `skyExposedAt` walks to the top
   of the band's grid rather than testing whether the tile above is air, which a
   tunnel ceiling satisfies. Only rows declaring a decoration pay for the walk. */
function decorate(g, b, tx, ty, dx, dy, clip) {
  const l = rowAt(b, tx, ty).look;
  if (!l.canopy && !l.grassCap) return;
  if (!skyExposedAt(b, tx, ty)) return;

  const t = b.tile;
  const cell = {
    px: dx, py: dy, tx, ty, tile: t, clip,
    openL: !solidAt(b, tx - 1, ty),
    openR: !solidAt(b, tx + 1, ty),
    solidBelow: solidAt(b, tx, ty + 1),
    bankL: banked(b, tx - 1, ty),
    bankR: banked(b, tx + 1, ty)
  };
  /* Native only for a canopy: a placed log is a ladder, and a rung sprouting a
     five-tile olive crown is not a tree. Named here rather than left to the
     generic list because this needs a `model` query `treatments.js` cannot make. */
  if (l.canopy && formAt(b, tx, ty) === NATIVE) TREAT.canopy(g, cell, l.canopy);
  if (l.grassCap) TREAT.grassCap(g, cell, l.grassCap);
}

/* Is this neighbouring cell the outer corner of a one-tile step, so the turf
   beside it can bank across? `(tx, ty)` is the neighbour's coordinate. Empty air
   rather than "not solid": a bank over a rung would bury a placed ladder. */
const banked = (b, tx, ty) =>
  tileAt(b, tx, ty) === AIR && solidAt(b, tx, ty + 1)
  && !!rowAt(b, tx, ty + 1).look.grassCap && skyExposedAt(b, tx, ty);

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
   treatments, and crack marks as the pick does its work. A placed form that
   declares its own `look` takes none of that. */
function paintTile(g, b, tx, ty, dx, dy, dark) {
  const t = b.tile;
  const L = look(b, tx, ty);
  if (!L) return;

  const cell = { px: dx, py: dy, tx, ty, tile: t };

  /* A form may draw itself, and then every generic cube pass is suppressed
     rather than drawn under the sprite -- the ladder is two rails and a rung
     with the tile empty between them. Keyed on the presence of a form `look`. */
  const fl = formRowOf(tileAt(b, tx, ty))?.look;
  if (fl) {
    if (excavated(b, tx, ty)) paintCavity(g, b, tx, ty, dx, dy, dark);
    treat(g, fl, cell);
    cracked(g, b, tx, ty, dx, dy, t);
    return;
  }

  R(g, dx, dy, t, t, L.base);
  grain(g, dx, dy, tx, ty, t, L);

  /* Exposed faces catch light and buried faces do not; any open neighbour
     counts, a cave ceiling included. The direction comes from the one `LIGHT`
     declaration in `core/pixels.js`, so every face and the canopy agree. */
  if (!solidAt(b, tx, ty - 1)) {
    if (LIGHT.fromY < 0)
      for (let x = 0; x < t; x++) {
        const jit = ((hash2(tx * t + x, ty * 7) * 3) | 0) - 1;
        R(g, dx + x, dy + Math.max(0, jit), 1, 2, L.hi);
      }
  } else if (subAt(b, tx, ty - 1) !== subAt(b, tx, ty)) {
    /* A strata contact, not a ruled line: where the substance above differs, a
       1 px line in the lower material's own contact tone, wobbling within the
       top three pixels on the tile's hash. One `subAt` per buried tile. */
    for (let x = 0; x < t; x++)
      R(g, dx + x, dy + ((hash2(tx * t + x, ty * 23 + 3) * 3) | 0), 1, 1, L.contact);
  }

    /* An exposed vertical face is a cliff face: two or three pixels deep with a
       hash-jittered width down its length, the same jitter idiom as the top
       face, so relief reads as landform rather than as stacked cubes. */
  if (!solidAt(b, tx - 1, ty))
    cliffFace(g, dx, dy, tx, ty, t, LIGHT.fromX < 0 ? L.faceSun : L.faceShade, false);
  if (!solidAt(b, tx + 1, ty))
    cliffFace(g, dx, dy, tx, ty, t, LIGHT.fromX < 0 ? L.faceShade : L.faceSun, true);
  if (!solidAt(b, tx, ty + 1)) R(g, dx, dy + t - 1, t, 1, L.lo);

  treat(g, L.row.look, cell);

  cracked(g, b, tx, ty, dx, dy, t);
}

/* A crack means this swing, not this vein: `unitProgressAt` resets per unit, so
   a unit falling out shows as the cracks vanishing. Its own function, because a
   form that draws its own sprite skips every other pass but not this one. */
function cracked(g, b, tx, ty, dx, dy, t) {
  const d = unitProgressAt(b, tx, ty, effHardAt(b, tx, ty), effChargeAt(b, tx, ty));
  if (d > 0.05) cracks(g, dx, dy, tx, ty, d, t);
}

/* The two numbers `rules/mining.js` mines a tile by, resolved once for `view`:
   each is the substance's base value times its own scoped modifier, as the rule
   reads them. Exported because a chunk bake and a live overlay must agree. */
export function effHardAt(b, tx, ty) {
  const sub = subAt(b, tx, ty);
  return baseHardAt(b, tx, ty) * (sub < 0 ? 1 : eff('hard', SUB[sub].id));
}

export function effChargeAt(b, tx, ty) {
  const sub = subAt(b, tx, ty);
  if (sub < 0) return 1;
  return Math.max(1, Math.round(baseChargeAt(b, tx, ty) * eff('richness', SUB[sub].id)));
}

/* The deepest a cliff face cuts into a tile, in pixels: three of eight, enough
   to read as a face without swallowing the tile's own colour. */
const FACE_MAX = 3;

function cliffFace(g, dx, dy, tx, ty, t, col, right) {
  for (let y = 0; y < t; y++) {
    const w = 1 + ((hash2(tx * 31 + y, ty * 17 + (right ? 7 : 3)) * FACE_MAX) | 0);
    R(g, right ? dx + t - w : dx, dy + y, w, 1, col);
  }
}

/* `look.speckle` is the fraction of a tile's pixels that get a grain dot. The
   `noiseFill` seed is positional and never `rand()`: a repaint may not advance
   the generator, and a neighbouring chunk must speckle the tile identically. */
const SPECKLE = 0.26;
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

/* Every literal colour in this file resolves through `data/palette.js` at module
   load, so there is no inline hex at a call site and a typo fails at import.
   These are render decisions with no content meaning. */
const INK = {
  crack:  mix(colour('woodD'), '#000000', 0.55),
  mouth:  colour('abyC'),
  pipOff: mix(colour('uiBack'), colour('uiDim'), 0.25),
  fireHi: colour('lavaA'),
  fireLo: colour('lavaB'),
  spark:  mix(colour('ichor'), colour('cloudA'), 0.6),
  white:  colour('cloudA'),
  /* What every tone is pushed toward with depth, so deep rock cools rather than
     merely dimming. */
  deep:   colour('abyC'),
  ui:     colour('ui'),
  /* The stalled-machine badge, in the same red the HUD's own hearts and refusal
     text use. */
  warn:   colour('uiHeart')
};

/* A substance's palette resolves once per depth step: five colour names per tile
   per repaint is the one place a name lookup would show. The curve is quantised,
   or a cache keyed on continuous depth holds one entry per tile row. */
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
   how little ambient light the row claims. */
function cavityColour(b) {
  const l = b.cfg.look || {};
  return mix(colour(l.tint ?? 'abyC'), '#000000', 0.62 + (1 - (l.ambient ?? 1)) * 0.25);
}


/* A dropped unit: two colours off `look.item` sized by the form, or a `SPRITE`
   the row names. `px`/`py` are screen pixels at the item's centre, and `treat()`
   still runs after. `sprite` is a string, or an object keyed by form id. */
export function paintItem(g, it, px, py, t) {
  const l = SUB[it.sub].look;
  if (!l?.item) return;
  const spriteName = typeof l.sprite === 'string' ? l.sprite : l.sprite?.[FORM[it.form].id];
  const sprite = spriteName && SPRITE[spriteName];
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

/* A machine, from its own `look`: no machine name and no per-machine draw
   function. */
export function paintMachine(g, m, px, py, t) {
  const def = MACH[m.def];
  const l = def.look;
  const w = m.box.w, h = m.box.h;

  /* The cable pass runs before the machine it is anchored to, so a span and its
     bucket chain pass behind the drum they run over. The carrier goes the other
     way round, so a bucket parked at a hub is visible in it. */
  if (l.cable) paintCables(g, m, px, py, l);

  /* A row with `parts` draws itself out of named shapes; a row without one gets
     the generic catch box below. One look key and a generic dispatch, never a
     name check -- hopper lips are a lie on a gear. */
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
    R(g, px + 1, py + 1, w - 2, 2, INK.mouth);
    R(g, px, py + h - 2, w, 2, colour(l.base));
    R(g, px - 2, py - 1, 2, 3, colour(l.trim));
    R(g, px + w, py - 1, 2, 3, colour(l.trim));
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

    /* The stalled-machine warning, keyed off `statusOf`'s value and never off a
       name: a stall otherwise shows only as the fire glow never lighting. */
  if (statusOf(m) === 'no-fuel') drawText(g, '!', px + w - 6, py + 1, INK.warn, 1, 1);

  /* Last, over the hub's own body. */
  if (l.carrier) paintCarriers(g, m, px, py, l);
}

/* Drawn from `paintMachine`, which puts a cable inside the machine pass and so
   before `drawDarkness` and `drawFog`. Exactly one hub draws each part: the cable
   on the earlier hub to pass behind both drums, the carrier on the later. */
function screenOffset(m, px, py) {
  return { ox: px - m.box.x, oy: py - m.box.y };
}

const aFirst = seg => machines.indexOf(seg.a) <= machines.indexOf(seg.b);
const firstHub = seg => (aFirst(seg) ? seg.a : seg.b);
const lastHub  = seg => (aFirst(seg) ? seg.b : seg.a);

function paintCables(g, m, px, py, l) {
  const { ox, oy } = screenOffset(m, px, py);
  const p = l.cable;
  const hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);

  for (const seg of segmentsAt(m)) {
    if (firstHub(seg) !== m) continue;

    const x0 = (seg.ax + ox) | 0, y0 = (seg.ay + oy) | 0;
    const x1 = (seg.bx + ox) | 0, y1 = (seg.by + oy) | 0;

    /* The two strands of the loop, `STRAND_GAP` apart across the rope: the lit
       one carries buckets up and the shaded one brings them back down. Their
       offsets come from the model, so a strand is drawn where a bucket on it
       is actually stood on. */
    const up = strandOffset(seg, 0), down = strandOffset(seg, 0.75);
    lineTo(g, (x0 + up.x) | 0, (y0 + up.y) | 0, (x1 + up.x) | 0, (y1 + up.y) | 0, hi);
    lineTo(g, (x0 + down.x) | 0, (y0 + down.y) | 0, (x1 + down.x) | 0, (y1 + down.y) | 0, lo);

    /* The two turns, so the strands read as one belt round a wheel rather than
       two unrelated wires. */
    lineTo(g, (x0 + up.x) | 0, (y0 + up.y) | 0, (x0 + down.x) | 0, (y0 + down.y) | 0, lo);
    lineTo(g, (x1 + up.x) | 0, (y1 + up.y) | 0, (x1 + down.x) | 0, (y1 + down.y) | 0, lo);
  }
}

/* The carrier reads as standable: a lit deck plank, a dark body under it, and two
   hangers to the cable. The deck line is the top of
   `model/segments.js#carrierBox`, the rectangle the ride branch tests against. */
function paintCarriers(g, m, px, py, l) {
  const { ox, oy } = screenOffset(m, px, py);
  const p = l.carrier;
  const body = colour(p.body), hi = colour(p.hi ?? p.body), lo = colour(p.lo ?? p.body);
  const cargo = colour(p.col ?? p.body), rope = colour(p.trim ?? p.hi ?? p.body);

  for (const seg of segmentsAt(m)) {
    if (lastHub(seg) !== m) continue;
    for (const car of seg.carriers) paintOne(seg, car);
  }

  function paintOne(seg, car) {
    const c = carrierPos(seg, car);
    const x = (c.x + ox - CARRIER_W / 2) | 0;
    const y = (c.y + oy - CARRIER_H / 2) | 0;

        /* `CARRIER_W`/`CARRIER_H` are the model's 10x4 stand box, not a drawing
           budget: the deck line sits exactly on the box's top edge -- the pixels
           the ride branch stands the player on -- and the body hangs below it. */
    const depth = Math.max(CARRIER_H, p.depth ?? 7);

    R(g, x + 1, y - 4, 1, 4, rope);
    R(g, x + CARRIER_W - 2, y - 4, 1, 4, rope);
    R(g, x + 1, y - 4, CARRIER_W - 2, 1, rope);

    R(g, x, y + 1, CARRIER_W, depth - 1, body);
    R(g, x, y + 1, 1, depth - 1, hi);
    R(g, x + CARRIER_W - 1, y + 1, 1, depth - 1, lo);
    R(g, x, y + depth - 1, CARRIER_W, 1, lo);

        /* How full the bucket looks, filling from the floor up, inset a pixel
           each side so the staves still read as staves with a brimming load. */
    /* Brim-full is a bucket's own capacity, read rather than restated, so the
       picture cannot disagree with what the drivetrain is weighing. */
    const full = Math.max(1, eff('bucketCap'));
    const frac = Math.max(0, Math.min(1, car.load / full));
    const fillH = Math.round(frac * (depth - 3));
    if (fillH > 0) R(g, x + 1, y + depth - 2 - fillH, CARRIER_W - 2, fillH, cargo);

    R(g, x - 1, y, CARRIER_W + 2, 1, hi);
    R(g, x - 1, y, 1, 2, lo);
    R(g, x + CARRIER_W, y, 1, 2, lo);
  }
}

