/* LAYER model — THE TUNABLE STORE.
   The ONLY file in the project permitted to import `data/tuning.js`.
   `tools/layers.mjs` fails the build on any other importer.

   ============================================================================
   The problem, exactly. `data/` is frozen plain objects: that is the whole
   thesis, and it is what makes a table diffable, dumpable and shippable. A
   trinket must change an effective value at RUN TIME. Those two facts look like
   a contradiction and are not, because a BASE value and an EFFECTIVE value are
   different things that had been sharing one name.

     data/tuning.js   the DESIGN. Frozen. `walk` is 60 because 60 is the number
                      a designer chose. Nothing may ever write it.
     model/mods.js    the RUN. Mutable, run-scoped, cleared by `newRun()`, and a
                      list of rows copied out of `data/trinkets.js`.
     eff(id, scope)   base x this run's modifiers. The only way to read either.

   This is also what a roguelike wants: a save is a seed plus a list of trinket
   ids, and replaying it reproduces every number. If a boon patched the frozen
   table instead, two saves could not be diffed and the base value would be lost
   the moment it was overwritten.

   The cost is one call per read -- `eff('walk')` rather than `WALK` -- and the
   discipline never to read the frozen table directly. That discipline is not
   left to reviewers; it is a build failure.
   ============================================================================

   ORDER OF APPLICATION is fixed, so draft order cannot change a number:

       eff = (base + sum of all matching `add`) x product of all matching `mul`

   A mod key matches (id, scope) if it equals `id` -- the unscoped form applies
   to every scope -- or if it equals `id.scope`. So `hard` softens every
   material and `hard.stone` softens one, and both stack. */

import { TUNE } from '../data/tuning.js';
import { bump } from './epoch.js';

/* Active modifier rows. `src` is the trinket id, kept so losing a trinket
   removes exactly its own rows and nothing else -- which is the failure mode of
   writing a static field, because a static field cannot be undone. */
export const mods = { rows: [] };

export const write = {
  add(src, list) {
    for (const m of list) mods.rows.push({ src, key: m.key, mul: m.mul, add: m.add });
    bump();
  },

  removeBySource(src) {
    for (let i = mods.rows.length - 1; i >= 0; i--)
      if (mods.rows[i].src === src) mods.rows.splice(i, 1);
    bump();
  },

  clear() { mods.rows.length = 0; bump(); }
};

const applies = (key, id, scope) =>
  key === id || (scope !== undefined && key === id + '.' + scope);

/* Per-scope base override. This is what makes a variant machine faster purely
   by tuning: `rate` has base 1.0, and `rate.kiln_divine` has base 2.0, and a
   trinket's multiplier still lands on top of whichever base applied. */
const baseOf = (t, scope) =>
  (scope !== undefined && t.scoped && t.scoped[scope] !== undefined)
    ? t.scoped[scope] : t.base;

/* The one reader. `scope` is a substance id for `hard`, a machine id for
   `rate` / `yield`, and omitted for the plain player values. */
export function eff(id, scope) {
  const t = TUNE[id];
  /* A missing tunable is a programming error, not a content error, because the
     resolver has already proved every key in `data/` resolves. So this throws
     rather than returning a plausible zero. */
  if (!t) throw new Error(`eff: no tunable "${id}"`);
  let add = 0, mul = 1;
  for (const m of mods.rows) {
    if (!applies(m.key, id, scope)) continue;
    if (m.add !== undefined) add += m.add;
    if (m.mul !== undefined) mul *= m.mul;
  }
  return (baseOf(t, scope) + add) * mul;
}

/* Scale a literal that lives on a data row: hardness on a substance, `secs` on
   a recipe. Spelled out separately because the call sites read better as
   `scaled('hard', 'stone', row.tile.hard)` than as a multiplication. */
export const scaled = (id, scope, literal) => literal * eff(id, scope);

/* What is currently bent, and by what. This is the answer to "why is my walk
   speed 71", and it is what a debug overlay and the check tool both read. */
export const explain = id =>
  mods.rows.filter(m => m.key === id || m.key.startsWith(id + '.'));
