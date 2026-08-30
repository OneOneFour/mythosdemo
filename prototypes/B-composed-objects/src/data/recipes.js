/* ============================================================
   RECIPES — patterns with one binding, $s, over the substance.

   `id` is unique and is what a save file stores (sim/save.js), so rows may
   be reordered freely. `tag` groups rows into a pool; a machine's
   ['Recipe', { tag }] part selects the pool.

   Optional gates, both read by comp/recipe.js:
     hot:  true      -> requires the host's `heat` slot to be lit. ANY
                        component providing `heat` satisfies this, which is
                        how the blood winch works (see data/machines.js).
     band: [lo, hi]  -> requires the AMBIENT heat field at the host's tile
                        to sit in a range. This is the seam mutually hostile
                        boons write against (DESIGN item 11).
   ============================================================ */
export const RECIPES = [
  { id: 'smelt', tag: 'smelt', secs: 4.0,
    in:  [{ form: 'ore', sub: '$s', n: 2 }, { sub: 'timber', form: 'log', n: 1 }],
    out: [{ form: 'ingot', sub: '$s', n: 1 }] },

  { id: 'crush', tag: 'crush', secs: 1.6,
    in:  [{ tag: 'crushable', sub: '$s', n: 1 }],
    out: [{ form: 'gravel', sub: '$s', n: 2 }] },

  /* The kiln, written last, by copying the crush row above and changing the
     values. `hot: true` is the whole of "bakes": it makes the recipe ask the
     host's `heat` slot, which is why the kiln row in data/machines.js carries
     a Burner and the crusher does not. */
  { id: 'bake', tag: 'bake', secs: 3.0, hot: true,
    in:  [{ tag: 'bakeable', sub: '$s', n: 2 }],
    out: [{ form: 'brick', sub: '$s', n: 1 }] }
];
