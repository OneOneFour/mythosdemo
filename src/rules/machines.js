/* LAYER rules — THE MACHINE INTERPRETER. The only code in the project that
   ticks a machine. Imports `core`, `data`, `model`. Imports no other `rules`
   module.

   ============================================================================
   IT CONTAINS NO MACHINE NAME, NO SUBSTANCE NAME AND NO MAGIC NUMBER.
   Every one of those is a literal in `data/machines.js`, `data/recipes.js` or
   `data/substances.js`.

   If you are reading this because you want to ADD a machine, you are in the
   wrong file. Go to `data/machines.js`, copy the row nearest to what you want,
   and change the literals. You are in the right file only if you want a machine
   to do something no row can express — and then the honest question is whether
   the key you are about to add belongs on rows, or whether that machine wants a
   `rules` module of its own the way the lift has one.

   Read in this order: `step` (what happens per machine per frame), `choose`
   (which recipe runs), `produce` (spending and ejecting), `emit`.
   ============================================================================

   THE HONEST COMPLAINT, stated here rather than in prose somewhere: this file
   plus an anaemic row IS "the logic separated from the thing it describes". A
   reader who wants to know what the furnace does reads a row and then reads
   this. The three defences are that the row is the shorter half, that the row is
   EXHAUSTIVE (there is no second place furnace behaviour can hide), and that the
   escape hatch for behaviour a key genuinely cannot carry exists and is priced —
   see `data/sources.js`. If this project ends up wanting forty such hatches
   rather than three, the architecture chose wrong. */

import { overlaps } from '../core/math.js';
import { F, matches } from '../data/forms.js';
import { MACH } from '../data/machines.js';
import { recipesOf } from '../data/recipes.js';
import { SOURCES } from '../data/sources.js';
import { hasField, write as fw, fieldAt } from '../model/fields.js';
import { push } from '../model/journal.js';
import { itemsIn, parseKey, write as iw } from '../model/items.js';
import { capOf, count, defOf, fill, firstMatching, machines, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { playerBox } from '../model/player.js';
import { hearts, run, write as rw } from '../model/run.js';
import { tileX, tileY } from '../model/world.js';

/* ---------- the injected source api ----------
   This object is the ENTIRE surface a `data/sources.js` row may touch. Adding a
   line here widens what content can reach, so the list is short on purpose and
   every entry has a caller today.

   `buffered` and `pocketed` count the LARGEST SINGLE MATCHING PAIR rather than
   the sum across pairs, and that is deliberate: a recipe input is satisfied by
   one pair, because a derived output takes its substance from the pair that
   satisfied it. Two copper ore and one tin ore do not smelt into one ingot of
   anything. Buffer FULLNESS — what the servo and the HUD pips read — is the sum,
   and that is `model/machines.js#count`. Two different questions, two answers. */
const api = {
  buffered: (m, sel) => best(m.buf, sel),
  pocketed: (sel) => best(run.inv, sel),

  /* Both spends return the concrete `{sub, form}` pair actually taken, so the
     interpreter learns which substance satisfied a selector without ever asking
     where it came from. That return value is the whole of how one `smelt` row
     covers every ore that will ever exist. */
  takeBuffered: (m, sel, n) => {
    const pair = firstMatching(m, sel, n);
    if (!pair) return null;
    mw.consume(m, pair.sub, pair.form, n);
    return pair;
  },
  takePocketed: (sel, n) => {
    const pair = bestPair(run.inv, sel, n);
    if (!pair || !rw.spend(pair.sub, pair.form, n)) return null;
    return pair;
  },

  hearts: () => hearts(),
  takeHearts: (n) => rw.spendHearts(n)
};

/* Largest single matching pair in a `{ 'sub/form': units }` ledger. Both the
   machine buffer and the player's pockets are that shape — see the note in
   `model/items.js` about why the string key was chosen. */
function best(ledger, sel) {
  let n = 0;
  for (const k in ledger) {
    const p = parseKey(k);
    if (matches(sel, p.sub, p.form) && ledger[k] > n) n = ledger[k];
  }
  return n;
}

function bestPair(ledger, sel, need) {
  for (const k in ledger) {
    if (ledger[k] < need) continue;
    const p = parseKey(k);
    if (matches(sel, p.sub, p.form)) return p;
  }
  return null;
}

/* `recipesOf` allocates, and this runs per machine per frame, so the resolved
   list is memoised per definition index. Definitions are frozen data, so the
   cache is bounded by the content. */
const recipeCache = new Map();
const recipes = (def, i) => {
  let r = recipeCache.get(i);
  if (!r) { r = recipesOf(def); recipeCache.set(i, r); }
  return r;
};

/* ---------- the step ---------- */
export function step(dt) {
  for (const m of machines) {
    const def = defOf(m);
    mw.fire(m, Math.max(0, m.fire - dt * 0.7));
    if (def.catchBox) catchFalling(m, def);
    if (def.handFeed) handFeed(m, def);
    produce(m, def, dt);
    if (def.emit) emit(m, def, dt);
  }
}

/* ---------- catch box ----------
   Anything falling through the mouth is swallowed for free. This one key is the
   thesis of the game: placing a machine under a vein beats placing it on the
   surface, and nothing has to say so. */
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

/* ---------- hand feed ----------
   Stand within reach and the machine draws from your pockets. The trap the
   design wants — hauling ore up to a machine you placed in the wrong place —
   is this working exactly as intended. */
function handFeed(m, def) {
  if (!overlaps(playerBox(), m.box, def.handFeed.reach)) return;
  for (const sel of def.handFeed.from) {
    if (count(m, sel) >= capOf(def, sel)) continue;
    const pair = bestPair(run.inv, sel, 1);
    if (!pair || !rw.spend(pair.sub, pair.form, 1)) continue;
    mw.take(m, pair.sub, pair.form, 1);
    mw.fire(m, 1);
    push('accept', { x: m.box.x, y: m.box.y }, { def: m.def, sub: pair.sub, form: pair.form });
  }
}

/* ---------- run a recipe ---------- */
function produce(m, def, dt) {
  const r = choose(m, def);
  if (!r) { mw.prog(m, 0); mw.running(m, false); return; }
  mw.running(m, true);

  mw.prog(m, m.prog + dt * speedOf(m, def, r));
  if (m.prog < r.secs) return;
  mw.prog(m, m.prog - r.secs);

  /* Spend every input through whichever source it declared, keeping the pair
     each clause actually yielded so a derived output can name the same
     substance. Availability was already proved by `choose`. */
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
    /* `yield` is a scale tunable, so a doubling boon is one row in
       `data/tuning.js` and no edit here. Floored, never below one: a machine
       that consumed its inputs and produced nothing is a sink, not a recipe. */
    const units = Math.max(1, Math.floor(clause.n * eff('yield', def.id)));
    for (let k = 0; k < units; k++) {
      iw.spawn(m.band, mouth.x + mouth.w / 2, mouth.y, sub, form, 0, -70);
      made++;
    }
  }

  /* No liftable output at all — `out:[]`. The run banked a CHARGE instead: one
     turn of a lift drum. `rules/lift.js` is the consumer, and it cannot tell a
     charge bought with timber from one bought with a heart. */
  if (!made) mw.charge(m, 1);

  push('produce', { x: m.box.x, y: m.box.y }, { def: m.def, made });
}

