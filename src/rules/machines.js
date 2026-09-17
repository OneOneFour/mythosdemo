/* rules layer — the machine interpreter, the only code that ticks a machine. It
   names no machine, no substance and no magic number — a new machine is a row
   in `data/machines.js`.

   Read in this order: `step`, `choose` (which recipe runs), `produce`
   (spending and ejecting), `emit`. */

import { rand } from '../core/rng.js';
import { overlaps } from '../core/math.js';
import { AIR, F, matches } from '../data/forms.js';
import { recipesOf } from '../data/recipes.js';
import { SOURCES } from '../data/sources.js';
import { SUB } from '../data/substances.js';
import { hasField, write as fw, fieldAt } from '../model/fields.js';
import { push } from '../model/journal.js';
import { itemsIn, parseKey, write as iw } from '../model/items.js';
import { acceptedBy, capOf, count, defOf, feedCheck, fill, firstMatching, machines, write as mw } from '../model/machines.js';
import { unitsCrossed, write as digw, workAt } from '../model/mining.js';
import { eff } from '../model/mods.js';
import { playerBox } from '../model/player.js';
import { pocketedBest, pocketedPair, run, write as rw } from '../model/run.js';
import { baseChargeAt, baseHardAt, dropAt, subAt, tileAt, write as tw } from '../model/tiles.js';
import { tileX, tileY, worldX, worldY } from '../model/world.js';

/* The entire surface a `data/sources.js` row may touch. `buffered` and
   `pocketed` count the largest single matching pair rather than the sum across
   pairs; buffer fullness is `model/machines.js#count` instead. */
const api = {
  buffered: (m, sel) => best(m.buf, sel),
  pocketed: (sel) => pocketedBest(sel),

  /* Both spends return the concrete `{sub, form}` pair actually taken, so the
     interpreter learns which substance satisfied a selector — which is how one
     `smelt` row covers every ore. */
  takeBuffered: (m, sel, n) => {
    const pair = firstMatching(m, sel, n);
    if (!pair) return null;
    mw.consume(m, pair.sub, pair.form, n);
    return pair;
  },
  takePocketed: (sel, n) => {
    const pair = pocketedPair(sel, n);
    if (!pair || !rw.spend(pair.sub, pair.form, n)) return null;
    return pair;
  },
};

/* Largest single matching pair in a `{ 'sub/form': units }` ledger. `m.buf` is
   the only ledger in that shape; `run.inv` is a slot array with its own
   equivalents in `model/run.js`. */
function best(ledger, sel) {
  let n = 0;
  for (const k in ledger) {
    const p = parseKey(k);
    if (matches(sel, p.sub, p.form) && ledger[k] > n) n = ledger[k];
  }
  return n;
}

/* `recipesOf` allocates and this runs per machine per substep, so the resolved
   list is memoised per definition index. Definitions are frozen, so the cache
   is bounded by the content. */
const recipeCache = new Map();
const recipes = (def, i) => {
  let r = recipeCache.get(i);
  if (!r) { r = recipesOf(def); recipeCache.set(i, r); }
  return r;
};

/* `cmd` is the narrowed command object; this step reads only `cmd.autoFeed`,
   which decides whether the proximity drain below runs at all. */
export function step(dt, cmd) {
  for (const m of machines) {
    const def = defOf(m);
    mw.fire(m, Math.max(0, m.fire - dt * 0.7));
    if (def.catchBox) catchFalling(m, def);
    /* `handFeed` is opt-in; the catch box above is unconditional. */
    if (def.handFeed && cmd.autoFeed) handFeed(m, def);
    produce(m, def, dt);
    if (def.emit) emit(m, def, dt);
    if (def.mine) mine(m, def, dt);
  }
}

/* Anything falling through the mouth, plus `def.catchBox.slack` px of margin on
   every side, is swallowed up to the selector's cap. */
