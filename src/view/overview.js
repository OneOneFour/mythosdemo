/* view layer — the map overview. It may never draw an unseen tile: an
   unrevealed tile draws nothing, the void fill shows through, and every layer
   filters the same way.

   The default scale fits the world's width and the vertical axis scrolls. Zoom
   is an integer number of screen pixels per band tile, never a continuous
   factor, with one pixel per tile as a floor: below that a pixel covers several
   tiles and must either drop a one-tile shaft or sample a tile never seen.

   It reads the tile grid rather than downscaling the baked chunk canvases,
   because `view/paint.js#paintChunk` paints true material regardless of
   `seenAt`, and because `chunkCanvas` bakes on any call. */

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
  /* `ink2` is the secondary body tone and `dim` the state tone -- and also the
     geometry tone for the chain bracket's own rules, which are lines, not text. */
  ink2:  colour('uiInk2'),
  dim:   colour('uiDim'),
  back:  colour('uiBack'),
  /* The player's own marker, in the divine-gold this codebase uses for anything
     meant to read as "look here". */
  mark:  colour('ichor'),
  /* The same three state colours `view/ui/mainPanel.js`'s logistics tab uses, by
     the same palette names. */
  good:  colour('uiGood'),
  warn:  colour('uiAmber'),
  bad:   colour('uiHeart')
};

/* Screen pixels per smallest band tile: integers, and powers of two so a band
   whose `tile` is a multiple of the smallest lands on whole pixels -- at level 4
   an 8 px tile is a 4 px cell. A non-multiple rounds, a pixel out at worst. */
export const MAP_ZOOM = Object.freeze([1, 2, 4, 8]);

/* The right edge the band ruler owns, and the top strip the header owns. Both
   are subtracted from the map body rather than drawn over it, so an indicator
   pinned to the body's top edge is not hidden underneath the header. */
const RULER_GAP = 4;
const HEADER_H = 12;

/* What the last draw actually used: `view`'s own scratch space, read back by
   `shell`'s pointer dispatcher, which has to invert this exact transform, and by
   the test hook. Nothing here bumps `model/epoch.js`. */
export const mapView = {
  active: false,
  zoom: 0, scale: 0,
  /* world px at the map viewport's top-left corner */
  wx: 0, wy: 0,
  /* the map viewport in screen px, which is the canvas minus the band ruler */
  vx: 0, vy: 0, vw: 0, vh: 0,
  /* the band union, the same one `shell/main.js#clampCam` reads */
  left: 0, top: 0, worldW: 0, worldH: 0
};

/* The band union, the same reading `shell/main.js#clampCam` takes: `bands[0]` is
   the top and the last band the bottom, since `data/world.js` declares them
   top-to-bottom. The horizontal extent is a min/max: bands differ in inset. */
function unionBox() {
  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const left = Math.min(...bands.map(b => b.origin.x));
  const right = Math.max(...bands.map(b => b.origin.x + widthPx(b)));
  return { left, top, w: right - left, h: last.origin.y + heightPx(last) - top };
}

const minTile = () => Math.min(...bands.map(b => b.tile));

/* The largest level whose world fits the viewport width, as closely as an
   integer scale permits, and the smallest level when nothing fits. The map is
   then depth-complete and width-windowed. */
export function defaultZoom(vw, box = unionBox(), T = minTile()) {
  let best = MAP_ZOOM[0];
  for (const k of MAP_ZOOM) if ((box.w * k) / T <= vw) best = k;
  return best;
}

/* One axis of the offset, in world px, given the room available. Mirrors
   `clampCam`: clamp to the world edges when the world is bigger than the room,
   centre it when it is smaller. */
function fit(want, lo, worldSpan, roomSpan) {
  if (worldSpan <= roomSpan) return lo - (roomSpan - worldSpan) / 2;
  return Math.max(lo, Math.min(want, lo + worldSpan - roomSpan));
}