/* First recipe whose inputs are all present. ORDER IN THE ROW IS THE DESIGN —
   see the winch, which lists timber before hearts so it behaves like an ordinary
   fuelled lift right up until you run dry. */
function choose(m, def) {
  /* A stage holding an unspent haul does not burn more fuel: there is one deck
     per stage, and five stages are five machines (invariant 4). */
  if (def.lift && m.charges > 0) return null;

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

/* Field gate: `needs:{ heat:{ min:30 } }` read at the machine's own tile. Delete
   the line from the row and the recipe runs cold. A temperature BAND is a `max`
   beside the `min`, which is the seam two mutually hostile boons need. */
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

/* Progress multiplier: the `rate` tunable (so a trinket or a variant row can
   bend it) times the servo. The servo is what keeps buffers bounded — without
   it a small surplus reaches FULL over about twenty minutes. */
function speedOf(m, def, r) {
  let mult = eff('rate', def.id);
  if (def.servo) {
    const feed = Object.keys(r.in)[0];
    if (fill(m, feed) > def.servo.over) mult *= def.servo.mult;
  }
  return mult;
}

/* Pour into a scalar field at a named mouth. `hasField` is how a machine finds
   out that a band simply has no heat, rather than writing into nothing. */
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

/* Which `in` port selector, if any, accepts this pair. Returned rather than a
   boolean because the CAP is per selector — the furnace's 4-ore / 2-fuel
   asymmetry is expressed that way and this is where it is honoured. */
function acceptedBy(def, sub, form) {
  for (const p of def.ports) {
    if (p.mode !== 'in' || !p.accepts) continue;
    for (const sel of p.accepts) if (matches(sel, sub, form)) return sel;
  }
  return null;
}
