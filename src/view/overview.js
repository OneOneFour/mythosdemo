/* LAYER view — THE MAP OVERVIEW. Imports `core`, `data` and READ-ONLY `model`
   queries, plus same-layer `view/ui/` primitives. No `rules`, no `shell`.

   THE INVARIANT: THIS MAY NEVER DRAW AN UNSEEN TILE. It is a map assembled
   from memory, not an X-ray. An unrevealed tile draws NOTHING and the void
   fill shows through, and every layer filters the same way. Worldgen spends
   real effort making hollows discoveries.

   The default scale fits the world's WIDTH and the vertical axis scrolls,
   because no one scale shows a 1024x3328 world whole and is also legible.
   Zoom is an INTEGER number of screen pixels per band tile, never a
   continuous factor, so a tile's map cell is always a whole number of pixels
   wide. One screen pixel per tile is a FLOOR rather than a fallback: below it
   a pixel covers several tiles and has to either drop a one-tile shaft the
   player dug or sample a tile they have never seen.

   It reads the tile grid rather than downscaling the baked chunk canvases,
   because `view/paint.js#paintChunk` is FOG-BLIND -- it paints true material
   regardless of `seenAt` -- and because `chunkCanvas` BAKES on any call, so
   reaching for the whole world would cold-bake all 216 chunks. */

import { drawText, textWidth } from '../core/font.js';
import { mix } from '../core/palette.js';
import { lineTo, R } from '../core/pixels.js';
import { shortLabelOf } from '../data/forms.js';
import { colour } from '../data/palette.js';
import { epoch } from '../model/epoch.js';
import { items, parseKey } from '../model/items.js';
import { defOf, machines } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import {
  breaks, carrierPos, chains, isHub, linkCheck, segments, segmentsAt
} from '../model/segments.js';
import { rowOf, tileAt } from '../model/tiles.js';
import { bands, heightPx, lightAt, seenAt, tileX, tileY, widthPx } from '../model/world.js';
import { machineState, STATE_COLOUR } from './ui/mainPanel.js';
import {
  bandKnown, depthAt, depthText, drawRuler, masked, roman, rulerWidth
} from './ui/ruler.js';
import { drawn, resetDrawn } from './ui/state.js';
import { drawTooltip } from './ui/tooltip.js';

const INK = {
  void:  colour('abyC'),
  ui:    colour('ui'),
  /* `ink2` is the SECONDARY BODY tone and `dim` is the STATE tone. Two of the
     ten greys the HUD distinguishes are in this file and both keep `dim`:
     FOLLOW's off reading in the header and a layer toggled off in the legend.
     `dim` is also the geometry tone for the chain bracket's own rules, which
     are lines and not text. */
  ink2:  colour('uiInk2'),
  dim:   colour('uiDim'),
  back:  colour('uiBack'),
  /* The player's own marker. `ichor` is the divine-gold this codebase already
     uses for anything meant to read as "special, look here", reused rather
     than invented, and it reads against soil, stone and abyssal rock alike --
     none of which are gold. */
  mark:  colour('ichor'),
  /* The same three state colours `view/ui/mainPanel.js`'s LOGISTICS tab already
     uses, by the same palette names, so a machine that reads STALLED in the tab
     is the same amber on the map. */
  good:  colour('uiGood'),
  warn:  colour('uiAmber'),
  bad:   colour('uiHeart')
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

/* The largest level whose world fits the viewport WIDTH, as closely as an
   integer scale permits, and the SMALLEST level when nothing fits. The map is
   then depth-complete and width-windowed: the clamp below keeps the window
   inside the world and `extentRibbon` says which part you are looking at. */
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

/* THE TRANSFORM, derived fresh every frame and recorded in `mapView`. `m` is
   `f.ui.map`, handed over on the frame context because `view` may not import
   `shell`. */
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
   introduce a sub-pixel. */
const sxOf = (v, wx) => (v.vx + (wx - v.wx) * v.scale) | 0;
const syOf = (v, wy) => (v.vy + (wy - v.wy) * v.scale) | 0;

/* THE CLAMP, EXPOSED: the same `fit` over the same `unionBox` the transform
   uses, so `shell` needs no copy. `shell/input.js` needs it because
   `ui.map.x/y` is stored UNCLAMPED, and a pan therefore seeds from the clamped
   position and adds its delta to that. Before the first draw there is no
   transform to clamp against and the offset returns unchanged. */
export function mapClamp(x, y) {
  if (!mapView.active || !(mapView.scale > 0)) return { x, y };
  const box = unionBox();
  return {
    x: fit(x, box.left, box.w, mapView.vw / mapView.scale),
    y: fit(y, box.top, box.h, mapView.vh / mapView.scale)
  };
}

/* And back again, for `shell`'s drag-to-scroll and hover. Exported because
   the pointer dispatcher lives in `shell` and must invert exactly this. */
export const mapWorldAt = (sx, sy) => ({
  x: mapView.wx + (sx - mapView.vx) / mapView.scale,
  y: mapView.wy + (sy - mapView.vy) / mapView.scale
});

/* the frame
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
  drawLayers(g, v, f);
  drawPlayerMark(g, v);
  extentRibbon(g, v);

  drawRuler(g, {
    id: 'map-ruler', x: f.W - rulerWidth() - 2, y: HEADER_H + 4,
    h: f.H - HEADER_H - 4 - 20, vw: f.W, vh: f.H, labels: true
  });

  header(g, f, v);
  legend(g, f);
  /* THE HOVER PASSES DRAW LAST, over the ruler and the legend both, because a
     tooltip is the one thing in a frame that is allowed to cover anything. */
  hoverPass(g, f, v);
}

