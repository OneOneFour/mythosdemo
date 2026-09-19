/* data layer — MACHINES: one row per machine, all of it literals. Frozen.

   tw, th      footprint in tiles.
   footing     solid tiles required under it to place it.
   ports       [{ side, mode, accepts }]. `accepts` takes forms.js selectors.
   buffer.cap  { selector: units }, per-selector.
   catchBox    { mouth, slack }, in px. What falls through the mouth is taken
               with no cost.
   handFeed    { reach, from }. `reach` px is "standing beside it".
   emit        [{ field, at, rate, whileRunning }], into a scalar field.
   servo       { over, mult }, faster above `over` full.
   recipes     names from `data/recipes.js`, or inline rows. Tried in order.
   smelts      `{}`, a marker: a `smelt:true` recipe may run here.
   hub         { reach, carries }, a rope anchor buckets may ride between.
               `reach` px is the longest rope, scaled by `segReach`.
   wheel       true if a drive wheel is built in, so a rope may tie here.
   drive       { torque, speed, reach }. Torque is denominated in `segBase`
               and speed in turns of an unloaded shaft; both are supplied
               only while the player turns it.
   ratio       { mul, loss, facing }. Multiplies torque and divides speed
               downstream, or the reverse at `facing:-1`.
   belt        { dir }: 1 toward increasing world x, -1 the other way.
   variantOf   copy another row and override these keys. SHALLOW merge.
   look        appearance only; `view/` is its only reader.
   glyph       one character, the overview mark. Top level, never inside
               `look`, because `variantOf` is a shallow merge.
   light       { level, whileRunning }. `level:'max'` reads `eff('lightMax')`.
   minDepth    tiles below the spawn datum this may not be placed above.
   band        a world.js band id this may be placed in and nowhere else.
   tribute     `{}`, a marker: a cycle may be paid here.

   Rows are append-only: the index is the id a save stores. */

import { colour } from './palette.js';

