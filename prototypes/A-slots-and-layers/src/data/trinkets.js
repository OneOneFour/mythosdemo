/* ============================================================
   TRINKETS — the passive-modifier tier of god boons (DESIGN item 8).

   A trinket is a row: an id, and a list of modifiers on named tunables.
   `mul` stacks multiplicatively, `add` additively, `scope` narrows to a
   substance id or a recipe tag. Applied and revoked by source id, so losing
   a trinket is exact and a stack of three does not fight over one field.

   Nothing here is engine code. Adding a trinket is one row.
   ============================================================ */

export const TRINKETS = [

  /* Hermes. The brief's worked example. */
  { id: 'winged_sandals', name: 'WINGED SANDALS', god: 'hermes',
    text: 'THE GROUND HURRIES UNDER YOU',
    mods: [{ tunable: 'walk', mul: 1.15 }] },

  /* Hephaestus. Faster kilns only — a scoped modifier, no new tunable row. */
  { id: 'forge_bellows', name: 'FORGE BELLOWS', god: 'hephaestus',
    text: 'KILNS RUN HOT',
    mods: [{ tunable: 'machine.rate', scope: 'bake', mul: 1.50 },
           { tunable: 'burn.span', mul: 0.80 }] },

  /* Gaia. Softens granite specifically. */
  { id: 'gaias_patience', name: "GAIA'S PATIENCE", god: 'gaia',
    text: 'THE OLD STONE REMEMBERS YOU',
    mods: [{ tunable: 'mine.hardness', scope: 'granite', mul: 0.60 },
           { tunable: 'mine.power', mul: 1.20 }] },

  /* A hostile pair (DESIGN item 11): this one makes you faster and more
     fragile, and it fights the sandals for the same `walk` field without
     either row knowing about the other. */
  { id: 'ichor_thin', name: 'THINNED ICHOR', god: 'dionysus',
    text: 'LIGHTER. MORE BREAKABLE.',
    mods: [{ tunable: 'walk', mul: 1.30 },
           { tunable: 'fall.safe', add: -40 }] }
];

export const TRINKET = Object.freeze(
  Object.fromEntries(TRINKETS.map(t => [t.id, Object.freeze(t)])));
