/* model layer — band allocation and coordinate math. State and queries only.

   No module-scope dimension constant: a band is allocated from a
   `data/world.js` row at run time and more than one is resident, so `bands` is
   an array and every query takes the band record as its first argument.

   `origin` is in pixels, not tiles, because a tile offset is meaningless
   between two bands whose `tile` sizes differ. */

import { bump } from './epoch.js';

export const bands = [];               // allocated band records, in row order

/* The ceiling on a band-local tile index. `idx` itself is exact, but
   `model/mining.js`, `model/growth.js` and `model/digqueue.js` pack it into a
   per-band slot of this size, so a larger band would alias one band's deep
   rows onto the next band's shallow ones. Raise those three first. */
const IDX_SLOT = 0x1000000;

export const write = {
  /* Called once per band from `shell/boot.js` with a `data/world.js` row, at
     run time rather than at import. */
  allocate(cfg) {
    if (cfg.tw * cfg.th > IDX_SLOT)
      throw new Error(`band "${cfg.id}" is ${cfg.tw}x${cfg.th} = ` +
                      `${cfg.tw * cfg.th} tiles, over the ${IDX_SLOT} a packed ` +
                      `band-local tile index holds`);
    const b = {
      id: cfg.id, name: cfg.name,
      ord: bands.length,               // stable index, used as a Map key prefix
      tw: cfg.tw, th: cfg.th, tile: cfg.tile, chunk: cfg.chunk,
      origin: { x: cfg.origin.x, y: cfg.origin.y },
      cx: Math.ceil(cfg.tw / cfg.chunk),
      cy: Math.ceil(cfg.th / cfg.chunk),
      mat: new Uint8Array(cfg.tw * cfg.th),
      /* A per-chunk version counter, not a dirty flag: `view` may not write to
         `model`, so it cannot clear a flag. */
      ver: null,
      /* Fog of war: one bit per tile, permanent for the run and reset only by
         `newRun()` reallocating the band. Dense rather than a sparse Set,
         since most tiles in an explored band eventually get seen. Does not
         bump `ver`; reveal is a live overlay pass in `view/scene.js`. */
      seen: new Uint8Array(cfg.tw * cfg.th),
      /* Current lighting, 0..eff('lightMax'), one byte per tile. Goes down as
         well as up, unlike `seen`, so a torch burning out darkens the room
         again. Does not bump `ver` either; light is a live overlay pass. */
      light: new Uint8Array(cfg.tw * cfg.th),
      /* Bumped once per recompute by `rules/light.js#write.touchLight`, never
         per tile. `rules/reveal.js#passB` folds it into its own throttle to
         notice a brazier lighting up, which touches no tile byte. */
      lightVer: 0,
      fields: {},                      // filled by `model/fields.js`
      cfg                              // the frozen row, for strata and `look`
    };
    b.ver = new Uint32Array(b.cx * b.cy).fill(1);
    bands.push(b);
    bump();
    return b;
  },

  clear() { bands.length = 0; bump(); },

  /* Permanent and one-way. Returns false for an out-of-bounds or
     already-revealed tile, so a caller need not diff. */
  reveal(b, tx, ty) {
    if (!inBounds(b, tx, ty)) return false;
    const i = idx(b, tx, ty);
    if (b.seen[i]) return false;
    b.seen[i] = 1;
    bump();
    return true;
  },

  /* Test-only, exposed through `__mf` in `shell/main.js`: screenshot tests
     park the camera at a band the player never walked to. Nothing in real
     play calls this, and a run that used it would not be reproducible. */
  revealAll(b) { b.seen.fill(1); bump(); },

  /* Reveals every row above `toTy`. `rules/reveal.js`'s per-column walk stops
     at the first solid tile, so a tree trunk would hide the ground it stands
     on. Rows are contiguous in `b.seen`, so this is one `fill` over a slice. */
  revealRows(b, toTy) { b.seen.fill(1, 0, Math.min(toTy, b.th) * b.tw); bump(); },

  /* Lighting storage. `rules/light.js` is the only caller; the BFS that
     decides what level a tile ends up at is that file's. */

  /* Raises only: a recompute seeds many sources into one tile and it should
     end up at the brightest that reached it. `clearLight` is how the field
     goes dark again. */
  setLight(b, tx, ty, level) {
    if (!inBounds(b, tx, ty)) return false;
    const i = idx(b, tx, ty);
    if (level <= b.light[i]) return false;
    b.light[i] = level;
    bump();
    return true;
  },

  /* Whole-band reset before a recompute: `setLight`'s raise-only rule cannot
     take a tile back to zero on its own. */
  clearLight(b) { b.light.fill(0); bump(); },

  /* The recompute signal `rules/reveal.js#passB` reads; see `lightVer` in
     `allocate`. */
  touchLight(b) { b.lightVer++; bump(); }
};

