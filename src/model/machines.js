/* LAYER model — placed machines: storage and queries.
   Imports `core`, `data`, `model`. May be imported by `model`, `rules`, `view`.

   A machine instance is a plain record. `def` is an index into
   `data/machines.js`, so the ROW is the definition and the RECORD is only what
   changes: buffer, progress, charges, fire, torque, turn. Printing one in a
   debugger
   tells you everything about that machine's state, and `JSON.stringify(machines)`
   is most of a save.

   Buffers are keyed by the `sub/form` string from `model/items.js`, not by tile
   byte. See the note there: a buffer is read by a human debugging a stuck
   factory, and the byte form answers the wrong question. */

import { overlaps, rect } from '../core/math.js';
import { MACH } from '../data/machines.js';
import { expand, matches } from '../data/forms.js';
import { recipesOf } from '../data/recipes.js';
import { aim } from './aim.js';
import { bump } from './epoch.js';
import { keyOf, parseKey } from './items.js';
import { playerBox } from './player.js';
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
      /* DRIVETRAIN STATE LIVES ON THE MACHINE RECORD, for the reason `running` and
         `fire` already set: `view` must draw a turning gear and may not
         import `rules`. `torque` is the 0..1 drive delivered this frame,
         `turn` is accumulated rotation for the sprite. Present on EVERY
         machine rather than only a crank, gear or hub, so `view` needs no key
         test -- the same reason `charges` is not conditional. */
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

  /* Drivetrain writers, declared together so the two
     numbers `view` reads live in one place from the start. `turn` ACCUMULATES
     from `dt` alone and never from `rand()`, so a gear sprite is
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

/* queries. `sel` is a selector over substance x form. */

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

/* TWO CALLERS, TWO SELECTOR LISTS, ONE MATCH RULE. A machine says what it
   takes twice, for two mouths: `ports[].accepts` is what may fall or be
   belted IN, `handFeed.from` is what a hand may give. The LISTS differ per
   row and stay separate; the QUESTION asked of each is the same one.

   Returned as the matching SELECTOR rather than a boolean, because the CAP is
   per selector -- the furnace's 8-ore/2-fuel asymmetry is expressed that way,
   and a caller that only learned "yes" would have to find the clause again. */
const firstSel = (sels, sub, form) => {
  for (const sel of sels || []) if (matches(sel, sub, form)) return sel;
  return null;
};

/* Which `in` port selector, if any, accepts this pair. In `model` rather than
   beside its caller so it and `feedCheck` cannot drift into two different
   answers to "does this machine take this". */
export function acceptedBy(def, sub, form) {
  for (const p of def.ports || []) {
    if (p.mode !== 'in') continue;
    const sel = firstSel(p.accepts, sub, form);
    if (sel) return sel;
  }
  return null;
}

/* WOULD THIS MACHINE TAKE THIS PAIR FROM A HAND, and how full is the clause
   that would hold it? ONE DECISION, TWO READERS: `handOne` ENFORCES it and
   the build ghost PREVIEWS it. `have`/`cap` are both 0 on 'IT DOES NOT WANT
   THAT', since no clause was found to measure.

   REACH IS DELIBERATELY NOT CHECKED HERE: folding it in would make this
   unusable for a ghost answering about a machine nobody has walked to. The
   ORDER of the two refusals is locked -- wrong material beats no room. */
export function feedCheck(m, sub, form) {
  const def = MACH[m.def];
  const sel = def.handFeed ? firstSel(def.handFeed.from, sub, form) : null;
  if (!sel) return { ok: false, why: 'IT DOES NOT WANT THAT', have: 0, cap: 0 };
  const have = count(m, sel), cap = capOf(def, sel);
  if (have >= cap) return { ok: false, why: 'IT IS FULL', have, cap };
  return { ok: true, why: '', have, cap };
}

/* THE FEED TARGET: the machine LMB rule 2 would hand `armed` to, or null.
   Reach IS asked here, unlike in `feedCheck`, whose other reader is a ghost.

   DELIBERATELY NOT "would it take this pair?" Folding `feedCheck(...).ok` in
   would make both its refusal strings unreachable from LMB -- a wrong or
   unwanted pair would return null and the press would fall through to PLACE,
   which is how a rung once ended up inside a furnace's footprint. A
   reachable, hand-feedable machine under the reticle is ALWAYS the target.

   Exported so the LMB dispatch and the HUD's feed prompt share one answer. */
export function feedTarget(armed) {
  if (!armed || !aim.valid || !aim.band) return null;
  const m = machineAt(aim.band, aim.tx, aim.ty);
  if (!m) return null;
  const def = defOf(m);
  if (!def.handFeed) return null;
  if (!overlaps(playerBox(), m.box, def.handFeed.reach)) return null;
  return m;
}

/* Which selector, if any, is this definition's fuel requirement -- FOUND
   rather than re-declared, so `statusOf` can never disagree with what the
   machine actually accepts. Checked ports first, because every fuel-burning
   row today declares it there; the recipe scan catches a machine whose fuel
   requirement is only inline. `null` for a machine that needs no fuel. */
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
