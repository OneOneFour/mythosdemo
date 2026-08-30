import { match } from '../sim/match.js';
import { SUB } from '../data/substances.js';

/* ============================================================
   CatchBox — "material that falls in is free". The whole game in one
   component: placing a furnace under a vein beats placing it on the surface.

   PROVIDES: catch
   NEEDS:    buffer, footprint
   PERSISTS: nothing (`ingest` is a visual pulse and may be lost)

   It queries the spatial index rather than scanning every item, so the cost
   is a few cells rather than items x machines.
   ============================================================ */
export const CatchBox = {
  id: 'CatchBox', provides: ['catch'], needs: ['buffer', 'footprint'],
  persist: [],

  make(p) {
    return {
      accepts: p.accepts ?? '*', mouth: p.mouth ?? 'top',

      link(host) { this.buf = host.slots.buffer; this.fp = host.slots.footprint; },

      tick: function catchBoxTick(dt, host, world) {
        const f = this.fp;
        world.index.each(f.x, f.y - 2, f.w, f.h + 2, e => {
          if (e.tag !== 'item') return;
          if (!match(this.accepts, e) || !this.buf.room(e)) return;   // full: it rests
          this.buf.put(e, 1);
          world.burst(e.x, e.y, 4, SUB[e.sub].item.col);
          world.kill(e);
          host.look.ingest = 0.2;
        });
      }
    };
  }
};
