/* LAYER model — dropped material: storage, spatial index, queries.

   Array of plain objects with eight fixed slots, so the shape stays
   monomorphic; `mod` stays null until one item deviates from its row. Anything
   shared — mass, size, appearance — is read from the substance row and costs
   nothing per item.

     massOf(it)   it.mod?.mass ?? SUB[it.sub].item.mass

   Adding a per-item property is a row field plus an accessor, and the container
   shape never changes. Not struct-of-arrays: at 400 items "add a property"
   would mean "add an array", and the accessors mean `model` can switch later
   with no `rules` edit. */

import { SUB } from '../data/substances.js';
import { rect } from '../core/math.js';
import { bump } from './epoch.js';
import { clearGrid, insert, makeGrid, query } from './space.js';

export const items = [];
const grid = makeGrid();

export const massOf = it => it.mod?.mass ?? SUB[it.sub].item.mass;
export const sizeOf = it => it.mod?.size ?? SUB[it.sub].item.size;
export const tempOf = it => it.mod?.temp ?? 0;

export const write = {
  spawnAt(band, x, y, sub, vx = 0, vy = -40) {
    if (!SUB[sub]?.item) return null;         // a substance with no item block
    const it = { band, x, y, vx, vy, sub, rest: 0, age: 0, mod: null };
    items.push(it);
    bump();
    return it;
  },

  remove(it) {
    const i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
    bump();
  },

  /* called once per step by `rules/items.js`, after integration */
  reindex() {
    clearGrid(grid);
    for (let i = 0; i < items.length; i++) insert(grid, i, items[i].x, items[i].y);
    bump();
  },

  clear() { items.length = 0; clearGrid(grid); bump(); }
};

/* Items overlapping a rect, as records. The catch box and the pickup radius are
   both this call. */
export function itemsIn(r) {
  const out = [];
  query(grid, r, i => { if (items[i]) out.push(items[i]); });
  return out;
}

export const itemsNear = (x, y, slack) => itemsIn(rect(x - slack, y - slack, slack * 2, slack * 2));
