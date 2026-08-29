import { P } from '../core/palette.js';
import { TILE, WORLD_H, solidAt } from '../world/grid.js';
import { GRAV, TERMINAL, chips, items, run, toast } from './state.js';
import { PH, PW, player } from './player.js';


/* ============================================================
   DROPPED MATERIAL

   Mined material does not teleport into a backpack. It becomes a
   physical thing that falls, which is how the player learns the
   thesis before any machine exists: dig a shaft and your ore
   collects at the bottom for free.
   ============================================================ */
export const KIND = {
  soil:   { col: P.soil,   col2: '#5e4229', label: 'SOIL',   size: 3 },
  stone:  { col: P.limeB,  col2: P.limeD,   label: 'STONE',  size: 3 },
  copper: { col: P.cuA,    col2: P.cuC,     label: 'COPPER', size: 4 },
  timber: { col: P.woodA,  col2: P.woodC,   label: 'TIMBER', size: 4 },
  ingot:  { col: P.cuA,    col2: P.cuB,     label: 'INGOT',  size: 4, shiny: true }
};

export const PICKUP_R = 12;              // px

export function spawnItem(x, y, kind, vx = 0, vy = -40) {
  if (!KIND[kind]) return;
  items.push({ x, y, vx: vx + (Math.random() - 0.5) * 24, vy,
               kind, rest: 0, age: 0, magnet: 0.35 });
}

export function updateItems(dt) {
  const pcx = player.x + PW / 2, pcy = player.y + PH / 2;

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.age += dt;

    if (it.rest <= 0) {
      it.vy = Math.min(TERMINAL, it.vy + GRAV * dt);
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      const s = KIND[it.kind].size;
      // land on the first solid tile under it
      if (solidAt(Math.floor(it.x / TILE), Math.floor((it.y + s) / TILE))) {
        it.y = Math.floor((it.y + s) / TILE) * TILE - s;
        it.vy = 0; it.vx *= 0.3; it.rest = 1;
        if (Math.abs(it.vx) < 3) it.vx = 0;
      }
      // slide off walls rather than embedding in them
      if (solidAt(Math.floor((it.x + Math.sign(it.vx) * s) / TILE), Math.floor(it.y / TILE))) {
        it.x -= it.vx * dt; it.vx = -it.vx * 0.3;
      }
      if (it.y > WORLD_H) { items.splice(i, 1); continue; }
    } else if (!solidAt(Math.floor(it.x / TILE), Math.floor((it.y + KIND[it.kind].size + 1) / TILE))) {
      it.rest = 0;                          // the ground under it was dug away
    }

    /* pickup: walk over it. A short delay stops freshly-mined material
       jumping straight back into your hands before you see it fall. */
    if (it.age > it.magnet) {
      const dx = it.x - pcx, dy = it.y - pcy;
      if (dx * dx + dy * dy < PICKUP_R * PICKUP_R) {
        collect(it.kind, 1);
        for (let k = 0; k < 3; k++)
          chips.push({ x: it.x, y: it.y, vx: (Math.random() - 0.5) * 30,
                       vy: -20 - Math.random() * 20, g: 200,
                       life: 0.25 + Math.random() * 0.2, col: KIND[it.kind].col });
        items.splice(i, 1);
      }
    }
  }

  if (items.length > 400) items.splice(0, items.length - 400);
}

export function collect(kind, n) {
  run.inv[kind] = (run.inv[kind] || 0) + n;
  if (kind === 'copper' && run.trial && !run.trial.done) {
    run.trial.have = Math.min(run.trial.need, run.inv.copper);
  }
}

export function spend(kind, n) {
  if ((run.inv[kind] || 0) < n) return false;
  run.inv[kind] -= n;
  return true;
}
