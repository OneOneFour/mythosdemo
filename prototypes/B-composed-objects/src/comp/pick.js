import { stat, hardOf } from '../sim/tunables.js';
import { SUB, AIR } from '../data/substances.js';
import { TILE } from '../world/tiles.js';

/* ============================================================
   Pick — WHERE MINING LIVES, and why here.

   PROVIDES: pick
   NEEDS:    body
   PERSISTS: nothing (progress on a half-dug tile is intentionally lost)
   TUNABLES: pick.power, pick.reach, hard.<sub>

   Mining is a VERB OF THE AGENT DOING IT, not a property of storage. The
   material declares only its cost and its yield (data/substances.js
   `tile.mine`); the actor declares how hard it swings. Putting progress here
   rather than in the tile array means:

     - progress is FLOAT SECONDS on the component, so there is no per-tile
       byte to truncate and no hardness a fast display can make unbreakable;
     - a second miner (a monster, a drill machine) is another host with this
       component and needs no per-tile arbitration;
     - the tile store stays a pure Uint8Array of material ids, which is what
       keeps 49,000 tiles on the array side of the object boundary;
     - `world.mining` holds one entry PER ACTIVE MINER for the crack overlay
       to read, instead of a 49 KB damage array that is almost all zeroes.

   The cost, stated plainly: aim your pick elsewhere and the progress is
   gone, because it was never stored on the tile. That is a design choice,
   not a limitation -- if partial damage must persist, it becomes a Field
   (world/field.js), not a byte per tile.
   ============================================================ */
export const Pick = {
  id: 'Pick', provides: ['pick'], needs: ['body'], persist: [],

  make(p) {
    return {
      secs: 0, tx: -1, ty: -1,

      link(host) { this.body = host.slots.body; },

      tick: function pickTick(dt, host, world) {
        const cmd = host.cmd;
        if (!cmd || !cmd.dig) { this.secs = 0; world.mining.delete(host.id); return; }

        const { tx, ty } = aimOf(this.body, cmd, stat('pick.reach'));
        if (tx !== this.tx || ty !== this.ty) { this.tx = tx; this.ty = ty; this.secs = 0; }

        const sub = world.tiles.subAt(tx, ty);
        const mine = SUB[sub].tile.mine;
        if (!mine) { world.mining.delete(host.id); return; }   // bedrock, air

        this.secs += dt * stat('pick.power');
        const need = hardOf(sub);
        world.mining.set(host.id, { tx, ty, f: this.secs / need });

        if (this.secs >= need) {
          world.tiles.set(tx, ty, AIR);
          world.spawnItem(tx * TILE + 4, ty * TILE + 4,
                          { sub, form: mine.yields.form, n: 1 }, 0, 0);
          this.secs = 0;
          world.mining.delete(host.id);
        }
      }
    };
  }
};

/* STUB (leaf): keyboard aim only; a real one takes the mouse position. */
function aimOf(body, cmd, reach) {
  const cx = body.x + body.w / 2, cy = body.y + body.h / 2;
  let dx = cmd.down || cmd.up ? 0 : (body.vx < 0 ? -TILE : TILE);
  let dy = cmd.down ? TILE : cmd.up ? -TILE : 0;
  const max = reach * TILE, d = Math.hypot(dx, dy) || 1;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  return { tx: Math.floor((cx + dx) / TILE), ty: Math.floor((cy + dy) / TILE) };
}
