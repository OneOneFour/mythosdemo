/* model layer — dropped material: storage, spatial index, queries.

   An item is a `{sub, form}` pair plus a position. Plain objects with ten
   fixed slots, so the shape stays monomorphic; `mod` stays null until an item
   deviates from its rows, and mass, size and appearance are read from the
   substance and form rows rather than copied per item.

   `x`/`y` are world px; `band` is which band's tiles the item collides
   against, since a falling item may cross a band seam. */

import { rect } from '../core/math.js';
import { FORM, crossable } from '../data/forms.js';
import { SUB } from '../data/substances.js';
import { bump } from './epoch.js';
import { clearGrid, insert, makeGrid, query } from './space.js';

export const items = [];
const grid = makeGrid();

/* Machine buffers and the player's pockets are both keyed by this string. */
export const keyOf = (sub, form) => `${SUB[sub].id}/${FORM[form].id}`;

export const parseKey = k => {
  const [s, f] = k.split('/');
  return { sub: SUB.findIndex(r => r.id === s), form: FORM.findIndex(r => r.id === f) };
};

export const keyOfItem = it => keyOf(it.sub, it.form);

/* Derived from the substance and form rows, never copied per item. */
export const massOf = it => it.mod?.mass ?? SUB[it.sub].item.mass * FORM[it.form].massK;
export const sizeOf = it => it.mod?.size ?? FORM[it.form].size;
export const massOfPair = (sub, form) => SUB[sub].item.mass * FORM[form].massK;

/* Can this pair exist as a carried item? The element must be carryable (an
   `item` block) and the crossing must be legal (`crossable`, i.e. the form's
   `subTags`) -- stone has an item block and there is no stone ingot. */
export const holdable = (sub, form) =>
  !!SUB[sub]?.item && !!FORM[form] && crossable(sub, form);

export const write = {
  /* `x`/`y` are world px. Returns the record, or null when the pair cannot be
     held. */
  spawn(band, x, y, sub, form, vx = 0, vy = -40) {
    if (!holdable(sub, form)) return null;
    const it = { band, x, y, vx, vy, sub, form, rest: 0, age: 0, mod: null };
    items.push(it);
    bump();
    return it;
  },

  remove(it) {
    const i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
    bump();
  },

  /* Called once per step by `rules/items.js`, after integration. Rebuilt
     rather than updated because items move every frame. */
  reindex() {
    clearGrid(grid);
    for (let i = 0; i < items.length; i++) insert(grid, i, items[i].x, items[i].y);
    bump();
  },

  clear() { items.length = 0; clearGrid(grid); bump(); }
};

/* Closed on all four edges. A resting item's `y` is exact tile arithmetic
   (`worldY(row) - size/2`) and every caller's rect derives from the same grid,
   so an edge landing exactly on an item is the common case, not a tie-break. */
const inRect = (r, x, y) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/* Items whose own position lies in `r`. `space.js#query` visits whole 32 px
   buckets, so the point is re-tested here -- the position and not the 3-4 px
   sprite box, which is what catch-box and carrier margins measure against. */
export function itemsIn(r) {
  const out = [];
  query(grid, r, i => {
    const it = items[i];
    if (it && inRect(r, it.x, it.y)) out.push(it);
  });
  return out;
}

export const itemsNear = (x, y, slack) =>
  itemsIn(rect(x - slack, y - slack, slack * 2, slack * 2));

export const itemsInBand = b => items.filter(it => it.band === b);
