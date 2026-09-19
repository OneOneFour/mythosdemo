/* rules layer — hand-crafting. Runs the recipe `cmd.craftId` names at that
   recipe's own `secs`, spending pocketed pairs. A named row that is
   unaffordable makes nothing; only a hold naming no recipe falls through to
   `choose()`. Progress is one scalar on `run`, zeroed rather than banked when
   the hold or the ingredients go away. */

import { F } from '../data/forms.js';
import { HAND_RECIPES } from '../data/recipes.js';
import { S } from '../data/substances.js';
import { push } from '../model/journal.js';
import { write as iw } from '../model/items.js';
import { eff } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import { pocketedPair, run, write as rw } from '../model/run.js';

/* `cmd.craftId` resolves through this rather than `data/recipes.js#RECIPES`,
   so a machine-only row stays uncraftable by hand. */
const BY_ID = new Map(HAND_RECIPES.map(r => [r.id, r]));

/* Which pocketed pair satisfies each of `r`'s input selectors, or `null` if
   any is unmet. Completion spends and resolves `subFrom` from this map rather
   than re-matching. */
function afford(r) {
  const took = {};
  for (const sel in r.in) {
    const pair = pocketedPair(sel, r.in[sel]);
    if (!pair) return null;
    took[sel] = pair;
  }
  return took;
}

/* The first affordable hand recipe, for a hold that names none. Declaration
   order in `data/recipes.js` decides which. */
function choose() {
  for (const r of HAND_RECIPES) {
    const took = afford(r);
    if (took) return { r, took };
  }
  return null;
}

export function step(dt, cmd) {
  if (run.dead || !cmd.craft) {
    if (run.craftProgress) rw.craft(0, null);
    return;
  }

  let r = null, took = null;
  if (cmd.craftId) {
    r = BY_ID.get(cmd.craftId) ?? null;
    if (r) took = afford(r);
  } else {
    const picked = choose();
    if (picked) { r = picked.r; took = picked.took; }
  }
  if (!took) {
    /* No journal row: this runs at the 1/120 s substep, so
       `shell/main.js#tickCraftQueue` reports the stall once per frame. */
    if (run.craftProgress) rw.craft(0, null);
    return;
  }

  /* Re-aiming at a different recipe restarts the bar. Nothing is spent before
     completion, so only the elapsed seconds are lost. */
  const prog = (run.craftRecipe === r.id ? run.craftProgress : 0) + dt;
  if (prog < r.secs) { rw.craft(prog, r.id); return; }

  for (const sel in r.in) rw.spend(took[sel].sub, took[sel].form, r.in[sel]);
  rw.craft(0, null);

  const c = playerCentre();
  let firstSub, firstForm, made = 0;
  for (const clause of r.out || []) {
    /* `clause.sub` and `clause.form` are content ids and need `S`/`F` to
       become the ordinals `write.collect` takes; `took[...].sub` is already an
       ordinal, from `model/items.js#parseKey`. */
    const sub = clause.sub !== undefined ? S[clause.sub] : took[clause.subFrom]?.sub;
    if (sub === undefined || sub === null) continue;
    const form = F[clause.form];
    if (firstSub === undefined) { firstSub = sub; firstForm = form; }
    /* The same expression `rules/machines.js` applies, so one recipe run by
       hand and run in a machine produce the same count. Unscoped: `yield`
       narrows to a machine, and a hand craft has none. Floored at one. */
    const units = Math.max(1, Math.floor(clause.n * eff('yield')));
    /* A full inventory falls back to a ground drop, so output is never lost. */
    if (!rw.collect(sub, form, units)) {
      for (let k = 0; k < units; k++) iw.spawn(player.band, c.x, c.y, sub, form, 0, -50);
    }
    made += units;
  }
  if (made) push('produce', { x: c.x, y: c.y }, { sub: firstSub, form: firstForm, made });
}
