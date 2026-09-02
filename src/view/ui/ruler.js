/* LAYER view — THE BAND RULER. One widget, TWO CONTEXTS, built once and
   parameterised by height (docs/BUILD_PLAN.md Phase 9 section 3):

     the right edge of OVERVIEW mode   full height, band names, a footer
     the right edge of the NORMAL HUD  compact: the bar, the numerals and the
                                       player's marker, and nothing else

   The compact form is not a lesser version, it is D8's layout: the depth
   READOUT already owns top-right with the boon timer stack under it, so a
   second depth figure and a second band name in the HUD would be two panels
   restating one fact. The ruler is the right EDGE, vertical, and it does not
   collide with them -- `view/hud.js` anchors it below whatever the top-right
   cluster actually drew rather than at a hardcoded y (D8: "panels are
   positioned by an anchored layout pass over measured text, never by
   hardcoded pixel origins").

   Imports `core`, `data` and READ-ONLY `model` queries, plus `./state.js`.
   Registers what it drew, so `shell` can hit-test a click on a band segment
   and jump the overview to it -- `view` never dispatches (CLAUDE.md D2).

   ============================================================================
   THE MASKED-ID PREDICATE LIVES HERE, AND THIS IS THE ONE PLACE IT LIVES.
   Nothing in `src/` masked anything before Phase 9 -- there was no FAVOUR
   panel, no TRIBUTE state and no `????????` rule anywhere. CLAUDE.md D8 says
   whichever phase lands the band ruler writes that predicate and the FAVOUR
   panel reuses it, not the other way round. So:

     `masked(label, known)`  the mask itself: the label, or `????????`
     `bandKnown(b)`          has the player ever ENTERED this band, OR has a
                             cycle reward CHARTED it for them (Phase 10b,
                             docs/PLAN-phase10.md 3.4/D-D)

   A future cycle-director phase's FAVOUR panel should import `masked` from
   this file (same-layer imports are legal) rather than write a second one.
   The cycle director landed in Phase 10b; the FAVOUR panel itself is
   Phase 10c and should still reuse this `masked`, not write a second one.
   ============================================================================

   THE DEPTH DATUM DOES NOT MOVE (CLAUDE.md D9). Depth is measured from the
   SPAWN band's own `floorTy`, the identical datum `view/hud.js#depth` and
   `data/machines.js`'s `minDepth` placement rule both read, specifically so
   the gauge and placement legality can never disagree. 0 M stays the spawn
   floor and the astral band reads as ABOVE it; nothing here introduces a
   second zero. */

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

/* The coloured bar's own width. Deliberately NARROW: an 8 px bar could not fit
   'III' inside it and the numerals clipped off the right edge of the canvas on
   the first render of this widget, which is the D8 failure mode ("FAVOUR's
   HEPHAESTUS overruns its frame") reproduced immediately. So the bar is a bar
   and the numerals sit BESIDE it, in a column sized from MEASURED text rather
   than from a guess -- `rulerWidth()` below is what a caller reserves. */
export const RULER_W = 6;

/* Bar plus the numeral column, measured. Whatever the widest numeral in this
   world actually is, that is how much room the widget needs; a fourth band
   costs this no edit. */
export function rulerWidth() {
  let w = 0;
  for (const b of bands) w = Math.max(w, textWidth(roman(b.ord)));
  return RULER_W + 2 + w;
}

/* ---------- the mask ----------
   Eight question marks, a fixed width regardless of the name behind it, which
   is the whole point: a mask whose LENGTH leaked the name's length would leak
   the name. */
export const MASK = '????????';
export const masked = (label, known) => (known ? label : MASK);

/* ---------- has the player ever entered this band ----------
   Derived, never stored -- there is no `enteredBands` field and adding one
   would be a second source of truth for something `b.seen` already answers.
   Two clauses, and both are needed:

     the player is IN it        true the frame they cross the seam, before
                                `rules/reveal.js` has run for the new band
     any tile of it is REVEALED which is permanent and one-way, so knowledge
                                of a band, like knowledge of a tile, never
                                goes back

   Cached in a `WeakSet` because `seen` only ever gains bits: once true this is
   true for the rest of the run, and a new run allocates NEW band records
   (`model/world.js#write.allocate`), so the cache invalidates itself with no
   reset call and no way for it to survive a restart (invariant 8). Until a
   band qualifies the scan runs every frame -- 3,840 `seenAt` calls for the
   astral band, which is the only one that stays unknown for long. */
const knownBands = new WeakSet();

export function bandKnown(b) {
  if (!b) return false;
  if (knownBands.has(b)) return true;
  if (b === player.band) { knownBands.add(b); return true; }
  /* CHARTING IS KNOWLEDGE, NOT ACCESS (docs/PLAN-phase10.md 3.4/D-D): a cycle
     reward's `charts:[bandId]` (`run.charted`, written by `rules/cycles.js`
     via `write.chart`) takes the mask off a band's NAME alone, same as
     actually having stood in it -- it does not gate digging into that band,
     which nothing in this game does. Checked by id, since `run.charted` holds
     ids and this cache is keyed on the band RECORD. */
  if (run.charted.includes(b.id)) { knownBands.add(b); return true; }
  for (let ty = 0; ty < b.th; ty++)
    for (let tx = 0; tx < b.tw; tx++)
      if (seenAt(b, tx, ty)) { knownBands.add(b); return true; }
  return false;
}

