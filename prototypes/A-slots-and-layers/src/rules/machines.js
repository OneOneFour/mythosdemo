/* ============================================================
   THE MACHINE DRIVER — the only code that ticks a machine.

   It contains no machine name, no substance name and no number. It walks
   host.wired (built once at assembly, in slot-dependency order) and calls one
   free function per part with the slot records that part declared.

   This file is also the single binding point between the parts VOCABULARY
   (data/parts.js) and the parts BEHAVIOUR (rules/parts/*.js). It is the only
   file in `rules` that imports rules/parts, which is why the layer rule can
   say "rules modules may not import each other" and still be true: the leaves
   under rules/parts/ are a sub-layer below the drivers, may not import each
   other, and are dispatched from a table rather than by reference.
   ============================================================ */

import { PARTS } from '../data/parts.js';
import { machines } from '../model/machines.js';
import { cur } from '../model/world.js';

import { footprint } from './parts/footprint.js';
import { buffer } from './parts/buffer.js';
import { catchbox } from './parts/catchbox.js';
import { handfeed } from './parts/handfeed.js';
import { recipe } from './parts/recipe.js';
import { emitter } from './parts/emitter.js';
import { burner } from './parts/burner.js';
import { bloodburner } from './parts/bloodburner.js';
import { hotservo } from './parts/hotservo.js';
import { heatemit } from './parts/heatemit.js';
import { deck } from './parts/deck.js';

/* The table. One line per row in data/parts.js. */
export const PART_FN = {
  Footprint:   footprint,
  Buffer:      buffer,
  CatchBox:    catchbox,
  HandFeed:    handfeed,
  Recipe:      recipe,
  Emitter:     emitter,
  Burner:      burner,
  BloodBurner: bloodburner,
  HotServo:    hotservo,
  HeatEmit:    heatemit,
  Deck:        deck
};

/* Completeness, both directions, at import. Declaring a part without writing
   it — or writing one without declaring it — fails before the first frame.
   tools/layers.mjs makes the same assertion statically, so it also fails
   before the first import. */
for (const name of Object.keys(PARTS))
  if (typeof PART_FN[name] !== 'function')
    throw new Error(`data/parts.js declares '${name}' with no function in the PART_FN table`);
for (const name of Object.keys(PART_FN))
  if (!PARTS[name])
    throw new Error(`rules/machines.js binds '${name}' which data/parts.js does not declare`);

export function step(dt) {
  const ctx = { dt, band: cur.band };
  for (const host of machines) {
    host.look.busy = host.look.busy ?? 0;
    for (const w of host.wired) PART_FN[w.part](w.rec, w.need, host, ctx);
  }
}
