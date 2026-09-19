/* model layer — placed machines: storage and queries.

   `def` is an index into `data/machines.js`, so the row is the definition and
   the record holds only what changes: buffer, progress, charges, fire, fuel
   bank, torque, speed, turn, slip. Buffers are keyed by the `sub/form` string
   from `model/items.js`, not by tile byte. */

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
     in world px because every frame reads them and none ever moves. */
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
      /* Raw fuel energy drawn from the buffer and not yet spent. A lump is
         worth more than one run, so the remainder has to live somewhere. */
      bank: 0,
      /* `torque` is the 0..1 drive delivered this frame, `speed` the shaft
         speed at this node, `turn` the accumulated rotation for the sprite.
         On every machine rather than only a crank, gear or hub, so `view`
         needs no key test. */
      torque: 0, speed: 0, turn: 0,
      /* A belt on a run too steep to grip. Items on it run back downhill. */
      slip: false
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
  bank(m, v)        { m.bank = v; bump(); },
  running(m, v)     { m.running = v; bump(); },

  /* `turn` accumulates from `dt` alone and never from `rand()`, so a gear
     sprite is reproducible from the seed and the frame count. */
  torque(m, v)      { m.torque = v; bump(); },
  speed(m, v)       { m.speed = v; bump(); },
  turn(m, phase)    { m.turn = phase; bump(); },
  slip(m, v)        { m.slip = v; bump(); },

  remove(m) {
    const i = machines.indexOf(m);
    if (i >= 0) machines.splice(i, 1);
    bump();
  },

  clear() { machines.length = 0; bump(); }
};

/* `sel`, throughout, is a selector over substance x form. */

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

/* The first buffered pair satisfying `sel` with at least `n` units, as
   `{sub, form}` or null, so a derived output can name the substance it ate.
   Buffer insertion order is the tiebreak, which is stable. */
export function firstMatching(m, sel, n) {
  for (const k in m.buf) {
    if (m.buf[k] < n) continue;
    const pair = parseKey(k);
    if (matches(sel, pair.sub, pair.form)) return pair;
  }
  return null;
}

/* Capacity of the buffer clause covering `sel`. An exact clause wins;
   otherwise the first declared clause whose selector overlaps does. */
export function capOf(def, sel) {
  const caps = def.buffer?.cap;
  if (!caps) return 0;
  if (caps[sel] !== undefined) return caps[sel];
  const pairs = expandCached(sel);
  for (const capSel in caps)
    if (pairs.some(p => matches(capSel, p.sub, p.form))) return caps[capSel];
  return 0;
}

/* `expand` allocates, and `capOf` runs per machine per frame, so results are
   memoised per selector. Selectors come from frozen data, so the cache is
   bounded by the content. */
const expandCache = new Map();
function expandCached(sel) {
  let v = expandCache.get(sel);
  if (!v) { v = expand(sel); expandCache.set(sel, v); }
  return v;
}

/* 0..1 fullness of the buffer clause matching `sel`. */
export function fill(m, sel) {
  const cap = capOf(MACH[m.def], sel);
  return cap > 0 ? Math.min(1, count(m, sel) / cap) : 0;
}

export const full = (m, sel) => count(m, sel) >= capOf(MACH[m.def], sel);

/* The first of `sels` matching this pair, over either mouth's list
   (`ports[].accepts` or `handFeed.from`). Returned as the selector rather than
   a boolean, because the cap is per selector -- the furnace's 8-ore/2-fuel
   asymmetry is expressed that way. */
const firstSel = (sels, sub, form) => {
  for (const sel of sels || []) if (matches(sel, sub, form)) return sel;
  return null;
};

/* Which `in` port selector, if any, accepts this pair. */
export function acceptedBy(def, sub, form) {
  for (const p of def.ports || []) {
    if (p.mode !== 'in') continue;
    const sel = firstSel(p.accepts, sub, form);
    if (sel) return sel;
  }
  return null;
}

/* Would this machine take this pair from a hand, and how full is the clause
   that would hold it? `have`/`cap` are 0 when no clause matched. Reach is not
   checked, so the build ghost can ask about a machine nobody has walked to.
   Wrong material is reported before no room. */
export function feedCheck(m, sub, form) {
  const def = MACH[m.def];
  const sel = def.handFeed ? firstSel(def.handFeed.from, sub, form) : null;
  if (!sel) return { ok: false, why: 'IT DOES NOT WANT THAT', have: 0, cap: 0 };
  const have = count(m, sel), cap = capOf(def, sel);
  if (have >= cap) return { ok: false, why: 'IT IS FULL', have, cap };
  return { ok: true, why: '', have, cap };
}

/* The reachable hand-feedable machine under the reticle, or null, shared by
   the LMB dispatch and the HUD's feed prompt. Deliberately not "would it take
   this pair": folding `feedCheck(...).ok` in makes its refusal strings
   unreachable and drops a wrong pair through to PLACE. */
export function feedTarget(armed) {
  if (!armed || !aim.valid || !aim.band) return null;
  const m = machineAt(aim.band, aim.tx, aim.ty);
  if (!m) return null;
  const def = defOf(m);
  if (!def.handFeed) return null;
  if (!overlaps(playerBox(), m.box, def.handFeed.reach)) return null;
  return m;
}

/* This definition's fuel selector, found rather than re-declared: ports
   first, then `handFeed.from`, then the recipes' own `in` clauses. `null` for
   a machine that needs no fuel. */
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

/* `'running' | 'no-fuel' | 'idle'`, behind the stalled-machine badge in
   `view/paint.js#paintMachine` and the `view/hover.js` status line.
   `'no-fuel'` needs `fuelSelectorOf` to have found a selector and the buffer
   to hold none of it; everything else is `'idle'`. */
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
