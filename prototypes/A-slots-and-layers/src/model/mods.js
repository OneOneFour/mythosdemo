/* ============================================================
   THE TUNABLE STORE — DESIGN item 8, which all six RFCs missed.

   Read a tunable:              stat('walk')            ->  60
   Read a scoped tunable:       stat('machine.rate', 'bake')
   Grant a trinket:             write.grant('winged_sandals')
   Lose it:                     write.revoke('winged_sandals')

   Stacking is by source id, so three trinkets touching `walk` compose and
   any one of them can be removed exactly. Nothing mutates a base value;
   the table in data/tunables.js stays frozen and diffable.
   ============================================================ */

import { TUNABLES } from '../data/tunables.js';
import { TRINKET } from '../data/trinkets.js';
import { bump } from './epoch.js';

/* granted: sourceId -> [ {tunable, scope, mul, add}, ... ]
   Recomputed into two flat maps on every grant/revoke, never per read. */
export const mods = { granted: new Map(), mul: new Map(), add: new Map() };

const key = (name, scope) => (scope ? name + '@' + scope : name);

export function stat(name, scope) {
  const base = TUNABLES[name];
  if (base === undefined)
    throw new Error(`unknown tunable '${name}' — add a row to data/tunables.js`);
  let m = mods.mul.get(name) ?? 1;
  let a = mods.add.get(name) ?? 0;
  if (scope !== undefined) {
    const k = key(name, scope);
    m *= mods.mul.get(k) ?? 1;
    a += mods.add.get(k) ?? 0;
  }
  return (base + a) * m;
}

/* Convenience for the common "seconds scaled by a rate" shape. */
export const secsFor = (secs, tag) => secs / stat('machine.rate', tag);

function recompute() {
  mods.mul.clear(); mods.add.clear();
  for (const list of mods.granted.values())
    for (const m of list) {
      const k = key(m.tunable, m.scope);
      if (m.mul !== undefined) mods.mul.set(k, (mods.mul.get(k) ?? 1) * m.mul);
      if (m.add !== undefined) mods.add.set(k, (mods.add.get(k) ?? 0) + m.add);
    }
  bump();
}

export const write = {
  /* Grant a trinket by id. Validates every tunable name at grant time, so a
     typo in data/trinkets.js throws when the boon is drafted, naming the
     trinket and the bad key — not silently doing nothing forever. */
  grant(trinketId) {
    const t = TRINKET[trinketId];
    if (!t) throw new Error(`unknown trinket '${trinketId}'`);
    for (const m of t.mods)
      if (TUNABLES[m.tunable] === undefined)
        throw new Error(`${t.id}: modifies unknown tunable '${m.tunable}'`);
    mods.granted.set(t.id, t.mods);
    recompute();
  },

  revoke(sourceId) { mods.granted.delete(sourceId); recompute(); },

  /* Non-trinket sources use the same store: a monster debuff, a Poseidon
     miracle, a temporary overheat penalty. One mechanism, not four. */
  apply(sourceId, list) { mods.granted.set(sourceId, list); recompute(); },

  clear() { mods.granted.clear(); recompute(); }
};

export const sources = () => [...mods.granted.keys()];
