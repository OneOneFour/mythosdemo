/* LAYER rules — REVEAL: line of sight, once a frame. Imports `model` only (no
   `core` or `data` directly -- `model/mods.js` is the one exception, since
   that is the only legal door to a tunable). Imports no other `rules` module.

   ============================================================================
   A TILE, ONCE REVEALED, IS NEVER RE-HIDDEN. That has not changed and does not
   change here. The product decision this file exists to implement is memory,
   not a shrinking light radius, so this only ever SETS a bit in
   `model/world.js#seen` and never clears one. The storage already enforces
   the permanence -- `write.reveal` has no opposite -- so this file's only job
   is deciding WHICH bits to set, once a frame. WHAT changed is the answer to
   that question: it used to be "the player's own tile and its 4 neighbours,
   always" (radius 1, no line of sight at all); it is now real sight, split
   into two independent passes because a single algorithm covering both would
   be a full recursive-shadowcasting field-of-view implementation, and that is
   overkill for the confirmed brief ("see everything on an open surface,
   somewhat into a cavern") -- two cheap, separately-understandable passes
   read as simpler and are simpler, not merely simpler-looking.

     PASS A -- open sky. Unbounded. "Down is free, up is expensive" says
     nothing about sight, and there is nothing to obstruct a view across open
     air, so standing anywhere with a clear shot to the top of the band's own
     grid reveals the WHOLE sky-exposed silhouette of that band, not a radius
     around the player.

     PASS B -- underground. Bounded. A flood-fill through open tiles, blocked
     by solid rock, capped at a graph distance (`eff('sightRadius')`,
     `data/tuning.js`) -- "light spreads through open air, blocked by solid
     rock" is a deliberately simple stand-in for real line of sight, not an
     approximation of shadowcasting. This is also what SUBSUMES the old
     radius-1 rule: the player's own occupied tiles are always seeded into the
     flood at distance 0, so "reveal here and the tiles right next to it"
     still happens even in a fully solid dead end, exactly as before.

   Both passes only ever call `model/world.js#write.reveal`.
   ============================================================================

   OCCUPIED TILES, NOT ONE POINT. The player's hitbox (`PW`x`PH`, `model/
   player.js`) is 6x16 px in an 8 px tile -- 16 px is exactly two rows when the
   box happens to be tile-aligned, but it need not be, so this walks every tile
   the box's bounding rectangle actually overlaps (2 tiles most of the time, up
   to 4 while straddling a seam on both axes) rather than sampling one centre
   point. A single point would quietly shrink the seeded patch to follow the
   player's waist and leave a foot or a head one tile short of what "standing
   here" should mean. */

import { eff } from '../model/mods.js';
import { player, playerBox } from '../model/player.js';
import { skyExposedAt, solidAt } from '../model/tiles.js';
import { chunkOf, chunkVer, inBounds, tileX, tileY, write as ww } from '../model/world.js';

/* Perf-only cache for Pass B, MODULE-LOCAL AND DELIBERATELY NOT IN `model/`:
   nothing outside this file reads it, it carries no gameplay meaning, and it
   does not need to survive `newRun()` for correctness -- `model/world.js#
   write.allocate` always hands out a fresh band object, so `b === lastBand`
   is already false the instant a run restarts, with no reset call to wire up
   or forget. Reset to `null` on the early-return-no-band path below too, so a
   band going away mid-frame (there is no such path today, but nothing here
   should rely on that) can't leave a stale reference pointing at a dead one. */
let lastBand = null, lastTx0 = NaN, lastTy0 = NaN, lastTx1 = NaN, lastTy1 = NaN, lastVer = NaN;

export function step() {
  const b = player.band;
  if (!b) { lastBand = null; return; }           // no world yet; never in play

  const box = playerBox();
  const tx0 = tileX(b, box.x), tx1 = tileX(b, box.x + box.w - 1);
  const ty0 = tileY(b, box.y), ty1 = tileY(b, box.y + box.h - 1);

  passA(b, tx0, ty0, tx1, ty1);
  passB(b, tx0, ty0, tx1, ty1);
}

/* ---------- Pass A: unlimited sky reveal ----------
   Gated on a CHEAP check first: `skyExposedAt` on the player's own occupied
   tiles only (at most the 2-4 columns/rows the hitbox actually straddles),
   which is the same one-tile-at-a-time cost `view/paint.js` already pays for
   a grass cap. Only if that says "yes, standing under open sky" does this pay
   for the band-wide pass below -- a player underground, the common case,
   never reaches it at all. */
