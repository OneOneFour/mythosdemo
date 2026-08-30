/* LAYER view — the frame. Composes the passes and owns the chunk cache.

   `view` imports `data` and `model` queries only. It cannot import `rules` (the
   sibling rule) and it cannot import a `write` namespace (`tools/layers.mjs`
   refuses an import clause naming `write`), so `render()` is side-effect-free by
   construction — and `tools/epoch.mjs` proves it by asserting `meta.epoch` does
   not move across a render.

   Today `render/scene.js` and `render/hud.js` import each other. That cycle is
   why `tools/layers.mjs` walks the edge list for cycles as well as for
   direction: this file imports `hud.js` and `hud.js` imports nothing in `view`. */

import { FIELDS } from '../data/world.js';
import { bands } from '../model/world.js';
import { items } from '../model/items.js';
import { machines } from '../model/machines.js';
import { player } from '../model/player.js';
import { aim } from '../model/aim.js';
import { MACH } from '../data/machines.js';
import { COL } from '../data/palette.js';
import { R } from '../core/pixels.js';
import { paintItem, paintTile } from './paint.js';
import { drawField } from './overlays.js';
import { drawHUD, drawMachinePips } from './hud.js';

/* The chunk cache's bookkeeping: for each chunk, the `b.ver` value at the last
   repaint. `view` cannot clear a dirty flag in `model`, so it remembers instead.

   STUBBED LEAF: the offscreen canvases themselves, the repaint budget and the
   LRU cap. All three belong here rather than in `model`, because `model` may not
   know rendering exists. What is real is the invalidation: `stale()` is the
   whole decision, and it is side-effect-free with respect to the model. */
const painted = new Map();

const stale = (b, c) => painted.get(b.ord * 0x10000 + c) !== b.ver[c];
const markPainted = (b, c) => painted.set(b.ord * 0x10000 + c, b.ver[c]);

export function render(g, cam, W, H) {
  const b = player.band ?? bands[0];
  if (!b) return;

  R(g, 0, 0, W, H, COL.uiBack);
  paintVisibleTiles(g, b, cam, W, H);
  for (const name of FIELDS) drawField(g, b, name, cam, W, H);

  for (const m of machines) {
    const def = MACH[m.def];
    R(g, m.box.x - cam.x, m.box.y - cam.y, m.box.w, m.box.h, COL[def.look.body]);
    if (m.deck) R(g, m.box.x - cam.x, m.deck.y - cam.y, m.box.w, 2, COL[def.look.trim]);
    drawMachinePips(g, m);
  }

  for (const it of items)
    paintItem(g, it, (it.x | 0) - cam.x, (it.y | 0) - cam.y);

  if (aim.valid)
    R(g, aim.tx * b.tile - cam.x, aim.ty * b.tile - cam.y, b.tile, 1, COL.ui);

  drawHUD(g, W, H);
}

function paintVisibleTiles(g, b, cam, W, H) {
  const t = b.tile, k = b.chunk;
  const c0x = Math.max(0, (cam.x / t / k) | 0), c1x = Math.min(b.cx - 1, ((cam.x + W) / t / k) | 0);
  const c0y = Math.max(0, (cam.y / t / k) | 0), c1y = Math.min(b.cy - 1, ((cam.y + H) / t / k) | 0);

  for (let cy = c0y; cy <= c1y; cy++)
    for (let cx = c0x; cx <= c1x; cx++) {
      const c = cy * b.cx + cx;
      if (!stale(b, c)) continue;          // STUB: blit the cached canvas here
      for (let ty = cy * k; ty < Math.min(b.th, (cy + 1) * k); ty++)
        for (let tx = cx * k; tx < Math.min(b.tw, (cx + 1) * k); tx++)
          paintTile(g, b, tx, ty, tx * t - cam.x, ty * t - cam.y);
      markPainted(b, c);
    }
}