/* Fog rules here as it does in play: an unrevealed tile draws NOTHING and the
   void fill shows through, by omission rather than an opaque rect since there
   is no terrain underneath to cover. A revealed AIR tile also draws nothing,
   because `VOID_SUB` has no `look.base`.

   ROW-RUN COALESCED: one wide rect per contiguous run of one colour. `tx <=
   tx1` walks one sentinel column past the visible edge, so a run still open at
   the screen edge flushes without a second copy of the flush logic. */
function drawTerrain(g, v) {
  for (const b of bands) {
    const T = b.tile;
    const cell = Math.max(1, Math.round(T * v.scale));

    const [tx0, tx1, ty0, ty1] = tileWindow(b, v);
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

/* What a tile byte paints, resolved once per byte: terrain colour or null,
   whether the substance is ore, and the ORE layer's mark colour.

   Keyed on the PACKED BYTE, of which there are 256, so this is a complete memo
   rather than a cache with a policy -- one array index in place of a `rowOf`
   plus a `tags.includes` plus a guarded `colour()` per tile. Never
   invalidated, because every input is a frozen `data/` row. */
const byteInk = Array.from({ length: 256 });

function inkOf(byte) {
  let e = byteInk[byte];
  if (!e) {
    const row = rowOf(byte), l = row.look;
    e = byteInk[byte] = {
      base: l?.base ? colour(l.base) : null,
      ore: !!row.tags?.includes('metal'),
      mark: colour(l?.item?.[0] ?? l?.base ?? 'ui')
    };
  }
  return e;
}

const cellColour = (b, tx, ty) =>
  seenAt(b, tx, ty) ? inkOf(tileAt(b, tx, ty)).base : null;

/* THE METADATA LAYERS. The order they DRAW in is fixed here; the order they
   are LISTED in, for the legend and the digit keys, is `ui.map.layers`' own key
   order. Shading must go under the markers it shades, but a legend wants a
   stable list.

   EVERY LAYER FILTERS ON `seenAt`, per DRAWN THING rather than once at the top,
   because each layer's unit differs: a tile for ore, a footprint for a machine,
   a resting position for a pile, BOTH anchors for a segment. */

function drawLayers(g, v, f) {
  const L = f.ui.map.layers;
  if (L.light) drawLight(g, v);
  if (L.ore) drawOre(g, v);
  if (L.piles) drawPiles(g, v);
  if (L.machines) drawMachines(g, v);
  if (L.chain) drawChain(g, v);
}

/* LIGHT. Which shafts are unlit, from `b.light`. Two alpha steps rather than
   the three `drawDarkness` uses in play, because at four screen pixels per tile
   the middle two were indistinguishable.

   SHADED, NOT MARKED, which is why it is the one layer that starts OFF: it
   changes how every other layer reads. ONLY OVER SEEN TILES -- painting
   darkness over the void would draw the SHAPE of an unexplored hollow, which is
   the cheat this mode exists to prevent. The ceiling is `eff('lightMax')`, the
   same reading `drawDarkness` takes. */
function drawLight(g, v) {
  const max = Math.max(1, eff('lightMax'));
  for (const b of bands) {
    const T = b.tile;
    const cell = Math.max(1, Math.round(T * v.scale));
    const [tx0, tx1, ty0, ty1] = tileWindow(b, v);
    if (tx1 <= tx0 || ty1 <= ty0) continue;

    for (let ty = ty0; ty < ty1; ty++) {
      const py = syOf(v, b.origin.y + ty * T);
      let run = -1, cur = 0;
      for (let tx = tx0; tx <= tx1; tx++) {
        const a = tx < tx1 ? darkStep(b, tx, ty, max) : 0;
        if (a === cur) continue;
        if (cur) {
          g.globalAlpha = cur;
          R(g, sxOf(v, b.origin.x + run * T), py, (tx - run) * cell, cell, INK.void);
          g.globalAlpha = 1;
        }
        run = tx; cur = a;
      }
    }
  }
}

/* 0 for "leave it alone", otherwise the alpha of the shade over it. Unseen and
   unlit are DIFFERENT ANSWERS and both are 0 here: unseen because the tile is
   not ours to talk about, and fully lit because there is nothing to say. */
function darkStep(b, tx, ty, max) {
  if (!seenAt(b, tx, ty)) return 0;
  const l = lightAt(b, tx, ty) / max;
  return l >= 0.6 ? 0 : l >= 0.2 ? 0.3 : 0.62;
}

/* ORE. Seen ore only, and "ore" is a TAG rather than a substance name: a tile
   whose substance is tagged `metal`, which today is copper, tin and adamant.

   MARKED AT A FLOOR OF TWO PIXELS even at zoom level 1, where a tile is one
   pixel. A layer invisible at the zoom you use to see the whole world has no
   purpose, and the small bleed onto a neighbouring cell is the cost. */
function drawOre(g, v) {
  for (const b of bands) {
    const T = b.tile;
    const cell = Math.max(2, Math.round(T * v.scale));
    const [tx0, tx1, ty0, ty1] = tileWindow(b, v);
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        if (!seenAt(b, tx, ty)) continue;
        const ink = inkOf(tileAt(b, tx, ty));
        if (!ink.ore) continue;
        const x = sxOf(v, b.origin.x + tx * T), y = syOf(v, b.origin.y + ty * T);
        R(g, x, y, cell, cell, ink.mark);
        R(g, x, y, 1, 1, INK.ui);
      }
    }
  }
}

