/* LAYER rules — CRAFTING: the player's own hands, as a rate-limited machine.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   ============================================================================
   THE THESIS THIS FILE EXISTS TO SERVE, from `docs/DESIGN.md`'s "hands versus
   machines": hand-crafting must not be strictly worse than the machine that
   runs the same recipe, or every machine in the game would earn its keep by
   having no substitute rather than by throughput. So this runs the SAME named
   recipe a machine would (`smelt`, `press` -- anything `data/recipes.js` marks
   `hand:true`), at the machine's own `secs`, spending and producing exactly
   what the machine spends and produces. The only thing a machine buys over
   this file is that it keeps running once the player walks away, and a
   player has exactly one pair of hands to hold this key with.
   ============================================================================

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
import { push } from '../model/journal.js';
import { parseKey, write as iw } from '../model/items.js';
import { player, playerCentre } from '../model/player.js';
import { run, write as rw } from '../model/run.js';

/* The largest single pocketed pair matching a selector, with at least `need`
   units. Rules siblings may not import one another, so this is the same
   shape as `rules/machines.js`'s private `bestPair`, re-derived over the
   player's pockets rather than shared -- eight lines here is cheaper than a
   module neither file is allowed to import. */
function bestPocketed(sel, need) {
  for (const k in run.inv) {
    if (run.inv[k] < need) continue;
    const p = parseKey(k);
    if (matches(sel, p.sub, p.form)) return p;
  }
  return null;
}

/* First hand-craftable recipe the player currently has every input for --
   "first match wins, a real menu would let you choose", the same convention
   `rules/placement.js#placeableFromPockets` and the trinket/boon draft in
   `shell/main.js#applyIntents` already use. Returns which pocketed pair
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
    const sub = clause.sub !== undefined ? clause.sub : took[clause.subFrom]?.sub;
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
