/* LAYER data — SUBSTANCES: one row per ELEMENT. Frozen. No logic, no state.
   Imports `core` and `data` only. May be imported by `data`, `model`, `rules`,
   `view`.

   tags   free strings; `#metal` in a selector means "any row tagged metal".
          THREE OF THEM CLASSIFY TERRAIN, and a row carrying both a `tile`
          block and `mineable` must carry EXACTLY ONE:
            bulk     filler you tunnel through. Mines to `gravel`, and 5
                     gravel pack back into one placeable `block`.
            deposit  a NAMED body, never player-placeable -- no tile-capable
                     form's `subTags` admit one, so the pair cannot be
                     CONSTRUCTED, let alone placed.
            organic  grown and felled.
   tile   present -> the element can exist in the grid as native rock. Absence
          is a DECLARATION, not an omission.
            hard    SECONDS to break at pick power 1, never a 0..255 byte --
                    that byte is what made granite unmineable above 106 fps.
            drops   the FORM the element yields when mined. The substance is
                    always itself, which is why one smelt row covers every ore.
            tier    OPTIONAL, absent means 1. A SEPARATE gate from `hard`:
                    `hard` is how long a legal swing takes, `tier` is whether
                    a swing is legal at all. Monotonic against `hard`.
            charge  OPTIONAL, `deposit` rows only. UNITS a native tile yields
                    before it is gone; absent means 1. Each unit costs a full
                    `hard`, so SECONDS PER UNIT DO NOT MOVE.
   item   present -> the element can be carried, in any form whose own `item`
          block permits it.
            mass    base mass; the form multiplies it.
            hud     `{ order }` in the pocket strip, so the HUD is data-driven.
            tool    OPTIONAL `{ tier, power }`. TOOLS ARE RELIC SUBSTANCES,
                    not a new table. `power` multiplies `eff('pickPower')` in
                    the one place `hard` and `toolTier` are read, so a trinket
                    cannot be read around.
   look   appearance, and NOTHING but `view/` reads it. `treatments` name pure
          functions in `view/treatments.js`.
            speckle OPTIONAL fraction of a tile's pixels that get a grain dot.
            face    OPTIONAL palette name for an EXPOSED VERTICAL FACE. The
                    row names the material, never the side.
            contact OPTIONAL palette name for the 1 px line along a strata
                    boundary, this substance's top edge.

   ROWS ARE APPEND-ONLY, EXCEPT A TILE-CAPABLE ROW, WHICH CANNOT BE APPENDED AT
   ALL -- `SUB.length` is already past `PACKABLE_LIMIT`, so one THROWS AT
   IMPORT. Insert it at an ordinal at or below that limit instead. */

