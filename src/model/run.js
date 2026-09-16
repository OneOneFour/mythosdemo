/* LAYER model — run-scoped state and meta-state, split by object.
   Imports `core`, `data`, `model`. May be imported by `model`, `rules`, `view`.

   Two records, `run` and `meta`, and which one a field belongs in is decided
   by one question -- does a death erase it?

   Every field a `newRun()` must reset is declared ONCE, in RUN_SCHEMA, and
   reset mechanically. Four fields used to disagree about the shape of `run`,
   which is the class of bug a schema is for. */

import { AIR, F, byHudOrder, matches } from '../data/forms.js';
import { CYCLE, CYCLES } from '../data/cycles.js';
import { S, SUB } from '../data/substances.js';
import { STARTING_MACHINES } from '../data/grants.js';
import { HAND_RECIPES, RECIPES } from '../data/recipes.js';
import { M, MACH, MACHINES } from '../data/machines.js';
import { BAND, SPAWN_BAND } from '../data/world.js';
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
  inv: null,            // FIXED-LENGTH `{sub,form,n} | null` per slot, length
                        // `mainSlots + eff('quickbarSlots')`. The tail IS the
                        // quickbar's storage, not a mirror of it.
  mainSlots: 0,          // placeholder; `Math.round(eff('invSlots'))` at reset,
                        // fixed for the run -- see `write.reset()` below
  granted: null,        // machine ids this run may place
  deepest: 0,           // world px, for the depth gauge and for `meta`

  /* THE TRIBUTE LEDGER.
     `cycle`    which `data/cycles.js` row is live, ONE-BASED.
     `tribute`  the live demand or `null`: `{ id, have, left, credits }`. `id`
                is the row's id, so it survives a table reorder; `have` is
                keyed by `keyOf`'s `sub/form`, so a receiver's buffer pours in
                untranslated; `left` is seconds, or `null` for a cycle with no
                clock, counted from `dt` and NEVER from `Date.now()`.
     `credits`  the batch clause's `{ t, n }` in nondecreasing `t`, pruned on
                every write so it is bounded by `batch.n`.
     `favour`   `{ [godId]: int }`, RUN-SCOPED. A god not dealt with this run
                reads `????????`. Never drawn off `meta`, which has no save.
     `charted`  band ids, KNOWLEDGE rather than ACCESS -- nothing stops a
                player digging into topsoil on minute three.
     `misses`   expired deadlines; two ends the run through `write.hurt`.
     `favour` and `charted` build FRESH in `write.reset()`, because a
     container on a frozen template is one reference every run shares. */
  cycle: 1, tribute: null,
  favour: null, charted: null, misses: 0,

  /* EVERY SHIPPED TRIAL PAID -- the run's one win state, and the only end
     condition in the game that is not death.
     `run.cycle > CYCLES.length` is the FACT; this flag is the EVENT, set
     once by `rules/cycles.js#ensureLiveCycle` the frame it first becomes
     true, and it exists rather than being re-derived in `view` for the same
     reason `run.dead` does: an end-of-run screen needs a moment to announce,
     and only a `rules` module may push the journal row that announces it. A
     boolean and not a timestamp, because nothing measures how long ago the
     run was won. */
  won: false,

  /* THE GRANT BRIDGE, and `offer`'s sibling for the same reason:
     `rules/cycles.js` may not import `rules/grants.js`, so a completed
     trial's `reward.grants` cannot be performed where it is decided. The
     director writes the machine ids here and `rules/grants.js#step` --
     scheduled immediately after it, which is what keeps latency at zero
     frames -- performs each through the same path a drafted grant takes.
     `write.grant` below has exactly one calling module.

     A fresh ARRAY per write and `null` when empty, so the frozen template's
     own `null` is the reset and `write.reset()` rebuilds nothing. */
  awarded: null,

  /* THE DRAFT BRIDGE, `{ tier, god, ids, pool } | null`. It exists because a
     `rules` module may not reach `shell/input.js#wants`, so
     `rules/cycles.js#complete` writes the tier name here and `shell/main.js`
     dispatches -- one path for a key and for a completed trial.

     `ids` IS THE OFFER and `null` IS A REQUEST FOR ONE, because only `shell`
     sees all four tiers' `draftable()` lists. The ids are WORLD state from the
     seeded stream, so a replayed run lays out the same cards. `god` is STORED
     rather than derived, since `run.cycle` names the previous trial's god on a
     debug draft, and `pool` lets `canReroll` refuse a transposition. */
  offer: null,

  /* A fixed-length SELECTION over `run.inv`, not a second inventory. Holds
     substance ORDINALS, or `null` for an empty slot, capped by
     `eff('trinketSlots')`. Built fresh in `write.reset()`, because an array
     on a shared frozen object is one mutable reference every run shares. */
  equipped: null,

  /* The hand-craft bar. A scalar, not a Map like `model/mining.js#dig.work` --
     a player has one pair of hands, so there is only ever one craft in
     flight, and it belongs on `run` rather than in a dedicated module so it
     resets with everything else for free. `craftRecipe` is
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

  /* Seconds left on the one lit `timber/brand`. A scalar on `run`, like
     `craftProgress` above, because there is only ever one lit brand and it
     resets with everything else. Module-scoped state in `rules/light.js`
     would have no `newRun()` hook to clear it. */
  brandLeft: 0,

  /* Which tutorial beat the player has passed. 0 is "nothing yet"; N means
     beats 1..N have fired. A COUNTER and not a set of flags, because the
     sheet is a sequence -- beat N+1's condition is only asked once beat N has
     fired, so satisfying a later beat early does not skip the lesson before
     it. Advanced by `rules/tutorial.js`, read through
     `model/tutorial.js#beat`. Here rather than in its own module so it resets
     with everything else; a beat sheet surviving a restart is a determinism
     bug. */
  tutorialBeat: 0,

  /* Where and when the director last placed a machine for the player, or
     `null`. `{ x, y, t }` is world px of the box top-left plus `run.t`, so
     simulated seconds and never `Date.now()`. It lets `view/scene.js` tell
     how far through an arrival is by matching against `m.box.x`/`m.box.y`,
     so no machine NAME reaches `view`. A POSITION and not a machine
     reference, because `run` is plain-serialisable everywhere else. */
  arrival: null
});

