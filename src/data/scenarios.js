/* LAYER data — SCENARIOS: named debug worlds. Frozen. Imports nothing.

   A SCENARIO IS A DIORAMA APPLIED AFTER `newRun()`, NEVER INSTEAD OF IT.
   `rules/scenarios.js#apply` carves, places, links, fills and arms on top of
   a world already generated from its seed. No second code path through boot.

   EVERY ROW IS DECLARATIVE, AND THAT IS WHY THIS FILE IS DATA.
   `data/sources.js` is the one table in `data/` carrying code, and its own
   header states the price: a dangling reference inside a closure is invisible
   to the content lint, which reads names and not bodies. A scenario names
   more content than any other row shape, so closures would be the one table
   whose every reference the lint could not see. Stated as rows instead, it
   proves every id resolves, every pair is holdable, every machine clears its
   band and depth gate, and every segment is inside its hubs' reach.

   id/name     stable string, and a display string for the menu.
   note        ONE LINE saying what this scenario is FOR.
   band        the band id every coordinate below defaults to.
   cycle       1-based row of `data/cycles.js` to arm, applied as `run.cycle`
               with the live tribute cleared -- never by writing a
               `run.tribute` record here, which is the director's decision.
   grant       machine ids appended to `run.granted`.
   chart       band ids appended to `run.charted`. Knowledge, not access.
   favour      { [godId]: int } added to `run.favour`.
   carve       [{ dx, dy, w, h, band? }], tile rects set to AIR.
   tiles       the same, set to a packed pair. Only a tile-capable form.
   machines    [{ id, dx, dy, band?, buf?, charges? }] through `write.place`,
               the same director route the altar uses. `dx`/`dy` is the
               TOP-LEFT tile of the footprint.
   segments    [[i, j]], indices into this row's own `machines`. Both ends
               must carry `hub:{}` and be inside reach; the clear-path half is
               a live tile question and is asked at apply time.
   items       falling items, and the only way to put cargo on a carrier.
   give        straight into `run.inv`. EVERY ROW GIVES A PICK, because a
               fixture needing the developer to find the one at spawn wastes
               the first ten seconds of every use.

   THE COORDINATE DATUM: `dx` is tiles right of the SPAWN band's `spawnTx`,
   `dy` is tiles below the NAMED band's `floorTy`. One column datum serves all
   three bands because all three share a width and tile size, which the lint
   asserts rather than assumes -- so a vertical chain is vertical by
   construction. Derived that way it draws NO `rand()`.

   KEEP EVERY SURFACE COLUMN INSIDE `dx` -9..+9, the guaranteed-flat spawn
   shelf and the only stretch where `floorTy` really is the ground row. */

