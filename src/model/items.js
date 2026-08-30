/* LAYER model — dropped material: storage, spatial index, queries.
   Imports `core`, `data`, `model`. May be imported by `model`, `rules`, `view`.

   An item is a `{sub, form}` pair plus a mass. That is ALL it is. Purity,
   fragility and temperature are deliberately absent: they are speculative until
   something consumes them, and a field nothing reads is a field that will be
   wrong when something finally does.

   Plain objects with ten fixed slots, so the shape stays monomorphic. `mod`
   stays null until one item deviates from its rows, and anything shared -- mass,
   size, appearance -- is read from the substance and form rows and costs nothing
   per item. Not struct-of-arrays: at four hundred items "add a property" would
   mean "add an array", and the accessors below mean `model` can switch later
   with no `rules` edit.

   `x`/`y` are WORLD pixels; `band` is which band's tiles the item collides
   against. Both, because a falling item may cross a band seam. */

import { rect } from '../core/math.js';
import { FORM, crossable } from '../data/forms.js';
import { SUB } from '../data/substances.js';
import { bump } from './epoch.js';
import { clearGrid, insert, makeGrid, query } from './space.js';

export const items = [];
const grid = makeGrid();

/* ---- the one key for a pair -------------------------------------------------
   Machine buffers and the player's pockets are both keyed by this string. It is
   the one place the slower representation was chosen on purpose: a buffer is the
   thing you read while debugging a stuck factory, and `{ 'copper/ore': 3 }`
   answers the question that `[0,0,3,0]` does not. ---- */
export const keyOf = (sub, form) => `${SUB[sub].id}/${FORM[form].id}`;

export const parseKey = k => {
  const [s, f] = k.split('/');
  return { sub: SUB.findIndex(r => r.id === s), form: FORM.findIndex(r => r.id === f) };
};

export const keyOfItem = it => keyOf(it.sub, it.form);

/* ---- derived properties. Two rows multiplied, never a per-item copy. ---- */
export const massOf = it => it.mod?.mass ?? SUB[it.sub].item.mass * FORM[it.form].massK;
export const sizeOf = it => it.mod?.size ?? FORM[it.form].size;
export const massOfPair = (sub, form) => SUB[sub].item.mass * FORM[form].massK;

/* Can this pair exist as a carried item at all? Two independent conditions:
   the ELEMENT must be carryable (`item` block present), and the CROSSING must be
   legal (`crossable`, i.e. the form's `subTags`). Stone has an item block and
   there is an ingot form, and there is still no such thing as a stone ingot. */
export const holdable = (sub, form) =>
  !!SUB[sub]?.item && !!FORM[form] && crossable(sub, form);

export const write = {
  /* `x`/`y` are world px. Returns the record, or null if the pair cannot be
     held -- a substance with no `item` block can be rock and never cargo. */
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

  /* Called once per step by `rules/items.js`, AFTER integration. The index is
     rebuilt rather than updated because items move every frame anyway. */
  reindex() {
    clearGrid(grid);
    for (let i = 0; i < items.length; i++) insert(grid, i, items[i].x, items[i].y);
    bump();
  },

  clear() { items.length = 0; clearGrid(grid); bump(); }
};

/* Items overlapping a rect, as records. A catch box mouth and a pickup radius
   are both this call. */
export function itemsIn(r) {
  const out = [];
  query(grid, r, i => { if (items[i]) out.push(items[i]); });
  return out;
}

export const itemsNear = (x, y, slack) =>
  itemsIn(rect(x - slack, y - slack, slack * 2, slack * 2));

export const itemsInBand = b => items.filter(it => it.band === b);
