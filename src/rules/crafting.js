/* LAYER rules — CRAFTING: the player's own hands, as a rate-limited machine.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   THE THESIS THIS FILE EXISTS TO SERVE: hand-crafting must not be strictly
   worse than the machine that runs the same recipe, or every machine in the
   game would earn its keep by having no substitute rather than by throughput.
   So this runs the SAME named recipe a machine would, at the machine's own
   `secs`, spending and producing exactly what the machine does. See
   docs/DEVELOPER_GUIDE.md#adding-a-recipe

   THE CRAFT INTENT NAMES ITS RECIPE. `cmd.craft` is the hold; `cmd.craftId`
   is the row it is held on -- the id the player clicked in the CRAFTING panel,
   folded onto the command set by `shell/main.js#step` because `rules` may not
   import `shell`. A named row is the ONLY row a named hold can make: an
   unaffordable one makes nothing, rather than quietly making something else.
   Only a hold that names nothing falls through to `choose()` below.

   PROGRESS IS A SCALAR ON `run`, NOT A MAP. `model/mining.js` keeps a Map
   because several tiles can be part-dug at once; a player has one pair of
   hands, so there is only ever one craft in flight, and `run.craftProgress` /
   `run.craftRecipe` (`model/run.js#RUN_SCHEMA`) reset with the run for free
    rather than needing a dedicated model module of their own.
   Unlike mining, releasing the key or losing the ingredients forgets the bar
   entirely rather than banking it -- there is no shaft to come back to here,
   only a recipe that either has the player's attention right now or does not. */

import { F } from '../data/forms.js';
import { HAND_RECIPES } from '../data/recipes.js';
import { S } from '../data/substances.js';
import { push } from '../model/journal.js';
import { write as iw } from '../model/items.js';
import { player, playerCentre } from '../model/player.js';
import { pocketedPair, run, write as rw } from '../model/run.js';

/* Every hand-craftable row, by id. `cmd.craftId` resolves through THIS and
   not through `data/recipes.js#RECIPES`, so a machine-only row stays
   uncraftable by hand however its id reached the command set. */
const BY_ID = new Map(HAND_RECIPES.map(r => [r.id, r]));

/* Which pocketed pair satisfies each of `r`'s input selectors, or `null` if
   any one of them is unmet. Kept alongside the recipe so completion can spend
   and derive a `subFrom` output without re-deriving the match. */
function afford(r) {
  const took = {};
  for (const sel in r.in) {
    const pair = pocketedPair(sel, r.in[sel]);
    if (!pair) return null;
    took[sel] = pair;
  }
  return took;
}

/* The first affordable hand-craftable row, for a craft hold that names no
   recipe at all -- no key binds one, and the two harnesses
   (`tools/check.mjs#stepReal`, `__mf.hold`) are what drive it. Declaration
   order in `data/recipes.js` decides THIS and nothing the player can click;
 */
function choose() {
  for (const r of HAND_RECIPES) {
    const took = afford(r);
    if (took) return { r, took };
  }
  return null;
}

export function step(dt, cmd) {
  if (run.dead || !cmd.craft) {
    if (run.craftProgress) rw.craft(0, null);          // let go: the bar forgets
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
    /* Nothing to pay with -- the materials vanished mid-hold, or the named row
       was never affordable. Either way the bar forgets. Saying so is
       `shell/main.js#tickCraftQueue`'s job, once per stall on the frame
       boundary, because this runs 120 times a second. */
    if (run.craftProgress) rw.craft(0, null);
    return;
  }

  /* A different recipe than the one already accumulating starts the bar over:
     the materials under the player's hand changed, so old progress does not
     carry into a different item for free. Nothing is spent before completion,
     so a re-aimed hold loses only the seconds. */
  const prog = (run.craftRecipe === r.id ? run.craftProgress : 0) + dt;
  if (prog < r.secs) { rw.craft(prog, r.id); return; }

  /* complete. Spend exactly the pairs matched above. */
  for (const sel in r.in) rw.spend(took[sel].sub, took[sel].form, r.in[sel]);
  rw.craft(0, null);

  const c = playerCentre();
  let firstSub, firstForm, made = 0;
  for (const clause of r.out || []) {
    /* `clause.sub` is a bare content ID ('timber'), exactly like `clause.form`
       just below -- both need translating through their id table (`S`/`F`)
       into an ordinal before `model/run.js#write.collect` can use them.
       `subFrom` needs no such translation: `took[...].sub` already came from
       `model/items.js#parseKey`, which returns ordinals. */
    const sub = clause.sub !== undefined ? S[clause.sub] : took[clause.subFrom]?.sub;
    if (sub === undefined || sub === null) continue;
    const form = F[clause.form];
    if (firstSub === undefined) { firstSub = sub; firstForm = form; }
    /* Hand-crafted output is a direct write.collect, not a physical item --
       ARCHITECTURE invariant 5 covers MINED material only. A full main
       inventory falls back to the same ground-drop `write.spawn` the
       INVENTORY FULL refusal path (rules/items.js) already uses, so
       finished work is never silently lost. */
    if (!rw.collect(sub, form, clause.n)) {
      for (let k = 0; k < clause.n; k++) iw.spawn(player.band, c.x, c.y, sub, form, 0, -50);
    }
    made += clause.n;
  }
  if (made) push('produce', { x: c.x, y: c.y }, { sub: firstSub, form: firstForm, made });
}
