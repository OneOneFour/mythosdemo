/* rules layer — line of sight. A revealed tile is never re-hidden —
   `write.reveal` has no opposite — so the only decision here is which bits to
   set.

   `passA`, open sky: unbounded and reads no tunable, so a clear shot out of the
   world reveals every column of the band sharing it. `passB`, underground: a
   4-directional flood through open tiles, blocked by rock and capped at a graph
   distance, seeded at distance 0 by the player's own tiles. Past distance 1 the
   flood enqueues a tile only if it is lit, though it reveals it either way.

   Both passes walk every tile the 6x16 px hitbox overlaps; one point would
   leave a foot or a head a tile short. */

import { eff } from '../model/mods.js';
import { player, playerBox } from '../model/player.js';
import { solidAt, worldSkyAt } from '../model/tiles.js';
import { bandAbove, bandSpans, chunkOf, chunkVer, inBounds, lightAt,
         write as ww } from '../model/world.js';

/* Throttle cache for `passB`, keyed by the band object:
   `model/world.js#write.allocate` hands out a fresh record per run, so a
   restart is already a miss and there is no reset call to wire up. Nulled on
   the no-band path below so a dead record is never held. */
let lastBand = null, lastKey = NaN, lastVer = NaN;

/* `passA`'s cache, same shape: the chunk-version sum the last full sky scan
   ran against. */
const skylineVer = new WeakMap();

/* Walks every band the hitbox overlaps rather than `player.band` alone: a
   player whose head is in the band above has a negative band-local `ty` there,
   which `model/world.js#inBounds` rejects silently. */
export function step() {
  const b = player.band;
  if (!b) { lastBand = null; return; }           // no world yet

  const box = playerBox();
  const spans = bandSpans(box.x, box.y, box.w, box.h);
  if (!spans.length) { lastBand = null; return; }

  for (const s of spans) passA(s.b, s.tx0, s.ty0, s.tx1, s.ty1);
  passB(b, spans);
}

/* Gated on `worldSkyAt` over the player's own tiles first, so a player
   underground never pays for the band-wide pass. The gate asks about the whole
   world, not this band's grid, whose row 0 may itself be buried. */
function passA(b, tx0, ty0, tx1, ty1) {
  let exposed = false;
  for (let ty = ty0; ty <= ty1 && !exposed; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      if (worldSkyAt(b, tx, ty)) { exposed = true; break; }
  if (!exposed) return;

  /* At most once per terrain change: the scan is O(band width) and monotone,
     so re-running it against an unchanged grid reveals nothing. The sum covers
     every chunk of this band and of every band above — a tile broken above can
     open a column to daylight without touching a chunk version here. */
  let verSum = 0;
  for (let up = b; up; up = bandAbove(up))
    for (let i = 0; i < up.ver.length; i++) verSum += up.ver[i];
  if (skylineVer.get(b) === verSum) return;
  skylineVer.set(b, verSum);

  /* One `worldSkyAt` per column at row 0 rather than per tile, which walks the
     column on every call. Reveal, then test solid, in that order: the ground
     you stand on has nothing solid above it and must be revealed too. */
  for (let tx = 0; tx < b.tw; tx++) {
    if (!worldSkyAt(b, tx, 0)) continue;
    for (let ty = 0; ty < b.th; ty++) {
      ww.reveal(b, tx, ty);
      if (solidAt(b, tx, ty)) break;
    }
  }
}

/* Throttled on a key folding in the chunk versions around the player plus
   `b.lightVer`, not position alone: digging sideways while standing still is a
   world change. `home` keys by object identity, so a restart is a miss. */
function passB(home, spans) {
  let ver = 0, key = 0;
  for (const s of spans) {
    const b = s.b;
    const c0 = chunkOf(b, s.tx0, s.ty0), c1 = chunkOf(b, s.tx1, s.ty1);
    for (let cy = c0.cy - 1; cy <= c1.cy + 1; cy++)
      for (let cx = c0.cx - 1; cx <= c1.cx + 1; cx++)
        if (cx >= 0 && cx < b.cx && cy >= 0 && cy < b.cy) ver += chunkVer(b, cx, cy);
    ver += b.lightVer;
    key = (key * 131 + b.ord * 8191 + s.tx0 * 977 + s.ty0 * 37 + s.tx1 * 13 + s.ty1) | 0;
  }

  if (home === lastBand && key === lastKey && ver === lastVer) return;
  lastBand = home; lastKey = key; lastVer = ver;

  for (const s of spans) flood(s.b, s.tx0, s.ty0, s.tx1, s.ty1);
}

function flood(b, tx0, ty0, tx1, ty1) {
  const radius = eff('sightRadius');
  const key = (tx, ty) => ty * b.tw + tx;
  const seen = new Set();
  const queue = [];

  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      ww.reveal(b, tx, ty);
      const k = key(tx, ty);
      if (!seen.has(k)) { seen.add(k); queue.push({ tx, ty, d: 0 }); }
    }

  let head = 0;
  while (head < queue.length) {
    const { tx, ty, d } = queue[head++];
    if (d >= radius) continue;
    const neigh = [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1]];
    for (const [nx, ny] of neigh) {
      if (!inBounds(b, nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      ww.reveal(b, nx, ny);                     // the wall you're facing, too
      if (solidAt(b, nx, ny)) continue;          // but sight stops at rock
      /* Past the always-revealed first ring the flood may not continue into a
         tile with no light this substep, or standing in an unlit cavern would
         map it one graph hop at a time. */
      if (d >= 1 && lightAt(b, nx, ny) < 1) continue;
      queue.push({ tx: nx, ty: ny, d: d + 1 });
    }
  }
}
