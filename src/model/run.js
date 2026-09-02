/* LAYER model — run-scoped state and meta-state, split by object.
   Imports `core`, `data`, `model`. May be imported by `model`, `rules`, `view`.

   THE SPLIT, in the object shape: two records, `run` and `meta`, and which one
   a field belongs in is decided by one question -- does a death erase it? See
   docs/DEVELOPER_GUIDE.md#run-state-and-run_schema

   Every field a `newRun()` must reset is declared ONCE, in RUN_SCHEMA, and
   reset mechanically. The previous codebase disagreed with itself about the
   shape of `run` in four places -- three fields that other modules each invented
   -- and that class of bug is what a schema is for. */

import { AIR, F, byHudOrder, matches } from '../data/forms.js';
import { CYCLE, CYCLES } from '../data/cycles.js';
import { S, SUB } from '../data/substances.js';
import { STARTING_MACHINES } from '../data/grants.js';
import { HAND_RECIPES, RECIPES } from '../data/recipes.js';
import { M, MACH, MACHINES } from '../data/machines.js';
import { SPAWN_BAND } from '../data/world.js';
import { bump } from './epoch.js';
import { keyOf, massOfPair } from './items.js';
import { machineAt } from './machines.js';
import { eff } from './mods.js';
import { player } from './player.js';
import { solidAt, tileAt } from './tiles.js';
import { bandOf, inBounds, worldY } from './world.js';

