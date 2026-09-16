/* LAYER model — the set of tiles the player has MARKED for digging, and the
   query "which marked tile is nearest a point, within reach". Imports `model`
   and `data`. May be imported by `model`, `rules`, `view`.

   A number and a query, never a decision: this file owns which coordinates
   carry a mark and which of them is closest to somewhere. Whether to swing at
   the answer is `rules/mining.js`'s, and the seconds that swing accumulates
   stay in `model/mining.js` — there is no second progress store here, for the
   reason CLAUDE.md records at length about the byte that made granite
   unbreakable above 106 fps.

   Keyed exactly the way `model/mining.js` and `model/growth.js` key theirs —
   band ordinal prefixing the band-local tile index, because two bands may be
   marked at once and a bare tile index would collide between them — and the
   value is a record carrying its own coordinates, for `model/growth.js`'s
   reason: the nearest query ENUMERATES, and walking packed keys back to
   (band, tx, ty) would be a second implementation of `world.js#idx`'s packing.

   WHY A MARK CARRIES THE BAND AND THE BYTE IT WAS MARKED ON, and why this
   module does NOT hang a clear off `model/tiles.js#write.setByte` the way
   those two do. A mark whose tile changed is not about anything any more,
   which is the same fact D14-E argues there — but the change a mark cares
   about is overwhelmingly the queue's OWN success. A marked tile becoming air
   is the normal outcome, not an anomaly, so the funnel would fire on the one
   case that needs no repair. Carrying the byte makes staleness a local
   question instead: `stale()` below answers it from the tile grid, reads skip
   a stale mark, and `write.prune` collects them.

   THE BAND REFERENCE IS THE HALF THAT SURVIVES A RESTART, and it is invariant
   8 rather than tidiness. `shell/boot.js#newRun` replaces every band record
   (`model/world.js#write.clear`, then `allocate` per row), and regenerating
   the SAME seed writes the same bytes back — so a byte test alone would find
   every mark from the previous run perfectly valid at the same coordinates,
   which is exactly the determinism bug docs/FINDINGS.md (8d, #2) records
   happening to `segments`. Comparing the record against `bands[ord]` makes
   every mark of a previous run stale by construction, and `rules/mining.js`
   collects them on the first substep. `clearAll()` is still the right call for
   `newRun` to make; this is what makes its absence
   unobservable rather than a substitute for it.

   READS NEVER MUTATE, and that is load-bearing rather than tidy. `view` draws
   the marks (`markedAt`, `queued`), and `view` may not write to `model` — the
   epoch assertion in `npm run check` proves it. So the pruning of stale marks
   is a `write`, called from `rules/mining.js#step`, and never folded into the
   query that notices them.

   THE COMMITTED TARGET IS HERE AND NOT IN `rules/mining.js`, for
   `model/aim.js`'s one reason: the HUD draws it. Which marked tile the pick is
   actually working is what tells the tile being broken apart from the twenty
   merely waiting, `view` may not import `rules`, and a module-local scalar in
   `rules/mining.js` would be invisible to the layer that has to draw it.
   The decision is still the rules' -- `write.commit` only stores what
   `rules/mining.js` chose, exactly as `aim.js#write.set` stores where it
   pointed.

   docs/SPEC.md section 28. */

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
  /* Marks a tile for digging. Returns 'ok', 'full' when the cap is reached, or
     'nothing' for air, the world edge, or a tile already marked.

     THE CALLER OWNS THE REFUSAL. 'full' is a fact, not a toast: no `model`
     module imports `model/journal.js`, so `shell/input.js`'s drag gesture is
     what turns a 'full' into the journal row every other refusal in this game
     gets.

     AIR AND THE WORLD EDGE ARE REFUSED HERE rather than by the caller, which
     is storage integrity and not a mechanic: a drag sweeps across open sky,
     and a mark on nothing would spend cap and then be pruned on the next
     frame. Whether the pick is good enough for what IS there stays
     `rules/mining.js`'s decision. */
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
   measured centre to centre in world px — the point against the tile's own
   middle — so `reach`'s 3.2 tiles means the same thing here it means for hand
   aim in `rules/mining.js#aimAtWorld`.

   `reach` IS A PARAMETER AND NOT READ FROM `eff` HERE, for the reason
   `model/growth.js#stageAt` gives about its own total: `view` draws an
   out-of-reach mark differently from an in-reach one, and a `view` pass and a
   `rules` step must not be able to disagree about which number they measured
   against.

   TIES BREAK ON THE KEY, ascending, which makes the answer a function of the
   marked SET rather than of the order it was painted in. Returns the LIVE band
   record, so a caller crossing a `page.evaluate` boundary must project the
   fields it wants first. */
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

/* THE COMMITTED TARGET, if it is still live and still within `reach` of the
   point, else null. This is the whole of the hysteresis: `rules/mining.js`
   asks this first and only falls back to `nearestWithin` when it answers
   null, so a walking player's target stops changing faster than any tile can
   break.

   FOUR THINGS END A COMMITMENT and all four answer here rather than needing a
   caller to notice them: the tile broke or was otherwise overwritten (`stale`),
   the mark was dropped (`live`), the band was reallocated by a restart
   (`stale` again, invariant 8), and the player walked out of range. Only the
   last is a suspension -- the mark goes back to being an ordinary one and is
   picked up again by whichever query reaches it next.

   `reach` IS A PARAMETER for `nearestWithin`'s reason, and the two must be
   passed the same one: `view` draws the target differently from a waiting
   mark, and a `view` pass that thought the target was still in reach while
   the step had already suspended it would draw a tile nothing is working. */
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
