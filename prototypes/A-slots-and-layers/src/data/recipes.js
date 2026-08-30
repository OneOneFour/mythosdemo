/* ============================================================
   RECIPES — selected by tag, one row per production verb.

   A machine's Recipe part carries a `tag`; every row with that tag is in its
   pool. Rows are tried in file order and the first whose inputs are all
   present wins, so order in this file is the priority order.

   BINDING. A row with a '#tag' input binds the concrete substance it
   actually consumed. '@field' on the output side reads a named field off
   that bound substance. That is why ONE smelt row covers copper, tin and
   every ore added for the rest of the project's life.

   (RFC 04 as written has no output-side selector, which is why its own
   "adding tin is one row" claim fails: tin would be swallowed by the
   furnace into a buffer no recipe consumes. This is the ~10 lines the
   reviewer priced. It lives here and in rules/parts/recipe.js.)

   `heat: n` means "requires the machine's heat slot at level >= n". It says
   nothing about where the heat comes from.
   `field: { heat: {min} }` gates on the world heat FIELD instead.
   ============================================================ */

export const RECIPES = [

  { tag: 'smelt', secs: 4.0,
    in:  { '#ore': 2, '#fuel': 1 },
    out: { '@smeltsTo': 1 } },

  { tag: 'crush', secs: 1.6,
    in:  { '#ore': 1 },
    out: { gravel: 2 } },

  /* --- the kiln's verb. Added with the kiln; one row. ------------------
         `heat: 0.2` is why the kiln "bakes" rather than merely converting: it
         needs a lit heat slot, which its Burner part supplies from any
         '#fuel'. Fuel burns over time, not per output.
         `field` gates on the WORLD field instead of the machine's own slot —
         a kiln will not fire underwater. A band with no `water` field reads 0
         and the gate passes, so a clause about a field a band does not have
         is inert rather than an error. Dionysus's vats (DESIGN item 11) are
         the same clause with two bounds: `field: { heat: { min:20, max:60 } }`. */
  { tag: 'bake', secs: 2.4,
    heat: 0.2,
    field: { water: { max: 0.1 } },
    in:  { gravel: 2 },
    out: { brick: 1 } }
];

export const byTag = tag => RECIPES.filter(r => r.tag === tag);
