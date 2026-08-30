/* LAYER rules — falling material.

   One swept step shared with the player rule via `model/collide.js` would be
   the right call and is NOT built here: `shell/main.js` fixes dt at 1/120 s and
   this integrates in one shot, which is the honest state of the prototype.
   STUBBED LEAF, named as one: the physics body. The structure being evaluated
   is that this file is a sibling `rules` module reading tunables through
   `eff()` and reporting through the journal, and that is complete. */

import { SUB } from '../data/substances.js';
import { eff } from '../model/mods.js';
import { items, sizeOf, write as iw } from '../model/items.js';
import { solidAt } from '../model/tiles.js';
import { playerCentre } from '../model/player.js';
import { write as rw } from '../model/run.js';
import { push } from '../model/journal.js';

export function step(dt) {
  const g = eff('grav'), term = eff('terminal'), magnet = 12;
  const c = playerCentre();

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const b = it.band, t = b.tile, s = sizeOf(it);
    it.age += dt;

    if (it.rest <= 0) {
      it.vy = Math.min(term, it.vy + g * dt);
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (solidAt(b, Math.floor(it.x / t), Math.floor((it.y + s) / t))) {
        it.y = Math.floor((it.y + s) / t) * t - s;
        it.vy = 0; it.vx *= 0.3; it.rest = 1;
      }
    } else if (!solidAt(b, Math.floor(it.x / t), Math.floor((it.y + s + 1) / t))) {
      it.rest = 0;                         // the ground under it was dug away
    }

    if (it.age > 0.35) {
      const dx = it.x - c.x, dy = it.y - c.y;
      if (dx * dx + dy * dy < magnet * magnet) {
        rw.collect(SUB[it.sub].id, 1);
        push('pickup', { x: it.x, y: it.y }, { sub: SUB[it.sub].id });
        iw.remove(it);
      }
    }
  }
  iw.reindex();
}

/* Spoil is worthless to Zeus and is exactly what Hades pays for (DESIGN item
   16), so the tag is on the substance row and this is the only query needed. */
export const isSpoil = it => (SUB[it.sub].tags || []).includes('spoil');