export const META_SCHEMA = Object.freeze({
  runs: 0,
  bestDepth: 0,
  godsMet: null
});

export const run  = {};
export const meta = {};

/* Drop what the batch clause can no longer use. Credits are appended at
   `run.t`, which only increases, so the array is sorted by `t` and a prefix
   drop suffices. Two passes: what has aged out of the window, then the oldest
   of the rest while the newer suffix still reaches `batch.n`. The second pass
   is what bounds the array, and cannot change a later answer because
   `batchMet` is a threshold on that same suffix. Returns the array unchanged
   when nothing is dropped, so ticking a deadline allocates nothing. */
function prunedCredits(t) {
  const cs = t.credits;
  const batch = CYCLE[t.id]?.batch;
  if (!cs || !cs.length || !batch) return cs;
  let i = 0;
  while (i < cs.length && run.t - cs[i].t > batch.secs) i++;
  let sum = 0;
  for (let j = i; j < cs.length; j++) sum += cs[j].n;
  while (i < cs.length && sum - cs[i].n >= batch.n) { sum -= cs[i].n; i++; }
  return i === 0 ? cs : cs.slice(i);
}

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

  /* Merge first, always: the whole array is searched for an existing stack of
     this exact pair before a slot is allocated, so two slots can never hold
     the same pair and `invCount` stays one lookup.

     A brand-new pair fills the quickbar's tail left to right and only then
     the main grid, so mined material lands under the digit keys. Returns
     false with no stack and no free slot, which `rules/items.js#step` turns
     into a journal row and a pickup the ground keeps. */
  collect(sub, form, n) {
    const i = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
    if (i !== -1) { run.inv[i].n += n; bump(); return true; }
    const q = run.inv.findIndex((s, idx) => s === null && idx >= run.mainSlots);
    const free = q !== -1 ? q : run.inv.findIndex(s => s === null);
    if (free === -1) return false;
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

  /* Unconditional swap of two positions. Reorder within a grid, move into an
     empty cell, and move cross-grid are the SAME operation on one array:
     swapping with an empty slot IS a move, swapping two occupied IS a
     reorder. Out-of-range or a no-op swap is silently ignored, so shrinking
     a slot count cannot crash a frame still iterating the old length. */
  moveSlot(from, to) {
    if (from < 0 || from >= run.inv.length || to < 0 || to >= run.inv.length || from === to) return;
    const tmp = run.inv[to];
    run.inv[to] = run.inv[from];
    run.inv[from] = tmp;
    bump();
  },

  /* Hearts are SPENT, never consumed as an item through `inv`, which is why
     the HUD keeps drawing five and nothing here changes shape.

     NO CALLER TODAY. Kept because THE RULE lives here and nowhere else --
     "a machine may not kill you", the line below -- and re-deriving it on the
     day something spends hearts again is how two spenders come to disagree
     about whether the last one may go. */
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

  /* `tribute` sets or clears the WHOLE live-demand record, so a demand and its
     deadline can never be observed half-applied. It also prunes the batch
     ledger, which keeps `credits` bounded whichever caller built the record.
     `rules/cycles.js` is the only caller of any of these.

     `favour` accumulates and `chart` is a set, each idempotent-safe the way
     its field wants. `miss` is a plain increment; what two misses MEAN stays
     in `rules/cycles.js`, and death goes through `hurt` below, so this file
     has exactly one death path. */
  tribute(t)        { if (t) t.credits = prunedCredits(t); run.tribute = t; bump(); },
  favour(god, n)    { run.favour[god] = (run.favour[god] || 0) + n; bump(); },
  chart(bandId)     { if (!run.charted.includes(bandId)) run.charted.push(bandId); bump(); },
  miss()            { run.misses++; bump(); },
  cycle(n)          { run.cycle = n; bump(); },
  /* The draft bridge's one setter, in both its halves: `offer(tier, god)`
     raises a REQUEST (ids still null -- `rules/cycles.js` and the debug
     keys) and `offer(tier, god, ids, pool)` lays out the cards
     (`rules/draft.js`, the only caller that has any). `offer(null)` clears.
     ONE setter and not two, so `run.offer` keeps exactly one writer per
     layer; see `RUN_SCHEMA.offer`. */
  offer(tier, god = null, ids = null, pool = 0) {
    run.offer = tier ? { tier, god, ids, pool } : null;
    bump();
  },

  /* ONE-WAY, LIKE `advanceBeat` ABOVE AND FOR THE SAME REASON: it takes no
     argument, so a writer that cannot be handed a boolean cannot be handed
     `false`. A won run is not un-won. See `RUN_SCHEMA.won`. */
  win()             { run.won = true; bump(); },

  /* The grant bridge's one setter -- machine ids in, or `null` to clear.
     `rules/grants.js#step` clears it BEFORE performing the ids it took, so
     nothing can re-enter this queue from inside the award it triggered. See
     `RUN_SCHEMA.awarded`. */
  award(machineIds) { run.awarded = machineIds; bump(); },

  /* One trinket slot. `sub` is a substance ordinal or
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

  /* One step along the beat sheet. TAKES NO ARGUMENT on purpose: the field is
     monotonic, and a writer that cannot be handed a number cannot be handed
     a smaller one. Whether a beat's condition holds is
     `rules/tutorial.js`'s decision; this is only the increment. */
  advanceBeat() { run.tutorialBeat++; bump(); },

  /* Stamp a director placement for the renderer. `x`/`y` are the machine
     box's world-px top-left; the instant is taken from `run.t` here rather
     than passed in, so no caller can stamp one in the past. */
  arrival(x, y) { run.arrival = { x, y, t: run.t }; bump(); }
};


