/* LAYER data — BANDS: one row per depth band.

   Today's defect, named in the brief: `WORLD_TW`/`WORLD_TH` are module
   constants and the typed arrays are allocated at import, so world size is
   fixed before `newRun()` gets a say. Here a band is a row, `model/world.js`
   allocates from it at run time, and every band-shaped number is in this file.

   More than one band may be resident at once: `model/world.js` keeps an array
   and every tile query takes the band as its first argument. That is a
   deliberate deviation from RFC 04, which allocated into a mutated singleton —
   the review found that blocks DESIGN item 18 (Tartarus below Hades, reached by
   descending) because two bands can never coexist. `origin` is the world-space
   tile offset that lets them stack vertically.

     fields   the named scalar fields this band allocates. See `model/fields.js`.
              A band with no `heat` row simply has no heat: a machine emitting
              into a field the band does not have is a build error, not a
              silent no-op — `tools/resolve.mjs` checks it. */

export const BANDS = [
  { id:'surface', name:'THE SUN\'S FLOOR',
    tw:128, th:384, tile:8, chunk:16,
    origin:{ tx:0, ty:0 },
    surfaceTy:26, spawnTx:42,
    fields:['heat'] },

  /* A second, differently-sized band. This row is the whole of the brief's
     "seam that makes a second depth band possible". */
  { id:'aquifer', name:'THE DROWNED WORKS',
    tw:192, th:512, tile:8, chunk:16,
    origin:{ tx:0, ty:384 },
    surfaceTy:0, spawnTx:96,
    fields:['heat', 'water'] }
];

export const BAND = Object.freeze(Object.fromEntries(
  BANDS.map(b => [b.id, Object.freeze(b)])));

/* Every field name any band declares, for the resolver. */
export const FIELDS = Object.freeze([...new Set(BANDS.flatMap(b => b.fields))]);
