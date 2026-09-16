/* LAYER rules — REVEAL: line of sight, once a frame. Imports `model` only (no
   `core` or `data` directly -- `model/mods.js` is the one exception, since
   that is the only legal door to a tunable). Imports no other `rules` module.

   A TILE, ONCE REVEALED, IS NEVER RE-HIDDEN. The product decision this file
   exists to implement is memory, not a shrinking light radius, so this only
   ever SETS a bit in `model/world.js#seen` and never clears one. The storage
   already enforces the permanence -- `write.reveal` has no opposite -- so this
   file's only job is deciding WHICH bits to set, once a frame. `seen` versus
   `light`: docs/DEVELOPER_GUIDE.md#pass-order-and-darkness

   Two independent passes:

     PASS A -- open sky. Unbounded, and reads no tunable: there is nothing to
     obstruct a view across open air, so standing anywhere with a clear shot
     out of the WORLD (`model/tiles.js#worldSkyAt`, not the band's own row 0)
     reveals every column of the band that shares that shot, not a radius
     around the player.

     PASS B -- underground. Bounded. A flood-fill through open tiles, blocked
     by solid rock, capped at a graph distance (`eff('sightRadius')`,
     `data/tuning.js`). The player's own occupied tiles are always seeded into
     the flood at distance 0, so "reveal here and the tiles right next to it"
     still happens even in a fully solid dead end.

     The flood must not walk through UNLIT air, or a player could map a
     pitch-black cavern by the simple act of standing in it, which is not
     "somewhat visible" by any reading. Past distance 1 (the always-revealed
     immediate neighbours above, which is exactly what keeps
     the fully-solid-dead-end case working) a tile is only enqueued for
     further exploration if `model/world.js#lightAt` says it is lit at all.
     It is still REVEALED regardless -- "you can see the wall you are facing"
     already applied to a SOLID neighbour for the same reason; an unlit-but-
     open neighbour now gets the identical treatment: visible because it is
     right there, but the flood does not continue past it into the dark
     beyond. `rules/light.js` runs immediately before this step (see
     `shell/schedule.js`), so the level being read is this frame's, not
     stale.

   Both passes only ever call `model/world.js#write.reveal`.

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
import { solidAt, worldSkyAt } from '../model/tiles.js';
import { bandAbove, bandSpans, chunkOf, chunkVer, inBounds, lightAt,
         write as ww } from '../model/world.js';

/* Perf-only cache for Pass B, MODULE-LOCAL AND DELIBERATELY NOT IN `model/`
   (docs/DEVELOPER_GUIDE.md#module-local-perf-caches): keyed by the band
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

/* ---------- Pass A: unlimited sky reveal ----------
   Gated on a CHEAP check first: `worldSkyAt` on the player's own occupied
   tiles only (at most the 2-4 columns/rows the hitbox actually straddles).
   Only if that says "yes, standing under open sky" does this pay for the
   band-wide pass below -- a player underground, the common case, never
   reaches it at all.

   THE GATE ASKS ABOUT THE WORLD, not about this band's own grid.
   `skyExposedAt` stops at row 0 of whatever band it was handed, and
   `topsoil`'s row 0 is buried under 28 rows of surface rock, so a player
   38 tiles down their own shaft satisfied it and un-fogged the band's whole
   row 0 -- a whole band width of rock nothing had ever seen. */
function passA(b, tx0, ty0, tx1, ty1) {
  let exposed = false;
  for (let ty = ty0; ty <= ty1 && !exposed; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      if (worldSkyAt(b, tx, ty)) { exposed = true; break; }
  if (!exposed) return;

  /* THEN RUN THE SCAN AT MOST ONCE PER TERRAIN CHANGE, not once per frame.
     The scan below is O(band width) and its result is monotone -- it only ever
     sets `seen` bits, and which bits it would set is a pure function of the
     tile grid -- so re-running it against an unchanged grid reveals nothing it
     did not reveal the first time. `b.ver` summed over every chunk is the same
     whole-band change signal `rules/light.js#isDirty` uses, and it is the whole
     band rather than the player's neighbourhood because a shaft dug anywhere
     lengthens that column's scan. The player walking into and out of sunlight
     is NOT a reason to rerun: the scan never depended on where they stood.

     EVERY BAND ABOVE THIS ONE IS IN THE SUM TOO, because `worldSkyAt` walks up
     through their rock for a band carrying no sky of its own -- a tile broken
     in `surface` can open a `topsoil` column to daylight without touching one
     `topsoil` chunk version, and a sum over this band alone would skip the
     rescan that notices.

     This is deliberately a throttle and not a radius cull. Pass A's contract
     (docs/SPEC.md section 11.1) is that open air obstructs nothing, so a radius
     would change what the player sees; the throttle changes only how often the
     same answer is computed, which at 1,024 columns is the whole cost. */
  let verSum = 0;
  for (let up = b; up; up = bandAbove(up))
    for (let i = 0; i < up.ver.length; i++) verSum += up.ver[i];
  if (skylineVer.get(b) === verSum) return;
  skylineVer.set(b, verSum);

  /* THE WHOLE POINT: reveal the band's entire sky-exposed silhouette, not
     just where the player stands. ONE `worldSkyAt` PER COLUMN, at row 0,
     which is the cheapest row to ask about -- its in-band walk is empty, so a
     band with sky of its own answers in one test and a band without answers
     in one solidity test per band above it (see `model/tiles.js`). Never ask
     per TILE: that walks the column every call and is close to quadratic over
     a band as deep as `topsoil`.

     Then walk DOWN from row 0 and stop AFTER the first solid tile. REVEAL,
     THEN CHECK SOLID, in that order: the ground you are standing on -- the
     first solid tile a column hits -- has nothing solid above it and must be
     revealed too, or the visible, walkable surface would stay fogged
     everywhere except the handful of tiles Pass B's flood already reaches
     around the player, while the open air above it was fully lit -- a
     floating-sky-over-a-dark-strip bug this project's own screenshots caught.
     Only what is BENEATH that first solid tile is genuinely obstructed, so
     the loop stops there. Total cost of a full scan is bounded by the number
     of tiles actually revealed (typically a shallow surface skin) plus the
     per-column tests, never by band area. */
  for (let tx = 0; tx < b.tw; tx++) {
    if (!worldSkyAt(b, tx, 0)) continue;
    for (let ty = 0; ty < b.th; ty++) {
      ww.reveal(b, tx, ty);
      if (solidAt(b, tx, ty)) break;
    }
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
   possibly find something new, and cannot do less than that.

   PHASE 2b ADDITION: `b.lightVer` folds into the same sum. A brazier lighting
   up or running dry never touches a tile byte, so it never bumps a chunk
   `ver` at all -- without this, a newly-lit corridor would stay dark on the
   map until some UNRELATED tile write nearby happened to force a rerun.
   `model/world.js#write.touchLight` is bumped once per light recompute by
   `rules/light.js`, which runs immediately before this step, so this frame's
   relight is what a stale check here would otherwise miss.

   ONE THROTTLE, ONE FLOOD PER STRADDLED BAND. The version sum and the tile
   key both run over every span, so a crossing frame cannot be throttled away
   by the half of the box that did not move. `home` is `player.band` and it is
   in the key by OBJECT IDENTITY: `newRun()` hands out fresh band records, so
   the cache is already stale on a restart with no reset call to forget. The
   tile box is folded into a rolling hash rather than compared field by field
   because the number of spans varies.

   Each span floods its own band. The flood does not cross the seam, and it
   does not need to -- the player's own tiles seed it on both sides. */
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
