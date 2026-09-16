/* LAYER data — MACHINES: one row per machine, all of it literals. Frozen.
   Imports `data` only. May be imported by `data`, `model`, `rules`, `view`.

   tw, th      footprint in tiles.
   footing     solid tiles required under it to place it.
   ports       [{ side, mode, accepts }]. `accepts` takes forms.js selectors.
   buffer.cap  { selector: units }, per-selector, so 8-ore/2-fuel needs no
               second field.
   catchBox    { mouth, slack }. What falls through the mouth is free, which
               is why a machine under a vein beats one on the surface.
   handFeed    { reach, from }. `reach` px is "standing beside it", read by
               both the armed-click verb and the automatic drain.
   emit        [{ field, at, rate, whileRunning }], into a scalar field.
   servo       { over, mult }, faster above `over` full. Bounds the buffer.
   recipes     names from recipes.js, or inline rows. Tried IN ORDER, first
               satisfiable one runs, so order is a design decision.
   hub         { reach, carries }, an endpoint a segment may anchor to.
               `reach` px is the longest cable, scaled by `segReach`.
   crank       { torque, reach }. Torque is in `segBase`, supplied only while
               the player turns it. The only power source.
   gear        { loss } fraction of torque lost per drivetrain hop.
   variantOf   copy another row and override these keys. SHALLOW merge.
   look        appearance only; `view/` is its only reader.
   glyph       ONE CHARACTER, the overview mark. Top level, never inside
               `look`, because `variantOf` is shallow.
   light       { level, whileRunning }. `level:'max'` is a sentinel for
               `eff('lightMax')` read at tick time.
   mine        { facing, tier, tiles, secs }. `secs` is how long one fuel
               unit of chewing lasts, never a break-speed.
   minDepth    tiles below the spawn datum this may not be placed above.
   band        a world.js band id this may be placed in and nowhere else.
   tribute     `{}`, a marker: a cycle may be paid here.

   Rows are APPEND-ONLY, because the index is the id a save stores. */

import { colour } from './palette.js';