/* PILES. Dropped material bucketed BY TILE, drawn only where the count reaches
   a threshold: the question is "where did I leave a heap", not "where is every
   ingot", and at four pixels per tile a dozen items is one blob anyway.

   `items` is not indexed by band and the spatial grid answers "near this point"
   rather than "in this rect", so this walks the array -- a few hundred entries
   at worst, the same order `drawItems` walks every frame in play. */
const PILE_MIN = 3;

function drawPiles(g, v) {
  const buckets = new Map();
  for (const it of items) {
    const b = it.band;
    if (!b) continue;
    const tx = tileX(b, it.x), ty = tileY(b, it.y);
    if (!seenAt(b, tx, ty)) continue;
    const k = b.id + ':' + tx + ':' + ty;
    const cur = buckets.get(k);
    if (cur) cur.n++;
    else buckets.set(k, { b, tx, ty, n: 1 });
  }

  for (const p of buckets.values()) {
    if (p.n < PILE_MIN) continue;
    const T = p.b.tile;
    const x = sxOf(v, p.b.origin.x + p.tx * T), y = syOf(v, p.b.origin.y + p.ty * T);
    const cell = Math.max(3, Math.round(T * v.scale));
    R(g, x, y, cell, cell, INK.back);
    R(g, x, y, cell, 1, INK.ui);
    /* The count, when there is room beside the marker -- a number over a 3 px
       block is a smudge. On its OWN backing rect, because the count sits
       beside the marker rather than inside it, so the block above backs the
       marker and not the digits. A backing rect rather than a text shadow,
       because the marker is backed the same way. */
    if (cell >= 4) {
      const s = String(p.n), tw = textWidth(s);
      g.globalAlpha = 0.72; R(g, x + cell, y - 2, tw + 2, 9, INK.back); g.globalAlpha = 1;
      drawText(g, s, x + cell + 1, y - 1, INK.ui, 1, 1);
    }
  }
}

