/* ============================================================
   THE FIELD SOLVER.

   STUB, deliberately and by instruction: diffusion is out of scope for this
   skeleton. What is real is the shape of the seam — the solver walks only the
   active set, so an idle band costs nothing, and it is a `rules` module with
   no state of its own, so a second field (water, noise, ichor) is a row in
   data/bands.js and not a new subsystem.

   When it is written, DESIGN item 5 says heat cells push UPWARD and diffuse,
   and item 6 says water fills from the bottom; both are the same walk with
   an opposite bias, which is why the bias belongs on the field's row rather
   than in this file.
   ============================================================ */

import { cur } from '../model/world.js';
import { active } from '../model/fields.js';

export function step(dt) {
  void dt;
  const b = cur.band;
  if (!b) return;
  for (const name of b.fieldNames) {
    const f = active(b, name);
    if (!f || f.len === 0) continue;
    /* for each active cell: exchange with the 4-neighbourhood biased by the
       field's buoyancy, deactivate below epsilon, wake changed neighbours. */
  }
}
