/* LAYER rules — TRINKETS, WHICH ARE ITEMS. The passive-modifier tier.
   Imports `data`, `model`. Imports no other `rules` module.

   ============================================================================
   A TRINKET HAS NO SEPARATE "EQUIPPED" LIST -- BUT AN EQUIP SLOT IS NOT A
   SECOND INVENTORY EITHER (Phase 4, docs/BUILD_PLAN.md, CLAUDE.md D1).
   `run.trinkets` used to be a second inventory living beside `run.inv`, and
   the two could disagree about whether the player had a thing. A trinket has
   no element it refines from -- it IS the element, singular and divine -- so
   `data/substances.js` gives it a row of its own and `data/forms.js#relic`
   is the one form it may take. Once that is true, "does the player have it"
   is exactly `invCount(sub, relic)`, the same question asked of a lump of
   ore.

   `run.equipped` is a SELECTION over that same `run.inv`, not a THIRD list: a
   fixed-length array of substance ordinals (or `null`), capped by
   `eff('trinketSlots')`. A modifier is only active while its id is BOTH
   equipped AND held -- the intersection -- so `step()` below does two things
   every frame, in order: clear any slot whose id the pockets no longer hold
   (so a slot and the pockets can never disagree about whether something is
   there), THEN sync `model/mods.js`'s active rows from whatever survives
   that pass. Losing a trinket -- however that ever happens; a drop, a lava
   field, a monster's theft -- turns its modifier off for free and empties
   its slot for free, with no `unequip()` call anywhere needing to have been
   made. There is no trinket-specific code beyond this file: a trinket that
   changes walk speed and one that softens one material take the same path,
   and so will the fortieth. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { TRINKET, TRINKETS } from '../data/trinkets.js';
import { write as iw } from '../model/items.js';
import { push } from '../model/journal.js';
import { mods, write as modw } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import { invCount, run, write as rw } from '../model/run.js';

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

/* Equip the first held-but-unequipped trinket into the first empty slot.
   THE "shell intent" Phase 4 STEP 4 asks for: drag-to-equip UI is Phase 5b's
   job, and this model-driven path is enough to prove the mechanism -- it is
   what `shell/main.js#applyIntents` calls for the equip key, and exactly
   what a headless test drives too (no pixel geometry involved, per that
   phase's own requirement on Phase 6's test). Returns false with nothing
   changed if there is no empty slot or nothing unequipped to fill it with. */
export function equipFirst() {
  const slot = run.equipped.indexOf(null);
  if (slot < 0) return false;
  for (const t of TRINKETS) {
    const sub = S[t.id];
    if (invCount(sub, F.relic) > 0 && !run.equipped.includes(sub)) {
      rw.equip(slot, sub);
      return true;
    }
  }
  return false;
}

/* Run once a frame (see `shell/schedule.js`). `removeBySource` is the half a
   static field cannot express: `WALK *= 1.15` cannot be told apart from the
   base value once applied, so undoing it needs the row kept by its source, not
   the multiplier alone. */
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
