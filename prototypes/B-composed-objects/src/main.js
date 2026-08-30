import { checkTables } from './sim/tables.js';
import { newMeta, newRun, tickRun, take } from './sim/run.js';
import { step } from './sim/step.js';
import { assemble } from './sim/assemble.js';
import { MACHINES } from './data/machines.js';
import { snapshot, restore } from './sim/save.js';
import { equip, drop } from './sim/boons.js';
import { stat } from './sim/tunables.js';
import { explainHost } from './sim/explain.js';
import { paintDirty } from './render/chunks.js';
import { drawHost } from './render/looks.js';
import { pockets } from './render/hud.js';
import { seed as seedRng } from './core/rng.js';

/* ============================================================
   MAIN — boot order and the frame. Nothing here is a mechanism; it is the
   wiring, and it is short on purpose.

   BOOT ORDER IS LOAD-BEARING, as CLAUDE.md warns:
     1. checkTables()  -- fail on a data typo BEFORE allocating a world
     2. newRun()       -- creates the session, the first band, the player
     3. the loop
   ============================================================ */

export function boot(canvasCtx) {
  checkTables();

  seedRng(1234);
  const session = newRun(1234, newMeta());
  const world = session.worlds.shallow;

  /* Placing a machine is one call and needs no branch per type. `granted` is
     the run-scoped set a boon adds to (DESIGN item 9). */
  place(session, world, 'furnace', 12, 20);
  place(session, world, 'crusher', 18, 20);
  place(session, world, 'winch', 24, 20);

  return { session, world, g: canvasCtx };
}

export function place(session, world, typeId, tx, ty) {
  if (!session.run.granted.includes(typeId)) return 'NOT YET GRANTED';
  const { host, err } = assemble(MACHINES, typeId, { tx, ty }, world);
  return err || host;
}

/* One rendered frame. `step` runs the fixed-timestep sim; `tickRun` runs the
   director on wall time; the render calls read `look` and never mutate. */
export function frame(ctx, dt) {
  const { session, world, g } = ctx;
  step(world, dt);
  tickRun(session, dt);

  paintDirty(g, world);
  for (const m of world.machines) drawHost(g, m);
  for (const a of world.actors) drawHost(g, a);
  pockets(g, 4, 4, world.player.slots.inventory);
}

/* ------------------------------------------------------------------
   THE THREE THINGS THE BRIEF ASKS TO BE DEMONSTRATED, as executable
   statements rather than prose. Nothing here runs at boot.
   ------------------------------------------------------------------ */

/* 1. A TRINKET MODIFIES WALK SPEED AT RUNTIME (DESIGN item 8). */
export function demoTrinket(session) {
  const before = stat('walk');            // 60, from BASE in sim/tunables.js
  equip(session, 'sandals');              // TRINKETS.sandals: walk x1.15
  const after = stat('walk');             // 69
  drop(session, 'sandals');               // removable, by source id
  return [before, after, stat('walk')];   // [60, 69, 60]
}

/* 2. A RUN IS SAVED AND RESTORED (DESIGN items 2 and 3). */
export function demoSave(session) {
  const json = JSON.stringify(snapshot(session));
  const back = restore(JSON.parse(json));
  /* Machines are re-assembled from their rows, so every method and every
     cross-component reference is rebuilt rather than transported. */
  return back;
}

/* 3. THE BLOOD WINCH IS THE SAME DECK ON A DIFFERENT HEAT SOURCE
      (DESIGN item 12). */
export function demoBloodWinch(session, world) {
  session.run.granted.push('bloodWinch');
  const host = place(session, world, 'bloodWinch', 30, 20);
  return explainHost(host);
  /* prints, among other lines:
       tick order: Footprint -> BloodBurner -> Deck
       slots:
         footprint  <- Footprint
         heat       <- BloodBurner        <-- Burner in the timber winch
         deck       <- Deck
       Deck needs footprint, heat
       heat: COLD from BloodBurner                                    */
}