/* The transform, derived fresh every frame and recorded in `mapView`. `m` is
   `f.ui.map`, handed over on the frame context. */
function transform(f) {
  const box = unionBox();
  const T = minTile();
  const vx = 0, vy = HEADER_H + 1;
  const vw = Math.max(1, f.W - rulerWidth() - 2 - RULER_GAP);
  const vh = Math.max(1, f.H - vy);
  const m = f.ui.map;
  const zoom = m.zoom || defaultZoom(vw, box, T);
  const scale = zoom / T;

  /* Follow centres on the player and then clamps; a manual scroll turns the
     toggle off and the stored offset is used instead. Both paths go through the
     same clamp, so neither can leave the world. */
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

/* The clamp, exposed: the same `fit` over the same `unionBox` the transform
   uses. `ui.map.x/y` is stored unclamped, so a pan seeds from the clamped
   position; before the first draw the offset returns unchanged. */
export function mapClamp(x, y) {
  if (!mapView.active || !(mapView.scale > 0)) return { x, y };
  const box = unionBox();
  return {
    x: fit(x, box.left, box.w, mapView.vw / mapView.scale),
    y: fit(y, box.top, box.h, mapView.vh / mapView.scale)
  };
}

/* And back again, for `shell`'s drag-to-scroll and hover: the pointer
   dispatcher must invert exactly this. */
export const mapWorldAt = (sx, sy) => ({
  x: mapView.wx + (sx - mapView.vx) / mapView.scale,
  y: mapView.wy + (sy - mapView.vy) / mapView.scale
});

/* `flags.showMap` freezes the run and swaps this in for the whole normal draw:
   no sky, no machines, no items, no walking sprite, no HUD. A full substitute
   frame rather than an overlay. */
export function drawOverview(g, f) {
  /* This pass owns the widget layer's scratch space: `view/hud.js#drawHUD` does
     not run here, and the recorded rects would otherwise accumulate for as long
     as the map stayed open. */
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
  /* The hover passes draw last, over the ruler and the legend both. */
  hoverPass(g, f, v);
}

/* Fog rules here as in play: an unrevealed tile draws nothing and the void shows
   through, and a revealed AIR tile draws nothing either. Row-run coalesced, with
   `tx <= tx1` walking a sentinel column past the edge so an open run flushes. */
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

/* What a tile byte paints, resolved once per byte. Keyed on the packed byte, of
   which there are 256, so this is a complete memo rather than a cache with a
   policy, and never invalidated: every input is a frozen `data/` row. */
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

/* The order these draw in is fixed here; the order they are listed in, for the
   legend and the digit keys, is `ui.map.layers`' own key order. Every layer
   filters on `seenAt` per drawn thing, because each layer's unit differs. */

function drawLayers(g, v, f) {
  const L = f.ui.map.layers;
  if (L.light) drawLight(g, v);
  if (L.ore) drawOre(g, v);
  if (L.piles) drawPiles(g, v);
  if (L.machines) drawMachines(g, v);
  if (L.chain) drawChain(g, v);
}

/* Light: which shafts are unlit, from `b.light`. Two alpha steps rather than the
   three `drawDarkness` uses, because at four screen pixels per tile the middle
   two are indistinguishable. Only over seen tiles, or the void takes a shape. */
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
   fully lit are different answers and both are 0 here. */
function darkStep(b, tx, ty, max) {
  if (!seenAt(b, tx, ty)) return 0;
  const l = lightAt(b, tx, ty) / max;
  return l >= 0.6 ? 0 : l >= 0.2 ? 0.3 : 0.62;
}

/* Ore, taken from the `metal` tag rather than any substance name. Marked at a
   floor of two pixels even at zoom level 1, where a tile is one pixel; the small
   bleed onto a neighbouring cell is the cost. */
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

/* Piles: dropped material bucketed by tile, drawn only where the count reaches a
   threshold. `items` is not indexed by band and the spatial grid answers "near
   this point" rather than "in this rect", so this walks the array. */
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
       block is a smudge. On its own backing rect, since the count sits beside
       the marker rather than inside it. */
    if (cell >= 4) {
      const s = String(p.n), tw = textWidth(s);
      g.globalAlpha = 0.72; R(g, x + cell, y - 2, tw + 2, 9, INK.back); g.globalAlpha = 1;
      drawText(g, s, x + cell + 1, y - 1, INK.ui, 1, 1);
    }
  }
}

