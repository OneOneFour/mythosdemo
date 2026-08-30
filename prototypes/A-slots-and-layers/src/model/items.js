/* ============================================================
   DROPPED MATERIAL. Array of objects, one hidden class, eight hot slots.

   Shared properties live on the substance row, so `mass` costs nothing per
   item. `mod` stays null until an item deviates (purity, temperature, wear),
   at which point it points at a shared frozen record.
   ============================================================ */

import { SUB } from '../data/substances.js';
import { bump } from './epoch.js';

export const items = [];

export const massOf = it => it.mod?.mass ?? SUB[it.sub].item.mass;
export const sizeOf = it => SUB[it.sub].item.size;

export const write = {
  spawn(x, y, sub, vx = 0, vy = -40) {
    items.push({ x, y, vx, vy, sub, rest: 0, age: 0, mod: null });
    bump();
  },
  remove(it) {
    const i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
    bump();
  },
  reset() { items.length = 0; bump(); }
};
