/* LAYER data — SUBSTANCES: the whole vocabulary of stuff, one row per thing.

   ============================================================================
   READ THIS BLOCK BEFORE ADDING A ROW. It is the only documentation the table
   needs, and everything below it is literals.
   ============================================================================

   A row is a substance. A substance may be a wall, an item, both, or neither:

     tags   free strings. `'#ore'` anywhere else in `data/` means "any row
            carrying the tag `ore`". Tags are the only indirection in this file.

     tile   present  -> the substance can exist in the grid as a wall.
            absent   -> it can never be a wall. An absent block is a
                        declaration, not an omission: `gravel` has no `tile`,
                        so no worldgen or miracle can place gravel as rock.
            hard     -> SECONDS to break at pick power 1. Not a 0..255 byte.
            drop     -> the substance id mining it yields, or null.

     item   present  -> it can exist as a falling, collectable thing.
            hud      -> `{ order }` puts it in the pocket strip in that order;
                        `always:true` shows a zero. `view/hud.js` reads only
                        this — see BRIEF "data-driven HUD inventory".
            mass     -> for the cost-of-ascension sum (DESIGN item 1).

     look   appearance, and nothing else reads it but `view/`. `base/hi/lo` are
            keys into `data/palette.js`. `treatments` are named pure functions in
            `view/treatments.js` — this is how "this material glows" is added
            without editing a paint function (see `ingot`).

     gen    where worldgen places it. `rules/generate.js` iterates rows that
            have a `gen` block, so an ore places itself without worldgen ever
            naming it.

     smeltsTo  the substance a furnace turns this into. Read by the furnace's
            `outFrom` clause in `machines.js` — that is what makes the furnace
            one row for every ore instead of one row per ore. If a row carries
            the tag `ore` and lacks `smeltsTo`, `tools/resolve.mjs` FAILS THE
            BUILD naming the row. That check exists because the review of this
            design found the opposite: a new ore silently swallowed by a furnace
            with no recipe to consume it.

   Index is the tile id byte, so ROWS ARE APPEND-ONLY: adding a row at the end
   keeps every existing id, and therefore every save, valid. Nothing outside
   this file, `machines.js`, `trinkets.js` and the resolver names a substance. */

