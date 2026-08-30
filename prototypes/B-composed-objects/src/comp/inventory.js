import { match, massOf } from '../sim/match.js';

/* ============================================================
   Inventory — the player's pockets. Deliberately the SAME SHAPE as a
   Buffer's slots ({ sub, form, n }), so HandFeed can move a stack between
   them without translating, and so render/hud.js has one loop for both.

   PROVIDES: inventory
   NEEDS:    -
   PERSISTS: slots

   `mass()` exists for DESIGN item 1 (cost of ascension: lift cost is
   k x depth over the mass you are carrying) and item 16 (Hades wants mass).
   Mass is derived from data, never stored: substance mass x form multiplier.
   ============================================================ */
export const Inventory = {
  id: 'Inventory', provides: ['inventory'], persist: ['slots'],

  make(p) {
    return {
      cap: p.cap ?? 40,
      slots: [],

      count(q) { let n = 0; for (const s of this.slots) if (match(q, s)) n += s.n; return n; },
      total()  { let n = 0; for (const s of this.slots) n += s.n; return n; },

      put(q, n = 1) {
        if (this.total() >= this.cap) return false;
        const s = this.slots.find(s2 => s2.sub === q.sub && s2.form === q.form);
        if (s) s.n += n; else this.slots.push({ sub: q.sub, form: q.form, n });
        return true;
      },

      take(q, n = 1) {
        const s = this.slots.find(s2 => match(q, s2) && s2.n >= n);
        if (!s) return null;
        s.n -= n;
        if (s.n === 0) this.slots.splice(this.slots.indexOf(s), 1);
        return { sub: s.sub, form: s.form, n };
      },

      mass() { let m = 0; for (const s of this.slots) m += massOf(s) * s.n; return m; },

      /* The HUD's only entry point. Returns the live array; render/hud.js
         sorts it with the shared byHudOrder comparator from data/forms.js so
         two different HUDs cannot disagree about order. */
      stacks() { return this.slots; }
    };
  }
};
