/* LAYER model — accumulated pick time per tile, in SECONDS as a float.
   Imports `model` only. May be imported by `model`, `rules`, `view`.

   ONE NUMBER, TWO FACTS (Phase 14b, docs/SPEC.md section 19). The seconds
   stored per tile answer both:

     how far through THIS SWING am I     ->  work % hard         `unitProgressAt`
     how depleted is THIS WHOLE VEIN     ->  work / (hard*charge) `progressAt`

   because a deposit tile yields `tile.charge` units and each unit costs a
   full `hard` of accumulated work. So this Map is also the DEPLETION LEDGER,
   and it is deliberately the only one: a second per-tile counter would have to
   re-establish by hand the hand-versus-machine rate equality docs/SPEC.md
   section 12 stakes on both break sites feeding `write.add` below.

   WHY THIS IS NOT THE HISTORICAL BYTE BUG BACK AGAIN. CLAUDE.md records that
   mining progress once lived in the tile store, which is *why* it became a
   truncated byte in the material array, which is why granite (2.4 s) turned
   permanently unmineable above 106 fps. The bug was never "a per-tile number
   exists"; it was the REPRESENTATION and the PLACE. This is a `Map` of
   float seconds, outside the grid, compared directly against a substance
   row's hardness -- which is also seconds. There is no /255 and no byte, and
   therefore no framerate at which a hard material becomes unbreakable.

   A Map and not a `Float32Array(tw * th)`: the live set is sparse, and the
   array form is 196 KB resident per band to describe it. The old claim that
   "a dig abandons progress the moment the player looks elsewhere" was never
   true of this code -- nothing clears an entry when the reticle moves, and
   depletion now DEPENDS on that: a vein you half-worked and walked away from
   is still half-worked when you come back. Entries are cleared on exactly
   three occasions, all of which mean the tile is not the tile it was:
   `model/tiles.js#write.setByte` whenever the byte changes (which covers
   mining, placement, worldgen and the `chasm` miracle in one place),
   the two break sites' own explicit `clear`, and `clearAll` from
   `shell/boot.js#newRun` (invariant 8). */

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

/* HOW MANY DROP-WORTHY UNIT BOUNDARIES LIE BETWEEN TWO WORK READINGS.
   Pure arithmetic, and it lives here rather than in either break site because
   `rules/mining.js` (the player) and `rules/machines.js#mine` (a placed
   miner) both need it and, being `rules` siblings, may not import each other.
   One copy is what keeps docs/SPEC.md section 12's hand-equals-machine
   equality true by construction instead of by two files agreeing.

   Capped at `charge - 1`: the LAST unit is the break itself, which both call
   sites already spawn a drop for, so counting it here would double it. At
   charge 1 the cap is 0 and this always returns 0 -- today's behaviour for
   `soil`, `stone` and `timber`, unchanged. */
export function unitsCrossed(before, after, hardSecs, charge) {
  if (!(hardSecs > 0) || !Number.isFinite(hardSecs)) return 0;
  const cap = Math.max(0, Math.floor(charge) - 1);
  if (cap === 0) return 0;
  const was = Math.min(cap, Math.floor(before / hardSecs));
  const now = Math.min(cap, Math.floor(after / hardSecs));
  return Math.max(0, now - was);
}

/* How many tiles carry accumulated work. A debug read, and NO LONGER a proof
   that the Map stays small: since Phase 14b an entry persists for every
   deposit tile ever partially worked, for the whole run, because that IS the
   depletion ledger (see the header). The honest bound is therefore the number
   of mineable cells the player ever touches -- docs/SPEC.md section 16.5
   measures ~3,000 ore cells per topsoil seed, so a few thousand entries at
   tens of bytes each, a few hundred KB worst case for a player who chips
   every vein in the world and finishes none. The dense alternative
   (a `Uint8Array` per band, beside `seen` and `light`) costs ~53 KB flat;
   docs/PLAN-phase14-mining-and-drops.md D14-D names the exact trigger for
   switching to it, which is depletion needing to move for a reason other
   than accumulated work. */
export const activeCount = () => dig.work.size;