/* Machines: one glyph each, `def.glyph` off the `data/machines.js` row, coloured
   by `view/ui/mainPanel.js#machineState` rather than a second query. Below about
   six pixels of footprint the glyph drops and the block carries the state. */
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

/* Two hover layers -- a machine's tooltip and a per-band summary -- of which the
   more specific wins. The pointer's screen position is `f.mouse.x - f.cam.x`,
   exact because the camera is frozen and rounded by the time this runs. */

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

/* Hit-tested in screen space against the same rect `drawMachines` drew, rather
   than by converting the pointer to a world tile: a 2x2 gear is four screen
   pixels at zoom 1 and the marker is deliberately bigger. One pixel of pad. */
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
   keyed by the pair string `model/items.js#keyOf` builds, so `parseKey` plus
   `shortLabelOf` makes rows without naming a substance. */
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

/* Which band the pointer is over, two ways in: over the ruler, whichever segment
   rect the ruler itself recorded, read back through its own `wy0`/`wy1`; over the
   map body, the band containing the world point under the cursor. */
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

/* A band's summary is a full scan of its `seen` and `light` arrays -- 40,960
   tiles for topsoil -- cached by mutation epoch. Nothing here writes, so the
   cache is exact; a `WeakMap` lets a new run's fresh records invalidate it. */
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
      /* Nothing here is withheld behind the mask because nothing here can leak:
         every figure is over tiles the player has already seen, so an unentered
         band reports 0% seen, no ore and no machines. */
      ['DEPTH ' + depthText(top) + ' - ' + depthText(bot),
       'SEEN  ' + pc(s.seen, s.total),
       'DARK  ' + pc(s.dark, s.seen)],
      ['MACHINES ' + s.mach + (s.stalled ? '  STALLED ' + s.stalled : ''),
       'ORE SEEN ' + s.ore]
    ],
    cx: sx, cy: sy, vw: f.W, vh: f.H
  });
}

/* Which slice of the world's width the body is showing, as a scrollbar along the
   bottom edge. Both rects carry their world range in `wx0`/`wx1` and neither
   records a `wy0`, so `bandAtScreen` cannot mistake a ribbon for a band. */
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

/* The visible tile window of one band, as `[tx0, tx1, ty0, ty1]`, shared by the
   four layers that need the identical cull. */
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

/* Lift chain, derived and never stored: `chains()` and `breaks()` are the
   queries. An open end is a hub anchoring one segment or none; a gap is a pair
   of open ends `linkCheck` would join now. `m.torque` is the drive this frame. */
const HUB = 3;

function drawChain(g, v) {
  /* Derived once per frame and passed down: three readers asking `breaks()`
     separately would walk the segment list three times for one answer. */
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

      for (const car of seg.carriers) {
        const c = carrierPos(seg, car);
        R(g, sxOf(v, c.x) - 1, syOf(v, c.y) - 1, 3, 3, driven ? INK.good : INK.ui);
      }
    }
    bracket(g, v, chain);
  }

  /* The hubs last, over their own cables, so a hub is never half a cable wide. A
     joined hub is a small solid pale box; an open end is a red ring around a
     dark centre, which reads at 5 px where a second solid colour would not. */
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

/* Every placed hub, and every hub that anchors 0 or 1 segments. Filters over the
   `model` queries rather than a cached list, which would go stale. */
const hubsPlaced = () => machines.filter(isHub);
const openHubs = () => [
  ...breaks(),
  ...hubsPlaced().filter(m => segmentsAt(m).length === 0)
];

