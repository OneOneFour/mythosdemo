/* LAYER rules — mining. WHERE THIS LIVES AND WHY.

   Progress storage is `model/mining.js`; the rule that decides a tile has
   broken is here. Today both sit inside the tile-storage module, which is what
   put mining progress under pressure to be a byte in the material array.

   The defensible placement rule this design uses throughout:
     - `model` owns the number and the query.
     - `rules` owns the decision and the consequence.
   Storage has the lifetime of the world; the decision has the lifetime of a
   frame. Mining is a per-frame decision, so it is a `rules` module and it is a
   sibling of every other `rules` module: it imports none of them, and the order
   it runs in is stated once in `shell/schedule.js`. */

import { S, SUB } from '../data/substances.js';
import { rand } from '../core/rng.js';
import { eff } from '../model/mods.js';
import { aim, write as aw } from '../model/aim.js';
import { player, playerCentre } from '../model/player.js';
import { hardAt, rowAt, tileAt, write as tw } from '../model/tiles.js';
import { inBounds } from '../model/world.js';
import { write as digw } from '../model/mining.js';
import { write as iw } from '../model/items.js';
import { push } from '../model/journal.js';

export function aimAt(worldX, worldY) {
  const b = player.band;
  if (!b) return;
  const c = playerCentre();
  const reach = eff('reach');
  let dx = worldX - c.x, dy = worldY - c.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d > reach) { dx = dx / d * reach; dy = dy / d * reach; }
  const tx = Math.floor((c.x + dx) / b.tile), ty = Math.floor((c.y + dy) / b.tile);
  aw.set(tx, ty, inBounds(b, tx, ty));
}

export function step(dt, cmd) {
  const b = player.band;
  if (!b || !cmd.dig || !aim.valid) return;

  const sub = tileAt(b, aim.tx, aim.ty);
  if (sub === S.air) return;

  /* Both numbers pass through the tunable store, so a trinket can make the pick
     stronger (`pickPower`) or one material softer (`hard.tin`), and neither is
     a module constant anybody can read around. */
  const hard = hardAt(b, aim.tx, aim.ty) * eff('hard', SUB[sub].id);
  if (!(hard > 0) || !Number.isFinite(hard)) return;        // air, bedrock

  const work = digw.add(b, aim.tx, aim.ty, dt * eff('pickPower'));
  push('dig', { x: aim.tx * b.tile, y: aim.ty * b.tile }, { sub: SUB[sub].id });

  if (work < hard) return;

  /* broken. The drop is a substance id on the row, not a lookup table. */
  const drop = rowAt(b, aim.tx, aim.ty).tile.drop;
  digw.clear(b, aim.tx, aim.ty);
  tw.set(b, aim.tx, aim.ty, S.air);
  push('break', { x: aim.tx * b.tile, y: aim.ty * b.tile }, { sub: SUB[sub].id });
  if (drop)
    iw.spawnAt(b, aim.tx * b.tile + b.tile / 2, aim.ty * b.tile + b.tile / 2,
               S[drop], 0, -30 - rand() * 20);
}