export const MACHINES = [

  /* The only smelter. `burnEff` is scoped to it in `data/tuning.js` at 0.5,
     so half of what it burns is lost up the flue: one log smelts one ore and
     one coal lump smelts three. */
  { id:'kiln', name:'BASIC KILN', glyph:'K',
    tw:2, th:2, footing:2,

    smelts:{},

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    buffer:{ cap:{ '*/#ore':12, '*/#fuel':6 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ore', '*/#fuel'] },

    emit:[ { field:'heat', at:'top', rate:18, whileRunning:true } ],
    servo:{ over:0.55, mult:1.38 },

    recipes:['smelt'],

    look:{ body:'clayB', trim:'clayA', base:'clayC', fire:true,
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* `whileRunning:true` is lit while fuelled: the frame the last charge is
     spent `m.running` goes false and `rules/light.js` recomputes off the
     emitter signature changing, not off any tile write. */
  { id:'brazier', name:'BRAZIER', glyph:'*',
    tw:1, th:1, footing:1,

    ports:[ { side:'top', mode:'in', accepts:['*/#fuel'] } ],
    buffer:{ cap:{ '*/#fuel':2 } },
    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    recipes:[ { in:{}, fuel:1.0, out:[], secs:6.0 } ],

    light:{ level:12, whileRunning:true },

    look:{ body:'ochreB', trim:'ochreA', base:'ochreD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  /* Absent `whileRunning` means lit for as long as the machine exists. An
     `in:{}` recipe with no `fuel` is satisfied by construction, so `m.running`
     goes true when this is placed and stays true. */
  { id:'hearth', name:'HEARTH', glyph:'H',
    tw:2, th:2, footing:2,

    recipes:[ { in:{}, out:[], secs:Infinity } ],

    light:{ level:'max' },

    look:{ body:'basB', trim:'basA', base:'basD', fire:true, halo:'ichor' } },

  /* Runs the repetitive standard-craft recipes so the player does not have to
     hold the key for each one. Machine-build recipes stay hand-only: a chooser
     taking the first affordable row would otherwise spend a fed pile on
     whichever machine happened to be declared first. */
  { id:'contraption', name:'CONTRAPTION', glyph:'C',
    tw:2, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['iron/ingot', '#bulk/gravel', 'timber/log'] },
            { side:'top', mode:'out' } ],

    buffer:{ cap:{ 'iron/ingot':8, '#bulk/gravel':30, 'timber/log':12 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['iron/ingot', '#bulk/gravel', 'timber/log'] },

    recipes:['stone_block', 'iron_gear', 'ladder', 'kindle'],

    look:{ body:'woodB', trim:'irA', base:'irD',
           pips:[ { sel:'iron/ingot', row:0 }, { sel:'#bulk/gravel', row:1 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  /* One tile. A run of belts conducts power tile to tile and to a gear hub at
     either end, so the whole run turns together off one drive. Each tile adds
     `beltDrag` to its drivetrain's demand. */
  { id:'belt_r', name:'BELT (RIGHT)', glyph:'>',
    tw:1, th:1, footing:1,

    belt:{ dir:1 },

    look:{ body:'woodB', trim:'irA', base:'irD',
           sfx:{ produce:'winch' } } },

  { id:'belt_l', name:'BELT (LEFT)', variantOf:'belt_r', glyph:'<',
    belt:{ dir:-1 } },

  /* Power reaches a rope through orthogonal footprint adjacency, and along a
     rope between two rows carrying `wheel`. `model/segments.js#linkCheck`
     resolves the rope once both anchors are in reach over a clear span. */

  /* The only source of power, and it turns only while the player holds the
     key. `torque:1.55` against `segBase` and `segLoad` stalls a vertical rope
     at 44 T, below the 48 T a player carrying the whole burden cap weighs, so
     a laden rider still cannot be lifted. */
  { id:'winch', name:'WINCH', glyph:'W',
    tw:1, th:2, footing:1,

    drive:{ torque:1.50, speed:1.0, reach:12 },
    wheel:true,

    /* `m.turn` sweeps the handle, and the wheel at the foot reaches the
       footprint edge so it meshes with an adjacent hub or transformer. */
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

  /* `footing:1` rather than 2, so a headframe can straddle the shaft mouth
     with one column on rock and one over the void. `reach:96` is 12 tiles at
     an 8 px tile, and the smaller of two anchors governs a span. */
  { id:'hub', name:'GEAR HUB', glyph:'O',
    tw:2, th:2, footing:1,

    hub:{ reach:96, carries:['material', 'player'] },
    wheel:true,

    /* `parts` is ordered, and the order is the z-order. `cable` and
       `carrier` describe something outside the footprint, so
       `view/paint.js`'s rope pass reads them instead of dispatching them as
       parts; only a hub carries them, so a span is painted once. */
    look:{ body:'irC', trim:'irA', base:'irD',
           parts:[
             { fn:'frame', body:'woodC', hi:'woodB', lo:'woodD', post:2, beam:2 },
             /* `dy`/`h` keep the drum clear of the wheel below it. */
             { fn:'drum',  body:'woodA', hi:'ochreA', lo:'woodC', trim:'irB',
               w:12, h:5, dx:2, dy:2 },
             { fn:'gearWheel', d:9, teeth:8, rt:5, dy:4,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ],
           cable:{ hi:'snB', lo:'irC', col:'ochreA', low:'woodB', dark:'woodD', spacing:12 },
           carrier:{ body:'woodD', hi:'ochreA', lo:'irD', trim:'irA',
                     col:'cuA', depth:7 } } },

  /* A rope anchor that carries power and nothing else: no `hub` block, so no
     bucket may ride to it. Placed against whatever it is meant to turn. */
  { id:'drive_wheel', name:'DRIVE WHEEL', glyph:'o',
    tw:1, th:1, footing:1,

    /* `carries:[]` is the whole difference from a gear hub: a rope tied here
       moves torque and never a bucket. */
    hub:{ reach:96, carries:[] },
    wheel:true,

    look:{ body:'snC', trim:'snA', base:'irD',
           parts:[
             { fn:'gearWheel', d:8, teeth:8, rt:4,
               body:'snA', hi:'snB', lo:'snD', col:'snA', dark:'irC' }
           ],
           cable:{ hi:'snB', lo:'irC', col:'snC', low:'snD', dark:'irD', spacing:12 } } },

  /* Multiplies torque and divides speed downstream at `facing:1`, and the
     reverse at -1, conserving power less `loss`. `rules/placement.js` resolves
     the facing off `player.face`, so which side is which is chosen by where
     the player stands. */
  { id:'transformer', name:'GEAR TRANSFORMER', glyph:'X',
    tw:1, th:2, footing:1,

    ratio:{ mul:3.0, loss:0.10, facing:1 },

    look:{ body:'cuB', trim:'cuA', base:'cuD',
           parts:[
             { fn:'gearWheel', d:10, teeth:10, rt:5, dy:2,
               body:'cuA', hi:'veinA', lo:'cuD', col:'cuA', dark:'cuC' },
             { fn:'gearWheel', d:6, teeth:6, rt:3, dy:11,
               body:'snA', hi:'snB', lo:'snD', col:'snA', dark:'irC' }
           ] } },

  { id:'transformer_l', name:'GEAR TRANSFORMER (SPEED)', variantOf:'transformer',
    glyph:'x',
    ratio:{ mul:3.0, loss:0.10, facing:-1 } },

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
    wheel:true,

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#refined', '*/gravel'] } ],
    buffer:{ cap:{ '*/#ore':64, '*/#refined':64, '*/gravel':64 } },
    catchBox:{ mouth:'top', slack:6 },
    handFeed:{ reach:10, from:['*/#ore', '*/#refined', '*/gravel'] },

    tribute:{},

    look:{ body:'marbleB', trim:'marbleA', base:'marbleC',
           cable:{ hi:'marbleA', lo:'marbleC', col:'ichor', low:'limeC',
                   dark:'limeD', spacing:12 },
           carrier:{ body:'limeD', hi:'ichor', lo:'marbleC', trim:'marbleA',
                     col:'cuA', depth:7 } } },

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