function catchFalling(m, def) {
  const mouth = m.mouth[def.catchBox.mouth];
  const s = def.catchBox.slack;
  const box = { x: mouth.x - s, y: mouth.y - s, w: mouth.w + s * 2, h: mouth.h + s * 2 };

  for (const it of itemsIn(box)) {
    const sel = acceptedBy(def, it.sub, it.form);
    if (sel === null) continue;
    if (count(m, sel) >= capOf(def, sel)) continue;
    mw.take(m, it.sub, it.form, 1);
    mw.fire(m, 1);
    iw.remove(it);
    push('accept', { x: it.x, y: it.y }, { def: m.def, sub: it.sub, form: it.form });
  }
}

/* Draws one unit per accepted selector per substep from the pockets while the
   player stands within `def.handFeed.reach`. Off unless `cmd.autoFeed`; the
   deliberate verb is `handOne` below. */
function handFeed(m, def) {
  if (!overlaps(playerBox(), m.box, def.handFeed.reach)) return;
  for (const sel of def.handFeed.from) {
    if (count(m, sel) >= capOf(def, sel)) continue;
    const pair = pocketedPair(sel, 1);
    if (!pair || !rw.spend(pair.sub, pair.form, 1)) continue;
    mw.take(m, pair.sub, pair.form, 1);
    mw.fire(m, 1);
    push('accept', { x: m.box.x, y: m.box.y }, { def: m.def, sub: pair.sub, form: pair.form });
  }
}

/* One unit of the pair the player named, per call, with a reason when it
   refuses. Reach is not tested here: `pointerdown` asks once at the press and
   dispatches a mine instead when the answer is no. */
export function handOne(m, sub, form) {
  const chk = feedCheck(m, sub, form);
  if (!chk.ok) {
    push('refused', { x: m.box.x, y: m.box.y }, { def: m.def, sub, form, why: chk.why });
    return false;
  }
  /* No refusal row: `shell/main.js#applyIntents` re-checks `invCount > 0`
     immediately before this, so a failed spend means the pockets changed
     inside one frame. */
  if (!rw.spend(sub, form, 1)) return false;
  mw.take(m, sub, form, 1);
  mw.fire(m, 1);
  push('accept', { x: m.box.x, y: m.box.y }, { def: m.def, sub, form });
  return true;
}

function produce(m, def, dt) {
  const r = choose(m, def);
  if (!r) { mw.prog(m, 0); mw.running(m, false); return; }
  mw.running(m, true);

  mw.prog(m, m.prog + dt * speedOf(m, def, r));
  if (m.prog < r.secs) return;
  mw.prog(m, m.prog - r.secs);

  /* Spend every input through its declared source, keeping the pair each
     clause yielded so a derived output can name the same substance.
     Availability was already proved by `choose`. */
  const src = SOURCES[r.from || 'buffer'];
  const took = {};
  for (const sel in r.in) took[sel] = src.spend(api, m, sel, r.in[sel]);

  let made = 0;
  const port = def.ports.find(p => p.mode === 'out');
  const mouth = port ? m.mouth[port.side] : m.mouth.top;
  for (const clause of r.out || []) {
    const sub = clause.sub !== undefined ? clause.sub : took[clause.subFrom]?.sub;
    if (sub === undefined || sub === null) continue;
    const form = F[clause.form];
    /* Floored at one: a machine that consumed its inputs and produced nothing
       is a sink rather than a recipe. */
    const units = Math.max(1, Math.floor(clause.n * eff('yield', def.id)));
    for (let k = 0; k < units; k++) {
      iw.spawn(m.band, mouth.x + mouth.w / 2, mouth.y, sub, form, 0, -70);
      made++;
    }
  }

  /* An `out:[]` recipe banks a charge instead — one unit of work
     `rules/belts.js` may later spend on one item delivered off its end. A
     brazier's `out:[]` recipe is the same shape and keeps it lit while
     fuelled. */
  if (!made) mw.charge(m, 1);

  push('produce', { x: m.box.x, y: m.box.y }, { def: m.def, made });
}

