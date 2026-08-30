/* LAYER rules — THE MACHINE INTERPRETER. The only code that ticks a machine.

   ============================================================================
   It contains no machine name, no substance name and no number. Every one of
   those is a literal in `data/machines.js` or `data/substances.js`. If you are
   here because you want to add a machine, you are in the wrong file: go to
   `data/machines.js`, copy the row above the one you want, change the literals.
   You are in the right file only if you want a machine to do something no row
   can express — and then the honest question is whether the flag you are about
   to add belongs on rows, or whether that machine wants its own `rules` module.
   ============================================================================

   Read in this order: `step` (what happens per machine per frame), `choose`
   (which recipe runs), `bind` (which concrete substance satisfied a selector),
   `outputsOf` (what comes out). Roughly 120 lines, and it is all of it.

   THE HONEST COMPLAINT, from RFC 04's own weakness 1 and stated here rather
   than in prose somewhere: this file plus an anaemic row IS "logic separate
   from the semantic thing coding it". A reader who wants to know what the
   furnace does reads a row and then reads this. The three defences are that
   the row is the shorter half, that the row is exhaustive (there is no second
   place furnace behaviour can hide), and that the escape hatch for behaviour
   a flag genuinely cannot carry exists and is priced — see `data/sources.js`.
   If this project ends up wanting forty such hatches rather than three, this
   architecture chose wrong. */

import { MACH } from '../data/machines.js';
import { S, SUB, matches } from '../data/substances.js';
import { SOURCES } from '../data/sources.js';
import { eff } from '../model/mods.js';
import { capOf, count, fill, machines, write as mw } from '../model/machines.js';
import { itemsIn, write as iw } from '../model/items.js';
import { invCount, hearts, write as rw } from '../model/run.js';
import { playerBox } from '../model/player.js';
import { fieldAt, write as fw } from '../model/fields.js';
import { push } from '../model/journal.js';
import { overlaps } from '../core/math.js';

/* ---- the injected api: the entire surface a `data/sources.js` row may touch.
        Adding a line here widens what content can reach, so the list is short
        on purpose and every entry has a caller today. ---- */
const api = {
  buffered:     (m, sel) => count(m, sel),
  takeBuffered: (m, sel, n) => { mw.consume(m, sel, n); return true; },
  pocketed:     (sel) => invCount(sel),
  takePocketed: (sel, n) => rw.spend(sel, n),
  hearts:       () => hearts(),
  takeHearts:   (n) => rw.spendHearts(n)
};

export function step(dt) {
  for (const m of machines) {
    const def = MACH[m.def];
    mw.fire(m, Math.max(0, m.fire - dt * 0.7));
    if (def.catchBox) catchFalling(m, def);
    if (def.handFeed) handFeed(m, def);
    for (const p of def.ports)
      if (p.mode === 'fluidIn')
        fw.drain(m.band, p.field, m.tx, m.ty, p.rate * dt);
    produce(m, def, dt);
    if (def.emit) emit(m, def, dt);
  }
}

/* --- catch box: anything falling through the mouth is swallowed for free.
       This is the flag that makes placing a machine under a vein strictly
       better than placing it on the surface. --- */
function catchFalling(m, def) {
  const mouth = m.mouth[def.catchBox.mouth];
  const slack = def.catchBox.slack;
  const box = { x: mouth.x - slack, y: mouth.y - slack,
                w: mouth.w + slack * 2, h: mouth.h + slack * 2 };
  for (const it of itemsIn(box)) {
    const id = SUB[it.sub].id;
    if (!accepts(def, id) || count(m, id) >= capOf(def, id)) continue;
    mw.take(m, id, 1);
    iw.remove(it);
    mw.fire(m, 1);
    push('accept', { x: it.x, y: it.y }, { machine: m, sub: id });
  }
}

/* --- hand feeding: stand next to it and it draws from your pockets --- */
function handFeed(m, def) {
  if (!overlaps(playerBox(), m.box, def.handFeed.reach)) return;
  for (const sel of def.handFeed.from)
    for (const sub of matches(sel)) {
      const id = SUB[sub].id;
      if (count(m, id) >= capOf(def, id)) continue;
      if (invCount(id) > 0 && rw.spend(id, 1)) {
        mw.take(m, id, 1);
        push('accept', { x: m.box.x, y: m.box.y }, { machine: m, sub: id });
      }
    }
}