export const SUBSTANCES = [

  /* the commented row. Every row below is this shape with different
          literals; copy the nearest one and change the words. */
  { id:'copper', name:'COPPER', short:'CU', tags:['metal', 'mineable', 'deposit'],

    tile:{ solid:true,
           hard:0.95,                    // seconds at pick power 1
           drops:'ore',                  // mining a copper wall yields copper ORE
           charge:4 },                   // ...four times over, at 0.95 s each

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

  /* timber: the fuel and the ladder STOCK. Felling a tree yields `log`, which
          is FEEDSTOCK ONLY -- fuel and a recipe ingredient, never a placed
          tile -- so felling a tree and building a ladder are one noun apart,
          `recipes.js#peg_rungs`, which turns 2 logs into 4 `rung`. */
  { id:'timber', name:'TIMBER', short:'WOOD', tags:['organic', 'mineable'],
    tile:{ solid:true, hard:0.35, drops:'log' },
    item:{ mass:0.8, hud:{ order:3, always:true } },
    look:{ base:'woodB', hi:'woodA', lo:'woodD', speckle:0.34,
           item:['woodA', 'woodC'],
           /* `sprite:{brand:'brand'}` (`view/paint.js#paintItem`'s
              form-keyed shape, `view/sprites.js#SPRITE.brand`) reaches only
              the `brand` form -- a felled log, a placed rung or stair, and
              a growing seed all keep the generic two-colour square this
              `item` pair already draws. */
           sprite:{ brand:'brand' },
           /* `view/paint.js` grows this on a timber column's TOP tile only --
              a felled trunk's new top grows one the next time that tile
              repaints, with no code change, because the geometry test is
              "nothing solid above, all the way up" (`skyExposedAt`), not
              "this is a trunk". Three greens now, darkest first: shade, body,
              sun-side highlight. `view/treatments.js#canopy` picks between them
              per pixel from the one declared light direction -- the old two-tone
              pair could only say "the top course is lighter", which is why it
              read as a lit box rather than a lit crown. */
           canopy:{ leaves:['vdC', 'vdB', 'vdA'], w:6, h:4 } } },

  /* stone: the bulk of the world. Mines to gravel, never to ore, and has no
          ingot. */
  { id:'stone', name:'STONE', tags:['rock', 'mineable', 'spoil', 'bulk'],
    tile:{ solid:true, hard:1.60, drops:'gravel' },
    item:{ mass:0.6, hud:{ order:4 } },
    look:{ base:'irC', hi:'irB', lo:'irD', speckle:0.24,
           face:'irB', contact:'irD',
           item:['limeB', 'limeD'],
           /* Bedding planes, so a stratum reads as sedimentary rock at a
              glance with no new rendering code. */
           treatments:[ { fn:'banded', col:'irD', every:8 } ] } },

  /* bellows: the trinket tier. Divine glow, per the rule every
          relic and miracle substance carries. */
  { id:'bellows', name:'BELLOWS OF THE FORGE', short:'BELLOWS', tags:['relic'],
    item:{ mass:0.4, hud:{ order:5 } },
    /* `sprite:'bellows'` (`view/sprites.js`), the same treatment `pick`
       above already gets: a dedicated shape instead of the generic
       two-colour square, so a rare drop reads as an object rather than
       an unidentified glowing tile. */
    look:{ item:['ichor', 'vioHi'], sprite:'bellows',
           treatments:[ { fn:'halo', col:'ichor', r:7, a:0.22 } ] } },

  /* pick: the first gift, same shape as any other relic. `model/run.js`'s
          `hasPick()` is `invCount(S.pick, F.relic) > 0` -- a capability GATE
          rather than a `data/trinkets.js` modifier, which is why it is not a
          row in that table: nothing in `model/mods.js` needs to know a pick
          exists. `shell/boot.js` plants one near spawn on every `newRun()`,
          and walking over it is an ordinary pickup -- the same "material never
          teleports into your hands" idiom mining already uses, extended to the
          one tool the game hands you rather than one you find. */
  { id:'pick', name:'STOCK PICKAXE', short:'PICK', tags:['relic'],
    item:{ mass:0.5, hud:{ order:6 }, tool:{ tier:1, power:1.0 } },
    /* THE HALO IS A RULE, NOT A ONE-OFF. `bellows`/`auger`/`chasm` carry the
       identical `treatments:[{fn:'halo'}]` shape, and the content lint
       enforces that every `relic`- or `miracle`-tagged substance has one and
       no `machine`-tagged substance does -- so a future trinket fails the
       build the moment someone forgets it, rather than reading as ordinary
       loot forever.

       `sprite` and the halo are independent additions rather than
       alternatives, because `paintItem` runs `treat()` after either path. */
    look:{ item:['irB', 'woodC'], sprite:'pick',
           treatments:[ { fn:'halo', col:'ichor', r:8, a:0.2 } ] } },

  /* soil: the shallow cap `data/world.js`'s surface band wears over its
          stone, so the first few dug tiles read as dirt rather than rock. Its
          `hi` is a grass tone rather than a lighter version of `base` -- every
          other substance's `hi` is that, but this one leans on `paintTile`'s
          existing "exposed top face" pass (`view/paint.js`) to paint a grass
          cap wherever soil meets open air, with no new rendering code. Softer
          than stone (a shovel's depth, not a pick's), and drops the same
          `gravel` any `rock`-tagged substance does -- no new form for a second
          kind of rubble. */
  { id:'soil', name:'SOIL', tags:['rock', 'mineable', 'bulk'],
    tile:{ solid:true, hard:0.50, drops:'gravel' },
    item:{ mass:0.5, hud:{ order:7 } },
    look:{ base:'soilA', hi:'soilA', lo:'soilC', speckle:0.44,
           /* A soil bank's face is damp subsoil, darker than the sun-dried top
              -- which is also what makes the turf drape above it read. */
           face:'soilC', contact:'soilC',
           item:['soilA', 'soilC'],
           treatments:[ { fn:'banded', col:'soilC', every:5 } ],
           /* A TURF CAP, drawn only where `skyExposedAt` says this tile has
              an open shot straight up -- true sky, not a dug-out ceiling.
              `hi` above is a plain soil tone rather than green FOR THAT
              REASON: the generic exposed-face highlight fires for ANY open
              neighbour, tunnels included, and painting it green put grass on
              cave ceilings. `drape` spills turf a few pixels down an exposed
              vertical face, so relief reads as banks of earth. */
           grassCap:{ col:'grassA', low:'grassB', dark:'grassC',
                      lowH:3, drape:4, grain:0.16 } } },

  /* granite: the first ROCK harder than stone, for the deep strata pick
          tiers gate against. `tile.tier:2` is the new optional key
          documented above -- absent means tier 1, so every existing
          substance (copper, tin, timber, stone, soil) is unaffected. Mines
          to `gravel`, same as stone and soil, so no new rubble form is
          needed for it. */
  { id:'granite', name:'GRANITE', short:'GRNT', tags:['rock', 'mineable', 'deposit'],
    tile:{ solid:true, hard:2.4, drops:'gravel', tier:2, charge:3 },
    item:{ mass:0.9, hud:{ order:8 } },
    look:{ base:'graniteB', hi:'graniteA', lo:'graniteD', speckle:0.17,
           face:'graniteC', contact:'graniteD',
           item:['graniteA', 'graniteC'],
           treatments:[ { fn:'banded', col:'graniteD', every:8 } ] } },

  /* adamant: the hardest rock in the game, tier 3. The first ROCK
          substance also tagged `metal` -- `tags` carries both `rock`
          (mines like stone/granite, to `gravel`, per `tile.drops` below)
          and `metal` (`crossable()` will let a future ore/ingot/plate form
          cross into it once a smelt path is designed for that; nothing in
          this phase adds that recipe, and mining it still only ever yields
          gravel). `tile.tier:3` gates it behind the auger/Talos-head
          tools -- a bronze pickaxe cannot scratch it. */
  { id:'adamant', name:'ADAMANT', short:'ADMT', tags:['rock', 'metal', 'mineable', 'deposit'],
    tile:{ solid:true, hard:5.0, drops:'gravel', tier:3, charge:2 },
    item:{ mass:1.4, hud:{ order:9 } },
    look:{ base:'adamantB', hi:'adamantA', lo:'adamantD', speckle:0.07,
           face:'adamantC', contact:'adamantD',
           item:['adamantA', 'adamantC'],
           treatments:[ { fn:'glint', col:'adamantA', n:2 } ] } },

  /* auger: the T2 hand tool. `power:1.8` is the one number the tier's
          equality proof rests on -- the Talos Head reads it back generically,
          scanning every `item.tool` block for the largest `power` with no id
          named, so "mines at exactly the T2 hand rate" is true by
          construction. It also bites the `tier:2` granite a `power:1.0` pick
          cannot reach at all. */
  { id:'auger', name:'ADAMANT AUGER', short:'AUGER', tags:['relic'],
    item:{ mass:0.9, hud:{ order:10 }, tool:{ tier:2, power:1.8 } },
    look:{ item:['adamantA', 'irB'],
           treatments:[ { fn:'halo', col:'ichor', r:9, a:0.2 } ] } },

  /* chasm: a miracle is a HELD PAIR and needs an element of its own for
          the reason a trinket does -- it refines from nothing, so it IS the
          element. `tags:['miracle']` and NOT `relic` is what lets it cross
          into `forms.js#phial` and nothing else, so a miracle can never
          satisfy a trinket selector by accident. */
  { id:'chasm', name:'RIFT OF HADES', tags:['miracle'],
    item:{ mass:0.2, hud:{ order:11 } },
    look:{ item:['abyC', 'vioHi'],
           treatments:[ { fn:'halo', col:'ichor', r:10, a:0.24, pulse:0.12 } ] } },

  /* MACHINE SUBSTANCES: one row per machine. */

  /* 12 copper/ore + 6 timber/log: 12x1.0 + 6x0.8 = 16.8 T. */
  { id:'furnace', name:'CRUDE FURNACE', tags:['machine'],
    item:{ mass:16.8, hud:{ order:12 } },
    look:{ item:['irC', 'irB'] } },

  /* `hud.order` 13 IS DELIBERATELY VACANT. It belonged to the retired WINCH
     STAGE machine substance (20.8 T), deleted with the rest of the
     staged winch -- see the `hub` row below, whose 10.4 T is half of it on
     purpose. The gap is left rather than closed because `byHudOrder` only ever
     SORTS by this number: renumbering nine rows to close a hole would be a
     nine-row diff that changes nothing a player can see. */

  /* 4 copper/plate + 2 copper/ingot: 4x2.4 + 2x1.6 = 12.8 T. */
  { id:'press', name:'PRESS', tags:['machine'],
    item:{ mass:12.8, hud:{ order:14 } },
    look:{ item:['irB', 'irA'] } },

  /* THE MIRRORED PAIR IS ONE SUBSTANCE. Two would mean two hand-recipes with a
     BIT-IDENTICAL bill, which first-match-wins would starve one of forever.
     2 copper/plate + 4 stone/gravel: 2x2.4 + 4x0.3 = 6.0 T. */
  { id:'belt_r', name:'CONVEYOR', tags:['machine'],
    item:{ mass:6.0, hud:{ order:15 } },
    look:{ item:['woodB', 'irA'] } },

  /* 4 timber/log + 2 stone/gravel: 4x0.8 + 2x0.3 = 3.8 T. */
  { id:'brazier', name:'BRAZIER', tags:['machine'],
    item:{ mass:3.8, hud:{ order:16 } },
    look:{ item:['ochreB', 'ochreA'] } },

  /* 2 copper/plate: 2x2.4 = 4.8 T -- `hearth`'s own former bill was
     deliberately the smallest in the game, and stays so
     here. */
  { id:'hearth', name:'HEARTH', tags:['machine'],
    item:{ mass:4.8, hud:{ order:17 } },
    look:{ item:['basB', 'basA'] } },

  /* THE MIRRORED PAIR, ONE SUBSTANCE, same reasoning as `belt_r` above:
     `talos_head`/`talos_head_l` share a visual and the identical `facing`
     convention (`mine:{facing}`), resolved off `player.face` at placement.
     8 copper/plate + 2 copper/ingot: 8x2.4 + 2x1.6 = 22.4 T. */
  { id:'talos_head', name:'TALOS HEAD', tags:['machine'],
    item:{ mass:22.4, hud:{ order:18 } },
    look:{ item:['cuB', 'irA'] } },

  /* THE MIRRORED PAIR, ONE SUBSTANCE, same reasoning again:
     `cyclops_maw`/`cyclops_maw_l`. 16 copper/plate + 6 copper/ingot + 6
     granite/gravel: 16x2.4 + 6x1.6 + 6x0.45 = 50.7 T -- the heaviest machine
     in the game, matching its own T4 tier. */
  { id:'cyclops_maw', name:'CYCLOPS MAW', tags:['machine'],
    item:{ mass:50.7, hud:{ order:19 } },
    look:{ item:['adamantB', 'adamantD'] } },

  /* SEGMENT TRANSPORT, four substances priced as one family against the 40 T
     `burden` cap. Every mass is `Σ item.mass x form.massK x n` over the build
     recipe, the same arithmetic every other row uses.

     A segment needs TWO hubs, so 2 x 10.4 = 20.8 T is the pair, and a minimal
     segment with a crank is 24.1 T -- inside one 40 T trip. Pricing a hub at
     the retired winch stage's own 20.8 T would put a segment at 44.9 T. None
     carries a `tile` block and their only tag is `machine`, so none ever
     reaches the tile byte. */

  /* 3 copper/plate + 1 copper/ingot + 2 timber/log:
     3x2.4 + 1x1.6 + 2x0.8 = 10.4 T. REFINED, not raw -- the same class that
     priced the winch stage in, because a hub is the investment. */
  { id:'hub', name:'WINCH HUB', tags:['machine'],
    item:{ mass:10.4, hud:{ order:20 } },
    look:{ item:['irC', 'irA'] } },

  /* 3 timber/log + 3 stone/gravel: 3x0.8 + 3x0.3 = 3.3 T. Timber and
     gravel, so a player who has felled one tree can build several. */
  { id:'crank', name:'HAND CRANK', tags:['machine'],
    item:{ mass:3.3, hud:{ order:21 } },
    look:{ item:['woodC', 'irA'] } },

  /* 2 timber/log + 1 stone/gravel: 2x0.8 + 1x0.3 = 1.9 T -- the lightest
     machine substance in the table, `hearth` (4.8 T) included, and
     deliberately so: a drivetrain is built out of a fistful of these. */
  { id:'gear', name:'GEAR', tags:['machine'],
    item:{ mass:1.9, hud:{ order:22 } },
    look:{ item:['cuB', 'cuA'] } },

  /* 2 copper/ingot + 2 timber/log: 2x1.6 + 2x0.8 = 4.8 T. Sits between the
     crank (3.3) and the hub (10.4), which is what "three tiles of reach for a
     third of the loss" ought to cost. */
  { id:'axle', name:'AXLE', tags:['machine'],
    item:{ mass:4.8, hud:{ order:23 } },
    look:{ item:['woodB', 'cuA'] } },

  /* 5 copper/plate + 1 copper/ingot + 2 timber/log: 15.2 T. PRICED AS A HUB
     PLUS A DECK -- the hub's own bill with two more plate, because a dock is a
     hub with a platform bolted on and the platform is the plate.

     THE PLATE AND NOT GRAVEL is also an ORDERING decision: a bill with gravel
     would strictly contain `gear`'s, and `gear` is declared first, so this row
     would have to jump ahead of the whole segment block. With no gravel the
     only containment is `hub`'s own bill. */
  { id:'cloud_dock', name:'THE CLOUD DOCK', tags:['machine'],
    item:{ mass:15.2, hud:{ order:24 } },
    look:{ item:['marbleB', 'ichor'] } },

  /* two more trinkets and two more miracles, so each tier is a real
          draft rather than one row handed over every time. Appended, which is
          safe for exactly the reason the header states: `relic` and `phial`
          cross only with `relic`/`miracle`-tagged substances, so none of
          these four is packable and `PACKABLE_MAX` does not move. */

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

  /* `altar` is deliberately NOT given a substance here either, and for a
     STRONGER reason than `kiln_divine`'s below: the altar must never be
     obtainable at all. It is placed by `rules/cycles.js` when cycle 1 arms,
     and a row with no substance can never pass `placementCheck`'s held-item
     clause -- "never placeable by the player" expressed as an absence rather
     than as a check. See `data/machines.js`'s `altar` row. */

  /* `kiln_divine` is deliberately NOT given a substance here. Its former
     `cost` (inherited, unchanged, via `variantOf:'furnace'`) is BIT-IDENTICAL
     to `furnace`'s -- so a `kiln_divine` hand-recipe would share furnace's
     exact trigger condition with no way to ever fire (`choose`'s first-match
     rule would deterministically always produce `furnace` instead, forever,
     the one kind of tie `daedalan`/`auger`'s differing quantities exist
     specifically to avoid). Retuning it to break the tie would invent a
     number nobody set. */
];

/* derived indices, built once, frozen. Nothing scans this table on a hot
        path ever again. */

export const SUB = Object.freeze(SUBSTANCES.map(Object.freeze));

/* id -> ordinal. `S.copper` reads as a word and stores as a number. */
export const S = Object.freeze(Object.fromEntries(SUB.map((s, i) => [s.id, i])));

/* tag -> ordinals. `byTag.metal` is [copper, tin] with nothing naming either. */
export const byTag = Object.freeze(SUB.reduce((m, s, i) => {
  for (const t of s.tags || []) (m[t] = m[t] || []).push(i);
  return m;
}, {}));

/* the two bytes that are NOT substance x form
   Air and the world edge are not elements and must never be rows above: `air`
   has no atoms and `bedrock` is a boundary condition. They are pseudo-rows so
   that `model/tiles.js` can ask ANY tile byte for a `tile` block with no
   boundary special-case. Out of bounds reads bedrock; above a band reads air. */
export const VOID_SUB = Object.freeze({
  id:'air', name:'AIR', tags:[],
  tile:Object.freeze({ solid:false, climb:false, hard:0, drops:null }),
  look:Object.freeze({}) });

export const EDGE_SUB = Object.freeze({
  id:'bedrock', name:'BEDROCK', tags:['rock'],
  tile:Object.freeze({ solid:true, climb:false, hard:Infinity, drops:null }),
  look:Object.freeze({ base:'abyC', hi:'irD', lo:'abyC' }) });
