/* LAYER model — run-scoped state and meta-state, split by object.
   Imports `core`, `data`, `model`. May be imported by `model`, `rules`, `view`.

   ============================================================================
   THE SPLIT, in the object shape. Two records, and which one a field belongs in
   is decided by one question: does a death erase it?

     run    hearts, pockets, granted machines, drafted trinkets, the tribute
            clock, the seed. `write.reset()` restores every field from
            RUN_SCHEMA, so a field that survives a restart is a determinism bug
            and not a feature.
     meta   what outlives the run: how many runs, the deepest depth ever, which
            gods have been met. Nothing here is written during play except at
            the moment a run ends.

   There is deliberately NO SAVE STRING in this pass. The split is in the shape
   so that adding one later is a serialiser and not a refactor -- a save is
   `meta` plus `run.seed` plus `run.inv` (a drafted trinket lives there too, see
   `rules/trinkets.js`), and replaying it reproduces every number because
   randomness is seeded and modifiers are a list.
   ============================================================================

   Every field a `newRun()` must reset is declared ONCE, in RUN_SCHEMA, and
   reset mechanically. The previous codebase disagreed with itself about the
   shape of `run` in four places -- three fields that other modules each invented
   -- and that class of bug is what a schema is for. */

import { F, FORM, byHudOrder, matches } from '../data/forms.js';
import { S, SUB } from '../data/substances.js';
import { STARTING_MACHINES } from '../data/boons.js';
import { M, MACH } from '../data/machines.js';
import { bump } from './epoch.js';
import { keyOf, parseKey } from './items.js';

export const RUN_SCHEMA = Object.freeze({
  seed: 1337, t: 0,
  dead: false, deathCause: '',
  hearts: 5, maxHearts: 5, invuln: 0,
  inv: null,            // sparse; keyed by the `sub/form` string -- a drafted
                        // trinket and the starting pick both live here too,
                        // see `rules/trinkets.js` and `hasPick()` below
  granted: null,        // machine ids this run may place
  cycle: 1, tribute: null,
  deepest: 0,           // world px, for the depth gauge and for `meta`

  /* The hand-craft bar. A scalar, not a Map like `model/mining.js#dig.work` --
     a player has one pair of hands, so there is only ever one craft in
     flight, and it belongs on `run` rather than in a dedicated module so it
     resets with everything else (invariant 8) for free. `craftRecipe` is
     which named recipe the bar is counting toward, so a change of materials
     mid-hold (a different recipe now matches first) starts the bar over
     instead of quietly carrying old progress into a different item. See
     `rules/crafting.js`. */
  craftProgress: 0, craftRecipe: null
});

export const META_SCHEMA = Object.freeze({
  runs: 0,
  bestDepth: 0,
  godsMet: null
});

export const run  = {};
export const meta = {};

export const write = {
  /* The whole of `newRun()` as far as this module is concerned. Called by
     `shell/boot.js` alongside the `clear()` on every other model module. */
  reset(seed) {
    Object.assign(run, RUN_SCHEMA, {
      seed,
      inv: {},
      granted: [...STARTING_MACHINES],
      tribute: null
    });
    bump();
  },

  resetMeta() {
    Object.assign(meta, META_SCHEMA, { godsMet: [] });
    bump();
  },

  /* Fold the finished run into what outlives it. The only writer of `meta`. */
  retire() {
    meta.runs++;
    if (run.deepest > meta.bestDepth) meta.bestDepth = run.deepest;
    bump();
  },

  tick(dt) { run.t += dt; if (run.invuln > 0) run.invuln -= dt; bump(); },

  deepest(y) { if (y > run.deepest) { run.deepest = y; bump(); } },

  collect(sub, form, n) {
    const k = keyOf(sub, form);
    run.inv[k] = (run.inv[k] || 0) + n;
    bump();
  },

  spend(sub, form, n) {
    const k = keyOf(sub, form);
    if ((run.inv[k] || 0) < n) return false;
    run.inv[k] -= n;
    if (!run.inv[k]) delete run.inv[k];
    bump();
    return true;
  },

  /* Hearts are SPENT, not consumed as an item. The lift reaches this through
     `data/sources.js`, never through `inv`, which is why the HUD keeps drawing
     five hearts and nothing here changes shape. */
  spendHearts(n) {
    if (run.hearts - n < 1) return false;     // a machine may not kill you
    run.hearts -= n;
    bump();
    return true;
  },

  hurt(n, cause) {
    run.hearts -= n;
    if (run.hearts <= 0) { run.hearts = 0; run.dead = true; run.deathCause = cause; }
    bump();
  },

  grant(machineId)  { if (!run.granted.includes(machineId)) run.granted.push(machineId); bump(); },
  tribute(t)        { run.tribute = t; bump(); },

  /* The hand-craft bar, written as one pair so a recipe change and its reset
     progress can never be observed half-applied. */
  craft(progress, recipe) { run.craftProgress = progress; run.craftRecipe = recipe; bump(); }
};

