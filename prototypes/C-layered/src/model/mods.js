/* LAYER model — THE TUNABLE STORE. DESIGN item 8, which all six RFCs missed.

   ============================================================================
   The problem, exactly. `data/` is frozen plain objects: that is this design's
   whole thesis, and it is what makes a table diffable, dumpable and shippable.
   A trinket must change an effective value at RUN TIME. Those two facts look
   like a contradiction and are not, because a base value and an effective value
   are different things that had been sharing one name.

     data/tuning.js   the DESIGN. Frozen. `walk` is 60 because 60 is the number
                      a designer chose. Nothing may ever write it.
     model/mods.js    the RUN. Mutable, run-scoped, reset by `newRun()`, and a
                      list of rows copied out of `data/trinkets.js`.
     eff(id, scope)   base x this run's modifiers. The only way to read either.

   The saving grace is that this is also what a roguelike wants: a save is a
   seed plus a list of trinket ids, and replaying it reproduces every number.
   If a boon patched the table instead, two saves could not be diffed and the
   base value would be lost the moment it was overwritten.

   The cost is one call per read — `eff('walk')` rather than `WALK` — at roughly
   twenty call sites, and the discipline to never read `data/tuning.js`
   directly. That discipline is not left to reviewers: `tools/layers.mjs` fails
   the build if any file except this one imports `data/tuning.js`.
   ============================================================================

   ORDER OF APPLICATION is fixed so that draft order cannot change a number:

       eff = (base + sum of all matching `add`) * product of all matching `mul`

   A mod key matches (id, scope) if it equals `id` — the unscoped form applies
   to every scope — or if it equals `id + '.' + scope`. So `hard` slows every
   material and `hard.tin` slows one, and both stack. */

import { TUNE } from '../data/tuning.js';
import { bump } from './epoch.js';

/* Active modifier rows. `src` is the trinket id, kept so losing a trinket can
   remove exactly its own rows and nothing else — the failure mode of writing a
   static class field, which cannot be undone. */
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

/* The one reader. `scope` is a substance id for `hard`, a machine id for
   `rate`/`yield`, and omitted for the plain player values. */
export function eff(id, scope) {
  const t = TUNE[id];
  /* A missing tunable is a programming error, not a content error, because
     `tools/resolve.mjs` has already proved every key in `data/` resolves. So it
     throws here rather than returning a plausible zero. */
  if (!t) throw new Error(`eff: no tunable "${id}"`);
  let add = 0, mul = 1;
  for (const m of mods.rows) {
    if (!applies(m.key, id, scope)) continue;
    if (m.add !== undefined) add += m.add;
    if (m.mul !== undefined) mul *= m.mul;
  }
  return (t.base + add) * mul;
}

/* Scale a literal that lives on a data row: hardness on a substance, `secs` on
   a machine recipe. `kind:'scale'` rows have base 1.0, so this is `eff` with the
   row's own number folded in — spelled out because the call sites read better
   as `scaled('hard', 'granite', row.tile.hard)`. */
export const scaled = (id, scope, literal) => literal * eff(id, scope);

/* For a debug overlay and for the check tool: what is currently bent, and by
   what. Cheap to have, and it is the answer to "why is my walk speed 71". */
export const explain = id => mods.rows.filter(m => m.key === id || m.key.startsWith(id + '.'));