/* --- run a recipe --- */
function produce(m, def, dt) {
  const pick = choose(m, def);
  if (!pick) { mw.prog(m, 0); mw.running(m, false); return; }
  mw.running(m, true);

  mw.prog(m, m.prog + dt * speedOf(m, def, pick.r));
  if (m.prog < pick.r.secs) return;
  mw.prog(m, m.prog - pick.r.secs);

  /* spend the inputs through whichever source they came from */
  const src = SOURCES[pick.r.from || 'buffer'];
  for (const [sel, n] of Object.entries(pick.r.in))
    src.spend(api, m, pick.bound[sel], n);

  const out = outputsOf(def, pick.r, pick.bound);
  const port = def.ports.find(p => p.mode === 'out');
  let made = 0;
  for (const [subId, n] of Object.entries(out)) {
    const units = Math.max(1, Math.floor(n * eff('yield', def.id)));
    for (let k = 0; k < units; k++) {
      const mouth = m.mouth[port.side];
      iw.spawnAt(m.band, mouth.x + mouth.w / 2, mouth.y, S[subId], 0, -70);
      made++;
    }
  }
  /* No output substance at all — `out:{}`. The run produced a CHARGE instead:
     one turn of a lift drum, or one wagon of spoil for Hades. `rules/lift.js`
     is the consumer. */
  if (!made) mw.charge(m, 1);

  push('produce', { x: m.box.x, y: m.box.y }, { machine: m, recipe: pick.r, out });
}

/* First recipe whose inputs are all available, with each selector bound to the
   concrete thing that satisfied it. Order in the row is therefore a design
   decision — see the blood winch, which lists timber before hearts. */
function choose(m, def) {
  for (const r of def.recipes) {
    if (!gated(m, r)) continue;
    const bound = bind(m, r);
    if (bound) return { r, bound };
  }
  return null;
}

/* Bind every input selector to a concrete key the source can spend:
     '#ore' -> 'tin'      (a substance, from a buffer or a pocket)
     'heart' -> 'heart'   (a named unit, from the `vital` source)
   Returns null if any clause cannot be satisfied. */
function bind(m, r) {
  const src = SOURCES[r.from || 'buffer'];
  const bound = {};
  for (const [sel, n] of Object.entries(r.in)) {
    const candidates = src.units === 'named'
      ? (src.offers.includes(sel) ? [sel] : [])
      : matches(sel).map(sub => SUB[sub].id);
    const hit = candidates.find(key => src.count(api, m, key) >= n);
    if (hit === undefined) return null;
    bound[sel] = hit;
  }
  return bound;
}

/* `out` is a literal map; `outFrom` derives the output from the row of whatever
   substance actually satisfied an input. The second form is why one furnace row
   smelts every ore that will ever exist, and why appending `tin` to
   `data/substances.js` yields tin ingots with no edit to any machine. */
function outputsOf(def, r, bound) {
  if (r.out) return r.out;
  const sourceSub = bound[r.outFrom.input];
  const produced = SUB[S[sourceSub]][r.outFrom.field];
  /* `tools/resolve.mjs` has already proved that every substance matching
     `r.outFrom.input` carries `r.outFrom.field` and that it names a real
     substance, so this cannot be undefined at run time. */
  return { [produced]: r.outFrom.n };
}

/* Field gate. `needs:{ heat:{ min:30 } }` on a recipe, read at the machine's
   own tile. This is the seam DESIGN item 11 (mutually hostile boons) needs:
   Dionysus wants a temperature band the smelters ruin, and a band is this
   clause with a `max` beside the `min`. */
function gated(m, r) {
  if (!r.needs) return true;
  for (const [field, want] of Object.entries(r.needs)) {
    const v = fieldAt(m.band, field, m.tx, m.ty);
    if (want.min !== undefined && v < want.min) return false;
    if (want.max !== undefined && v > want.max) return false;
  }
  return true;
}

/* Progress multiplier: the `rate` tunable (so a trinket can bend it) times the
   servo flag from CLAUDE.md's throughput model. The servo is what keeps piles
   bounded; without it small surpluses reach FULL over about twenty minutes. */
function speedOf(m, def, r) {
  let mult = eff('rate', def.id);
  if (def.servo) {
    const feed = Object.keys(r.in)[0];
    if (fill(m, feed) > def.servo.over) mult *= def.servo.mult;
  }
  return mult;
}

function emit(m, def, dt) {
  for (const e of def.emit) {
    if (e.whileRunning && !m.running) continue;
    const mouth = m.mouth[e.at];
    fw.add(m.band, e.field,
           (mouth.x + mouth.w / 2) / m.band.tile | 0,
           mouth.y / m.band.tile | 0,
           e.rate * dt);
  }
}

const accepts = (def, subId) => def.ports.some(p =>
  p.mode === 'in' && p.accepts.some(sel => matches(sel).includes(S[subId])));
