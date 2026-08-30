/* ============================================================
   Hearts — five discrete hearts, per docs/SPEC.md. Health is a component on
   the actor, NOT a global in run state and NOT a substance.

   PROVIDES: hearts
   NEEDS:    -
   PERSISTS: n, max

   That placement is what lets comp/bloodburner.js exist: "the player's
   health" is reachable as `world.player.slots.hearts` with a two-method
   interface, so a machine can spend it without health becoming an item, an
   inventory row or a recipe input.

   `spend()` returns a boolean and refuses to kill on the last heart taken by
   a machine -- a trap boon should bleed you, and death is the director's
   call (sim/run.js), not a burner's.
   ============================================================ */
export const Hearts = {
  id: 'Hearts', provides: ['hearts'], persist: ['n', 'max'],

  make(p) {
    return {
      max: p.max ?? 5,
      n: p.max ?? 5,
      flash: 0,

      spend(k = 1) {
        if (this.n - k < 1) return false;    // a machine may not take the last
        this.n -= k; this.flash = 0.4;
        return true;
      },
      hurt(k = 1) { this.n = Math.max(0, this.n - k); this.flash = 0.4; },
      heal(k = 1) { this.n = Math.min(this.max, this.n + k); },
      dead() { return this.n <= 0; },

      tick: function heartsTick(dt, host) {
        this.flash = Math.max(0, this.flash - dt);
        host.look.hearts = this.n;
        host.look.hurt = this.flash;
      }
    };
  }
};
