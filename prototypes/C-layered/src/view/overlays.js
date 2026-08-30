/* LAYER view — field overlays, drawn per frame over the cached chunk blit.

   Fields do NOT go through the chunk cache. Those canvases exist to avoid
   repainting static rock; a heat plume changes every frame and would thrash
   them. So this is a viewport-culled pass that reads `fieldAt` and draws
   nothing else. It is also where fog of war goes (DESIGN item 22) and where the
   suspicion tint goes (item 17), for the same reason: both change often and
   neither is rock. */

import { COL } from '../data/palette.js';
import { R } from '../core/pixels.js';
import { fieldAt, hasField } from '../model/fields.js';

const TINT = { heat: COL.hot, water: COL.snA };

export function drawField(g, b, name, cam, W, H) {
  if (!hasField(b, name)) return;
  const t = b.tile;
  const x0 = Math.max(0, (cam.x / t) | 0), x1 = Math.min(b.tw, ((cam.x + W) / t | 0) + 1);
  const y0 = Math.max(0, (cam.y / t) | 0), y1 = Math.min(b.th, ((cam.y + H) / t | 0) + 1);
  for (let ty = y0; ty < y1; ty++)
    for (let tx = x0; tx < x1; tx++) {
      const v = fieldAt(b, name, tx, ty);
      if (v < 0.5) continue;
      g.globalAlpha = Math.min(0.5, v / 120);
      R(g, tx * t - cam.x, ty * t - cam.y, t, t, TINT[name]);
      g.globalAlpha = 1;
    }
}
