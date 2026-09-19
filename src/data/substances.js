/* data layer — SUBSTANCES: one row per ELEMENT. Frozen. No logic, no state.

   tags   free strings; `#metal` in a selector means any row tagged metal. A
          row carrying both a `tile` block and `mineable` must carry exactly
          one of:
            bulk     filler you tunnel through. Mines to `gravel`, and 10
                     gravel pack back into one placeable `block`.
            deposit  a named body. No tile-capable form's `subTags` admit one,
                     so the pair cannot be constructed, let alone placed.
            organic  grown and felled.
   tile   present -> the element can exist in the grid as native rock.
            hard    seconds to break at pick power 1, never a 0..255 byte.
            drops   the form the element yields when mined; the substance is
                    always itself.
            tier    absent means 1. Separate from `hard`: `hard` is how long a
                    legal swing takes, `tier` whether a swing is legal at all.
                    Monotonic against `hard`.
            charge  `deposit` rows only, absent means 1. Units a native tile
                    yields before it is gone, each costing a full `hard`.
   item   present -> the element can be carried, in any form whose own `item`
          block permits it.
            mass    base mass in talents; the form's `massK` multiplies it.
            hud     `{ order }` in the pocket strip.
            tool    `{ tier, power }`. A tool is a relic substance, not a
                    second table. `power` multiplies `eff('pickPower')` in the
                    one place `hard` and `toolTier` are read.
   look   appearance; nothing but `view/` reads it. `treatments` name pure
          functions in `view/treatments.js`.

   Rows are append-only, except a tile-capable row, which must be INSERTED at
   an ordinal at or below `PACKABLE_LIMIT`. */

