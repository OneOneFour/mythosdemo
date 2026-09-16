/* LAYER data — DROPS: the drop table a trinket is drawn from. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

     trigger  'mine' | 'tribute'. Only `mine` is consumed today, by
              `rules/mining.js`'s rare-drop hook.
     minTier  ('mine' rows only) the substance's own `tile.tier` (absent
              means 1, `data/substances.js`) must be at least this. "Deep
              strata" per the plan's own wording -- granite (tier 2) and
              adamant (tier 3) both qualify at `minTier:2`.
     chance   rolled through `rand()` and nowhere else --
              deliberately small; a trinket is a whole modifier tier, not
              ordinary loot.
     give     a `data/trinkets.js` id. */

/* `tribute-bellows` STAYS A CERTAINTY, decided rather than inherited. It was
   a certainty over a ONE-ROW trinket table, which is what emptied cycle 4's
   trinket draft: the guaranteed drop had already taken the only row there
   was. With three rows the draft has two left to offer, so the reason to make
   the drop a dice roll has gone -- and the reason to keep it is the one the
   beat sheet rests on. The first trial that pays is where the player learns
   this tier exists at all, and a tier introduced by a coin flip is a tier
   half the runs never meet. `chance:0.03` above is the RARE source; this is
   the TAUGHT one, and they are deliberately not the same kind of event.
   docs/SPEC.md section 14. */
export const DROPS = [
  { id:'deep-bellows',    trigger:'mine',    minTier:2, chance:0.03, give:'bellows' },
  { id:'tribute-bellows', trigger:'tribute',            chance:1,    give:'bellows' }
];
