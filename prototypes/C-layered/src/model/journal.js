/* LAYER model — the journal. Notification flows DOWNWARD as data.

   `rules` never calls `play()` or `toast()`. It pushes a row here; `shell`
   drains it once a frame and turns rows into sound, chips and text. Nothing
   calls upward, which is what lets `tools/layers.mjs` state the dependency
   direction as a rule rather than a hope.

   Cost, stated where it is paid (RFC 04 weakness 3): a drained event is seen
   one frame late, ordering between two consumers is implicit rather than a call
   stack, and a `shell` that forgets to drain loses feedback silently instead of
   throwing. `play('pick')` is worse architecture and better debugging. The
   mitigation here is the smallest honest one: `drain()` warns if the queue has
   grown past a frame's worth of plausible events. */

import { bump } from './epoch.js';

export const journal = [];

/* kind is a bare string; `at` is world px or null; `data` is whatever the
   consumer in `shell` needs. Deliberately untyped: a journal row is a fact,
   not an instruction. */
export function push(kind, at, data) {
  journal.push({ kind, at, data });
  bump();
}

export const write = {
  drain() {
    if (journal.length > 512)
      console.warn(`journal: ${journal.length} rows — is shell draining?`);
    const rows = journal.slice();
    journal.length = 0;
    bump();
    return rows;
  }
};
