/* model layer — run-scoped state and meta-state, split by object.

   A death erases `run` and leaves `meta`. Every field `newRun()` must reset is
   declared once, in RUN_SCHEMA, and reset mechanically from it. */

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
  inv: null,            // fixed-length `{sub,form,n} | null` per slot, length
                        // `mainSlots + eff('quickbarSlots')`. The tail is the
                        // quickbar's storage, not a mirror of it.
  mainSlots: 0,          // `Math.round(eff('invSlots'))` at reset, fixed for
                        // the run
  granted: null,        // machine ids this run may place
  deepest: 0,           // world px, for the depth gauge and for `meta`

  /* The tribute ledger.
     `cycle`    which `data/cycles.js` row is live, one-based.
     `tribute`  the live demand or `null`: `{ id, have, left, credits }`. `id`
                is the row's id, so it survives a table reorder; `have` is
                keyed by `keyOf`'s `sub/form`; `left` is seconds, or `null`
                for a cycle with no clock, counted from `dt` and never from
                `Date.now()`.
     `credits`  the batch clause's `{ t, n }` in nondecreasing `t`, pruned on
                every write so it stays bounded by `batch.n`.
     `favour`   `{ [godId]: int }`, run-scoped. A god not dealt with this run
                reads `????????`.
     `charted`  band ids: knowledge rather than access.
     `misses`   expired deadlines; two ends the run through `write.hurt`.
     `favour` and `charted` build fresh in `write.reset()`. */
  cycle: 1, tribute: null,
  favour: null, charted: null, misses: 0,

  /* Every shipped trial paid. `run.cycle > CYCLES.length` is the fact; this
     is the event, set once by `rules/cycles.js#ensureLiveCycle` the frame it
     first holds, so an end-of-run screen has a moment to announce. */
  won: false,

  /* Machine ids a completed trial awarded, or `null`. `rules/cycles.js` writes
     them and `rules/grants.js#step`, scheduled immediately after, performs
     each. A fresh array per write, so the template's `null` is the reset. */
  awarded: null,

  /* `{ tier, god, ids, pool } | null`. `ids` is the offer and `null` a request
     for one, which only `shell` can fill. The ids come from the seeded stream,
     so a replayed run lays out the same cards; `god` is stored rather than
     derived, and `pool` lets `canReroll` refuse a transposition. */
  offer: null,

  /* Where every `relic` pair lives: substance ordinals, or `null` for an
     empty slot, capped by `eff('trinketSlots')`. A relic is worn rather than
     pocketed, so this is the only record that the player has one, and it
     still weighs against `eff('burden')`. Built fresh in `write.reset()`. */
  equipped: null,

  /* The hand-craft bar; one pair of hands means one craft in flight.
     `craftRecipe` is which named recipe the bar counts toward, so a change of
     materials mid-hold starts it over rather than carrying progress into a
     different item. */
  craftProgress: 0, craftRecipe: null,

  /* Recipe ids the player has learned; the CRAFTING tab draws an unlearned one
     as a locked silhouette. A plain array rather than a `Set`, so it stays
     plain-serialisable, seeded with every `HAND_RECIPES` id in
     `write.reset()`. */
  known: null,

  /* Seconds left on the one lit `timber/brand`. On `run` so it resets with
     everything else; `rules/light.js` has no `newRun()` hook of its own. */
  brandLeft: 0,

  /* Which tutorial beat the player has passed. 0 is nothing yet; N means beats
     1..N have fired. A counter and not a set of flags: beat N+1's condition is
     only asked once beat N has fired, so satisfying a later beat early does
     not skip the lesson before it. */
  tutorialBeat: 0,

  /* Where and when the director last placed a machine, or `null`.
     `{ x, y, t }` is world px of the box top-left plus `run.t`, so simulated
     seconds and never `Date.now()`. A position rather than a machine
     reference, so `run` stays plain-serialisable and no name reaches `view`. */
  arrival: null
});

export const META_SCHEMA = Object.freeze({
  runs: 0,
  bestDepth: 0,
  godsMet: null
});

export const run  = {};
export const meta = {};

/* Drop what the batch clause cannot use. Credits are appended at `run.t`,
   which only increases, so the array is sorted by `t` and a prefix drop
   suffices. Returns it unchanged when nothing is dropped, so a tick
   allocates nothing. */
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

/* One relic per equipment slot, and never two of the same: a refused pickup
   leaves it on the ground rather than stacking it somewhere it cannot be
   worn. `write.collect` routes every `relic` pair here. */
function wear(sub, n) {
  if (n !== 1 || run.equipped.includes(sub)) return false;
  const free = run.equipped.indexOf(null);
  if (free === -1) return false;
  run.equipped[free] = sub;
  bump();
  return true;
}

