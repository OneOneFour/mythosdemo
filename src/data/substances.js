/* data layer — SUBSTANCES: one row per ELEMENT. Frozen. No logic, no state.

   tags   free strings; `#metal` in a selector means any row tagged metal. A
          row carrying both a `tile` block and `mineable` must carry exactly
          one of:
            bulk     filler you tunnel through. Mines to `gravel`, and 5
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
            speckle fraction of a tile's pixels that get a grain dot.
            face    palette name for an exposed vertical face.
            contact palette name for the 1 px line along a strata boundary,
                    this substance's top edge.

   Rows are append-only, except a tile-capable row, which cannot be appended
   at all: `SUB.length` is past `PACKABLE_LIMIT`, so one throws at import.
   Insert it at an ordinal at or below that limit instead. */

export const SUBSTANCES = [

  { id:'copper', name:'COPPER', short:'CU', tags:['metal', 'mineable', 'deposit'],

    tile:{ solid:true,
           hard:0.95,                    // seconds at pick power 1
           drops:'ore',
           charge:4 },                   // 4 units, each costing a full `hard`

    item:{ mass:1.0, hud:{ order:1, always:true } },

    look:{ base:'cuB', hi:'cuA', lo:'cuD', speckle:0.30,
           item:['cuA', 'cuC'],
           treatments:[ { fn:'glint', col:'veinA', n:2 } ] } },

  { id:'tin', name:'TIN', tags:['metal', 'mineable', 'deposit'],
    tile:{ solid:true, hard:1.10, drops:'ore', charge:4 },
    item:{ mass:1.0, hud:{ order:2 } },
    look:{ base:'snC', hi:'snA', lo:'snD', speckle:0.28,
           item:['snA', 'snC'],
           treatments:[ { fn:'glint', col:'snA', n:2 } ] } },

  { id:'timber', name:'TIMBER', short:'WOOD', tags:['organic', 'mineable'],
    tile:{ solid:true, hard:0.35, drops:'log' },
    item:{ mass:0.8, hud:{ order:3, always:true } },
    look:{ base:'woodB', hi:'woodA', lo:'woodD', speckle:0.34,
           item:['woodA', 'woodC'],
           /* Form-keyed, so only the `brand` form draws
              `view/sprites.js#SPRITE.brand`; every other form keeps the
              generic square the `item` pair above draws. */
           sprite:{ brand:'brand' },
           /* `view/paint.js` grows this on a tile with nothing solid above
              it all the way up (`skyExposedAt`), not on a tile known to be a
              trunk. `leaves` is ordered darkest first: shade, body,
              sun-side highlight. */
           canopy:{ leaves:['vdC', 'vdB', 'vdA'], w:6, h:4 } } },

  { id:'stone', name:'STONE', tags:['rock', 'mineable', 'spoil', 'bulk'],
    tile:{ solid:true, hard:1.60, drops:'gravel' },
    item:{ mass:0.6, hud:{ order:4 } },
    look:{ base:'irC', hi:'irB', lo:'irD', speckle:0.24,
           face:'irB', contact:'irD',
           item:['limeB', 'limeD'],
           treatments:[ { fn:'banded', col:'irD', every:8 } ] } },

  { id:'bellows', name:'BELLOWS OF THE FORGE', short:'BELLOWS', tags:['relic'],
    item:{ mass:0.4, hud:{ order:5 } },
    look:{ item:['ichor', 'vioHi'], sprite:'bellows',
           treatments:[ { fn:'halo', col:'ichor', r:7, a:0.22 } ] } },

  /* `model/run.js#hasPick` is `invCount(S.pick, F.relic) > 0`, a capability
     gate rather than a modifier, so there is no `data/trinkets.js` row.
     `shell/boot.js` plants one near spawn on every `newRun()`. */
  { id:'pick', name:'STOCK PICKAXE', short:'PICK', tags:['relic'],
    item:{ mass:0.5, hud:{ order:6 }, tool:{ tier:1, power:1.0 } },
    /* The content lint requires a `halo` treatment on every `relic`- or
       `miracle`-tagged row and on no `machine`-tagged one. `sprite` and the
       halo compose: `paintItem` runs `treat()` after either path. */
    look:{ item:['irB', 'woodC'], sprite:'pick',
           treatments:[ { fn:'halo', col:'ichor', r:8, a:0.2 } ] } },

  { id:'soil', name:'SOIL', tags:['rock', 'mineable', 'bulk'],
    tile:{ solid:true, hard:0.50, drops:'gravel' },
    item:{ mass:0.5, hud:{ order:7 } },
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

  { id:'granite', name:'GRANITE', short:'GRNT', tags:['rock', 'mineable', 'deposit'],
    tile:{ solid:true, hard:2.4, drops:'gravel', tier:2, charge:3 },
    item:{ mass:0.9, hud:{ order:8 } },
    look:{ base:'graniteB', hi:'graniteA', lo:'graniteD', speckle:0.17,
           face:'graniteC', contact:'graniteD',
           item:['graniteA', 'graniteC'],
           treatments:[ { fn:'banded', col:'graniteD', every:8 } ] } },

  /* Tagged both `rock` and `metal`, so `crossable()` admits a future
     ore/ingot form; no recipe reaches one today and mining yields `gravel`. */
  { id:'adamant', name:'ADAMANT', short:'ADMT', tags:['rock', 'metal', 'mineable', 'deposit'],
    tile:{ solid:true, hard:5.0, drops:'gravel', tier:3, charge:2 },
    item:{ mass:1.4, hud:{ order:9 } },
    look:{ base:'adamantB', hi:'adamantA', lo:'adamantD', speckle:0.07,
           face:'adamantC', contact:'adamantD',
           item:['adamantA', 'adamantC'],
           treatments:[ { fn:'glint', col:'adamantA', n:2 } ] } },

  /* `rules/machines.js` reads `power` back generically, scanning every
     `item.tool` block for the largest with no id named, so the talos head
     mines at whatever the best hand tool does. */
  { id:'auger', name:'ADAMANT AUGER', short:'AUGER', tags:['relic'],
    item:{ mass:0.9, hud:{ order:10 }, tool:{ tier:2, power:1.8 } },
    look:{ item:['adamantA', 'irB'],
           treatments:[ { fn:'halo', col:'ichor', r:9, a:0.2 } ] } },

  /* `miracle` and not `relic`, so it crosses into `forms.js#phial` and
     nothing else. */
  { id:'chasm', name:'RIFT OF HADES', tags:['miracle'],
    item:{ mass:0.2, hud:{ order:11 } },
    look:{ item:['abyC', 'vioHi'],
           treatments:[ { fn:'halo', col:'ichor', r:10, a:0.24, pulse:0.12 } ] } },

  /* One row per machine, massed at `sum(item.mass x form.massK x n)` over
     the build recipe, in talents. */

  /* 12 copper/ore + 6 timber/log: 12x1.0 + 6x0.8 = 16.8 T. */
  { id:'furnace', name:'CRUDE FURNACE', tags:['machine'],
    item:{ mass:16.8, hud:{ order:12 } },
    look:{ item:['irC', 'irB'] } },

  /* `hud.order` 13 is vacant. `byHudOrder` only sorts by this number, so a
     gap costs nothing and closing it would renumber nine rows. */

  /* 4 copper/plate + 2 copper/ingot: 4x2.4 + 2x1.6 = 12.8 T. */
  { id:'press', name:'PRESS', tags:['machine'],
    item:{ mass:12.8, hud:{ order:14 } },
    look:{ item:['irB', 'irA'] } },

  /* `belt_r`/`belt_l` share this one substance: two rows would mean two hand
     recipes with an identical bill, and first-match would starve one.
     2 copper/plate + 4 stone/gravel: 2x2.4 + 4x0.3 = 6.0 T. */
  { id:'belt_r', name:'CONVEYOR', tags:['machine'],
    item:{ mass:6.0, hud:{ order:15 } },
    look:{ item:['woodB', 'irA'] } },

  /* 4 timber/log + 2 stone/gravel: 4x0.8 + 2x0.3 = 3.8 T. */
  { id:'brazier', name:'BRAZIER', tags:['machine'],
    item:{ mass:3.8, hud:{ order:16 } },
    look:{ item:['ochreB', 'ochreA'] } },

  /* 2 copper/plate: 2x2.4 = 4.8 T. */
  { id:'hearth', name:'HEARTH', tags:['machine'],
    item:{ mass:4.8, hud:{ order:17 } },
    look:{ item:['basB', 'basA'] } },

  /* One substance for `talos_head`/`talos_head_l`, as with `belt_r`;
     `mine.facing` is resolved off `player.face` at placement.
     8 copper/plate + 2 copper/ingot: 8x2.4 + 2x1.6 = 22.4 T. */
  { id:'talos_head', name:'TALOS HEAD', tags:['machine'],
    item:{ mass:22.4, hud:{ order:18 } },
    look:{ item:['cuB', 'irA'] } },

  /* One substance for `cyclops_maw`/`cyclops_maw_l`. 16 copper/plate +
     6 copper/ingot + 6 granite/gravel: 16x2.4 + 6x1.6 + 6x0.45 = 50.7 T. */
  { id:'cyclops_maw', name:'CYCLOPS MAW', tags:['machine'],
    item:{ mass:50.7, hud:{ order:19 } },
    look:{ item:['adamantB', 'adamantD'] } },

  /* The four transport substances are priced as one family against the 40 T
     `burden` cap: a segment needs two hubs, so a minimal segment with a
     crank is 2 x 10.4 + 3.3 = 24.1 T, inside one trip. */

  /* 3 copper/plate + 1 copper/ingot + 2 timber/log:
     3x2.4 + 1x1.6 + 2x0.8 = 10.4 T. */
  { id:'hub', name:'WINCH HUB', tags:['machine'],
    item:{ mass:10.4, hud:{ order:20 } },
    look:{ item:['irC', 'irA'] } },

  /* 3 timber/log + 3 stone/gravel: 3x0.8 + 3x0.3 = 3.3 T. */
  { id:'crank', name:'HAND CRANK', tags:['machine'],
    item:{ mass:3.3, hud:{ order:21 } },
    look:{ item:['woodC', 'irA'] } },

  /* 2 timber/log + 1 stone/gravel: 2x0.8 + 1x0.3 = 1.9 T. */
  { id:'gear', name:'GEAR', tags:['machine'],
    item:{ mass:1.9, hud:{ order:22 } },
    look:{ item:['cuB', 'cuA'] } },

  /* 2 copper/ingot + 2 timber/log: 2x1.6 + 2x0.8 = 4.8 T. */
  { id:'axle', name:'AXLE', tags:['machine'],
    item:{ mass:4.8, hud:{ order:23 } },
    look:{ item:['woodB', 'cuA'] } },

  /* 5 copper/plate + 1 copper/ingot + 2 timber/log: 15.2 T, the hub's bill
     plus two plate. No gravel, so the only bill this one contains is `hub`'s;
     with gravel it would contain `gear`'s and have to precede it. */
  { id:'cloud_dock', name:'THE CLOUD DOCK', tags:['machine'],
    item:{ mass:15.2, hud:{ order:24 } },
    look:{ item:['marbleB', 'ichor'] } },

  /* Appending these is safe: `relic` and `phial` cross only with `relic`- or
     `miracle`-tagged substances, so none is packable and `PACKABLE_MAX` does
     not move. */

  { id:'owl', name:'OWL OF ATHENA', short:'OWL', tags:['relic'],
    item:{ mass:0.3, hud:{ order:25 } },
    look:{ item:['bone', 'woodC'],
           treatments:[ { fn:'halo', col:'ichor', r:7, a:0.2 } ] } },

  { id:'girdle', name:'GIRDLE OF ARES', short:'GIRDLE', tags:['relic'],
    item:{ mass:0.6, hud:{ order:26 } },
    look:{ item:['cuB', 'basB'],
           treatments:[ { fn:'halo', col:'ichor', r:7, a:0.22 } ] } },

  { id:'tide', name:'VIAL OF THE DEEP', tags:['miracle'],
    item:{ mass:0.2, hud:{ order:27 } },
    look:{ item:['watC', 'watA'],
           treatments:[ { fn:'halo', col:'ichor', r:9, a:0.22, pulse:0.1 } ] } },

  { id:'lodestone', name:'LODESTONE OF THE FORGE', tags:['miracle'],
    item:{ mass:0.3, hud:{ order:28 } },
    look:{ item:['veinB', 'cuA'],
           treatments:[ { fn:'halo', col:'ichor', r:9, a:0.24 } ] } }

  /* `altar` and `kiln_divine` have no substance row, so neither can pass
     `placementCheck`'s held-item clause: `rules/cycles.js` places the altar
     directly, and `kiln_divine` inherits `furnace`'s bill through `variantOf`,
     where `choose`'s first match would always pick the furnace. */
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
