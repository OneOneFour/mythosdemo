/* ============================================================
   RUN-SCOPED STATE. Reset wholesale between Torments (DESIGN item 3).

   The split the design needs: everything here dies with the run; META lives
   across runs and holds only stolen recipes and banked favour.

   `hearts` is here and not on the player record because it is a run
   resource, and because rules/parts/bloodburner.js spends it. That is the
   only reason the blood winch needs no new concept: hearts were already a
   spendable account, exactly like an inventory, and the `heat` slot hides
   the difference from everything downstream.
   ============================================================ */

import { bump } from './epoch.js';

export const run = {
  seed: 1337, t: 0, dead: false, cause: '',
  hearts: 5, maxHearts: 5, invuln: 0,
  inv: Object.create(null),           // substanceIndex -> count
  cycle: 0, suspicion: 0, deepest: 0,
  toast: '', toastT: 0
};

export const META = { recipes: [], favour: Object.create(null), metHades: false };

export const invCount = sub => run.inv[sub] ?? 0;

export const write = {
  collect(sub, n = 1) { run.inv[sub] = invCount(sub) + n; bump(); },

  spend(sub, n = 1) {
    if (invCount(sub) < n) return false;
    run.inv[sub] -= n;
    bump();
    return true;
  },

  /* The blood winch's only privilege, and it is not a privilege: any rule
     may spend hearts. `cause` is what the death screen reads. */
  spendHearts(n, cause) {
    if (run.hearts < n) return false;
    run.hearts -= n;
    if (run.hearts <= 0) { run.dead = true; run.cause = cause; }
    bump();
    return true;
  },

  reset(seed) {
    Object.assign(run, { seed, t: 0, dead: false, cause: '', hearts: 5,
                         maxHearts: 5, invuln: 0, inv: Object.create(null),
                         cycle: 0, suspicion: 0, deepest: 0, toast: '', toastT: 0 });
    bump();
  },

  toast(msg, secs = 3.2) { run.toast = msg; run.toastT = secs; bump(); }
};
