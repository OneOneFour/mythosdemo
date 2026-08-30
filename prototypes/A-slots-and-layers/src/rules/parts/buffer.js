/* Buffer — provides `buffer`. The only place a machine's stock lives. */

import { buf } from '../../model/slots.js';

export function buffer(rec, need, host, ctx) {
  void need; void ctx;
  /* Publish stock and per-pool fullness as data. The renderer draws pips
     from this and never reaches into the record itself. Invariant 3: a pool
     with no consumer fills and reads FULL, and that is the mechanic. */
  host.look.stock = rec.stock;
  host.look.full = null;
  for (const sel of Object.keys(rec.cap))
    if (buf.full(rec, sel)) (host.look.full ??= []).push(sel);
}
