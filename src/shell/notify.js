/* LAYER shell — THE JOURNAL DRAIN. Turns facts into sound, chips and text.
   Imports `core`, `data`, `model` (read + the journal drain), and `view/fx.js`.

   THIS FILE IS WHERE NOTIFICATION FLOWING DOWNWARD CLOSES THE LOOP -- see
   docs/DEVELOPER_GUIDE.md#notification-and-the-journal. It drains the queue
   once per frame and is the only thing that may touch a device or a text queue.

   A JOURNAL ROW IS A FACT, NOT AN INSTRUCTION. `kind` is a bare string; what to
   do about it is decided HERE. The kind -> sound mapping is `KIND_SFX` in
   `data/sfx.js`, so adding an audible event is a row and not a branch, and a
   kind with no entry there is SILENT ON PURPOSE — not every fact is audible.

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
import { burst, title as banner, toast } from '../view/fx.js';
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
  hurt:       { n: 10, spread: 130 },
  /* Phase 13d, the cycle loop. `tribute` is deliberately the smallest burst
     in this table and `cycle` the largest: one credited unit is a small,
     repeated fact (see `data/sfx.js#MIN_GAP.tithe` -- there can be one per
     substep), and a paid trial happens at most four times a run. `win` gets
     none: it pushes `at: null`, and the burst is skipped for a row with no
     world position anyway -- the screen is the event. */
  tribute:    { n: 2, spread: 26 },
  cycle:      { n: 14, spread: 150 },
  debt:       { n: 8, spread: 120 }
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
  /* A DRAFTED grant carries its own copy (`data/grants.js`'s `text`/`name`);
     an AWARDED one -- a cycle reward, `rules/grants.js#award` -- carries only
     the machine id, because display copy for a machine already exists on the
     machine's own row and `rules` has no business composing a sentence. Same
     `MACH.find` lookup `place` above already uses. */
  grant:   row => row.data?.text || row.data?.name ||
    (row.data?.machine
      ? (MACH.find(m => m.id === row.data.machine)?.name ?? '') + ' IS GRANTED'
      : ''),
  lost:    () => 'THE GIFT IS WITHDRAWN',
  winch:   row => row.data?.units
    ? `${row.data.units} DELIVERED TO ${String(row.data.to).toUpperCase()}`
    : '',
  death:   row => row.data?.cause || '',

  /* ---- Phase 13d: the three kinds `rules/cycles.js` has pushed since Phase
     10b with nothing on this side of the journal to read them, plus the win.

     `tribute` names the pair and not a running total on purpose: the running
     total is the TRIBUTE panel's job (`view/hud.js#tribute` draws
     have/need per row and an aggregate), and a toast repeating it would be a
     second, laggier copy of the same number. `toast()` keeps ONE line
     (`view/fx.js`: "the newest fact wins"), so a ten-unit hand-feed reads as
     one line that keeps refreshing rather than ten stacking up.

     `debt` states the whole reckoning, hearts included, and is USUALLY
     SUPERSEDED WITHIN ITS OWN FRAME: `rules/cycles.js#miss` pushes this row
     and then calls `hurtFor`, whose `hurt` row toasts the cause, and the
     newest fact wins that slot. That is left as it is rather than
     reordered -- the hurt line carries the more urgent number, this row's
     SOUND and CHIPS still land, and a punishment with no hearts (none
     shipped today) would show this line instead. */
  tribute: row => row.data
    ? `${row.data.n} ${labelOf(row.data.sub, row.data.form)} TITHED`
    : '',
  /* NO `cycle` ROW HERE, deliberately: a paid trial takes the BANNER slot
     instead (see `BANNERS` below), and a toast saying the same words would
     both duplicate it and spend the one toast slot the accompanying grant
     needs. This is the "a kind with no entry is silent on purpose"
     convention `data/sfx.js` states for sound, applied to text. */
  debt:    row => row.data?.god
    ? `${String(row.data.god).toUpperCase()} TURNS AWAY -- ` +
      `${row.data.hearts || 0} HEART${row.data.hearts === 1 ? '' : 'S'}, ` +
      `${row.data.favour || 0} FAVOUR`
    : 'A TRIBUTE WENT UNPAID',
  win:     () => 'THE GODS ARE ANSWERED'
};

/* ---- THE ONE KIND THAT GETS A BANNER INSTEAD OF A TOAST -------------------
   Phase 13d. `view/fx.js#toast` keeps exactly ONE line and the newest fact
   wins, and a completion is a frame with several facts in it: the last
   `tribute` credit, the `cycle` row itself, and (cycle 1) two `grant` rows
   from `rules/grants.js#step` immediately after. Wired as a toast, the god's
   own line was therefore guaranteed to be overwritten inside its own frame by
   `THE CLOUD DOCK IS GRANTED` -- measured, not guessed. So a paid trial takes
   the BANNER slot (`view/fx.js#title`, the same one `shell/boot.js` uses for
   `MYTHOS FACTORY`/`TORMENT I`), which nothing else competes for, and the
   toast slot is left to the grant that came with it. The two then say
   different things at once, which is what the moment actually contains.
   2.6 s is `shell/boot.js`'s own figure, reused rather than re-picked. */
const BANNERS = {
  cycle: row => row.data?.god
    ? { text: String(row.data.god).toUpperCase(), sub: 'IS SATISFIED', secs: 2.6 }
    : null
};

export function drainJournal(t) {
  for (const row of journalw.drain()) {
    /* A kind with no sound is silent by design, so an unmapped kind is not a
       warning: `data/sfx.js` decides what is audible. */
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