/* MACHINES. One glyph each, coloured by state, and neither half is a copy:
     the glyph  `def.glyph`, one character on the `data/machines.js` row. No
                machine name appears here.
     the state  `view/ui/mainPanel.js#machineState`, the LOGISTICS tab's own
                query, imported rather than reimplemented, so a machine reading
                STALLED in the tab is the same amber on the map.
   Centred on the footprint over a backing block, because a 5x7 character on
   mottled rock is unreadable. Below about six pixels of footprint the glyph is
   dropped and the block alone carries the state colour. */
function drawMachines(g, v) {
  for (const m of machines) {
    if (!seenAt(m.band, m.tx, m.ty)) continue;
    const st = machineState(m);
    const col = STATE_COLOUR[st] || INK.dim;
    const w = Math.max(3, Math.round(m.box.w * v.scale));
    const h = Math.max(3, Math.round(m.box.h * v.scale));
    const x = sxOf(v, m.box.x), y = syOf(v, m.box.y);
    if (x + w < v.vx || x > v.vx + v.vw || y + h < v.vy || y > v.vy + v.vh) continue;

    R(g, x, y, w, h, mix(INK.back, col, 0.45));
    const glyph = defOf(m).glyph;
    if (!glyph || w < 6 || h < 6) { R(g, x, y, Math.min(w, 2), Math.min(h, 2), col); continue; }
    drawText(g, glyph, x + ((w - 5) >> 1), y + ((h - 7) >> 1), col, 1, 1);
  }
}

/* THE TWO HOVER LAYERS.
   HOVER  a machine's tooltip: what it is, its state, its buffer, its charges.
   BANDS  a per-band summary: depth range, seen fraction, machine and stalled
          counts, ore seen, dark fraction.
   One pointer, two answers, and the more specific wins -- a machine under the
   cursor beats the band it sits in. Both go through `view/ui/tooltip.js`.

   The pointer's screen position is `f.mouse.x - f.cam.x`, the same conversion
   `view/hover.js#resolveHover` makes. The camera is frozen and rounded by the
   time this runs, so the subtraction is exact. */

function hoverPass(g, f, v) {
  if (!f.mouse?.has) return;
  const L = f.ui.map.layers;
  const sx = (f.mouse.x - f.cam.x) | 0, sy = (f.mouse.y - f.cam.y) | 0;

  if (L.hover) {
    const m = machineAtScreen(v, sx, sy);
    if (m) { machineTip(g, f, m, sx, sy); return; }
  }
  if (L.bands) {
    const b = bandAtScreen(v, sx, sy);
    if (b) bandTip(g, f, b, sx, sy);
  }
}

/* HIT-TESTED IN SCREEN SPACE, against the same rect `drawMachines` drew -- floor
   included -- rather than by converting the pointer to a world tile and asking
   `machineAt`. What you can SEE is what you can hover: a 2x2 gear is four screen
   pixels at zoom 1 and a world-space test would demand the player hit one of
   them exactly, while the marker on screen is deliberately bigger than that. One
   pixel of pad, for the same reason the world hover gives a falling item half a
   tile of slack. */
function machineAtScreen(v, sx, sy) {
  for (const m of machines) {
    if (!seenAt(m.band, m.tx, m.ty)) continue;
    const x = sxOf(v, m.box.x), y = syOf(v, m.box.y);
    const w = Math.max(3, Math.round(m.box.w * v.scale));
    const h = Math.max(3, Math.round(m.box.h * v.scale));
    if (sx >= x - 1 && sx < x + w + 1 && sy >= y - 1 && sy < y + h + 1) return m;
  }
  return null;
}

/* Buffer contents and fuel charges, both off the machine record. `m.buf` is
   keyed by the one pair string `model/items.js#keyOf` builds, so `parseKey` +
   `shortLabelOf` turns a buffer into rows without this file knowing a single
   substance name (SPEC 12). CHARGES is only shown when there are some: a row
   reading `CHARGES 0` on a furnace is noise, while its absence on a machine that
   never banks any is correct. */
