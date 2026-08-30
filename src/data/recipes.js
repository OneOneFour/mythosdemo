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
              Exactly one of `sub` / `subFrom` per clause. */

export const RECIPES = Object.freeze({

  /* ---- the commented row ---- */
  smelt: Object.freeze({
    id:'smelt', name:'SMELT',
    in:{ '*/#ore':2, '*/#fuel':1 },
    out:[ { subFrom:'*/#ore', form:'ingot', n:1 } ],
    secs:4.0
  })
});

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
