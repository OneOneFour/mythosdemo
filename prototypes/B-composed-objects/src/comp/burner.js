/* ============================================================
   Burner — fuel, separated from reagent.

   PROVIDES: heat
   NEEDS:    buffer
   PERSISTS: lit

   Fuel is not a reagent: the furnace's timber is an INPUT of the smelt
   recipe, whereas the kiln's timber is consumed by this component and never
   appears in the bake recipe. Both readings are legitimate and the
   difference is visible in the machine row, which is the point.

   `hot()` is the entire published interface. Nothing that consumes heat
   knows this component exists -- comp/deck.js and comp/recipe.js both call
   `slots.heat.hot()`. That is why comp/bloodburner.js can exist.

   TWO CONSUMERS, DELIBERATELY. RFC 02's weakness 6 says Burner should not
   ship before a second heat-driven machine exists. It has two: the kiln's
   `hot: true` recipe and the winch's Deck. If both were removed, delete this
   file rather than leaving it as a component with no consumer.
   ============================================================ */
export const Burner = {
  id: 'Burner', provides: ['heat'], needs: ['buffer'], persist: ['lit'],

  make(p) {
    return {
      fuel: p.fuel, span: p.secs ?? 8, lit: 0,

      link(host) { this.buf = host.slots.buffer; },

      tick: function burnerTick(dt, host) {
        this.lit = Math.max(0, this.lit - dt);
        /* POLLS the buffer rather than being notified when CatchBox drops
           fuel in. Costs one array scan per tick and loses nothing, because
           assemble() ranks CatchBox (provides `catch`, needs `buffer`) and
           Burner in the same tick and the buffer is a direct reference. */
        if (this.lit <= 0 && this.buf.take(this.fuel, 1)) this.lit = this.span;
        host.look.fire = this.lit > 0 ? Math.min(1, this.lit / this.span) : 0;
      },

      hot() { return this.lit > 0; }
    };
  }
};
