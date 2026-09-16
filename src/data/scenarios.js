/* LAYER data — SCENARIOS: named debug worlds. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   A SCENARIO IS A DIORAMA APPLIED AFTER `newRun()`, NEVER INSTEAD OF IT
   (CLAUDE.md invariant 8). `rules/scenarios.js#apply` carves tiles, places
   machines, links segments, fills buffers and pockets and arms a cycle, on top
   of a world that has already been generated from its seed. There is no second
   code path through boot and no scenario-shaped branch anywhere in `shell`.
   docs/SPEC.md section 29 is the contract; docs/DEVELOPER_GUIDE.md's debug
   section is how a developer reaches one.

   EVERY ROW IS DECLARATIVE, AND THAT IS THE WHOLE REASON THIS FILE IS DATA.
   `data/sources.js` is the one table in `data/` carrying code, and its own
   header states the price: a dangling reference inside a closure is invisible
   to `tools/content.mjs`, which reads names and not bodies. A scenario names
   more content than any other row shape in the game -- machine ids, substance
   x form pairs, band ids, a cycle index -- so a table of closures would be the
   one table whose every reference the content lint could not see. Stated as
   rows instead, `tools/content.mjs` assertion 27 proves every id resolves,
   every pair is holdable, every machine clears its own band and depth gate,
   and every segment is inside its hubs' reach. A scenario naming content that
   cannot exist fails the build rather than the click.

     id          stable string. `?scenario=<id>` and the menu's debug section
                 both name it, so it is part of the interface.
     name        display string, for the menu.
     note        ONE LINE saying what this scenario is FOR, in the shape
                 `data/tuning.js` rows state theirs. What it proves, and what
                 it deliberately leaves the developer to do.
     band        the band id every coordinate below defaults to.
     cycle       1-based row of `data/cycles.js` to arm. Applied as
                 `run.cycle`, with the live tribute cleared so
                 `rules/cycles.js#ensureLiveCycle` arms it on the next frame --
                 never by writing a `run.tribute` record here, which would be
                 the director's own decision made in a content table.
     grant       machine ids appended to `run.granted`, for a scenario that
                 starts past a cycle whose reward was a machine.
     chart       band ids appended to `run.charted`. Knowledge, not access.
     favour      { [godId]: int } added to `run.favour`.
     carve       [{ dx, dy, w, h, band? }] -- tile rects set to AIR.
     tiles       [{ dx, dy, w, h, sub, form, band? }] -- tile rects set to a
                 packed substance x form. Only a form carrying a `tile` block.
     machines    [{ id, dx, dy, band?, buf?, charges? }] -- placed through
                 `model/machines.js#write.place`, the same director route
                 `rules/cycles.js#ensureAltarPlaced` uses. `dx`/`dy` is the
                 TOP-LEFT tile of the footprint. `buf` is
                 [{ sub, form, n }] poured straight into the machine's buffer;
                 `charges` banks honest-fuel charges (`belt`/`brazier`).
     segments    [[i, j]] -- indices into this row's own `machines`, joined by
                 one segment each. Both ends must carry a `hub:{}` block and be
                 inside `hub.reach`; the clear-path half is a live tile
                 question, so `rules/scenarios.js` asks
                 `model/segments.js#linkCheck` and journals a refusal.
     items       [{ sub, form, n, dx, dy, band? }] -- `n` falling items spawned
                 at the centre of that tile. Material that arrives as an item
                 rather than a pocket credit, and the only way to
                 put cargo on a carrier: `rules/drive.js` reads whatever is in
                 `model/segments.js#carrierBox`.
     give        [{ sub, form, n }] -- straight into `run.inv`. Bypasses mining
                 and pickup on purpose; a scenario is a fixture, not a reward.
                 EVERY ROW GIVES A PICK, because a fixture that needs the
                 developer to remember the one lying at spawn wastes the first
                 ten seconds of every use -- and `belt-line`'s own belt drags
                 that one into the furnace pit.

   THE COORDINATE DATUM, AND WHY IT IS NOT A BARE TILE. `dx` is tiles right of
   the SPAWN band's own `spawnTx`; `dy` is tiles below the NAMED band's own
   `floorTy`, so `dy:0` is that band's first solid row and `dy:-1` the air just
   above it. One column datum serves all three bands because all three share
   the same width and tile size, which
   `tools/content.mjs` asserts rather than assumes -- so a vertical chain from
   the surface to the Heavens is vertical by construction.

   A row derived from `spawnTx`/`floorTy` also draws NO `rand()`:
   a scenario changes the world without changing the stream, so a seed still
   reproduces the same terrain under the same diorama.

   KEEP EVERY SURFACE COLUMN INSIDE `dx` -9..+9. That is
   `rules/generate.js#SHELF`'s guaranteed-flat spawn shelf, and it is the only
   stretch of surface where `floorTy` really is the ground row. A diorama
   further out lands on relief and its footing tiles are somewhere else. */