/* Has the player ever stood in or beside this tile? False out of bounds. */
export const seenAt = (b, tx, ty) => inBounds(b, tx, ty) && b.seen[idx(b, tx, ty)] === 1;

/* Current light level, 0..eff('lightMax'). 0 out of bounds. */
export const lightAt = (b, tx, ty) => inBounds(b, tx, ty) ? b.light[idx(b, tx, ty)] : 0;

export const bandOf = id => bands.find(b => b.id === id) || null;
export const bandByOrd = ord => bands[ord] || null;

/* The band a world pixel falls in, or null. The only place that knows bands
   are laid out in one shared space. */
export const bandAt = (x, y) => bands.find(b =>
  x >= b.origin.x && x < b.origin.x + b.tw * b.tile &&
  y >= b.origin.y && y < b.origin.y + b.th * b.tile) || null;

/* The band immediately below / above another in declaration order. */
export const bandBelow = b => bands[b.ord + 1] || null;
export const bandAbove = b => bands[b.ord - 1] || null;

/* Does this band carry open sky above its own ground line? `floorTy` is that
   ground line; false for a band whose row 0 is buried under the band above.
   Read from content rather than tested against the world, since the astral
   floor slab spans every column and would darken the surface band whole. */
export const hasOwnSky = b => (b.cfg.floorTy ?? 0) > 0;

/* Every band a world-pixel rect overlaps, each with the band-local tile box
   the rect covers inside it. Bounds are inclusive and clamped to the band's
   own grid, in top-down band order, and empty outside the world. A hitbox
   straddling a seam yields two entries. */
export function bandSpans(x, y, w, h) {
  const out = [];
  const x1 = x + w - 1, y1 = y + h - 1;
  for (const b of bands) {
    const bx1 = b.origin.x + widthPx(b) - 1, by1 = b.origin.y + heightPx(b) - 1;
    if (x1 < b.origin.x || x > bx1 || y1 < b.origin.y || y > by1) continue;
    out.push({
      b,
      tx0: tileX(b, Math.max(x, b.origin.x)), tx1: tileX(b, Math.min(x1, bx1)),
      ty0: tileY(b, Math.max(y, b.origin.y)), ty1: tileY(b, Math.min(y1, by1))
    });
  }
  return out;
}

/* Tile addressing. Band-local, always. */

export const idx = (b, tx, ty) => ty * b.tw + tx;

export const inBounds = (b, tx, ty) =>
  tx >= 0 && tx < b.tw && ty >= 0 && ty < b.th;

/* world px <-> band tiles */

export const tileX = (b, wx) => Math.floor((wx - b.origin.x) / b.tile);
export const tileY = (b, wy) => Math.floor((wy - b.origin.y) / b.tile);

export const worldX = (b, tx) => b.origin.x + tx * b.tile;
export const worldY = (b, ty) => b.origin.y + ty * b.tile;

export const widthPx  = b => b.tw * b.tile;
export const heightPx = b => b.th * b.tile;

/* Chunks. `view` paints one of these per changed version. */

export const chunkOf = (b, tx, ty) => ({ cx: (tx / b.chunk) | 0, cy: (ty / b.chunk) | 0 });
export const chunkIdx = (b, cx, cy) => cy * b.cx + cx;
export const chunkVer = (b, cx, cy) => b.ver[cy * b.cx + cx];
export const chunkPx  = b => b.chunk * b.tile;
