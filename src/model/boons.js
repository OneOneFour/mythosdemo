/* model layer — the timed boon tier's run-scoped state.

   `active` is `{ id, left }` rows in grant order: appended on a fresh grant,
   never reordered, and `rules/boons.js#step` reads that order to tell which
   of two conflicting boons is the older. Re-granting an active boon refreshes
   `left` in place rather than pushing a second row. */

import { bump } from './epoch.js';

export const boons = { active: [] };

export const write = {
  /* `secs` is `data/boons.js#BOON[id].secs`, passed in so this file needs no
     `data` import. */
  grant(id, secs) {
    const row = boons.active.find(a => a.id === id);
    if (row) row.left = secs;
    else boons.active.push({ id, left: secs });
    bump();
  },

  /* `dt` is the fixed simulation step, never a variable frame delta. */
  tick(dt) {
    for (const a of boons.active) a.left -= dt;
    bump();
  },

  expire(id) {
    const i = boons.active.findIndex(a => a.id === id);
    if (i >= 0) boons.active.splice(i, 1);
    bump();
  },

  clear() { boons.active.length = 0; bump(); }
};
