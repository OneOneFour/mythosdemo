/* LAYER rules — GRANTS: the MACHINE tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Imports `data`, `model`.
   Imports no other `rules` module.

   THIS IS THE WHOLE GRANT LAYER, because `data/machines.js` is a plain frozen
   table read at placement time and there is no boot compile step — so nothing
   in the project has to support "late" content. This file adds an id to
   `run.granted` and `rules/placement.js` refuses anything not in it.
   See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers

   TWO ENTRY POINTS, ONE EFFECT: `grant(grantId)` for a DRAFTED
   `data/grants.js` row, and `award(machineId)` for a machine handed over
   outright as a cycle reward, drained off `run.awarded` by `step()`. Both
   end in the same `write.grant` + `'grant'` journal row; see `award`'s own
   header for why that is one path and not two. */

import { GRANT, GRANTS } from '../data/grants.js';
import { M } from '../data/machines.js';
import { push } from '../model/journal.js';
import { canPlace, run, write as rw } from '../model/run.js';

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

/* ---- THE REWARD-GRANT BRIDGE (Phase 13d, docs/SPEC.md section 20.3) ------
   A cycle reward hands out a MACHINE ID, not a `data/grants.js` row id --
   cycle 1's `furnace` and `cloud_dock` have no GRANT row and must not get
   one, because a GRANT row is by definition draftable
   (`draftable()` below) and neither of those is a draft. So `award()` is
   `grant()`'s other half: the same two effects, `write.grant` plus a
   `'grant'` journal row, entered from a machine id instead of from a
   content row.

   WHY THIS IS NOT A SECOND GRANT PATH. Both functions in this file, and
   nothing else in `src/`, call `model/run.js#write.grant`. Before this
   phase `rules/cycles.js:155` called it directly and pushed nothing, which
   is exactly what a second path looks like; this replaces that with a queue
   the director writes and this module drains. There is one writer of
   `run.granted` reachable from a rule, one place a `'grant'` row is pushed,
   and one journal kind for both tiers.

   `step()` IS SCHEDULED, NOT IMPORTED. `shell/schedule.js` runs it
   immediately after `rules/cycles.js` -- the adjacency is argued in that
   file -- so an award lands in the same substep the trial was paid in, with
   none of the one-frame latency `shell/main.js#applyIntents` would add and
   none of the sibling import `tools/layers.mjs` forbids. It clears the queue
   BEFORE performing it, so an award that somehow re-entered here could not
   be performed twice, and the drain is idempotent on an empty queue (the
   overwhelmingly common case -- one comparison per frame). */
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
  rw.grant(machineId);
  push('grant', null, { machine: machineId });
  return true;
}

/* Grants not yet taken. Same shape as every other tier's `draftable`
   -- see docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */
export const draftable = () => GRANTS.filter(g => !canPlace(g.grants));
