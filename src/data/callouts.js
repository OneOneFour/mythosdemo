/* LAYER data — TUTORIAL CALLOUT STRINGS (Phase 8b). Imports nothing.

   Content, not literals in `view/` — a future locale or a rewrite of the
   callout widget should never require touching the renderer. Indexed by
   `model/tutorial.js#beat(run)`, the count of SPEC §5 beats already fired
   (0..6): the string shown is the instruction for whichever beat is NOT YET
   done. Beats 0 and 1 share a line because SPEC §5's own beat 1 (walk) fires
   the instant the player presses a direction key — in practice indistinguishable
   from "hasn't moved yet" — so the first thing worth telling a player is beat
   2's goal, not a walk hint nobody needs.

   Index 4 stays `null`: beat 5 fires the frame after beat 4 with no player
   action in between (`rules/cycles.js` places the altar unconditionally from
   frame 0, so the only thing beat 4 was ever waiting on was the player), so a
   callout there would flash for at most one frame. Index 5 is Phase 10b's:
   the altar exists and cycle 1's own demand (docs/SPEC.md 18.4) is the
   instruction. Index 6 stays `null` -- the beat sheet ends there and there is
   nothing left to teach. */
export const CALLOUTS = Object.freeze([
  'TAKE THE PICKAXE',                              // 0: before beat 1 (walk)
  'TAKE THE PICKAXE',                               // 1: walked, not yet armed
  'DIG DOWN -- MINE THE COPPER BELOW',              // 2: pickaxe taken
  'GET BACK UP -- FELL A TREE OR CUT A STAIR',      // 3: copper mined
  null,                                              // 4: climbed back up
  'DELIVER 10 COPPER ORE TO THE ALTAR',             // 5: the altar has risen
  null                                               // 6: first trial paid
]);
