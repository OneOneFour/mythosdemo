/* LAYER model — the set of tiles the player has MARKED for digging, and the
   query "which marked tile is nearest a point, within reach". Imports `model`
   and `data`.

   A number and a query, never a decision. The seconds a swing accumulates
   stay in `model/mining.js`; there is no second progress store here.

   Keyed the way `model/mining.js` and `model/growth.js` key theirs -- band
   ordinal prefixing the band-local tile index, because two bands may be
   marked at once -- and the value is a record carrying its own coordinates,
   because the nearest query ENUMERATES and walking packed keys back would be
   a second implementation of the packing.

   A MARK CARRIES THE BAND AND THE BYTE IT WAS MARKED ON, and this module does
   NOT hang a clear off `write.setByte` the way those two do: a marked tile
   becoming air is the NORMAL outcome, so the funnel would fire on the one
   case that needs no repair. Carrying the byte makes staleness a local
   question instead.

   THE BAND REFERENCE IS THE HALF THAT SURVIVES A RESTART. `newRun` replaces
   every band record and regenerating the same seed writes the same bytes
   back, so a byte test ALONE would find every mark of the previous run
   perfectly valid at the same coordinates. Comparing against `bands[ord]`
   makes them stale by construction.

   READS NEVER MUTATE: `view` draws the marks and may not write to `model`, so
   pruning is a `write` called from `rules/mining.js#step`, never folded into
   the query that notices them.

   THE COMMITTED TARGET IS HERE AND NOT IN `rules/mining.js`, because the HUD
   draws it and `view` may not import `rules`. The DECISION is still the
   rules': `write.commit` only stores what they chose. */

import { AIR } from '../data/forms.js';
import { bump } from './epoch.js';
import { eff } from './mods.js';
import { tileAt } from './tiles.js';
import { bands, idx, inBounds, worldX, worldY } from './world.js';

const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);

export const marks = { set: new Map() };

/* The one mark `rules/mining.js` is committed to working until it is done with.
   Holds the RECORD and not its coordinates, so a commitment cannot outlive the
   mark it names: every test below is against the record's own identity. */
const held = { m: null };

/* Is this mark about a tile that no longer exists as it was? Broken by the
   queue, dug by hand, placed over, swallowed by the `chasm` miracle or grown
   into a trunk — one byte test covers all five. The identity test in front of
   it covers the sixth, which no byte test can see: the whole band was
   reallocated by a restart (see the header). */
const stale = m => m.band !== bands[m.ord] || tileAt(m.band, m.tx, m.ty) !== m.byte;

/* Is this record still THE mark at its coordinates? The identity test is what
   `stale` cannot do: unmark and re-mark the same tile in one frame leaves a
   fresh record with the same band and the same byte, and a committed target
   must not go on naming the deleted one. */
const live = m => !!m && marks.set.get(key(m.band, m.tx, m.ty)) === m && !stale(m);

/* Squared distance in world px from a point to a marked tile's own middle. The
   single implementation both the nearest query and the committed target are
   measured with, so what suspends a target can never disagree with what would
   have selected it. */
function d2(m, px, py) {
  const b = m.band;
  const dx = worldX(b, m.tx) + b.tile / 2 - px;
  const dy = worldY(b, m.ty) + b.tile / 2 - py;
  return dx * dx + dy * dy;
}

/* Is one mark within `reach` of a world point? The per-mark form of the test
   the two queries below apply, exported because `view` tints every mark by it
   and `nearestWithin`/`committedWithin` each answer for exactly one.
   `reach` is a parameter for their reason. */
export const withinReach = (m, px, py, reach) => d2(m, px, py) <= reach * reach;

/* The hard cap on marks, floored at 1: a queue that can hold nothing is a
   feature that silently does not exist. */
const cap = () => Math.max(1, Math.round(eff('digQueueMax')));

