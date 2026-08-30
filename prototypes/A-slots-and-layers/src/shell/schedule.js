/* ============================================================
   THE ORDER OF THE WORLD, in one place.

   `rules` modules may not import each other, so the only thing that knows
   what runs before what is this list. Reordering the sim is editing an array,
   and a determinism bug from a changed order is a one-line diff rather than an
   archaeology exercise across eight files.

   Fixed timestep: rules never see a variable dt.
   ============================================================ */

import * as mining from '../rules/mining.js';
import * as player from '../rules/player.js';
import * as items from '../rules/items.js';
import * as machines from '../rules/machines.js';
import * as fields from '../rules/fields.js';

export const FIXED = 1 / 120;

export const ORDER = [
  ['player',   player.step],      // intent -> position
  ['mining',   mining.step],      // position -> tiles broken, items spawned
  ['items',    items.step],       // items fall, land, are collected
  ['machines', machines.step],    // machines catch, feed, burn, produce, lift
  ['fields',   fields.step]       // heat/water settle after everything moved
];

export function stepFixed(acc) {
  let a = Math.min(0.25, acc);
  while (a >= FIXED) {
    for (const [, fn] of ORDER) fn(FIXED);
    a -= FIXED;
  }
  return a;
}
