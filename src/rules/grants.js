/* LAYER rules — GRANTS: the MACHINE tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Imports `data`, `model`.
   Imports no other `rules` module.

   THIS IS THE WHOLE GRANT LAYER. Fifteen lines, because `data/machines.js` is a
   plain frozen table read at placement time and there is no boot compile step —
   so nothing in the project has to support "late" content. This file adds an id
   to `run.granted` and `rules/placement.js` refuses anything not in it.
   See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */

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

/* Grants not yet taken. Same shape as every other tier's `draftable`
   -- see docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */
export const draftable = () => GRANTS.filter(g => !canPlace(g.grants));