function machineTip(g, f, m, sx, sy) {
  const def = defOf(m);
  const st = machineState(m);
  const rows = [];
  for (const k in m.buf) {
    const { sub, form } = parseKey(k);
    if (sub < 0 || form < 0) continue;
    rows.push(shortLabelOf(sub, form) + ' X' + m.buf[k]);
  }
  if (m.charges > 0) rows.push('CHARGES ' + m.charges.toFixed(1).replace(/\.0$/, ''));
  if (!rows.length) rows.push('EMPTY');
  drawTooltip(g, {
    sections: [[def.name, st], rows], cx: sx, cy: sy, vw: f.W, vh: f.H
  });
}

/* Which band the pointer is over. TWO WAYS IN, one answer: over the ruler it is
   whichever segment rect the ruler itself recorded (read back through its own
   `wy0`/`wy1`, so the linear scale stays the ruler's business), and over the map
   body it is the band containing the world point under the cursor. */
function bandAtScreen(v, sx, sy) {
  for (const p of drawn.panels) {
    if (p.wy0 == null) continue;
    if (sx >= p.x - 4 && sx < p.x + p.w + 12 && sy >= p.y && sy < p.y + p.h)
      return bandContaining((p.wy0 + p.wy1) / 2);
  }
  if (sx < v.vx || sx >= v.vx + v.vw || sy < v.vy || sy >= v.vy + v.vh) return null;
  return bandContaining(v.wy + (sy - v.vy) / v.scale);
}

const bandContaining = wy =>
  bands.find(b => wy >= b.origin.y && wy < b.origin.y + heightPx(b)) || null;

/* A BAND'S SUMMARY IS A FULL SCAN of its `seen` and `light` arrays -- 40,960
   tiles for the topsoil band -- so it is CACHED BY MUTATION EPOCH. `epoch.n`
   moves on every `model` write and nothing here writes, so the cache is exact
   rather than heuristic; the map freezes the run, which means the scan happens
   once per band per time the map is opened rather than once per frame. A WeakMap
   keyed by the band record also means a `newRun()`'s fresh records invalidate it
   with no reset call, the same trick `view/ui/ruler.js#bandKnown` uses. */
const bandStats = new WeakMap();

function statsOf(b) {
  const hit = bandStats.get(b);
  if (hit && hit.epoch === epoch.n) return hit.s;

  const max = Math.max(1, eff('lightMax'));
  let seen = 0, ore = 0, dark = 0;
  for (let ty = 0; ty < b.th; ty++) {
    for (let tx = 0; tx < b.tw; tx++) {
      if (!seenAt(b, tx, ty)) continue;
      seen++;
      if (inkOf(tileAt(b, tx, ty)).ore) ore++;
      if (lightAt(b, tx, ty) / max < 0.6) dark++;
    }
  }
  let mach = 0, stalled = 0;
  for (const m of machines) {
    if (m.band !== b) continue;
    mach++;
    if (machineState(m) === 'STALLED') stalled++;
  }
  const s = { seen, ore, dark, mach, stalled, total: b.tw * b.th };
  bandStats.set(b, { epoch: epoch.n, s });
  return s;
}

function bandTip(g, f, b, sx, sy) {
  const known = bandKnown(b);
  const s = statsOf(b);
  const pc = (n, d) => (d > 0 ? Math.round((n / d) * 100) + '%' : '-');
  const top = depthAt(b.origin.y), bot = depthAt(b.origin.y + heightPx(b));
  drawTooltip(g, {
    sections: [
      [roman(b.ord) + '  ' + masked(b.name, known)],
      /* NOTHING HERE IS WITHHELD BEHIND THE MASK BECAUSE NOTHING HERE CAN LEAK:
         every figure is over tiles the player has already SEEN, so an unentered
         band reports 0% seen, no ore and no machines -- which is a statement
         about the player's own knowledge, not about the band. The depth range is
         the band's position in the world, which the ruler beside this tooltip is
         already drawing to scale. */
      ['DEPTH ' + depthText(top) + ' - ' + depthText(bot),
       'SEEN  ' + pc(s.seen, s.total),
       'DARK  ' + pc(s.dark, s.seen)],
      ['MACHINES ' + s.mach + (s.stalled ? '  STALLED ' + s.stalled : ''),
       'ORE SEEN ' + s.ore]
    ],
    cx: sx, cy: sy, vw: f.W, vh: f.H
  });
}

/* Which slice of the world's WIDTH the body is showing, as a scrollbar along
   the bottom edge: a dim track the width of the world, a lit thumb the width
   of the window. Drawn only when there is something to say, since a thumb
   spanning its whole track has never been wrong.

   Both rects carry their own world range in `wx0`/`wx1`, as the ruler records
   `wy0`/`wy1`. NEITHER records a `wy0`, precisely so `bandAtScreen` and
   `shell/input.js#mapRulerJump` cannot mistake a ribbon for a band. */
