/* LAYER data — BANDS: one row per depth band, top to bottom. Frozen.
   Imports `data` only. May be imported by `data`, `model`, `rules`, `view`.

   ============================================================================
   THE DEFECT THIS FILE EXISTS TO FIX. In the previous codebase `WORLD_TW` and
   `WORLD_TH` were module constants and the typed arrays were allocated at
   import, so world size was fixed before `newRun()` got a say. That was the
   single biggest structural blocker in the old code, and it is why more than
   one depth band was impossible.

   Here a band is a ROW. `model/world.js` allocates from it at run time, every
   band-shaped number is in this file, and MORE THAN ONE BAND IS RESIDENT AT
   ONCE. Every tile query takes the band record as its first argument. Band
   ordinals are never assumed to be zero: a band is a value passed to a query,
   not an ambient global.
   ============================================================================

   Three bands exist from the start because the game's thesis needs a
   destination. Down is free, up is expensive -- and without somewhere above the
   surface to deliver to, that asymmetry is an assertion rather than a mechanic.

       ASTRAL    minor gods. Reachable, which is what makes them minor.
       SURFACE   spawn.
       TOPSOIL   the first digging band.

     origin    world-space offset in PIXELS, not tiles. Deliberate deviation
               from the reference prototype, which used tiles: a tile offset is
               meaningless between two bands with different `tile` sizes, and
               `tile` is per-band precisely so a band may differ.
     fields    the named scalar fields this band allocates. A band with no
               `heat` row simply has no heat, and a machine emitting into a
               field the band does not have is a BUILD error, not a silent
               no-op -- `tools/resolve.mjs` checks it.
     strata    worldgen instructions, by `kind`. Adding a kind costs engine
               code once; adding a layer or a vein costs one row here.
     look      band-scale appearance. `view/` is the only reader. */

export const BANDS = [

  /* ---- ASTRAL --------------------------------------------------------------
     Narrower than the surface and inset, so it reads as a platform in the sky
     rather than a mirror of the ground. No heat: nothing burns up here, which
     is a content statement made by omitting one array entry. ---- */
  { id:'astral', name:'THE MINOR HEAVENS',
    tw:96, th:40, tile:8, chunk:16,
    origin:{ x:128, y:0 },
    floorTy:30,
    fields:[],
    strata:[
      { kind:'layer', sub:'stone', fromTy:30, toTy:40 }
    ],
    look:{ sky:'skyHi', tint:'marbleA', ambient:1.0 } },

  /* ---- SURFACE -------------------------------------------------------------
     Spawn. `floorTy` is the ground line inside this band; `spawnTx` is the
     column the player starts in. Both are band-local -- nothing in the project
     converts them to a world constant. ---- */
  { id:'surface', name:'THE SUN\'S FLOOR',
    tw:128, th:56, tile:8, chunk:16,
    origin:{ x:0, y:320 },
    floorTy:20, spawnTx:42, spawn:true,
    fields:['heat'],
    strata:[
      /* A shallow soil cap over the stone, so the exposed ground reads as
         dirt-with-grass (`soil`'s `hi` look) rather than bare rock. `lip:false`
         on the stone row is load-bearing: without it, `layer()`'s ragged-edge
         carve treats row 27 as ANOTHER exposed surface and punches random air
         pockets along the soil/stone seam, seven tiles underground where
         nothing should ever look carved. */
      { kind:'layer', sub:'soil',   fromTy:20, toTy:27 },
      { kind:'layer', sub:'stone',  fromTy:27, toTy:56, lip:false },
      /* `toTy` must reach past the layer's `fromTy:20` or a trunk's base scan
         never finds solid ground -- it did not, for any seed, until this was
         22: rows 16-19 are air, so `trees()`'s scan for the first solid tile
         always fell through and every column was skipped. The extra row past
         20 also covers a column whose row 20 happened to be carved by the
         layer's ragged lip. `chance` raised alongside the fix, once trees
         could exist at all, so 12ish logs is not a fistfight between the
         first ladder and the first smelt (`log` is the only fuel). */
      { kind:'trees', sub:'timber', fromTy:16, toTy:22, chance:0.06, height:[3, 5] },
      /* The guaranteed first vein, so the first two minutes cannot fail to
         find copper. `near:'spawn'` is resolved by worldgen, not here. */
      { kind:'blobs', sub:'copper', fromTy:26, toTy:56, count:14, r:[1.6, 3.2] },
      { kind:'vein',  sub:'copper', near:'spawn', dy:8, r:3.1 }
    ],
    look:{ sky:'skyLo', tint:'soilA', ambient:0.95 } },

  /* ---- TOPSOIL -------------------------------------------------------------
     The first digging band, and the deep one. Same tile size and width as the
     surface so a shaft continues cleanly across the seam; that is a content
     choice, not a constraint. ---- */
  { id:'topsoil', name:'THE TOPSOIL',
    tw:128, th:320, tile:8, chunk:16,
    origin:{ x:0, y:768 },
    floorTy:0,
    fields:['heat'],
    strata:[
      { kind:'layer', sub:'stone',  fromTy:0,  toTy:320 },
      { kind:'blobs', sub:'copper', fromTy:4,  toTy:180, count:80, r:[1.6, 3.8] },
      { kind:'blobs', sub:'tin',    fromTy:60, toTy:320, count:60, r:[1.6, 3.8] }
    ],
    look:{ sky:'abyB', tint:'irD', ambient:0.6 } }
];

export const BAND = Object.freeze(Object.fromEntries(
  BANDS.map(b => [b.id, Object.freeze(b)])));

/* Declaration order is top-to-bottom, and it is the order `model/world.js`
   allocates in, so `ord` is depth rank. Nothing assumes ord 0 means anything
   other than "first row in this file". */
export const BAND_IDS = Object.freeze(BANDS.map(b => b.id));

/* The band the player starts in. One row carries `spawn:true`; if none or more
   than one does, that is a content error the resolver catches. */
export const SPAWN_BAND = BANDS.find(b => b.spawn)?.id ?? BAND_IDS[0];

/* Every field name any band declares, for the resolver and for `model/fields.js`. */
export const FIELDS = Object.freeze([...new Set(BANDS.flatMap(b => b.fields))]);

/* Every strata `kind` in use, so a generator can assert it handles all of them
   rather than skipping an unknown row in silence. */
export const STRATA_KINDS = Object.freeze(
  [...new Set(BANDS.flatMap(b => b.strata.map(s => s.kind)))]);
