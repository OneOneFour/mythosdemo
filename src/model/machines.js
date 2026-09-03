/* LAYER model — placed machines: storage and queries.
   Imports `core`, `data`, `model`. May be imported by `model`, `rules`, `view`.

   A machine instance is a plain record. `def` is an index into
   `data/machines.js`, so the ROW is the definition and the RECORD is only what
   changes: buffer, progress, charges, fire, torque, turn. Printing one in a
   debugger
   tells you everything about that machine's state, and `JSON.stringify(machines)`
   is most of a save. See docs/DEVELOPER_GUIDE.md#adding-a-machine

   Buffers are keyed by the `sub/form` string from `model/items.js`, not by tile
   byte. See the note there: a buffer is read by a human debugging a stuck
   factory, and the byte form answers the wrong question. */

import { rect } from '../core/math.js';
import { MACH } from '../data/machines.js';
import { expand, matches } from '../data/forms.js';
import { recipesOf } from '../data/recipes.js';
import { bump } from './epoch.js';
import { keyOf, parseKey } from './items.js';
import { worldX, worldY } from './world.js';

export const machines = [];

export const write = {
  /* `tx`/`ty` are the band-local tile of the top-left corner. Boxes are cached
     in world px because every frame reads them and none of them ever moves. */
  place(band, defIdx, tx, ty) {
    const def = MACH[defIdx];
    const t = band.tile;
    const x = worldX(band, tx), y = worldY(band, ty);
    const m = {
      def: defIdx, band, tx, ty,
      box: rect(x, y, def.tw * t, def.th * t),
      mouth: {
        top:    rect(x, y - 2, def.tw * t, 4),
        bottom: rect(x, y + def.th * t - 2, def.tw * t, 4),
        left:   rect(x - 2, y, 4, def.th * t),
        right:  rect(x + def.tw * t - 2, y, 4, def.th * t)
      },
      buf: {}, prog: 0, made: 0, charges: 0, fire: 0, running: false,
      /* DRIVETRAIN STATE LIVES ON THE MACHINE RECORD, not in a new module,
         for the reason `running` and `fire` already set the precedent for:
         `view` must draw a turning gear and `view` may not import `rules`.
         `torque` is the 0..1 drive actually delivered this frame; `turn` is
         accumulated rotation, for the sprite. Present on EVERY machine, not
         only a crank/gear/hub, so `view/paint.js` can read them off any row
         with no key test -- the same reason `charges` is not conditional.
         `rules/drive.js` is the ONLY writer of either, and it writes them for
         every node of every drivetrain component every frame -- so a machine
         that is not a crank, gear or hub keeps the 0 it was born with, and
         `view` needs no key test to read them. See docs/SPEC.md section 17. */
      torque: 0, turn: 0
    };
    machines.push(m);
    bump();
    return m;
  },

  take(m, sub, form, n) {
    const k = keyOf(sub, form);
    m.buf[k] = (m.buf[k] || 0) + n;
    bump();
  },

  consume(m, sub, form, n) {
    const k = keyOf(sub, form);
    m.buf[k] = Math.max(0, (m.buf[k] || 0) - n);
    if (!m.buf[k]) delete m.buf[k];
    bump();
  },

  prog(m, v)        { m.prog = v; bump(); },
  charge(m, n)      { m.charges += n; m.made += n; bump(); },
  spendCharge(m, n) { m.charges = Math.max(0, m.charges - n); bump(); },
  fire(m, v)        { m.fire = v; bump(); },
  running(m, v)     { m.running = v; bump(); },

  /* Drivetrain, Phase 8f's writers, declared here in Phase 8d so the two
     numbers `view` reads live in one place from the start. `turn` ACCUMULATES
     from `dt` alone and never from `rand()` (invariant 7), so a gear sprite is
     reproducible from the seed and the frame count. */
  torque(m, v)      { m.torque = v; bump(); },
  turn(m, phase)    { m.turn = phase; bump(); },

  remove(m) {
    const i = machines.indexOf(m);
    if (i >= 0) machines.splice(i, 1);
    bump();
  },

  clear() { machines.length = 0; bump(); }
};

