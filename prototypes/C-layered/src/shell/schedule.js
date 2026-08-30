/* LAYER shell — the order the rules run in, stated once.

   `rules` modules may not import each other. The cost of that ban is that
   ordering has to be written down somewhere explicit, and this is the somewhere.
   The benefit is that this list IS the simulation: there is no other place a
   step can be hiding, and reordering the game is reordering this array.

   Order matters and here is why, for each pair:
     mining before items   — a tile broken this frame drops before it falls
     items before machines — an item that lands in a mouth is caught this frame
     machines before lift  — a charge banked this frame turns the drum now
     fields last           — emissions made this frame decay from next frame */

import * as mining from '../rules/mining.js';
import * as playerRule from '../rules/player.js';
import * as itemRule from '../rules/items.js';
import * as machineRule from '../rules/machines.js';
import * as liftRule from '../rules/lift.js';
import * as fieldRule from '../rules/fields.js';

export const STEPS = [
  { id: 'player',   step: (dt, cmd) => playerRule.step(dt, cmd) },
  { id: 'mining',   step: (dt, cmd) => mining.step(dt, cmd) },
  { id: 'items',    step: (dt) => itemRule.step(dt) },
  { id: 'machines', step: (dt) => machineRule.step(dt) },
  { id: 'lift',     step: (dt) => liftRule.step(dt) },
  { id: 'fields',   step: (dt) => fieldRule.step(dt) }
];

export function stepAll(dt, cmd) {
  for (const s of STEPS) s.step(dt, cmd);
}