export const MACHINES = [

  /* FURNACE. 3x2, catches what falls in, can be hand-fed, and smelts. The
     recipe is the shared `smelt` row, which is why one machine smelts every
     ore in the game and every ore added later. */
  { id:'furnace', name:'CRUDE FURNACE', glyph:'F',
    tw:3, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    /* 8 is two runs of headroom at `smelt`'s 4 ore, matching the fuel cap's
       own two runs at 1. An asymmetric CAP, not an asymmetric ratio. */
    buffer:{ cap:{ '*/#ore':8, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ore', '*/#fuel'] },

    emit:[ { field:'heat', at:'top', rate:18, whileRunning:true } ],
    servo:{ over:0.55, mult:1.38 },

    recipes:['smelt'],

    look:{ body:'irC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* KILN DIVINE: the variant. */
  { id:'kiln_divine', name:'DIVINE KILN', variantOf:'furnace',
    look:{ body:'clayB', trim:'clayA', base:'clayC', fire:true, halo:'ichor',
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'divine' } } },

  /* PRESS: the second compression tier, at 12:1. Its own row rather than a
     `variantOf:'furnace'`, because it runs a different recipe with a
     different input shape. 2x2, smaller than the furnace, because it works on
     ingots already reduced from ore and wants less mouth to feed it.

     No `needs:{heat:{min}}` gate: diffusion is unimplemented, so a press
     above a furnace sits at the same heat as one in an empty field, and a
     gate that is permanently shut is worse than no gate. */
  { id:'press', name:'PRESS', glyph:'P',
    tw:2, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ingot', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    /* Same 2x-recipe headroom rule as the furnace: `press` spends 3 ingot / 1
       fuel per run, so the caps double that. */
    buffer:{ cap:{ '*/#ingot':6, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ingot', '*/#fuel'] },

    recipes:['press'],

    /* Iron-toned like the furnace's trim, not its body, so it reads as the
       same forge-metal family without being mistaken for one. Reuses
       `ignite`/`ingot` because no press sound row exists yet. */
    look:{ body:'irB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#ingot', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* BELT: horizontal relocation, priced to be RARE. It runs no transform, so
     `rules/belts.js` reads `belt.dir` and drags a resting item along the
     footprint. `out:[]` banks a charge, spent one per item delivered off the
     end. `footing:4` is a solid floor under the whole span.

     `belt.dir` is `1` toward increasing world x, `-1` toward decreasing.
     `belt_l` is this row with that key flipped, and both share ONE substance,
     resolved off `player.face` at placement -- which is why `belt_l` needs no
     recipe: its bill would be bit-identical and first-match could not resolve
     the tie. */
  { id:'belt_r', name:'CONVEYOR (RIGHT)', glyph:'>',
    tw:4, th:1, footing:4,

    ports:[ { side:'top', mode:'in', accepts:['*/#fuel'] } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    belt:{ dir:1 },

    recipes:[ { in:{ '*/#fuel':1 }, out:[], secs:6.0 } ],

    /* Timber-and-iron, not fired clay: a belt is built, not stoked, and
       `fire:true` reads as the burner that pays for the drag. Reuses
       `ignite`/`winch` because no belt sound row exists yet. */
    look:{ body:'woodB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  { id:'belt_l', name:'CONVEYOR (LEFT)', variantOf:'belt_r', glyph:'<',
    belt:{ dir:-1 } },

  /* BRAZIER: the placed, fuel-powered light. The belt's honest-fuel recipe
     shape, so `whileRunning:true` is "lit while fuelled" for free -- the
     frame the last charge is spent `m.running` goes false and
     `rules/light.js` recomputes off the emitter signature changing, not off
     any tile write. 1x1, a bowl on the ground rather than a structure. */
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

  /* HEARTH: placed, never expires. Absent `whileRunning` means "lit for as
     long as it exists", which for a machine with no fuel is never expiring.
     `level:'max'` tracks `eff('lightMax')` rather than a frozen 15, so a boon
     widening the daylight ceiling widens this too. */
  { id:'hearth', name:'HEARTH', glyph:'H',
    tw:2, th:2, footing:2,

    /* An `in:{}` recipe is satisfied by construction, so `m.running` goes true
       the instant this is placed and stays true: `m.prog` only grows and can
       never reach `Infinity`, so nothing is spent or produced. Here ONLY so
       the generic fire-glow look, gated on `m.running`, reads as lit with no
       interpreter change. */
    recipes:[ { in:{}, out:[], secs:Infinity } ],

    light:{ level:'max' },

    /* No `sfx`: `accept`/`produce` are never pushed for a recipe with no
       inputs and no outputs, so there is nothing here for either key to
       name. */
    look:{ body:'basB', trim:'basA', base:'basD', fire:true, halo:'ichor' } },

  /* TALOS HEAD: the first placed miner, bolted facing sideways into the wall
     it chews. `tier:2` is identical to the adamant auger's own tool tier, so
     it bites exactly what a T2 hand can and no more. `secs:12.0` gives four
     buffered units about a minute unattended.

     The RATE is not a key here at all: `rules/machines.js#mine` reads
     `eff('pickPower') x bestHandToolPower()`, the same two numbers a swinging
     player reads, so the two cannot drift. */
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

  /* CYCLOPS MAW: gated behind depth, three tiles tall so it faces a 3-tile
     column at once. That is WIDTH, not speed -- it chews at the identical
     per-tile rate the talos head does. `tier:3` is the one tier no hand tool
     reaches, so its `cost` is priced in granite-tier goods a T2 auger CAN
     reach; a machine buildable only from the material it alone can mine could
     never get built.

     `secs:3.0`, a quarter of the talos head's, is a thirstier machine rather
     than a faster one. `minDepth:200` sits just above the adamant blobs at
     topsoil row 220, so it can be placed on the approach. */
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

  /* SEGMENT TRANSPORT. Power is physical: a crank, a gear, an axle and the hub
     they feed conduct only through orthogonal footprint adjacency. The CABLE
     is the one auto-resolved piece -- both hubs within reach over a clear
     span and `model/segments.js#linkCheck` resolves the segment. The player
     places endpoints and drivetrains, never cable.

     The first rows that are not catch boxes, so their `look` carries
     `parts:[...]` rather than the generic box. `body`/`trim`/`base` stay as a
     generic reader's fallback. Only the hub carries `cable` and `carrier`,
     and none of the four burns anything. */

  /* WINCH HUB: the endpoint, and the investment. 2x2.

     `footing:1` is required, not a discount. A headframe straddles the shaft
     mouth, one column on rock and one over the void. With both supported, no
     span steeper than 45 degrees can leave an upper hub, because the cable
     leaves the footprint's CENTRE into the footing tile one row below.

     `reach:96` is 12 tiles at today's 8 px tile, and the SMALLER of two hubs
     governs a span. No `ports`, `buffer` or `recipes`: a hub receives cargo
     by having a carrier arrive, which is `rules/drive.js`'s job. */
  { id:'hub', name:'WINCH HUB', glyph:'O',
    tw:2, th:2, footing:1,

    hub:{ reach:96, carries:['material', 'player'] },

    /* A timber post-and-beam frame, a winding drum and one large drive gear.
       `parts` is ORDERED and the order is the z-order, so the frame goes down
       first and the wheels sit in it.

       `cable` and `carrier` are read by `view/paint.js`'s segment pass rather
       than dispatched as parts, because they describe something outside this
       footprint. Only the hub carries them, which is what stops a span being
       painted twice. */
    look:{ body:'irC', trim:'irA', base:'irD',
           parts:[
             /* The frame recedes and the moving parts come forward: the
                structure is the darkest timber, the drum bright ochre, the
                gear pale iron. What turns is what you see. */
             { fn:'frame', body:'woodC', hi:'woodB', lo:'woodD', post:2, beam:2 },
             /* Rows 2-6, clear of the gear. Overlapped, the drum vanished
                and the hub read as one wheel in a picture frame. */
             { fn:'drum',  body:'woodA', hi:'ochreA', lo:'woodC', trim:'irB',
               w:12, h:5, dx:2, dy:2 },
             { fn:'gearWheel', d:9, teeth:8, rt:5, dy:4,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ],
           cable:{ hi:'snB', lo:'irC', col:'ochreA', low:'woodB', dark:'woodD', spacing:12 },
           carrier:{ body:'woodD', hi:'ochreA', lo:'irD', trim:'irA',
                     col:'cuA', full:40, depth:7 } } },

  /* HAND CRANK: the only power source, manual only. 1x2.

     `torque:1.5` must exceed `segBase`: at exactly 1.0 a crank sits on the
     knife edge of an empty vertical carrier, `surplus` is zero and nothing
     rises. At 1.5 one crank climbs empty, exactly holds ~20 T, and runs
     BACKWARDS over it; the 40 T cap needs 2.0, so more drivetrain. 20 T is
     half the burden cap, which is the trade.

     `reach:12` is `handFeed`'s 10 plus a little, so turning and feeding read
     as the same distance. */
  { id:'crank', name:'HAND CRANK', glyph:'C',
    tw:1, th:2, footing:1,

    crank:{ torque:1.5, reach:12 },

    /* The handle is swept by `m.turn` and is the whole turning state; there is
       no second indicator because the handle's position already says it. The
       boss gear at the foot meshes with an adjacent gear or hub, so the
       crank's teeth reach the footprint edge as a gear's do. */
    look:{ body:'woodC', trim:'irA', base:'irD',
           parts:[
             /* Post on the left, wheel and handle on the right. Sharing the
                middle, the wheel swallowed the post. */
             { fn:'shaft', body:'woodA', hi:'ochreA', lo:'woodC', trim:'irB',
               thick:4, inset:1, collars:2, dx:-2 },
             { fn:'gearWheel', d:7, teeth:8, rt:4, dx:2, dy:5,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' },
             /* `cx:2` puts the bearing on the post rather than the middle
                of the tile, and `a0` swings the handle up and out. */
             { fn:'crankArm', body:'irB', col:'ochreA', hi:'veinA', dark:'irD',
               cx:2, cy:6, r:5, a0:-0.6 }
           ] } },

  /* GEAR: the linkage primitive, 1x1. `loss:0.06` per hop is what stops a
     drivetrain sprawling for free. Diagonals do not conduct, so a corner
     needs a gear IN it, and the art is what teaches that. */
  { id:'gear', name:'GEAR', glyph:'X',
    tw:1, th:1, footing:1,

    gear:{ loss:0.06 },

    /* `rt`, the tooth radius, is 5 in an 8 px tile, so two orthogonally
       adjacent gears overlap their teeth across the gap and read as MESHED
       while two diagonally adjacent sit 11 px apart with an obvious hole.
       `teeth:8` keeps one tooth on each axis at phase 0, so a resting train
       looks engaged rather than accidentally aligned. */
    look:{ body:'cuB', trim:'cuA', base:'cuD',
           parts:[
             { fn:'gearWheel', d:8, teeth:8, rt:4,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ] } },

  /* AXLE: three tiles of reach for a third of the loss. A `variantOf:'gear'`,
     so it is CONTENT and not code -- the same near-free variant `kiln_divine`
     and `belt_l` already are. `footing:1` (not 3) on purpose: an axle spans a
     gap, so requiring a floor under all three tiles would defeat the point of
     having it. */
  { id:'axle', name:'AXLE', variantOf:'gear', glyph:'-',
    tw:3, th:1, footing:1,

    gear:{ loss:0.02 },

    /* A BEAM WITH A WHEEL AT EACH END, which is the whole of what an axle is:
       three tiles of reach for a third of the loss. The two end wheels use
       the SAME `gearWheel` the 1x1 gear does, at the same tooth radius, so an
       axle meshing with a gear and two gears meshing with each other are the
       same picture -- a train reads as continuous across a mixture of the
       two. The middle of the span is bare timber, which is also the honest
       statement that nothing meshes with an axle's middle. */
    look:{ body:'woodB', trim:'cuA', base:'woodD',
           parts:[
             { fn:'shaft', body:'woodB', hi:'woodA', lo:'woodD', trim:'irB',
               thick:4, inset:3, collars:2 },
             { fn:'gearWheel', d:8, teeth:8, rt:4, dx:-8,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' },
             { fn:'gearWheel', d:8, teeth:8, rt:4, dx:8,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ] } },

  /* THE TWO TRIBUTE RECEIVERS are one receiver block twice: `ports` +
     `buffer.cap` + `catchBox` + `handFeed` + `tribute:{}`, no `recipes`. The
     dock adds `hub` and the altar does not, which is the difference between
     "a carrier arrives here" and "you hand it over".

     They accept ore-tagged, refined-tagged or `gravel` -- what a cycle can
     demand, and nothing else. A catch-everything receiver would swallow a
     trinket or a miracle that fell in. Fuel is absent: no cycle asks for
     logs, and a receiver that took them would eat them. */

  /* THE CLOUD DOCK: a hub with a deck, on astral's floor.
     `carries:['material','player']`, because a rider cannot power the segment
     they ride, so riding is the descent verb and the free way home.

     `catchBox.slack:6` is derived, and alone here it is not catching in
     flight: `rules/drive.js` releases a haul INSIDE the footprint at
     `box.y + 4`, and it falls onto the footing tile to rest at `box.y + 6`,
     4.5 px past the mouth's own end at `box.y + 2`. `cap:64` per class,
     because this buffer is a ledger for the director rather than a hopper.
     `band:'astral'` is the whole ascent as one key. */
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

  /* THE SURFACE ALTAR: cycle 1's receiver, and the one machine the player can
     never obtain. No substance and no recipe is what makes that true with no
     special case -- `machineHeldSub` resolves through `S[...]`, so this row
     never passes `placementCheck`'s held-item clause. `rules/cycles.js` places
     it through `write.place`, which asks nothing about held items.

     No `hub`, because cycle 1 is at the surface. It still has a `catchBox`, at
     the furnace's `slack:2`, because ore that falls in is free; nothing
     releases a haul inside THIS footprint. Limestone and bone with the divine
     kiln's `halo`, so it reads as the one thing you did not build. */
  { id:'altar', name:'THE SURFACE ALTAR', glyph:'A',
    tw:2, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#refined', '*/gravel'] } ],
    buffer:{ cap:{ '*/#ore':64, '*/#refined':64, '*/gravel':64 } },
    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ore', '*/#refined', '*/gravel'] },

    tribute:{},

    look:{ body:'limeB', trim:'limeA', base:'limeD', halo:'ichor' } }
];

/* A variant is a SHALLOW merge of the named base row under its own keys, so a
   variant changing one port restates the whole `ports` array. A deep merge of
   arrays would not be legible. Derivation over frozen tables, not behaviour;
   `rules/` never sees it. */

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
