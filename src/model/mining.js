/* LAYER model — accumulated pick time per tile, in SECONDS as a float.
   Imports `model`.

   ONE NUMBER, TWO FACTS, because a deposit tile yields `tile.charge` units and
   each costs a full `hard` of work:
     how far through THIS SWING am I   ->  work % hard          `unitProgressAt`
     how depleted is THIS WHOLE VEIN   ->  work / (hard*charge)  `progressAt`
   So this Map is also the DEPLETION LEDGER, deliberately the only one: a
   second per-tile counter would have to re-establish the hand-versus-machine
   rate equality by hand.

   THIS IS NOT THE HISTORICAL BYTE BUG BACK AGAIN. Progress once lived in the
   tile store, which is why it became a truncated byte, which is why granite
   turned unmineable above 106 fps. The bug was the REPRESENTATION and the
   PLACE, not the existence of a per-tile number. This is a Map of float
   seconds, outside the grid, compared against a hardness that is also
   seconds -- no /255 and no byte.

   A Map and not a `Float32Array(tw * th)`, because the live set is sparse and
   the array form is 196 KB resident per band. Nothing clears an entry when
   the reticle moves, and depletion DEPENDS on that: a vein you half-worked
   and walked away from is still half-worked. Entries clear on exactly three
   occasions, all meaning the tile is not the tile it was. */

import { bump } from './epoch.js';
import { idx } from './world.js';

/* Band ordinal prefixes the tile index, because two bands may be mined at once
   and a bare tile index would collide between them. */
const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);

export const dig = { work: new Map() };

export const write = {
  /* Returns the new total, so the caller need not read it back. */
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

/* 0..1 — HOW DEPLETED IS THIS WHOLE TILE. `charge` is the substance's
   `tile.charge` (see the header): at charge 1 this is exactly what it always
   was, so every existing caller reads the same number it used to. */
export const progressAt = (b, tx, ty, hardSecs, charge = 1) =>
  !(hardSecs > 0) || !Number.isFinite(hardSecs) || !(charge >= 1) ? 0
    : Math.min(1, workAt(b, tx, ty) / (hardSecs * charge));

/* 0..1 — HOW FAR THROUGH THE CURRENT UNIT, i.e. how far through this swing.
   The crack read: a crack must still mean "this hit" once one tile takes four
   of them, which is why the two questions have two names rather than one
   function with a flag. Saturates at 1 on the last unit rather than wrapping
   to 0, so a tile about to break never renders uncracked. */
export const unitProgressAt = (b, tx, ty, hardSecs, charge = 1) => {
  if (!(hardSecs > 0) || !Number.isFinite(hardSecs) || !(charge >= 1)) return 0;
  const work = workAt(b, tx, ty);
  if (work >= hardSecs * charge) return 1;
  return (work % hardSecs) / hardSecs;
};

/* HOW MANY DROP-WORTHY UNIT BOUNDARIES LIE BETWEEN TWO WORK READINGS. Pure
   arithmetic, here rather than in either break site because the player's and
   the placed miner's rules are siblings that may not import each other -- one
   copy is what keeps hand-equals-machine true by construction.

   Capped at `charge - 1`: the LAST unit is the break itself, which both call
   sites already spawn a drop for. At charge 1 the cap is 0. */
export function unitsCrossed(before, after, hardSecs, charge) {
  if (!(hardSecs > 0) || !Number.isFinite(hardSecs)) return 0;
  const cap = Math.max(0, Math.floor(charge) - 1);
  if (cap === 0) return 0;
  const was = Math.min(cap, Math.floor(before / hardSecs));
  const now = Math.min(cap, Math.floor(after / hardSecs));
  return Math.max(0, now - was);
}

/* How many tiles carry accumulated work. A debug read, and NO LONGER a proof
   that the Map stays small: an entry persists for every deposit tile ever
   partially worked, for the whole run, because that IS the depletion ledger.
   The honest bound is the number of mineable cells the player ever touches --
   a few thousand entries at tens of bytes, so a few hundred KB worst case.
   The dense alternative costs ~53 KB flat. */
export const activeCount = () => dig.work.size;
