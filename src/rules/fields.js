/* LAYER rules — THE FIELD STEP. Decay and deactivation, over the active set
   only. Imports `data`, `model`. Imports no other `rules` module.

   ============================================================================
   DIFFUSION IS DELIBERATELY NOT IMPLEMENTED. This is a seam, not a solver.
   What is real: the storage, the active set, the emission path from
   `rules/machines.js`, the recipe gate that reads a value, and the overlay that
   draws one. What is absent is transport.

   The day a solver is wanted, it goes inside the one loop below — a share of
   each cell moved to `i - b.tw` is buoyant heat, a share moved to `i + b.tw` is
   water finding the floor — and nothing else in the project changes shape. That
   is the point of building the seam and not the solver.
   ============================================================================

   It does not touch `b.ver`. Field writes must never invalidate chunk paint:
   those canvases cache static rock, and a heat front would re-cache them every
   frame. Fields draw as a viewport-culled overlay in `view/scene.js`. */

import { FIELDS } from '../data/world.js';
import { activeOf, hasField, valuesOf, write as fw } from '../model/fields.js';
import { eff } from '../model/mods.js';
import { bands } from '../model/world.js';

/* Below this a cell is indistinguishable from cold and leaves the active set.
   Without it the set only ever grows and the "empty world costs nothing"
   property is a lie. */
const EPS = 0.01;

/* Field name -> the tunable that governs its decay. A field with no entry does
   not decay, which is how a permanent field would be declared. Named rather
   than derived so that adding a field to `data/world.js` and forgetting to
   decay it is visible here rather than silent. */
const DECAY = { heat: 'heatDecay' };

export function step(dt) {
  for (const b of bands)
    for (const name of FIELDS) {
      if (!hasField(b, name)) continue;
      const key = DECAY[name];
      if (!key) continue;
      const v = valuesOf(b, name);
      const loss = eff(key) * dt;

      /* Iterating a Set while `deactivate` deletes from it is safe in JS: a
         deleted entry not yet visited is simply not visited. Collecting the
         doomed indices into an array first would allocate every frame. */
      for (const i of activeOf(b, name)) {
        const next = v[i] - loss;
        fw.set(b, name, i, next > 0 ? next : 0);
        if (v[i] < EPS) fw.deactivate(b, name, i);
      }
    }
}
