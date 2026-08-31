/* LAYER model — BOONS: the TIMED tier's run-scoped state.
   Imports `model` only. May be imported by `model`, `rules`, `view`.

   `active` is a plain array of `{ id, left }`, in GRANT ORDER (append on a
   fresh grant, never reordered) -- `rules/boons.js#step` reads that order to
   decide which of two conflicting boons is "the older one" a later gift
   suppresses or inverts. Storage only: the DECISION about what a conflict
   does to a number lives in `rules/boons.js`, the same split every other
   `model`/`rules` pair in this project already makes.

   Re-granting a boon already in `active` REFRESHES `left` in place rather
   than pushing a second row -- `docs/BUILD_PLAN.md` Phase 4: "re-applying
   the same boon REFRESHES duration and does not stack magnitude." */

import { bump } from './epoch.js';

export const boons = { active: [] };

export const write = {
  /* `secs` is the boon's own `data/boons.js#BOON[id].secs`, passed in rather
     than looked up here so this file stays free of a `data` import it does
     not otherwise need -- `rules/boons.js` already has the row in hand. */
  grant(id, secs) {
    const row = boons.active.find(a => a.id === id);
    if (row) row.left = secs;
    else boons.active.push({ id, left: secs });
    bump();
  },

  /* Decrement every active boon by the SAME fixed step -- never a variable
     dt (ARCHITECTURE invariant 10). Expiry itself is a `rules` decision
     (`rules/boons.js#step` calls `expire` once `left` reaches zero); this
     only ticks the clock. */
  tick(dt) {
    for (const a of boons.active) a.left -= dt;
    bump();
  },

  expire(id) {
    const i = boons.active.findIndex(a => a.id === id);
    if (i >= 0) boons.active.splice(i, 1);
    bump();
  },

  /* Called from `shell/boot.js` alongside every other model clear --
     ARCHITECTURE invariant 8: a field surviving a restart is a determinism
     bug. */
  clear() { boons.active.length = 0; bump(); }
};
