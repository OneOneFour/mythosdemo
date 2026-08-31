/* LAYER data — RECIPES: shared, named transformations. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   A machine row may name a recipe from this table or inline a literal one; both
   forms are the same shape and `recipesOf()` at the bottom returns the resolved
   list either way. Named rows are for transformations more than one machine
   performs; inline rows are for a machine's own private behaviour.

   ============================================================================
   THE ONE SMELT ROW. `smelt` covers every ore that will ever exist, because
   its input is a selector over any ore-tagged form and its output takes the
   SUBSTANCE from whatever satisfied that input. Adding `tin` to
   `substances.js` needs no row here, and a tin ingot differs from a copper
   ingot automatically rather than needing a hand-written row someone forgets.

   This is the defect the reference prototype had: two ores both declared
   `smeltsTo:'ingot'` against a single `ingot` row, so a tin ingot was
   byte-identical to a copper one.
   ============================================================================

   Row shape:

     in       { selector: units }. Selector grammar is in `data/forms.js`.
     from     which `data/sources.js` row the inputs come from. Default 'buffer'.
              With `units:'named'` the input KEYS are bare unit names, not
              selectors -- that is how the lift burns hearts.
     needs    { field: { min, max } } gate on a scalar field value at the
              machine. Delete the line and the recipe runs cold. A temperature
              BAND is a `max` beside the `min`.
     secs     seconds per run at rate 1.0, before `servo` and the `rate` tunable.
     out      output clauses. `[]` means the machine consumes and produces
              nothing liftable -- it banks a charge, which is what a lift stage
              and a spoil sink both do.

              { sub, form, n }         literal output.
              { subFrom, form, n }     DERIVED: the substance that satisfied the
                                       named input clause, in the named form.
              Exactly one of `sub` / `subFrom` per clause.

     hand     true if a PLAYER may also run this exact row, by hand, not only a
              machine that names it. See `rules/crafting.js` and `HAND_RECIPES`
              below. Deliberately not a second row: hand-crafting is the SAME
              transformation at the SAME `secs`, spending and producing exactly
              what the machine would -- the point (`docs/DESIGN.md`) is that a
              person can do a furnace's job, just not five furnaces' worth of
              it at once, and a duplicated row with different numbers would
              quietly break that promise the first time someone tuned one and
              forgot the other. */

export const RECIPES = Object.freeze({

  /* ---- the commented row ----
     `docs/DESIGN.md`'s locked compression table fixes ingot at 4:1 (four ore
     become one ingot), so `in` reads 4 here and not the round-number 2 an
     earlier draft shipped with -- `docs/SPEC.md` names this explicitly so the
     two files cannot drift again. */
  smelt: Object.freeze({
    id:'smelt', name:'SMELT',
    in:{ '*/#ore':4, '*/#fuel':1 },
    out:[ { subFrom:'*/#ore', form:'ingot', n:1 } ],
    secs:4.0,
    hand:true
  }),

  /* ---- press: the SECOND compression tier. `docs/DESIGN.md` locks plate at
     12:1 against raw ore; since one ingot already costs 4 ore, three ingots
     is the same 12:1 expressed in ingot terms, so `in` reads 3 rather than a
     fresh ore-relative number. The input selector is star-slash-hash-ingot,
     not star-slash-hash-refined, on purpose (written in words, not symbols,
     for the same reason `forms.js`'s grammar comment does -- a star followed
     by a slash closes a block comment): `refined` also tags `plate` itself
     (see `forms.js`), and selecting on it here would let a press eat its own
     output, one refinement tier "compressing" into itself for free.
     `subFrom` on the matching selector carries the substance across exactly
     the way `smelt` carries it from ore, so a tin plate differs from a
     copper plate with no row written anywhere for tin. */
  press: Object.freeze({
    id:'press', name:'PRESS',
    in:{ '*/#ingot':3, '*/#fuel':1 },
    out:[ { subFrom:'*/#ingot', form:'plate', n:1 } ],
    secs:8.0,
    hand:true
  })
});

/* Every recipe a player may run directly, in table order. `rules/crafting.js`
   tries them in this order for the same "first one you have materials for
   wins" reason a machine tries ITS `recipes` list in the order it was
   written. Derived once, here, rather than filtered by every reader --
   `view/hud.js`'s CRAFT list and `rules/crafting.js`'s own chooser would
   otherwise be two implementations of "which rows have `hand:true`" that
   could silently disagree, the same failure `MACH`/`M` exist to prevent for
   machines. */
export const HAND_RECIPES = Object.freeze(
  Object.values(RECIPES).filter(r => r.hand));

/* Resolve a machine row's `recipes` into concrete rows. Named strings are
   looked up; objects pass through. Throws on an unknown name, because a
   silently missing recipe is a machine that never runs and never says why. */
export function recipesOf(def) {
  return (def.recipes || []).map(r => {
    if (typeof r !== 'string') return r;
    const row = RECIPES[r];
    if (!row) throw new Error(`recipes: machine "${def.id}" names unknown recipe "${r}"`);
    return row;
  });
}
