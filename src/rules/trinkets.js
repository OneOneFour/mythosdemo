/* LAYER rules — TRINKETS, WHICH ARE ITEMS. The passive-modifier tier.
   Imports `data`, `model`. Imports no other `rules` module.

   A TRINKET HAS NO SEPARATE "EQUIPPED" LIST -- AND AN EQUIP SLOT IS NOT A
   SECOND INVENTORY EITHER. See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers

   `step()` below does two things every frame, in order: clear any slot whose
   id the pockets no longer hold (so a slot and the pockets can never disagree
   about whether something is there), THEN sync `model/mods.js`'s active rows
   from whatever survives that pass. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { TRINKET, TRINKETS } from '../data/trinkets.js';
import { write as iw } from '../model/items.js';
import { push } from '../model/journal.js';
import { mods, write as modw } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import { invCount, run, write as rw } from '../model/run.js';

/* A draft is a god's gift, so it falls like everything else material in this
   game rather than being credited straight into a list -- invariant 5, and
   docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */
export function grant(id) {
  const t = TRINKET[id];
  /* A missing trinket is a programming error, not a content error: the resolver
     has already proved every id in `data/` resolves. So this throws. */
  if (!t) throw new Error(`grant: no trinket "${id}"`);
  if (invCount(S[id], F.relic) > 0) return false;
  const c = playerCentre();
  iw.spawn(player.band, c.x, c.y - 24, S[id], F.relic, 0, -60);
  push('grant', null, { trinket: id, name: t.name, text: t.text });
  return true;
}

/* The candidates a draft may offer. The 1-of-3 draft itself, and the rule that
   two gods may not both be pleased, are a director's decision and not this
   file's — this only says which rows are still available. */
export const draftable = () => TRINKETS.filter(t => invCount(S[t.id], F.relic) === 0);

/* Run once a frame (see `shell/schedule.js`). `removeBySource` is the half a
   static field cannot express: `WALK *= 1.15` cannot be told apart from the
   base value once applied, so undoing it needs the row kept by its source, not
   the multiplier alone. See docs/DEVELOPER_GUIDE.md#the-tunable-pipeline */
export function step() {
  /* Pass 1: a slot whose id the pockets no longer hold is cleared HERE, in
     the same pass every frame -- the two structures (`run.equipped`,
     `run.inv`) can therefore never disagree about whether an equipped
     trinket is still real. */
  for (let slot = 0; slot < run.equipped.length; slot++) {
    const sub = run.equipped[slot];
    if (sub !== null && invCount(sub, F.relic) === 0) rw.equip(slot, null);
  }

  /* Pass 2: a modifier is active only for a trinket BOTH equipped AND held
     -- the intersection `run.equipped ∩ run.inv` this phase's own header
     names. */
  for (const t of TRINKETS) {
    const sub = S[t.id];
    const active = mods.rows.some(m => m.src === t.id);
    const shouldBeActive = run.equipped.includes(sub) && invCount(sub, F.relic) > 0;
    if (shouldBeActive && !active) modw.add(t.id, t.mods);
    else if (!shouldBeActive && active) modw.removeBySource(t.id);
  }
}
