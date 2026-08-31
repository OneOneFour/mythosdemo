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
                 8-ore / 2-fuel asymmetry is expressible without two fields.

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

     cost        { 'sub/form': n, ... } material spent once, from the pockets,
                 the moment the machine is PLACED -- see `rules/placement.js`.
                 EXACT sub/form pairs, not selectors: `buffer.cap`'s grammar
                 answers "any ore", and a build bill is a specific list of
                 materials, not "any". Absent (the default) means free, which
                 is why `furnace`, `lift` and `press` -- granted, not earned,
                 and `press` provisional besides -- carry none: this key is for
                 content that costs something to BUILD, not for retrofitting a
                 price onto starting gear.

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

    /* `smelt` now eats 4 ore per run (`docs/DESIGN.md`'s 4:1 ratio) rather
       than the 2 an earlier draft used, so the ore cap is bumped to 8 to keep
       the same 2-runs-of-headroom the fuel cap already had at 2 -- an
       asymmetric CAP, not an asymmetric ratio of cap to recipe demand. */
    buffer:{ cap:{ '*/#ore':8, '*/#fuel':2 } },

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
           sfx:{ accept:'ignite', produce:'winch' } } },

  /* ---- PRESS: the second compression tier, `docs/DESIGN.md`'s 12:1 plate
     ratio. NOT a `variantOf:'furnace'` like `kiln_divine` -- a variant only
     overrides keys on an identical machine, and this one runs a genuinely
     different recipe (`press`, not `smelt`) with a different input shape (3
     ingot / 1 fuel, not 4 ore / 1 fuel), so it earns its own row rather than
     hiding a second machine's worth of change inside `variantOf`. Smaller
     footprint than the furnace (2x2, not 3x2) because it works on ingots
     already reduced from ore, not raw veins -- it wants less mouth to feed
     it, not more.

     NO `needs:{heat:{min:...}}` GATE, though the "sit a press above a
     furnace" buoyant-heat pairing is exactly the kind of thing `needs` exists
     for. `rules/fields.js` states diffusion is deliberately unimplemented --
     heat sits at the exact tile a machine emits it into and only decays
     there, it does not rise -- so a press one tile above a furnace would sit
     at the same heat as a press in a field with no furnace at all: a gate
     that reads as intentional design and is actually just permanently shut
     (or trivially open at threshold 0) is worse than no gate. Wire this once
     `rules/fields.js` grows the buoyant transport its own comment already
     names as the seam. ---- */
  { id:'press', name:'PRESS',
    tw:2, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ingot', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    /* Same 2x-recipe headroom rule as the furnace: `press` spends 3 ingot / 1
       fuel per run, so the caps double that. */
    buffer:{ cap:{ '*/#ingot':6, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ingot', '*/#fuel'] },

    recipes:['press'],

    /* Iron-toned like the furnace's trim, not its body -- reads as the same
       forge-metal family without being mistaken for a furnace at a glance.
       Reuses `ignite`/`ingot` for accept/produce: there is no dedicated
       press or plate sound row yet, and inventing one is audio content, not
       this machine's data. */
    look:{ body:'irB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#ingot', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* ---- BELT: horizontal relocation, and the one machine explicitly priced to
     be RARE. `docs/DESIGN.md`'s genre statement names flat, cheap horizontal
     logistics as the thing this project refuses to become, so this is the
     first row to carry a nonzero `cost` for real (`press`, above, is free
     provisionally, for a reason its own comment states) -- 2 plate and 4
     gravel, priced in the game's own SECOND compression tier rather than raw
     ore, so a lane of these is a plate-shipping decision and not a doorstep
     mat laid beside every machine.

     IT RUNS NO TRANSFORM. `rules/machines.js`'s generic interpreter turns
     inputs into outputs; a belt turns a POSITION into a later position with
     the SAME substance and form throughout, which is a shape `out` clauses
     cannot express and should not be made to. `rules/belts.js` is the sibling
     module that reads `belt.dir` off this row and drags a resting item along
     the footprint -- `rules/lift.js#carry()` turned ninety degrees, per its
     own file header.

     THE FUEL RECIPE IS THE LIFT'S HONEST-FUEL ROW, VERBATIM IN SHAPE: `out:[]`
     banks a CHARGE through the ordinary `produce()` path below, the exact
     mechanism a lift stage uses, and `rules/belts.js` spends exactly one
     charge per item it delivers off the belt's end. Nothing in this file or
     that one can tell a belt's charge from a lift's.

     4 tiles long, 1 tall, `footing:4` -- a full solid floor under the whole
     span, not just the two end tiles a taller machine checks. `th:1` is why
     `rules/placement.js`'s footing loop (which walks every column under the
     footprint regardless of how many rows tall it is) already covers this
     with no change: it was written for an arbitrary `tw`, not for `th:2`
     specifically.

     `belt:{ dir }` is the one key here `rules/belts.js` reads that no other
     machine's row carries: `1` drags toward increasing world x, `-1` toward
     decreasing. `belt_l` is `belt_r` with that key and the id/name flipped via
     `variantOf` -- the same near-free variant `kiln_divine` proves above. ---- */
  { id:'belt_r', name:'CONVEYOR (RIGHT)',
    tw:4, th:1, footing:4,

    ports:[ { side:'top', mode:'in', accepts:['*/#fuel'] } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    belt:{ dir:1 },

    recipes:[ { in:{ '*/#fuel':1 }, out:[], secs:6.0 } ],

    cost:{ 'copper/plate':2, 'stone/gravel':4 },

    /* Timber-and-iron, not the furnace's fired clay: a belt is built, not
       stoked, and `fire:true` here reads as the burner that pays for the
       drag rather than a kiln. Reuses `ignite`/`winch` for accept/produce --
       the same borrow `press` makes for accept/produce, and for the same
       reason: no dedicated belt sound row exists yet, and inventing one is
       audio content, not this machine's data. */
    look:{ body:'woodB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  { id:'belt_l', name:'CONVEYOR (LEFT)', variantOf:'belt_r',
    belt:{ dir:-1 } }
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
