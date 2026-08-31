/* LAYER shell — THE ORDER THE RULES RUN IN, STATED ONCE.
   Imports `model` (the run clock) and every `rules` module.

   ============================================================================
   `rules` MODULES MAY NOT IMPORT EACH OTHER. The cost of that ban is that
   ordering has to be written down somewhere explicit, and this is the somewhere.
   The benefit is that THIS LIST IS THE SIMULATION: there is no other place a
   step can hide, and reordering the game is reordering this array. In the
   previous codebase the order was an emergent property of the import graph, and
   `sim/mining.js` imported the tutorial to get it.
   ============================================================================

   ORDER MATTERS, AND HERE IS WHY FOR EACH ADJACENT PAIR:

     aim before player     the reticle is resolved against where the player IS,
                           so the tile you were pointing at is the tile you dig.
     player before mining   moving first means reach is measured from this
                           frame's position, not the last one's.
     mining before items    a tile broken this frame drops before anything falls,
                           so the drop gets a full step of gravity immediately.
     items before machines  an item that lands in a mouth is caught THIS frame —
                           the catch box is checked against fresh positions, and
                           `items` is what rebuilt the spatial index.
     items before trinkets  a relic `items` just caught with the pickup radius
                           is already in `run.inv` by the time this runs, so a
                           drafted trinket's modifier starts on the same frame
                           it lands rather than the next one.
     trinkets before machines  a rate modifier a relic just turned on should
                           apply to this same frame's recipe tick, not the next.
     machines before lift   a charge banked this frame turns the drum now, so
                           feeding the winch and it moving are one beat.
     fields last            emissions made this frame decay from NEXT frame, so a
                           recipe gate sees the heat that was just poured in.

   The run clock is ticked first and is not a rule: `run.t` is a number, not a
   decision, and no `rules` module may claim ownership of the frame. */

import { write as rw } from '../model/run.js';
import * as boons from '../rules/boons.js';
import * as fields from '../rules/fields.js';
import * as items from '../rules/items.js';
import * as lift from '../rules/lift.js';
import * as machines from '../rules/machines.js';
import * as mining from '../rules/mining.js';
import * as player from '../rules/player.js';
import * as trinkets from '../rules/trinkets.js';

export const STEPS = [
  { id: 'clock',    step: (dt) => rw.tick(dt) },
  { id: 'aim',      step: (dt, cmd) => aim(cmd) },
  { id: 'player',   step: (dt, cmd) => player.step(dt, cmd) },
  { id: 'mining',   step: (dt, cmd) => mining.step(dt, cmd) },
  { id: 'items',    step: (dt) => items.step(dt) },
  { id: 'trinkets', step: () => trinkets.step() },
  { id: 'machines', step: (dt) => machines.step(dt) },
  { id: 'lift',     step: (dt) => lift.step(dt) },
  { id: 'fields',   step: (dt) => fields.step(dt) }
];

/* Mouse aim when there is a mouse, keyboard fallback otherwise. Which of the two
   is a DEVICE question, which is why it is resolved in `shell` and `rules/mining`
   exposes both entry points rather than guessing. */
function aim(cmd) {
  if (cmd.hasMouse) mining.aimAtWorld(cmd.mx, cmd.my);
  else mining.aimAtKeys(cmd);
}

export function stepAll(dt, cmd) {
  for (const s of STEPS) s.step(dt, cmd);
}

/* Re-exported so `shell/boot.js` has one import for the rules it must call
   OUTSIDE the per-frame order — granting and placement are events, not steps,
   and putting them in the array above would be a lie about when they happen. */
export { boons, trinkets };
