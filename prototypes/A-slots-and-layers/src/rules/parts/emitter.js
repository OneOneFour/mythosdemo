/* Emitter — provides `emit`, needs `footprint`.
   Output leaves as a falling item, never as an inventory credit, so the
   player must catch it or route it. */

import { write as iw } from '../../model/items.js';
import { rand } from '../../core/rng.js';

const MOUTH = {
  top:    f => ({ x: f.x + f.w / 2, y: f.y - 4 }),
  bottom: f => ({ x: f.x + f.w / 2, y: f.y + f.h + 2 }),
  left:   f => ({ x: f.x - 3, y: f.y + f.h / 2 }),
  right:  f => ({ x: f.x + f.w + 3, y: f.y + f.h / 2 })
};

export function emitter(rec, need, host, ctx) {
  void ctx;
  if (!rec.queue.length) return;
  const m = MOUTH[rec.at](need.footprint);
  while (rec.queue.length) {
    const q = rec.queue.shift();
    for (let k = 0; k < q.n; k++)
      iw.spawn(m.x, m.y, q.sub, rec.vx + (rand() - 0.5) * 20, rec.vy);
  }
  host.look.emit = 0.25;
}