export const invCount = (sub, form) => {
  const s = run.inv.find(s => s && s.sub === sub && s.form === form);
  return s ? s.n : 0;
};
export const hearts   = () => run.hearts;
export const canPlace = machineId => run.granted.includes(machineId);

/* A machine is a held `<id>/rig` pair, so "may this be placed" is "is one
   currently held" -- the same `invCount` question a tile-capable form
   answers.

   The mirrored pairs share ONE substance. Each is a `variantOf` row
   overriding only `belt`/`mine`'s facing key, and they are derived from that
   SHAPE rather than hand-listed, so a future mirrored pair needs no edit. */
const MIRROR_TO_BASE = Object.freeze(Object.fromEntries(
  MACHINES.filter(m => m.variantOf && (m.belt || m.mine)).map(m => [m.id, m.variantOf])));
const BASE_TO_MIRROR = Object.freeze(Object.fromEntries(
  Object.entries(MIRROR_TO_BASE).map(([mirror, base]) => [base, mirror])));

/* This machine's mirrored twin, or `undefined` if it has none. A query over
   the same derivation above, exported because a gift is of a PAIR: granting
   `talos_head` alone would refuse every left-facing placement, since
   `placementCheck` is asked about the concrete id `machineIdFor` resolves off
   `player.face`. `rules/grants.js` is the only caller. */
