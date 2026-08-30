/* LAYER rules — BOONS: the MACHINE-GRANT tier. Imports `data`, `model`.
   Imports no other `rules` module.

   The trinket tier bends a number; this tier changes WHAT THE PLAYER MAY PLACE.
   Two tiers because they are two different kinds of change, and collapsing them
   would mean a boon that grants a machine had to be expressed as a modifier on
   something.

   THIS IS THE WHOLE GRANT LAYER. Fifteen lines, because `data/machines.js` is a
   plain frozen table read at placement time and there is no boot compile step —
   so nothing in the project has to support "late" content. `rules/boons.js` adds
   an id to `run.granted` and `rules/placement.js` refuses anything not in it.
   That is why granting a machine mid-run costs no architecture. */

import { BOON, BOONS } from '../data/boons.js';
import { M } from '../data/machines.js';
import { push } from '../model/journal.js';
import { canPlace, write as rw } from '../model/run.js';

export function grant(boonId) {
  const b = BOON[boonId];
  if (!b) throw new Error(`grant: no boon "${boonId}"`);
  if (M[b.grants] === undefined)
    throw new Error(`grant: boon "${boonId}" grants unknown machine "${b.grants}"`);
  if (canPlace(b.grants)) return false;
  rw.grant(b.grants);
  push('grant', null, { boon: boonId, name: b.name, text: b.text, machine: b.grants });
  return true;
}

/* Boons not yet taken. Same shape as `rules/trinkets.js#draftable`, so a draft
   panel can offer both tiers from one list without knowing which is which. */
export const draftable = () => BOONS.filter(b => !canPlace(b.grants));
