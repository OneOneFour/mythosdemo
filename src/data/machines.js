/* data layer — MACHINES: one row per machine, all of it literals. Frozen.

   tw, th      footprint in tiles.
   footing     solid tiles required under it to place it.
   ports       [{ side, mode, accepts }]. `accepts` takes forms.js selectors.
   buffer.cap  { selector: units }, per-selector, so 8-ore/2-fuel needs no
               second field.
   catchBox    { mouth, slack }, in px. What falls through the mouth is taken
               with no cost.
   handFeed    { reach, from }. `reach` px is "standing beside it", read by
               both the armed-click verb and the automatic drain.
   emit        [{ field, at, rate, whileRunning }], into a scalar field.
   servo       { over, mult }, faster above `over` full. Bounds the buffer.
   recipes     names from `data/recipes.js`, or inline rows. Tried in order;
               the first satisfiable one runs.
   hub         { reach, carries }, an endpoint a segment may anchor to.
               `reach` px is the longest cable, scaled by `segReach`.
   crank       { torque, reach }. Torque is denominated in `segBase` and is
               supplied only while the player turns it.
   gear        { loss } fraction of torque lost per drivetrain hop.
   variantOf   copy another row and override these keys. SHALLOW merge.
   look        appearance only; `view/` is its only reader.
   glyph       one character, the overview mark. Top level, never inside
               `look`, because `variantOf` is a shallow merge.
   light       { level, whileRunning }. `level:'max'` is a sentinel for
               `eff('lightMax')` read at tick time.
   mine        { facing, tier, tiles, secs }. `secs` is how long one fuel
               unit of chewing lasts, not a break speed.
   minDepth    tiles below the spawn datum this may not be placed above.
   band        a world.js band id this may be placed in and nowhere else.
   tribute     `{}`, a marker: a cycle may be paid here.

   Rows are append-only: the index is the id a save stores. */

import { colour } from './palette.js';

