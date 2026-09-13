/* LAYER rules — THE DRAFT: which of a tier's rows a god lays out, and what a
   second look costs. Imports `core`, `data`, `model`. Imports no other
   `rules` module.

   EVENT-DRIVEN, SO NOT IN `shell/schedule.js`: that file orders the modules
   STEPPED at the fixed 1/120 s substep, and an offer happens once, when a
   trial pays. `shell/main.js#applyIntents` calls this exactly as it already
   calls `rules/placement.js`.

   WHY THE CANDIDATES ARE HANDED IN. Each of the four tiers knows what is
   still undrafted in its own table (`draftable()` in `rules/trinkets.js`,
   `rules/grants.js`, `rules/boons.js`, `rules/miracles.js`), and those four
   are siblings this file may not import. `shell` is the one layer that may
   see all four, so it gathers the ids; this file decides WHICH of them are
   offered, and dispatching the taken card back to the right tier's `grant()`
   is `shell`'s again for the same reason.

   DETERMINISM, AND THE DRAW COUNT. An offer of k cards consumes EXACTLY k
   `rand()` draws -- a partial Fisher-Yates over a copy of the candidate list,
   one draw per card laid out -- and a reroll consumes exactly as many again.
   Reordering or adding a draw here changes every later draw in the run and
   breaks seed compatibility (invariant 7). */

import { rand } from '../core/rng.js';
import { push } from '../model/journal.js';
import { eff } from '../model/mods.js';
import { canReroll, rerollPrice, run, write as rw } from '../model/run.js';

/* k distinct ids, in draw order, consuming one `rand()` per id returned. */
function pick(candidateIds) {
  const pool = [...candidateIds];
  const k = Math.min(Math.max(0, Math.round(eff('offerSize'))), pool.length);
  const out = [];
  for (let i = 0; i < k; i++) out.push(...pool.splice((rand() * pool.length) | 0, 1));
  return out;
}

/* Lay out an offer of `tier` over `candidateIds` and write it to `run.offer`.
   FEWER CANDIDATES OFFER FEWER CARDS, honestly: the grant tier ships at two
   rows by decision (docs/PLAN-wave5-closeout.md §5.1), so two-of-two is a
   real case and padding it would mean offering something already taken. With
   NO candidates left there is nothing to choose between, so the request is
   dropped with a refusal rather than raising a modal holding nothing.
   Returns the ids offered. */
export function offer(tier, candidateIds) {
  const ids = pick(candidateIds);
  if (!ids.length) {
    rw.offer(null);
    push('refused', null, { why: 'NOTHING LEFT TO OFFER' });
    return ids;
  }
  rw.offer(tier, ids);
  return ids;
}

/* Spend `god`'s favour to re-pick the standing offer. Refuses -- spending
   nothing -- when no offer stands or the god is short, through the same
   `'refused'` row every other refusal in `rules` pushes, because a price the
   player cannot pay must say so rather than quietly do nothing (D17-B).
   A debug-key draft has no asking god and therefore can never be rerolled;
   `model/run.js#canReroll` is where that is stated. */
export function reroll(god, candidateIds) {
  if (!run.offer?.ids) return false;
  if (!canReroll(god)) { push('refused', null, { why: 'NOT ENOUGH FAVOUR' }); return false; }
  rw.favour(god, -rerollPrice());
  offer(run.offer.tier, candidateIds);
  return true;
}
