/* data layer — the passive-modifier gift tier. Frozen.

     god   a `data/gods.js` id.
     key   a `data/tuning.js` id, optionally scoped with a dot: 'walk',
           'hard.stone', 'rate.kiln'. The unscoped form applies to every
           scope, and the two stack.
     mul   multiplied in, stacking by product across every active trinket.
     add   summed in before the multipliers, stacking by sum.

   Order of application is fixed in `model/mods.js`, so two trinkets in either
   draft order give the same number. */

export const TRINKETS = [

  { id:'bellows', name:'BELLOWS OF THE FORGE', short:'BELLOWS', god:'hephaestus',
    text:'THE FIRE ANSWERS FASTER',
    mods:[ { key:'rate.kiln', mul:1.25 } ] },

  { id:'owl', name:'OWL OF ATHENA', short:'OWL', god:'athena',
    text:'THE DARK GIVES UP ITS SHAPE',
    /* `sightRadius` is the flood cap in `rules/reveal.js`, in tiles of graph
       distance: 14 becomes 21. */
    mods:[ { key:'sightRadius', mul:1.5 } ] },

  /* 1.25 x 0.8 = 1.0 exactly: 50 T at 24 px/s lifts the same talents per
     second as 40 T at 30 px/s. */
  { id:'girdle', name:'GIRDLE OF ARES', short:'GIRDLE', god:'ares',
    text:'CARRY MORE; CLIMB SLOWER',
    mods:[ { key:'burden', mul:1.25 }, { key:'climb', mul:0.8 } ] }
];

export const TRINKET = Object.freeze(Object.fromEntries(
  TRINKETS.map(t => [t.id, Object.freeze(t)])));
