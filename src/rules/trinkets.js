/* LAYER rules — DRAFTING AND LOSING TRINKETS. The passive-modifier tier.
   Imports `data`, `model`. Imports no other `rules` module.

   Nine lines of consequence, because the whole mechanism is
   `data/trinkets.js` -> `model/mods.js`. There is no trinket-specific code
   anywhere in the project: a trinket that changes walk speed and a trinket that
   softens one material take the same path, and so will the fortieth.

   `removeBySource` is the half that a static field cannot express. `WALK *= 1.15`
   cannot be undone, does not stack with a second copy, and silently changes
   every reader. A row keyed by its source can be withdrawn exactly. */

import { TRINKET, TRINKETS } from '../data/trinkets.js';
import { push } from '../model/journal.js';
import { write as modw } from '../model/mods.js';
import { run, write as rw } from '../model/run.js';

export function equip(id) {
  const t = TRINKET[id];
  /* A missing trinket is a programming error, not a content error: the resolver
     has already proved every id in `data/` resolves. So this throws. */
  if (!t) throw new Error(`equip: no trinket "${id}"`);
  if (run.trinkets.includes(id)) return false;
  rw.equip(id);
  modw.add(id, t.mods);
  push('grant', null, { trinket: id, name: t.name, text: t.text });
  return true;
}

export function unequip(id) {
  if (!run.trinkets.includes(id)) return false;
  modw.removeBySource(id);
  rw.unequip(id);
  push('lost', null, { trinket: id });
  return true;
}

/* The candidates a draft may offer. The 1-of-3 draft itself, and the rule that
   two gods may not both be pleased, are a director's decision and not this
   file's — this only says which rows are still available. */
export const draftable = () => TRINKETS.filter(t => !run.trinkets.includes(t.id));
