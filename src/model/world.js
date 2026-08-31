/* LAYER model — band allocation and coordinate math. State and queries only.
   Imports `core` and `data`. May be imported by `model`, `rules`, `view`.

   NO MODULE-SCOPE DIMENSION CONSTANT EXISTS IN THIS FILE, and that is the
   point. A band is allocated from a `data/world.js` row at RUN TIME, and more
   than one is resident: `bands` is an array and every query below takes the
   band record as its first argument.

   Threading `b` through every call is real noise -- about one extra parameter on
   forty call sites. It buys three coexisting bands, a lift that travels between
   two of them, and a world size that `newRun()` gets a say in.

   COORDINATES. Two spaces, and only this file converts between them -- see
   docs/DEVELOPER_GUIDE.md#bands-and-worldgen.

   `origin` is in PIXELS, not tiles, because a tile offset is meaningless
   between two bands whose `tile` sizes differ -- and `tile` is per-band
   precisely so a band may differ. */

import { bump } from './epoch.js';

export const bands = [];               // allocated band records, in row order

export const write = {
  /* Called once per band from `shell/boot.js` with a `data/world.js` row.
     Allocation is here and not at import, which is the whole fix. */
  allocate(cfg) {
    const b = {
      id: cfg.id, name: cfg.name,
      ord: bands.length,               // stable index, used as a Map key prefix
      tw: cfg.tw, th: cfg.th, tile: cfg.tile, chunk: cfg.chunk,
      origin: { x: cfg.origin.x, y: cfg.origin.y },
      cx: Math.ceil(cfg.tw / cfg.chunk),
      cy: Math.ceil(cfg.th / cfg.chunk),
      mat: new Uint8Array(cfg.tw * cfg.th),
      /* A per-chunk VERSION counter, not a dirty flag: `view` may not write to
         `model`, so it cannot clear a flag. The epoch assertion is what forced
         this. See docs/DEVELOPER_GUIDE.md#view-cache-invalidation */
      ver: null,
      /* Fog of war: one bit per tile, permanent for the run. A `Uint8Array` and
         not a `Set` of indices -- unlike `fields.js#act`, which is deliberately
         sparse because most tiles never carry heat, MOST tiles in an explored
         band eventually get seen, so a dense byte array is both the simpler
         and the smaller structure once play has gone on a while. It does NOT
         bump `ver`: a chunk canvas caches the STATIC rock texture, and reveal
         is a live overlay pass in `view/scene.js`, the same split
         `model/fields.js`'s own header already argues for heat. Never reset by
         anything short of `newRun()` reallocating the band outright -- there is
         no un-reveal action, which is the whole feature. */
      seen: new Uint8Array(cfg.tw * cfg.th),
      /* Current lighting, 0..eff('lightMax'), one byte per tile. Storage
         only -- the DECISION of what lights what is `rules/light.js`. Unlike
         `seen` above, this is NOT permanent: it goes down as well as up, so a
         torch that burns out darkens the room again while `seen` keeps the
         memory of it forever. Same reason it does not bump `ver` either: a
         chunk canvas caches the STATIC rock texture, and light -- like fog --
         is a LIVE overlay pass in `view/scene.js`, never baked into the
         bitmap. */
      light: new Uint8Array(cfg.tw * cfg.th),
      /* Bumped once per recompute, by `rules/light.js#write.touchLight`,
         never per frame. `write.setLight` cannot double as this signal --
         it fires per TILE during a recompute and would make every recompute
         look like hundreds of separate changes -- so this is the one counter
         `rules/reveal.js#passB` can fold into its own throttle to notice "a
         brazier just lit up" even though that event alone never touches a
         tile byte and therefore never bumps a chunk `ver`. */
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

  /* Permanent, one-way: a tile once revealed stays revealed for the rest of
     the run (the product decision this feature exists to implement). Returns
     false for an out-of-bounds tile or one already revealed, so a caller need
     not diff -- the same shape `model/tiles.js#write.set` already uses. */
  reveal(b, tx, ty) {
    if (!inBounds(b, tx, ty)) return false;
    const i = idx(b, tx, ty);
    if (b.seen[i]) return false;
    b.seen[i] = 1;
    bump();
    return true;
  },

  /* TEST-ONLY escape hatch, exposed through `__mf` in `shell/main.js`. Several
     screenshot tests park the camera at a band the player never walked to, to
     prove TERRAIN rendering is correct -- a question fog of war must not be
     allowed to swallow. Nothing in real play ever calls this; a run that used
     it would not be reproducible from a walk, only from a cheat. */
  revealAll(b) { b.seen.fill(1); bump(); },

  /* Real gameplay, unlike `revealAll` above: `shell/boot.js` uses this once,
     at spawn, to show the whole starting skyline -- sky, grass, trees --
     before the player has taken a single step, rather than making the first
     frame of a new run a screen of fog `rules/reveal.js`'s Pass A would
     mostly-but-not-quite clear on its own (a tree trunk is solid, so Pass A's
     per-column walk stops at its FIRST solid tile and never reaches the
     ground a tree is standing on). Rows are contiguous in `b.seen` (`idx` is
     `ty * b.tw + tx`), so revealing every row below `toTy` is one `fill` call
     over a slice, not a nested loop. */
  revealRows(b, toTy) { b.seen.fill(1, 0, Math.min(toTy, b.th) * b.tw); bump(); },

  /* ---- lighting. `rules/light.js` is the only caller. Storage and the
     "raise, don't overwrite" rule are here; the BFS that decides WHAT level
     a tile ends up at is entirely that file's business. ---- */

  /* A recompute seeds many sources into the same tile and the tile should end
     up at the BRIGHTEST one that reached it, so this only ever raises --
     mirroring `reveal`'s "only ever sets" shape one level up, with a number
     instead of a bit. The caller clears the band first (see `clearLight`)
     when it wants the field to actually go dark somewhere it no longer
     reaches. */
  setLight(b, tx, ty, level) {
    if (!inBounds(b, tx, ty)) return false;
    const i = idx(b, tx, ty);
    if (level <= b.light[i]) return false;
    b.light[i] = level;
    bump();
    return true;
  },

  /* Whole-band reset before a recompute -- light, unlike fog, must be able to
     go all the way back to zero somewhere it no longer reaches (a moved
     brazier, a spent brand), and `setLight`'s raise-only rule cannot do that
     by itself. */
  clearLight(b) { b.light.fill(0); bump(); },

  /* The one signal `rules/reveal.js#passB` needs and cannot derive any other
     way -- see the field comment on `lightVer` in `allocate`. */
  touchLight(b) { b.lightVer++; bump(); }
};

/* Has the player ever stood in or beside this tile? False out of bounds, same
   as a query would report "no rock there" rather than throwing -- there is
   nothing to reveal past the edge of a band's own grid. */
export const seenAt = (b, tx, ty) => inBounds(b, tx, ty) && b.seen[idx(b, tx, ty)] === 1;

/* Current light level, 0..eff('lightMax'). 0 out of bounds -- there is
   nothing to light past the edge of a band's own grid, the same convention
   `seenAt` uses for "no", not an exception. */
export const lightAt = (b, tx, ty) => inBounds(b, tx, ty) ? b.light[idx(b, tx, ty)] : 0;

/* ---- band lookup ---- */

export const bandOf = id => bands.find(b => b.id === id) || null;
export const bandByOrd = ord => bands[ord] || null;

/* The band a WORLD PIXEL falls in, or null. This is the only place that knows
   bands are laid out in a shared space at all. */
export const bandAt = (x, y) => bands.find(b =>
  x >= b.origin.x && x < b.origin.x + b.tw * b.tile &&
  y >= b.origin.y && y < b.origin.y + b.th * b.tile) || null;

/* The band immediately below / above another in declaration order. A lift stage
   and a dig through a band floor both need this, and neither should compute it. */
export const bandBelow = b => bands[b.ord + 1] || null;
export const bandAbove = b => bands[b.ord - 1] || null;

/* ---- tile addressing. Band-local, always. ---- */

export const idx = (b, tx, ty) => ty * b.tw + tx;

export const inBounds = (b, tx, ty) =>
  tx >= 0 && tx < b.tw && ty >= 0 && ty < b.th;

/* ---- world px <-> band tiles ---- */

export const tileX = (b, wx) => Math.floor((wx - b.origin.x) / b.tile);
export const tileY = (b, wy) => Math.floor((wy - b.origin.y) / b.tile);

export const worldX = (b, tx) => b.origin.x + tx * b.tile;
export const worldY = (b, ty) => b.origin.y + ty * b.tile;

export const widthPx  = b => b.tw * b.tile;
export const heightPx = b => b.th * b.tile;

/* ---- chunks. `view` paints one of these per dirty version. ---- */

export const chunkOf = (b, tx, ty) => ({ cx: (tx / b.chunk) | 0, cy: (ty / b.chunk) | 0 });
export const chunkIdx = (b, cx, cy) => cy * b.cx + cx;
export const chunkVer = (b, cx, cy) => b.ver[cy * b.cx + cx];
export const chunkPx  = b => b.chunk * b.tile;
