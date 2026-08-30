/* LAYER data — MACHINES: one row per machine, all of it literals.

   ============================================================================
   READ THIS BLOCK BEFORE ADDING A ROW.
   The interpreter that runs these rows is `rules/machines.js`. It contains no
   machine name, no substance name and no number. You should not have to read it
   to add a machine; you should have to read this block once.
   ============================================================================

     tw, th      footprint in tiles.
     footing     how many solid tiles must be under it to place it.

     ports       [{ side, mode, accepts }]
                 side   'top' | 'bottom' | 'left' | 'right'
                 mode   'in'      accepts items pushed or dropped in
                        'out'     where produce() ejects
                        'fluidIn' drains a named field (see `field`, `rate`)
                 accepts  selectors: 'gravel' or '#ore' (any row tagged `ore`).

     buffer.cap  { selector: units }. Per-selector, so the furnace's
                 4-ore / 2-fuel asymmetry is expressible.

     catchBox    { mouth, slack }  items falling through the mouth are swallowed
                 for free. This is the whole thesis of the game in one flag:
                 placing a machine under a vein beats placing it on the surface.

     handFeed    { reach, from }   draws from the player's pockets while they
                 stand within `reach` px.

     emit        [{ field, at, rate, whileRunning }] pours into a scalar field.

     servo       { over, mult }    run `mult` times faster while the feed buffer
                 is over `over` full. CLAUDE.md's throughput servo, as a flag.

     recipes     tried in order; the FIRST one whose inputs are all present
                 runs. Order is therefore a design decision — see `bloodWinch`.

       in        { selector: units }
       from      which SOURCES row the inputs come from. Default 'buffer'.
       needs     { field: { min } }  gate on a field value at the machine.
       secs      seconds per run, before `servo` and the `rate` tunable.
       out       { substanceId: units }  literal output. `{}` means the machine
                 consumes and produces nothing liftable — a charge, or a Hades
                 spoil sink.
       outFrom   { input, field, n }  DERIVED output: look at which substance
                 actually satisfied `input` this run, read `field` off that
                 substance's row, produce `n` of it. This is what makes one
                 furnace row smelt every ore. Exactly one of `out` / `outFrom`.

     lift        { span, up, down } marks the machine as one stage of the staged
                 lift. Consumed by `rules/lift.js`, not by the interpreter.

     look        appearance only. `view/` is the only reader.

   Rows are append-only for the same reason substances are: the index is the id
   stored in a save. */

export const MACHINES = [

  /* ---- the commented row. Every machine below is this shape. ---- */
  { id:'furnace', name:'CRUDE FURNACE',
    tw:3, th:2, footing:2,

    ports:[ { side:'top',    mode:'in',  accepts:['#ore', '#fuel'] },
            { side:'top',    mode:'out' } ],

    buffer:{ cap:{ '#ore':4, '#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['#ore', '#fuel'] },

    emit:[ { field:'heat', at:'top', rate:18, whileRunning:true } ],
    servo:{ over:0.55, mult:1.38 },

    /* ONE recipe for every ore that will ever exist. `outFrom` reads
       `smeltsTo` off whichever ore was consumed, so appending `tin` to
       substances.js yields tin ingots with no edit here.

       This is a deliberate deviation from RFC 04, which wrote
       `out:{ ingot:1 }` as a literal here. The review proved that false:
       tin was swallowed by `accepts:['#ore']` into a buffer no recipe
       consumed, and accumulated forever. See README "## Faithfulness". */
    recipes:[ { in:{ '#ore':2, '#fuel':1 },
                outFrom:{ input:'#ore', field:'smeltsTo', n:1 },
                secs:4.0 } ],

    look:{ body:'irC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'#ore', row:0 }, { sel:'#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* ---- crusher: accepts any ore by tag, ejects downward. ---- */
  { id:'crusher', name:'CRUSHER',
    tw:2, th:2, footing:2,

    ports:[ { side:'top',    mode:'in', accepts:['#ore'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '#ore':6 } },

    catchBox:{ mouth:'top', slack:2 },
    servo:{ over:0.55, mult:1.38 },

    recipes:[ { in:{ '#ore':1 }, out:{ gravel:2 }, secs:1.6 } ],

    look:{ body:'irD', trim:'irB', base:'basC', shake:true,
           pips:[ { sel:'#ore', row:0 } ],
           sfx:{ accept:'breakHard', produce:'crunch' } } },

  /* ---- the blood winch — DESIGN item 12, and the trap boon. -------------
     One stage of the staged lift. It has two recipes and the ORDER is the
     design: timber first, so the winch behaves like an ordinary fuelled lift
     for as long as you have timber, and only starts eating hearts when you
     have run dry. That is the trap, expressed as row order rather than as a
     special case in the interpreter.

     `from:'vital'` is the whole mechanism. `heart` is not a substance: it is a
     unit offered by the `vital` row in `sources.js`, so health is never
     mirrored into the inventory, the HUD keeps drawing five hearts, and
     nothing in `model/run.js` changes shape. See README "## The blood winch"
     for what this still costs. */
  { id:'bloodWinch', name:'BLOOD WINCH',
    tw:2, th:3, footing:2,

    ports:[ { side:'top',    mode:'in', accepts:['#fuel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['#fuel'] },

    /* one stage, one drum, one deck. Five stages = five of these rows placed
       at five level pairs, never one continuous cage (CLAUDE.md invariant 4). */
    lift:{ span:64, up:11, down:26 },

    recipes:[
      { in:{ '#fuel':1 }, out:{}, secs:6.0 },                  // honest fuel
      { in:{ heart:1 }, from:'vital', out:{}, secs:6.0 }        // the terms
    ],

    look:{ body:'woodC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  /* ---- kiln ---------------------------------------------------------------
     Written by copying the crusher row above and changing literals: size stayed
     2x2, `accepts` and `cap` became gravel, the recipe became 2 gravel -> 1
     brick, the colours became clay. Nine lines differ.

     One line is NOT a copy, and it is the heat seam the brief asks for:
     `needs:{ heat:{ min:30 } }` means a kiln only bakes in a hot cell, so it
     wants to sit in a furnace's plume. Delete that line and it bakes cold. A
     temperature BAND — Dionysus's vats, DESIGN item 11 — is a `max` beside the
     `min`. ---- */
  { id:'kiln', name:'KILN',
    tw:2, th:2, footing:2,

    ports:[ { side:'top',    mode:'in', accepts:['gravel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ gravel:6 } },

    catchBox:{ mouth:'top', slack:2 },
    servo:{ over:0.55, mult:1.38 },

    recipes:[ { in:{ gravel:2 }, out:{ brick:1 }, secs:2.4,
                needs:{ heat:{ min:30 } } } ],

    look:{ body:'clayB', trim:'clayA', base:'clayC', fire:true,
           pips:[ { sel:'gravel', row:0 } ],
           sfx:{ accept:'crunch', produce:'bake' } } }
];

/* ---- derived indices, built once, frozen ---- */
export const MACH = Object.freeze(MACHINES.map(Object.freeze));
export const M    = Object.freeze(Object.fromEntries(MACH.map((m, i) => [m.id, i])));
