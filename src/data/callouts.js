/* LAYER data — TUTORIAL CALLOUT STRINGS. Imports nothing.

   Content rather than literals in `view/`, so a locale or a rewrite of the
   callout widget never touches the renderer. Indexed by
   `model/tutorial.js#beat`, the count of beats already FIRED, so the string
   shown is the instruction for whichever beat is NOT YET done.

   Beats 0 and 1 share a line, because beat 1 fires the instant a direction
   key is pressed -- indistinguishable from "hasn't moved yet".

   Index 4 is `null`, because beat 5 fires the frame after beat 4 with no
   player action between, so a callout there would flash for one frame.

   INDEX 5 NAMES A VERB, AND HAS TO: naming only the destination is an
   instruction a player cannot follow, because the proximity drain is opt-in
   and off by default, so standing beside the altar does nothing. The two
   clicks it names are the two real ones.

   Index 10 is `null` and is the real end: the ascent is built and understood,
   and later cycles ask for MORE of the same verbs rather than a new one. */
export const CALLOUTS = Object.freeze([
  'TAKE THE PICKAXE',                              // 0: before beat 1 (walk)
  'TAKE THE PICKAXE',                               // 1: walked, not yet armed
  'DIG DOWN -- MINE THE COPPER BELOW',              // 2: pickaxe taken
  'GET BACK UP -- FELL A TREE OR CUT A STAIR',      // 3: copper mined
  null,                                              // 4: climbed back up
  'CLICK YOUR ORE, THEN THE ALTAR -- 10 COPPER',   // 5: the altar has risen
  'SMELT, THEN PRESS -- THE GODS WANT COPPER PLATE',// 6: first trial paid
  'BUILD THE CLOUD DOCK -- IT STANDS ONLY IN THE HEAVENS',
                                                     // 7: a plate exists
  'LINK HUBS UP TO THE DOCK -- ONE CABLE REACHES 12 TILES',
                                                     // 8: the dock is placed
  'CRANK THE PLATES UP -- THIS TRIAL HAS A CLOCK',  // 9: the chain reaches it
  null                                               // 10: cycle 2 paid
]);
