/* LAYER view — THE MAP OVERVIEW. Imports `core`, `data` and READ-ONLY `model`
   queries, plus same-layer `view/ui/` primitives. No `rules`, no `shell`.

   EXTRACTED FROM `view/scene.js#drawMap` IN PHASE 9. There was no
   `view/overview.js` before this file; `drawMap` was a 37-line function inside
   the scene composer, and it is stated here rather than implied because a
   reader of the git history should not have to guess whether this file was
   moved or written.

   ============================================================================
   WHY IT WAS A STRIP, AND WHAT CHANGED.

   `drawMap` derived `scale = min(1/minTile, W/worldW, H/worldH)` over the union
   of every band. The world is 1024 px wide and 3328 px tall, so `H/worldH`
   won at every realistic window size and the WHOLE WORLD collapsed to fit the
   viewport HEIGHT -- about 111 px of map inside a 640 px canvas, which is the
   small vertical strip in a black field docs/AUDIT-2.md section 6 measured by
   arithmetic rather than by eyeballing a screenshot.

   The fix is the other axis: THE DEFAULT SCALE FITS THE WORLD'S WIDTH, and the
   vertical axis SCROLLS, because a world four times taller than it is wide has
   no scale that shows all of it and is also legible.

   ONE MORE CONSTRAINT, AND IT IS WHAT MAKES THE ZOOM LEVELS DISCRETE:
   docs/SPEC.md section 6 forbids fractional scale outright -- everything here
   renders at integer pixels and is upscaled nearest-neighbour by CSS. So zoom
   is an INTEGER number of screen pixels per band tile (`MAP_ZOOM` below), never
   a continuous factor, and a tile's map cell is therefore always a whole
   number of pixels wide. The default is the LARGEST level whose world still
   fits the viewport width, derived from the band union the way `drawMap`
   already did -- nothing here hardcodes 128 tiles, so widening `astral` from
   its current `tw:96` to the full width needs no edit in this file.
   ============================================================================

   WHY THIS STILL READS THE TILE GRID AND DOES NOT DOWNSCALE THE BAKED CHUNK
   CANVASES. docs/BUILD_PLAN.md Phase 9 names that as the goal and asks for
   either a fallback or a plain statement of why not. It is the second, and the
   reason is not performance:

     1. THE CHUNK BAKE IS FOG-BLIND. `view/paint.js#paintChunk` paints a tile's
        true material regardless of `seenAt`, because fog is deliberately a
        separate live overlay pass and not baked into the bitmap
        (docs/AUDIT-2.md section 7 flags exactly this hazard for "a later phase
        that adds a new consumer of chunk canvases -- e.g. a minimap
        thumbnail -- that might forget to gate on `seenAt` itself"). Downscaling
        a baked chunk would draw every unseen tile in it. That is THE
        INVARIANT this whole mode exists under, so the trade is not available.
     2. `chunkCanvas` PAINTS ON ANY CALL. Asking it for a chunk the player has
        never visited does not return null, it BAKES it -- so an overview that
        reached for the whole world would cold-bake all 264 chunks of it, at
        roughly 1.5 ms each (`view/paint.js#REPAINT_BUDGET`'s own measurement),
        and hold every one in the cache afterward.

   And the per-tile path got CHEAPER rather than dearer here, which is what
   makes the answer comfortable: `drawMap` read every tile of every band every
   frame (about 52,000 of them). This culls to the visible world-y range first
   and coalesces each row into runs of one colour, so a scrolled-in view of the
   surface touches a few thousand tiles and issues a fraction of the rects.

   ============================================================================
   THE INVARIANT: THIS MAY NEVER DRAW AN UNSEEN TILE. It is a map assembled
   from memory, not an X-ray. `drawMap` honoured it by OMISSION rather than
   with an opaque rect -- an unrevealed tile draws nothing and the void fill
   shows through -- and every layer added in Phase 9 filters the same way.
   Phase 7 spent real effort making hollows discoveries; an overview that
   showed them all would be a cheat menu.
   ============================================================================ */