export const write = {
  /* Called by `shell/boot.js` alongside the `clear()` on every other model
     module. */
  reset(seed) {
    const mainSlots = Math.max(0, Math.round(eff('invSlots')));
    const quickbarSlots = Math.max(0, Math.round(eff('quickbarSlots')));
    Object.assign(run, RUN_SCHEMA, {
      seed,
      inv: Array.from({ length: mainSlots + quickbarSlots }, () => null),
      mainSlots,
      granted: [...STARTING_MACHINES],
      tribute: null,
      /* Fresh containers: one on the frozen template would be a single
         reference every run shares. */
      favour: {},
      charted: [],
      /* Every hand recipe is known from run start; nothing reveals a recipe
         yet. A fresh array every run. */
      known: HAND_RECIPES.map(r => r.id),
      /* `eff('trinketSlots')` reads the base value here, since
         `model/mods.js#write.clear()` has already run. Rounded, because a slot
         count must be an integer even if a boon bent the tunable. */
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

  /* Merge first: an existing stack of this exact pair is found before a slot
     is allocated, so two slots can never hold the same pair. A new pair fills
     the quickbar tail left to right and only then the main grid. Returns false
     with no stack and no free slot. */
  collect(sub, form, n) {
    if (form === F.relic) return wear(sub, n);
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
    if (form === F.relic) {
      const slot = run.equipped.indexOf(sub);
      if (slot === -1 || n !== 1) return false;
      run.equipped[slot] = null;
      bump();
      return true;
    }
    const i = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
    if (i === -1 || run.inv[i].n < n) return false;
    run.inv[i].n -= n;
    if (run.inv[i].n <= 0) run.inv[i] = null;
    bump();
    return true;
  },

  /* Unconditional swap of two positions: swapping with an empty slot is a
     move, swapping two occupied is a reorder. Out-of-range or a no-op swap is
     ignored, so a shrinking slot count cannot crash a frame iterating the old
     length. */
  moveSlot(from, to) {
    if (from < 0 || from >= run.inv.length || to < 0 || to >= run.inv.length || from === to) return;
    const tmp = run.inv[to];
    run.inv[to] = run.inv[from];
    run.inv[from] = tmp;
    bump();
  },

  /* Hearts are spent, never held as an item through `inv`. No caller today;
     the floor on the last heart lives here and nowhere else. */
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

  /* `tribute` sets or clears the whole live-demand record, so a demand and its
     deadline can never be observed half-applied, and prunes the batch ledger.
     `favour` accumulates, `chart` is a set, `miss` is a plain increment.
     `rules/cycles.js` is the only caller of any of these. */
  tribute(t)        { if (t) t.credits = prunedCredits(t); run.tribute = t; bump(); },
  favour(god, n)    { run.favour[god] = (run.favour[god] || 0) + n; bump(); },
  chart(bandId)     { if (!run.charted.includes(bandId)) run.charted.push(bandId); bump(); },
  miss()            { run.misses++; bump(); },
  cycle(n)          { run.cycle = n; bump(); },
  /* `offer(tier, god)` raises a request with `ids` still null;
     `offer(tier, god, ids, pool)` lays out the cards; `offer(null)` clears. */
  offer(tier, god = null, ids = null, pool = 0) {
    run.offer = tier ? { tier, god, ids, pool } : null;
    bump();
  },

  /* One-way: it takes no argument, so it cannot be handed `false`. */
  win()             { run.won = true; bump(); },

  /* Machine ids in, or `null` to clear. `rules/grants.js#step` clears it
     before performing the ids it took, so nothing can re-enter the queue from
     inside the award it triggered. */
  award(machineIds) { run.awarded = machineIds; bump(); },

  /* One trinket slot. `sub` is a substance ordinal, or `null` to empty it.
     `rules/trinkets.js#step` is the only caller that passes a real `sub`, and
     the same function clears a slot the pockets no longer hold. Out-of-range
     is a silent no-op, so a shrinking `trinketSlots` cannot crash a frame. */
  equip(slot, sub) {
    if (slot < 0 || slot >= run.equipped.length) return;
    run.equipped[slot] = sub;
    bump();
  },

  /* Written as one pair, so a recipe change and its reset progress cannot be
     observed half-applied. */
  craft(progress, recipe) { run.craftProgress = progress; run.craftRecipe = recipe; bump(); },

  /* The one lit brand's remaining burn time, in seconds. */
  brand(secsLeft) { run.brandLeft = Math.max(0, secsLeft); bump(); },

  /* One step along the beat sheet. Takes no argument: the field is monotonic,
     so a writer that cannot be handed a number cannot be handed a smaller
     one. */
  advanceBeat() { run.tutorialBeat++; bump(); },

  /* `x`/`y` are the machine box's world-px top-left; the instant comes from
     `run.t` rather than a parameter, so no caller can stamp one in the
     past. */
  arrival(x, y) { run.arrival = { x, y, t: run.t }; bump(); }
};


export const invCount = (sub, form) => {
  if (form === F.relic) return run.equipped.includes(sub) ? 1 : 0;
  const s = run.inv.find(s => s && s.sub === sub && s.form === form);
  return s ? s.n : 0;
};
export const hearts   = () => run.hearts;
export const canPlace = machineId => run.granted.includes(machineId);

/* Mirrored machine pairs share one substance: each mirror is a `variantOf`
   row overriding only the facing key in `belt`, `mine` or `ratio`, so these
   two maps derive from that shape rather than a hand-kept list. */
const MIRROR_TO_BASE = Object.freeze(Object.fromEntries(
  MACHINES.filter(m => m.variantOf && (m.belt || m.mine || m.ratio)).map(m => [m.id, m.variantOf])));
const BASE_TO_MIRROR = Object.freeze(Object.fromEntries(
  Object.entries(MIRROR_TO_BASE).map(([mirror, base]) => [base, mirror])));

/* This machine's mirrored twin, or `undefined`. A gift is of a pair: granting
   one side alone would refuse every placement facing the other way, since
   `placementCheck` is asked about the id `machineIdFor` resolves off
   `player.face`. */
export const mirrorOf = machineId => BASE_TO_MIRROR[machineId];

/* The substance a machine id's held item lives under -- itself, unless it is
   a mirrored "_l" row, which shares its base's substance. A machine id with no
   substance at all will not resolve through `S[...]`, which is exactly "never
   placeable" with no special case. */
const heldSubIdOf = machineId => MIRROR_TO_BASE[machineId] || machineId;

/* The substance ordinal of this machine's own built item, or `undefined` if
   it has no held form. Read by `placementCheck` below and by
   `rules/placement.js`'s refund and spend. */
export function machineHeldSub(machineId) {
  return S[heldSubIdOf(machineId)];
}

/* Which concrete machine id a held machine substance places as: identity for
   every non-mirrored machine, and for a mirrored pair, whichever `player.face`
   picks. */
export function machineIdFor(sub) {
  const id = SUB[sub]?.id;
  if (id === undefined) return null;
  const mirror = BASE_TO_MIRROR[id];
  return mirror && player.face < 0 ? mirror : id;
}

/* Whether a machine may be placed at this exact footprint right now: every
   refusal `rules/placement.js#placeMachine` can produce, as a query, so the
   rule and the ghost preview share one answer. Checked in the rule's own
   order -- footprint, footing, band, depth, then affordability last. */
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

  /* A band id and not a negative `minDepth`: a band carries its own `origin`
     and `floorTy` and may be moved, so a threshold derived from them drifts.
     Refused with the band's display name, so the message reads as a place. */
  if (def.band && band.id !== def.band)
    return { ok:false, why:'ONLY IN ' + (BAND[def.band]?.name ?? String(def.band).toUpperCase()) };

  /* Depth in spawn-band tiles below the spawn band's own `floorTy` -- the same
     datum the HUD's depth gauge reads. */
  if (def.minDepth) {
    const ref = bandOf(SPAWN_BAND);
    const datum = worldY(ref, ref.cfg.floorTy ?? 0);
    const depth = (worldY(band, ty) - datum) / ref.tile;
    if (depth < def.minDepth) return { ok:false, why:'TOO SHALLOW' };
  }

  /* A machine is a held item, not a bill spent at this moment. `undefined` --
     a machine id with no substance -- never passes. */
  const heldSub = machineHeldSub(machineId);
  if (heldSub === undefined || invCount(heldSub, F.rig) < 1) return { ok:false, why:'NOTHING BUILT YET' };

  return { ok:true, why:null };
}

/* Total carried mass, in talents. */
export function burdenOf() {
  let mass = 0;
  for (const slot of run.inv) if (slot) mass += massOfPair(slot.sub, slot.form) * slot.n;
  /* A relic is carried whether or not it is in a pocket, so moving it to the
     character tab must not quietly widen the cap. */
  for (const sub of run.equipped) if (sub !== null) mass += massOfPair(sub, F.relic);
  return mass;
}

/* Fraction of the hard cap `eff('burden')` currently carried. `>= 1` is the
   lockout threshold `rules/player.js` reads; `eff('burdenSoft')` is where
   climb speed starts falling off before that. */
export const burdenFrac = () => burdenOf() / eff('burden');

/* Does the pocket ledger hold at least `n` of a single pair matching `sel`? */
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
   satisfiable from the pockets. Display only: `rules/crafting.js#choose` asks
   a strictly stronger question, since it must find one pair per clause. */
export const canCraft = recipeIn =>
  Object.keys(recipeIn).every(sel => pocketsHave(sel, recipeIn[sel]));

/* The live cycle row or `null`, resolved by id rather than index, so a
   reorder of `data/cycles.js` cannot make a saved `run.tribute` mean a
   different trial. Falls back to `run.cycle`'s own row when nothing is armed,
   which is what the director reads when deciding what to arm. */
export function cycleRow() {
  if (run.tribute) return CYCLE[run.tribute.id] ?? null;
  return CYCLES[run.cycle - 1] ?? null;
}

/* Units of one demand row in the ledger, keyed the `model/items.js` way, so
   this is a lookup and not a scan. */
export const tributeHave = (sub, form) =>
  (run.tribute?.have?.[keyOf(S[sub], F[form])] ?? 0);

/* Is the live cycle paid -- every demand row and the batch clause? False with
   nothing armed, or a director reading `true` would complete a trial nobody
   was asked to perform. Not clamped per row: `have` may exceed `n`, and
   over-delivery is accepted. */
export function tributeMet() {
  const row = run.tribute ? CYCLE[run.tribute.id] : null;
  if (!row) return false;
  return row.demand.every(d => tributeHave(d.sub, d.form) >= d.n) && batchMet();
}

/* Progress towards the batch clause, over `run.tribute.credits` against
   `run.t`: simulated seconds, never `Date.now()`, and a credit counts while at
   most `batch.secs` old. Saturates near `batch.n`; 0 with no clause armed. */
export function batchHave() {
  const batch = run.tribute ? CYCLE[run.tribute.id]?.batch : null;
  if (!batch) return 0;
  let sum = 0;
  for (const c of run.tribute.credits ?? [])
    if (run.t - c.t <= batch.secs) sum += c.n;
  return sum;
}

/* Is the live cycle's batch clause satisfied? Vacuously true on a row that
   carries no `batch` block, so `tributeMet` above can `&&` it with no
   branch. */
export function batchMet() {
  const batch = run.tribute ? CYCLE[run.tribute.id]?.batch : null;
  return !batch || batchHave() >= batch.n;
}

/* `canReroll` is the whole predicate, shared by whoever dims the reroll row
   and whoever refuses the press. */
export const offerGod = () => run.offer?.god ?? null;

export const rerollPrice = () => Math.max(0, Math.round(eff('rerollCost')));

/* With the pool no bigger than the offer, a re-pick can only transpose what
   is on the table, so the reroll is refused rather than sold. */
export const offerExhausted = () => !!run.offer?.ids && run.offer.pool <= run.offer.ids.length;

export const canReroll = god =>
  god != null && !offerExhausted() && (run.favour[god] ?? 0) >= rerollPrice();

/* The machine id a recipe builds, or `null` for an ordinary hand recipe.
   Derived from an `out` clause naming a substance in `rig` form whose `sub`
   resolves in `M`, rather than a hand-kept machine-id list. */
function machineOutputOf(r) {
  const out = r?.out?.[0];
  if (!out || out.sub === undefined || out.form !== 'rig') return null;
  return M[out.sub] !== undefined ? out.sub : null;
}

/* Has this recipe been learned? A machine-build recipe also needs its machine
   granted, through the same `canPlace` check placement gates on. */
export function isKnown(id) {
  if (!run.known.includes(id)) return false;
  const machineId = machineOutputOf(RECIPES[id]);
  return machineId === null || canPlace(machineId);
}

/* The highest-tier `item.tool` relic worn, or null. A tool is an ordinary
   `data/substances.js` row tagged `relic` carrying `item.tool:{tier, power}`.
   A scan rather than a cached field, so it cannot disagree with the slots;
   ties keep the first found. */
export function bestTool() {
  let best = null;
  for (const sub of run.equipped) {
    if (sub === null) continue;
    const tool = SUB[sub]?.item?.tool;
    if (tool && (!best || tool.tier > best.tier)) best = tool;
  }
  return best;
}

/* Whether the player holds any mining tool, through `bestTool()`, so an auger
   alone satisfies it. */
export const hasPick = () => bestTool() !== null;

/* The pocket strip, as data: every held pair, plus a zero slot for any
   substance flagged `item.hud.always`. Sorted by `data/forms.js#byHudOrder`. */
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
