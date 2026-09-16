/* LAYER rules — GRANTS: the MACHINE gift tier. Imports `data`, `model`, and
   no other `rules` module.

   THIS IS THE WHOLE GRANT LAYER, because `data/machines.js` is a plain frozen
   table read at placement time and there is no boot compile step -- so
   nothing has to support "late" content. This file adds an id to
   `run.granted` and `rules/placement.js` refuses anything not in it.

   TWO ENTRY POINTS, ONE EFFECT: `grant(grantId)` for a DRAFTED row, and
   `award(machineId)` for a machine handed over as a cycle reward. Both end in
   the same `write.grant` plus `'grant'` journal row. */

import { GRANT, GRANTS } from '../data/grants.js';
import { M } from '../data/machines.js';
import { push } from '../model/journal.js';
import { canPlace, mirrorOf, run, write as rw } from '../model/run.js';

/* A MIRRORED PAIR IS ONE GIFT. Both entry points go through here, so no
   content row ever names a `_l` id and a granted `talos_head` can be placed
   facing either way the frame it arrives. */
function grantPair(machineId) {
  rw.grant(machineId);
  const mirror = mirrorOf(machineId);
  if (mirror) rw.grant(mirror);
}

export function grant(grantId) {
  const g = GRANT[grantId];
  if (!g) throw new Error(`grant: no grant "${grantId}"`);
  if (M[g.grants] === undefined)
    throw new Error(`grant: grant "${grantId}" grants unknown machine "${g.grants}"`);
  if (canPlace(g.grants)) return false;
  grantPair(g.grants);
  push('grant', null, { grant: grantId, name: g.name, text: g.text, machine: g.grants });
  return true;
}

/* THE REWARD-GRANT BRIDGE. A cycle reward hands out a MACHINE ID rather than
   a `data/grants.js` row id -- cycle 1's `furnace` and `cloud_dock` have no
   GRANT row and must not get one, because a GRANT row is by definition
   DRAFTABLE. So `award()` is `grant()`'s other half, entered from a machine
   id. NOT a second grant path: both functions here, and nothing else in
   `src/`, call `write.grant`.

   `step()` IS SCHEDULED, NOT IMPORTED, immediately after `rules/cycles.js`,
   so an award lands in the same substep the trial was paid in. It CLEARS the
   queue before performing it, so a re-entry could not perform twice. */
export function step() {
  if (!run.awarded) return;
  const ids = run.awarded;
  rw.award(null);
  for (const id of ids) award(id);
}

/* Grant one machine id outright. Returns false when it was already granted,
   the same "one is enough" answer `grant()` above gives. The journal row
   carries only the machine id: `shell/notify.js` composes the line from the
   machine's own `name`, so no display copy lives in `rules`. */
export function award(machineId) {
  if (M[machineId] === undefined)
    throw new Error(`grant: award of unknown machine "${machineId}"`);
  if (canPlace(machineId)) return false;
  grantPair(machineId);
  push('grant', null, { machine: machineId });
  return true;
}

/* Grants not yet taken. Same shape as every other tier's `draftable`
   -- */
export const draftable = () => GRANTS.filter(g => !canPlace(g.grants));
