/* shell layer — drains `model/journal.js` once a frame into sound, chips and
   text. A row's `kind` is a fact; what to do about it is decided here. */

import { MACH } from '../data/machines.js';
import { colour } from '../data/palette.js';
import { KIND_SFX } from '../data/sfx.js';
import { FORM, labelOf } from '../data/forms.js';
import { SUB } from '../data/substances.js';
import { write as journalw } from '../model/journal.js';
import { burst, title as banner, toast } from '../view/fx.js';
import { play } from './audio.js';

/* Chips per event kind. Cosmetic, so the numbers live here rather than on a
   content row. */
const CHIPS = {
  pick:       { n: 1, spread: 50 },
  breakSoft:  { n: 6, spread: 90 },
  breakHard:  { n: 9, spread: 110 },
  drop:       { n: 0, spread: 0 },
  pickup:     { n: 3, spread: 30 },
  accept:     { n: 4, spread: 40 },
  produce:    { n: 5, spread: 60 },
  hurt:       { n: 10, spread: 130 },
  tribute:    { n: 2, spread: 26 },
  cycle:      { n: 14, spread: 150 },
  debt:       { n: 8, spread: 120 },
  relic:      { n: 7, spread: 45 }
};

/* Text for the kinds that get a line; a kind with no entry here prints
   nothing. */
const TEXT = {
  hurt:    row => row.data?.cause
    ? `${row.data.cause} COST ${row.data.hearts} HEART${row.data.hearts > 1 ? 'S' : ''}`
    : '',
  refused: row => row.data?.why || '',
  place:   row => row.data?.machine
    ? MACH.find(m => m.id === row.data.machine)?.name + ' PLACED'
    : (row.data && row.data.sub !== undefined ? labelOf(row.data.sub, row.data.form) + ' PLACED' : ''),
  /* A drafted grant carries its own `text`/`name` from `data/grants.js`; an
     awarded one carries only the machine id, so the copy comes off `MACH`. */
  grant:   row => row.data?.text || row.data?.name ||
    (row.data?.machine
      ? (MACH.find(m => m.id === row.data.machine)?.name ?? '') + ' IS GRANTED'
      : ''),
  lost:    () => 'THE GIFT IS WITHDRAWN',
  /* `SUB[sub].name` rather than `labelOf`: every relic drop is `F.relic`, so
     the form's label would only repeat "RELIC" after the substance's name. */
  relic:   row => row.data?.sub !== undefined ? `${SUB[row.data.sub].name} APPEARS` : '',
  winch:   row => row.data?.units
    ? `${row.data.units} DELIVERED TO ${String(row.data.to).toUpperCase()}`
    : '',
  death:   row => row.data?.cause || '',

  /* `toast()` keeps one line, so a ten-unit hand-feed refreshes one line
     rather than stacking ten. */
  tribute: row => row.data
    ? `${row.data.n} ${labelOf(row.data.sub, row.data.form)} TITHED`
    : '',
  debt:    row => row.data?.god
    ? `${String(row.data.god).toUpperCase()} TURNS AWAY -- ` +
      `${row.data.hearts || 0} HEART${row.data.hearts === 1 ? '' : 'S'}, ` +
      `${row.data.favour || 0} FAVOUR`
    : 'A TRIBUTE WENT UNPAID',
  win:     () => 'THE GODS ARE ANSWERED'
};

/* The one kind that gets a banner instead of a toast: a completion frame holds
   several facts, and `toast()` keeps only the newest. */
const BANNERS = {
  cycle: row => row.data?.god
    ? { text: String(row.data.god).toUpperCase(), sub: 'IS SATISFIED', secs: 2.6 }
    : null
};

export function drainJournal(t) {
  for (const row of journalw.drain()) {
    const sound = soundFor(row);
    if (sound) play(sound, t);

    const chip = CHIPS[row.kind];
    if (chip && chip.n && row.at) burst(row.at.x, row.at.y, chip.n, inkFor(row), chip.spread);

    const bannerFor = BANNERS[row.kind];
    const b = bannerFor ? bannerFor(row) : null;
    if (b) banner(b.text, b.sub, b.secs);

    const text = TEXT[row.kind];
    if (text) toast(text(row));
  }
}

/* A machine row's `look.sfx` may name the sound for its own kind; otherwise
   the kind maps through `KIND_SFX` in `data/sfx.js`, and an unmapped kind is
   silent. */
function soundFor(row) {
  const def = row.data?.def !== undefined ? MACH[row.data.def] : null;
  const slot = def?.look?.sfx?.[row.kind];
  return slot || KIND_SFX[row.kind];
}

/* Chip colour off the substance's `look`: its item tint if it has one, its rock
   tint otherwise. A row with no substance falls back to the machine's trim. */
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
