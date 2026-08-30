/* LAYER model — run-scoped state: hearts, pockets, the tribute clock.

   Every field a `newRun()` must reset is declared once in RUN_SCHEMA and reset
   mechanically. The current codebase disagrees with itself about the shape of
   `run` in four places — `state.js` omits three fields that `main.js`,
   `mining.js` and `tutorial.js` each invent — and that class of bug is what a
   schema is for. */

import { SUB } from '../data/substances.js';
import { bump } from './epoch.js';

export const RUN_SCHEMA = Object.freeze({
  seed: 1337, t: 0,
  dead: false, deathCause: '',
  hearts: 5, maxHearts: 5, invuln: 0,
  hasPick: false,
  inv: null,                 // rebuilt from SUB below, so it cannot drift
  trinkets: null,            // ids of drafted trinkets; the save format
  cycle: 1, tribute: null,
  deepest: 0
});

export const run = {};

/* The pocket ledger is derived from the substance table, so appending `tin`
   gives it a pocket with no edit here and no `undefined + 1`. */
const emptyInv = () =>
  Object.fromEntries(SUB.filter(s => s.item).map(s => [s.id, 0]));

export const write = {
  reset(seed) {
    Object.assign(run, RUN_SCHEMA, {
      seed, inv: emptyInv(), trinkets: [], tribute: null
    });
    bump();
  },

  collect(subId, n) { run.inv[subId] = (run.inv[subId] || 0) + n; bump(); },

  spend(subId, n) {
    if ((run.inv[subId] || 0) < n) return false;
    run.inv[subId] -= n; bump();
    return true;
  },

  /* Hearts are spent, not consumed as an item. The blood winch reaches this
     through `data/sources.js`, never through `inv`. */
  spendHearts(n) {
    if (run.hearts - n < 1) return false;     // a machine may not kill you
    run.hearts -= n; bump();
    return true;
  },

  hurt(n, cause) {
    run.hearts -= n;
    if (run.hearts <= 0) { run.hearts = 0; run.dead = true; run.deathCause = cause; }
    bump();
  },

  equip(id)   { run.trinkets.push(id); bump(); },
  unequip(id) { run.trinkets = run.trinkets.filter(t => t !== id); bump(); }
};

export const invCount = subId => run.inv[subId] || 0;
export const hearts   = () => run.hearts;
