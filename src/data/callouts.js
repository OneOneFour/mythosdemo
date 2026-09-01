/* LAYER data — TUTORIAL CALLOUT STRINGS (Phase 8b). Imports nothing.

   Content, not literals in `view/` — a future locale or a rewrite of the
   callout widget should never require touching the renderer. Indexed by
   `model/tutorial.js#beat(run)`, the count of SPEC §5 beats already fired
   (0..6): the string shown is the instruction for whichever beat is NOT YET
   done. Beats 0 and 1 share a line because SPEC §5's own beat 1 (walk) fires
   the instant the player presses a direction key — in practice indistinguishable
   from "hasn't moved yet" — so the first thing worth telling a player is beat
   2's goal, not a walk hint nobody needs.

   Indices 5 and 6 are `null`: they name the altar and the furnace gift, and
   neither mechanic exists yet (a future cycle-director phase). Phase 8a's
   `rules/tutorial.js` never advances `run.tutorialBeat` past 4 today, so these
   two are unreachable rows, not unfired ones — reserved so that phase only
   has to fill them in, not also touch this table's shape. */
export const CALLOUTS = Object.freeze([
  'TAKE THE PICKAXE',                              // 0: before beat 1 (walk)
  'TAKE THE PICKAXE',                               // 1: walked, not yet armed
  'DIG DOWN -- MINE THE COPPER BELOW',              // 2: pickaxe taken
  'GET BACK UP -- FELL A TREE OR CUT A STAIR',      // 3: copper mined
  null,                                              // 4: climbed back up
  null,                                              // 5: reserved -- the altar
  null                                               // 6: reserved -- the furnace gift
]);