/* ---- queries ---- */

export const invCount = (sub, form) => run.inv[keyOf(sub, form)] || 0;
export const hearts   = () => run.hearts;
export const canPlace = machineId => run.granted.includes(machineId);

/* Whether every clause of a machine's build `cost` (`data/machines.js`) is
   currently held. `cost` keys are EXACT sub/form pairs, not selectors -- a
   build bill is a specific list of materials, not "any ore" -- so this is a
   straight `invCount` loop and not a selector match. `null`/absent `cost`
   means free, which is why every machine granted at run start can still be
   placed once this exists. Exported as a query (not left as a private check
   inside `rules/placement.js`) because `view/hud.js`'s build menu needs the
   same yes/no answer to grey out what the player cannot yet afford, and
   `view` may not import `rules`. */
export function canAfford(cost) {
  if (!cost) return true;
  for (const k in cost) {
    const { sub, form } = parseKey(k);
    if (invCount(sub, form) < cost[k]) return false;
  }
  return true;
}

/* Does the pocket ledger hold at least `n` of a SINGLE pair matching `sel`?
   Mirrors `rules/machines.js`'s private `best`, specialised to `run.inv` --
   exposed here rather than left inside a `rules` module for the same reason
   as `canAfford` above: the CRAFT panel needs to grey out an unaffordable
   hand-recipe with no `rules` import available to it. */
export function pocketsHave(sel, n) {
  for (const k in run.inv) {
    if (run.inv[k] < n) continue;
    const p = parseKey(k);
    if (matches(sel, p.sub, p.form)) return true;
  }
  return false;
}

/* Whether every input clause of a recipe (`data/recipes.js` shape) is
   currently satisfiable from the pockets. What the CRAFT panel greys out by;
   `rules/crafting.js#choose` asks the same question on its way to picking a
   concrete pair to spend, which is a strictly stronger check than this one
   (it also has to find ONE pair per clause, not just enough total), so the
   two are related but not the same code -- this is display, that is a
   decision with a consequence. */
export const canCraft = recipeIn =>
  Object.keys(recipeIn).every(sel => pocketsHave(sel, recipeIn[sel]));

/* Every machine this run may place, in GRANTED order -- the same order the
   build menu (`view/hud.js`) lists them and a number key
   (`shell/input.js`) selects by, so "press 3" and "the third row of the
   panel" cannot silently disagree about which machine that is. */
export function buildableMachines() {
  return run.granted.map(id => {
    const def = MACH[M[id]];
    return { id, name: def.name, cost: def.cost || null, afford: canAfford(def.cost) };
  });
}

/* Whether the player has ever picked up the stock pickaxe -- `shell/boot.js`
   plants one near spawn every run, and this is true from the moment it is
   picked up, exactly like any other held pair. No separate flag: a field that
   duplicates `run.inv` is a field that can disagree with it. */
export const hasPick = () => invCount(S.pick, F.relic) > 0;

/* The pocket strip, as data. `view/hud.js` reads this and names nothing:
   every held pair, plus a zero slot for any substance flagged `always` so the
   first minute of the game has something to point at. Sorted by the one
   ordering rule in `data/forms.js`. */
export function pocketRows() {
  const seen = new Set(), out = [];
  for (const k in run.inv) {
    const [s, f] = k.split('/');
    out.push({ sub: SUB.findIndex(r => r.id === s), form: F[f], n: run.inv[k] });
    seen.add(k);
  }
  SUB.forEach((s, i) => {
    if (!s.item?.hud?.always) return;
    const f = F[s.tile?.drops];
    if (f === undefined) return;
    const k = `${s.id}/${FORM[f].id}`;
    if (!seen.has(k)) out.push({ sub: i, form: f, n: 0 });
  });
  return out.sort(byHudOrder);
}