export const SUBSTANCES = [

  /* Ordinals 0..7 are every tile-capable row, so `PACKABLE_MAX` is 7 and the
     top tile byte is 112 of 255. Inserting a ninth terrain row here is legal;
     appending one below is not. */

  { id:'copper', name:'COPPER', short:'CU', tags:['metal', 'mineable', 'deposit'],

    tile:{ solid:true,
           hard:0.95,                    // seconds at pick power 1
           drops:'ore',
           charge:240 },                 // 240 units, each costing a full `hard`

    item:{ mass:1.0, hud:{ order:1, always:true } },

    look:{ base:'cuB', hi:'cuA', lo:'cuD', speckle:0.30,
           item:['cuA', 'cuC'],
           treatments:[ { fn:'glint', col:'veinA', n:2 } ] } },

  { id:'iron', name:'IRON', short:'FE', tags:['metal', 'mineable', 'deposit'],
    tile:{ solid:true, hard:1.25, drops:'ore', charge:200 },
    item:{ mass:1.0, hud:{ order:2, always:true } },
    look:{ base:'snC', hi:'snB', lo:'snD', speckle:0.27,
           item:['snB', 'snD'],
           treatments:[ { fn:'glint', col:'veinA', n:2 } ] } },

  { id:'coal', name:'COAL', short:'COAL', tags:['combustible', 'mineable', 'deposit'],
    tile:{ solid:true, hard:0.80, drops:'lump', charge:180 },
    item:{ mass:0.7, hud:{ order:3, always:true } },
    look:{ base:'irD', hi:'irC', lo:'abyA', speckle:0.20,
           face:'irC', contact:'abyA',
           item:['irC', 'abyA'],
           treatments:[ { fn:'glint', col:'shade', n:2 } ] } },

  { id:'timber', name:'TIMBER', short:'WOOD', tags:['organic', 'mineable'],
    tile:{ solid:true, hard:0.35, drops:'log' },
    item:{ mass:0.8, hud:{ order:4, always:true } },
    look:{ base:'woodB', hi:'woodA', lo:'woodD', speckle:0.34,
           item:['woodA', 'woodC'],
           /* Form-keyed, so only the `brand` form draws
              `view/sprites.js#SPRITE.brand`; every other form keeps the
              generic square the `item` pair above draws. */
           sprite:{ brand:'brand' },
           /* `view/paint.js` grows this on a tile with nothing solid above
              it all the way up (`skyExposedAt`), not on a tile known to be a
              trunk. `leaves` is ordered darkest first. */
           canopy:{ leaves:['vdC', 'vdB', 'vdA'], w:6, h:4 } } },

  { id:'stone', name:'STONE', tags:['rock', 'mineable', 'spoil', 'bulk'],
    tile:{ solid:true, hard:1.60, drops:'gravel' },
    item:{ mass:0.6, hud:{ order:5 } },
    look:{ base:'irC', hi:'irB', lo:'irD', speckle:0.24,
           face:'irB', contact:'irD',
           item:['limeB', 'limeD'],
           treatments:[ { fn:'banded', col:'irD', every:8 } ] } },

  { id:'soil', name:'SOIL', tags:['rock', 'mineable', 'bulk'],
    tile:{ solid:true, hard:0.50, drops:'gravel' },
    item:{ mass:0.5, hud:{ order:6 } },
    look:{ base:'soilA', hi:'soilA', lo:'soilC', speckle:0.44,
           face:'soilC', contact:'soilC',
           item:['soilA', 'soilC'],
           treatments:[ { fn:'banded', col:'soilC', every:5 } ],
           /* Drawn only where `skyExposedAt` reports an open shot straight
              up. `hi` above stays a soil tone because the generic
              exposed-face highlight fires for any open neighbour, tunnel
              ceilings included. `drape` is px of turf spilled down a face. */
           grassCap:{ col:'grassA', low:'grassB', dark:'grassC',
                      lowH:3, drape:4, grain:0.16 } } },

  /* 200 units at 2.40 s is 480 seconds to clear one tile, so this is the bulk
     gravel source and never a tunnel. Tier 1: the stock pick works on it. */
  { id:'granite', name:'GRANITE', short:'GRNT', tags:['rock', 'mineable', 'deposit'],
    tile:{ solid:true, hard:2.40, drops:'gravel', charge:200 },
    item:{ mass:0.9, hud:{ order:7 } },
    look:{ base:'graniteB', hi:'graniteA', lo:'graniteD', speckle:0.17,
           face:'graniteC', contact:'graniteD',
           item:['graniteA', 'graniteC'],
           treatments:[ { fn:'banded', col:'graniteD', every:8 } ] } },

  { id:'adamant', name:'ADAMANT', short:'ADMT', tags:['rock', 'metal', 'mineable', 'deposit'],
    tile:{ solid:true, hard:5.0, drops:'gravel', tier:2, charge:120 },
    item:{ mass:1.4, hud:{ order:8 } },
    look:{ base:'adamantB', hi:'adamantA', lo:'adamantD', speckle:0.07,
           face:'adamantC', contact:'adamantD',
           item:['adamantA', 'adamantC'],
           treatments:[ { fn:'glint', col:'adamantA', n:2 } ] } },

  /* Nothing below carries a `tile` block, so ordinal order past here is free.
     The content lint requires a `halo` treatment on every `relic`- and
     `miracle`-tagged row and on no `machine`-tagged one. */

  /* `model/run.js#hasPick` is a capability gate rather than a modifier, so
     there is no `data/trinkets.js` row. `shell/boot.js` plants one near spawn
     on every `newRun()`. */
  { id:'pick', name:'STOCK PICKAXE', short:'PICK', tags:['relic'],
    item:{ mass:0.5, hud:{ order:9 }, tool:{ tier:1, power:1.0 } },
    look:{ item:['irB', 'woodC'], sprite:'pick',
           treatments:[ { fn:'halo', col:'ichor', r:8, a:0.2 } ] } },

  { id:'auger', name:'ADAMANT AUGER', short:'AUGER', tags:['relic'],
    item:{ mass:0.9, hud:{ order:10 }, tool:{ tier:2, power:1.8 } },
    look:{ item:['adamantA', 'irB'],
           treatments:[ { fn:'halo', col:'ichor', r:9, a:0.2 } ] } },

  { id:'bellows', name:'BELLOWS OF THE FORGE', short:'BELLOWS', tags:['relic'],
    item:{ mass:0.4, hud:{ order:11 } },
    look:{ item:['ichor', 'vioHi'], sprite:'bellows',
           treatments:[ { fn:'halo', col:'ichor', r:7, a:0.22 } ] } },

  { id:'owl', name:'OWL OF ATHENA', short:'OWL', tags:['relic'],
    item:{ mass:0.3, hud:{ order:12 } },
    look:{ item:['bone', 'woodC'],
           treatments:[ { fn:'halo', col:'ichor', r:7, a:0.2 } ] } },

  { id:'girdle', name:'GIRDLE OF ARES', short:'GIRDLE', tags:['relic'],
    item:{ mass:0.6, hud:{ order:13 } },
    look:{ item:['cuB', 'basB'],
           treatments:[ { fn:'halo', col:'ichor', r:7, a:0.22 } ] } },

  /* `miracle` and not `relic`, so these cross into `forms.js#phial` and
     nothing else. */

  { id:'chasm', name:'RIFT OF HADES', tags:['miracle'],
    item:{ mass:0.2, hud:{ order:14 } },
    look:{ item:['abyC', 'vioHi'],
           treatments:[ { fn:'halo', col:'ichor', r:10, a:0.24, pulse:0.12 } ] } },

  { id:'tide', name:'VIAL OF THE DEEP', tags:['miracle'],
    item:{ mass:0.2, hud:{ order:15 } },
    look:{ item:['watC', 'watA'],
           treatments:[ { fn:'halo', col:'ichor', r:9, a:0.22, pulse:0.1 } ] } },

  { id:'lodestone', name:'LODESTONE OF THE FORGE', tags:['miracle'],
    item:{ mass:0.3, hud:{ order:16 } },
    look:{ item:['veinB', 'cuA'],
           treatments:[ { fn:'halo', col:'ichor', r:9, a:0.24 } ] } },

  /* One row per machine, massed at `sum(item.mass x form.massK x n)` over the
     build recipe, in talents. */

  /* 15 gravel, priced against the lightest `bulk` element: 15 x 0.25 = 3.75 T. */
  { id:'kiln', name:'BASIC KILN', tags:['machine'],
    item:{ mass:3.75, hud:{ order:17 } },
    look:{ item:['clayB', 'clayA'] } },

  /* 2 copper/ingot + 5 iron/gear: 2x0.95 + 5x0.90 = 6.4 T. */
  { id:'winch', name:'WINCH', tags:['machine'],
    item:{ mass:6.4, hud:{ order:18 } },
    look:{ item:['woodC', 'irA'] } },

  /* 2 iron/gear + 1 copper/ingot: 2x0.90 + 0.95 = 2.75 T. */
  { id:'hub', name:'GEAR HUB', tags:['machine'],
    item:{ mass:2.75, hud:{ order:19 } },
    look:{ item:['irC', 'irA'] } },

  /* 1 iron/gear + 1 iron/ingot: 0.90 + 0.95 = 1.85 T. */
  { id:'drive_wheel', name:'DRIVE WHEEL', short:'WHEEL', tags:['machine'],
    item:{ mass:1.85, hud:{ order:20 } },
    look:{ item:['snB', 'irA'] } },

  /* 3 iron/gear: 3 x 0.90 = 2.7 T. */
  { id:'transformer', name:'GEAR TRANSFORMER', short:'XFRM', tags:['machine'],
    item:{ mass:2.7, hud:{ order:21 } },
    look:{ item:['cuB', 'snA'] } },

  /* `belt_r`/`belt_l` share this one substance: two rows would mean two hand
     recipes with an identical bill, and first-match would starve one.
     1 iron/gear + 1 timber/log makes two: (0.90 + 0.80) / 2 = 0.85 T. */
  { id:'belt_r', name:'BELT', tags:['machine'],
    item:{ mass:0.85, hud:{ order:22 } },
    look:{ item:['woodB', 'irA'] } },

  /* 4 timber/log + 2 gravel, the gravel priced as soil: 3.2 + 0.5 = 3.7 T. */
  { id:'brazier', name:'BRAZIER', tags:['machine'],
    item:{ mass:3.7, hud:{ order:23 } },
    look:{ item:['ochreB', 'ochreA'] } },

  /* 2 copper/ingot: 2 x 0.95 = 1.9 T. */
  { id:'hearth', name:'HEARTH', tags:['machine'],
    item:{ mass:1.9, hud:{ order:24 } },
    look:{ item:['basB', 'basA'] } },

  /* 4 copper/ingot + 2 iron/gear + 2 timber/log:
     4x0.95 + 2x0.90 + 2x0.80 = 7.2 T. */
  { id:'cloud_dock', name:'THE CLOUD DOCK', tags:['machine'],
    item:{ mass:7.2, hud:{ order:25 } },
    look:{ item:['marbleB', 'ichor'] } },

  /* 2 iron/gear + 1 copper/ingot + 4 timber/log:
     2x0.90 + 0.95 + 4x0.80 = 5.95 T. */
  { id:'contraption', name:'CONTRAPTION', tags:['machine'],
    item:{ mass:5.95, hud:{ order:26 } },
    look:{ item:['woodB', 'irA'] } },

  /* Tagged `carrier`, not `machine`: it is installed on a rope rather than on
     tiles, so it has no `data/machines.js` row. 5 timber/log = 4.0 T. */
  { id:'bucket', name:'BUCKET', tags:['carrier'],
    item:{ mass:4.0, hud:{ order:27 } },
    look:{ item:['woodB', 'woodA'] } }

  /* `altar` and `kiln_divine` have no substance row, so neither can pass
     `placementCheck`'s held-item clause: `rules/cycles.js` places the altar
     directly, and `kiln_divine` inherits `kiln`'s bill through `variantOf`,
     where `choose`'s first match would always pick the kiln. */
];

/* Derived indices, built once and frozen, so nothing scans this table on a
   hot path. */

export const SUB = Object.freeze(SUBSTANCES.map(Object.freeze));

/* id -> ordinal. */
export const S = Object.freeze(Object.fromEntries(SUB.map((s, i) => [s.id, i])));

/* tag -> ordinals. */
export const byTag = Object.freeze(SUB.reduce((m, s, i) => {
  for (const t of s.tags || []) (m[t] = m[t] || []).push(i);
  return m;
}, {}));

/* The two bytes that are not substance x form. Pseudo-rows, never rows in
   the table above, so `model/tiles.js` can ask any tile byte for a `tile`
   block: out of bounds reads bedrock, above a band reads air. */
export const VOID_SUB = Object.freeze({
  id:'air', name:'AIR', tags:[],
  tile:Object.freeze({ solid:false, climb:false, hard:0, drops:null }),
  look:Object.freeze({}) });

export const EDGE_SUB = Object.freeze({
  id:'bedrock', name:'BEDROCK', tags:['rock'],
  tile:Object.freeze({ solid:true, climb:false, hard:Infinity, drops:null }),
  look:Object.freeze({ base:'abyC', hi:'irD', lo:'abyC' }) });
