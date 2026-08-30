import { rand } from '../core/rng.js';

/* ============================================================
   Emitter — output leaves as a FALLING ITEM, never as an inventory credit.
   That is the genre statement: the machine drops what it made and gravity
   decides where it goes.

   PROVIDES: emit
   NEEDS:    footprint
   PERSISTS: queue

   `queue` is the one place in this design where a component hands another
   component a payload rather than a state to read. It is legal here because
   there is exactly one drainer (this component, in its own tick) -- see the
   observation rule at the bottom of comp/recipe.js.
   ============================================================ */
const MOUTH = {
  top:    f => ({ x: f.x + f.w / 2, y: f.y - 4 }),
  bottom: f => ({ x: f.x + f.w / 2, y: f.y + f.h + 2 }),
  left:   f => ({ x: f.x - 3,       y: f.y + f.h / 2 }),
  right:  f => ({ x: f.x + f.w + 3, y: f.y + f.h / 2 })
};

export const Emitter = {
  id: 'Emitter', provides: ['emit'], needs: ['footprint'], persist: ['queue'],

  make(p) {
    return {
      at: p.at ?? 'bottom', vx: p.vx ?? 0, vy: p.vy ?? 0, queue: [],

      link(host) {
        this.fp = host.slots.footprint;
        if (!MOUTH[this.at])
          throw new Error(host.type + '.Emitter: no such mouth ' + this.at);
      },

      push(q) { this.queue.push({ sub: q.sub, form: q.form, n: q.n || 1 }); },

      tick: function emitterTick(dt, host, world) {
        while (this.queue.length) {
          const q = this.queue.shift(), m = MOUTH[this.at](this.fp);
          for (let k = 0; k < q.n; k++)
            world.spawnItem(m.x, m.y, q, this.vx + (rand() - 0.5) * 20, this.vy);
          host.look.emit = 0.25;
        }
      }
    };
  }
};
