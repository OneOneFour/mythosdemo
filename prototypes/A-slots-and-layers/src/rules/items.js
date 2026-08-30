/* Falling material. STUB (leaf): the integrator body is the same swept query
   the player uses, which is the point — items tunnel today because they have
   a second, worse copy of it. The pickup radius and the magnet delay are the
   only gameplay here. */

import { cur } from '../model/world.js';
import { isSolid } from '../model/tiles.js';
import { items, sizeOf, write as iw } from '../model/items.js';
import { stat } from '../model/mods.js';
import { player } from '../model/player.js';
import { write as rw } from '../model/run.js';
import { write as jw } from '../model/journal.js';

const PICKUP_R = 12;

export function step(dt) {
  const b = cur.band;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.age += dt;

    if (it.rest <= 0) {
      it.vy = Math.min(stat('terminal'), it.vy + stat('grav') * dt);
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      const s = sizeOf(it);
      if (isSolid(b, (it.x / b.tile) | 0, ((it.y + s) / b.tile) | 0)) {
        it.y = (((it.y + s) / b.tile) | 0) * b.tile - s;
        it.vy = 0; it.vx *= 0.3; it.rest = 1;
      }
    }

    if (it.age > 0.35) {
      const dx = it.x - player.x, dy = it.y - player.y;
      if (dx * dx + dy * dy < PICKUP_R * PICKUP_R) {
        rw.collect(it.sub, 1);
        jw.push('pickup', it.sub, 1);
        iw.remove(it);
      }
    }
  }
}
