/* LAYER data — DROPS: the drop table a trinket is drawn from. Frozen.
   Imports nothing.

     trigger  'mine' | 'tribute'. Only `mine` is consumed today.
     minTier  'mine' rows only. The substance's own `tile.tier`, absent
              meaning 1, must be at least this -- granite and adamant both
              qualify at `minTier:2`.
     chance   rolled through `rand()` and nowhere else. Deliberately small: a
              trinket is a whole modifier tier, not ordinary loot.
     give     a `data/trinkets.js` id. */

/* `tribute-bellows` STAYS A CERTAINTY, decided rather than inherited. It was
   a certainty over a ONE-ROW trinket table, which is what emptied cycle 4's
   trinket draft. With three rows the draft has two left to offer, so the
   reason to make it a dice roll has gone -- and the reason to keep it is that
   the first trial to pay is where the player learns this tier exists at all,
   and a tier introduced by a coin flip is one half the runs never meet.
   `chance:0.03` above is the RARE source; this is the TAUGHT one. */
export const DROPS = [
  { id:'deep-bellows',    trigger:'mine',    minTier:2, chance:0.03, give:'bellows' },
  { id:'tribute-bellows', trigger:'tribute',            chance:1,    give:'bellows' }
];
