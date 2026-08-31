/* LAYER rules — CRAFTING: the player's own hands, as a rate-limited machine.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   THE THESIS THIS FILE EXISTS TO SERVE: hand-crafting must not be strictly
   worse than the machine that runs the same recipe, or every machine in the
   game would earn its keep by having no substitute rather than by throughput.
   So this runs the SAME named recipe a machine would, at the machine's own
   `secs`, spending and producing exactly what the machine does. See
   docs/DEVELOPER_GUIDE.md#adding-a-recipe

   PROGRESS IS A SCALAR ON `run`, NOT A MAP. `model/mining.js` keeps a Map
   because several tiles can be part-dug at once; a player has one pair of
   hands, so there is only ever one craft in flight, and `run.craftProgress` /
   `run.craftRecipe` (`model/run.js#RUN_SCHEMA`) reset with the run for free
   (invariant 8) rather than needing a dedicated model module of their own.
   Unlike mining, releasing the key or losing the ingredients forgets the bar
   entirely rather than banking it -- there is no shaft to come back to here,
   only a recipe that either has the player's attention right now or does not. */

import { F, matches } from '../data/forms.js';
import { HAND_RECIPES } from '../data/recipes.js';
import { S } from '../data/substances.js';
import { push } from '../model/journal.js';
import { parseKey, write as iw } from '../model/items.js';
import { player, playerCentre } from '../model/player.js';
import { run, write as rw } from '../model/run.js';

/* The largest single pocketed pair matching a selector, with at least `need`
   units. Rules siblings may not import one another, so this is the same
   shape as `rules/machines.js`'s private `bestPair`, re-derived over the
   player's pockets rather than shared. See
   docs/DEVELOPER_GUIDE.md#duplication-across-a-layer-boundary */
function bestPocketed(sel, need) {
  for (const k in run.inv) {
    if (run.inv[k] < need) continue;
    const p = parseKey(k);
    if (matches(sel, p.sub, p.form)) return p;
  }
  return null;
}

/* First hand-craftable recipe the player currently has every input for --
   "first match wins, a real menu would let you choose"; declaration order in
   `data/recipes.js` is therefore load-bearing, see
   docs/DEVELOPER_GUIDE.md#hand-recipe-declaration-order. Returns which
   pocketed pair
   satisfied each selector alongside the recipe, so completion can spend and
   derive a `subFrom` output without re-deriving the match. */
function choose() {
  for (const r of HAND_RECIPES) {
    const took = {};
    let ok = true;
    for (const sel in r.in) {
      const pair = bestPocketed(sel, r.in[sel]);
      if (!pair) { ok = false; break; }
      took[sel] = pair;
    }
    if (ok) return { r, took };
  }
  return null;
}

export function step(dt, cmd) {
  if (run.dead || !cmd.craft) {
    if (run.craftProgress) rw.craft(0, null);          // let go: the bar forgets
    return;
  }

  const picked = choose();
  if (!picked) {
    if (run.craftProgress) rw.craft(0, null);          // materials vanished mid-hold
    return;
  }
  const { r, took } = picked;

  /* A different recipe than the one already accumulating starts the bar over:
     the materials under the player's hand changed, so old progress does not
     carry into a different item for free. */
  const prog = (run.craftRecipe === r.id ? run.craftProgress : 0) + dt;
  if (prog < r.secs) { rw.craft(prog, r.id); return; }

  /* ---- complete. Spend exactly the pairs `choose` matched. ---- */
  for (const sel in r.in) rw.spend(took[sel].sub, took[sel].form, r.in[sel]);
  rw.craft(0, null);

  /* ARCHITECTURE invariant 5, the same idiom `rules/trinkets.js#grant` uses
     for a drafted trinket: the output falls at the player's feet as a
     physical item, never a direct `write.collect`. A small upward toss so it
     reads as "made", not "dropped through the floor". */
  const c = playerCentre();
  let firstSub, firstForm, made = 0;
  for (const clause of r.out || []) {
    /* `clause.sub` is a bare content ID ('timber'), exactly like `clause.form`
       just below -- both need translating through their id table (`S`/`F`)
       into an ordinal before `model/items.js#write.spawn` can use them.
       `subFrom` needs no such translation: `took[...].sub` already came from
       `model/items.js#parseKey`, which returns ordinals. PRE-EXISTING BUG,
       not introduced this phase: this line only ever read `clause.sub`
       untranslated, which silently made `holdable()` false (SUB[sub] on a
       string key is undefined) and `write.spawn` a no-op for EVERY literal-
       sub output -- invisible until a hand-craft recipe with a literal `sub`
       existed to exercise it. `kindle` (Phase 1, "the first recipe whose
       output form is not a compression tier") was the first such recipe and
       has been producing nothing since it shipped; caught here because
       Phase 2a's own manual-verification step ("hand-craft peg rungs") hits
       the identical code path. Fixed in the same commit that would otherwise
       ship a second broken recipe on top of it. See docs/FINDINGS.md. */
    const sub = clause.sub !== undefined ? S[clause.sub] : took[clause.subFrom]?.sub;
    if (sub === undefined || sub === null) continue;
    const form = F[clause.form];
    if (firstSub === undefined) { firstSub = sub; firstForm = form; }
    for (let k = 0; k < clause.n; k++) {
      iw.spawn(player.band, c.x, c.y, sub, form, 0, -50);
      made++;
    }
  }
  if (made) push('produce', { x: c.x, y: c.y }, { sub: firstSub, form: firstForm, made });
}
