/* LAYER data — TUTORIAL CALLOUT STRINGS (Phase 8b). Imports nothing.

   Content, not literals in `view/` — a future locale or a rewrite of the
   callout widget should never require touching the renderer. Indexed by
   `model/tutorial.js#beat(run)`, the count of beats already fired (0..10):
   the string shown is the instruction for whichever beat is NOT YET done.
   Beats 0 and 1 share a line because SPEC §5's own beat 1 (walk) fires
   the instant the player presses a direction key — in practice indistinguishable
   from "hasn't moved yet" — so the first thing worth telling a player is beat
   2's goal, not a walk hint nobody needs.

   Index 4 stays `null`: beat 5 fires the frame after beat 4 with no player
   action in between (`rules/cycles.js` places the altar unconditionally from
   frame 0, so the only thing beat 4 was ever waiting on was the player), so a
   callout there would flash for at most one frame. Index 5 is Phase 10b's:
   the altar exists and cycle 1's own demand (docs/SPEC.md 18.4) is the
   instruction.

   INDICES 6-9 ARE CYCLE 2 (Phase 13d, docs/SPEC.md 20.4). Index 6 used to be
   `null`, on the grounds that "the beat sheet ends there and there is nothing
   left to teach" — which was written before cycle 2's requirements existed.
   The moment cycle 1 pays, the game asks for four things a player has never
   done once: refine ore into plate, build the Cloud Dock, run a segment chain
   up to it, and beat a clock (cycle 1 has none at all). All four guidance
   stopped exactly there. See `rules/tutorial.js#BEATS` 7-10 for the
   predicates each of these is the instruction for.

   Index 10 is `null` and is the real end: cycle 2 is paid, the ascent is
   built and understood, and cycles 3-4 ask for MORE of the same three
   verbs rather than a new one. A callout that repeated itself there would be
   noise, and `view/hud.js#hint` draws nothing for a `null`. */
export const CALLOUTS = Object.freeze([
  'TAKE THE PICKAXE',                              // 0: before beat 1 (walk)
  'TAKE THE PICKAXE',                               // 1: walked, not yet armed
  'DIG DOWN -- MINE THE COPPER BELOW',              // 2: pickaxe taken
  'GET BACK UP -- FELL A TREE OR CUT A STAIR',      // 3: copper mined
  null,                                              // 4: climbed back up
  'DELIVER 10 COPPER ORE TO THE ALTAR',             // 5: the altar has risen
  'SMELT, THEN PRESS -- THE GODS WANT COPPER PLATE',// 6: first trial paid
  'BUILD THE CLOUD DOCK -- IT STANDS ONLY IN THE HEAVENS',
                                                     // 7: a plate exists
  'LINK HUBS UP TO THE DOCK -- ONE CABLE REACHES 12 TILES',
                                                     // 8: the dock is placed
  'CRANK THE PLATES UP -- THIS TRIAL HAS A CLOCK',  // 9: the chain reaches it
  null                                               // 10: cycle 2 paid
]);
