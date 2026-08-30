import { TRIBUTES, PUNISH } from '../data/cycles.js';
import { BANDS } from '../data/bands.js';
import { createWorld } from '../world/world.js';
import { ACTORS } from '../data/actors.js';
import { assemble } from './assemble.js';
import { draft, applyBoon, clearRunMods } from './boons.js';
import { match } from './match.js';

/* ============================================================
   RUN — the director. DESIGN item 2 (tribute cycles) and item 3 (torments).
   The review marked RFC 02 AWKWARD here because it had no home for run
   structure; this file is that home, and it is the only file that knows what
   a cycle is.

   THE STATE SPLIT, which is the whole of item 3:

     meta    survives death   stolen recipes, banked favour per god,
                              whether Hades has been met
     run     dies with you    cycle, deadline, misses, granted machines,
                              which trinkets are equipped
     world   dies with you    tiles, machines, items, fields

   A `session` holds all three plus one world per resident band, and is what
   sim/save.js writes. Nothing in world/ or comp/ imports this file: the
   director reads the world, never the reverse. That is what keeps a headless
   test able to tick a world with no run at all.
   ============================================================ */

export const newMeta = () => ({
  recipes: [],           // stolen recipe ids, carried between runs
  favour: { zeus: 0, hephaestus: 0, poseidon: 0, hermes: 0, hades: 0 },
  metHades: false
});

export function newRun(seed, meta) {
  clearRunMods();                      // last run's trinkets are gone
  const run = {
    seed, cycle: 1, left: TRIBUTES[0].secs, misses: 0, dead: false,
    granted: ['furnace', 'crusher', 'winch'],  // DESIGN item 9: run-scoped set
    trinkets: [],                      // ids; the numbers live in tunables
    delivered: [],                     // { sub, form, n } shipped this cycle
    offer: null                        // the 1-of-3 draft awaiting a choice
  };
  const session = { meta, run, worlds: {} };
  openBand(session, 'shallow', seed);
  const { host } = assemble(ACTORS, 'miner', { tx: 8, ty: 4 },
                            session.worlds.shallow);
  session.worlds.shallow.player = host;
  session.here = 'shallow';
  return session;
}

/* Bands COEXIST. A new one is created and kept, not swapped in, which is
   only possible because world/world.js returns instances. */
export function openBand(session, id, seed) {
  if (session.worlds[id]) return session.worlds[id];
  const w = createWorld({ ...BANDS[id], seed });
  session.worlds[id] = w;
  return w;
}

/* Called once per rendered frame, NOT per fixed step: a deadline is wall
   time and does not need 120 Hz. */
export function tickRun(session, dt) {
  const { run } = session;
  if (run.dead || run.offer) return;              // a pending draft pauses time

  run.left -= dt;
  const T = TRIBUTES[run.cycle - 1];

  if (owed(run, T) <= 0) {
    run.offer = draft(session, T.draft);          // meet it -> draft a boon
    openBand(session, T.unlock, run.seed + run.cycle);
    session.meta.favour.zeus += 1;
    advance(run);
  } else if (run.left <= 0) {
    run.misses++;
    run.punish = PUNISH[Math.min(run.misses - 1, PUNISH.length - 1)];
    if (run.misses >= 2) return die(session);     // two misses ends the run
    advance(run);
  }
}

const owed = (run, T) => T.want.reduce((n, q) =>
  n + Math.max(0, q.n - run.delivered
    .filter(d => match(q, d)).reduce((m, d) => m + d.n, 0)), 0);

function advance(run) {
  run.delivered.length = 0;
  run.cycle++;
  const next = TRIBUTES[run.cycle - 1];
  run.left = next ? next.secs : Infinity;
}

/* The player chose one of the three. */
export function take(session, boonId) {
  applyBoon(session, boonId);
  session.run.offer = null;
}

/* Permadeath. The world and the run go; meta stays and is the return value's
   only surviving half. A new run is newRun(newSeed, session.meta). */
export function die(session) {
  session.run.dead = true;
  clearRunMods();
  return session.meta;
}