import { drawText, textWidth } from '../core/font.js';
import { mix } from '../core/palette.js';
import { R } from '../core/pixels.js';
import { colour } from '../data/palette.js';
import { player, playerCentre } from '../model/player.js';
import { rowAt } from '../model/tiles.js';
import { bands, heightPx, seenAt, widthPx } from '../model/world.js';
import { drawRuler, rulerWidth } from './ui/ruler.js';
import { resetDrawn } from './ui/state.js';

const INK = {
  void:  colour('abyC'),
  ui:    colour('ui'),
  dim:   colour('uiDim'),
  back:  colour('uiBack'),
  /* The player's own marker. `ichor` is the divine-gold this codebase already
     uses for anything meant to read as "special, look here", reused rather
     than invented, and it reads against soil, stone and abyssal rock alike --
     none of which are gold. */
  mark:  colour('ichor')
};

/* SCREEN PIXELS PER SMALLEST BAND TILE. Integers only, and powers of two so
   that a band whose `tile` is a multiple of the smallest still lands on whole
   pixels: at level 4 an 8 px tile is a 4 px cell exactly, never 4.33.
   `data/world.js` allows bands to disagree about `tile` (all three currently
   agree on 8); a band whose tile is NOT a multiple of the smallest rounds its
   cell size, which is the same rounding `drawMap` already did and the only
   case where a cell edge can land a pixel out. */
export const MAP_ZOOM = Object.freeze([1, 2, 4, 8]);

/* The right edge the band ruler owns, and the top strip the header owns. Both
   are subtracted from the map BODY rather than drawn over it, so an edge
   indicator pinned to the body's top edge is not hidden underneath the header
   -- which is exactly what happened the first time this was drawn. */
const RULER_GAP = 4;
const HEADER_H = 12;

/* WHAT THE LAST DRAW ACTUALLY USED. The `view/paint.js#stats` /
   `view/hud.js#hoverInfo` idiom: `view`'s own scratch space for what it drew,
   read back by `shell`'s pointer dispatcher (which has to invert this exact
   transform to turn a drag into a scroll) and by the test hook. Never read by
   another module's LOGIC, and nothing here calls `model/epoch.js#bump`. */
export const mapView = {
  active: false,
  zoom: 0, scale: 0,
  /* world px at the map viewport's top-left corner */
  wx: 0, wy: 0,
  /* the map viewport in SCREEN px, which is the canvas minus the band ruler */
  vx: 0, vy: 0, vw: 0, vh: 0,
  /* the band union, the same one `shell/main.js#clampCam` reads */
  left: 0, top: 0, worldW: 0, worldH: 0
};

/* THE BAND UNION, and it is deliberately the SAME reading
   `shell/main.js#clampCam` takes: `bands[0]` is the top and the LAST band is
   the bottom, because `data/world.js` declares them top-to-bottom with each
   `origin.y` equal to the previous band's bottom edge. Two functions that
   clamp against "the world" must not disagree about where its edges are.
   The horizontal extent is a min/max over every band, because bands differ in
   width and in inset (`astral` starts at x:128 today). */
function unionBox() {
  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const left = Math.min(...bands.map(b => b.origin.x));
  const right = Math.max(...bands.map(b => b.origin.x + widthPx(b)));
  return { left, top, w: right - left, h: last.origin.y + heightPx(last) - top };
}

const minTile = () => Math.min(...bands.map(b => b.tile));

/* The largest level whose world fits the viewport WIDTH -- "fits the width" as
   closely as an integer scale permits, which is the whole point of the level
   list. Falls back to the smallest level on a viewport too narrow even for
   that, where the horizontal clamp below takes over instead. */
export function defaultZoom(vw, box = unionBox(), T = minTile()) {
  let best = MAP_ZOOM[0];
  for (const k of MAP_ZOOM) if ((box.w * k) / T <= vw) best = k;
  return best;
}

/* One axis of the offset, in WORLD px, given the room available. Mirrors
   `clampCam`'s own two-case shape exactly: clamp to the world edges when the
   world is bigger than the room, CENTRE when it is smaller -- a band narrower
   than the viewport centring rather than pinning to a corner is what a
   96-tile astral platform on a wide monitor needs, and the same is true of a
   whole world zoomed all the way out. */
