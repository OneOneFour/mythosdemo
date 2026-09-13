/* LAYER data — TRINKETS: the passive-modifier tier of god boons. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   A trinket is a name, a god, and a list of modifiers. Nothing else, and there
   is no trinket code anywhere in the project. See
   docs/DEVELOPER_GUIDE.md#the-four-gift-tiers and
   docs/DEVELOPER_GUIDE.md#the-tunable-pipeline

     key   a tunable id from `data/tuning.js`, optionally SCOPED with a dot:
           'walk', 'hard.stone', 'rate.furnace'. The unscoped form applies to
           every scope, so `hard` softens every material and `hard.stone`
           softens one, and both stack.
     mul   multiplied in. Stacks by product across every active trinket.
     add   summed in BEFORE the multipliers. Stacks by sum.

   Order of application is fixed and documented in `model/mods.js` so that two
   trinkets in either draft order give the same number. That is a determinism
   requirement in a game with shareable seeds, not a nicety. */

export const TRINKETS = [

  { id:'bellows', name:'BELLOWS OF THE FORGE', short:'BELLOWS', god:'hephaestus',
    text:'THE FIRE ANSWERS FASTER',
    /* The scoped-key example -- see
       docs/DEVELOPER_GUIDE.md#the-tunable-pipeline */
    mods:[ { key:'rate.furnace', mul:1.25 } ] },

  { id:'owl', name:'OWL OF ATHENA', short:'OWL', god:'athena',
    text:'THE DARK GIVES UP ITS SHAPE',
    /* `sightRadius` is the Pass B flood cap in `rules/reveal.js`, so this is
       21 tiles of graph distance instead of 14 -- a whole cavern read from
       its mouth. Visible the frame it is equipped, which is the point: a
       modifier nobody can see the effect of is a number, not a gift. */
    mods:[ { key:'sightRadius', mul:1.5 } ] },

  /* THE TRADE TRINKET, and it is deliberately NOT a discount on ascent.
     CLAUDE.md's premise is that up is expensive; `burden` and `climb` are two
     of the three tunables D4 names as the whole player-scale expression of
     it, so bending them has to be priced rather than granted. 1.25 x 0.8 =
     1.0 EXACTLY: 50 T at 24 px/s delivers the same talents per second up a
     shaft as 40 T at 30 px/s. What the girdle buys is fewer trips and less
     walking between them; what it costs is a slower climb, a longer exposure
     on the ladder, and a bigger load to lose in one fall. The cost is real
     and it is in the same row as the benefit, the way `data/boons.js`'s
     `ares-frenzy` is. */
  { id:'girdle', name:'GIRDLE OF ARES', short:'GIRDLE', god:'ares',
    text:'CARRY MORE; CLIMB SLOWER',
    mods:[ { key:'burden', mul:1.25 }, { key:'climb', mul:0.8 } ] }
];

export const TRINKET = Object.freeze(Object.fromEntries(
  TRINKETS.map(t => [t.id, Object.freeze(t)])));
