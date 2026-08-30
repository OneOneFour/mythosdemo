/* LAYER rules — drafting and losing trinkets. DESIGN item 8's other half.

   Nine lines of consequence, because the whole mechanism is
   `data/trinkets.js` -> `model/mods.js`. There is no trinket-specific code
   anywhere: a trinket that changes walk speed and a trinket that changes one
   material's hardness take the same path, and so will the fortieth. */

import { TRINKET, TRINKETS } from '../data/trinkets.js';
import { write as modw } from '../model/mods.js';
import { run, write as rw } from '../model/run.js';
import { push } from '../model/journal.js';

export function equip(id) {
  const t = TRINKET[id];
  if (!t) throw new Error(`equip: no trinket "${id}"`);   // resolver-checked
  if (run.trinkets.includes(id)) return false;
  rw.equip(id);
  modw.add(id, t.mods);
  push('boon', null, { trinket: id, text: t.text });
  return true;
}

/* Losing one removes exactly its own rows. This is the failure mode that
   writing a static class field cannot express: `Pick.power = 2` cannot be
   undone, does not stack, and silently changes every subclass. */
export function unequip(id) {
  modw.removeBySource(id);
  rw.unequip(id);
  push('boon-lost', null, { trinket: id });
}

/* A draft is three rows the player does not already hold. The 1-of-3 draft and
   the god-hostility rule (DESIGN item 11) are a `rules/director.js` decision;
   this only offers the candidates. */
export const draftable = () => TRINKETS.filter(t => !run.trinkets.includes(t.id));