const RIBBON_H = 2;

function extentRibbon(g, v) {
  const room = v.vw / v.scale;                       // world px the body shows
  if (room >= v.worldW || v.worldW <= 0) return;

  const y = v.vy + v.vh - RIBBON_H;
  const w = Math.max(3, Math.round((room / v.worldW) * v.vw));
  const x = v.vx + Math.max(0, Math.min(v.vw - w,
    Math.round(((v.wx - v.left) / v.worldW) * v.vw)));

  R(g, v.vx, y, v.vw, RIBBON_H, mix(INK.back, INK.dim, 0.5));
  R(g, x, y, w, RIBBON_H, INK.ui);
  drawn.panels.push({ id: 'map-extent', x: v.vx, y, w: v.vw, h: RIBBON_H,
                      wx0: v.left, wx1: v.left + v.worldW });
  drawn.panels.push({ id: 'map-extent-window', x, y, w, h: RIBBON_H,
                     wx0: v.wx, wx1: v.wx + room });
}

/* The visible tile window of one band, as `[tx0, tx1, ty0, ty1]`. Extracted
   because four layers now need the identical cull and four copies of it is four
   chances to get one of the four clamps wrong. */
function tileWindow(b, v) {
  const T = b.tile;
  return [
    Math.max(0, Math.floor((v.wx - b.origin.x) / T)),
    Math.min(b.tw, Math.ceil((v.wx + v.vw / v.scale - b.origin.x) / T)),
    Math.max(0, Math.floor((v.wy - b.origin.y) / T)),
    Math.min(b.th, Math.ceil((v.wy + v.vh / v.scale - b.origin.y) / T))
  ];
}

/* A dashed line, integer pixels, walked parametrically so the dash phase is a
   function of distance along the line and nothing else -- no `rand()` and no
   dependence on how many times the map has been drawn. */
function dashTo(g, x0, y0, x1, y1, col, on = 3, off = 3, thick = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.max(1, Math.round(Math.hypot(dx, dy)));
  for (let i = 0; i <= len; i++) {
    if (i % (on + off) >= on) continue;
    R(g, (x0 + (dx * i) / len) | 0, (y0 + (dy * i) / len) | 0, thick, thick, col);
  }
}

/* LIFT CHAIN. A chain is DERIVED, never stored: `model/segments.js#chains()`
   and `#breaks()` are the queries and nothing is kept between frames.
     the cable      `seg.ax/ay -> seg.bx/by`, so the ANGLE is the line itself
     the two hubs   `seg.a` / `seg.b`, the machine records
     the carrier    `carrierPos(seg)`
     the break      `breaks()`, every hub anchoring exactly ONE segment, UNIONED
                    with every hub anchoring NONE -- a lone hub is an open end,
                    and `breaks()` only answers the question it is asked
     the gap        a PAIR of open ends `linkCheck` says could be joined now.
                    Which pair is worth drawing is this file's decision, and
                    the answer is the ones the player could actually bridge, so
                    the map cannot promise a cable the ghost would refuse.

   A line cannot show a chain with both ends off-screen, so each chain also
   gets a BRACKET down the left edge spanning its world-y extent.

   UNPOWERED MEANS NOT TURNING NOW: `m.torque` is the drive delivered this
   frame, and the only power question answerable without the drivetrain solve
   `rules/drive.js` owns. Brokenness is red at the ENDS and nowhere else. */
const HUB = 3;

