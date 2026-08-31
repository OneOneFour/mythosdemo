/* LAYER data — DROPS: the drop table a trinket is drawn from. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

     trigger  'mine' | 'tribute'. Only `mine` is consumed today, by
              `rules/mining.js`'s rare-drop hook.
     minTier  ('mine' rows only) the substance's own `tile.tier` (absent
              means 1, `data/substances.js`) must be at least this. "Deep
              strata" per the plan's own wording -- granite (tier 2) and
              adamant (tier 3) both qualify at `minTier:2`.
     chance   rolled through `rand()` and nowhere else (invariant 7) --
              deliberately small; a trinket is a whole modifier tier, not
              ordinary loot.
     give     a `data/trinkets.js` id. */

export const DROPS = [
  { id:'deep-bellows',    trigger:'mine',    minTier:2, chance:0.03, give:'bellows' },
  { id:'tribute-bellows', trigger:'tribute',            chance:1,    give:'bellows' }
];
