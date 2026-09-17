/* rules layer — the passive-modifier tier. A trinket is an item held in the
   pockets; `run.equipped` names slots, not a second inventory. `step()` clears
   any slot whose id the pockets no longer hold, then syncs `model/mods.js`'s
   rows from what survives that pass. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { TRINKET, TRINKETS } from '../data/trinkets.js';
import { write as iw } from '../model/items.js';
import { push } from '../model/journal.js';
import { mods, write as modw } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import { invCount, run, write as rw } from '../model/run.js';

/* A drafted trinket falls at the player's feet as an item rather than being
   credited into a list. */
export function grant(id) {
  const t = TRINKET[id];
  /* A missing id is a programming error: the content resolver has already
     proved every id in `data/` resolves. */
  if (!t) throw new Error(`grant: no trinket "${id}"`);
  if (invCount(S[id], F.relic) > 0) return false;
  const c = playerCentre();
  iw.spawn(player.band, c.x, c.y - 24, S[id], F.relic, 0, -60);
  push('grant', null, { trinket: id, name: t.name, text: t.text });
  return true;
}

export const draftable = () => TRINKETS.filter(t => invCount(S[t.id], F.relic) === 0);

/* An applied multiplier cannot be told apart from the base value afterwards,
   so removing one needs the row kept by its source rather than the multiplier
   alone — hence `removeBySource`. */
export function step() {
  /* Clearing a slot whose id the pockets no longer hold keeps `run.equipped`
     and `run.inv` from disagreeing about whether a trinket is still real. */
  for (let slot = 0; slot < run.equipped.length; slot++) {
    const sub = run.equipped[slot];
    if (sub !== null && invCount(sub, F.relic) === 0) rw.equip(slot, null);
  }

  /* A modifier is active only for a trinket both equipped and held. */
  for (const t of TRINKETS) {
    const sub = S[t.id];
    const active = mods.rows.some(m => m.src === t.id);
    const shouldBeActive = run.equipped.includes(sub) && invCount(sub, F.relic) > 0;
    if (shouldBeActive && !active) modw.add(t.id, t.mods);
    else if (!shouldBeActive && active) modw.removeBySource(t.id);
  }
}
