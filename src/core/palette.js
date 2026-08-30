/* LAYER core — the palette, lifted from the concept art, plus colour
   arithmetic. Depends on nothing. May be imported by every layer.

   Hex lives here because mixing two colours is arithmetic. The NAMES that
   content rows are allowed to use live in `data/palette.js`, which re-exports
   this table and is what `tools/resolve.mjs` checks a `look` key against.

   Add a named entry rather than inlining hex at a call site. */

export const P = {
  skyHi:'#c4dcee', skyLo:'#8fb9d8', cloudA:'#ffffff', cloudB:'#dbe8f4', cloudC:'#b9cfe4',
  marbleA:'#ecebee', marbleB:'#cfced6', marbleC:'#a8a7b4',
  grassA:'#77a544', grassB:'#5b8330', grassC:'#43621f', soil:'#7d5b39',
  soilA:'#8d6842', soilC:'#5e4229',
  limeA:'#dcd6c6', limeB:'#c5beaa', limeC:'#a99f89', limeD:'#8b8270',
  ochreA:'#b8823f', ochreB:'#9d6a33', ochreC:'#7d5228', ochreD:'#5d3a1b',
  /* fired-clay aliases; the concept art calls these the same three ochres */
  clayA:'#b8823f', clayB:'#9d6a33', clayC:'#7d5228',
  veinA:'#f0aa5e', veinB:'#dd8433', veinC:'#a35a1f',
  aquA:'#2d5975', aquB:'#22465f', aquC:'#183449',
  watA:'#c9edfd', watB:'#8ed2f2', watC:'#57abda', watD:'#3b83b4',
  basA:'#5c2327', basB:'#471a1e', basC:'#341216', basD:'#240c10',
  lavaA:'#ffd469', lavaB:'#ff8c22', lavaC:'#e04d10', lavaD:'#96280a',
  abyA:'#17131f', abyB:'#100d17', abyC:'#0a0810',
  vio:'#6d40a4', vioHi:'#a06fd6', bone:'#d2c9b2', boneD:'#9a9078',
  hadA:'#0a0810', hadB:'#2f2c46', hadC:'#453f63', shade:'#9fb6cb',
  woodA:'#8f6739', woodB:'#6d4b28', woodC:'#4d3419', woodD:'#33220f',
  cuA:'#e0a066', cuB:'#c07a40', cuC:'#8c5326', cuD:'#5c3416',
  snA:'#cfd6da', snB:'#9aa8b0', snC:'#6c7a84', snD:'#43505a',
  vdA:'#63947a', vdB:'#4b7460', vdC:'#365746', vdD:'#243c30',
  irA:'#a3a3ad', irB:'#74747f', irC:'#4a4a54', irD:'#2c2c34',
  ichor:'#ffd97a', hot:'#ff9a3c', ui:'#d2c9b2', uiDim:'#7b7361', uiBack:'#0d0b12'
};

/* ---------- colour arithmetic ---------- */

export function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

export function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
}
