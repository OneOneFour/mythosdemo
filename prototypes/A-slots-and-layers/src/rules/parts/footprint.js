/* Footprint — provides `footprint`.
   Every part function has the same shape: (rec, need, host, ctx).
     rec  its own state record from host.parts
     need the slot records it declared in data/parts.js, by slot name
     host the machine record
     ctx  { dt, band }
   No `this`, no state on the module. */

import { isAir, isSolid } from '../../model/tiles.js';

export function footprint(rec, need, host, ctx) {
  void rec; void need; void host; void ctx;
  /* Nothing per frame. The record is written once at assembly. A future
     Collapses part (DESIGN item 7, cave-in) reads it. */
}

/* Placement validity. Called by rules/place.js, not per tick. Returns null,
   or the reason as a string. */
export function valid(band, tx, ty, tw, th, footing) {
  for (let j = 0; j < th; j++)
    for (let i = 0; i < tw; i++)
      if (!isAir(band, tx + i, ty + j)) return 'NEEDS CLEAR SPACE';
  let f = 0;
  for (let i = 0; i < tw; i++) if (isSolid(band, tx + i, ty + th)) f++;
  return f >= footing ? null : 'NEEDS A FLOOR';
}