export const SUBSTANCES = [

  { id:'air', name:'AIR',
    tile:{ solid:false, hard:0, drop:null } },

  /* Out-of-bounds reads return this row rather than -1, which deletes every
     boundary special-case in `model/tiles.js`. Infinite hardness, no drop. */
  { id:'bedrock', name:'BEDROCK',
    tile:{ solid:true, hard:Infinity, drop:null },
    look:{ base:'abyC', hi:'irD', lo:'abyC' } },

  { id:'soil', name:'SOIL',
    tags:['mineable', 'spoil'],
    tile:{ solid:true, hard:0.30, drop:'soil' },
    item:{ label:'SOIL', size:3, mass:0.5, hud:{ order:5 } },
    look:{ base:'soilB', hi:'soilA', lo:'soilC',
           item:['soilA', 'soilC'],
           sfx:{ break:'breakSoft', pickup:'pickup' } },
    gen:{ layer:{ fromTy:26, toTy:44 } } },

  { id:'granite', name:'GRANITE',
    tags:['mineable', 'spoil'],
    tile:{ solid:true, hard:2.40, drop:'gravel' },
    look:{ base:'irC', hi:'irB', lo:'irD',
           sfx:{ break:'breakHard' } },
    gen:{ layer:{ fromTy:96, toTy:384 } } },

  /* ---- ore ----------------------------------------------------------------
     The commented row. Every other row in this file is this shape with
     different literals. */
  { id:'copper', name:'COPPER VEIN',
    tags:['ore', 'mineable'],

    tile:{ solid:true,
           hard:0.95,                 // seconds at pick power 1
           drop:'copper' },

    item:{ label:'COPPER', size:4, mass:1.0,
           hud:{ order:1, always:true } },

    smeltsTo:'ingot',                 // the furnace reads this. See machines.js

    look:{ base:'cuB', hi:'cuA', lo:'cuD',
           item:['cuA', 'cuC'],
           treatments:[ { fn:'glint', col:'veinA', n:2 } ],
           sfx:{ break:'ore', pickup:'pickup' } },

    gen:{ blobs:{ fromTy:38, chance:0.25, r:[1.6, 3.8], count:90 },
          guaranteed:[ { near:'spawn', dy:8, r:3.1 } ] } },

  /* ---- fuel ---- */
  { id:'timber', name:'TIMBER',
    tags:['fuel', 'mineable'],
    tile:{ solid:true, hard:0.35, drop:'timber' },
    item:{ label:'TIMBER', size:4, mass:0.8,
           hud:{ order:2, always:true } },
    look:{ base:'woodB', hi:'woodA', lo:'woodD',
           item:['woodA', 'woodC'],
           sfx:{ break:'breakSoft', pickup:'pickup' } },
    gen:{ trees:{ fromTy:24, toTy:27, chance:0.02 } } },

  /* ---- products ----
     No `tile` block: an ingot can never be a wall. */
  { id:'ingot', name:'INGOT',
    tags:['refined'],
    item:{ label:'INGOT', size:4, mass:0.9, tier:2,
           hud:{ order:4 } },
    look:{ item:['cuA', 'cuB'],
           /* "this material glows" — one row in `look.treatments`, zero edits
              to `view/paint.js`. The named function is in view/treatments.js. */
           treatments:[ { fn:'glow', col:'hot', r:6, a:0.35 } ],
           sfx:{ pickup:'ingot' } } },

  { id:'gravel', name:'GRAVEL',
    tags:['crushed', 'spoil'],
    item:{ label:'GRAVEL', size:3, mass:0.6, hud:{ order:6 } },
    look:{ item:['limeB', 'limeD'],
           sfx:{ pickup:'pickup' } } },

  { id:'brick', name:'BRICK',
    tags:['refined', 'building'],
    tile:{ solid:true, hard:1.20, drop:'brick' },     // bricks can be built with
    item:{ label:'BRICK', size:4, mass:1.4, tier:2, hud:{ order:7 } },
    look:{ base:'clayB', hi:'clayA', lo:'clayC',
           item:['clayA', 'clayC'],
           treatments:[ { fn:'banded', col:'clayC', every:3 } ],
           sfx:{ break:'breakHard', pickup:'pickup' } } },

  /* ---- appended last; see README "## Adding a substance" -------------------
     Rows are append-only, so `tin` takes the next free tile id and no existing
     id moves. It needs `smeltsTo` because it carries the tag `ore`; omit it and
     `npm run check` fails with "tin: tagged 'ore' but has no smeltsTo". */
  { id:'tin', name:'TIN VEIN',
    tags:['ore', 'mineable'],
    tile:{ solid:true, hard:1.10, drop:'tin' },
    item:{ label:'TIN', size:3, mass:1.0, hud:{ order:3 } },
    smeltsTo:'ingot',
    look:{ base:'snC', hi:'snA', lo:'snD',
           item:['snA', 'snC'],
           treatments:[ { fn:'glint', col:'snA', n:2 } ],
           sfx:{ break:'breakHard', pickup:'ore' } },
    gen:{ blobs:{ fromTy:60, chance:0.18, r:[1.6, 3.8], count:70 } } }
];

/* ---- derived indices, built once, frozen. No `mix()`, no scan, on any hot
        path ever again. ---- */

export const SUB = Object.freeze(SUBSTANCES.map(Object.freeze));

/* id -> tile id byte. `S.copper` reads as a word and stores as a number. */
export const S = Object.freeze(Object.fromEntries(SUB.map((s, i) => [s.id, i])));

/* tag -> array of tile ids. `byTag.ore` is [copper, tin] with nothing naming
   either. Frozen, so a boon cannot smuggle a substance in at runtime. */
export const byTag = Object.freeze(SUB.reduce((m, s, i) => {
  for (const t of s.tags || []) (m[t] = m[t] || []).push(i);
  return m;
}, {}));

/* The one selector grammar in the project: '#tag' or a bare id. Returns tile
   ids. Used by `model/space.js`, the machine interpreter and the resolver, so
   there is exactly one implementation to be wrong. */
export const matches = sel =>
  sel.charCodeAt(0) === 35 ? (byTag[sel.slice(1)] || []) :
  S[sel] === undefined ? [] : [S[sel]];
