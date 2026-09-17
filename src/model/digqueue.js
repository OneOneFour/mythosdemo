/* model layer — the tiles the player has marked for digging, and the query
   "which marked tile is nearest a point, within reach". Accumulated swing
   time stays in `model/mining.js`.

   Keyed by band ordinal prefixing the band-local tile index, as
   `model/mining.js` and `model/growth.js` key theirs. The value is a record
   carrying its own band, coordinates and the byte it was marked on, because
   the nearest query enumerates and walking packed keys back would duplicate
   the packing.

   Comparing the band reference against `bands[ord]` is what makes a mark
   stale across a restart: the same seed writes the same bytes back. */

import { AIR } from '../data/forms.js';
import { bump } from './epoch.js';
import { eff } from './mods.js';
import { tileAt } from './tiles.js';
import { bands, idx, inBounds, worldX, worldY } from './world.js';

const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);

export const marks = { set: new Map() };

/* The one mark `rules/mining.js` is committed to. Holds the record and not
   its coordinates, so every test below is against the record's identity. */
const held = { m: null };

/* Is this mark about a tile that no longer exists as it was? The byte test
   covers every terrain edit; the band test covers a restart reallocating the
   band, which no byte test can see. */
const stale = m => m.band !== bands[m.ord] || tileAt(m.band, m.tx, m.ty) !== m.byte;

/* Is this record still the mark at its coordinates? Unmark and re-mark the
   same tile in one frame leaves a fresh record with the same band and byte,
   which `stale` cannot tell apart. */
const live = m => !!m && marks.set.get(key(m.band, m.tx, m.ty)) === m && !stale(m);

/* Squared distance in world px from a point to a marked tile's centre. One
   implementation for both the nearest query and the committed target. */
function d2(m, px, py) {
  const b = m.band;
  const dx = worldX(b, m.tx) + b.tile / 2 - px;
  const dy = worldY(b, m.ty) + b.tile / 2 - py;
  return dx * dx + dy * dy;
}

/* Is one mark within `reach` world px of a point? `reach` is a parameter so
   a `view` pass and a `rules` step cannot measure against different numbers. */
export const withinReach = (m, px, py, reach) => d2(m, px, py) <= reach * reach;

/* The hard cap on marks, floored at 1. */
const cap = () => Math.max(1, Math.round(eff('digQueueMax')));

export const write = {
  /* Marks a tile for digging. Returns 'ok', 'full' at the cap, or 'nothing'
     for air, the world edge, or an already-marked tile. The caller owns the
     refusal message: no `model` module imports the journal. */
  mark(b, tx, ty) {
    if (!inBounds(b, tx, ty)) return 'nothing';
    const byte = tileAt(b, tx, ty);
    if (byte === AIR) return 'nothing';
    const k = key(b, tx, ty);
    if (marks.set.has(k)) return 'nothing';
    /* Pruned only on the way to refusing, never per mark: a drag calls this
       per tile, and an unconditional O(n) sweep makes a 256-tile drag
       O(n^2). */
    if (marks.set.size >= cap()) { prune(); if (marks.set.size >= cap()) return 'full'; }
    marks.set.set(k, { band: b, ord: b.ord, tx, ty, byte });
    bump();
    return 'ok';
  },

  /* No bump when there was nothing to delete: a drag sweeping back over open
     sky calls this per tile. */
  unmark(b, tx, ty) {
    const k = key(b, tx, ty);
    const m = marks.set.get(k);
    if (!m) return;
    marks.set.delete(k);
    if (held.m === m) held.m = null;
    bump();
  },

  prune,

  /* `rules/mining.js` decides which mark; this stores it. Coordinates
     carrying no live mark clear the commitment instead of inventing one. */
  commit(b, tx, ty) {
    const m = marks.set.get(key(b, tx, ty));
    const next = m && !stale(m) ? m : null;
    if (next === held.m) return;
    held.m = next;
    bump();
  },

  /* Give up the commitment without touching the mark. */
  abandon() { if (held.m) { held.m = null; bump(); } },

  clearAll() { marks.set.clear(); held.m = null; bump(); }
};

/* Drops every mark whose tile is not the tile it was marked on. Called once
   per substep from `rules/mining.js#step`, since `view` also reads the marks
   and may not write. Deleting the current entry mid-iteration is defined for
   a `Map`. */
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

/* The nearest live mark within `reach` of a world point, or null. Distance is
   centre to centre in world px. Ties break on the ascending key, so the answer
   depends on the marked set and not on the order it was painted. */
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

/* The committed target, if still live and still within `reach`, else null.
   `rules/mining.js` asks this before `nearestWithin` and must pass the same
   `reach`. Walking out of range suspends it; the other three endings -- the
   tile changed, the mark was dropped, the band was reallocated -- are final. */
export function committedWithin(px, py, reach) {
  const m = held.m;
  if (!live(m) || d2(m, px, py) > reach * reach) return null;
  return { b: m.band, tx: m.tx, ty: m.ty };
}

/* The live map, for `view` to draw and for a debug read. Returned rather than
   copied; callers must not write to it -- `write` above is the door. */
export const queued = () => marks.set;

export const activeCount = () => marks.set.size;

/* Has the cap been reached? Read by the drag gesture, so `shell` need not
   know the tunable's name. */
export const isFull = () => marks.set.size >= cap();
