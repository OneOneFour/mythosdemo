/* ============================================================
   HeatVent — a machine emitting into the heat field. The field seam, from
   the machine's side.

   PROVIDES: -
   NEEDS:    footprint, recipe
   PERSISTS: seen

   This is the component RFC 02 predicted would want an event bus, and it is
   built the other way on purpose. It needs to know that a craft FINISHED --
   an occurrence. It gets that by polling `recipe.made`, a monotonic counter,
   against its own shadow copy. Eight lines, no dispatch, no ordering
   surprise, because assemble() ranks this after Recipe (it needs `recipe`).

   See the observation rule at the bottom of comp/recipe.js for what this
   costs and where it stops working.
   ============================================================ */
export const HeatVent = {
  id: 'HeatVent', needs: ['footprint', 'recipe'], persist: ['seen'],

  make(p) {
    return {
      watts: p.watts ?? 20, at: p.at ?? 'top', seen: 0,

      link(host) { this.rec = host.slots.recipe; this.fp = host.slots.footprint; },

      tick: function heatVentTick(dt, host, world) {
        const f = world.fields.heat;
        if (!f) return;                          // a band may declare no heat field
        /* continuous: a working machine is warm */
        if (host.look.busy > 0)
          f.add(host.tx + (this.fp.tw >> 1), host.ty, this.watts * dt * 0.25);
        /* discrete: each completed craft is a puff. The counter, polled. */
        const made = this.rec.made;
        if (made !== this.seen) {
          f.add(host.tx + (this.fp.tw >> 1), host.ty - 1,
                this.watts * (made - this.seen));
          this.seen = made;
        }
      }
    };
  }
};