/* First recipe whose inputs are all present, in `data/recipes.js` declaration
   order. There is no `charges > 0` gate: a belt banks several charges and
   spends one per item delivered. */
function choose(m, def) {
  for (const r of recipes(def, m.def)) {
    if (!gated(m, r)) continue;
    const src = SOURCES[r.from || 'buffer'];
    let ok = true;
    for (const sel in r.in) {
      const have = src.units === 'named'
        ? (src.offers.includes(sel) ? src.count(api, m, sel) : 0)
        : src.count(api, m, sel);
      if (have < r.in[sel]) { ok = false; break; }
    }
    if (ok) return r;
  }
  return null;
}

/* Field gate — `needs:{ heat:{ min:30 } }` — read at the machine's own tile. A
   row with no `needs` runs cold; a `max` beside a `min` makes a band. */
function gated(m, r) {
  if (!r.needs) return true;
  for (const field in r.needs) {
    const want = r.needs[field];
    const v = fieldAt(m.band, field, m.tx, m.ty);
    if (want.min !== undefined && v < want.min) return false;
    if (want.max !== undefined && v > want.max) return false;
  }
  return true;
}

/* Progress multiplier: the `rate` tunable times the servo. The servo is what
   keeps buffers bounded — without it a small surplus reaches full over about
   twenty minutes. */
function speedOf(m, def, r) {
  let mult = eff('rate', def.id);
  if (def.servo) {
    const feed = Object.keys(r.in)[0];
    if (fill(m, feed) > def.servo.over) mult *= def.servo.mult;
  }
  return mult;
}

/* Pour into a scalar field at a named mouth. `hasField` is how a machine
   learns a band has no such field rather than writing into nothing. */
function emit(m, def, dt) {
  for (const e of def.emit) {
    if (e.whileRunning && !m.running) continue;
    if (!hasField(m.band, e.field)) continue;
    const mouth = m.mouth[e.at];
    fw.add(m.band, e.field,
           tileX(m.band, mouth.x + mouth.w / 2), tileY(m.band, mouth.y),
           e.rate * dt);
  }
}

/* A placed miner gates on top of `rules/mining.js`'s hardness rather than
   carrying a second one: every miner chews at
   `eff('pickPower') x bestHandToolPower()`, the same number a player swinging
   their best tool gets, and only the gate and the face width vary by tier. */

/* The best hand tool's power, scanned off every substance's `item.tool` block
   rather than naming one. Defaults to 1, the same no-tool-held fallback
   `rules/mining.js` uses. */
function bestHandToolPower() {
  let p = 1;
  for (const s of SUB) if (s.item?.tool && s.item.tool.power > p) p = s.item.tool.power;
  return p;
}

/* First non-air tile in the face, top to bottom, aimed by the row's
   `facing`/`tiles` rather than a player position. Once the top tile breaks it
   reads air and the loop finds the next down, so no target state is kept. */
function mineTarget(m, def) {
  const spec = def.mine;
  const tx = m.tx + (spec.facing > 0 ? def.tw : -1);
  for (let i = 0; i < spec.tiles; i++) {
    const ty = m.ty + i;
    if (tileAt(m.band, tx, ty) !== AIR) return { tx, ty };
  }
  return null;
}

/* Seconds between repeats of the tier refusal row. A `WeakMap` rather than one
   scalar, because more than one miner can stall on a too-hard face at once. */
const REFUSAL_GAP = 1.0;
const refusedAt = new WeakMap();
function tierRefusalDue(m) {
  const last = refusedAt.get(m);
  if (last !== undefined && run.t - last < REFUSAL_GAP) return false;
  refusedAt.set(m, run.t);
  return true;
}

/* Seconds of active chewing accumulated against one buffered fuel unit, per
   machine. Local rather than a machine-record field: only this branch reads
   it, and `m.prog` belongs to `produce()`. */
const fuelClock = new WeakMap();

