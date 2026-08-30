import { tickHost } from './assemble.js';
import { stat } from './tunables.js';
import { TILE } from '../world/tiles.js';

/* ============================================================
   STEP — the fixed timestep and the one global tick order.

   1/120 s, accumulated, clamped at 0.25 s. Nothing in the sim ever sees a
   variable dt, so a slow frame is more steps rather than bigger steps, and
   the maximum travel per step is bounded regardless of framerate.

   ORDER, and it is deliberate:
     1. actors    -- input has already been written to host.cmd
     2. machines  -- they read the player's position and inventory, so they
                     must run after the player moved this step
     3. items     -- gravity, then index update
     4. fields    -- after every emitter has written into them
   Within a host, order is the topological sort in sim/assemble.js.

   WHERE A JOURNAL WOULD GO. DESIGN item 17's suspicion meter wants to
   observe every item that crosses a depth threshold downward. No host owns
   that, so the observation rule in comp/recipe.js does not reach it. The
   honest answer is a per-step append-only list built HERE, in the loop that
   already touches every item, drained once per step by a single reader --
   NOT a host.emit() on components. Marked, not built: there is one consumer
   and it does not exist yet.
   ============================================================ */
export const FIXED = 1 / 120;

export function step(world, dt) {
  world.acc = Math.min(0.25, world.acc + dt);
  while (world.acc >= FIXED) { tickOnce(world, FIXED); world.acc -= FIXED; }
}

export function tickOnce(world, dt) {
  for (const a of world.actors) tickHost(a, dt, world);
  for (const m of world.machines) tickHost(m, dt, world);

  const grav = stat('grav'), term = stat('terminal');
  for (let i = world.items.length - 1; i >= 0; i--) {
    const it = world.items[i];
    it.age += dt;
    if (it.rest) continue;                     // resting items cost nothing
    it.vy = Math.min(term, it.vy + grav * dt);
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    /* STUB (leaf): items share the player's swept collision in a real build
       -- that is the point of Body being a component -- but wiring an item as
       a host costs it a slot table, so items get this three-line landing test
       instead. That asymmetry is a real seam and it is where the two
       integrators could drift apart. */
    if (world.tiles.isSolid((it.x / TILE) | 0, ((it.y + 4) / TILE) | 0)) {
      it.vy = 0; it.rest = true;
    }
    world.index.update(it);
  }

  for (const k in world.fields)
    world.fields[k].tick(dt, stat('field.' + k + '.decay'));
}