function fit(want, lo, worldSpan, roomSpan) {
  if (worldSpan <= roomSpan) return lo - (roomSpan - worldSpan) / 2;
  return Math.max(lo, Math.min(want, lo + worldSpan - roomSpan));
}

/* THE TRANSFORM, derived fresh every frame and recorded in `mapView`.
   `m` is `f.ui.map` -- `shell/ui.js`'s session state, handed over on the frame
   context because `view` may not import `shell` (CLAUDE.md D2). */
function transform(f) {
  const box = unionBox();
  const T = minTile();
  const vx = 0, vy = HEADER_H + 1;
  const vw = Math.max(1, f.W - rulerWidth() - 2 - RULER_GAP);
  const vh = Math.max(1, f.H - vy);
  const m = f.ui.map;
  const zoom = m.zoom || defaultZoom(vw, box, T);
  const scale = zoom / T;

  /* FOLLOW PLAYER centres on the player and then clamps; a manual scroll turns
     the toggle off (`shell/ui.js#mapScroll`) and the stored offset is used
     instead. Both paths go through the same clamp, so neither can leave the
     world. */
  const roomW = vw / scale, roomH = vh / scale;
  let wantX = m.x, wantY = m.y;
  if (m.follow && player.band) {
    const c = playerCentre();
    wantX = c.x - roomW / 2;
    wantY = c.y - roomH / 2;
  }

  mapView.active = true;
  mapView.zoom = zoom;
  mapView.scale = scale;
  mapView.wx = fit(wantX, box.left, box.w, roomW);
  mapView.wy = fit(wantY, box.top, box.h, roomH);
  mapView.vx = vx; mapView.vy = vy; mapView.vw = vw; mapView.vh = vh;
  mapView.left = box.left; mapView.top = box.top;
  mapView.worldW = box.w; mapView.worldH = box.h;
  return mapView;
}

/* World px -> screen px, floored once, here, so nothing downstream can
   introduce a sub-pixel (SPEC section 6). */
const sxOf = (v, wx) => (v.vx + (wx - v.wx) * v.scale) | 0;
const syOf = (v, wy) => (v.vy + (wy - v.wy) * v.scale) | 0;

/* And back again, for `shell`'s drag-to-scroll and hover. Exported because
   the pointer dispatcher lives in `shell` and must invert exactly this. */
export const mapWorldAt = (sx, sy) => ({
  x: mapView.wx + (sx - mapView.vx) / mapView.scale,
  y: mapView.wy + (sy - mapView.vy) / mapView.scale
});

/* ---------- the frame ----------
   `flags.showMap` freezes the run (`shell/main.js#step()` no-ops while it is
   true) and swaps this in for the whole normal draw: no sky, no machines, no
   items, no walking sprite, no field glow, no HUD. The map is a full
   SUBSTITUTE frame, not an overlay. */
export function drawOverview(g, f) {
  /* The widget layer's scratch space is rebuilt once per frame by whatever
     assembles a frame of panels. `view/hud.js#drawHUD` does it on the normal
     path and does not run here, so this pass owns it -- without this the
     recorded rects would accumulate for as long as the map stayed open. */
  resetDrawn();

  const v = transform(f);

  R(g, 0, 0, f.W, f.H, INK.void);
  drawTerrain(g, v);
  drawPlayerMark(g, v);

  drawRuler(g, {
    id: 'map-ruler', x: f.W - rulerWidth() - 2, y: HEADER_H + 4,
    h: f.H - HEADER_H - 4 - 20, vw: f.W, vh: f.H, labels: true
  });

  header(g, f, v);
}

/* ---------- terrain ----------
   FOG RULES HERE EXACTLY AS IT DOES IN PLAY: `seenAt` per tile, and an
   unrevealed one draws NOTHING, leaving the void fill above showing through --
   the same "hidden regardless of what is actually there" rule `drawFog`
   enforces on the normal path, applied by omission instead of an opaque rect
   because there is no terrain painted underneath to cover here.

   A revealed AIR tile also draws nothing: `model/tiles.js`'s `VOID_SUB` row
   has no `look.base`, so a dug tunnel reads as empty space exactly as it does
   in a chunk canvas, and the same `if (!base) skip` that keeps
   `view/paint.js#look()` from painting open air handles it with no special
   case.

   ROW-RUN COALESCED, the same shape `drawFog`/`drawDarkness` already use: one
   wide rect per contiguous run of tiles sharing a colour, not one rect per
   tile. `tx <= tx1` (not `<`) walks one sentinel column past the visible edge
   purely so a run still open at the screen edge flushes without a second copy
   of the flush logic after the loop. */
