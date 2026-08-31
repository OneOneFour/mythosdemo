/* LAYER rules — BOONS: the TIMED tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Imports `data`, `model`.
   Imports no other `rules` module.

   `step()` IS A SYNC, NOT AN EVENT: every fixed 1/120 s step it (1) ticks
   every active boon down and expires anything at zero, then (2) rebuilds
   `model/mods.js`'s `'boon:'`-keyed rows FROM SCRATCH off the current active
   list, resolving every `conflictsWith` fresh each frame. See
   docs/DEVELOPER_GUIDE.md#the-four-gift-tiers

   Registered in `shell/schedule.js` immediately before `machines`, for the
   identical reason `trinkets before machines` is already stated there: a
   rate modifier that turned on this frame should apply to this frame's
   recipe tick, not the next one. */

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

/* Boons not currently active. Same shape as every other tier's `draftable`
   -- see docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */
export const draftable = () => BOONS.filter(b => !boons.active.some(a => a.id === b.id));

/* mul -> 1/mul, add -> -add. What "invert" means for a row: flip whichever
   halves are present, leave the other undefined exactly as it came in. */
const invert = mods => mods.map(m => ({
  key: m.key,
  mul: m.mul !== undefined ? 1 / m.mul : undefined,
  add: m.add !== undefined ? -m.add : undefined
}));

export function step(dt) {
  /* ---- 1. tick, then expire. A journal row either way: grant and expiry
     both announce themselves. ---- */
  bw.tick(dt);
  /* Collect first, THEN expire: `write.expire` splices `boons.active`, so
     mutating it while still iterating it would skip an entry -- filtering
     into a separate array first sidesteps that regardless of iteration
     order. */
  const expiring = boons.active.filter(a => a.left <= 0).map(a => a.id);
  for (const id of expiring) {
    bw.expire(id);
    push('lost', null, { boon: id, name: BOON[id]?.name });
  }

  /* ---- 2. sync model/mods.js from the active list, honouring
     conflictsWith. Full rebuild every frame, over the CONTENT table (not
     just what happens to be active), so a boon that just expired loses its
     row THIS frame with no separate "was this active a moment ago"
     bookkeeping. See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers ---- */
  for (const b of BOONS) modw.removeBySource('boon:' + b.id);

  const ids = boons.active.map(a => a.id);
  for (let i = 0; i < ids.length; i++) {
    const b = BOON[ids[i]];
    let mods = b.mods;
    let suppressed = false;

    /* Only a LATER boon (higher index -- granted more recently) may act on
       an earlier one, per `data/boons.js`'s own contract: "the OLDER of the
       two is either suppressed or inverted." */
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
