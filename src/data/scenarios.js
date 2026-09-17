/* data layer — SCENARIOS: named debug worlds. Frozen.

   `rules/scenarios.js#apply` carves, places, links, fills and arms on top of
   a world already generated from its seed.

   id/name     stable string, and a display string for the menu.
   note        one line saying what this scenario is for.
   band        the band id every coordinate below defaults to.
   cycle       1-based row of `data/cycles.js` to arm, applied as `run.cycle`
               with the live tribute cleared. A row never writes
               `run.tribute` itself.
   grant       machine ids appended to `run.granted`.
   chart       band ids appended to `run.charted`.
   favour      { [godId]: int } added to `run.favour`.
   carve       [{ dx, dy, w, h, band? }], tile rects set to air.
   tiles       the same, set to a packed pair. Only a tile-capable form.
   machines    [{ id, dx, dy, band?, buf?, charges? }] through `write.place`.
               `dx`/`dy` is the top-left tile of the footprint.
   segments    [[i, j]], indices into this row's own `machines`. Both ends
               must carry `hub:{}` and be inside reach; the clear-path half
               is a live tile question, asked at apply time.
   items       falling items, and the only way to put cargo on a carrier.
   give        straight into `run.inv`.

   `dx` is tiles right of the spawn band's `spawnTx`, `dy` tiles below the
   named band's `floorTy`. One column datum serves all three bands because
   all three share a width and tile size, which the lint asserts. Keep every
   surface column inside `dx` -9..+9, the guaranteed-flat spawn shelf and the
   only stretch where `floorTy` really is the ground row. */

export const SCENARIOS = [

  /* One crank through one gear is 1.41 drive against the 1.1 this row's four
     ore weigh, so the carrier climbs the 88 px span at 3.4 px/s. */
  { id:'winch', name:'WORKING WINCH', band:'surface',
    note:'a linked segment, its drivetrain and a loaded carrier -- hold `r` at the crank and the ore rises.',
    grant:['furnace'],
    carve:[
      /* `dy:0` is left solid in the left column as the upper hub's footing:
         a headframe straddles its shaft mouth. */
      { dx:5, dy:1, w:2, h:10 },
      { dx:6, dy:0, w:1, h:1 }
    ],
    /* The drivetrain stands on the spawn side of the hub: past the shaft,
       the walk to the crank crosses the open mouth. */
    machines:[
      { id:'hub',   dx:5, dy:-2 },
      { id:'hub',   dx:5, dy:9 },
      { id:'gear',  dx:4, dy:-1 },
      { id:'crank', dx:3, dy:-2 }
    ],
    segments:[[0, 1]],
    /* An arriving haul is released at the x it was loaded at, so cargo goes
       in the left column; the right one is the open shaft mouth. */
    items:[ { sub:'copper', form:'ore', n:4, dx:5, dy:10 } ],
    give:[ { sub:'pick', form:'relic', n:1 }, { sub:'timber', form:'rung', n:12 } ] },

  /* The furnace is sunk so its top mouth sits at the ground line, the one
     geometry that puts a belt's delivery point inside a catch box. Output is
     ejected from that mouth and falls back down the column it left. */
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

  /* The span to the dock is 240 px and a hub reaches 96, so the chain needs
     three segments and four hubs; this row gives two hubs. 33.7 T of pockets
     against a 40 T cap, so the player can still climb. */
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

  /* Both halves of the demand start in the pockets, so this fixture is the
     delivery leg without the dig for tin; remove the tin to test the dig.
     26.5 T of pockets, inside the cap. */
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

  /* Anchors are footprint centres, and the 240 px span breaks as
       stage 1   surface y 472 -> y 384   88 px, open air
       stage 2   y 384 -> astral y 296    88 px, through the slab
       stage 3   astral y 296 -> dock y 236   60 px, astral air
     Astral row 39 is carved because no headframe exemption covers it. */
  { id:'ascent', name:'THE FULL ASCENT', band:'surface',
    note:'the three-segment chain to the Cloud Dock, standing -- ride, haul and pay cycle 2 without building it.',
    cycle:2,
    grant:['furnace', 'cloud_dock'],
    chart:['astral'],
    favour:{ hephaestus:1 },
    carve:[
      /* The pocket in the astral slab: stage 2's upper hub, its crank and
         stage 3's span, stopping short of the footing row. */
      { dx:3, dy:1,  w:3, h:7, band:'astral' },
      /* Astral's bottom row, which stage 2's cable crosses. */
      { dx:3, dy:9,  w:2, h:1, band:'astral' }
    ],
    tiles:[
      /* Stage 1's upper platform: footing for its hub and its crank. */
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

/* Every scenario id, in table order, for the menu and `?scenario=`. */
export const SCENARIO_IDS = Object.freeze(SCENARIOS.map(s => s.id));
