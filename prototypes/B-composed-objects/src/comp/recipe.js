import { RECIPES } from '../data/recipes.js';
import { bindAll, expand, resolve } from '../sim/match.js';
import { stat } from '../sim/tunables.js';

/* ============================================================
   Recipe — the only recipe engine in the codebase. Selects a row by tag,
   binds $s, runs the clock, pays the inputs, pushes the outputs.

   PROVIDES: recipe
   NEEDS:    buffer, emit, heat?
   PERSISTS: prog, made, cur  (via save/load below -- see the note)
   TUNABLES: machine.rate

   It knows no substance and no machine. `furnace` and `crusher` differ only
   in which pool their tag selects.

   THE HEAT GATE is two lines and carries three DESIGN items:
     - `r.hot`  -> asks the `heat` SLOT. Any provider satisfies it, which is
                   the blood winch (item 12) and the kiln (item 9).
     - `r.band` -> asks the ambient heat FIELD at this tile, which is
                   mutually hostile boons (item 11) and buoyant heat (item 5).
   ============================================================ */
export const Recipe = {
  id: 'Recipe', provides: ['recipe'], needs: ['buffer', 'emit', 'heat?'],

  /* PERSISTENCE. `cur` is a reference to a row in the RECIPES table, so it
     cannot be written as a field -- a save must store its `id` and look it
     up again. That is why a component may override the default `persist`
     list with an explicit save/load pair. */
  save: c => ({ prog: c.prog, made: c.made, cur: c.cur ? c.cur.id : null }),
  load(c, s) {
    c.prog = s.prog; c.made = s.made;
    c.cur = s.cur ? RECIPES.find(r => r.id === s.cur) || null : null;
    /* If the row was deleted between versions the craft is dropped rather
       than crashing. The clock keeps its progress, which is generous, and is
       a deliberate choice over silently zeroing it. */
    c.bind = c.cur ? bindAll(c.cur.in, c.buf) : null;
  },

  make(p) {
    return {
      tag: p.tag, prog: 0, made: 0, cur: null, bind: null,
      stall: '',                       // why it is not running; read by explain()

      link(host) {
        this.buf   = host.slots.buffer;
        this.emit  = host.slots.emit;
        this.heat  = host.slots.heat || null;
        this.pool  = RECIPES.filter(r => r.tag === this.tag);
        if (!this.pool.length)
          throw new Error(host.type + '.Recipe: no RECIPES row has tag ' + this.tag);
      },

      /* Concrete inputs this machine would accept next. Drives HandFeed and
         the HUD. Bounded: pool x one hole, and only called for the machine
         the player is touching. */
      wants() {
        const out = [];
        for (const r of this.pool)
          for (const q of r.in) out.push(...expand(q));
        return out;
      },

      secsOf(r) { return r.secs / stat('machine.rate'); },

      tick: function recipeTick(dt, host, world) {
        if (!this.cur) {
          for (const r of this.pool) {
            const b = bindAll(r.in, this.buf);
            if (b) { this.cur = r; this.bind = b; break; }
          }
          if (!this.cur) {
            this.prog = 0; this.stall = 'NO INPUTS';
            host.look.busy = 0; return;
          }
        }
        if (this.cur.hot && !(this.heat && this.heat.hot())) {
          this.stall = 'COLD'; host.look.busy = 0; return;
        }
        if (this.cur.band && !this.inBand(host, world)) {
          this.stall = 'WRONG TEMPERATURE'; host.look.busy = 0; return;
        }
        this.stall = '';
        const secs = this.secsOf(this.cur);
        this.prog += dt;
        host.look.busy = this.prog / secs;
        if (this.prog < secs) return;

        for (const q of this.cur.in)  this.buf.take(resolve(q, this.bind), q.n || 1);
        for (const q of this.cur.out) this.emit.push(resolve(q, this.bind));
        this.prog = 0; this.cur = null; this.bind = null;
        this.made++;              // a monotonic counter, not an event: see below
      },

      inBand(host, world) {
        const v = world.fields.heat ? world.fields.heat.at(host.tx, host.ty) : 0;
        return v >= this.cur.band[0] && v <= this.cur.band[1];
      }
    };
  }
};

/* ------------------------------------------------------------------
   THE OBSERVATION RULE, and RFC 02's weakness 2.

   `made` above is a MONOTONIC COUNTER, deliberately not a callback and not
   an event. RFC 02 predicted that the slot mechanism is "one requirement
   away from becoming an ad-hoc event system", and it was right about where
   the pressure comes from: comp/heatvent.js wants to know that a craft
   FINISHED, which is an occurrence, not a state.

   The rule this codebase follows instead of adding host.emit():

     A component may publish a counter or a flag. An observer polls it and
     keeps its own last-seen value. Producers never call observers.

   heatvent.js is that pattern in eight lines. It survives because tick order
   is topologically sorted, so an observer downstream of its producer sees
   every increment in the same tick it happened.

   WHAT IT COSTS, honestly: an observer stores a shadow copy per counter it
   watches, and a counter cannot carry a payload -- "a craft finished" is
   expressible, "a craft of 1.4 kg of tin finished, at this position" is not.
   Where a payload is genuinely needed we use a bounded queue with EXACTLY
   ONE drainer (comp/emitter.js `queue`). That is a one-hop channel and it is
   only not a bus because ownership is 1:1 and enforced by assemble()
   refusing two providers of the same slot. The tripwire is a second drainer:
   DESIGN item 17's suspicion meter wants to watch every item that moves
   downward, which no host owns. When that lands, the honest move is a real
   journal in sim/, not host.emit() -- see sim/step.js.
   ------------------------------------------------------------------ */
