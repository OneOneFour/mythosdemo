import { TRINKETS, MACHINE_BOONS, MIRACLES } from '../data/boons.js';
import { addMod, dropMods } from './tunables.js';
import { rand } from '../core/rng.js';

/* ============================================================
   BOONS — all three DESIGN tiers, applied. ~50 lines, because the tables
   carry the content and the store carries the mutation.

   TRINKET (DESIGN item 8). A trinket is modifiers against named keys in
   sim/tunables.js, tagged with the trinket's own id as the source. That id is
   what makes them removable and non-cumulative-by-accident:
       equip('sandals')  -> stat('walk') is 60 * 1.15 = 69
       drop('sandals')   -> stat('walk') is 60 again
   No binding is reassigned anywhere, which is the constraint CLAUDE.md set.

   MACHINE (item 9). Granting a machine adds a string to a run-scoped set.
   There is no boot compile and no frozen registry, so "content registered at
   runtime" needs no mechanism at all -- which is the one place this design
   gets a hard DESIGN item for free.

   MIRACLE (item 10). A named op over a region, calling world.tiles.fill.
   Region-scoped tile transformation is already a method on the tile store.
   ============================================================ */

export function draft(session, n = 3) {
  const pool = [
    ...Object.keys(TRINKETS).map(id => ['trinket', id]),
    ...Object.keys(MACHINE_BOONS).map(id => ['machine', id]),
    ...Object.keys(MIRACLES).map(id => ['miracle', id])
  ].filter(([, id]) => !session.run.trinkets.includes(id));

  const out = [];
  while (out.length < n && pool.length)
    out.push(pool.splice((rand() * pool.length) | 0, 1)[0]);
  return out;                                     // [[tier, id], ...]
}

export function applyBoon(session, id) {
  if (TRINKETS[id]) return equip(session, id);
  if (MACHINE_BOONS[id]) {
    session.run.granted.push(MACHINE_BOONS[id].grants);
    return;
  }
  if (MIRACLES[id]) { session.run.miracle = id; return; }  // armed, cast later
  throw new Error('boons: no such boon ' + id);
}

export function equip(session, id) {
  const t = TRINKETS[id];
  if (!t) throw new Error('boons: no such trinket ' + id);
  for (const m of t.mods) addMod(id, m.key, m);     // source = trinket id
  session.run.trinkets.push(id);
}

export function drop(session, id) {
  dropMods(id);                                    // removable, by source
  const i = session.run.trinkets.indexOf(id);
  if (i >= 0) session.run.trinkets.splice(i, 1);
}

/* Permadeath: every modifier a run applied is dropped by source. Called with
   no session at the START of a run too, when there is no session yet to read
   the equipped list from -- so with no argument it clears all of them. */
export function clearRunMods(session) {
  for (const id of session?.run?.trinkets || Object.keys(TRINKETS)) dropMods(id);
  if (session) session.run.trinkets.length = 0;
}

/* MIRACLES. `op` names one of these; the region comes from the cast site. */
const OPS = {
  fill(world, tx, ty, m) { world.tiles.fill(tx - m.r, ty - m.r, m.r * 2, m.r * 2, m.sub); },
  clear(world, tx, ty, m) { world.tiles.fill(tx - m.r, ty - m.r, m.r * 2, m.r * 2, 'air'); }
};

export function cast(session, world, tx, ty) {
  const m = MIRACLES[session.run.miracle];
  if (!m) return false;
  OPS[m.op](world, tx, ty, m);
  session.run.miracle = null;
  return true;
}
