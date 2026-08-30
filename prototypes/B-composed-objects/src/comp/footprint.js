import { TILE } from '../world/tiles.js';

/* ============================================================
   Footprint — occupies tiles, validates placement, indexes the host.

   PROVIDES: footprint
   NEEDS:    -
   PERSISTS: nothing (tx/ty live on the host, geometry is derived)

   Every component file carries a header in this shape, so
   `grep -A2 "PROVIDES:" comp/*.js` answers "what can provide `heat`?" --
   the query RFC 02 admitted grep was bad at.
   ============================================================ */
export const Footprint = {
  id: 'Footprint', provides: ['footprint'], persist: [],

  make(p, T) {
    return {
      tw: T.size[0], th: T.size[1], footing: T.footing ?? 1,
      x: 0, y: 0, w: 0, h: 0,

      link(host) {
        this.x = host.tx * TILE; this.y = host.ty * TILE;
        this.w = this.tw * TILE; this.h = this.th * TILE;
      },

      /* Returns an error STRING or null. It returns a string rather than
         calling toast() because sim may not talk to the HUD; the caller in
         sim/assemble.js hands it back and main.js decides what to show. */
      valid(host, world) {
        for (let j = 0; j < this.th; j++)
          for (let i = 0; i < this.tw; i++)
            if (world.tiles.isSolid(host.tx + i, host.ty + j)) return 'NEEDS CLEAR SPACE';
        let f = 0;
        for (let i = 0; i < this.tw; i++)
          if (world.tiles.isSolid(host.tx + i, host.ty + this.th)) f++;
        return f >= this.footing ? null : 'NEEDS A FLOOR';
      },

      /* Is a rect touching this machine? Used by HandFeed and CatchBox. */
      overlaps(x, y, w, h) {
        return x < this.x + this.w && x + w > this.x &&
               y < this.y + this.h && y + h > this.y;
      }
    };
  }
};
