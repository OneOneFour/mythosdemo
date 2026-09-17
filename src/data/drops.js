/* data layer — drops: the drop table a trinket is drawn from. Frozen.

     trigger  'mine' | 'tribute'. Only `mine` is consumed today.
     minTier  'mine' rows only. The substance's own `tile.tier`, absent
              meaning 1, must be at least this.
     chance   rolled through `rand()` and nowhere else.
     give     a `data/trinkets.js` id. */

export const DROPS = [
  { id:'deep-bellows',    trigger:'mine',    minTier:2, chance:0.03, give:'bellows' },
  { id:'tribute-bellows', trigger:'tribute',            chance:1,    give:'bellows' }
];