/* Nearly always true, since a machine sits in a tile the player revealed to
   place it and `seen` is permanent. Checked anyway, for a machine that could
   arrive without the player beside it. */
const hubSeen = m => seenAt(m.band, m.tx, m.ty);

/* The gap: a red dashed cable exactly where the missing one would go. `linkCheck`
   is symmetric, so the inner loop starts past the outer one; O(k^2) over open
   ends, which is a handful even in a world full of cable. */
function gaps(g, v, open) {
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i], b = open[j];
      if (!hubSeen(a) || !hubSeen(b)) continue;
      if (!linkCheck(a, b).ok) continue;
      /* Two pixels wide, against the cable's one, so the gap is the boldest line
         in the frame at every zoom level. */
      dashTo(g, sxOf(v, a.box.x + a.box.w / 2), syOf(v, a.box.y + a.box.h / 2),
             sxOf(v, b.box.x + b.box.w / 2), syOf(v, b.box.y + b.box.h / 2),
             INK.bad, 3, 2, 2);
    }
  }
}

/* One chain's vertical extent, as a bracket down the left edge of the map body
   with its segment count beside it, for a chain whose ends are both off screen. */
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
  /* The count on its own backing rect and on the secondary body tone: a segment
     count is a quantity, not a status. The bracket rules themselves stay on
     `dim`, because they are geometry. */
  const s = String(chain.length);
  if (y1 - y0 >= 10) {
    const ty = ((y0 + y1) >> 1) - 3;
    g.globalAlpha = 0.72; R(g, x + 2, ty - 1, textWidth(s) + 2, 9, INK.back); g.globalAlpha = 1;
    drawText(g, s, x + 3, ty, INK.ink2, 1, 1);
  }
}

/* The player, always drawn, even off-screen: inside the viewport a fixed 3x3
   rather than scaled with the cell, which is one pixel at zoom level 1; outside
   it, a chevron pinned to the edge it left through. */
function drawPlayerMark(g, v) {
  if (!player.band) return;
  const c = playerCentre();
  const px = sxOf(v, c.x), py = syOf(v, c.y);

  if (py >= v.vy && py < v.vy + v.vh && px >= v.vx && px < v.vx + v.vw) {
    R(g, px - 1, py - 1, 3, 3, INK.mark);
    return;
  }

  /* Whichever axis the player is further outside decides the direction, so a
     corner reads as the axis that is more wrong, and the tip sits on the edge
     with the arrow widening inward. */
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

/* The header line: what the mode is and what the keys do. Drawn with `drawText`
   and never `fillText`. */
function header(g, f, v) {
  const bar = HEADER_H;
  R(g, 0, 0, f.W, bar, INK.back);
  R(g, 0, bar, f.W, 1, mix(INK.back, INK.dim, 0.6));

  /* Laid out by measuring, never by hardcoded origins: each field starts where
     the last ended, so a two-digit zoom pushes the rest along. */
  let x = 4;
  const put = (s, col) => { drawText(g, s, x, 2, col, 1, 1); x += textWidth(s) + 6; };
  put('OVERVIEW', INK.ui);
  put('X' + v.zoom, INK.ink2);
  /* FOLLOW is a state, so it is drawn as one: lit when on, dim when a manual
     scroll has turned it off. */
  put('FOLLOW', f.ui.map.follow ? INK.good : INK.dim);
  /* The key hints read as body text rather than a state, so `ink2`, and they sit
     on the header's solid strip, so neither takes a shadow. */
  put('WASD/DRAG SCROLL  -/+ ZOOM  F  1-9 LAYERS  O CLOSE', INK.ink2);
}

/* The rows are `ui.map.layers`' own key order, which `shell/input.js#mapDigit`
   indexes the same way, so the list and the key cannot drift. Bottom-left: the
   header owns the top strip and the ruler the right edge. */
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
