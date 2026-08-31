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

     item   present -> the element can be carried, in any of the forms whose
            own `item` block permits it.
            mass   -> base mass; the form multiplies it (see `forms.js`).
            hud    -> `{ order }` position in the pocket strip. `view/hud.js`
                      reads only this, so the HUD is data-driven.

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
           item:['woodA', 'woodC'] } },

  /* ---- stone: the bulk of the world. Mines to gravel, never to ore, and has
          no ingot because it is not a metal -- the form crossing is limited by
          the FORM's `subTags`, not by a row here. ---- */
  { id:'stone', name:'STONE', tags:['rock', 'mineable', 'spoil'],
    tile:{ solid:true, hard:1.60, drops:'gravel' },
    item:{ mass:0.6, hud:{ order:4 } },
    look:{ base:'irC', hi:'irB', lo:'irD',
           item:['limeB', 'limeD'] } },

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
    item:{ mass:0.5, hud:{ order:6 } },
    look:{ item:['irB', 'woodC'] } }
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