function drawChain(g, v) {
  /* Derived ONCE per frame and passed down: three readers (the guard, the hub
     pass, the gap pass) asking `breaks()` three times would be three walks of
     the segment list for one answer that cannot change mid-draw. */
  const open = openHubs();
  if (!segments.length && !open.length) return;

  for (const chain of chains()) {
    for (const seg of chain) {
      if (!hubSeen(seg.a) || !hubSeen(seg.b)) continue;
      const x0 = sxOf(v, seg.ax), y0 = syOf(v, seg.ay);
      const x1 = sxOf(v, seg.bx), y1 = syOf(v, seg.by);
      const driven = seg.a.torque > 0 || seg.b.torque > 0;
      if (driven) lineTo(g, x0, y0, x1, y1, INK.mark);
      else dashTo(g, x0, y0, x1, y1, mix(INK.back, INK.ui, 0.7));

      const c = carrierPos(seg);
      R(g, sxOf(v, c.x) - 1, syOf(v, c.y) - 1, 3, 3, driven ? INK.good : INK.ui);
    }
    bracket(g, v, chain);
  }

  /* THE HUBS LAST, over their own cables, so a hub is never half a cable wide.
     A JOINED hub is a small solid pale box; an OPEN END is a red RING around a
     dark centre -- the loud one is the one that means something is missing, and
     an outline reads at 5 px where a second solid colour would just look like a
     differently-coloured dot. */
  const openSet = new Set(open);
  for (const m of hubsPlaced()) {
    if (!hubSeen(m)) continue;
    const x = sxOf(v, m.box.x + m.box.w / 2) - (HUB >> 1);
    const y = syOf(v, m.box.y + m.box.h / 2) - (HUB >> 1);
    if (openSet.has(m)) {
      R(g, x - 1, y - 1, HUB + 2, HUB + 2, INK.bad);
      R(g, x, y, HUB, HUB, INK.back);
    } else {
      R(g, x, y, HUB, HUB, INK.ui);
    }
  }

  gaps(g, v, open);
}

/* Every placed hub, and every hub that anchors 0 or 1 segments. Two small
   filters over `model` queries rather than a cached list: `machines` is tens of
   rows and a stale copy of it is the bug class `ui.linkFrom`'s own header warns
   about. */
const hubsPlaced = () => machines.filter(isHub);
const openHubs = () => [
  ...breaks(),
  ...hubsPlaced().filter(m => segmentsAt(m).length === 0)
];

/* A machine sits in a tile the player revealed to place it, and `seen` is
   permanent, so this is nearly always true. Checked anyway, because a future
   machine arriving without the player beside it -- a god's gift, a pre-placed
   ruin -- would otherwise quietly become the exception. */
const hubSeen = m => seenAt(m.band, m.tx, m.ty);

/* THE GAP: a red dashed cable exactly where the missing one would go, drawn
   between the two open ends `linkCheck` says could be joined. Both orderings of
   a pair give the same answer (`linkCheck` is symmetric by construction), so the
   inner loop starts past the outer one. O(k^2) over open ENDS, which is a
   handful even in a world full of cable. */
function gaps(g, v, open) {
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i], b = open[j];
      if (!hubSeen(a) || !hubSeen(b)) continue;
      if (!linkCheck(a, b).ok) continue;
      /* TWO PIXELS WIDE, against the cable's one. The gap is supposed to be the
         first thing you see, and colour alone is a weak signal on a map that is
         already brown and grey -- doubling the stroke makes it the boldest line
         in the frame at every zoom level. */
      dashTo(g, sxOf(v, a.box.x + a.box.w / 2), syOf(v, a.box.y + a.box.h / 2),
             sxOf(v, b.box.x + b.box.w / 2), syOf(v, b.box.y + b.box.h / 2),
             INK.bad, 3, 2, 2);
    }
  }
}

/* One chain's vertical extent, as a bracket down the left edge of the map body
   with its segment count beside it -- the answer to "how far does this thing
   actually reach" for a chain whose ends are both scrolled off screen. */
function bracket(g, v, chain) {
  let lo = Infinity, hi = -Infinity;
  for (const seg of chain) {
    lo = Math.min(lo, seg.ay, seg.by);
    hi = Math.max(hi, seg.ay, seg.by);
  }
  const y0 = Math.max(v.vy, syOf(v, lo)), y1 = Math.min(v.vy + v.vh - 1, syOf(v, hi));
  if (y1 < y0) return;
  const x = v.vx + 1;
  R(g, x, y0, 1, y1 - y0 + 1, INK.dim);
  R(g, x, y0, 3, 1, INK.dim);
  R(g, x, y1, 3, 1, INK.dim);
  /* The count on its own backing rect, and on the secondary body tone rather
     than the state tone: the number of segments in a chain is a quantity, not
     a status. Same reasoning as the pile count in `drawItemPiles` -- there is
     a 1 px bracket rule beside it and nothing behind it, and the rules
     themselves stay on `dim` because they are geometry. */
  const s = String(chain.length);
  if (y1 - y0 >= 10) {
    const ty = ((y0 + y1) >> 1) - 3;
    g.globalAlpha = 0.72; R(g, x + 2, ty - 1, textWidth(s) + 2, 9, INK.back); g.globalAlpha = 1;
    drawText(g, s, x + 3, ty, INK.ink2, 1, 1);
  }
}

