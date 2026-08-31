/* LAYER data — DROPS: the drop table a trinket is drawn from. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   `docs/AUDIT.md` section 3: the debug key 'T' was the ONLY source of any
   trinket in the game before this table existed. Phase 4 (docs/BUILD_PLAN.md)
   STEP 4 names three sources, in priority order, and this table is the FIRST
   of them:

     (a) a drop table on tribute completion       -- 'tribute' rows below.
         NOT YET CONSUMED: tribute completion is not a real event yet
         (`run.tribute` is written but nothing ever completes it -- see
         docs/FINDINGS.md). The row shape is here so the day that event
         exists, wiring it is a new READER of this table, not a new table.
     (b) a rare drop from deep strata tiles         -- 'mine' rows below,
         consumed by `rules/mining.js`'s rare-drop hook (the plan's own
         explicit, narrow exception to this phase's FILE OWNERSHIP). LIVE
         TODAY: this is the one source that does not wait on an unbuilt
         system, which is what makes "a trinket arriving from a drop table
         is not [out of scope]" true THIS phase rather than only on paper.
     (c) the cycle draft, once cycles are real       -- out of scope entirely
         this phase (the draft UI is Phase 5's job).

     trigger  'mine' | 'tribute'.
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
