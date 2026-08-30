/* Drains model/journal.js and turns rows into sound. This is the only place
   that may call into a device, which is why `rules` no longer imports
   core/sfx.js — 5 of the 16 illegal edges in src/ today are exactly that.

   STUB (leaf): the synth. The mapping table is the part that is content. */

import { write as jw } from '../model/journal.js';

const SOUND = { accept: 'ignite', produce: 'ingot', break: 'breakHard',
                pickup: 'pickup', bleed: 'hurt', ignite: 'ignite', hurt: 'hurt' };

export function drain() {
  for (const e of jw.drain()) {
    const name = SOUND[e.kind];
    if (name) void name;          // play(name, clock.t)
  }
}