export const write = {
  /* Marks a tile for digging. Returns 'ok', 'full' at the cap, or 'nothing'
     for air, the world edge, or a tile already marked.

     THE CALLER OWNS THE REFUSAL: no `model` module imports the journal, so
     the drag gesture is what turns a 'full' into a row.

     AIR AND THE WORLD EDGE ARE REFUSED HERE rather than by the caller, which
     is storage integrity and not a mechanic -- a drag sweeps across open sky,
     and a mark on nothing would spend cap and be pruned next frame. Whether
     the pick is good enough for what IS there stays the rules' decision. */
  mark(b, tx, ty) {
    if (!inBounds(b, tx, ty)) return 'nothing';
    const byte = tileAt(b, tx, ty);
    if (byte === AIR) return 'nothing';
    const k = key(b, tx, ty);
    if (marks.set.has(k)) return 'nothing';
    /* Collect before refusing, never on every mark: a drag calls this per tile
       and an unconditional O(n) sweep would make a 256-tile drag O(n^2) for
       nothing. The only rows that can be dead at this point are a previous
       run's, and the first substep of the new run has already swept them. */
    if (marks.set.size >= cap()) { prune(); if (marks.set.size >= cap()) return 'full'; }
    marks.set.set(k, { band: b, ord: b.ord, tx, ty, byte });
    bump();
    return 'ok';
  },

  /* No bump when there was nothing to delete, for `model/growth.js#clear`'s
     reason: a drag that sweeps back over open sky calls this per tile. */
  unmark(b, tx, ty) {
    const k = key(b, tx, ty);
    const m = marks.set.get(k);
    if (!m) return;
    marks.set.delete(k);
    if (held.m === m) held.m = null;
    bump();
  },

  prune,

  /* COMMIT TO A MARK. `rules/mining.js` decides which; this stores it, and
     `committedWithin` below is what makes the choice stick. Committing to
     coordinates that carry no live mark clears the commitment instead of
     inventing one. */
  commit(b, tx, ty) {
    const m = marks.set.get(key(b, tx, ty));
    const next = m && !stale(m) ? m : null;
    if (next === held.m) return;
    held.m = next;
    bump();
  },

  /* Give up the commitment without touching the mark. What a hand-aimed swing
     does to it, and what a mark leaving the set does to it. */
  abandon() { if (held.m) { held.m = null; bump(); } },

  clearAll() { marks.set.clear(); held.m = null; bump(); }
};

/* Drops every mark whose tile is not the tile it was marked on. Called once
   per substep from `rules/mining.js#step`; see the header for why it is a
   write and not folded into the query that notices them. Deleting the current
   entry mid-iteration is defined behaviour for a `Map`. */
function prune() {
  let gone = 0;
  for (const [k, m] of marks.set) if (stale(m)) {
    marks.set.delete(k);
    if (held.m === m) held.m = null;
    gone++;
  }
  if (gone) bump();
  return gone;
}

export const markedAt = (b, tx, ty) => {
  const m = marks.set.get(key(b, tx, ty));
  return !!m && !stale(m);
};

/* THE NEAREST LIVE MARK WITHIN `reach` OF A WORLD POINT, or null. Distance is
   centre to centre in world px, so `reach` means the same thing here it means
   for hand aim.

   `reach` IS A PARAMETER AND NOT READ FROM `eff` HERE, because `view` draws
   an out-of-reach mark differently and a `view` pass and a `rules` step must
   not disagree about which number they measured against.

   TIES BREAK ON THE KEY, ascending, so the answer is a function of the marked
   SET rather than of the order it was painted. Returns the LIVE band record. */
export function nearestWithin(px, py, reach) {
  let best = null, bestD = Infinity, bestK = Infinity;
  for (const [k, m] of marks.set) {
    if (stale(m)) continue;
    const d = d2(m, px, py);
    if (d > reach * reach) continue;
    if (d < bestD || (d === bestD && k < bestK)) { best = { b: m.band, tx: m.tx, ty: m.ty }; bestD = d; bestK = k; }
  }
  return best;
}

/* THE COMMITTED TARGET, if still live and still within `reach`, else null.
   This is the whole of the hysteresis: `rules/mining.js` asks this first and
   falls back to `nearestWithin` only on null, so a walking player's target
   stops changing faster than any tile can break.

   FOUR THINGS END A COMMITMENT and all four answer here: the tile changed,
   the mark was dropped, the band was reallocated by a restart, and the player
   walked out of range. Only the LAST is a suspension. `reach` is a parameter
   for `nearestWithin`'s reason, and the two must be passed the same one. */
export function committedWithin(px, py, reach) {
  const m = held.m;
  if (!live(m) || d2(m, px, py) > reach * reach) return null;
  return { b: m.band, tx: m.tx, ty: m.ty };
}

/* The live map, for `view` to draw and for a debug read. Returned rather than
   copied, `model/growth.js#planted`'s contract: `write` above is the door. */
export const queued = () => marks.set;

export const activeCount = () => marks.set.size;

/* Has the cap been reached? The read behind the drag gesture's own refusal, so
   `shell` need not know the tunable's name. */
export const isFull = () => marks.set.size >= cap();
