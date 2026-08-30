import { TREAT } from './treatments.js';
import { TILE } from '../world/tiles.js';

const EMPTY = {};

/* ============================================================
   CHUNKS — the only tile paint loop in the codebase. No material name
   appears in this file and no `if` decides appearance.

   Compare src/world/paint.js today: it is one function per concern with a
   string comparison against 'copper' in the middle of it. Here appearance is
   a LIST OF TREATMENTS on the substance row, walked in order, and the
   painter's only job is the walk.
   ============================================================ */
export function paintChunk(g, world, cx, cy) {
  const t = world.tiles;
  const x0 = cx * t.chunk, y0 = cy * t.chunk;

  for (let j = 0; j < t.chunk; j++)
    for (let i = 0; i < t.chunk; i++) {
      const tx = x0 + i, ty = y0 + j;
      const sub = t.rowAt(tx, ty);
      if (!sub.paint.length) continue;
      const px = i * TILE, py = j * TILE;
      for (const [name, params] of sub.paint) {
        const fn = TREAT[name];
        /* Fails at paint time naming the treatment and the material, which
           is as near the edit as a data-driven painter can get. */
        if (!fn) throw new Error(sub.name + ': no such paint treatment ' + name);
        fn(g, px, py, tx, ty, sub.col, params || EMPTY, world);
      }
    }
  t.dirty[cy * t.chunksX + cx] = 0;
}

/* STUB (leaf): the chunk canvas cache, its per-frame repaint budget and LRU
   eviction. Out of scope per the brief; the queue is where they go. */
export function paintDirty(g, world, budget = 3) {
  const t = world.tiles;
  let n = 0;
  for (let cy = 0; cy < t.chunksY && n < budget; cy++)
    for (let cx = 0; cx < t.chunksX && n < budget; cx++)
      if (t.dirty[cy * t.chunksX + cx]) { paintChunk(g, world, cx, cy); n++; }
}
