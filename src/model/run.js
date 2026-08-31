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

import { AIR, F, FORM, byHudOrder, matches } from '../data/forms.js';
import { S, SUB } from '../data/substances.js';
import { STARTING_MACHINES } from '../data/grants.js';
import { HAND_RECIPES } from '../data/recipes.js';
import { M, MACH, MACHINES } from '../data/machines.js';
import { SPAWN_BAND } from '../data/world.js';
import { bump } from './epoch.js';
import { keyOf, massOfPair, parseKey } from './items.js';
import { machineAt } from './machines.js';
import { eff } from './mods.js';
import { player } from './player.js';
import { solidAt, tileAt } from './tiles.js';
import { bandAt, bandOf, inBounds, worldX, worldY } from './world.js';

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

  /* Phase 4 (docs/BUILD_PLAN.md) STEP 4, CLAUDE.md D1: a fixed-length
     SELECTION over `run.inv`, not a second inventory -- see
     `rules/trinkets.js`'s own header on why `run.trinkets` was deleted.
     Holds substance ORDINALS (or `null` for an empty slot), length capped
     by `eff('trinketSlots')`. Built fresh in `write.reset()` below, not
     here: this frozen template holds `null` as a placeholder the same way
     `inv`/`granted` do immediately above, because an ARRAY on a shared
     frozen object would be the one mutable reference every run shared. */
  equipped: null,

  /* The hand-craft bar. A scalar, not a Map like `model/mining.js#dig.work` --
     a player has one pair of hands, so there is only ever one craft in
     flight, and it belongs on `run` rather than in a dedicated module so it
     resets with everything else (invariant 8) for free. `craftRecipe` is
     which named recipe the bar is counting toward, so a change of materials
     mid-hold (a different recipe now matches first) starts the bar over
     instead of quietly carrying old progress into a different item. See
     `rules/crafting.js`. */
  craftProgress: 0, craftRecipe: null,

  /* OUT-OF-OWNERSHIP TOUCH, DONE LOUDLY (Phase 5b, docs/BUILD_PLAN.md): the
     CRAFTING tab needs to draw an unlearned recipe as a locked silhouette --
     "you are a thief, recipes are stolen" -- and that needs a field on `run`,
     which is not `view`'s (or `shell`'s) layer to add to by default. The
     plan's own text names this as the one case flagged for approval before
     writing, and approves it: add it. Shaped as a plain ARRAY of recipe id
     strings, matching `run.granted`'s own convention (also a bare array of
     ids) rather than a `Set` -- `run.equipped`/`run.granted` are both
     plain-serialisable already, and a save string (`docs/DESIGN.md`'s "not
     yet, but the shape should not fight it later") wants the same shape
     everywhere. SEEDED WITH EVERY `HAND_RECIPES` ID in `write.reset()` below:
     nothing is actually lockable yet -- Phase 4's "recipes are stolen"
     framing is about a FUTURE drop/tribute/draft source revealing a recipe
     the player does not yet have, and no such source exists in this build.
     Shipping "everything currently craftable is known" is therefore the
     honest starting state, not a cop-out -- see docs/FINDINGS.md for the
     locking-source gap this leaves open. */
  known: null,

  /* Seconds left on the one lit `timber/brand`. Same shape as `craftProgress`
     immediately above and for the identical reason: a player has one pair of
     hands, there is only ever one lit brand, and a scalar on `run` resets
     with everything else (invariant 8) for free. Written and ticked by
     `rules/light.js`, which is OUTSIDE this file's FILE OWNERSHIP for Phase
     2b of `docs/BUILD_PLAN.md` -- see `docs/FINDINGS.md` for why this one
     field and its one writer were added anyway: `docs/BUILD_PLAN.md` itself
     specifies "run.brandLeft ... for the same reason run.craftProgress is a
     scalar", and the only alternative was module-scoped state in
     `rules/light.js` with no `newRun()` hook to clear it -- a field that
     survives a restart, which invariant 8 exists to forbid. */
  brandLeft: 0
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
      tribute: null,
      /* Every hand recipe, known from run start -- see `RUN_SCHEMA.known`'s
         own comment above for why this is the honest seed rather than a
         placeholder. A FRESH array every run, same reason `granted` above
         is spread rather than referenced. */
      known: HAND_RECIPES.map(r => r.id),
      /* A FRESH array every run -- `eff('trinketSlots')` at reset time reads
         the base value (`model/mods.js#write.clear()` has already run by
         the time `shell/boot.js` calls this, per its own load-bearing boot
         order), rounded because a slot count must be an integer even if a
         future boon ever bent this tunable fractionally. */
      equipped: Array.from({ length: Math.max(0, Math.round(eff('trinketSlots'))) }, () => null)
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

  /* One trinket slot, Phase 4 STEP 4. `sub` is a substance ordinal or
     `null` (empties the slot). `rules/trinkets.js#step` is the only caller
     that ever passes a real `sub` -- it is the one place that decides an
     equip is legal (a real slot, a currently-held id) -- and the same
     function clears a slot whose id the pockets no longer hold, so the two
     can never disagree. Out-of-range is a silent no-op, not a throw: a
     shrinking `trinketSlots` (a hostile boon could someday do that) must
     not crash a frame that still iterates the old length. */
  equip(slot, sub) {
    if (slot < 0 || slot >= run.equipped.length) return;
    run.equipped[slot] = sub;
    bump();
  },

  /* The hand-craft bar, written as one pair so a recipe change and its reset
     progress can never be observed half-applied. */
  craft(progress, recipe) { run.craftProgress = progress; run.craftRecipe = recipe; bump(); },

  /* The one lit brand's remaining burn time. See `RUN_SCHEMA.brandLeft`. */
  brand(secsLeft) { run.brandLeft = Math.max(0, secsLeft); bump(); }
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

