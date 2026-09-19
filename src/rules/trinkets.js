/* rules layer — the passive-modifier tier. A trinket is a relic, so it lives
   in an equipment slot rather than the pockets. `step()` syncs
   `model/mods.js`'s rows from whatever `run.equipped` holds. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { TRINKET, TRINKETS } from '../data/trinkets.js';
import { write as iw } from '../model/items.js';
import { push } from '../model/journal.js';
import { mods, write as modw } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import { invCount, run } from '../model/run.js';

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
  for (const t of TRINKETS) {
    const active = mods.rows.some(m => m.src === t.id);
    const worn = run.equipped.includes(S[t.id]);
    if (worn && !active) modw.add(t.id, t.mods);
    else if (!worn && active) modw.removeBySource(t.id);
  }
}