export const mirrorOf = machineId => BASE_TO_MIRROR[machineId];

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

/* Whether a machine may be placed at this exact footprint, RIGHT NOW: every
   refusal `rules/placement.js#placeMachine` can produce, as a query rather
   than a side effect, because the ghost preview needs the same yes/no and
   `view` may not import `rules`. One implementation, two readers -- the rule
   turns a `false` into a journal row, `view` into a tinted ghost.

   Checked in the SAME order the rule uses: footprint, footing, depth, then
   affordability LAST, so a placement that cannot happen structurally never
   has to answer "and could you even pay for it". */
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

  /* BAND GATE. A band ID and not a negative `minDepth`: a band carries its own
     `origin` and `floorTy` and may be moved, so a threshold derived from them
     drifts and a band id cannot. Checked BEFORE the depth gate because it is
     the coarser location question, and refused with the band's display NAME
     rather than its id, so the message reads as a place. */
  if (def.band && band.id !== def.band)
    return { ok:false, why:'ONLY IN ' + (BAND[def.band]?.name ?? String(def.band).toUpperCase()) };

  /* DEPTH GATE, identical datum the HUD's depth gauge reads -- see
     `rules/placement.js`'s own copy of this comment, which this replaces. */
  if (def.minDepth) {
    const ref = bandOf(SPAWN_BAND);
    const datum = worldY(ref, ref.cfg.floorTy ?? 0);
    const depth = (worldY(band, ty) - datum) / ref.tile;
    if (depth < def.minDepth) return { ok:false, why:'TOO SHALLOW' };
  }

  /* A HUB DECLARES NOTHING, so there is no "can this reach anything" check
     here. Whether anything can be served is a property of a SEGMENT, which is
     two hubs and the space between them, and `model/segments.js#linkCheck`
     decides it -- reach, clear path and all. */

  /* A machine is a held item now, not a bill spent at this moment -- see
     `machineHeldSub`'s own header. `undefined` (a machine id with no
     substance at all) never passes. */
  const heldSub = machineHeldSub(machineId);
  if (heldSub === undefined || invCount(heldSub, F.rig) < 1) return { ok:false, why:'NOTHING BUILT YET' };

  return { ok:true, why:null };
}

/* Total carried mass, in TALENTS. A query on numbers, so `model` rather than
   `rules`: the climb falloff, the ladder and hop lockout, the pickup refusal
   and a rider's weight on a carrier all READ this, and none of those
   decisions lives here. */
export function burdenOf() {
  let mass = 0;
  for (const slot of run.inv) if (slot) mass += massOfPair(slot.sub, slot.form) * slot.n;
  return mass;
}

/* Fraction of the hard cap (`eff('burden')`) currently carried. `>= 1` is
   the lockout threshold `rules/player.js` reads; `eff('burdenSoft')` is
   where climb speed starts falling off before that. */
export const burdenFrac = () => burdenOf() / eff('burden');

/* Does the pocket ledger hold at least `n` of a SINGLE pair matching `sel`?
   Mirrors `rules/machines.js`'s private `best`, specialised to `run.inv` --
   exposed here rather than left inside a `rules` module for the same reason
   the CRAFT panel needs any of this file's other queries: it must grey out
   an unaffordable hand-recipe with no `rules` import available to it. */
export function pocketsHave(sel, n) {
  for (const slot of run.inv) if (slot && slot.n >= n && matches(sel, slot.sub, slot.form)) return true;
  return false;
}

/* Largest single matching pair's count. */
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

