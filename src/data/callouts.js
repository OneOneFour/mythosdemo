/* data layer — tutorial callout strings.

   Indexed by `model/tutorial.js#beat`, the count of beats already fired, so
   the entry shown is the instruction for the beat not yet done. A `null`
   entry draws no callout. */
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