export const RUN_SCHEMA = Object.freeze({
  seed: 1337, t: 0,
  dead: false, deathCause: '',
  hearts: 5, maxHearts: 5, invuln: 0,
  inv: null,            // FIXED-LENGTH array, `{sub,form,n} | null` per slot
                        // (docs/PLAN-phase12.md D-G) -- length `mainSlots +
                        // eff('quickbarSlots')`, the tail being the quickbar's
                        // own storage, not a mirror of it. A drafted trinket
                        // and the starting pick both live here too, see
                        // `rules/trinkets.js` and `hasPick()` below
  mainSlots: 0,          // placeholder; `Math.round(eff('invSlots'))` at reset,
                        // fixed for the run -- see `write.reset()` below
  granted: null,        // machine ids this run may place
  deepest: 0,           // world px, for the depth gauge and for `meta`

  /* ---- THE TRIBUTE LEDGER (Phase 10b, docs/SPEC.md section 18.5) ----------
     Five fields, and the first two are the pair that was scaffolded here in
     Phase 3 and had zero callers until now.

     `cycle` is WHICH ROW OF `data/cycles.js` is live, one-based, so
     `CYCLES[run.cycle - 1]` is the current trial and `run.cycle > CYCLES.length`
     is "every shipped trial is done". Incremented by `rules/cycles.js` on a
     completion and by nothing else.

     `tribute` is the LIVE DEMAND or `null` when none is armed:
     `{ id, have, left }`. `id` is the `data/cycles.js` row's own id, so the
     record survives a table reorder; `have` is keyed by the `sub/form` string
     from `model/items.js#keyOf`, the SAME convention `m.buf` still uses
     (`run.inv` moved to a slot array in Phase 12c, `have` did not -- a
     delivery ledger has no position, only a count per pair), so a receiver's
     buffer can be poured into it without a translation; `left` is seconds
     remaining, or `null` for a cycle with no
     clock.

     `left` IS AN ACCUMULATOR ON `run` AND NOT A MODULE SCALAR, and that is
     load-bearing rather than stylistic -- see `brandLeft` below, whose own
     comment records the same decision for the same reason. A timer in
     `rules/cycles.js`'s module scope would have no `newRun()` hook, which is
     precisely the invariant-8 bug the schema exists to forbid. It counts down
     from `dt` at the fixed 1/120 s step and NEVER from `Date.now()`: a deadline
     is the first wall-clock quantity this game has ever had, and invariant 10
     applies to it exactly as it does to a falling player.

     `favour` is `{ [godId]: int }`, RUN-SCOPED (decision I): a god you have not
     dealt with THIS run reads `????????`, so the FAVOUR panel is a picture of
     this Torment. `meta.godsMet` gets the asking god's id pushed into it on
     first ask, which is what that field was reserved for -- but the panel is
     never drawn off `meta`, because `meta` has no save and that would be a
     cross-run promise the build cannot keep.

     `charted` is band ids, and it is KNOWLEDGE AND NOT ACCESS
     (docs/PLAN-phase10.md 3.4): there is no band lock anywhere in this game
     and this does not invent one. Nothing stops a player digging into topsoil
     on minute three; charting takes the mask off a band's NAME.

     `misses` is how many deadlines have expired. Two ends the run, through the
     existing `write.hurt` and no new death path.

     `favour` and `charted` are built FRESH in `write.reset()` below, not here,
     for the identical reason `inv`/`granted`/`known`/`equipped` are: a
     container on a shared frozen template is the one mutable reference every
     run in the process would share. */
  cycle: 1, tribute: null,
  favour: null, charted: null, misses: 0,

  /* `offer` IS THE DRAFT BRIDGE, and it exists only because a `rules` module
     may not reach `shell/input.js#wants` (`tools/layers.mjs`'s `rules -> shell`
     ban): `rules/cycles.js#complete` cannot call `wants.draft = tier` itself,
     so it writes the tier NAME here instead and `shell/main.js` performs the
     identical "first undrafted row" lookup it already runs for the four
     debug-key drafts, then clears this field -- one event, one dispatch path,
     regardless of whether a key or a completed trial requested it. A scalar,
     not a container, so no fresh-build in `reset()` is needed. */
  offer: null,

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

  /* Which recipes the player has learned; the CRAFTING tab draws an unlearned
     one as a locked silhouette. A plain ARRAY of recipe id strings, matching
     `run.granted`'s own convention rather than a `Set`, because both are
     plain-serialisable and a save string wants the same shape everywhere.
     SEEDED WITH EVERY `HAND_RECIPES` ID in `write.reset()` below: nothing is
     actually lockable yet, because no source exists that reveals a recipe. */
  known: null,

  /* Seconds left on the one lit `timber/brand`. Same shape as `craftProgress`
     immediately above and for the identical reason: a player has one pair of
     hands, there is only ever one lit brand, and a scalar on `run` resets
     with everything else (invariant 8) for free. Written and ticked by
     `rules/light.js`; the alternative was module-scoped state there with no
     `newRun()` hook to clear it, which invariant 8 exists to forbid. */
  brandLeft: 0,

  /* Which beat of docs/SPEC.md section 5's first-two-minutes sheet the player
     has already passed. 0 is "nothing yet"; N means beats 1..N have fired.
     A COUNTER AND NOT A SET OF FLAGS, because the sheet is a sequence: beat
     N+1's condition is only ever asked once beat N has fired, so a player
     who happens to satisfy a later beat early does not skip the lesson
     before it. Advanced by `rules/tutorial.js` (the decision), read through
     `model/tutorial.js#beat` (the query). Beat indices 5 and 6 are RESERVED
     -- the altar and the furnace gift do not exist in code yet, so nothing
     advances into them until Phase 10's cycle director does. Here rather
     than in a module of its own for the same reason `craftProgress` and
     `brandLeft` above are: it resets with everything else (invariant 8) for
     free, and a beat sheet surviving a restart is exactly the determinism
     bug that invariant names. */
  tutorialBeat: 0
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
    const mainSlots = Math.max(0, Math.round(eff('invSlots')));
    const quickbarSlots = Math.max(0, Math.round(eff('quickbarSlots')));
    Object.assign(run, RUN_SCHEMA, {
      seed,
      inv: Array.from({ length: mainSlots + quickbarSlots }, () => null),
      mainSlots,
      granted: [...STARTING_MACHINES],
      tribute: null,
      /* FRESH CONTAINERS, same reason as `granted` above and `known`/`equipped`
         below -- see `RUN_SCHEMA.favour`'s own comment. */
      favour: {},
      charted: [],
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

  /* MERGE-FIRST, always: the whole array is searched for an existing stack of
     this exact pair before a new slot is ever allocated, so two slots holding
     the identical pair simultaneously cannot occur (docs/PLAN-phase12.md
     D-G) -- `invCount` stays a single lookup, never a sum across positions.
     A brand-new pair may only land in `[0, run.mainSlots)`: the quickbar's
     own tail is populated only by a deliberate drag, never by a pickup.
     Returns FALSE, now, on no existing stack and no free main slot -- the
     one new way a pickup may be refused (D-G/D-H, `rules/items.js#step`). */
  collect(sub, form, n) {
    const i = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
    if (i !== -1) { run.inv[i].n += n; bump(); return true; }
    const free = run.inv.findIndex((s, idx) => s === null && idx < run.mainSlots);
    if (free === -1) return false;               // no existing stack, no free MAIN slot
    run.inv[free] = { sub, form, n };
    bump();
    return true;
  },

  spend(sub, form, n) {
    const i = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
    if (i === -1 || run.inv[i].n < n) return false;
    run.inv[i].n -= n;
    if (run.inv[i].n <= 0) run.inv[i] = null;
    bump();
    return true;
  },

  /* Unconditional swap of two positions -- reordering within one grid, moving
     into an empty cell, and moving cross-grid (main <-> quickbar) are all the
     SAME operation on one array (docs/PLAN-phase12.md D-H): swapping with an
     empty slot already IS a move, swapping two occupied slots already IS a
     reorder. Out-of-range or a no-op swap is silently ignored, the same
     "shrinking a slot count must not crash a frame still iterating the old
     length" convention `write.equip` below already follows. */
  moveSlot(from, to) {
    if (from < 0 || from >= run.inv.length || to < 0 || to >= run.inv.length || from === to) return;
    const tmp = run.inv[to];
    run.inv[to] = run.inv[from];
    run.inv[from] = tmp;
    bump();
  },

  /* Hearts are SPENT, not consumed as an item -- never through `inv`, which is
     why the HUD keeps drawing five hearts and nothing here changes shape.

     NO CALLER TODAY. Its one consumer was `data/sources.js#vital`, which fed
     the retired winch stage's heart-fuelled recipe and was deleted with it in
     Phase 8f (docs/PLAN-gears-and-winches.md A5: the crank is manual only and
     the blood-winch trap does not carry forward). Kept because THE RULE lives
     here and nowhere else -- "a machine may not kill you", the line below --
     and re-deriving that on the day something spends hearts again is how two
     spenders end up disagreeing about whether the last one may go. */
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

  /* ---- the tribute ledger's writers, all in `grant`'s one-line style ----
     `tribute` sets or clears the WHOLE live-demand record, so a demand and its
     own deadline can never be observed half-applied -- the same reason
     `craft` below writes its pair together. `rules/cycles.js` is the only
     caller of any of these.

     `favour` and `chart` are both IDEMPOTENT-SAFE in the way their field
     wants: favour accumulates (a second trial for the same god adds), charting
     is a set (charting a band twice is charting it once). `miss` is a plain
     increment and the DECISION about what two misses mean stays in
     `rules/cycles.js` -- death goes through `hurt` below, so there is exactly
     one death path in this file and the director does not get a second. */
  tribute(t)        { run.tribute = t; bump(); },
  favour(god, n)    { run.favour[god] = (run.favour[god] || 0) + n; bump(); },
  chart(bandId)     { if (!run.charted.includes(bandId)) run.charted.push(bandId); bump(); },
  miss()            { run.misses++; bump(); },
  cycle(n)          { run.cycle = n; bump(); },
  offer(tier)       { run.offer = tier; bump(); },

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
  brand(secsLeft) { run.brandLeft = Math.max(0, secsLeft); bump(); },

  /* One step along docs/SPEC.md section 5's beat sheet. TAKES NO ARGUMENT ON
     PURPOSE: the field is monotonic and one-way (see
     `RUN_SCHEMA.tutorialBeat`), and a writer that cannot be handed a number
     cannot be handed a smaller one. The DECISION about whether a beat's
     condition holds is `rules/tutorial.js`'s; this is only the increment. */
  advanceBeat() { run.tutorialBeat++; bump(); }
};

/* ---- queries ---- */

export const invCount = (sub, form) => {
  const s = run.inv.find(s => s && s.sub === sub && s.form === form);
  return s ? s.n : 0;
};
export const hearts   = () => run.hearts;
export const canPlace = machineId => run.granted.includes(machineId);

/* ---- machine items. A machine is a held `<id>/rig` pair, so "may this be
   placed" is "is one currently held" -- the same `invCount` question a
   tile-capable form already answers.
   See docs/DEVELOPER_GUIDE.md#a-machine-is-a-held-item

   THE MIRRORED PAIRS SHARE ONE SUBSTANCE. `belt_r`/`belt_l`,
   `talos_head`/`talos_head_l` and `cyclops_maw`/`cyclops_maw_l` are each one
   `variantOf` row overriding only `belt`/`mine`'s own facing key -- derived
   here from that SHAPE (variantOf + belt-or-mine override) rather than
   hand-listed, so a future mirrored pair added the same way needs no edit
   here. See docs/DEVELOPER_GUIDE.md#mirrored-machine-pairs */
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
   a side effect: the ghost preview in `view/` needs the same yes/no the
   placement rule enforces, and `view` may not import `rules`
   (docs/DEVELOPER_GUIDE.md#one-decision-two-readers). ONE
   implementation, TWO readers: this function decides, `rules/placement.js`
   calls it and turns a `false` into a journal row, `view` calls it and turns
   a `false` into a tinted ghost with `why` drawn beside it. Neither reader
   keeps a second copy of the checks.

   Checked in the SAME order `rules/placement.js` always has: footprint, then
   footing, then depth, then affordability LAST -- so a placement that cannot
   happen for a structural reason never has to answer "and could you even pay
   for it". (There used to be a fourth structural check between depth and
   affordability, for the retired winch stage's own shaft; see below for why
   nothing replaced it.) */
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

  /* THERE IS NO 'NO SHAFT TO SERVE' CHECK ANY MORE, and its absence is the
     point. The staged winch declared a destination band and a span on its own
     row, so a stage could be placed where its span reached nothing -- a
     machine that silently cannot do its one job -- and this function refused
     it up front by duplicating `reaches()`'s arithmetic across the layer
     boundary. Phase 8f deleted the winch. A HUB DECLARES NOTHING: whether it
     can serve anything at all is a property of a SEGMENT, which is two hubs
     and the space between them, and `model/segments.js#linkCheck` is where
     that is decided -- reach, clear path and all. A lone machine no longer
     has to guess about a band it might one day reach, so there is nothing
     here to check and nothing duplicated across a boundary to keep in sync.
     See docs/SPEC.md section 17.6. */

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
   the CRAFT panel needs any of this file's other queries: it must grey out
   an unaffordable hand-recipe with no `rules` import available to it. */
/* Total carried mass, in TALENTS -- CLAUDE.md D3. A query on numbers, so it
   is `model`, not `rules`: the DECISION about what a burdened player may
   still do -- `rules/player.js`'s climb falloff and ladder/hop lockout,
   `rules/items.js`'s pickup refusal, and `rules/drive.js`'s own arithmetic
   for a rider's weight on a carrier (D4 as amended: boarding is never refused,
   it is just heavy) -- all read this, but none of that decision lives here. */
export function burdenOf() {
  let mass = 0;
  for (const slot of run.inv) if (slot) mass += massOfPair(slot.sub, slot.form) * slot.n;
  return mass;
}

/* Fraction of the hard cap (`eff('burden')`) currently carried. `>= 1` is
   the lockout threshold `rules/player.js` reads; `eff('burdenSoft')` is
   where climb speed starts falling off before that. */
export const burdenFrac = () => burdenOf() / eff('burden');

export function pocketsHave(sel, n) {
  for (const slot of run.inv) if (slot && slot.n >= n && matches(sel, slot.sub, slot.form)) return true;
  return false;
}

/* Largest single matching pair's count -- `rules/machines.js`/`rules/
   crafting.js`'s own duplicate dict scans, retired onto this and
   `pocketedPair` below (docs/PLAN-phase12.md D-G). */
export function pocketedBest(sel) {
  let n = 0;
  for (const slot of run.inv) if (slot && matches(sel, slot.sub, slot.form) && slot.n > n) n = slot.n;
  return n;
}

/* First matching pair holding at least `need` units, or `null`. */
export function pocketedPair(sel, need) {
  for (const slot of run.inv) if (slot && slot.n >= need && matches(sel, slot.sub, slot.form)) return { sub: slot.sub, form: slot.form };
  return null;
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

/* ---- the tribute ledger's queries (Phase 10b, docs/SPEC.md 18.5) ------------
   ONE DECISION, TWO READERS, and that is why completion lives HERE and not in
   the director: `rules/cycles.js` enforces "is this trial paid" and the
   TRIBUTE panel has to draw the same yes/no, and `view` may not import `rules`
   (docs/DEVELOPER_GUIDE.md#one-decision-two-readers). The identical argument
   `model/run.js#placementCheck` and `model/segments.js#linkCheck` already
   stand on.

   `cycleRow()` is the live row or `null`, resolved by ID and not by index, so
   the answer does not change if `data/cycles.js` is reordered and a saved
   `run.tribute` can never come to mean a different trial. Falls back to
   `run.cycle`'s own row when nothing is armed yet, which is what the director
   asks for when it decides WHAT to arm. */
export function cycleRow() {
  if (run.tribute) return CYCLE[run.tribute.id] ?? null;
  return CYCLES[run.cycle - 1] ?? null;
}

/* Units of one demand row currently in the ledger. Keyed the `model/items.js`
   way, so this is a lookup and not a scan. */
export const tributeHave = (sub, form) =>
  (run.tribute?.have?.[keyOf(S[sub], F[form])] ?? 0);

/* Is every demand row of the LIVE cycle satisfied? False with nothing armed --
   an unarmed ledger is not a met one, and a director that read `true` there
   would complete a trial nobody had been asked to perform.

   NOT CLAMPED PER ROW: `have` may exceed `n` (a haul of five arrives against a
   demand for three), and over-delivery is accepted rather than refused, which
   is invariant 5's "material that falls in is free" applied to a receiver. */
export function tributeMet() {
  const row = run.tribute ? CYCLE[run.tribute.id] : null;
  if (!row) return false;
  return row.demand.every(d => tributeHave(d.sub, d.form) >= d.n);
}

/* The grant tier's real teeth (see docs/DEVELOPER_GUIDE.md#adding-a-recipe): a
   MACHINE-BUILD recipe (`data/recipes.js`'s own block of `<id>/rig`-producing
   rows, e.g. `furnace`, `talos_head`) is known only once that machine id has
   actually been granted -- `STARTING_MACHINES` or `rules/grants.js#grant()`
   this run, the SAME `canPlace` check `placementCheck`/`placeMachine` already
   gate placement on, called here rather than duplicated. Derived from the
   recipe's OWN output clause, not a second machine-id list kept in sync by
   hand: an `out` clause naming a literal substance in `rig` form whose `sub`
   resolves in `data/machines.js#M` names its own gate by construction, so a
   future machine-build recipe is covered with no edit here. `null` for
   anything else (a `subFrom` output, a non-`rig` form, an unresolvable
   `sub`) -- every ORDINARY hand recipe, unaffected, per `RUN_SCHEMA.known`'s
   own "everything else stays known" seed. */
function machineOutputOf(r) {
  const out = r?.out?.[0];
  if (!out || out.sub === undefined || out.form !== 'rig') return null;
  return M[out.sub] !== undefined ? out.sub : null;
}

/* Has this recipe been stolen yet? See `RUN_SCHEMA.known`'s header comment --
   every `HAND_RECIPES` id is seeded known at run start; a machine-build
   recipe narrows that down further, per `machineOutputOf` above. Exported
   now, rather than left inline in the CRAFTING tab, for the same reason
   `canCraft` above is: a query on `run` is `model`'s to own, not `view`'s. */
export function isKnown(id) {
  if (!run.known.includes(id)) return false;
  const machineId = machineOutputOf(RECIPES[id]);
  return machineId === null || canPlace(machineId);
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
  for (const slot of run.inv) {
    if (!slot || slot.form !== F.relic) continue;
    const tool = SUB[slot.sub]?.item?.tool;
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
  const out = [];
  for (const slot of run.inv) if (slot) out.push({ sub: slot.sub, form: slot.form, n: slot.n });
  SUB.forEach((s, i) => {
    if (!s.item?.hud?.always) return;
    const f = F[s.tile?.drops];
    if (f === undefined) return;
    if (!out.some(r => r.sub === i && r.form === f)) out.push({ sub: i, form: f, n: 0 });
  });
  return out.sort(byHudOrder);
}