/* ---- queries. `sel` is a selector over substance x form. ---- */

export const defOf = m => MACH[m.def];

/* Units of anything matching `sel` in this machine's buffer. */
export function count(m, sel) {
  let n = 0;
  for (const k in m.buf) {
    const { sub, form } = parseKey(k);
    if (matches(sel, sub, form)) n += m.buf[k];
  }
  return n;
}

/* The first buffered pair that satisfies `sel` with at least `n` units. The
   interpreter needs this to know WHICH ore it just ate, so a derived output can
   name the same substance. Returns `{sub, form}` or null.

   Buffer insertion order is the tiebreak, which is stable and therefore
   deterministic; it is not a design statement about which ore is preferred. */
export function firstMatching(m, sel, n) {
  for (const k in m.buf) {
    if (m.buf[k] < n) continue;
    const pair = parseKey(k);
    if (matches(sel, pair.sub, pair.form)) return pair;
  }
  return null;
}

/* Capacity of the buffer clause covering `sel`. An exact clause wins; otherwise
   the first declared clause whose selector overlaps does. */
export function capOf(def, sel) {
  const caps = def.buffer?.cap;
  if (!caps) return 0;
  if (caps[sel] !== undefined) return caps[sel];
  const pairs = expandCached(sel);
  for (const capSel in caps)
    if (pairs.some(p => matches(capSel, p.sub, p.form))) return caps[capSel];
  return 0;
}

/* `expand` allocates a fresh array, and `capOf` is called per machine per frame
   by the servo, so the result is memoised per selector. Selectors come from
   frozen data, so the cache is bounded by the content. */
const expandCache = new Map();
function expandCached(sel) {
  let v = expandCache.get(sel);
  if (!v) { v = expand(sel); expandCache.set(sel, v); }
  return v;
}

/* 0..1 fullness of the buffer clause matching `sel`. The servo reads this, and
   so does the pip row in the HUD. */
export function fill(m, sel) {
  const cap = capOf(MACH[m.def], sel);
  return cap > 0 ? Math.min(1, count(m, sel) / cap) : 0;
}

export const full = (m, sel) => count(m, sel) >= capOf(MACH[m.def], sel);

/* ---- does this machine accept this pair, and by which clause ----
   TWO CALLERS, TWO SELECTOR LISTS, ONE MATCH RULE. A machine says what it
   takes twice, for two different mouths: `ports[].accepts` is what may fall
   or be belted IN, and `handFeed.from` is what a player standing beside it may
   hand over. The LISTS differ per row and must stay separate; the question
   asked of each ("which of these selectors covers this pair, if any") is the
   same one, so it is `firstSel` below and nothing re-implements it.

   Returned as the matching SELECTOR rather than a boolean because the CAP is
   per selector -- the furnace's 8-ore / 2-fuel asymmetry is expressed that
   way, and a caller that only learned "yes" would have to find the clause
   again to honour it. */
const firstSel = (sels, sub, form) => {
  for (const sel of sels || []) if (matches(sel, sub, form)) return sel;
  return null;
};

/* Which `in` port selector, if any, accepts this pair. Lives in `model`
   rather than beside its caller in `rules/machines.js#catchFalling` (where it
   was until Phase 16a) so that it and `feedCheck` below cannot drift into two
   different answers to "does this machine take this". */
export function acceptedBy(def, sub, form) {
  for (const p of def.ports || []) {
    if (p.mode !== 'in') continue;
    const sel = firstSel(p.accepts, sub, form);
    if (sel) return sel;
  }
  return null;
}

