import { TILE, setTile, solidAt, tileAt } from '../world/grid.js';
import { AIR } from '../world/tiles.js';
import { chips, items, run, toast } from './state.js';
import { KIND, spawnItem, spend } from './items.js';
import { PH, PW, player } from './player.js';


/* ============================================================
   STRUCTURES

   Only the crude furnace exists in the prototype. It is placed as
   an object rather than as tiles, because the point of it is the
   catch box: material that falls in is consumed for free, so
   placing it under a vein is strictly better than placing it on
   the surface. That is the whole game in one machine.
   ============================================================ */
export const structures = [];

export const FURNACE = {
  kind: 'furnace', tw: 3, th: 2,
  recipe: { copper: 2, timber: 1 }, out: 'ingot', secs: 4.0
};

export function placeFurnace(tx, ty) {
  // needs a clear 3x2 footprint standing on solid ground
  for (let j = 0; j < FURNACE.th; j++)
    for (let i = 0; i < FURNACE.tw; i++)
      if (tileAt(tx + i, ty + j) !== AIR) { toast('NEEDS CLEAR SPACE'); return false; }
  let footing = 0;
  for (let i = 0; i < FURNACE.tw; i++) if (solidAt(tx + i, ty + FURNACE.th)) footing++;
  if (footing < 2) { toast('THE FURNACE NEEDS A FLOOR'); return false; }

  structures.push({
    ...FURNACE, tx, ty,
    x: tx * TILE, y: ty * TILE,
    w: FURNACE.tw * TILE, h: FURNACE.th * TILE,
    buf: { copper: 0, timber: 0 }, prog: 0, fire: 0, made: 0
  });
  toast('FURNACE PLACED — FEED IT ORE AND TIMBER');
  return true;
}

export function updateStructures(dt) {
  for (const s of structures) {
    s.fire = Math.max(0, s.fire - dt * 0.7);

    /* --- catch box: anything falling through the mouth is swallowed --- */
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind !== 'copper' && it.kind !== 'timber') continue;
      if (it.x < s.x || it.x > s.x + s.w || it.y < s.y - 2 || it.y > s.y + s.h) continue;
      s.buf[it.kind]++;
      for (let k = 0; k < 4; k++)
        chips.push({ x: it.x, y: it.y, vx: (Math.random() - 0.5) * 24,
                     vy: -30 - Math.random() * 20, g: 260,
                     life: 0.3, col: KIND[it.kind].col });
      items.splice(i, 1);
      s.fire = 1;
    }

    /* --- hand-feeding: stand next to it and it draws from your pockets --- */
    const near = player.x + PW > s.x - 10 && player.x < s.x + s.w + 10
              && player.y + PH > s.y - 4  && player.y < s.y + s.h + 8;
    if (near) {
      if (s.buf.copper < 4 && run.inv.copper > 0 && spend('copper', 1)) s.buf.copper++;
      if (s.buf.timber < 2 && run.inv.timber > 0 && spend('timber', 1)) s.buf.timber++;
    }

    /* --- smelt --- */
    const has = s.buf.copper >= s.recipe.copper && s.buf.timber >= s.recipe.timber;
    if (!has) { s.prog = 0; continue; }
    s.prog += dt;
    s.fire = Math.max(s.fire, 0.6);
    if (s.prog >= s.secs) {
      s.prog = 0;
      s.buf.copper -= s.recipe.copper;
      s.buf.timber -= s.recipe.timber;
      s.made++;
      // the ingot pops out of the mouth and falls, like everything else
      spawnItem(s.x + s.w / 2, s.y - 4, s.out, (Math.random() - 0.5) * 20, -70);
      for (let k = 0; k < 10; k++)
        chips.push({ x: s.x + s.w / 2, y: s.y, vx: (Math.random() - 0.5) * 70,
                     vy: -50 - Math.random() * 50, g: 300,
                     life: 0.4 + Math.random() * 0.4, col: '#ffd469' });
    }
  }
}

export function resetStructures() { structures.length = 0; }
