/* LAYER data — TRINKETS: the passive-modifier tier of god boons (DESIGN item 8).

   A trinket is a name, a god, and a list of modifiers. Nothing else. There is no
   trinket code anywhere in the project: `rules/trinkets.js` moves rows from this
   table into `model/mods.js` when one is drafted, and takes them out when it is
   lost. Adding a trinket is a row here.

     key   a tunable id from `tuning.js`, optionally scoped with a dot:
           'walk', 'hard.tin', 'rate.furnace'.
     mul   multiplied in. Stacks by product across every active trinket.
     add   summed in before the multipliers. Stacks by sum.

   Order of application is fixed and documented in `model/mods.js` so that two
   trinkets in either draft order give the same number — a determinism
   requirement, not a nicety, in a game with seeds and saves. */

export const TRINKETS = [

  { id:'winged-sandals', name:'WINGED SANDALS', god:'hermes',
    text:'YOU MOVE AS RUMOUR DOES',
    mods:[ { key:'walk', mul:1.15 } ] },

  { id:'bellows', name:'BELLOWS OF THE FORGE', god:'hephaestus',
    text:'THE FIRE ANSWERS FASTER',
    mods:[ { key:'rate.furnace', mul:1.25 } ] },

  { id:'tin-eater', name:'THE TIN-EATER', god:'hephaestus',
    text:'SOFT METAL, SOFTER STONE',
    mods:[ { key:'hard.tin', mul:0.5 } ] },

  { id:'feather-heel', name:'FEATHER HEEL', god:'hermes',
    text:'THE GROUND FORGIVES FIVE MORE FEET',
    mods:[ { key:'fallSafe', add:40 } ] },

  /* DESIGN item 11 — mutually hostile boons. Poseidon's brine floods the
     crusher's spoil and chills Hephaestus's fire. One row, two mods, and the
     hostility is legible without reading any code. */
  { id:'brine-tap', name:'POSEIDON\'S BRINE TAP', god:'poseidon',
    text:'THE WATER HELPS. THE FIRE DOES NOT AGREE',
    mods:[ { key:'rate.crusher', mul:1.40 },
           { key:'rate.furnace', mul:0.75 } ] }
];

export const TRINKET = Object.freeze(Object.fromEntries(
  TRINKETS.map(t => [t.id, Object.freeze(t)])));
