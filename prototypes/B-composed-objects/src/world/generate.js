import { hash2 } from '../core/rng.js';

/* ============================================================
   GENERATORS — a registry, keyed by the `gen` field of a data/bands.js row.
   Worldgen is out of scope per the brief, so this is a STUB: it lays flat
   strata and scatters the band's declared veins.

   It is here rather than omitted because it is the only thing that proves
   band config is actually consumed: a band declares `veins: ['copper','tin']`
   and the deep band's tin appears without this function naming tin.

   Pure over (world, seed) and reads hash2, never rand(), so a band is
   reproducible from its seed independently of when it was generated.
   ============================================================ */
export const GENERATORS = {
  strata(world, seed) {
    const { tw, th } = world.tiles;
    for (let ty = 0; ty < th; ty++)
      for (let tx = 0; tx < tw; tx++) {
        const deep = ty / th;
        world.tiles.set(tx, ty, ty < 4 ? 'air' : deep > 0.96 ? 'bedrock' : 'lime');
      }
    for (const sub of world.cfg.veins || [])
      for (let ty = 8; ty < th - 8; ty++)
        for (let tx = 0; tx < tw; tx++)
          if (hash2(tx + seed, ty * 3) > 0.985) world.tiles.set(tx, ty, sub);
  }
};