/* Completion lives HERE and not in the director, because `rules/cycles.js`
   enforces "is this trial paid" and the TRIBUTE panel must draw the same
   yes/no, and `view` may not import `rules`.

   `cycleRow()` is the live row or `null`, resolved by ID rather than index, so
   a reorder of `data/cycles.js` cannot make a saved `run.tribute` mean a
   different trial. Falls back to `run.cycle`'s own row when nothing is armed,
   which is what the director asks for when deciding what to arm. */
export function cycleRow() {
  if (run.tribute) return CYCLE[run.tribute.id] ?? null;
  return CYCLES[run.cycle - 1] ?? null;
}

/* Units of one demand row currently in the ledger. Keyed the `model/items.js`
   way, so this is a lookup and not a scan. */
export const tributeHave = (sub, form) =>
  (run.tribute?.have?.[keyOf(S[sub], F[form])] ?? 0);

/* Is the LIVE cycle paid? Every demand row AND the batch clause, as one
   predicate with two clauses, so the director and the TRIBUTE panel cannot
   disagree about which half is short. False with nothing armed, or a director
   reading `true` would complete a trial nobody was asked to perform.

   NOT clamped per row: `have` may exceed `n` when a haul of five lands
   against a demand for three, and over-delivery is accepted because material
   that falls in is free. */
export function tributeMet() {
  const row = run.tribute ? CYCLE[run.tribute.id] : null;
  if (!row) return false;
  return row.demand.every(d => tributeHave(d.sub, d.form) >= d.n) && batchMet();
}

/* Progress towards the batch clause, summed over `run.tribute.credits`
   against `run.t` -- simulated time, never `Date.now()`. A credit counts
   while it is at most `batch.secs` old, so the boundary is inclusive, and 0
   when no batch clause is armed.

   SATURATES near `batch.n` and is NOT a delivery count: `prunedCredits` drops
   entries the clause no longer needs, so this reads a little over `batch.n`
   however many really landed. Exact for a bar clamped at `batch.n`, which is
   what it is for; a raw delivery readout must come from elsewhere. */
export function batchHave() {
  const batch = run.tribute ? CYCLE[run.tribute.id]?.batch : null;
  if (!batch) return 0;
  let sum = 0;
  for (const c of run.tribute.credits ?? [])
    if (run.t - c.t <= batch.secs) sum += c.n;
  return sum;
}

/* Is the live cycle's batch clause satisfied? VACUOUSLY TRUE on a row that
   carries no `batch` block, which is every shipped row but cycle 4, so
   `tributeMet` above can `&&` it with no branch and a future row adding a
   clause needs no edit here. */
export function batchMet() {
  const batch = run.tribute ? CYCLE[run.tribute.id]?.batch : null;
  return !batch || batchHave() >= batch.n;
}

/* Four queries, here rather than in `rules/draft.js`, because the module that
   SPENDS the favour and the one that draws the price dimmed both have to
   agree and may not import each other. `canReroll` is the whole predicate, so
   whoever dims the row and whoever refuses the press cannot disagree. */
export const offerGod = () => run.offer?.god ?? null;

export const rerollPrice = () => Math.max(0, Math.round(eff('rerollCost')));

/* A second look at the same cards is not a second look. With the pool no
   bigger than the offer -- the grant tier is 2 rows and lays out 2 -- a
   re-pick can only transpose what is on the table, so the reroll is refused
   rather than sold. */
export const offerExhausted = () => !!run.offer?.ids && run.offer.pool <= run.offer.ids.length;

export const canReroll = god =>
  god != null && !offerExhausted() && (run.favour[god] ?? 0) >= rerollPrice();

/* The grant tier's real teeth: a machine-build recipe is known only once
   that machine id has been granted, through the SAME `canPlace` check
   placement gates on rather than a duplicate.

   Derived from the recipe's own `out` clause rather than a hand-kept
   machine-id list -- an `out` naming a literal substance in `rig` form whose
   `sub` resolves in `M` names its own gate by construction, so a future
   machine-build recipe needs no edit. `null` for anything else, which is
   every ordinary hand recipe. */
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

/* The highest-tier `item.tool` relic currently held, or null with
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

/* Whether the player holds ANY mining tool. `shell/boot.js` plants the stock
   pick near spawn every run, and this reads true from the moment that or any
   other tool is picked up. Through `bestTool()`, so an auger alone satisfies
   it. */
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
