/* LAYER data — MIRACLES: the ONE-SHOT god-gift tier. Frozen. Imports nothing.

   A miracle is a HELD PAIR: `id` is a substance id crossed with the one
   `phial` form, so "holding a miracle" is `invCount(S[id], F.phial) > 0`.
   `rules/miracles.js#use` spends one unit, applies `effect`, and may grant a
   boon afterward as a side-effect.

     effect.kind   OPTIONAL -- a row carrying only `effect.boon` edits no
                   tiles. The content lint holds the closed set:
                   'collapse'   clear every tile in a `radius`-tile square to
                                AIR. Picked over petrifying rock because it
                                needs no tile-write verb mining does not
                                already use.
                   'transmute'  turn every ALREADY-SOLID tile in that square
                                into native `effect.sub`. It converts rock and
                                never creates it, so it can neither entomb the
                                player nor hand them a free step upward.
     effect.sub    the substance a 'transmute' turns rock into.
     effect.boon   OPTIONAL, granted the instant the miracle is used.

   USE IS AIMED, EVEN WHEN THE EFFECT IS NOT: `use` returns before spending
   anything when the reticle resolves to no band, so a boon-only phial cannot
   be drunk while aiming at open sky. */

export const MIRACLES = [

  { id:'chasm', name:'RIFT OF HADES', god:'hades',
    text:'THE GROUND REMEMBERS ITS OWNER',
    effect:{ kind:'collapse', radius:1, boon:'hades-passage' } },

  /* THE PURE-BOON PHIAL, and it needed no engine change at all: `applyEffect`
     already grants `effect.boon` independently of `effect.kind`. Poseidon's
     flood SUPPRESSES `hephaestus-forge`, so drinking this while the forge is
     lit costs the forge -- the hostile pair `data/boons.js` already ships,
     reached from a second direction. */
  { id:'tide', name:'VIAL OF THE DEEP', god:'poseidon',
    text:'EVERY STONE REMEMBERS THE SEA',
    effect:{ boon:'poseidon-flood' } },

  /* IT CREATES ORE, and `radius` is the number that prices it: 9 tiles at
     copper's charge of 4 is 36 raw copper out of worthless rock -- 3.6x cycle
     1's whole demand -- with 34 s of swings still to pay.

     `effect.sub` must be PACKABLE terrain, which the content lint proves,
     because this is the one caller of `packTile` that neither worldgen nor
     placement validates. It can do nothing at all to air, which keeps it out
     of the "up is expensive" argument entirely. */
  { id:'lodestone', name:'LODESTONE OF THE FORGE', god:'hephaestus',
    text:'BASE ROCK REMEMBERS THE VEIN',
    effect:{ kind:'transmute', radius:1, sub:'copper' } }
];

export const MIRACLE = Object.freeze(Object.fromEntries(
  MIRACLES.map(m => [m.id, Object.freeze(m)])));