/* ---- machine items (design reversal superseding Phase 3's cost-at-placement
   deviation -- see `data/forms.js#rig` / `data/substances.js`'s machine-
   substance block for the full argument). A machine is now a held
   `<id>/rig` pair, so "may this be placed" is "is one currently held", the
   same `invCount` question a tile-capable form already answers.

   THE MIRRORED PAIRS SHARE ONE SUBSTANCE. `belt_r`/`belt_l`,
   `talos_head`/`talos_head_l` and `cyclops_maw`/`cyclops_maw_l` are each one
   `variantOf` row overriding only `belt`/`mine`'s own facing key -- derived
   here from that SHAPE (variantOf + belt-or-mine override) rather than
   hand-listed, so a future mirrored pair added the same way needs no edit
   here. A held pair therefore resolves to a CONCRETE machine id off the
   player's own `face` (+-1) at the moment of placement, the identical
   direction convention `belt.dir`/`mine.facing` already carry -- "aim
   decides", the same rule mining already lives by. */
const MIRROR_TO_BASE = Object.freeze(Object.fromEntries(
  MACHINES.filter(m => m.variantOf && (m.belt || m.mine)).map(m => [m.id, m.variantOf])));
const BASE_TO_MIRROR = Object.freeze(Object.fromEntries(
  Object.entries(MIRROR_TO_BASE).map(([mirror, base]) => [base, mirror])));

/* The substance a machine id's held item lives under -- itself, unless it is
   a mirrored "_l" row, which shares its base's substance. A row with no
   substance at all (`kiln_divine` -- see `data/substances.js`'s own comment
   on why one was not shippable) simply will not resolve through `S[...]`
   below, which is exactly "never placeable" without a special case. */
const heldSubIdOf = machineId => MIRROR_TO_BASE[machineId] || machineId;

/* Does the player currently hold this machine's own built item? The
   placement gate `placementCheck` uses below, and the query
   `rules/placement.js#deconstruct`'s refund and `placeMachine`'s spend both
   need answered the identical way -- one substance ordinal, or `undefined`
   if this machine id has no held form at all. */
