/* LAYER shell — the order the rules run in. Imports `model` and every `rules`
   module.

   `rules` modules may not import each other, so STEPS below IS the simulation:
   reordering the game is reordering that array. The argument behind each pair
   is in `.claude/brain/rules-order.md`.

   aim      -> player    the reticle resolves against where the player IS
   player   -> mining    reach is measured from this frame's position
   mining   -> light     a tile broken now opens a light path now
   light    -> reveal    the fog flood gates on this frame's `lightAt()`
   reveal   -> items     no constraint; `items` needs only to follow `mining`
   items    -> belts     a belt drags what just landed
   belts    -> crafting  unrelated ledgers, kept adjacent to `items`
   crafting -> trinkets  pocket material spent now reaches the sync now
   trinkets -> boons     unrelated ledgers, both modifier syncs together
   boons    -> machines  a rate modifier turned on now applies to this tick
   machines -> drive     a hub's buffer settles before the drivetrain solves
   drive    -> cycles    a delivery is credited the frame it arrives
   cycles   -> grants    the director writes `run.awarded`, `grants` performs it
   grants   -> tutorial  no constraint; placed so it cannot split the pair below
   tutorial -> growth    `tutorial` observes settled facts, `fields` stays last
   growth   -> fields    keeps `fields last` literally true
   fields last           emissions decay from NEXT frame, so a gate sees this
                         frame's heat

   `clock` is first and is not a rule: `run.t` is a number, not a decision.
   NOTHING MAY BE APPENDED AFTER `fields` without re-arguing the tail. */

import { write as rw } from '../model/run.js';
import * as belts from '../rules/belts.js';
import * as boons from '../rules/boons.js';
import * as crafting from '../rules/crafting.js';
import * as cycles from '../rules/cycles.js';
import * as drive from '../rules/drive.js';
import * as fields from '../rules/fields.js';
import * as grants from '../rules/grants.js';
import * as growth from '../rules/growth.js';
import * as items from '../rules/items.js';
import * as light from '../rules/light.js';
import * as machines from '../rules/machines.js';
import * as mining from '../rules/mining.js';
import * as miracles from '../rules/miracles.js';
import * as player from '../rules/player.js';
import * as reveal from '../rules/reveal.js';
import * as trinkets from '../rules/trinkets.js';
import * as tutorial from '../rules/tutorial.js';

export const STEPS = [
  { id: 'clock',    step: (dt) => rw.tick(dt) },
  { id: 'aim',      step: (dt, cmd) => aim(cmd) },
  { id: 'player',   step: (dt, cmd) => player.step(dt, cmd) },
  { id: 'mining',   step: (dt, cmd) => mining.step(dt, cmd) },
  { id: 'light',    step: (dt) => light.step(dt) },
  { id: 'reveal',   step: () => reveal.step() },
  { id: 'items',    step: (dt, cmd) => items.step(dt, cmd) },
  { id: 'belts',    step: (dt) => belts.step(dt) },
  { id: 'crafting', step: (dt, cmd) => crafting.step(dt, cmd) },
  { id: 'trinkets', step: () => trinkets.step() },
  { id: 'boons',    step: (dt) => boons.step(dt) },
  { id: 'machines', step: (dt, cmd) => machines.step(dt, cmd) },
  { id: 'drive',    step: (dt, cmd) => drive.step(dt, cmd) },
  { id: 'cycles',   step: (dt) => cycles.step(dt) },
  { id: 'grants',   step: () => grants.step() },
  { id: 'tutorial', step: () => tutorial.step() },
  { id: 'growth',   step: (dt) => growth.step(dt) },
  { id: 'fields',   step: (dt) => fields.step(dt) }
];

/* Mouse aim when there is a mouse, keyboard fallback otherwise. Which device it
   is belongs in `shell`, so `rules/mining` exposes both entry points. */
function aim(cmd) {
  if (cmd.hasMouse) mining.aimAtWorld(cmd.mx, cmd.my);
  else mining.aimAtKeys(cmd);
}

export function stepAll(dt, cmd) {
  for (const s of STEPS) s.step(dt, cmd);
}

/* One import for the rules `shell` calls OUTSIDE the per-frame order. Granting,
   drafting and using a miracle are events, not steps. */
export { boons, grants, miracles, trinkets };
