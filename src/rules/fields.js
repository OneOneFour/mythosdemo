/* rules layer — decays each field's active cells and drops the cold ones from
   the active set. There is no transport or diffusion solver.

   Never touches `b.ver`: chunk canvases cache static rock, and invalidating
   them on a field write would re-paint every one every frame. Fields draw as
   a viewport-culled overlay in `view/scene.js`. */

import { FIELDS } from '../data/world.js';
import { activeOf, hasField, valuesOf, write as fw } from '../model/fields.js';
import { eff } from '../model/mods.js';
import { bands } from '../model/world.js';

/* Below this a cell counts as cold and leaves the active set, which is the
   only thing that keeps the set from growing monotonically. */
const EPS = 0.01;

/* Field name -> its decay tunable. Names come from `data/world.js#FIELDS`; a
   field with no entry here never decays. */
const DECAY = { heat: 'heatDecay' };

export function step(dt) {
  for (const b of bands)
    for (const name of FIELDS) {
      if (!hasField(b, name)) continue;
      const key = DECAY[name];
      if (!key) continue;
      const v = valuesOf(b, name);
      const loss = eff(key) * dt;

      /* Deleting from a Set mid-iteration is safe: an unvisited deleted entry
         is skipped. Collecting the indices first would allocate every frame. */
      for (const i of activeOf(b, name)) {
        const next = v[i] - loss;
        fw.set(b, name, i, next > 0 ? next : 0);
        if (v[i] < EPS) fw.deactivate(b, name, i);
      }
    }
}