export function machineHeldSub(machineId) {
  return S[heldSubIdOf(machineId)];
}

/* Which concrete machine id a held machine substance places as. Identity for
   every non-mirrored machine; for a mirrored pair, resolves off
   `player.face` exactly as this block's own header explains. Exported for
   `rules/placement.js#placeableFromPockets`'s extension and
   `shell/main.js#applyIntents`'s `cmd.place` dispatch, both of which start
   from a held SUBSTANCE ordinal (from the pockets) and need the concrete
   machine id `placeMachine` takes. */
export function machineIdFor(sub) {
  const id = SUB[sub]?.id;
  if (id === undefined) return null;
  const mirror = BASE_TO_MIRROR[id];
  return mirror && player.face < 0 ? mirror : id;
}

/* Whether a machine may be placed at this exact footprint, RIGHT NOW -- every
   refusal `rules/placement.js#placeMachine` can produce, as a query instead of
   a side effect. Phase 3 (`docs/BUILD_PLAN.md`): the ghost preview in `view/`
   needs the same yes/no the placement rule enforces, and `view` may not
   import `rules` -- the same reason `canAfford` above already had to become a
   model query rather than staying private to `rules/placement.js`. ONE
   implementation, TWO readers: this function decides, `rules/placement.js`
   calls it and turns a `false` into a journal row, `view` calls it and turns
   a `false` into a tinted ghost with `why` drawn beside it. Neither reader
   keeps a second copy of the checks.

   Checked in the SAME order `rules/placement.js` always has: footprint, then
   footing, then depth, then (for a lift stage) the shaft it would need to
   reach, then affordability LAST -- so a placement that cannot happen for a
   structural reason never has to answer "and could you even pay for it". */
export function placementCheck(band, machineId, tx, ty) {
  const defIdx = M[machineId];
  const def = MACH[defIdx];
  if (def === undefined) return { ok:false, why:'NO SUCH MACHINE' };
  if (!canPlace(machineId)) return { ok:false, why:'THE GODS HAVE NOT GRANTED IT' };

  for (let j = 0; j < def.th; j++)
    for (let i = 0; i < def.tw; i++) {
      if (!inBounds(band, tx + i, ty + j)) return { ok:false, why:'NOT THERE' };
      if (tileAt(band, tx + i, ty + j) !== AIR) return { ok:false, why:'NEEDS CLEAR SPACE' };
      if (machineAt(band, tx + i, ty + j)) return { ok:false, why:'SOMETHING IS ALREADY THERE' };
    }

  let footing = 0;
  for (let i = 0; i < def.tw; i++) if (solidAt(band, tx + i, ty + def.th)) footing++;
  if (footing < def.footing) return { ok:false, why:'NEEDS A FLOOR' };

  /* DEPTH GATE, identical datum the HUD's depth gauge reads -- see
     `rules/placement.js`'s own copy of this comment, which this replaces. */
  if (def.minDepth) {
    const ref = bandOf(SPAWN_BAND);
    const datum = worldY(ref, ref.cfg.floorTy ?? 0);
    const depth = (worldY(band, ty) - datum) / ref.tile;
    if (depth < def.minDepth) return { ok:false, why:'TOO SHALLOW' };
  }

  /* THE WINCH IS THE STAGED LIFT AND THE GAME'S BOTTLENECK (invariant 4: five
     independent stages, never one continuous cage). A stage whose `lift.span`
     does not actually reach `lift.toBand` from where it is about to stand
     would place, run, and never once deliver anything -- a machine that
     silently cannot do its one job is worse than a refusal that says so up
     front. Same arithmetic `rules/lift.js#reaches` uses on an already-placed
     record (`m.box.x + m.box.w/2`, `m.box.y - def.lift.span`), computed here
     from the footprint being proposed instead -- `rules/lift.js` is a `rules`
     sibling and this file may not import it (rules do not import rules, and a
     model query may not import rules at all), so the ONE arithmetic fact is
     duplicated across a layer boundary rather than shared past it. */
  if (def.lift) {
    const cx = worldX(band, tx) + def.tw * band.tile / 2;
    const topY = worldY(band, ty) - def.lift.span;
    if (bandAt(cx, topY) !== bandOf(def.lift.toBand)) return { ok:false, why:'NO SHAFT TO SERVE' };
  }

  /* A machine is a held item now, not a bill spent at this moment -- see
     `machineHeldSub`'s own header. `undefined` (a machine id with no
     substance at all) never passes. */
  const heldSub = machineHeldSub(machineId);
  if (heldSub === undefined || invCount(heldSub, F.rig) < 1) return { ok:false, why:'NOTHING BUILT YET' };

  return { ok:true, why:null };
}

