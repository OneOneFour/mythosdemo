/* LAYER shell — THE JOURNAL DRAIN. Turns facts into sound, chips and text.
   Imports `core`, `data`, `model` (read + the journal drain), and `view/fx.js`.

   ============================================================================
   THIS FILE IS WHERE NOTIFICATION FLOWING DOWNWARD CLOSES THE LOOP.
   `rules` pushed rows. Nothing called upward. This drains the queue once per
   frame and is the only thing that may touch a device or a text queue. That is
   what makes the dependency direction a RULE rather than a hope.

   A JOURNAL ROW IS A FACT, NOT AN INSTRUCTION. `kind` is a bare string; what to
   do about it is decided HERE. The kind -> sound mapping is `KIND_SFX` in
   `data/sfx.js`, so adding an audible event is a row and not a branch, and a
   kind with no entry there is SILENT ON PURPOSE — not every fact is audible.

   COST, paid where it is stated: an event is consumed one frame after it
   happened, ordering between two consumers is implicit rather than a call stack,
   and a `shell` that forgets to call `drain()` loses feedback silently instead
   of throwing. `model/journal.js#drain` warns past 512 rows, which is the
   cheapest available smoke alarm.
   ============================================================================

   A MACHINE ROW MAY OVERRIDE ITS OWN SOUND. `look.sfx` on a `data/machines.js`
   row names a sound for the `accept` and `produce` slots, which is how the
   divine kiln rings differently and the winch groans instead — with no machine
   name anywhere in this file and no new journal kind. */

import { MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { KIND_SFX } from '../data/sfx.js';
import { FORM, labelOf } from '../data/forms.js';
import { SUB } from '../data/substances.js';
import { write as journalw } from '../model/journal.js';
import { burst, toast } from '../view/fx.js';
import { play } from './audio.js';

/* Chips per event kind. Cosmetic, so the numbers live here rather than on a
   content row: a designer tuning copper does not want to think about sparks. */
const CHIPS = {
  pick:       { n: 1, spread: 50 },
  breakSoft:  { n: 6, spread: 90 },
  breakHard:  { n: 9, spread: 110 },
  drop:       { n: 0, spread: 0 },
  pickup:     { n: 3, spread: 30 },
  accept:     { n: 4, spread: 40 },
  produce:    { n: 5, spread: 60 },
  hurt:       { n: 10, spread: 130 }
};

/* Text for the kinds that deserve a line. Everything else is silent text-wise:
   a toast for every pickaxe strike is noise, not feedback. */
const TEXT = {
  hurt:    row => row.data?.cause
    ? `${row.data.cause} COST ${row.data.hearts} HEART${row.data.hearts > 1 ? 'S' : ''}`
    : '',
  refused: row => row.data?.why || '',
  place:   row => row.data?.machine
    ? MACH.find(m => m.id === row.data.machine)?.name + ' PLACED'
    : (row.data && row.data.sub !== undefined ? labelOf(row.data.sub, row.data.form) + ' PLACED' : ''),
  grant:   row => row.data?.text || row.data?.name || '',
  lost:    () => 'THE GIFT IS WITHDRAWN',
  winch:   row => row.data?.units
    ? `${row.data.units} DELIVERED TO ${String(row.data.to).toUpperCase()}`
    : '',
  death:   row => row.data?.cause || ''
};

export function drainJournal(t) {
  for (const row of journalw.drain()) {
    /* A kind with no sound is silent by design, so an unmapped kind is not a
       warning: `data/sfx.js` decides what is audible. */
    const sound = soundFor(row);
    if (sound) play(sound, t);

    const chip = CHIPS[row.kind];
    if (chip && chip.n && row.at) burst(row.at.x, row.at.y, chip.n, inkFor(row), chip.spread);

    const text = TEXT[row.kind];
    if (text) toast(text(row));
  }
}

/* The row's own machine may name the sound; otherwise the kind maps to one.
   Neither path names a machine or a substance here. */
function soundFor(row) {
  const def = row.data?.def !== undefined ? MACH[row.data.def] : null;
  const slot = def?.look?.sfx?.[row.kind];
  return slot || KIND_SFX[row.kind];
}

/* Chip colour off the substance's `look`: its item tint if it has one, its rock
   tint otherwise. A form with no substance (a machine event) falls back to the
   machine's trim. */
function inkFor(row) {
  const d = row.data;
  if (d && d.sub !== undefined && d.sub >= 0) {
    const l = SUB[d.sub].look;
    const name = (d.form !== undefined && d.form >= 0 && FORM[d.form] && l.item)
      ? l.item[0] : (l.base ?? l.item?.[0]);
    if (name) return colour(name);
  }
  if (d && d.def !== undefined) return colour(MACH[d.def].look.trim);
  return colour('ui');
}
