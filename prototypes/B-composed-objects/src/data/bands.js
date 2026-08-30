/* ============================================================
   BANDS — injected world config, and the reason world size is not a module
   constant. Each row is one argument to world/world.js createWorld(cfg).

   Two rows of DIFFERENT SIZE are the requirement: the arrays are allocated
   inside createWorld from cfg, not at import, so a second band with a
   different width is a row here and nothing else. DESIGN item 18 (Tartarus
   below Hades) is a third row -- bands COEXIST, because a world is an
   instance threaded as a parameter rather than a module singleton.

   `originTy` lets bands stack vertically so a continuous descent reads as
   one column of depth to the player.
   ============================================================ */
export const BANDS = {
  shallow: { id: 'shallow', tw: 128, th: 384, chunk: 16, originTy: 0,
             gen: 'strata', fields: ['heat'], veins: ['copper', 'timber'] },

  deep:    { id: 'deep',    tw: 192, th: 512, chunk: 16, originTy: 384,
             gen: 'strata', fields: ['heat'], veins: ['copper', 'tin'] },

  /* Not reachable yet; here to show that the third act is a row. */
  tartarus:{ id: 'tartarus', tw: 256, th: 256, chunk: 16, originTy: 896,
             gen: 'strata', fields: ['heat'], veins: ['tin'] }
};
