/* rules layer — which of a tier's rows an offer shows, and what a reroll costs.
   Event-driven from `shell/main.js#applyIntents`, not stepped. Candidate ids
   are gathered by `shell` from each tier's own `draftable()`, since the four
   tier modules are siblings this file may not import.

   An offer of k cards consumes exactly k `rand()` draws (partial Fisher-Yates
   over a copy of the candidates), and a reroll consumes as many again.
   Changing the draw count shifts every later draw in the run. */

import { rand } from '../core/rng.js';
import { push } from '../model/journal.js';
import { eff } from '../model/mods.js';
import { canReroll, offerExhausted, rerollPrice, run, write as rw } from '../model/run.js';

/* k distinct ids, in draw order, consuming one `rand()` per id returned. */
function pick(candidateIds) {
  const pool = [...candidateIds];
  const k = Math.min(Math.max(0, Math.round(eff('offerSize'))), pool.length);
  const out = [];
  for (let i = 0; i < k; i++) out.push(...pool.splice((rand() * pool.length) | 0, 1));
  return out;
}

/* Lay out an offer of `tier`, asked by `god` (`null` for a debug draft), over
   `candidateIds`, and write it to `run.offer`. Fewer candidates than
   `offerSize` offer fewer cards; none clears the offer and pushes a refusal.
   Returns the ids offered. */
export function offer(tier, god, candidateIds) {
  const ids = pick(candidateIds);
  if (!ids.length) {
    rw.offer(null);
    push('refused', null, { why: 'NOTHING LEFT TO OFFER' });
    return ids;
  }
  rw.offer(tier, god, ids, candidateIds.length);
  return ids;
}

/* Spend `god`'s favour to re-pick the standing offer, or refuse and spend
   nothing. `model/run.js#canReroll` is the predicate `view` also dims the row
   with; `offerExhausted` says which half of it failed. */
export function reroll(god, candidateIds) {
  if (!run.offer?.ids) return false;
  if (!canReroll(god)) {
    push('refused', null, { why: offerExhausted() ? 'THIS IS ALL THERE IS' : 'NOT ENOUGH FAVOUR' });
    return false;
  }
  rw.favour(god, -rerollPrice());
  offer(run.offer.tier, god, candidateIds);
  return true;
}
