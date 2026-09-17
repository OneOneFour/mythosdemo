/* model layer — the tunable store, and the only file permitted to import
   `data/tuning.js`; `tools/layers.mjs` fails the build on any other importer.

   Order of application is fixed, so draft order cannot change a number:

       eff = (base + sum of matching `add`) x product of matching `mul`

   A mod key matches (id, scope) when it equals `id` -- the unscoped form
   applies to every scope -- or `id.scope`. So `hard` softens every material
   and `hard.stone` softens one, and both stack. */

import { TUNE } from '../data/tuning.js';
import { bump } from './epoch.js';

/* Active modifier rows. `src` is the granting trinket or boon id, so losing
   one removes exactly its own rows. */
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

/* Per-scope base override. */
const baseOf = (t, scope) =>
  (scope !== undefined && t.scoped && t.scoped[scope] !== undefined)
    ? t.scoped[scope] : t.base;

/* The one reader. `scope` is a substance id for `hard`, a machine id for
   `rate` / `yield`, and omitted for the plain player values. */
export function eff(id, scope) {
  const t = TUNE[id];
  /* A missing tunable is a programming error: every key in `data/` is proved
     to resolve, so this throws rather than returning a plausible zero. */
  if (!t) throw new Error(`eff: no tunable "${id}"`);
  let add = 0, mul = 1;
  for (const m of mods.rows) {
    if (!applies(m.key, id, scope)) continue;
    if (m.add !== undefined) add += m.add;
    if (m.mul !== undefined) mul *= m.mul;
  }
  return (baseOf(t, scope) + add) * mul;
}

/* Scale a literal that lives on a data row: hardness on a substance, `secs`
   on a recipe. */
export const scaled = (id, scope, literal) => literal * eff(id, scope);

/* Which rows currently bend `id`, for a debug overlay and the check tool. */
export const explain = id =>
  mods.rows.filter(m => m.key === id || m.key.startsWith(id + '.'));
