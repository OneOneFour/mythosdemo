/* CatchBox — needs `footprint`, `buffer`.

   Material falling through the mouth is swallowed for free. This is the
   thesis of the game in one part: gravity is the conveyor, so placing a
   machine under a vein is strictly better than placing it on the surface. */

import { matches } from '../../data/substances.js';
import { buf } from '../../model/slots.js';
import { write as iw } from '../../model/items.js';
import { near } from '../../model/space.js';
import { write as jw } from '../../model/journal.js';

export function catchbox(rec, need, host, ctx) {
  void ctx;
  const fp = need.footprint, b = need.buffer;
  const mouthY = rec.mouth === 'bottom' ? fp.y + fp.h : fp.y - rec.slack;

  for (const it of near(fp.x, mouthY, fp.w, fp.h + rec.slack)) {
    if (!rec.accepts.some(sel => matches(sel).includes(it.sub))) continue;
    if (!buf.room(b, it.sub)) continue;             // full: the item rests on it
    buf.put(b, it.sub, 1);
    iw.remove(it);
    jw.push('accept', host.id, it.sub);             // shell turns this into sound
    host.look.ingest = 0.2;
  }
}
