/* LAYER rules — worldgen, driven by the `gen` block on substance rows.

   The structural claim being made here, and it is the one that matters: this
   file iterates rows that HAVE a `gen` block and never names a substance. So an
   ore places itself by existing, and `tin` needed no edit here.

   STUBBED LEAF: the placement itself. `blobs`, `layer` and `trees` each get a
   loop that reads the row's numbers and calls `tw.set`, but the noise function
   is a single `rand()` per candidate rather than anything shaped. Worldgen is
   explicitly out of scope in the brief. */

import { S, SUB } from '../data/substances.js';
import { rand } from '../core/rng.js';
import { write as tw } from '../model/tiles.js';
import { inBounds } from '../model/world.js';

export function generate(band) {
  /* 1. base fill from rows with a `gen.layer` band */
  tw.fill(band, S.air);
  for (const s of SUB) {
    const layer = s.gen?.layer;
    if (!layer) continue;
    for (let ty = layer.fromTy; ty < Math.min(layer.toTy, band.th); ty++)
      for (let tx = 0; tx < band.tw; tx++) tw.set(band, tx, ty, S[s.id]);
  }

  /* 2. ore blobs from rows with `gen.blobs` */
  for (const s of SUB) {
    const g = s.gen?.blobs;
    if (!g) continue;
    for (let n = 0; n < g.count; n++) {
      if (rand() > g.chance) continue;
      const cx = (rand() * band.tw) | 0;
      const cy = g.fromTy + ((rand() * (band.th - g.fromTy)) | 0);
      const r = g.r[0] + rand() * (g.r[1] - g.r[0]);
      blob(band, cx, cy, r, S[s.id]);
    }
  }

  /* 3. `gen.guaranteed` and `gen.trees` — STUBBED. The rows declare them and
        this is where they would be read; surface dressing is out of scope. */
}

function blob(band, cx, cy, r, sub) {
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++)
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const tx = cx + dx, ty = cy + dy;
      if (inBounds(band, tx, ty)) tw.set(band, tx, ty, sub);
    }
}
