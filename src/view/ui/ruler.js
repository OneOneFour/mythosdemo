/* view layer — the band ruler, one widget in two contexts parameterised by
   height: the right edge of overview mode gets full height, band names and a
   footer, while the right edge of the normal HUD gets the bar, the numerals and
   the player's marker only. `view/hud.js` anchors it below whatever the
   top-right cluster actually drew, and it registers what it drew so `shell`
   can hit-test a band segment.

   `masked(label, known)` and `bandKnown(b)` live here and are the only copies.

   Depth is measured from the spawn band's own `floorTy`, the same datum
   `view/hud.js#depth` and `data/machines.js`'s `minDepth` read. 0 M is the
   spawn floor and the astral band reads as above it. */

import { drawText, textWidth } from '../../core/font.js';
import { mix } from '../../core/palette.js';
import { R } from '../../core/pixels.js';
import { colour } from '../../data/palette.js';
import { SPAWN_BAND } from '../../data/world.js';
import { player } from '../../model/player.js';
import { run } from '../../model/run.js';
import { bandOf, bands, heightPx, seenAt, worldY } from '../../model/world.js';
import { drawn } from './state.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');
const MARK = colour('ichor');

/* The coloured bar's own width. Narrow on purpose: 'III' does not fit inside
   it, so the numerals sit beside it in a column sized from measured text.
   `rulerWidth()` below is what a caller reserves. */
export const RULER_W = 6;

/* Bar plus the numeral column, measured, so a fourth band costs no edit. */
export function rulerWidth() {
  let w = 0;
  for (const b of bands) w = Math.max(w, textWidth(roman(b.ord)));
  return RULER_W + 2 + w;
}

/* A fixed width regardless of the name behind it: a mask whose length varied
   would leak the name's length. */
export const MASK = '????????';
export const masked = (label, known) => (known ? label : MASK);

/* Cached in a `WeakSet` because `seen` only ever gains bits, and because a new
   run allocates new band records, so the cache invalidates itself with no reset
   call. Until a band qualifies the scan below runs every frame. */
const knownBands = new WeakSet();

export function bandKnown(b) {
  if (!b) return false;
  if (knownBands.has(b)) return true;
  if (b === player.band) { knownBands.add(b); return true; }
  /* A cycle reward's `charts:[bandId]` takes the mask off a band's name alone
     and gates nothing. Checked by id, since `run.charted` holds ids while this
     cache is keyed on the band record. */
  if (run.charted.includes(b.id)) { knownBands.add(b); return true; }
  for (let ty = 0; ty < b.th; ty++)
    for (let tx = 0; tx < b.tw; tx++)
      if (seenAt(b, tx, ty)) { knownBands.add(b); return true; }
  return false;
}

/* The same arithmetic and text form ('+32M' above the datum) as
   `view/hud.js#depth`, so the two readouts cannot drift. */
export function depthDatum() {
  const ref = bandOf(SPAWN_BAND);
  return ref ? { datum: worldY(ref, ref.cfg.floorTy ?? 0), tile: ref.tile } : null;
}

export function depthAt(wy) {
  const d = depthDatum();
  return d ? Math.round((wy - d.datum) / d.tile) : 0;
}

export const depthText = d => (d >= 0 ? d : '+' + -d) + 'M';

/* Depth rank from the band's own ordinal, which is declaration order in
   `data/world.js` and therefore top to bottom. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
               'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
export const roman = n => ROMAN[n] || String(n + 1);

/* `x` is the left edge of the coloured bar and labels draw to its left. `h` is
   divided between bands in proportion to each band's height in world px, so
   the marker sits at real depth rather than at a per-band fraction. */
