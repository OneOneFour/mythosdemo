/* LAYER rules — REVEAL: line of sight, once a frame. Imports `model` only,
   plus `model/mods.js` as the one legal door to a tunable. Imports no other
   `rules` module.

   A TILE, ONCE REVEALED, IS NEVER RE-HIDDEN. The storage enforces that --
   `write.reveal` has no opposite -- so this file's only job is deciding WHICH
   bits to set. Two independent passes:

     PASS A  open sky. UNBOUNDED and reads no tunable: nothing obstructs a
             view across open air, so a clear shot out of the WORLD reveals
             every column of the band sharing that shot, not a radius.
     PASS B  underground. A flood through open tiles, blocked by rock, capped
             at a GRAPH distance. The player's own tiles seed it at distance
             0, so a fully solid dead end still reveals its neighbours.

   The flood must not walk through UNLIT air, or a player could map a
   pitch-black cavern by standing in it. Past distance 1 a tile is enqueued
   only if it is lit; it is still REVEALED regardless.

   OCCUPIED TILES, NOT ONE POINT. The hitbox is 6x16 px in an 8 px tile and
   need not be aligned, so both passes walk every tile its bounding rectangle
   overlaps. A single point would leave a foot or a head one tile short. */

import { eff } from '../model/mods.js';
import { player, playerBox } from '../model/player.js';
import { solidAt, worldSkyAt } from '../model/tiles.js';
import { bandAbove, bandSpans, chunkOf, chunkVer, inBounds, lightAt,
         write as ww } from '../model/world.js';

/* Perf-only cache for Pass B, MODULE-LOCAL AND DELIBERATELY NOT IN `model/`:
   keyed by the band
   OBJECT, and `model/world.js#write.allocate` always hands out a fresh one, so
   `b === lastBand` is already false the instant a run restarts, with no reset
   call to wire up or forget. Reset to `null` on the early-return-no-band path
   below too, so a band going away mid-frame (there is no such path today, but
   nothing here should rely on that) can't leave a stale reference pointing at
   a dead one. */
let lastBand = null, lastKey = NaN, lastVer = NaN;

/* Pass A's own cache, same shape and same reason: the band OBJECT keys it, so
   a restart is already a miss. It holds the chunk-version sum the last full
   sky scan ran against -- see `passA`. */
const skylineVer = new WeakMap();

/* EVERY BAND THE HITBOX OVERLAPS, never `player.band` alone. A player whose
   feet are in `topsoil` and whose head is in `surface` has a `player.band` of
   `topsoil` and a `tileY(topsoil, ...)` of -1 for the head rows, which
   `model/world.js#inBounds` rejects without saying so -- so the tiles the
   player is standing in went unrevealed and `view/scene.js#drawFog` painted
   over half the sprite. */
export function step() {
  const b = player.band;
  if (!b) { lastBand = null; return; }           // no world yet; never in play

  const box = playerBox();
  const spans = bandSpans(box.x, box.y, box.w, box.h);
  if (!spans.length) { lastBand = null; return; }

  for (const s of spans) passA(s.b, s.tx0, s.ty0, s.tx1, s.ty1);
  passB(b, spans);
}

/* Gated on a CHEAP check first: `worldSkyAt` on the player's own occupied
   tiles only, so a player underground never pays for the band-wide pass.

   THE GATE ASKS ABOUT THE WORLD, not this band's own grid. `skyExposedAt`
   stops at row 0 of whatever band it was handed, and `topsoil`'s row 0 is
   buried under 28 rows of surface rock -- so a player 38 tiles down their own
   shaft satisfied it and un-fogged a whole band width of unseen rock. */
function passA(b, tx0, ty0, tx1, ty1) {
  let exposed = false;
  for (let ty = ty0; ty <= ty1 && !exposed; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      if (worldSkyAt(b, tx, ty)) { exposed = true; break; }
  if (!exposed) return;

  /* THEN RUN THE SCAN AT MOST ONCE PER TERRAIN CHANGE, not once per frame.
     It is O(band width) and MONOTONE, so re-running against an unchanged grid
     reveals nothing new. `b.ver` summed over every chunk of the WHOLE band,
     because a shaft dug anywhere lengthens that column's scan, and the player
     walking into sunlight is NOT a reason to rerun.

     EVERY BAND ABOVE THIS ONE IS IN THE SUM TOO, because a tile broken in
     `surface` can open a `topsoil` column to daylight without touching one
     `topsoil` chunk version. A throttle and NOT a radius cull: Pass A's
     contract is that open air obstructs nothing. */
  let verSum = 0;
  for (let up = b; up; up = bandAbove(up))
    for (let i = 0; i < up.ver.length; i++) verSum += up.ver[i];
  if (skylineVer.get(b) === verSum) return;
  skylineVer.set(b, verSum);

  /* THE WHOLE POINT: reveal the band's entire sky-exposed silhouette, not just
     where the player stands. ONE `worldSkyAt` PER COLUMN, at row 0, the
     cheapest row to ask about -- never per TILE, which walks the column every
     call and is close to quadratic over a band as deep as `topsoil`.

     Then walk DOWN from row 0 and stop AFTER the first solid tile. REVEAL,
     THEN CHECK SOLID, in that order: the ground you stand on has nothing
     solid above it and must be revealed too, or the walkable surface stays
     fogged under fully lit air. Only what is BENEATH it is obstructed. */
  for (let tx = 0; tx < b.tw; tx++) {
    if (!worldSkyAt(b, tx, 0)) continue;
    for (let ty = 0; ty < b.th; ty++) {
      ww.reveal(b, tx, ty);
      if (solidAt(b, tx, ty)) break;
    }
  }
}

/* A 4-directional flood through non-solid neighbours up to a maximum GRAPH
   distance -- not a straight-line radius, and deliberately not shadowcasting.
   Past distance 0 a SOLID tile is revealed but the flood stops there.

   THROTTLED, BUT NOT ON PLAYER POSITION ALONE: standing still and digging
   SIDEWAYS is ordinary, and the newly opened tile is a WORLD change. So the
   key folds in a CHUNK VERSION over the player's chunk plus its neighbours,
   and `b.lightVer` too. `home` is in the key BY OBJECT IDENTITY, so a
   restart's fresh records make it stale. */
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
      /* Past the always-revealed first ring (d === 0 -> d + 1 === 1), the
         flood may not continue into a tile with no light reaching it AT ALL
         this frame -- otherwise standing in a pitch-black cavern would still
         map the whole thing, one graph-hop at a time. */
      if (d >= 1 && lightAt(b, nx, ny) < 1) continue;
      queue.push({ tx: nx, ty: ny, d: d + 1 });
    }
  }
}
