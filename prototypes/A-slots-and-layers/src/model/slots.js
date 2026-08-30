/* ============================================================
   SLOT OPS — the mutating verbs of a slot, implemented ONCE.

   This file is the other half of the promotion. In RFC 02 a slot's verbs are
   methods on whichever component provided it, so two providers of the same
   slot each carry their own copy of `put`/`take` and the contract is only
   duck-typed. Here the verbs belong to the SLOT, keyed by slot name, and
   operate on the plain record. Consequences:

     - two providers of `buffer` cannot disagree about what `take` means
     - a consumer holding a `buffer` record needs no knowledge of the provider
     - the records stay method-free, so a machine snapshots and diffs as JSON
       (which is RFC 02's weakest cell: DESIGN item 3, saves)

   Ops are declared in data/slots.js and asserted against this file at
   import. A slot with no ops (heat, servo, footprint, recipe) is read-only:
   its provider writes the record's fields, its consumers read them.
   ============================================================ */

import { SLOTS } from '../data/slots.js';
import { S, matches } from '../data/substances.js';
import { bump } from './epoch.js';

/* --- buffer ---------------------------------------------------------- */

/* The cap table is selector-keyed ({'#ore':4, timber:2}), so one entry
   covers every ore that will ever exist. First matching entry wins, and the
   selector it matched is also the pool the cap applies to. */
function capSel(rec, sub) {
  for (const sel of Object.keys(rec.cap))
    if (matches(sel).includes(sub)) return sel;
  return null;
}

const buffer = {
  /* How much of a selector's pool is in stock. */
  count(rec, sel) {
    let n = 0;
    for (const sub of matches(sel)) n += rec.stock[sub] ?? 0;
    return n;
  },

  /* Is there room for one more of this substance? A substance no cap entry
     matches has room 0, which is how a machine refuses what it cannot use. */
  room(rec, sub) {
    const sel = capSel(rec, sub);
    return sel !== null && buffer.count(rec, sel) < rec.cap[sel];
  },

  put(rec, sub, n = 1) {
    rec.stock[sub] = (rec.stock[sub] ?? 0) + n;
    bump();
  },

  /* Which single substance in this selector's pool has at least n in stock,
     or -1. This is the recipe's binding: '#ore':2 must find two of the SAME
     ore, not one copper and one tin. */
  pick(rec, sel, n = 1) {
    for (const sub of matches(sel))
      if ((rec.stock[sub] ?? 0) >= n) return sub;
    return -1;
  },

  takeSub(rec, sub, n = 1) {
    if ((rec.stock[sub] ?? 0) < n) return false;
    rec.stock[sub] -= n;
    if (rec.stock[sub] === 0) delete rec.stock[sub];
    bump();
    return true;
  },

  /* Sugar: pick then take, returning which substance went. */
  take(rec, sel, n = 1) {
    const sub = buffer.pick(rec, sel, n);
    if (sub < 0) return -1;
    buffer.takeSub(rec, sub, n);
    return sub;
  },

  /* 0..1 of capacity, for the servo. */
  fill(rec, sel) {
    const cap = rec.cap[sel];
    return cap ? Math.min(1, buffer.count(rec, sel) / cap) : 0;
  },

  /* Invariant 3: a pile with no consumer must fill and flag FULL. Backpressure
     is the mechanic, not a bug, so it is a first-class query. */
  full(rec, sel) { return buffer.fill(rec, sel) >= 1; }
};

/* --- emit ------------------------------------------------------------ */

const emit = {
  push(rec, sub, n = 1) { rec.queue.push({ sub, n }); bump(); }
};

export const OPS = { buffer, emit };

/* Contract check at import: declared ops exist, and no undeclared op hides
   here. A slot gaining a verb without a line in data/slots.js fails loudly
   the first time anything imports the model. */
for (const [name, def] of Object.entries(SLOTS)) {
  const impl = OPS[name] ?? {};
  for (const f of def.out)
    if (!(f in def.fields))
      throw new Error(`slot '${name}' declares out field '${f}' which is not in its contract`);
  for (const op of def.ops)
    if (typeof impl[op] !== 'function')
      throw new Error(`slot '${name}' declares op '${op}' with no implementation in model/slots.js`);
  for (const op of Object.keys(impl))
    if (!def.ops.includes(op))
      throw new Error(`model/slots.js implements '${name}.${op}' which data/slots.js does not declare`);
}

/* Re-exported under short names purely for readability at the call site:
   `buf.take(b, '#ore', 2)` reads better than `OPS.buffer.take(...)`. */
export { buffer as buf, emit as out };
export const subId = S;