export const MACHINES = [

  { id:'furnace', name:'CRUDE FURNACE', glyph:'F',
    tw:3, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    /* Two runs of headroom on both clauses at `smelt`'s 4 ore, 1 fuel. */
    buffer:{ cap:{ '*/#ore':8, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ore', '*/#fuel'] },

    emit:[ { field:'heat', at:'top', rate:18, whileRunning:true } ],
    servo:{ over:0.55, mult:1.38 },

    recipes:['smelt'],

    look:{ body:'irC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  { id:'kiln_divine', name:'DIVINE KILN', variantOf:'furnace',
    look:{ body:'clayB', trim:'clayA', base:'clayC', fire:true, halo:'ichor',
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'divine' } } },

  /* No `needs:{heat:{min}}`: heat does not diffuse, so a press above a
     furnace reads the same heat as one in an empty field and the gate would
     never open. */
  { id:'press', name:'PRESS', glyph:'P',
    tw:2, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ingot', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    /* Two runs of headroom at `press`'s 3 ingot, 1 fuel. */
    buffer:{ cap:{ '*/#ingot':6, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ingot', '*/#fuel'] },

    recipes:['press'],

    look:{ body:'irB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#ingot', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* `rules/belts.js` reads `belt.dir`: 1 toward increasing world x, -1 the
     other way. `belt_l` has no recipe of its own -- an identical bill is a tie
     `choose`'s first match cannot resolve -- so both share one substance. */
  { id:'belt_r', name:'CONVEYOR (RIGHT)', glyph:'>',
    tw:4, th:1, footing:4,

    ports:[ { side:'top', mode:'in', accepts:['*/#fuel'] } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    belt:{ dir:1 },

    recipes:[ { in:{ '*/#fuel':1 }, out:[], secs:6.0 } ],

    look:{ body:'woodB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  { id:'belt_l', name:'CONVEYOR (LEFT)', variantOf:'belt_r', glyph:'<',
    belt:{ dir:-1 } },

  /* `whileRunning:true` is lit while fuelled: the frame the last charge is
     spent `m.running` goes false and `rules/light.js` recomputes off the
     emitter signature changing, not off any tile write. */
  { id:'brazier', name:'BRAZIER', glyph:'*',
    tw:1, th:1, footing:1,

    ports:[ { side:'top', mode:'in', accepts:['*/#fuel'] } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    recipes:[ { in:{ '*/#fuel':1 }, out:[], secs:6.0 } ],

    light:{ level:12, whileRunning:true },

    look:{ body:'ochreB', trim:'ochreA', base:'ochreD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  /* Absent `whileRunning` means lit for as long as the machine exists. */
  { id:'hearth', name:'HEARTH', glyph:'H',
    tw:2, th:2, footing:2,

    /* An `in:{}` recipe is satisfied by construction, so `m.running` goes
       true when this is placed and stays true, while `m.prog` can never
       reach `Infinity` and nothing is spent or produced. */
    recipes:[ { in:{}, out:[], secs:Infinity } ],

    light:{ level:'max' },

    look:{ body:'basB', trim:'basA', base:'basD', fire:true, halo:'ichor' } },

  /* There is no rate key: `rules/machines.js#mine` reads
     `eff('pickPower') x bestHandToolPower()`, the same two numbers a swinging
     player reads. */
  { id:'talos_head', name:'TALOS HEAD', glyph:'T',
    tw:1, th:1, footing:1,

    ports:[ { side:'top',    mode:'in',  accepts:['*/#fuel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '*/#fuel':4 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    mine:{ facing:1, tier:2, tiles:1, secs:12.0 },

    look:{ body:'cuB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite' } } },

  { id:'talos_head_l', name:'TALOS HEAD (LEFT)', variantOf:'talos_head',
    mine:{ facing:-1, tier:2, tiles:1, secs:12.0 } },

  /* `tiles:3` is width, not speed: the per-tile rate is the talos head's.
     `minDepth:200` is tiles below the spawn datum, just above the adamant
     blobs at topsoil row 220. */
  { id:'cyclops_maw', name:'CYCLOPS MAW', glyph:'M',
    tw:1, th:3, footing:1,

    ports:[ { side:'top',    mode:'in',  accepts:['*/#fuel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '*/#fuel':6 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    minDepth:200,

    mine:{ facing:1, tier:3, tiles:3, secs:3.0 },

    look:{ body:'adamantB', trim:'adamantD', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite' } } },

  { id:'cyclops_maw_l', name:'CYCLOPS MAW (LEFT)', variantOf:'cyclops_maw',
    mine:{ facing:-1, tier:3, tiles:3, secs:3.0 } },

  /* Crank, gear, axle and hub conduct power only through orthogonal footprint
     adjacency. The cable is auto-resolved: `model/segments.js#linkCheck` makes
     a segment once both hubs are within reach over a clear span. */

  /* `footing:1` rather than 2, so a headframe can straddle the shaft mouth
     with one column on rock and one over the void. `reach:96` is 12 tiles at
     an 8 px tile, and the smaller of two hubs governs a span. */
  { id:'hub', name:'WINCH HUB', glyph:'O',
    tw:2, th:2, footing:1,

    hub:{ reach:96, carries:['material', 'player'] },

    /* `parts` is ordered, and the order is the z-order. `cable` and
       `carrier` describe something outside the footprint, so
       `view/paint.js`'s segment pass reads them instead of dispatching them
       as parts; only the hub carries them, so a span is painted once. */
    look:{ body:'irC', trim:'irA', base:'irD',
           parts:[
             { fn:'frame', body:'woodC', hi:'woodB', lo:'woodD', post:2, beam:2 },
             /* `dy`/`h` keep the drum clear of the gear wheel below it. */
             { fn:'drum',  body:'woodA', hi:'ochreA', lo:'woodC', trim:'irB',
               w:12, h:5, dx:2, dy:2 },
             { fn:'gearWheel', d:9, teeth:8, rt:5, dy:4,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ],
           cable:{ hi:'snB', lo:'irC', col:'ochreA', low:'woodB', dark:'woodD', spacing:12 },
           carrier:{ body:'woodD', hi:'ochreA', lo:'irD', trim:'irA',
                     col:'cuA', full:40, depth:7 } } },

  /* `torque:1.5` must exceed `segBase`: at exactly 1.0 the surplus on an
     empty vertical carrier is zero and nothing rises. At 1.5 one crank holds
     about 20 T and runs backwards over it, and 40 T needs 2.0. */
  { id:'crank', name:'HAND CRANK', glyph:'C',
    tw:1, th:2, footing:1,

    crank:{ torque:1.5, reach:12 },

    /* `m.turn` sweeps the handle, and the gear at the foot reaches the
       footprint edge so it meshes with an adjacent gear or hub. */
    look:{ body:'woodC', trim:'irA', base:'irD',
           parts:[
             { fn:'shaft', body:'woodA', hi:'ochreA', lo:'woodC', trim:'irB',
               thick:4, inset:1, collars:2, dx:-2 },
             { fn:'gearWheel', d:7, teeth:8, rt:4, dx:2, dy:5,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' },
             /* `cx:2` puts the bearing on the post, not the tile centre;
                `a0` is the handle's rest angle in radians. */
             { fn:'crankArm', body:'irB', col:'ochreA', hi:'veinA', dark:'irD',
               cx:2, cy:6, r:5, a0:-0.6 }
           ] } },

  /* `loss` is the fraction of torque lost per hop. Diagonals do not conduct,
     so a corner needs a gear in it. */
  { id:'gear', name:'GEAR', glyph:'X',
    tw:1, th:1, footing:1,

    gear:{ loss:0.06 },

    /* `teeth:8` puts one tooth on each axis at rotational phase 0, so two
       orthogonally adjacent gears read as meshed at rest. */
    look:{ body:'cuB', trim:'cuA', base:'cuD',
           parts:[
             { fn:'gearWheel', d:8, teeth:8, rt:4,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ] } },

  /* `footing:1` rather than 3, because an axle spans a gap. */
  { id:'axle', name:'AXLE', variantOf:'gear', glyph:'-',
    tw:3, th:1, footing:1,

    gear:{ loss:0.02 },

    /* The end wheels use the gear's own `gearWheel` at the same tooth
       radius, so a mixed train reads as continuous. Nothing meshes with the
       bare middle of the span. */
    look:{ body:'woodB', trim:'cuA', base:'woodD',
           parts:[
             { fn:'shaft', body:'woodB', hi:'woodA', lo:'woodD', trim:'irB',
               thick:4, inset:3, collars:2 },
             { fn:'gearWheel', d:8, teeth:8, rt:4, dx:-8,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' },
             { fn:'gearWheel', d:8, teeth:8, rt:4, dx:8,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ] } },

  /* Both receivers are the same block -- `ports`, `buffer.cap`, `catchBox`,
     `handFeed`, `tribute:{}`, no `recipes` -- and accept only what a cycle
     can demand, so nothing else that falls in is swallowed. The dock adds
     `hub`; the altar does not. */

  /* `slack:6` is not catching in flight: `rules/drive.js` releases a haul
     inside the footprint at `box.y + 4` and it rests at `box.y + 6`, past the
     mouth's own end at `box.y + 2`. `cap:64` makes this buffer a ledger. */
  { id:'cloud_dock', name:'THE CLOUD DOCK', glyph:'D',
    tw:2, th:1, footing:2,

    band:'astral',

    hub:{ reach:96, carries:['material', 'player'] },

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#refined', '*/gravel'] } ],
    buffer:{ cap:{ '*/#ore':64, '*/#refined':64, '*/gravel':64 } },
    catchBox:{ mouth:'top', slack:6 },
    handFeed:{ reach:10, from:['*/#ore', '*/#refined', '*/gravel'] },

    tribute:{},

    look:{ body:'marbleB', trim:'marbleA', base:'marbleC',
           cable:{ hi:'marbleA', lo:'marbleC', col:'ichor', low:'limeC',
                   dark:'limeD', spacing:12 },
           carrier:{ body:'limeD', hi:'ichor', lo:'marbleC', trim:'marbleA',
                     col:'cuA', full:40, depth:7 } } },

  /* The player can never hold this one: with no substance and no recipe,
     `machineHeldSub` resolves nothing through `S[...]` and the row never
     passes `placementCheck`'s held-item clause. `rules/cycles.js` places it
     through `write.place`, which asks nothing about held items. */
  { id:'altar', name:'THE SURFACE ALTAR', glyph:'A',
    tw:2, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#refined', '*/gravel'] } ],
    buffer:{ cap:{ '*/#ore':64, '*/#refined':64, '*/gravel':64 } },
    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ore', '*/#refined', '*/gravel'] },

    tribute:{},

    look:{ body:'limeB', trim:'limeA', base:'limeD', halo:'ichor' } }
];

/* A variant is a shallow merge of the named base row under its own keys, so
   a variant changing one port restates the whole `ports` array. */

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

/* Fail at import, not at paint time, on a mistyped colour name. */
for (const m of MACH)
  for (const k of ['body', 'trim', 'base', 'halo'])
    if (m.look?.[k]) colour(m.look[k]);
