/* ============================================================
   THE JOURNAL — notification flows DOWNWARD as data.

   `rules` never calls up into audio, toasts or the renderer; it pushes a row
   here and `shell` drains it. That is what lets the layer checker forbid
   `rules -> core/sfx`, which is 5 of the 16 illegal edges in src/ today.

   Honest cost, from RFC 04's own weakness 3: consumers see an event one
   frame late, ordering between consumers is implicit rather than a call
   stack, and a missed drain loses feedback silently instead of throwing.
   `play('pick')` is worse architecture and better debugging.
   ============================================================ */

import { bump } from './epoch.js';

export const journal = [];

export const write = {
  push(kind, a, b) { journal.push({ kind, a, b }); bump(); },
  drain() { const out = journal.splice(0, journal.length); bump(); return out; }
};
