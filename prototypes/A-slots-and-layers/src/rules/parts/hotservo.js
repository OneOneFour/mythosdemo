/* ============================================================
   HotServo — provides `servo`, needs `buffer`.

   CLAUDE.md's throughput model: a station runs 38% faster when its feed pool
   is over 55% full (`cool = rate * 0.62`). This servo is what keeps piles
   bounded; without it small surpluses accumulate to FULL over ~20 minutes.

   RFC 04 put this in the furnace's data row as an inline arrow function, and
   its own weakness 1 identifies that as the hole in its checker: a function
   in a data file is invisible to a tool that reads imports, and a data file
   containing functions is no longer diffable as content. As a named part it
   is greppable, checkable, reusable and swappable for a boon's version.
   ============================================================ */

import { buf } from '../../model/slots.js';

export function hotservo(rec, need, host, ctx) {
  void host; void ctx;
  const b = need.buffer;
  let fullest = 0;
  for (const sel of Object.keys(b.cap)) fullest = Math.max(fullest, buf.fill(b, sel));
  rec.mult = fullest > rec.over ? rec.boost : 1;
}

/* NOTE — a real collision the three-way split caused, and how it resolved.
   The obvious naming is `defaults: { mult: 1.38 }` in data/parts.js, because
   that is what the number means to an author. But `mult` is also the `servo`
   slot's output field, and the merge order in model/machines.js is
   slot fields <- state <- defaults <- params: the parameter would overwrite
   the output field's initial value and then this function would overwrite the
   parameter on the first cold tick. In RFC 02 the collision cannot happen,
   because the parameter lives in the `make(p)` closure and the output lives on
   `this`, two different namespaces. Here they are one flat record.

   Resolution: the slot's output field and the part's parameter may not share a
   name (`mult` out, `boost` in). tools/layers.mjs enforces it, because a
   convention nobody checks is a comment. It is a small tax and it is charged
   on every part that both takes a parameter and fills a slot field. */