export const SCENARIOS = [

  /* A WORKING SEGMENT, WITH THE DRIVETRAIN THAT TURNS IT. Walk right to the
     crank, hold `r`, and the carrier rises.

     The gear is in the train ON PURPOSE: one crank through one gear is 1.41
     drive against 1.1 under this row's four ore, so the climb measures
     3.4 px/s and takes 26 s across the 88 px span. That is the cost of
     ascension, and meshing the crank straight into the hub would teach the
     wrong lesson. THE PLAYER CANNOT POWER THE CARRIER THEY RIDE, so this
     demonstrates CARGO going up. */
  { id:'winch', name:'WORKING WINCH', band:'surface',
    note:'a linked segment, its drivetrain and a loaded carrier -- hold `r` at the crank and the ore rises.',
    grant:['furnace'],
    carve:[
      /* The shaft. Both columns from one row under the headframe down to the
         lower hub's own footprint, leaving `dy:0` in the left column as the
         upper hub's footing -- a headframe straddles its shaft mouth,
         so one column stands on rock and one over
         the void. */
      { dx:5, dy:1, w:2, h:10 },
      { dx:6, dy:0, w:1, h:1 }
    ],
    /* THE DRIVETRAIN STANDS ON THE SPAWN SIDE OF THE HUB, and that is not
       decoration: with the crank past the shaft, the walk to it crosses the
       open mouth and the player falls in before they ever turn it. Measured. */
    machines:[
      { id:'hub',   dx:5, dy:-2 },
      { id:'hub',   dx:5, dy:9 },
      { id:'gear',  dx:4, dy:-1 },
      { id:'crank', dx:3, dy:-2 }
    ],
    segments:[[0, 1]],
    /* THE CARGO LOADS IN THE LEFT COLUMN, not the right. An arriving haul is
       released at the x it was loaded at, and the right column is the open
       shaft mouth -- cargo loaded there is delivered to the top and falls
       straight back down the hole. Measured. */
    items:[ { sub:'copper', form:'ore', n:4, dx:5, dy:10 } ],
    give:[ { sub:'pick', form:'relic', n:1 }, { sub:'timber', form:'rung', n:12 } ] },

  /* A FED LINE, RUNNING. A belt carrying ore into a furnace sunk in a pit so
     its top mouth is at the ground line, the only geometry that puts a belt's
     delivery point inside a catch box.

     THE FURNACE IS IN A PIT AND NOT ON A PLINTH, because output is ejected
     from its own mouth and falls back down the column it left -- sinking it
     puts arriving ore at mouth height and finished ingots at the player's
     feet. Nothing can put a belt under a furnace's output. Both machines
     start fed, so the line runs from the first frame. */
  { id:'belt-line', name:'RUNNING BELT LINE', band:'surface',
    note:'a fuelled belt feeding a sunk furnace -- catch-box chaining visible running, output piling in the pit.',
    grant:['furnace'],
    carve:[ { dx:7, dy:0, w:3, h:2 } ],
    machines:[
      { id:'belt_r', dx:3, dy:-1,
        buf:[ { sub:'timber', form:'log', n:2 } ], charges:8 },
      { id:'furnace', dx:7, dy:0,
        buf:[ { sub:'copper', form:'ore', n:4 }, { sub:'timber', form:'log', n:2 } ] }
    ],
    items:[ { sub:'copper', form:'ore', n:4, dx:3, dy:-1 } ],
    give:[ { sub:'pick', form:'relic', n:1 },
            { sub:'timber', form:'log', n:6 }, { sub:'copper', form:'ore', n:8 } ] },

  /* ARMED AT THE SECOND TRIAL, WITH THE FIRST ONE'S REWARD ALREADY PAID.
     Three plate is the whole demand, so the trial is payable the moment the
     player REACHES the dock -- and reaching it is the point. Two hubs, a crank
     and a gear are the START of the chain and deliberately not all of it: the
     span is 240 px and a hub reaches 96, so it is three segments and four
     hubs.

     33.7 T of pockets against a 40 T cap, so the player can still climb.
     `cloud_dock` is granted with `furnace` because that is cycle 1's own
     reward pair. */
  { id:'cycle2', name:'TRIAL II — THE FIRST DELIVERY', band:'surface',
    note:'cycle 2 armed with cycle 1 paid: the demand is in your pockets and the ascent is not built.',
    cycle:2,
    grant:['furnace', 'cloud_dock'],
    chart:['astral'],
    favour:{ hephaestus:1 },
    give:[
      { sub:'pick',   form:'relic', n:1 },
      { sub:'copper', form:'plate', n:3 },
      { sub:'hub',    form:'rig',   n:2 },
      { sub:'crank',  form:'rig',   n:1 },
      { sub:'gear',   form:'rig',   n:1 }
    ] },

  /* ARMED AT THE THIRD TRIAL, WHICH IS THE ONE THAT FORCES DEPTH: tin does not
     exist above topsoil row 60. Both halves of the demand are in the pockets,
     because this fixture tests the DELIVERY leg without a 96-tile dig first.
     To test the dig instead, take the tin back out. 26.5 T of pockets, so
     everything still fits under the cap. */
  { id:'cycle3', name:'TRIAL III — THE GREY-EYED TITHE', band:'surface',
    note:'cycle 3 armed with its demand already mined -- the delivery leg without the 96 M dig.',
    cycle:3,
    grant:['furnace', 'cloud_dock'],
    chart:['astral', 'topsoil'],
    favour:{ hephaestus:3 },
    give:[
      { sub:'pick',   form:'relic', n:1 },
      { sub:'copper', form:'plate', n:6 },
      { sub:'tin',    form:'ingot', n:4 },
      { sub:'crank',  form:'rig',   n:1 },
      { sub:'gear',   form:'rig',   n:1 }
    ] },

  /* THE WHOLE ASCENT, BUILT: three segments, four hubs, a crank at each stage,
     a rung ladder up the side, and the dock on the astral ground line.
     Anchors are footprint centres, and the 240 px span breaks as
       stage 1   surface y 472 -> y 384   88 px, open air
       stage 2   y 384 -> astral y 296    88 px, through the slab
       stage 3   astral y 296 -> dock y 236   60 px, astral air

     Stage 1's upper hub floats on a placed `stone/block`. Astral row 39 is
     CARVED because it is the one slab row no headframe exemption covers. THE
     PLAYER CLIMBS AND THE CARGO RIDES, so the ladder is not scenery. */
  { id:'ascent', name:'THE FULL ASCENT', band:'surface',
    note:'the three-segment chain to the Cloud Dock, standing -- ride, haul and pay cycle 2 without building it.',
    cycle:2,
    grant:['furnace', 'cloud_dock'],
    chart:['astral'],
    favour:{ hephaestus:1 },
    carve:[
      /* The pocket in the astral slab: stage 2's upper hub, its crank and the
         whole of stage 3's span, down to but not including the footing row. */
      { dx:3, dy:1,  w:3, h:7, band:'astral' },
      /* Astral's bottom row, which stage 2's cable crosses and no headframe
         covers. */
      { dx:3, dy:9,  w:2, h:1, band:'astral' }
    ],
    tiles:[
      /* Stage 1's upper platform: footing for its hub and its crank both. */
      { dx:3, dy:-11, w:3, h:1, sub:'stone', form:'block' },
      /* The ladder, surface ground to the astral slab and up through it. */
      { dx:6, dy:-20, w:1, h:20, sub:'timber', form:'rung' },
      { dx:6, dy:0,   w:1, h:10, sub:'timber', form:'rung', band:'astral' }
    ],
    machines:[
      { id:'hub',        dx:3, dy:-2 },
      { id:'hub',        dx:3, dy:-13 },
      { id:'hub',        dx:3, dy:6,  band:'astral' },
      { id:'cloud_dock', dx:3, dy:-1, band:'astral' },
      { id:'crank',      dx:5, dy:-2 },
      { id:'crank',      dx:5, dy:-13 },
      { id:'crank',      dx:5, dy:6,  band:'astral' }
    ],
    segments:[[0, 1], [1, 2], [2, 3]],
    give:[
      { sub:'pick',   form:'relic', n:1 },
      { sub:'copper', form:'plate', n:3 },
      { sub:'timber', form:'rung',  n:12 }
    ] }
];

export const SCENARIO = Object.freeze(Object.fromEntries(
  SCENARIOS.map(s => [s.id, Object.freeze(s)])));

/* Every scenario id, in table order, so the menu's debug section and
   `?scenario=` validation both read one list rather than each deriving it. */
export const SCENARIO_IDS = Object.freeze(SCENARIOS.map(s => s.id));