/* ---- WOULD THIS MACHINE TAKE THIS PAIR FROM A HAND, and how full is the
   clause that would hold it? `{ ok, why, have, cap }`.

   ONE DECISION, TWO READERS, the same arrangement `model/run.js#placementCheck`
   and `model/segments.js#linkCheck` already have: `rules/machines.js#handOne`
   ENFORCES this answer and `view/hud.js`'s build ghost PREVIEWS it, and `view`
   may not import `rules`. `have`/`cap` are here for the preview's sake -- the
   ghost prints them -- and are meaningless (both 0) when the refusal is
   'IT DOES NOT WANT THAT', since no clause was found to measure.

   REACH IS DELIBERATELY NOT CHECKED HERE, and this is the one thing to
   understand before adding a third caller. Reach is a fact about where the
   player's body is standing at the instant of a gesture, which is
   `shell/input.js`'s question and is asked exactly once, there, at
   `pointerdown` (docs/SPEC.md section 23.2). Folding it in would make this
   query unusable for the ghost, whose whole job is to answer for a machine the
   player has not walked to yet.

   The ORDER of the two refusals is locked (docs/SPEC.md section 23.4): wrong
   material beats no room, because a player holding gravel at a full furnace
   needs to be told the furnace does not want gravel. */
export function feedCheck(m, sub, form) {
  const def = MACH[m.def];
  const sel = def.handFeed ? firstSel(def.handFeed.from, sub, form) : null;
  if (!sel) return { ok: false, why: 'IT DOES NOT WANT THAT', have: 0, cap: 0 };
  const have = count(m, sel), cap = capOf(def, sel);
  if (have >= cap) return { ok: false, why: 'IT IS FULL', have, cap };
  return { ok: true, why: '', have, cap };
}

/* Which port/hand-feed/recipe selector, if any, is this definition's fuel
   requirement -- the exact star-slash-hash-fuel text every fuel-burning row
   already spells in `data/machines.js`'s `ports`/`handFeed` and
   `data/recipes.js`'s `in` clauses (see `data/forms.js`'s own selector-
   grammar comment for why that is spelled in words here too), found rather
   than re-declared so `statusOf` below can never disagree with what the
   machine actually accepts. Checked in that order
   because every fuel-burning row today declares it on a port (and usually
   hand-feed too); the recipe scan is what still catches a machine whose
   fuel requirement is expressed only inline (there is none today, but a row
   is free to be that shape). `null` for a machine that needs no fuel at all.
   Memoised per definition -- see docs/DEVELOPER_GUIDE.md#buffers-and-pockets */
const fuelSelCache = new Map();
export function fuelSelectorOf(def) {
  if (fuelSelCache.has(def)) return fuelSelCache.get(def);
  let sel = null;
  for (const p of def.ports || []) {
    if (sel || p.mode !== 'in') continue;
    sel = (p.accepts || []).find(s => s.includes('#fuel')) || null;
  }
  if (!sel) sel = (def.handFeed?.from || []).find(s => s.includes('#fuel')) || null;
  if (!sel) for (const r of recipesOf(def)) {
    if (sel) break;
    sel = Object.keys(r.in || {}).find(s => s.includes('#fuel')) || null;
  }
  fuelSelCache.set(def, sel);
  return sel;
}

/* `'running' | 'no-fuel' | 'idle'` -- the pure read behind the stalled-machine
   warning badge (`view/paint.js#paintMachine`) and the hover tooltip's status
   line (`view/hover.js`). `'running'` mirrors `m.running` exactly. `'no-fuel'`
   is reserved for a machine that actually NEEDS fuel (`fuelSelectorOf` found
   a selector) and whose buffer holds none of it right now -- the "silent
   stall" `rules/machines.js`'s own comments describe but, before this, never
   surfaced anywhere a player could see. Everything else -- has what it needs
   but is not mid-recipe, or needs nothing at all -- is `'idle'`; this
   function never has to know WHY a recipe did not fire, only whether fuel is
   the reason. */
export function statusOf(m) {
  if (m.running) return 'running';
  const sel = fuelSelectorOf(MACH[m.def]);
  if (sel && count(m, sel) <= 0) return 'no-fuel';
  return 'idle';
}

export const machinesInBand = b => machines.filter(m => m.band === b);
export const machineAt = (band, tx, ty) => machines.find(m =>
  m.band === band && tx >= m.tx && tx < m.tx + MACH[m.def].tw
                  && ty >= m.ty && ty < m.ty + MACH[m.def].th) || null;