/* ---------- depth ----------
   The SAME arithmetic `view/hud.js#depth` performs, and the same text form
   ('+32M' above the datum), so the two readouts cannot drift on either the
   datum or the sign convention. */
export function depthDatum() {
  const ref = bandOf(SPAWN_BAND);
  return ref ? { datum: worldY(ref, ref.cfg.floorTy ?? 0), tile: ref.tile } : null;
}

export function depthAt(wy) {
  const d = depthDatum();
  return d ? Math.round((wy - d.datum) / d.tile) : 0;
}

export const depthText = d => (d >= 0 ? d : '+' + -d) + 'M';

/* ---------- roman numerals ----------
   Depth rank, from the band's own ordinal, which `data/world.js` states IS
   declaration order and therefore IS top-to-bottom. Small by construction --
   a world of more than a dozen bands is not a thing this game has -- so the
   table is a table and not an algorithm. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
               'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
export const roman = n => ROMAN[n] || String(n + 1);

/* ---------- the widget ----------
   `opts`: { id, x, y, h, vw, vh, labels? }
     x     LEFT edge of the coloured bar. Labels are drawn to its left.
     h     total height of the bar; band segments divide it in proportion to
           each band's own height in world PIXELS, so the ruler is a true
           linear scale of the world and the marker's position on it is the
           player's real depth rather than a per-band fraction.
     labels  overview mode: band names and the footer. The HUD passes false.

   Returns `{ x, y, w, h, segs }`. */
export function drawRuler(g, opts) {
  const { id = 'ruler', x, y, vw, vh, labels = false } = opts;
  const h = Math.max(8, Math.min(opts.h | 0, vh - y - 2));
  if (!bands.length) return { x, y, w: RULER_W, h, segs: [] };

  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const worldH = Math.max(1, last.origin.y + heightPx(last) - top);
  const yOf = wy => y + Math.round(((wy - top) / worldH) * h);

  /* The bar's own well, so a band whose tint is nearly the void still reads as
     a segment of something rather than as a hole. */
  R(g, x - 1, y - 1, RULER_W + 2, h + 2, mix(BACK, DIM, 0.35));
  R(g, x, y, RULER_W, h, BACK);

  const segs = [];
  for (const b of bands) {
    const y0 = yOf(b.origin.y);
    const y1 = yOf(b.origin.y + heightPx(b));
    const sh = Math.max(2, y1 - y0);
    const known = bandKnown(b);
    /* Content decides a band's colour: its own `look.tint`, which is the
       "what the rock below is made of" name `view/scene.js#skyRamp` already
       reads. An UNKNOWN band is the same colour pulled most of the way to the
       panel back, so the ruler says "there is something there and you have not
       been" in colour as well as in text. */
    const tint = colour(b.cfg.look?.tint ?? 'irC');
    R(g, x, y0, RULER_W, sh, known ? tint : mix(BACK, tint, 0.22));
    /* A seam line, so two adjacent bands of similar tint still read as two. */
    R(g, x, y0, RULER_W, 1, mix(BACK, INK, 0.45));

    /* THE NUMERAL SITS BESIDE THE BAR, not in it: 'III' is 17 px of 5x7 font
       and the bar is 6. Right-aligned so a one- and a three-character numeral
       share an edge rather than a centre, which is what keeps the column
       reading as a column. */
    const num = roman(b.ord);
    const nx = x + RULER_W + 2;
    const ny = y0 + Math.max(0, Math.min(sh - 8, (sh >> 1) - 3));
    if (sh >= 8) drawText(g, num, nx, ny, known ? INK : DIM, 1, 1);

    /* THE RECT CARRIES THE BAND'S WORLD RANGE WITH IT (`wy0`/`wy1`, world px).
       `shell` hit-tests this rect and jumps the overview to the band, and it
       must not have to re-derive which band a rect belongs to from its `id`
       string or re-read `bands` to find the extent -- `view` reports what it
       drew, including WHERE in the world it drew it from, and `shell` decides
       what a click on it means (CLAUDE.md D2). Two readers, one number. */
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

/* THE SLIDING MARKER: the player's own world-y on the same linear scale the
   segments were laid out on, with a barb pointing INTO the bar from the left
   so it is legible over any tint. Clamped to the bar's own ends rather than
   allowed to slide off it -- the bar covers the whole world, so out of range
   can only mean a rounding pixel at an edge. */
function playerMarker(g, x, y, h, yOf, vw) {
  if (!player.band) return;
  const my = Math.max(y, Math.min(yOf(player.y), y + h - 1));
  R(g, x - 1, my, RULER_W + 2, 1, MARK);
  for (let i = 0; i < 3; i++) {
    const bx = x - 2 - i;
    if (bx >= 0 && bx < vw) R(g, bx, my - i, 1, 1 + i * 2, MARK);
  }
}

/* THE FOOTER, overview only: where you are, in the two words that answer it.
   Right-aligned to the bar so it hangs off the same edge, and clamped to the
   viewport for the reason every other panel in this directory is -- a readout
   drawn off the edge at a narrow base buffer is a readout nobody reads. */
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
