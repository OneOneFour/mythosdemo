/* LAYER rules — GRANTS: the MACHINE tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Imports `data`, `model`.
   Imports no other `rules` module.

   Renamed from `rules/boons.js`, verbatim, per `docs/BUILD_PLAN.md` Phase 4
   Step 1 -- "boon" is now the TIMED tier's name (`data/boons.js`,
   `rules/boons.js`), and this file was only ever called "boons" because that
   tier did not exist yet. `grant()` and `draftable()` keep their names.

   The trinket tier bends a number; this tier changes WHAT THE PLAYER MAY PLACE.
   Two tiers because they are two different kinds of change, and collapsing them
   would mean a grant that hands out a machine had to be expressed as a modifier
   on something.

   THIS IS THE WHOLE GRANT LAYER. Fifteen lines, because `data/machines.js` is a
   plain frozen table read at placement time and there is no boot compile step —
   so nothing in the project has to support "late" content. `rules/grants.js`
   adds an id to `run.granted` and `rules/placement.js` refuses anything not in
   it. That is why granting a machine mid-run costs no architecture. */

import { GRANT, GRANTS } from '../data/grants.js';
import { M } from '../data/machines.js';
import { push } from '../model/journal.js';
import { canPlace, write as rw } from '../model/run.js';

export function grant(grantId) {
  const g = GRANT[grantId];
  if (!g) throw new Error(`grant: no grant "${grantId}"`);
  if (M[g.grants] === undefined)
    throw new Error(`grant: grant "${grantId}" grants unknown machine "${g.grants}"`);
  if (canPlace(g.grants)) return false;
  rw.grant(g.grants);
  push('grant', null, { grant: grantId, name: g.name, text: g.text, machine: g.grants });
  return true;
}

/* Grants not yet taken. Same shape as `rules/trinkets.js#draftable` and
   `rules/boons.js#draftable`, so a draft panel can offer all tiers from one
   list without knowing which is which. */
export const draftable = () => GRANTS.filter(g => !canPlace(g.grants));