export function drawRuler(g, opts) {
  const { id = 'ruler', x, y, vw, vh, labels = false } = opts;
  const h = Math.max(8, Math.min(opts.h | 0, vh - y - 2));
  if (!bands.length) return { x, y, w: RULER_W, h, segs: [] };

  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const worldH = Math.max(1, last.origin.y + heightPx(last) - top);
  const yOf = wy => y + Math.round(((wy - top) / worldH) * h);

  /* The bar's own well, so a band tinted close to the void still reads as a
     segment rather than as a hole. */
  R(g, x - 1, y - 1, RULER_W + 2, h + 2, mix(BACK, DIM, 0.35));
  R(g, x, y, RULER_W, h, BACK);

  const segs = [];
  for (const b of bands) {
    const y0 = yOf(b.origin.y);
    const y1 = yOf(b.origin.y + heightPx(b));
    const sh = Math.max(2, y1 - y0);
    const known = bandKnown(b);
    /* A band's colour is its own `look.tint`, the name `view/scene.js#skyRamp`
       also reads; an unknown band is that tint pulled most of the way to the
       panel back. */
    const tint = colour(b.cfg.look?.tint ?? 'irC');
    R(g, x, y0, RULER_W, sh, known ? tint : mix(BACK, tint, 0.22));
    /* A seam line, so two adjacent bands of similar tint still read as two. */
    R(g, x, y0, RULER_W, 1, mix(BACK, INK, 0.45));

    /* The numeral sits beside the bar, not in it: 'III' is 17 px of the 5x7
       font and the bar is 6. Right-aligned so numerals of different lengths
       share an edge. */
    const num = roman(b.ord);
    const nx = x + RULER_W + 2;
    const ny = y0 + Math.max(0, Math.min(sh - 8, (sh >> 1) - 3));
    if (sh >= 8) drawText(g, num, nx, ny, known ? INK : DIM, 1, 1);

    /* `wy0`/`wy1` are the band's world-px range, carried on the rect so `shell`
       need not re-derive the extent from the `id` string. */
    const rect = { id: id + '-band-' + b.id, x, y: y0, w: RULER_W, h: sh, title: num,
                   wy0: b.origin.y, wy1: b.origin.y + heightPx(b) };
    drawn.panels.push(rect);
    segs.push(rect);

    if (!labels) continue;
    const name = masked(b.name, known);
    const tw = textWidth(name);
    const lx = Math.max(2, x - 4 - tw);
    const ly = y0 + Math.max(0, (sh >> 1) - 3);
    g.globalAlpha = 0.72; R(g, lx - 2, ly - 1, tw + 4, 9, BACK); g.globalAlpha = 1;
    drawText(g, name, lx, ly, known ? INK : DIM, 1, 1);
  }

  playerMarker(g, x, y, h, yOf, vw);
  if (labels) footer(g, x, y + h, vw, vh);

  return { x, y, w: rulerWidth(), h, segs };
}

/* The player's own world-y on the same linear scale the segments were laid out
   on, with a barb pointing into the bar from the left. Clamped to the bar's
   ends: the bar covers the whole world. */
function playerMarker(g, x, y, h, yOf, vw) {
  if (!player.band) return;
  const my = Math.max(y, Math.min(yOf(player.y), y + h - 1));
  R(g, x - 1, my, RULER_W + 2, 1, MARK);
  for (let i = 0; i < 3; i++) {
    const bx = x - 2 - i;
    if (bx >= 0 && bx < vw) R(g, bx, my - i, 1, 1 + i * 2, MARK);
  }
}

/* Overview only: depth and band name, right-aligned to the bar's edge and
   clamped to the viewport. */
function footer(g, x, y, vw, vh) {
  const b = player.band;
  const d = depthText(depthAt(player.y));
  const name = b ? masked(b.name, bandKnown(b)) : '-';
  const text = d + ' ' + name;
  const w = textWidth(text) + 6;
  const fx = Math.max(2, Math.min(x + rulerWidth() - w, vw - w - 2));
  const fy = Math.min(y + 3, vh - 12);
  g.globalAlpha = 0.82; R(g, fx, fy, w, 11, BACK); g.globalAlpha = 1;
  R(g, fx, fy, w, 1, mix(BACK, DIM, 0.6));
  drawText(g, text, fx + 3, fy + 2, INK, 1, 1);
}