/* Does the pocket ledger hold at least `n` of a SINGLE pair matching `sel`?
   Mirrors `rules/machines.js`'s private `best`, specialised to `run.inv` --
   exposed here rather than left inside a `rules` module for the same reason
   as `canAfford` above: the CRAFT panel needs to grey out an unaffordable
   hand-recipe with no `rules` import available to it. */
/* Total carried mass, in TALENTS -- CLAUDE.md D3. A query on numbers, so it
   is `model`, not `rules`: the DECISION about what a burdened player may
   still do -- `rules/player.js`'s climb falloff and ladder/hop lockout,
   `rules/items.js`'s pickup refusal, `rules/lift.js`'s boarding refusal --
   all read this, but none of that decision lives here. */
export function burdenOf() {
  let mass = 0;
  for (const k in run.inv) {
    const { sub, form } = parseKey(k);
    mass += massOfPair(sub, form) * run.inv[k];
  }
  return mass;
}

/* Fraction of the hard cap (`eff('burden')`) currently carried. `>= 1` is
   the lockout threshold `rules/player.js` reads; `eff('burdenSoft')` is
   where climb speed starts falling off before that. */
export const burdenFrac = () => burdenOf() / eff('burden');

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

/* Has this recipe been stolen yet? See `RUN_SCHEMA.known`'s header comment --
   every `HAND_RECIPES` id is known from run start today, so this is always
   true until a real locking source exists. Exported now, rather than left
   inline in the CRAFTING tab, for the same reason `canCraft` above is: a
   query on `run` is `model`'s to own, not `view`'s. */
export const isKnown = id => run.known.includes(id);

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

/* The highest-tier `item.tool` relic currently held (Phase 2c), or null with
   none. TOOLS ARE RELIC SUBSTANCES, not a new table: the stock pick and the
   adamant auger are both ordinary rows in `data/substances.js` tagged
   `relic`, and `item.tool:{tier, power}` is the only thing that marks one as
   a tool. A straight scan of `run.inv`, not a cached field, for the same
   reason `hasPick` below was never a flag: a field that can disagree with
   the pockets is a field that will. Ties keep the first found -- content
   never ships two tools at the same tier, so this never has to choose. */
export function bestTool() {
  let best = null;
  for (const k in run.inv) {
    if (!run.inv[k]) continue;
    const { sub, form } = parseKey(k);
    if (form !== F.relic) continue;
    const tool = SUB[sub]?.item?.tool;
    if (tool && (!best || tool.tier > best.tier)) best = tool;
  }
  return best;
}

/* Whether the player holds ANY mining tool -- `shell/boot.js` plants the
   stock pick near spawn every run, and this is true from the moment it (or
   any tool) is picked up. Expressed through `bestTool()` rather than the
   `S.pick`-specific `invCount` check it used to be, so an auger alone also
   satisfies it -- nothing that called this for "may this player dig at all"
   was ever asking about the STOCK pick specifically. */
export const hasPick = () => bestTool() !== null;

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
