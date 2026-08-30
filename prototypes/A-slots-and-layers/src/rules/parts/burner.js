/* ============================================================
   Burner — PROVIDES `heat`, needs `buffer`.

   Heat from a consumable substance. Writes exactly the two fields the heat
   slot declares in data/slots.js: {hot, level}. Consumers: the kiln's recipe
   and the winch's deck.

   Compare rules/parts/bloodburner.js. Same slot, same two fields, entirely
   different source. Neither consumer can tell them apart.
   ============================================================ */

import { buf } from '../../model/slots.js';
import { stat } from '../../model/mods.js';
import { write as jw } from '../../model/journal.js';

export function burner(rec, need, host, ctx) {
  const span = rec.secs * stat('burn.span');
  rec.lit = Math.max(0, rec.lit - ctx.dt);

  if (rec.lit <= 0 && buf.take(need.buffer, rec.fuel, 1) >= 0) {
    rec.lit = span;
    jw.push('ignite', host.id, rec.fuel);
  }

  rec.hot = rec.lit > 0;                       // the slot contract, both fields
  rec.level = span > 0 ? Math.min(1, rec.lit / span) : 0;
  host.look.fire = rec.level;
}
