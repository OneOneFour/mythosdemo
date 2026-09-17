/* data layer — the one-shot god-gift tier. Frozen.

   `id` is also a `data/substances.js` id, crossed with the one `phial` form,
   so holding a miracle is `invCount(S[id], F.phial) > 0`.
   `rules/miracles.js#use` spends one unit, applies `effect`, then grants
   `effect.boon` if present.

     effect.kind   optional; a row carrying only `effect.boon` edits no tiles.
                   'collapse'   clear every tile in a `radius`-tile square to
                                air.
                   'transmute'  turn every already-solid tile in that square
                                into native `effect.sub`; it converts rock and
                                never creates it.
     effect.sub    the substance a 'transmute' turns rock into. Must be
                   packable terrain.
     effect.boon   optional, a `data/boons.js` id.

   `use` returns before spending anything when the reticle resolves to no
   band, so even a boon-only phial cannot be drunk aiming at open sky. */

export const MIRACLES = [

  { id:'chasm', name:'RIFT OF HADES', god:'hades',
    text:'THE GROUND REMEMBERS ITS OWNER',
    effect:{ kind:'collapse', radius:1, boon:'hades-passage' } },

  { id:'tide', name:'VIAL OF THE DEEP', god:'poseidon',
    text:'EVERY STONE REMEMBERS THE SEA',
    effect:{ boon:'poseidon-flood' } },

  /* `radius:1` is 9 tiles, which at copper's charge of 4 yields 36 ore. */
  { id:'lodestone', name:'LODESTONE OF THE FORGE', god:'hephaestus',
    text:'BASE ROCK REMEMBERS THE VEIN',
    effect:{ kind:'transmute', radius:1, sub:'copper' } }
];

export const MIRACLE = Object.freeze(Object.fromEntries(
  MIRACLES.map(m => [m.id, Object.freeze(m)])));
