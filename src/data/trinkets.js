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
    mods:[ { key:'rate.furnace', mul:1.25 } ] }
];

export const TRINKET = Object.freeze(Object.fromEntries(
  TRINKETS.map(t => [t.id, Object.freeze(t)])));
