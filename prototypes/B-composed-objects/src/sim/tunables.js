import { SUB } from '../data/substances.js';

/* ============================================================
   TUNABLES — the modifier store. DESIGN item 8, and the thing every one of
   the six RFCs forgot.

   THE PROBLEM, from CLAUDE.md: ES module bindings are read-only for
   importers, so a trinket cannot do `WALK = WALK * 1.15`. Today
   `export const WALK = 60` lives in sim/player.js and nothing can touch it.

   THE RULE HERE: any number a boon, a curse, a difficulty setting or a
   god's mood might change is a KEY in this file, read through stat(), never
   imported as a constant. If you find yourself writing `export const` for a
   gameplay number, it belongs in BASE below instead.

   Modifiers are (mul, add) pairs tagged with the SOURCE that applied them,
   which is what makes them removable when the trinket is lost -- the flaw
   the review found in RFC 06's writable statics. Effective value is
       (base * product of muls) + sum of adds
   in that order, applied deterministically in insertion order so two
   trinkets in either draft order give the same number.
   ============================================================ */

export const BASE = {
  /* player, moved out of sim/player.js where they were module constants */
  walk: 60, hop: 92, climb: 30, grav: 320, terminal: 400,
  'fall.safe': 160, 'fall.heart': 32,
  'pick.power': 1, 'pick.reach': 3.2,

  /* machines: a multiplier on every recipe's rate. comp/recipe.js divides
     `secs` by this, so 1.25 means 25% faster. */
  'machine.rate': 1,

  /* fields */
  'field.heat.decay': 0.4,

  /* material hardness has NO entry here. Its base comes from the substance
     row (`tile.mine.secs`) and is passed to stat() as an argument, so
     adding a substance adds no key. See hardOf(). */

  /* the lift, CLAUDE invariant 5: down is free, up is expensive */
  'lift.up': 11, 'lift.down': 26
};

/* One entry per applied modifier. Small (a run holds maybe 8 trinkets), so
   stat() walking it is cheaper than maintaining a cache that can go stale. */
const mods = [];       // { src, key, mul, add }

export function addMod(src, key, { mul = 1, add = 0 } = {}) {
  mods.push({ src, key, mul, add });
}

/* Removable BY SOURCE, which is the whole reason `src` exists. */
export function dropMods(src) {
  for (let i = mods.length - 1; i >= 0; i--) if (mods[i].src === src) mods.splice(i, 1);
}

/* A key matches a modifier if it is equal, or if the modifier is a
   `prefix.*` wildcard. One wildcard level, no regex -- `hard.*` is the only
   real consumer and a pattern language here would be speculative. */
const hits = (key, mkey) =>
  mkey === key || (mkey.endsWith('.*') && key.startsWith(mkey.slice(0, -1)));

export function stat(key, base) {
  let v = base === undefined ? BASE[key] : base;
  if (v === undefined) throw new Error('tunables: no such key ' + key);
  let mul = 1, add = 0;
  for (const m of mods) if (hits(key, m.key)) { mul *= m.mul; add += m.add; }
  return v * mul + add;
}

/* Material hardness, in the same mechanism: base from the data row, key
   derived from the substance id, so `hard.*` catches every material and
   `hard.copper` catches one. */
export const hardOf = sub => {
  const m = SUB[sub].tile.mine;
  return m ? stat('hard.' + sub, m.secs) : Infinity;
};

/* Serialised by sim/save.js. Modifiers are (src, key, numbers) -- no
   functions, no object references -- so this is the one part of the save
   that was free. */
export const modSnapshot = () => mods.map(m => ({ ...m }));
export function modRestore(list) {
  mods.length = 0;
  for (const m of list) mods.push({ ...m });
}
