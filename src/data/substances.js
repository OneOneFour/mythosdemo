/* LAYER data — SUBSTANCES: one row per ELEMENT. Frozen. No logic, no state.
   Imports `core` and `data` only. May be imported by `data`, `model`, `rules`,
   `view`.

   ============================================================================
   READ THIS BLOCK BEFORE ADDING A ROW. Read `data/forms.js` first: it states
   the rule for whether a new thing is a row HERE or a row THERE.

       A SUBSTANCE IS AN ELEMENT. Anything you can hold is substance x form.
       A thing with no element of its own is a FORM of the element it came
       from -- not a new substance.

   So `copper`, `tin`, `timber` and `stone` are rows here; `ore`, `ingot`,
   `gravel` and `log` are rows in `forms.js`. A copper ingot needs no row
   anywhere: it is the copper row crossed with the ingot form.
   ============================================================================

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

   Index is half of the tile id byte, so ROWS ARE APPEND-ONLY: appending keeps
   every existing id, and therefore every save, valid. */

export const SUBSTANCES = [

  /* ---- the commented row. Every row below is this shape with different
          literals; copy the nearest one and change the words. ---- */
  { id:'copper', name:'COPPER', tags:['metal', 'mineable'],

    tile:{ solid:true,
           hard:0.95,                    // seconds at pick power 1
           drops:'ore' },                // mining a copper wall yields copper ORE

    item:{ mass:1.0, hud:{ order:1, always:true } },

    look:{ base:'cuB', hi:'cuA', lo:'cuD',
           item:['cuA', 'cuC'],
           treatments:[ { fn:'glint', col:'veinA', n:2 } ] } },

  /* ---- tin: the one-row claim, and the whole point of substance x form.
          It gets a vein, ore, gravel and an ingot; it is smelted by the same
          recipe as copper because that recipe binds the SUBSTANCE of whatever
          ore it ate. Adding this row added nothing to `forms.js`,
          `recipes.js` or `machines.js`. ---- */
  { id:'tin', name:'TIN', tags:['metal', 'mineable'],
    tile:{ solid:true, hard:1.10, drops:'ore' },
    item:{ mass:1.0, hud:{ order:2 } },
    look:{ base:'snC', hi:'snA', lo:'snD',
           item:['snA', 'snC'],
           treatments:[ { fn:'glint', col:'snA', n:2 } ] } },

  /* ---- timber: the fuel and the ladder. Its `log` form is tile-capable and
          climbable, so felling a tree and building a ladder are the same two
          nouns in different places -- see `forms.js`. ---- */
  { id:'timber', name:'TIMBER', tags:['organic', 'mineable'],
    tile:{ solid:true, hard:0.35, drops:'log' },
    item:{ mass:0.8, hud:{ order:3, always:true } },
    look:{ base:'woodB', hi:'woodA', lo:'woodD',
           item:['woodA', 'woodC'],
           /* `view/paint.js` grows this on a timber column's TOP tile only --
              a felled trunk's new top grows one the next time that tile
              repaints, with no code change, because the geometry test is
              "nothing solid above, all the way up" (`skyExposedAt`), not
              "this is a trunk". Solid blocks, not a scatter: a chunky
              Terraria-style canopy reads at this project's small viewport in a
              way a stochastic dot-cloud did not. */
           canopy:{ leaves:['vdB', 'vdA'], w:3, h:2 } } },

  /* ---- stone: the bulk of the world. Mines to gravel, never to ore, and has
          no ingot because it is not a metal -- the form crossing is limited by
          the FORM's `subTags`, not by a row here. ---- */
  { id:'stone', name:'STONE', tags:['rock', 'mineable', 'spoil'],
    tile:{ solid:true, hard:1.60, drops:'gravel' },
    item:{ mass:0.6, hud:{ order:4 } },
    look:{ base:'irC', hi:'irB', lo:'irD',
           item:['limeB', 'limeD'],
           /* Bedding planes: free once `banded` exists, per docs/ART_DESIGN.md
              -- a stratum that used to be a flat noise field now reads as
              sedimentary rock at a glance, with no new rendering code. */
           treatments:[ { fn:'banded', col:'irD', every:8 } ] } },

  /* ---- bellows: the trinket tier, and the reason a trinket is a SUBSTANCE
          and not a form. A trinket refines from nothing -- it IS the element,
          singular and unique -- so `data/trinkets.js#TRINKET[id].mods` hangs
          off a substance id rather than the game inventing a second, parallel
          "equipped" list next to `run.inv`. No `tile` block: a relic was never
          rock, and `crossable()` only lets it take `forms.js`'s `relic` form,
          not `ore` or `gravel`. Every future trinket is a row here, exactly
          like this one, and needs nothing new in `rules/trinkets.js`. ---- */
  { id:'bellows', name:'BELLOWS OF THE FORGE', tags:['relic'],
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
  { id:'pick', name:'STOCK PICKAXE', tags:['relic'],
    /* `tool:{tier:1, power:1.0}` (Phase 2c): tier 1 is every substance with no
       `tile.tier` of its own (absent means 1), and power 1.0 multiplies
       `eff('pickPower')` by exactly nothing -- so this row is BEHAVIOURALLY
       UNCHANGED. Before this phase `hasPick()` read `invCount` directly;
       now it reads `bestTool() !== null`, which is true under the identical
       condition (this is the only tool a fresh run ever starts with). */
    item:{ mass:0.5, hud:{ order:6 }, tool:{ tier:1, power:1.0 } },
    look:{ item:['irB', 'woodC'] } },

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
    look:{ base:'soilA', hi:'soilA', lo:'soilC',
           item:['soilA', 'soilC'],
           treatments:[ { fn:'banded', col:'soilC', every:5 } ],
           /* A green cap, drawn only where `skyExposedAt` says this tile has
              an open shot straight up to the top of the band -- true sky, not
              a dug-out ceiling. `hi` above is a plain soil tone rather than
              green FOR EXACTLY THIS REASON: `paintTile`'s generic "exposed
              face" highlight fires for ANY open neighbour, tunnels included,
              and painting it green was grass appearing on cave ceilings. */
           grassCap:{ col:'grassA', h:2 } } },

  /* ---- granite: the first ROCK harder than stone, for the deep strata pick
          tiers Phase 2c gates against. `tile.tier:2` is the new optional key
          documented above -- absent means tier 1, so every existing
          substance (copper, tin, timber, stone, soil) is unaffected. Mines
          to `gravel`, same as stone and soil, so no new rubble form is
          needed for it. ---- */
  { id:'granite', name:'GRANITE', tags:['rock', 'mineable'],
    tile:{ solid:true, hard:2.4, drops:'gravel', tier:2 },
    item:{ mass:0.9, hud:{ order:8 } },
    look:{ base:'graniteB', hi:'graniteA', lo:'graniteD',
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
  { id:'adamant', name:'ADAMANT', tags:['rock', 'metal', 'mineable'],
    tile:{ solid:true, hard:5.0, drops:'gravel', tier:3 },
    item:{ mass:1.4, hud:{ order:9 } },
    look:{ base:'adamantB', hi:'adamantA', lo:'adamantD',
           item:['adamantA', 'adamantC'],
           treatments:[ { fn:'glint', col:'adamantA', n:2 } ] } },

  /* ---- auger: the T2 hand tool (Phase 2c), appended last per the header's
          append-only rule rather than beside `pick` -- ordinals are id
          storage and every existing substance's stays put. No `tile` block:
          a tool was never rock, same as `bellows`/`pick` above, and
          `crossable()` only lets it take `forms.js`'s `relic` form.

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
  { id:'auger', name:'ADAMANT AUGER', tags:['relic'],
    item:{ mass:0.9, hud:{ order:10 }, tool:{ tier:2, power:1.8 } },
    look:{ item:['adamantA', 'irB'] } }
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