function passA(b, tx0, ty0, tx1, ty1) {
  let exposed = false;
  for (let ty = ty0; ty <= ty1 && !exposed; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      if (skyExposedAt(b, tx, ty)) { exposed = true; break; }
  if (!exposed) return;

  /* THE WHOLE POINT: reveal the band's entire sky-exposed silhouette, not
     just where the player stands. Never call `skyExposedAt` per tile here --
     it walks from a tile all the way up to row 0 EVERY call, so doing that
     for every tile of a 128x320 band would be close to quadratic and far too
     slow to run every frame. Instead walk DOWN from row 0 once per column and
     stop AFTER the first solid tile -- the identical fact `skyExposedAt`
     checks ("a clear vertical path to the top of the band's own grid" for
     everything ABOVE a tile, which says nothing about that tile's own
     solidity), computed once per column instead of once per tile. REVEAL,
     THEN CHECK SOLID, in that order: the ground you are standing on -- the
     first solid tile a column hits -- IS sky-exposed by this exact
     definition (nothing above IT is solid) and must be revealed too, or the
     visible, walkable surface would stay fogged everywhere except the
     handful of tiles Pass B's flood already reaches around the player, while
     the open air above it was fully lit -- a floating-sky-over-a-dark-strip
     bug this project's own screenshots caught. Only what is BENEATH that
     first solid tile is genuinely obstructed, so the loop stops there. Total
     cost of a full scan is bounded by the number of tiles actually revealed
     (typically a shallow surface skin) plus one solidity check per column,
     never by band area. */
  for (let tx = 0; tx < b.tw; tx++)
    for (let ty = 0; ty < b.th; ty++) {
      ww.reveal(b, tx, ty);
      if (solidAt(b, tx, ty)) break;
    }
}

/* ---------- Pass B: bounded local sight ----------
   A flood-fill through non-solid neighbours, 4-directional, up to a maximum
   GRAPH distance -- not a straight-line radius, and deliberately not true
   shadowcasting/raycasting; that was considered and rejected as overkill for
   "somewhat visible, not the whole cavern". The player's own occupied tiles
   seed the flood at distance 0 and are always revealed along with their
   immediate neighbours regardless of solidity, which is exactly the old
   radius-1 rule and is why this subsumes it outright. Past distance 0, a
   SOLID tile is revealed (you can see the wall you are facing) but the flood
   does not continue through it -- light stops at rock.

   PERF: THROTTLED, BUT NOT ON PLAYER POSITION ALONE. Skipping this whenever
   the player's own tile hasn't changed since last step looks like the obvious
   cache and is a real bug: standing still and digging SIDEWAYS through a wall
   is an ordinary play pattern, and the newly opened tile is a WORLD change,
   not a player movement. A position-only cache would leave the space beyond
   that wall dark until the player physically steps into it -- worse than the
   radius-1 rule this replaces, which paid no attention to movement and simply
   re-ran, cheaply, every frame. So the cache key also folds in a CHUNK
   VERSION: `model/world.js#write.touch` already bumps it on every tile write,
   the same signal `view/paint.js#chunkCanvas` already trusts to know its own
   cache is stale. Summed over the player's own chunk plus its neighbours,
   since a dig at reach's edge (3.2 tiles) can land in an adjacent chunk right
   on a seam. Skipping only when BOTH the occupied tiles AND every one of
   those versions are unchanged means the flood reruns exactly when it could
   possibly find something new, and cannot do less than that. */
function passB(b, tx0, ty0, tx1, ty1) {
  const c0 = chunkOf(b, tx0, ty0), c1 = chunkOf(b, tx1, ty1);
  let ver = 0;
  for (let cy = c0.cy - 1; cy <= c1.cy + 1; cy++)
    for (let cx = c0.cx - 1; cx <= c1.cx + 1; cx++)
      if (cx >= 0 && cx < b.cx && cy >= 0 && cy < b.cy) ver += chunkVer(b, cx, cy);

  if (b === lastBand && tx0 === lastTx0 && ty0 === lastTy0 &&
      tx1 === lastTx1 && ty1 === lastTy1 && ver === lastVer) return;
  lastBand = b; lastTx0 = tx0; lastTy0 = ty0; lastTx1 = tx1; lastTy1 = ty1; lastVer = ver;

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
      if (solidAt(b, nx, ny)) continue;          // but light stops at rock
      queue.push({ tx: nx, ty: ny, d: d + 1 });
    }
  }
}
