/* LAYER model — placed machines: storage and queries.

   A machine instance is a plain record. `def` is an index into
   `data/machines.js`, so the row is the definition and the record is only what
   changes: buffer, progress, charges, fire. Printing one in a debugger tells you
   everything about that machine's state, and `JSON.stringify(machines)` is a
   save.

   The buffer is keyed by substance ID STRING and not by tile-id byte. It is the
   one place in the project where the slower representation was chosen on
   purpose: a buffer is the thing you read while debugging a stuck factory, and
   `{ copper: 3, timber: 1 }` answers the question that `[0,0,3,0,1]` does not. */

import { MACH } from '../data/machines.js';
import { SUB, matches } from '../data/substances.js';
import { rect } from '../core/math.js';
import { bump } from './epoch.js';

export const machines = [];

export const write = {
  place(band, defIdx, tx, ty) {
    const def = MACH[defIdx];
    const t = band.tile;
    const m = {
      def: defIdx, band, tx, ty,
      box: rect(tx * t, ty * t, def.tw * t, def.th * t),
      mouth: {
        top:    rect(tx * t, ty * t - 2, def.tw * t, 4),
        bottom: rect(tx * t, (ty + def.th) * t - 2, def.tw * t, 4),
        left:   rect(tx * t - 2, ty * t, 4, def.th * t),
        right:  rect((tx + def.tw) * t - 2, ty * t, 4, def.th * t)
      },
      buf: {}, prog: 0, made: 0, charges: 0, fire: 0, running: false,
      /* one deck per stage, present only on rows carrying a `lift` block.
         Five stages means five machine records, each with its own drum, deck
         and counterweight — never one continuous cage (CLAUDE.md invariant 4). */
      deck: def.lift ? { y: ty * t, dir: 0, load: 0 } : null
    };
    machines.push(m);
    bump();
    return m;
  },

  take(m, subId, n)    { m.buf[subId] = (m.buf[subId] || 0) + n; bump(); },

  consume(m, subId, n) {
    m.buf[subId] = Math.max(0, (m.buf[subId] || 0) - n);
    if (!m.buf[subId]) delete m.buf[subId];
    bump();
  },

  prog(m, v)    { m.prog = v; bump(); },
  deck(m, y, dir) { m.deck.y = y; m.deck.dir = dir; bump(); },
  charge(m, n)  { m.charges += n; m.made += n; bump(); },
  spendCharge(m, n) { m.charges = Math.max(0, m.charges - n); bump(); },
  fire(m, v)    { m.fire = v; bump(); },
  running(m, v) { m.running = v; bump(); },

  clear() { machines.length = 0; bump(); }
};

/* ---- queries. `sel` is 'copper' or '#ore'. ---- */

/* Units of anything matching `sel` in this machine's buffer. */
export const count = (m, sel) => {
  let n = 0;
  for (const sub of matches(sel)) n += m.buf[SUB[sub].id] || 0;
  return n;
};

/* The first substance in the buffer that satisfies `sel` with at least `n`
   units. The machine interpreter needs this to know WHICH ore it just ate, so
   that a derived output can be looked up. Returns a substance id or null. */
export const firstMatching = (m, sel, n) => {
  for (const sub of matches(sel)) {
    const id = SUB[sub].id;
    if ((m.buf[id] || 0) >= n) return id;
  }
  return null;
};

export const capOf = (def, sel) => {
  const caps = def.buffer?.cap;
  if (!caps) return 0;
  if (caps[sel] !== undefined) return caps[sel];
  /* a literal substance may be capped by a tag clause it matches */
  for (const [capSel, cap] of Object.entries(caps))
    if (matches(capSel).some(s => matches(sel).includes(s))) return cap;
  return 0;
};

/* 0..1 fullness of the buffer clause matching `sel`. The servo flag reads this,
   and so does the pip row in the HUD. */
export const fill = (m, sel) => {
  const cap = capOf(MACH[m.def], sel);
  return cap > 0 ? Math.min(1, count(m, sel) / cap) : 0;
};

export const full = (m, sel) => count(m, sel) >= capOf(MACH[m.def], sel);

export const machinesInBand = b => machines.filter(m => m.band === b);
