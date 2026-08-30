/* LAYER data — MACHINES: one row per machine, all of it literals. Frozen.
   Imports `data` only. May be imported by `data`, `model`, `rules`, `view`.

   ============================================================================
   READ THIS BLOCK BEFORE ADDING A ROW.
   The interpreter that runs these rows is `rules/machines.js`. It contains no
   machine name, no substance name and no magic number. You should not have to
   read it to add a machine; you should have to read this block once.
   ============================================================================

     tw, th      footprint in tiles.
     footing     how many solid tiles must be under it to place it.

     ports       [{ side, mode, accepts }]
                 side     'top' | 'bottom' | 'left' | 'right'
                 mode     'in'   accepts items pushed or dropped in
                          'out'  where produce() ejects
                 accepts  selectors -- see the grammar in `data/forms.js`.

     buffer.cap  { selector: units }. Per-selector, so the furnace's
                 4-ore / 2-fuel asymmetry is expressible without two fields.

     catchBox    { mouth, slack } items falling through the mouth are swallowed
                 for free. This is the thesis of the game in one flag: placing a
                 machine under a vein beats placing it on the surface.

     handFeed    { reach, from } draws from the player's pockets while they
                 stand within `reach` px.

     emit        [{ field, at, rate, whileRunning }] pours into a scalar field.

     servo       { over, mult } run `mult` times faster while the feed buffer is
                 over `over` full. This is what keeps buffers bounded; without
                 it small surpluses accumulate to FULL over ~20 minutes.

     recipes     names from `data/recipes.js`, or inline rows of the same shape.
                 Tried IN ORDER; the first whose inputs are all present runs, so
                 order is a design decision -- see the lift.

     lift        { span, toBand } marks the machine as one stage of the staged
                 lift. Speeds come from the `liftUp` / `liftDown` tunables, so
                 "down is free, up is expensive" is one place, not one per row.

     variantOf   copy another row and override these keys. See `kiln_divine`.

     look        appearance only. `view/` is the only reader, and no machine or
                 substance name appears anywhere in `view/`.

   Rows are append-only: the index is the id a save stores. */

import { colour } from './palette.js';

export const MACHINES = [

  /* ---- FURNACE: the commented row. Every machine is this shape. -------------
     3x2, catches what falls into its mouth, can be hand-fed, and smelts. The
     recipe is not here -- it is the shared `smelt` row, which is why this one
     machine smelts every ore in the game and will smelt every ore added later.
     ---- */
  { id:'furnace', name:'CRUDE FURNACE',
    tw:3, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    buffer:{ cap:{ '*/#ore':4, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ore', '*/#fuel'] },

    emit:[ { field:'heat', at:'top', rate:18, whileRunning:true } ],
    servo:{ over:0.55, mult:1.38 },

    recipes:['smelt'],

    look:{ body:'irC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* ---- KILN DIVINE: the variant, and the proof that variants are nearly free.
     It is the furnace row with four keys overridden: a new id, a new name, a new
     look, and a heat gate is NOT added -- nothing mechanical changes here at
     all. It is twice as fast because `data/tuning.js` carries one line,
     `rate.kiln_divine: 2.0`, and for no other reason.

     Total cost of a variant: this six-line row plus one tuning row. No engine
     code learned the word "kiln", and a `rate.furnace` trinket still stacks
     multiplicatively on top without either knowing the other exists. ---- */
  { id:'kiln_divine', name:'DIVINE KILN', variantOf:'furnace',
    look:{ body:'clayB', trim:'clayA', base:'clayC', fire:true, halo:'ichor',
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'divine' } } },

  /* ---- LIFT STAGE ----------------------------------------------------------
     One stage, one drum, one deck, one counterweight, pointed surface ->
     astral. Five stages would be five of these records placed at five level
     pairs; NEVER one continuous cage. The staged relay is a deliberate design
     statement, and modelling it as a machine is what keeps it that way.

     The recipes are inline rather than shared because no other machine ascends,
     and THE ORDER IS THE DESIGN: timber first, so the winch behaves like an
     ordinary fuelled lift for as long as you have timber, and only starts
     eating hearts once you have run dry. That is the trap, expressed as row
     order rather than as a special case in the interpreter.

     `heart` is not a substance. It is a bare unit offered by the `vital` row in
     `data/sources.js`, which is the whole non-item-fuel mechanism. ---- */
  { id:'lift', name:'WINCH STAGE',
    tw:2, th:3, footing:2,

    ports:[ { side:'top',    mode:'in', accepts:['*/#fuel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    lift:{ span:64, toBand:'astral' },

    recipes:[
      { in:{ '*/#fuel':1 }, out:[], secs:6.0 },                  // honest fuel
      { in:{ heart:1 }, from:'vital', out:[], secs:6.0 }          // the terms
    ],

    look:{ body:'woodC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } }
];

/* ---- variant expansion, then derived indices, built once, frozen ------------
   A variant is a shallow merge of the named base row under its own keys. Merge
   and not deep-merge on purpose: a variant that wants to change one port
   restates the whole `ports` array, which is legible, whereas a deep merge of
   arrays is not. This is derivation over frozen tables in the same class as the
   index maps below -- it is not behaviour, and `rules/` never sees it. */

const expand = (row, all) => {
  if (!row.variantOf) return row;
  const base = all.find(r => r.id === row.variantOf);
  if (!base) throw new Error(`machines: "${row.id}" is a variant of unknown "${row.variantOf}"`);
  const over = { ...row };
  delete over.variantOf;
  return { ...base, ...over };
};

export const MACH = Object.freeze(MACHINES.map(r => Object.freeze(expand(r, MACHINES))));
export const M    = Object.freeze(Object.fromEntries(MACH.map((m, i) => [m.id, i])));

/* Fail at import rather than at paint time on a mistyped colour name. `view`
   would otherwise render a black box at depth 300 and say nothing. */
for (const m of MACH)
  for (const k of ['body', 'trim', 'base', 'halo'])
    if (m.look?.[k]) colour(m.look[k]);
