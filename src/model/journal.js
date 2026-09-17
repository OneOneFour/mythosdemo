/* model layer — a queue of facts `rules` pushes and `shell/notify.js` drains
   once a frame.

   `kind` is a bare string, `at` is world px or null, `data` is whatever the
   consumer needs. A row is a fact and never an instruction, and a kind with no
   entry in `data/sfx.js` is silent. */

import { bump } from './epoch.js';

export const journal = [];

export function push(kind, at = null, data = null) {
  journal.push({ kind, at, data });
  bump();
}

export const write = {
  drain() {
    if (journal.length > 512)
      console.warn(`journal: ${journal.length} rows -- is shell draining?`);
    const rows = journal.slice();
    journal.length = 0;
    bump();
    return rows;
  },

  clear() { journal.length = 0; bump(); }
};

/* Non-destructive read, for a debug overlay and the check tool. */
export const peek = () => journal.slice();
