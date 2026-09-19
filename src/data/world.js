/* data layer — BANDS: one row per depth band, top to bottom. Frozen.

   Every tile query takes the band record as its first argument, and band
   ordinals are never assumed to be zero.

     tw/th     band size in tiles. `tile` is px per tile, `chunk` tiles per
               chunk side, and both are per-band.
     origin    world-space offset in pixels, not tiles: a tile offset would be
               meaningless between two bands of different `tile` size.
     floorTy   the ground row inside this band, and `spawnTx` the spawn
               column. Both are band-local.
     fields    the named scalar fields this band allocates. A machine emitting
               into a field its band does not declare is a build error.
     strata    worldgen instructions, by `kind`; `rules/generate.js` holds the
               set of kinds it handles.
     look      band-scale appearance. `view/` is the only reader. */

export const BANDS = [

  /* Full width, matching the bands below: a column with no astral row
     resolves to no band above world y 320, so nothing can be placed there. */
  { id:'astral', name:'THE MINOR HEAVENS',
    tw:1024, th:40, tile:8, chunk:16,
    origin:{ x:0, y:0 },
    floorTy:30,
    fields:[],
    strata:[
      { kind:'layer', sub:'stone', fromTy:30, toTy:40 }
    ],
    look:{ sky:'skyHi', tint:'marbleA', ambient:1.0 } },

  { id:'surface', name:'THE SUN\'S FLOOR',
    tw:1024, th:56, tile:8, chunk:16,
    origin:{ x:0, y:320 },
    floorTy:20, spawnTx:42, spawn:true,
    fields:['heat'],
    strata:[
      /* The height map, and it must be the first row: every boundary below
         offsets by it. `amp` is rows of hilltop above `floorTy`, `dip` rows
         of valley floor below it. */
      { kind:'relief', amp:10, dip:2 },
      /* `lip:false` is required on a buried layer: without it `layer()`'s
         ragged-edge carve reads row 27 as another exposed surface and punches
         air pockets along the soil/stone seam. */
      { kind:'layer', sub:'soil',   fromTy:20, toTy:27 },
      { kind:'layer', sub:'stone',  fromTy:27, toTy:56, lip:false },
      /* `at` is the row the lower layer declares as its `fromTy`; both
         resolve it through the same height-map shift. `thick` is the depth of
         interdigitated fingers in tiles, so a sharp contact is `thick:1`. */
      { kind:'contact', upper:'soil', lower:'stone', at:27, thick:4 },
      /* Declared between the layers and the ore, so the ore pass can line
         their walls. `dens` is attempts per 10,000 tiles of the row's own
         window, as on the ore rows. */
      { kind:'hollows', fromTy:38, toTy:56, dens:55.0, r:[1.4, 2.6], steps:[2, 3], bias:1 },
      /* `toTy` must reach past the ground line, spanning every height the
         relief row can produce, or a trunk's base scan never finds solid
         ground. `chance` is the per-column chance inside a grove. */
      { kind:'trees', sub:'timber', fromTy:8, toTy:28, chance:0.55, grove:{ spacing:96, spread:5 }, height:[3, 5] },
      /* `dens` is attempts per 10,000 tiles of this row's own window, so
         band width cannot dilute it. 16.0 is solved against a 200-seed
         measurement rather than derived. */
      { kind:'blobs', sub:'copper', fromTy:26, toTy:56, dens:16.0, r:[1.6, 3.4], line:true },
      /* Granite is the bulk gravel source and is tier 1, so a kiln is
         reachable from the surface band alone. */
      { kind:'blobs', sub:'granite', fromTy:30, toTy:56, dens:9.0, r:[1.4, 3.0], line:true },
      { kind:'blobs', sub:'coal',   fromTy:36, toTy:56, dens:7.0, r:[1.4, 3.0], line:true },
      /* A taste of iron in the lowest surface rows; the bodies are in the
         topsoil. */
      { kind:'blobs', sub:'iron',   fromTy:46, toTy:56, dens:6.0, r:[1.4, 2.8], line:true },
      /* The guaranteed first vein. `near:'spawn'` is resolved by worldgen,
         not here. `r:2.4, n:1` is one 6-cell star topping out at row 25,
         which is 1,440 copper units at copper's charge of 240. */
      { kind:'vein',  sub:'copper', near:'spawn', dy:6, r:2.4, n:1 }
    ],
    look:{ sky:'skyLo', tint:'soilA', ambient:0.95 } },

  /* Same tile size and width as the surface, so a shaft continues cleanly
     across the seam. */
  { id:'topsoil', name:'THE TOPSOIL',
    tw:1024, th:320, tile:8, chunk:16,
    origin:{ x:0, y:768 },
    floorTy:0,
    fields:['heat'],
    strata:[
      /* No `relief` row: row 0 is buried under the surface band's rock. */
      { kind:'layer', sub:'stone',  fromTy:0,  toTy:320 },
      /* `bias` below 1 skews the centre draw toward `toTy`, so 0.85 makes
         the deepest rows about 1.7x as dense as row 20. `fromTy:4` is the
         seam margin; `rules/generate.js` keeps hollows off the top rows. */
      { kind:'hollows', fromTy:4, toTy:320, dens:44.5, r:[1.6, 3.8], steps:[2, 4], bias:0.85 },
      /* `line:true` opts a row into hollow-wall lining, and the deepest such
         row whose window holds a hollow claims it. Lining is opted in by the
         flag and not by `dens`, so a row lines at any density. */
      { kind:'blobs', sub:'copper',  fromTy:4,  toTy:180, dens:15.1, r:[1.6, 3.8], line:true },
      { kind:'blobs', sub:'coal',    fromTy:4,  toTy:320, dens:11.0, r:[1.6, 3.8], line:true },
      { kind:'blobs', sub:'iron',    fromTy:10, toTy:320, dens:12.0, r:[1.6, 3.8], line:true },
      { kind:'blobs', sub:'granite', fromTy:4,  toTy:320, dens:8.0,  r:[1.4, 3.0], line:true },
      { kind:'blobs', sub:'adamant', fromTy:220, toTy:320, dens:11.72, r:[1.2, 2.4], line:true }
    ],
    look:{ sky:'abyB', tint:'irD', ambient:0.6 } }
];

export const BAND = Object.freeze(Object.fromEntries(
  BANDS.map(b => [b.id, Object.freeze(b)])));

/* Declaration order is top-to-bottom and is the order `model/world.js`
   allocates in, so a band's ord is its depth rank. */
export const BAND_IDS = Object.freeze(BANDS.map(b => b.id));

/* The band the player starts in. Exactly one row may carry `spawn:true`;
   the resolver catches none or several. */
export const SPAWN_BAND = BANDS.find(b => b.spawn)?.id ?? BAND_IDS[0];

/* Every field name any band declares, for the resolver and for `model/fields.js`. */
export const FIELDS = Object.freeze([...new Set(BANDS.flatMap(b => b.fields))]);

/* Every strata `kind` in use, so a generator can assert it handles each. */
export const STRATA_KINDS = Object.freeze(
  [...new Set(BANDS.flatMap(b => b.strata.map(s => s.kind)))]);
