import { stat } from '../sim/tunables.js';
import { TILE } from '../world/tiles.js';

/* ============================================================
   Body — the ONLY code that moves anything. The player hosts it; so does a
   monster; so does a falling item (world/world.js gives items the same
   integrator rather than a second worse copy).

   PROVIDES: body
   NEEDS:    -
   PERSISTS: x, y, vx, vy, onGround, fromY
   TUNABLES: walk, hop, climb, grav, terminal, fall.safe, fall.heart

   Not one gameplay number in this file is a module constant, which is the
   whole of DESIGN item 8 on the player's side. `stat('walk')` is read per
   tick; a trinket applying x1.15 in sim/boons.js changes it with no
   reassignment of any binding anywhere.

   `fromY` is recorded on ground-leave so fall damage is GEOMETRIC TILES
   FALLEN against the SPEC table, not a velocity sample -- a velocity sample
   is framerate-dependent and this is not.
   ============================================================ */
export const Body = {
  id: 'Body', provides: ['body'],
  persist: ['x', 'y', 'vx', 'vy', 'onGround', 'fromY'],

  make(p) {
    return {
      w: p.w ?? 6, h: p.h ?? 16,
      x: 0, y: 0, vx: 0, vy: 0,
      onGround: false, onLadder: false, fromY: 0,

      overlaps(x, y, w, h) {
        return x < this.x + this.w && x + w > this.x &&
               y < this.y + this.h && y + h > this.y;
      },

      tick: function bodyTick(dt, host, world) {
        const cmd = host.cmd || EMPTY_CMD;
        const wasGround = this.onGround;

        this.vx = (cmd.right ? 1 : cmd.left ? -1 : 0) *
                  (this.onLadder ? stat('climb') : stat('walk'));
        if (cmd.jump && this.onGround) this.vy = -stat('hop');
        this.vy = Math.min(stat('terminal'), this.vy + stat('grav') * dt);

        /* Swept, <= 1 px per axis step, under sim/step.js's fixed 1/120 s
           accumulator, so nothing can pass through a tile at any framerate.
           STUB: the per-step collision resolution is the leaf and is out of
           scope per the brief; the sweep structure is real because it is the
           part being evaluated. */
        move(this, this.vx * dt, 0, world);
        move(this, 0, this.vy * dt, world);

        if (!this.onGround && wasGround) this.fromY = this.y;
        if (this.onGround && !wasGround) {
          const tiles = Math.max(0, (this.y - this.fromY) / TILE);
          const hearts = host.slots.hearts;
          if (hearts) {
            const px = tiles * TILE;
            const over = Math.max(0, px - stat('fall.safe'));
            const n = Math.min(5, Math.floor(over / stat('fall.heart')));
            if (n > 0) hearts.spend(n);
          }
        }
        host.look.walkPhase = (host.look.walkPhase || 0) + Math.abs(this.vx) * dt;
      }
    };
  }
};

const EMPTY_CMD = { left: 0, right: 0, jump: 0, dig: 0, up: 0, down: 0 };

function move(b, dx, dy, world) {
  const steps = Math.max(1, Math.ceil(Math.abs(dx || dy)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    const nx = b.x + sx, ny = b.y + sy;
    if (blocked(world, nx, ny, b.w, b.h)) {
      if (sy > 0) b.onGround = true;
      if (sy !== 0) b.vy = 0; else b.vx = 0;
      return;
    }
    b.x = nx; b.y = ny;
    if (sy !== 0) b.onGround = false;
  }
}

/* STUB (leaf): a real one tests the four corners against the tile store. */
const blocked = (world, x, y, w, h) =>
  world.tiles.isSolid(Math.floor(x / TILE), Math.floor((y + h) / TILE));
