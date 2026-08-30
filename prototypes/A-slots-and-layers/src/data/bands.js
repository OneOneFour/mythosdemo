/* ============================================================
   DEPTH BANDS — world size is content, not a module constant.

   Today WORLD_TW/WORLD_TH are `export const` at src/world/grid.js:19-20 and
   the arrays are allocated at import, so the world is one fixed size forever
   and DESIGN item 18 (Tartarus, a third act below Hades) has nowhere to go.

   Here a band is a row, allocation happens in model/world.js at runtime, and
   `origin` lets bands STACK vertically so a continuous descent is possible.
   Bands coexist: model/world.js keeps a Map of allocated bands rather than a
   single mutated singleton, which is the one thing the reviewer told the
   RFC-04 commission to settle up front rather than discover in act three.
   ============================================================ */

export const BANDS = [
  { id: 'surface', name: 'THE CLIFF FACE',
    tw: 128, th: 384, tile: 8, chunk: 16,
    origin: 0, surfaceTy: 26, spawnTx: 42,
    fields: ['heat'], gen: 'tutorialBand' },

  { id: 'abyss', name: 'THE ABYSS',
    tw: 192, th: 512, tile: 8, chunk: 16,
    origin: 384, surfaceTy: 0,
    fields: ['heat', 'water'], gen: 'abyssBand' },

  { id: 'tartarus', name: 'TARTARUS',
    tw: 256, th: 512, tile: 8, chunk: 16,
    origin: 896, surfaceTy: 0,
    fields: ['heat', 'ichor'], gen: 'tartarusBand' }
];

export const BAND = Object.freeze(Object.fromEntries(BANDS.map(b => [b.id, b])));
