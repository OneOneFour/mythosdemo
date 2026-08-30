/* ============================================================
   HeatEmit — needs `footprint`, `heat`. Provides nothing.

   The field seam, from the emitting side. A machine that is hot warms the
   world; it does not know a field exists beyond the name in its data row,
   and the field does not know what warmed it.

   With rules/parts/recipe.js's `field:` gate this closes DESIGN items 5 and
   11 without diffusion existing yet: deep smelting bakes the mid-level
   distillery, and Dionysus's vats want a band the smelters ruin.
   ============================================================ */

import { write as fw } from '../../model/fields.js';

export function heatemit(rec, need, host, ctx) {
  void host;
  if (!need.heat.hot) return;
  const fp = need.footprint;
  /* One cell at the top-centre of the footprint. Buoyancy and spread are the
     solver's job (rules/fields.js), not the emitter's. */
  fw.add(ctx.band, rec.field, fp.tx + (fp.tw >> 1), fp.ty, rec.rate * need.heat.level * ctx.dt);
}
