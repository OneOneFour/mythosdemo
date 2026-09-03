/* LAYER core — the palette, lifted from the concept art, plus colour
   arithmetic. Depends on nothing. May be imported by every layer.

   Hex lives here because mixing two colours is arithmetic. The NAMES that
   content rows are allowed to use live in `data/palette.js`, which re-exports
   this table and is what `tools/resolve.mjs` checks a `look` key against.

   See docs/DEVELOPER_GUIDE.md#colour-and-appearance. */

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
  ichor:'#ffd97a', hot:'#ff9a3c', ui:'#d2c9b2', uiDim:'#98907c', uiBack:'#0d0b12',
  /* THE THREE INK TONES, and which one a call site is allowed to use
     (docs/PLAN-phase13.md 2.4a). The old two-tone split made "secondary" and
     "illegible" the same colour: `uiDim` at '#7b7361' is 4.3:1 against
     `uiBack` at FULL opacity, and every panel draws `uiBack` at 0.6-0.92 alpha
     over the live world, so the effective figure was lower -- and under 2:1
     with no panel behind it at all.

       ui       PRIMARY. A label, a heading, line 0 of a tooltip.
       uiInk2   SECONDARY. De-emphasised text that must still READ: a bar's
                value, a tooltip's body, a stat row, a key hint.
       uiDim    STATE. Dim MEANS something at the ten sites listed in
                docs/PLAN-phase13.md 2.3 -- unknown, unfuelled, idle, off,
                inactive, a placeholder. Raised from '#7b7361' so it is
                legible, NOT retired: the fix for "the dim tone is illegible"
                is not "delete the dim tone", it is "stop using the state tone
                for body text".

     `uiShade` is a text shadow, for the handful of sites that draw straight
     onto rendered world with nothing behind them (`core/font.js#drawText`'s
     8th argument). Derived rather than picked, following
     `view/ui/panel.js#SHADOW`'s own idiom -- it is `mix(uiBack, '#000000',
     0.5)`, precomputed to hex because this table is hex by construction (see
     the header) and `mix`'s helpers are declared below it. It must be OPAQUE
     rather than an alpha: several call sites draw under a live
     `g.globalAlpha < 1` (the callout fade, the title banner, the overview
     legend) and an alpha shadow would let the ink pass bleed through it. */
  uiInk2:'#e8e2d2', uiShade:'#060509',
  /* the widget layer's status colours; same hex as hud.js's UI row */
  uiGood:'#9ad86a', uiAmber:'#e0a030', uiHeart:'#d8433a',
  /* granite: a cool light grey, distinct from ir* (iron-grey, warmer/darker)
     so the two rocks read apart at a glance. adamant: a dark teal-black with
     a pale cyan glint highlight, consistent with the `glint` treatment
     already used on copper (veinA) and tin (snA) -- reads as worked/magical
     metal-rock rather than plain stone. */
  graniteA:'#d8d6dc', graniteB:'#b3b0ba', graniteC:'#8b8792', graniteD:'#5a5760',
  adamantA:'#8fe3d9', adamantB:'#2b4a52', adamantC:'#1c3238', adamantD:'#0f1c1f'
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

/* `mix`, but the result is HEX and can therefore be mixed AGAIN. `mix` returns
   an `rgb(...)` string, which `hex2rgb` cannot read back — feeding one to the
   other yields NaN channels and a silently black fill. Depth shading needs two
   stages (darken the row's own tone, then derive an edge from the darkened
   tone), so it needs this one. Two functions rather than one because every
   existing call site takes a single mix and a canvas fillStyle is happy with
   either form; changing `mix`'s return type would be a wider edit for no gain. */
const hex2 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0).toString(16).padStart(2, '0');

export function blend(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return '#' + hex2(A[0] + (B[0] - A[0]) * t)
             + hex2(A[1] + (B[1] - A[1]) * t)
             + hex2(A[2] + (B[2] - A[2]) * t);
}