export const SCENARIOS = [

  /* A WORKING SEGMENT, WITH THE DRIVETRAIN THAT TURNS IT. The one the
     brief asked for by name. A shaft 10 rows deep with a hub straddling its
     mouth, a hub on its floor, a gear and a crank on the surface beside the
     upper hub, and four copper ore already in the carrier at the bottom.

     Walk right to the crank, hold `r`, and the carrier rises. The gear is in
     the train on purpose: one crank through one gear is 1.5 x (1 - 0.06) =
     1.41 drive, against 1.0 for an empty vertical carrier and 1.1 under this
     row's four ore -- so the climb measures 3.4 px/s and takes 26 s to cross
     the 88 px span. That is the cost of ascension, not a stall, and a scenario
     that hid it by meshing the crank straight into the hub would be teaching
     the wrong lesson.

     THE PLAYER CANNOT POWER THE CARRIER THEY ARE RIDING: a rising carrier leaves the crank's 12 px reach within two tiles.
     So this scenario demonstrates CARGO going up, and the ore in the bucket is
     the point. */
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

  /* A FED LINE, RUNNING. A belt on the flat carrying copper ore right
     into a furnace sunk in a pit so its top mouth is at the ground line, which
     is the only geometry that puts a belt's delivery point inside a catch box
     (docs/FINDINGS.md holds the arithmetic).

     THE FURNACE IS IN A PIT AND NOT ON A PLINTH because a machine's output is
     ejected from its own out-port mouth and falls straight back down the
     column it left: sinking the furnace puts the arriving ore at mouth height
     and the finished ingots at the player's feet in the pit, where they can be
     collected. Nothing in this game can put a belt under a furnace's output --
     a belt only drags items resting on terrain, and a furnace's output rests on
     the terrain inside the furnace's own footprint.

     Both machines start fed: two logs in each, which is the fuel cap, four ore in
     the furnace so it is already smelting, and eight banked charges on the belt
     so it drags from the first frame rather than after six seconds of burning
     its own fuel. */
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
     Three copper plate is the whole demand, so the trial is payable the moment
     the player reaches the dock -- and reaching it is the point. Two hubs, a
     crank and a gear are the start of the chain and deliberately not all of it:
     the surface-to-astral span is 240 px and a hub reaches 96, so it is three
     segments and four hubs, and a scenario that
     handed over the finished chain would be `ascent` below.

     33.7 T of pockets against a 40 T cap, so the player can still climb.
     `cloud_dock` is granted with `furnace` because that is cycle 1's own
     reward pair (`data/cycles.js`), and a cycle-2 fixture that could not place
     the receiver would be arming a trial it cannot pay. */
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

  /* ARMED AT THE THIRD TRIAL, WHICH IS THE ONE THAT FORCES DEPTH. Athena
     wants four tin ingot, and tin does not exist above topsoil row 60 --
     96 M under the datum (`data/world.js`, docs/SPEC.md section 18.4). Both
     halves of the demand are in the pockets, which is exactly what this
     fixture is for: it tests the DELIVERY leg of cycle 3 without a 96-tile
     dig first. To test the dig instead, take the tin back out.

     26.5 T of pockets, so the crank and gear come along and the plates and
     ingots still fit under the cap. */
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

  /* THE WHOLE ASCENT, BUILT. Three segments, four hubs, a crank at each
     stage, a rung ladder up the side, and the Cloud Dock on the astral ground
     line -- the win path of docs/SPEC.md section 18 standing up so a developer
     can ride and haul it instead of spending twenty minutes building it.

     THE STAGES AND WHY THEY LAND WHERE THEY DO. Anchors are footprint centres
     (section 17.5), and the span is 240 px from the surface ground line
     (world y 480) to the astral ground line (world y 240), of which the middle
     80 px is astral's own 10-row stone slab:

       stage 1   surface ground  y 472 -> y 384   88 px, open air
       stage 2   y 384 -> astral y 296            88 px, through the slab
       stage 3   astral y 296 -> the dock y 236   60 px, astral air

     Stage 1's upper hub floats on a placed `stone/block` platform, because
     there is nothing at surface row 9 to stand on. Stage 2's upper hub sits in
     a pocket carved out of the astral slab and stands on the slab's own
     remaining rows. Astral row 39 is carved because it is the one slab row no
     headframe exemption covers, and a cable may not pass a solid tile
     (section 17.6).

     THE PLAYER CLIMBS AND THE CARGO RIDES. A rider cannot turn the crank of
     the carrier they are on (section 17.6), so the ladder beside the chain is
     not scenery: each stage is cranked from a standing position beside it. */
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
