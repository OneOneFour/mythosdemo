/* LAYER shell — drains the journal into sound and text.

   This is the downward-notification loop closing. `rules` pushed rows; nothing
   called upward; this file is the only thing in the project that may touch a
   device. The mapping from journal kind to sound is a table, so adding an event
   is a row and not a branch.

   STUBBED LEAF: `play()` writes to nothing. The ZzFX call and the toast queue
   are devices, and devices are out of scope for a prototype nobody runs.

   The honest cost, once more because this is where it is paid: an event is
   consumed one frame after it happened, and if this function is not called the
   feedback vanishes with no error. `journal.write.drain()` warns above 512 rows,
   which is the cheapest available smoke alarm. */

import { SFX } from '../data/sfx.js';
import { SUB, S } from '../data/substances.js';
import { write as journalw } from '../model/journal.js';

/* journal kind -> what to do about it. A row per event kind. */
const REACTIONS = {
  dig:      row => sfxFor(row, 'break', 'pick'),
  break:    row => sfxFor(row, 'break', 'breakSoft'),
  pickup:   row => sfxFor(row, 'pickup', 'pickup'),
  accept:   () => play('ignite'),
  produce:  () => play('ingot'),
  lift:     () => play('winch'),
  hurt:     () => play('hurt'),
  land:     () => {},
  placed:   row => toast(`${row.data.machine.toUpperCase()} PLACED`),
  refused:  row => toast(row.data.why),
  boon:     row => toast(row.data.text),
  'boon-lost': row => toast('THE GIFT IS WITHDRAWN')
};

export function drainJournal() {
  for (const row of journalw.drain()) {
    const react = REACTIONS[row.kind];
    if (!react) { console.warn(`journal: nothing consumes "${row.kind}"`); continue; }
    react(row);
  }
}

/* The substance row names its own sounds, so this never names a substance. */
function sfxFor(row, slot, fallback) {
  const sub = SUB[S[row.data.sub]];
  play(sub?.look?.sfx?.[slot] || fallback);
}

function play(name) {
  if (!(name in SFX)) { console.warn(`sfx: no row "${name}"`); return; }
  /* STUB: the device call goes here. */
}

function toast(_text) { /* STUB: the toast queue goes here. */ }
