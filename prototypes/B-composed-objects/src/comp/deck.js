import { stat } from '../sim/tunables.js';

/* ============================================================
   Deck — ONE lift stage. CLAUDE invariant 4: five independent stages, each
   with its own drum, deck and counterweight, never one continuous cage. Five
   stages is the `winch` row placed five times, not a `span: 480` parameter.

   PROVIDES: deck
   NEEDS:    footprint, heat
   PERSISTS: y, dir, load
   TUNABLES: lift.up, lift.down

   CLAUDE invariant 5, down is free and up is expensive, is these two lines:
   it descends at `lift.down` (26 px/s) unconditionally and ascends at
   `lift.up` (11 px/s) ONLY while the heat slot is lit. The asymmetry lives in
   sim/tunables.js so a boon can change the numbers without touching this.

   `needs: ['heat']` is the single line that makes the blood winch free.
   This file cannot tell a timber burner from a blood burner and has no
   branch that could.
   ============================================================ */
export const Deck = {
  id: 'Deck', provides: ['deck'], needs: ['footprint', 'heat'],
  persist: ['y', 'dir', 'load'],

  make(p) {
    return {
      span: p.span ?? 96,          // px this stage covers; one level pair
      y: 0,                        // px from the stage's top
      dir: 1,                      // +1 descending, -1 ascending
      load: [],                    // [{ sub, form, n }] riding the deck

      link(host) { this.fp = host.slots.footprint; this.heat = host.slots.heat; },

      tick: function deckTick(dt, host) {
        const up = stat('lift.up'), down = stat('lift.down');
        if (this.dir > 0) {
          this.y = Math.min(this.span, this.y + down * dt);
          if (this.y >= this.span) this.dir = -1;
        } else if (this.heat.hot()) {                 // and ONLY then
          this.y = Math.max(0, this.y - up * dt);
          if (this.y <= 0) this.dir = 1;
        }
        host.look.deckY = this.y;
        host.look.fire  = host.look.fire ?? 0;
        /* STUB: handing cargo on and off at the stage ends is the relay, and
           it needs the pile/chute components this skeleton does not build
           (DESIGN item 21). `load` exists so the shape of the save is right. */
      }
    };
  }
};
