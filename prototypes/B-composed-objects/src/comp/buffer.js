import { match } from '../sim/match.js';

/* ============================================================
   Buffer — the only place a machine's contents live.

   PROVIDES: buffer
   NEEDS:    -
   PERSISTS: slots

   Capacity is PER FORM, keyed by form name with a '*' fallback. That
   asymmetry is deliberate: the furnace holds 4 ore and 2 logs, and a single
   uniform cap cannot say that.

   BACKPRESSURE (CLAUDE invariant 3, DESIGN item 20) is `room()` returning
   false and the caller doing nothing. A full buffer is not an error and not
   a special state -- the item simply is not taken, so it rests on the pile
   and the pile reads FULL. A buffer never shrinks on its own.
   ============================================================ */
export const Buffer = {
  id: 'Buffer', provides: ['buffer'], persist: ['slots'],

  make(p) {
    return {
      cap: p.cap || { '*': 8 },
      slots: [],                                   // [{ sub, form, n }]

      capFor(q) { return this.cap[q.form] ?? this.cap['*'] ?? 0; },
      count(q)  { let n = 0; for (const s of this.slots) if (match(q, s)) n += s.n; return n; },
      room(q)   { return this.count({ form: q.form }) < this.capFor(q); },
      full(q)   { return !this.room(q); },

      put(q, n = 1) {
        const s = this.slots.find(s2 => s2.sub === q.sub && s2.form === q.form);
        if (s) s.n += n; else this.slots.push({ sub: q.sub, form: q.form, n });
      },

      /* Returns the concrete stack it came out of, or null. Callers need the
         concrete substance back because a query may have held a $s hole. */
      take(q, n = 1) {
        const s = this.slots.find(s2 => match(q, s2) && s2.n >= n);
        if (!s) return null;
        s.n -= n;
        if (s.n === 0) this.slots.splice(this.slots.indexOf(s), 1);
        return { sub: s.sub, form: s.form, n };
      },

      tick: function bufferTick(dt, host) { host.look.buffer = this.slots; }
    };
  }
};
