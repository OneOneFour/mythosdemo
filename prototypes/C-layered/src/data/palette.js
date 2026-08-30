/* LAYER data — named colours, lifted from the concept art.

   Every `look` block in `substances.js` and `machines.js` names a key from here
   as a string. `tools/resolve.mjs` fails the build on a key that is not in this
   object, so a typo'd colour is a build error and not a black tile at depth 300.

   `data` imports nothing. That is not an accident: it is what makes these tables
   loadable by a build tool with no DOM, which is how the resolver works. */

export const COL = Object.freeze({
  /* rock */
  soilA:'#8d6842', soilB:'#7d5b39', soilC:'#5e4229',
  limeA:'#dcd6c6', limeB:'#c5beaa', limeD:'#8b8270',
  irA:'#a3a3ad',   irB:'#74747f',   irC:'#4a4a54',   irD:'#2c2c34',
  basC:'#341216',
  abyC:'#0a0810',
  /* ores */
  cuA:'#e0a066',  cuB:'#c07a40',  cuC:'#8c5326',  cuD:'#5c3416',
  snA:'#cfd6da',  snB:'#9aa8b0',  snC:'#6c7a84',  snD:'#43505a',
  veinA:'#f0aa5e',
  /* wood, fire, product */
  woodA:'#8f6739', woodB:'#6d4b28', woodC:'#4d3419', woodD:'#33220f',
  clayA:'#b8823f', clayB:'#9d6a33', clayC:'#7d5228',
  hot:'#ff9a3c',   lavaA:'#ffd469',
  bloodA:'#d8433a', bloodB:'#7e1f1c',
  /* ui */
  ui:'#d2c9b2', uiDim:'#7b7361', uiBack:'#0d0b12'
});
