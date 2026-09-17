/* rules layer — the timed gift tier. Each substep `step()` ticks active boons
   down, expires anything at zero, and rebuilds `model/mods.js`'s
   `'boon:'`-keyed rows from the active list. */

import { BOON, BOONS } from '../data/boons.js';
import { push } from '../model/journal.js';
import { boons, write as bw } from '../model/boons.js';
import { write as modw } from '../model/mods.js';

export function grant(id) {
  const b = BOON[id];
  if (!b) throw new Error(`grant: no boon "${id}"`);
  bw.grant(id, b.secs);
  push('grant', null, { boon: id, name: b.name, text: b.text });
  return true;
}

export const draftable = () => BOONS.filter(b => !boons.active.some(a => a.id === b.id));

/* mul -> 1/mul, add -> -add; a half absent from the row stays absent. */
const invert = mods => mods.map(m => ({
  key: m.key,
  mul: m.mul !== undefined ? 1 / m.mul : undefined,
  add: m.add !== undefined ? -m.add : undefined
}));

export function step(dt) {
  bw.tick(dt);
  /* `write.expire` splices `boons.active`, so collect the doomed ids into a
     separate array before expiring any of them. */
  const expiring = boons.active.filter(a => a.left <= 0).map(a => a.id);
  for (const id of expiring) {
    bw.expire(id);
    push('lost', null, { boon: id, name: BOON[id]?.name });
  }

  /* Clear over the whole content table, not over the active list, so a boon
     that expired above loses its row on this substep. */
  for (const b of BOONS) modw.removeBySource('boon:' + b.id);

  const ids = boons.active.map(a => a.id);
  for (let i = 0; i < ids.length; i++) {
    const b = BOON[ids[i]];
    let mods = b.mods;
    let suppressed = false;

    /* Only a later boon (higher index, granted more recently) suppresses or
       inverts an earlier one. `conflictsWith` rows live in `data/boons.js`. */
    for (let j = i + 1; j < ids.length; j++) {
      const later = BOON[ids[j]];
      const conflict = (later.conflictsWith || []).find(c => c.id === b.id);
      if (!conflict) continue;
      if (conflict.mode === 'suppress') { suppressed = true; break; }
      if (conflict.mode === 'invert') mods = invert(mods);
    }

    if (!suppressed) modw.add('boon:' + b.id, mods);
  }
}
