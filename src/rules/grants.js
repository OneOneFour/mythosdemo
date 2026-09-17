/* rules layer — the machine gift tier. Adds an id to `run.granted`, which
   `rules/placement.js` checks before placing anything. `grant(grantId)` takes
   a drafted `data/grants.js` row, `award(machineId)` a machine handed over as
   a cycle reward; both end in `write.grant` and a `'grant'` journal row. */

import { GRANT, GRANTS } from '../data/grants.js';
import { M } from '../data/machines.js';
import { push } from '../model/journal.js';
import { canPlace, mirrorOf, run, write as rw } from '../model/run.js';

/* Grant a machine and its mirror as one gift, so no content row names a `_l`
   id and a granted `talos_head` can face either way immediately. */
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

/* Drain `run.awarded`, whose entries are machine ids rather than
   `data/grants.js` row ids. Clears the queue before performing it, so a
   re-entry cannot award twice. */
export function step() {
  if (!run.awarded) return;
  const ids = run.awarded;
  rw.award(null);
  for (const id of ids) award(id);
}

/* Grant one machine id outright; false if it was already granted. The journal
   row carries only the id — `shell/notify.js` composes the line from the
   machine's own `name`. */
export function award(machineId) {
  if (M[machineId] === undefined)
    throw new Error(`grant: award of unknown machine "${machineId}"`);
  if (canPlace(machineId)) return false;
  grantPair(machineId);
  push('grant', null, { machine: machineId });
  return true;
}

export const draftable = () => GRANTS.filter(g => !canPlace(g.grants));
