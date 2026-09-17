/* model layer — accumulated pick time per tile, in seconds as a float, so it
   compares directly against a hardness that is also seconds.

   One number, two questions, because a deposit tile yields `tile.charge`
   units and each costs a full `hard` of work: `work % hard` is progress
   through this swing, `work / (hard * charge)` is depletion of the whole
   vein. So the Map is also the depletion ledger.

   A Map and not a `Float32Array(tw * th)`: the live set is sparse and the
   dense form is 196 KB resident per band. Nothing clears an entry when the
   reticle moves, so a half-worked vein stays half-worked. */

import { bump } from './epoch.js';
import { idx } from './world.js';

/* Band ordinal prefixes the band-local tile index, because two bands may be
   mined at once and a bare index would collide between them. */
const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);

export const dig = { work: new Map() };

export const write = {
  /* Returns the new total. */
  add(b, tx, ty, secs) {
    const k = key(b, tx, ty);
    const now = (dig.work.get(k) || 0) + secs;
    dig.work.set(k, now);
    bump();
    return now;
  },

  clear(b, tx, ty) { dig.work.delete(key(b, tx, ty)); bump(); },

  clearAll() { dig.work.clear(); bump(); }
};

export const workAt = (b, tx, ty) => dig.work.get(key(b, tx, ty)) || 0;

/* 0..1 depletion of the whole tile. `charge` is the substance's
   `tile.charge`; at charge 1 this is `work / hard`. */
export const progressAt = (b, tx, ty, hardSecs, charge = 1) =>
  !(hardSecs > 0) || !Number.isFinite(hardSecs) || !(charge >= 1) ? 0
    : Math.min(1, workAt(b, tx, ty) / (hardSecs * charge));

/* 0..1 through the current unit, i.e. through this swing -- the crack read.
   Saturates at 1 on the last unit rather than wrapping to 0, so a tile about
   to break never renders uncracked. */
export const unitProgressAt = (b, tx, ty, hardSecs, charge = 1) => {
  if (!(hardSecs > 0) || !Number.isFinite(hardSecs) || !(charge >= 1)) return 0;
  const work = workAt(b, tx, ty);
  if (work >= hardSecs * charge) return 1;
  return (work % hardSecs) / hardSecs;
};

/* Drop-worthy unit boundaries between two work readings, shared by the hand
   and the placed miner. Capped at `charge - 1`: the last unit is the break
   itself, which both call sites already spawn a drop for. 0 at charge 1. */
export function unitsCrossed(before, after, hardSecs, charge) {
  if (!(hardSecs > 0) || !Number.isFinite(hardSecs)) return 0;
  const cap = Math.max(0, Math.floor(charge) - 1);
  if (cap === 0) return 0;
  const was = Math.min(cap, Math.floor(before / hardSecs));
  const now = Math.min(cap, Math.floor(after / hardSecs));
  return Math.max(0, now - was);
}

/* How many tiles carry accumulated work. A debug read and not a bound: an
   entry persists for every partially worked deposit tile for the whole run.
   Worst case is a few thousand entries at tens of bytes each. */
export const activeCount = () => dig.work.size;
