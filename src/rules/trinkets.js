/* LAYER rules — TRINKETS, WHICH ARE ITEMS. The passive-modifier tier.
   Imports `data`, `model`. Imports no other `rules` module.

   ============================================================================
   A TRINKET HAS NO SEPARATE "EQUIPPED" LIST. It used to: `run.trinkets` was a
   second inventory living beside `run.inv`, and the two could disagree about
   whether the player had a thing. A trinket has no element it refines from --
   it IS the element, singular and divine -- so `data/substances.js` gives it a
   row of its own and `data/forms.js#relic` is the one form it may take. Once
   that is true, "does the player have it" is exactly `invCount(sub, relic)`,
   the same question asked of a lump of ore, and there is nothing left for this
   file to track.

   `step()` is therefore a SYNC, not an event: it makes `model/mods.js`'s active
   rows agree with what `run.inv` currently holds, every frame. That is what
   lets losing a trinket -- however that ever happens; there is no drop action
   yet, but a lava field or a monster's theft would both just remove the
   inventory pair -- turn its modifier off for free, with no `unequip()` call
   anywhere needing to have been made. There is no trinket-specific code beyond
   this file: a trinket that changes walk speed and one that softens one
   material take the same path, and so will the fortieth. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { TRINKET, TRINKETS } from '../data/trinkets.js';
import { write as iw } from '../model/items.js';
import { push } from '../model/journal.js';
import { mods, write as modw } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import { invCount } from '../model/run.js';

/* A draft is a god's gift, so it falls like everything else material in this
   game rather than being credited straight into a list -- the same idiom
   invariant 5 uses for mining, extended to the one other place something new
   enters the world. */
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
   the multiplier alone. */
export function step() {
  for (const t of TRINKETS) {
    const held = invCount(S[t.id], F.relic) > 0;
    const active = mods.rows.some(m => m.src === t.id);
    if (held && !active) modw.add(t.id, t.mods);
    else if (!held && active) modw.removeBySource(t.id);
  }
}
