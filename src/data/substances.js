/* LAYER data — SUBSTANCES: one row per ELEMENT. Frozen. No logic, no state.
   Imports `core` and `data` only. May be imported by `data`, `model`, `rules`,
   `view`.

   See docs/DEVELOPER_GUIDE.md#adding-a-substance before adding a row.

     tags   free strings. `#metal` in a selector means "any row tagged metal".

     tile   present -> the element can exist in the grid as native rock.
            absent  -> it never can. Absence is a declaration, not an omission.
            hard    -> SECONDS to break at pick power 1. Not a 0..255 byte: that
                       byte is what made granite unmineable above 106 fps.
            drops   -> the FORM the element yields when mined. The substance is
                       always itself, which is why one smelt row covers every
                       ore that will ever exist.
            tier    -> OPTIONAL. Absent means tier 1. A SEPARATE gate from
                       `hard`: `hard` decides how long a legal swing against
                       this substance takes; `tier` decides whether a swing is
                       legal at all, checked against the held tool's tier in
                       rules/mining.js (Phase 2c). Monotonic against `hard` by
                       convention and by tools/content.mjs's check: nothing at
                       a higher tier may be softer than something at a lower
                       one.

     item   present -> the element can be carried, in any of the forms whose
            own `item` block permits it.
            mass   -> base mass; the form multiplies it (see `forms.js`).
            hud    -> `{ order }` position in the pocket strip. `view/hud.js`
                      reads only this, so the HUD is data-driven.
            tool   -> OPTIONAL. `{ tier, power }`. TOOLS ARE RELIC SUBSTANCES,
                      not a new table (Phase 2c): the stock pickaxe and the
                      adamant auger are both ordinary `relic`-tagged rows, and
                      this is the only new thing on either of them. `tier` is
                      compared against a tile's `tile.tier` (above) in
                      `rules/mining.js`'s gate; `power` multiplies
                      `eff('pickPower')` in exactly the one place `hard` and
                      `toolTier` already multiply theirs, so a trinket cannot
                      be read around. `model/run.js#bestTool()` is the query
                      that finds the highest-tier one currently held.

     look   appearance, and NOTHING but `view/` reads it. `base/hi/lo` and
            `item` are keys into `data/palette.js`. `treatments` name pure
            functions in `view/treatments.js`, which is how "this glows" is
            added without editing a paint function.
            speckle -> OPTIONAL. Fraction of a tile's pixels that get a grain
                       dot, 0..1. Absent means 0.26, which is exactly the fixed
                       density every substance used to share. Soil is noisy,
                       adamant is nearly smooth; that difference is most of
                       what makes two strata read as two materials rather than
                       as one material in two colours.
            face    -> OPTIONAL palette name for an EXPOSED VERTICAL FACE --
                       a cliff, a shaft wall. Freshly broken rock, and it need
                       not be the tone of the weathered top. Absent means
                       `base`. `view/paint.js` lights or shades it from the one
                       declared light direction, so a row names the material,
                       never the side.
            contact -> OPTIONAL palette name for the 1 px line along a strata
                       boundary: this substance's top edge, where the substance
                       ABOVE it is a different one. Absent means `lo`.

   ROWS ARE APPEND-ONLY; see docs/DEVELOPER_GUIDE.md#adding-a-substance. */

