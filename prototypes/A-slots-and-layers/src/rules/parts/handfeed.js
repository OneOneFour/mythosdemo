/* HandFeed — needs `footprint`, `buffer`, `recipe`.

   Stand adjacent and the machine draws from your pockets. It asks the recipe
   slot what its pool wants, so it names no substance: adding tin does not
   touch this file. */

import { byTag } from '../../data/recipes.js';
import { matches } from '../../data/substances.js';
import { buf } from '../../model/slots.js';
import { invCount, write as rw } from '../../model/run.js';
import { box } from '../../model/player.js';
import { overlaps } from '../../model/space.js';

export function handfeed(rec, need, host, ctx) {
  void host; void ctx;
  const fp = need.footprint, b = need.buffer, r = need.recipe;
  if (!overlaps(box(), fp, rec.reach)) return;

  for (const row of byTag(r.tag))
    for (const sel of Object.keys(row.in))
      for (const sub of matches(sel))
        if (buf.room(b, sub) && invCount(sub) > 0 && rw.spend(sub, 1))
          buf.put(b, sub, 1);
}
