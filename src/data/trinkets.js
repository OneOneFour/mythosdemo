/* LAYER data — TRINKETS: the passive-modifier tier of god boons. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   A trinket is a name, a god, and a list of modifiers. Nothing else. There is
   no trinket code anywhere in the project: `rules/trinkets.js` moves rows from
   this table into `model/mods.js` when one is drafted and takes them out when it
   is lost. Adding a trinket is adding a row here.

     key   a tunable id from `data/tuning.js`, optionally SCOPED with a dot:
           'walk', 'hard.stone', 'rate.furnace'. The unscoped form applies to
           every scope, so `hard` softens every material and `hard.stone`
           softens one, and both stack.
     mul   multiplied in. Stacks by product across every active trinket.
     add   summed in BEFORE the multipliers. Stacks by sum.

   Order of application is fixed and documented in `model/mods.js` so that two
   trinkets in either draft order give the same number. That is a determinism
   requirement in a game with shareable seeds, not a nicety.

   Content is deliberately thin: one row, carrying a SCOPED key, which is the
   thing worth proving. */

export const TRINKETS = [

  { id:'bellows', name:'BELLOWS OF THE FORGE', short:'BELLOWS', god:'hephaestus',
    text:'THE FIRE ANSWERS FASTER',
    /* Scoped, so it speeds the furnace and NOT the divine kiln -- and it
       multiplies on top of `rate.kiln_divine: 2.0` if it is ever pointed
       there, without either row knowing the other exists. */
    mods:[ { key:'rate.furnace', mul:1.25 } ] }
];

export const TRINKET = Object.freeze(Object.fromEntries(
  TRINKETS.map(t => [t.id, Object.freeze(t)])));
