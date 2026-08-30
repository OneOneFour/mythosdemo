/* LAYER model — the journal. NOTIFICATION FLOWS DOWNWARD, AS DATA.
   Imports `model` only. May be imported by `model`, `rules`, `view`;
   `shell/notify.js` is the drain.

   `rules` never calls `play()` or `toast()`. It pushes a row here, and `shell`
   drains it once a frame and turns rows into sound, chips and text. Nothing
   calls upward, which is what lets the dependency direction be a RULE rather
   than a hope: audio is a device, devices live in `shell`, and a call from
   `rules` to `shell` would be an illegal edge.

   COST, stated where it is paid: a drained event is seen one frame late,
   ordering between two consumers is implicit rather than a call stack, and a
   `shell` that forgets to drain loses feedback silently instead of throwing.
   `play('pick')` is worse architecture and better debugging. The mitigation is
   the smallest honest one -- `drain()` warns when the queue has grown past a
   frame's worth of plausible events.

   A JOURNAL ROW IS A FACT, NOT AN INSTRUCTION. `kind` is a bare string, `at` is
   world px or null, `data` is whatever the consumer needs. Deliberately untyped:
   the moment a row says "play this sound", the queue has become a call stack
   with extra steps.

   The kind vocabulary is mapped to sound in `data/sfx.js`. A kind with no entry
   there is silent on purpose -- not every fact is audible. */

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

/* Non-destructive read, for a debug overlay and for the check tool. Draining
   twice is the bug this exists to avoid. */
export const peek = () => journal.slice();
