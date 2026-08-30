/* ============================================================
   HandFeed — stand adjacent and the machine takes from your pockets.

   PROVIDES: -
   NEEDS:    buffer, footprint, recipe
   PERSISTS: nothing

   It names no substance. It asks the Recipe what it would accept next
   (`wants()`), which is why the furnace hand-feeds copper AND tin AND
   anything added later without this file changing.

   It needs `recipe`, so a machine with no recipe cannot mount it -- and if
   you put HandFeed on the blood winch by mistake, assemble() throws
   'bloodWinch.HandFeed needs slot recipe' at boot.
   ============================================================ */
export const HandFeed = {
  id: 'HandFeed', needs: ['buffer', 'footprint', 'recipe'], persist: [],

  make(p) {
    return {
      pad: p.pad ?? 10,

      link(host) {
        this.buf = host.slots.buffer;
        this.fp  = host.slots.footprint;
        this.rec = host.slots.recipe;
      },

      tick: function handFeedTick(dt, host, world) {
        const f = this.fp, body = world.player?.slots.body;
        if (!body) return;
        if (!f.overlaps(body.x - this.pad, body.y - 4,
                        body.w + this.pad * 2, body.h + 12)) return;
        const inv = world.player.slots.inventory;
        for (const q of this.rec.wants())
          if (this.buf.room(q) && inv.take(q, 1)) this.buf.put(q, 1);
        host.look.handfeed = 0.15;
      }
    };
  }
};