function mine(m, def, dt) {
  const spec = def.mine;

  const target = mineTarget(m, def);
  if (!target) { mw.running(m, false); return; }        // face is clear

  const sub = subAt(m.band, target.tx, target.ty);
  if (sub < 0) { mw.running(m, false); return; }         // bedrock, or out of bounds

  /* Worth a rate-limited journal row rather than a silent stall on a wall this
     machine would otherwise sit chewing at forever. */
  const tileTier = SUB[sub].tile?.tier ?? 1;
  if (tileTier > spec.tier * eff('toolTier', SUB[sub].id)) {
    if (tierRefusalDue(m))
      push('refused', { x: worldX(m.band, target.tx), y: worldY(m.band, target.ty) },
           { def: m.def, sub, why: 'TOO HARD FOR THIS MINER' });
    mw.running(m, false);
    return;
  }

  /* No fuel is a silent stall, as it is for every other fuel-burning row. */
  const fuelPair = firstMatching(m, '*/#fuel', 1);
  if (!fuelPair) { mw.running(m, false); return; }

  mw.running(m, true);

  const hard = baseHardAt(m.band, target.tx, target.ty) * eff('hard', SUB[sub].id);

  /* Identical arithmetic to the hand-mining half — same `baseChargeAt`,
     `eff('richness')` and `unitsCrossed`, in the same order relative to the
     break test — so the two cannot disagree on seconds per unit. */
  const charge = Math.max(1, Math.round(
    baseChargeAt(m.band, target.tx, target.ty) * eff('richness', SUB[sub].id)));
  const total = hard * charge;

  const before = workAt(m.band, target.tx, target.ty);
  const work = digw.add(m.band, target.tx, target.ty, dt * eff('pickPower') * bestHandToolPower());

  /* Fuel drains with time spent chewing rather than per tile broken:
     `spec.secs` is how long one unit lasts. */
  const clock = (fuelClock.get(m) || 0) + dt;
  if (clock >= spec.secs) {
    mw.consume(m, fuelPair.sub, fuelPair.form, 1);
    fuelClock.set(m, clock - spec.secs);
  } else fuelClock.set(m, clock);

  /* A unit chipped loose while the face survives, so the miner retreats
     through a vein tile by tile. Before the break test, where
     `rules/mining.js` puts its own: after it would reorder that branch's
     `rand()` draws. `unitsCrossed` caps one short of `charge`. */
  const crossed = unitsCrossed(before, work, hard, charge);
  if (crossed > 0) {
    const unit = dropAt(m.band, target.tx, target.ty);
    if (unit) for (let i = 0; i < crossed; i++) ejectMined(m, def, unit);
  }

  if (work < total) return;                              // still chewing

  /* Read the drop before clearing the tile. */
  const drop = dropAt(m.band, target.tx, target.ty);
  digw.clear(m.band, target.tx, target.ty);
  tw.clear(m.band, target.tx, target.ty);
  /* `0.5` mirrors `rules/mining.js#HARD_BREAK`, a journal-kind selector rather
     than a mechanic. Duplicated because siblings may not import one another. */
  push(hard > 0.5 ? 'breakHard' : 'breakSoft',
       { x: worldX(m.band, target.tx), y: worldY(m.band, target.ty) }, { sub });

  if (!drop) return;
  ejectMined(m, def, drop);
}

/* One mined unit out of the out port, never a direct buffer credit. Shared by
   the depletion and break branches so the two cannot drift, including the
   single `rand()` call whose position in the stream matters. Ejected downward
   rather than tossed up; gravity carries it the rest of the way. */
function ejectMined(m, def, pair) {
  const port = def.ports.find(p => p.mode === 'out');
  const mouth = m.mouth[port.side];
  const it = iw.spawn(m.band, mouth.x + mouth.w / 2, mouth.y + mouth.h,
                      pair.sub, pair.form, (rand() - 0.5) * 24, 20);
  if (it) push('drop', { x: mouth.x, y: mouth.y }, { sub: pair.sub, form: pair.form });
}