/* the player
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

  if (py >= v.vy && py < v.vy + v.vh && px >= v.vx && px < v.vx + v.vw) {
    R(g, px - 1, py - 1, 3, 3, INK.mark);
    return;
  }

  /* The edge indicator points along the axis the player actually left through.
     Whichever axis they are further outside decides the direction, so a corner
     reads as the axis that is more wrong, and the tip sits on the edge with
     the arrow widening inward. */
  const x = Math.max(v.vx + 3, Math.min(px, v.vx + v.vw - 4));
  const y = Math.max(v.vy + 3, Math.min(py, v.vy + v.vh - 4));
  const dx = px < v.vx ? -1 : px >= v.vx + v.vw ? 1 : 0;
  const dy = py < v.vy ? -1 : py >= v.vy + v.vh ? 1 : 0;
  const overX = dx ? (dx < 0 ? v.vx - px : px - (v.vx + v.vw)) : -1;
  const overY = dy ? (dy < 0 ? v.vy - py : py - (v.vy + v.vh)) : -1;

  for (let i = 0; i < 3; i++) {
    if (overX >= overY) R(g, x - dx * i, y - i, 1, 1 + i * 2, INK.mark);
    else                R(g, x - i, y - dy * i, 1 + i * 2, 1, INK.mark);
  }
}

/* the header line
   What the mode is and what the keys do, because a mode with hidden controls
   is a mode nobody scrolls. Drawn with `drawText` and never `fillText`. */
function header(g, f, v) {
  const bar = HEADER_H;
  R(g, 0, 0, f.W, bar, INK.back);
  R(g, 0, bar, f.W, 1, mix(INK.back, INK.dim, 0.6));

  /* Laid out by MEASURING, never by hardcoded origins: each field starts where
     the last ended, so a two-digit zoom pushes the rest along rather than
     overlapping it. */
  let x = 4;
  const put = (s, col) => { drawText(g, s, x, 2, col, 1, 1); x += textWidth(s) + 6; };
  put('OVERVIEW', INK.ui);
  put('X' + v.zoom, INK.ink2);
  /* FOLLOW is a state, so it is drawn as one: lit when on, dim when a manual
     scroll has turned it off (`shell/ui.js#mapScroll` does that, once, for every
     input path). */
  put('FOLLOW', f.ui.map.follow ? INK.good : INK.dim);
  /* 'F' is not spelled out as "F FOLLOW" here because the word FOLLOW is
     already on this line as a STATE, two fields to the left, and one line
     saying it twice reads as two different things. */
  /* The key hints read as body text rather than a state, so `ink2`. FOLLOW two
     fields left keeps `dim`, because there it IS the off reading of a toggle.
     Both sit on the header's solid strip, so neither takes a shadow. */
  put('WASD/DRAG SCROLL  -/+ ZOOM  F  1-9 LAYERS  O CLOSE', INK.ink2);
}

/* WHICH DIGIT TOGGLES WHICH LAYER IS NOT RESTATED HERE. The rows are
   `ui.map.layers`' own key order, which `shell/input.js#mapDigit` indexes the
   same way, so the list a player reads and the key they press cannot drift. A
   layer added to that object appears here, numbered, with no edit.

   Bottom-left, over a backing rect, because the other three corners are taken
   -- the header owns the top strip, the ruler owns the right edge, and a
   chain's extent bracket is drawn top-left. */
function legend(g, f) {
  const ids = Object.keys(f.ui.map.layers);
  let w = 0;
  const rows = ids.map((id, i) => {
    const s = (i + 1) + ' ' + id.toUpperCase();
    w = Math.max(w, textWidth(s));
    return { s, on: f.ui.map.layers[id] };
  });
  const h = rows.length * 8 + 4;
  const x = 3, y = Math.max(HEADER_H + 2, f.H - h - 3);
  g.globalAlpha = 0.72; R(g, x, y, w + 6, h, INK.back); g.globalAlpha = 1;
  rows.forEach((r, i) => drawText(g, r.s, x + 3, y + 2 + i * 8, r.on ? INK.ui : INK.dim, 1, 1));
}