export const SUBSTANCES = [

  /* ---- the commented row. Every row below is this shape with different
          literals; copy the nearest one and change the words. ---- */
  { id:'copper', name:'COPPER', short:'CU', tags:['metal', 'mineable'],

    tile:{ solid:true,
           hard:0.95,                    // seconds at pick power 1
           drops:'ore' },                // mining a copper wall yields copper ORE

    item:{ mass:1.0, hud:{ order:1, always:true } },

    look:{ base:'cuB', hi:'cuA', lo:'cuD', speckle:0.30,
           item:['cuA', 'cuC'],
           treatments:[ { fn:'glint', col:'veinA', n:2 } ] } },

  /* ---- tin: see docs/DEVELOPER_GUIDE.md#adding-a-substance ---- */
  { id:'tin', name:'TIN', tags:['metal', 'mineable'],
    tile:{ solid:true, hard:1.10, drops:'ore' },
    item:{ mass:1.0, hud:{ order:2 } },
    look:{ base:'snC', hi:'snA', lo:'snD', speckle:0.28,
           item:['snA', 'snC'],
           treatments:[ { fn:'glint', col:'snA', n:2 } ] } },

  /* ---- timber: the fuel and the ladder. Its `log` form is tile-capable and
          climbable, so felling a tree and building a ladder are the same two
          nouns in different places -- see `forms.js`. ---- */
  { id:'timber', name:'TIMBER', short:'WOOD', tags:['organic', 'mineable'],
    tile:{ solid:true, hard:0.35, drops:'log' },
    item:{ mass:0.8, hud:{ order:3, always:true } },
    look:{ base:'woodB', hi:'woodA', lo:'woodD', speckle:0.34,
           item:['woodA', 'woodC'],
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

  /* ---- stone: the bulk of the world. Mines to gravel, never to ore, and has
          no ingot -- see docs/DEVELOPER_GUIDE.md#adding-a-form ---- */
  { id:'stone', name:'STONE', tags:['rock', 'mineable', 'spoil'],
    tile:{ solid:true, hard:1.60, drops:'gravel' },
    item:{ mass:0.6, hud:{ order:4 } },
    look:{ base:'irC', hi:'irB', lo:'irD', speckle:0.24,
           face:'irB', contact:'irD',
           item:['limeB', 'limeD'],
           /* Bedding planes: free once `banded` exists, per docs/ART_DESIGN.md
              -- a stratum that used to be a flat noise field now reads as
              sedimentary rock at a glance, with no new rendering code. */
           treatments:[ { fn:'banded', col:'irD', every:8 } ] } },

  /* ---- bellows: the trinket tier. See
          docs/DEVELOPER_GUIDE.md#the-four-gift-tiers ---- */
  { id:'bellows', name:'BELLOWS OF THE FORGE', short:'BELLOWS', tags:['relic'],
    item:{ mass:0.4, hud:{ order:5 } },
    look:{ item:['ichor', 'vioHi'] } },

  /* ---- pick: the first gift, same shape as any other relic. `model/run.js`'s
          `hasPick()` is `invCount(S.pick, F.relic) > 0` -- a capability GATE
          rather than a `data/trinkets.js` modifier, which is why it is not a
          row in that table: nothing in `model/mods.js` needs to know a pick
          exists. `shell/boot.js` plants one near spawn on every `newRun()`,
          and walking over it is an ordinary pickup -- the same "material never
          teleports into your hands" idiom mining already uses, extended to the
          one tool the game hands you rather than one you find. ---- */
  { id:'pick', name:'STOCK PICKAXE', short:'PICK', tags:['relic'],
    item:{ mass:0.5, hud:{ order:6 }, tool:{ tier:1, power:1.0 } },
    /* THE GLOW IS A RECOVERY, and a content-only one. docs/ARCHAEOLOGY.md
       section 4.2 quotes the flat prototype's own `drawPickup()`: the relic on
       the ground had a `glow()` halo in a warm gold, and section 4.3 records
       that it was dropped unported when `_old_src/` was deleted -- while every
       piece of machinery needed to have it back (`look.treatments`,
       `TREAT.halo`, `core/pixels.js#glow`) survived intact and in use. So this
       is the one line section 7 says it costs. `ichor` is the divine gold this
       codebase already uses for "special, look here". The BOB is not restored:
       `view/paint.js#paintItem` is generic by design (SPEC section 12) and a
       per-item animation is a bigger question than this phase. */
    look:{ item:['irB', 'woodC'],
           treatments:[ { fn:'halo', col:'ichor', r:8, a:0.2 } ] } },

  /* ---- soil: the shallow cap `data/world.js`'s surface band wears over its
          stone, so the first few dug tiles read as dirt rather than rock. Its
          `hi` is a grass tone rather than a lighter version of `base` -- every
          other substance's `hi` is that, but this one leans on `paintTile`'s
          existing "exposed top face" pass (`view/paint.js`) to paint a grass
          cap wherever soil meets open air, with no new rendering code. Softer
          than stone (a shovel's depth, not a pick's), and drops the same
          `gravel` any `rock`-tagged substance does -- no new form for a second
          kind of rubble. ---- */
  { id:'soil', name:'SOIL', tags:['rock', 'mineable'],
    tile:{ solid:true, hard:0.50, drops:'gravel' },
    item:{ mass:0.5, hud:{ order:7 } },
    look:{ base:'soilA', hi:'soilA', lo:'soilC', speckle:0.44,
           /* A soil bank's face is damp subsoil, darker than the sun-dried top
              -- which is also what makes the turf drape above it read. */
           face:'soilC', contact:'soilC',
           item:['soilA', 'soilC'],
           treatments:[ { fn:'banded', col:'soilC', every:5 } ],
           /* A TURF CAP, drawn only where `skyExposedAt` says this tile has
              an open shot straight up to the top of the band -- true sky, not
              a dug-out ceiling. `hi` above is a plain soil tone rather than
              green FOR EXACTLY THIS REASON: `paintTile`'s generic "exposed
              face" highlight fires for ANY open neighbour, tunnels included,
              and painting it green was grass appearing on cave ceilings.

              Three greens, not one, and a whole tile rather than two pixels:
              docs/ARCHAEOLOGY.md section 1a records the older look this
              recovers -- a full band of `grassA` over a lower edge of `grassB`
              with a `noiseFill` speckle of `grassC` across both. `drape` is
              the part that is new rather than recovered: turf spilling a few
              pixels down an exposed vertical face, so Phase 7's relief reads
              as banks of earth instead of a stack of cut cubes. */
           grassCap:{ col:'grassA', low:'grassB', dark:'grassC',
                      lowH:3, drape:4, grain:0.16 } } },

  /* ---- granite: the first ROCK harder than stone, for the deep strata pick
          tiers Phase 2c gates against. `tile.tier:2` is the new optional key
          documented above -- absent means tier 1, so every existing
          substance (copper, tin, timber, stone, soil) is unaffected. Mines
          to `gravel`, same as stone and soil, so no new rubble form is
          needed for it. ---- */
  { id:'granite', name:'GRANITE', short:'GRNT', tags:['rock', 'mineable'],
    tile:{ solid:true, hard:2.4, drops:'gravel', tier:2 },
    item:{ mass:0.9, hud:{ order:8 } },
    look:{ base:'graniteB', hi:'graniteA', lo:'graniteD', speckle:0.17,
           face:'graniteC', contact:'graniteD',
           item:['graniteA', 'graniteC'],
           treatments:[ { fn:'banded', col:'graniteD', every:8 } ] } },

  /* ---- adamant: the hardest rock in the game, tier 3. The first ROCK
          substance also tagged `metal` -- `tags` carries both `rock`
          (mines like stone/granite, to `gravel`, per `tile.drops` below)
          and `metal` (`crossable()` will let a future ore/ingot/plate form
          cross into it once a smelt path is designed for that; nothing in
          this phase adds that recipe, and mining it still only ever yields
          gravel). `tile.tier:3` gates it behind Phase 2c's auger/Talos-head
          tools -- a bronze pickaxe cannot scratch it. ---- */
  { id:'adamant', name:'ADAMANT', short:'ADMT', tags:['rock', 'metal', 'mineable'],
    tile:{ solid:true, hard:5.0, drops:'gravel', tier:3 },
    item:{ mass:1.4, hud:{ order:9 } },
    look:{ base:'adamantB', hi:'adamantA', lo:'adamantD', speckle:0.07,
           face:'adamantC', contact:'adamantD',
           item:['adamantA', 'adamantC'],
           treatments:[ { fn:'glint', col:'adamantA', n:2 } ] } },

  /* ---- auger: the T2 hand tool. See
          docs/DEVELOPER_GUIDE.md#tools-are-relic-substances

          `tool:{tier:2, power:1.8}` is the ONE number this whole tier's
          equality proof rests on: `rules/machines.js`'s Talos Head reads it
          back generically (scanning every substance's `item.tool` block for
          the largest `power`, no id named) rather than carrying a second,
          hand-copied literal of its own -- so "mines at exactly the T2 hand
          rate" is true by construction, not by two authors remembering to
          agree. `power:1.8` also bites `tile.tier:2` (granite) that a
          `power:1.0` pick's `tier:1` cannot reach at all, per the gate in
          `rules/mining.js`. `data/recipes.js#auger` forges it: 2 copper/plate
          + 1 timber/log. */
  { id:'auger', name:'ADAMANT AUGER', short:'AUGER', tags:['relic'],
    item:{ mass:0.9, hud:{ order:10 }, tool:{ tier:2, power:1.8 } },
    look:{ item:['adamantA', 'irB'] } },

  /* ---- chasm: the one miracle this phase ships (Phase 4,
          `docs/BUILD_PLAN.md`), same shape as `bellows`/`pick`/`auger`
          above -- a miracle is a HELD PAIR, per the substance x form rule
          (CLAUDE.md "Resolved decisions" D1), and needs an element of its
          own for the identical reason a trinket does: it refines from
          nothing, it IS the element. `tags:['miracle']` (NOT `relic`) is
          what lets it cross into `forms.js#phial` and NOTHING else --
          `phial`'s own `subTags:['miracle']` is the whole reason that form
          exists separately from `relic`, so a miracle can never satisfy a
          trinket selector by accident. ---- */
  { id:'chasm', name:'RIFT OF HADES', tags:['miracle'],
    item:{ mass:0.2, hud:{ order:11 } },
    look:{ item:['abyC', 'vioHi'] } },

  /* ---- MACHINE SUBSTANCES: one row per machine.
          See docs/DEVELOPER_GUIDE.md#a-machine-is-a-held-item ---- */

  /* 12 copper/ore + 6 timber/log, `model/items.js#massOfPair` summed:
     12x1.0 + 6x0.8 = 16.8 T (`docs/SPEC.md` section 13's own number,
     unchanged -- the bill moved from a placement-time gate to a recipe
     input, it was not retuned). */
  { id:'furnace', name:'CRUDE FURNACE', tags:['machine'],
    item:{ mass:16.8, hud:{ order:12 } },
    look:{ item:['irC', 'irB'] } },

  /* 6 copper/plate + 4 timber/log + 2 copper/ingot: 6x2.4 + 4x0.8 + 2x1.6 =
     20.8 T, `docs/SPEC.md`'s own lift number, unchanged. */
  { id:'lift', name:'WINCH STAGE', tags:['machine'],
    item:{ mass:20.8, hud:{ order:13 } },
    look:{ item:['woodC', 'irB'] } },

  /* 4 copper/plate + 2 copper/ingot: 4x2.4 + 2x1.6 = 12.8 T, `docs/SPEC.md`'s
     own press number, unchanged. */
  { id:'press', name:'PRESS', tags:['machine'],
    item:{ mass:12.8, hud:{ order:14 } },
    look:{ item:['irB', 'irA'] } },

  /* THE MIRRORED PAIR, ONE SUBSTANCE (see
     docs/DEVELOPER_GUIDE.md#mirrored-machine-pairs): two substances would mean
     two hand-recipes with a BIT-IDENTICAL bill, which
     `rules/crafting.js#choose`'s "first match wins" would starve one of
     forever with no float-management workaround, unlike `daedalan`/`auger`'s
     differing log counts.
     id is `belt_r`, the base row's own id, per the 1:1 naming precedent --
     2 copper/plate + 4 stone/gravel: 2x2.4 + 4x0.3 = 6.0 T. */
  { id:'belt_r', name:'CONVEYOR', tags:['machine'],
    item:{ mass:6.0, hud:{ order:15 } },
    look:{ item:['woodB', 'irA'] } },

  /* 4 timber/log + 2 stone/gravel: 4x0.8 + 2x0.3 = 3.8 T. */
  { id:'brazier', name:'BRAZIER', tags:['machine'],
    item:{ mass:3.8, hud:{ order:16 } },
    look:{ item:['ochreB', 'ochreA'] } },

  /* 2 copper/plate: 2x2.4 = 4.8 T -- `hearth`'s own former bill was
     deliberately the smallest in the game (docs/FINDINGS.md), and stays so
     here: this is the lightest machine substance in the table. */
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

  /* ---- SEGMENT TRANSPORT (Phase 8d, docs/PLAN-gears-and-winches.md section
     4.1). Four machine substances, priced as one family against the 40 T
     `burden` cap (docs/SPEC.md section 9) and section 8's compression tiers.
     Every mass below is `Σ substance.item.mass x form.massK x n` over the
     build recipe in `data/recipes.js` -- the identical
     `model/items.js#massOfPair` arithmetic every other row here uses, never a
     second sum.

     THE NUMBER THE FAMILY IS PRICED AROUND: a segment needs TWO hubs, so
     2 x 10.4 = 20.8 T is the pair -- exactly what the one `lift` stage it
     replaces weighs, to the decigram. A complete minimal segment (two hubs
     plus one crank) is 24.1 T, so it still fits inside one 40 T trip; adding a
     gear makes it 26.0 T and it still does (24.1 + 1.9). That is the reason the hub
     is HALF the retired winch rather than equal to it: pricing a hub at the
     lift's own 20.8 T would have put a working segment at 44.9 T and made
     "carry a lift down a shaft" a two-trip errand for no design gain.

     These carry no `tile` block and their only tag is `machine`, so no
     tile-capable form crosses into them and none of them ever reaches the
     tile byte -- see `data/forms.js`'s packing block and
     `tools/content.mjs` assertion 16. ---- */

  /* 3 copper/plate + 1 copper/ingot + 2 timber/log:
     3x2.4 + 1x1.6 + 2x0.8 = 10.4 T. REFINED, not raw -- the class Phase 3
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
    look:{ item:['woodB', 'cuA'] } }

  /* `kiln_divine` is deliberately NOT given a substance here. Its former
     `cost` (inherited, unchanged, via `variantOf:'furnace'`) is BIT-IDENTICAL
     to `furnace`'s -- so a `kiln_divine` hand-recipe would share furnace's
     exact trigger condition with no way to ever fire (`choose`'s first-match
     rule would deterministically always produce `furnace` instead, forever,
     the one kind of tie `daedalan`/`auger`'s differing quantities exist
     specifically to avoid). Retuning it to break the tie would invent a
     number nobody set. */
];

/* ---- derived indices, built once, frozen. Nothing scans this table on a hot
        path ever again. ---- */

export const SUB = Object.freeze(SUBSTANCES.map(Object.freeze));

/* id -> ordinal. `S.copper` reads as a word and stores as a number. */
export const S = Object.freeze(Object.fromEntries(SUB.map((s, i) => [s.id, i])));

/* tag -> ordinals. `byTag.metal` is [copper, tin] with nothing naming either. */
export const byTag = Object.freeze(SUB.reduce((m, s, i) => {
  for (const t of s.tags || []) (m[t] = m[t] || []).push(i);
  return m;
}, {}));

/* ---- the two bytes that are NOT substance x form ----------------------------
   Air and the world edge are not elements and must never be rows above: `air`
   has no atoms and `bedrock` is a boundary condition. They are pseudo-rows so
   that `model/tiles.js` can ask ANY tile byte for a `tile` block with no
   boundary special-case. Out of bounds reads bedrock; above a band reads air.
   ---------------------------------------------------------------------------- */
export const VOID_SUB = Object.freeze({
  id:'air', name:'AIR', tags:[],
  tile:Object.freeze({ solid:false, climb:false, hard:0, drops:null }),
  look:Object.freeze({}) });

export const EDGE_SUB = Object.freeze({
  id:'bedrock', name:'BEDROCK', tags:['rock'],
  tile:Object.freeze({ solid:true, climb:false, hard:Infinity, drops:null }),
  look:Object.freeze({ base:'abyC', hi:'irD', lo:'abyC' }) });