function drawTerrain(g, v) {
  for (const b of bands) {
    const T = b.tile;
    const cell = Math.max(1, Math.round(T * v.scale));

    const tx0 = Math.max(0, Math.floor((v.wx - b.origin.x) / T));
    const tx1 = Math.min(b.tw, Math.ceil((v.wx + v.vw / v.scale - b.origin.x) / T));
    const ty0 = Math.max(0, Math.floor((v.wy - b.origin.y) / T));
    const ty1 = Math.min(b.th, Math.ceil((v.wy + v.vh / v.scale - b.origin.y) / T));
    if (tx1 <= tx0 || ty1 <= ty0) continue;

    for (let ty = ty0; ty < ty1; ty++) {
      const py = syOf(v, b.origin.y + ty * T);
      let run = -1, cur = null;
      for (let tx = tx0; tx <= tx1; tx++) {
        const col = tx < tx1 ? cellColour(b, tx, ty) : null;
        if (col === cur) continue;
        if (cur) {
          const px = sxOf(v, b.origin.x + run * T);
          R(g, px, py, (tx - run) * cell, cell, cur);
        }
        run = tx; cur = col;
      }
    }
  }
}

/* The hex a seen tile paints, or null for "draw nothing". Memoised by colour
   NAME rather than by tile, because `colour()` is a guarded lookup and this is
   the hottest call in the pass; the set of names is bounded by frozen content. */
const hexCache = new Map();
function hexOf(name) {
  let h = hexCache.get(name);
  if (h === undefined) { h = colour(name); hexCache.set(name, h); }
  return h;
}

function cellColour(b, tx, ty) {
  if (!seenAt(b, tx, ty)) return null;
  const look = rowAt(b, tx, ty).look;
  if (!look?.base) return null;
  return hexOf(look.base);
}

/* ---------- the player ----------
   ALWAYS DRAWN, EVEN OFF-SCREEN. A map whose one "you are here" mark silently
   vanishes the moment the view scrolls away from it is a map that cannot
   answer the only question it is ever opened for. Inside the viewport it is a
   fixed 3x3 (not scaled with the cell, which at zoom level 1 is one pixel and
   as easy to lose as any other); outside it, a chevron pinned to the edge it
   left through, at the player's own position along the other axis. */
function drawPlayerMark(g, v) {
  if (!player.band) return;
  const c = playerCentre();
  const px = sxOf(v, c.x), py = syOf(v, c.y);
  const x = Math.max(v.vx + 2, Math.min(px, v.vx + v.vw - 3));
  const y = Math.max(v.vy + 3, Math.min(py, v.vy + v.vh - 4));

  if (py >= v.vy && py < v.vy + v.vh && px >= v.vx && px < v.vx + v.vw) {
    R(g, px - 1, py - 1, 3, 3, INK.mark);
    return;
  }

  /* The edge indicator: a 5-wide arrow pointing the way the player lies. */
  const up = py < v.vy;
  for (let i = 0; i < 3; i++)
    R(g, x - (2 - i), up ? y + i : y - i, 1 + i * 2, 1, INK.mark);
}

/* ---------- the header line ----------
   What the mode is and what the keys do, because a mode with hidden controls
   is a mode nobody scrolls. Drawn with `drawText` and never `fillText`. */
function header(g, f, v) {
  const bar = HEADER_H;
  R(g, 0, 0, f.W, bar, INK.back);
  R(g, 0, bar, f.W, 1, mix(INK.back, INK.dim, 0.6));

  drawText(g, 'OVERVIEW', 4, 2, INK.ui, 1, 1);
  const z = 'X' + v.zoom;
  drawText(g, z, 4 + textWidth('OVERVIEW') + 6, 2, INK.dim, 1, 1);
}
