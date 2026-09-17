/* rules layer — the beat sheet as predicates over model state. The counter
   lives on `run`, and `model/tutorial.js#beat` is the query `view` reads;
   `view` never reads this file.

   Every predicate reads state another step already wrote — no beat has its own
   counter, flag or hook. Only the condition for `tutorialBeat + 1` is
   evaluated, so a beat never regresses or skips and at most one fires per
   substep. `rules/cycles.js` writes the state several predicates read and runs
   immediately before this, so both see the same substep. A firing beat pushes
   a journal row and calls nothing. */

import { CALLOUTS } from '../data/callouts.js';
import { F } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { S } from '../data/substances.js';
import { SPAWN_BAND } from '../data/world.js';
import { items } from '../model/items.js';
import { push } from '../model/journal.js';
import { machines } from '../model/machines.js';
import { segments } from '../model/segments.js';
import { PH, player } from '../model/player.js';
import { hasPick, invCount, run, write as rw } from '../model/run.js';
import { bandOf, worldY } from '../model/world.js';

/* Deliberately not a tunable: bending it with a boon would bend the tutorial. */
const COPPER_TARGET = 6;

/* The round-trip beat's two thresholds, in tiles of the spawn band measured
   from its floor line. Tiles rather than px, so they survive a band with a
   different tile size. */
const WENT_DOWN_TILES = 2, BACK_UP_TILES = 1;

/* How much of one pair this run has produced, near enough: the pockets plus
   what is still on the ground. Ore falls to the bottom of a shaft and a plate
   falls out of the press, so neither is credited straight to the pockets. */
function pairSeen(sub, form) {
  let n = invCount(sub, form);
  for (const it of items) if (it.sub === sub && it.form === form) n++;
  return n;
}

/* Not a mined-ever counter: no such field exists, and the only consumer of
   copper ore is a machine the player does not have yet. The `items` scan is
   only ever reached while `run.tutorialBeat === 2`. */
const copperOreSeen = () => pairSeen(S.copper, F.ore);

/* The spawn band's floor line in world px, and its tile size; null headless or
   before worldgen. The same datum `view/hud.js`'s depth gauge and
   `model/run.js#placementCheck`'s depth gate measure from. */
function surface() {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return null;
  return { y: worldY(ref, ref.cfg.floorTy ?? 0), tile: ref.tile };
}

/* Index N holds the condition for beat N; index 0 is unused so the array index
   is the beat number. The array simply ends rather than holding `null`
   placeholders, and running off the end is what stops `step()`. */
const BEATS = [
  null,

  /* A walking step actually taken. `rules/player.js` advances
     `player.walkPhase` only while moving horizontally and on the ground, and
     resets it to 0 on stopping; it is 0 at spawn, so falling onto the shelf
     does not fire this. `vx !== 0` would count a shove from a landing. */
  () => player.walkPhase > 0,

  /* `hasPick()` is the same gate `rules/mining.js` swings on, so this fires on
     the datum that makes digging possible, and reads any mining tool rather
     than the stock pick. Pickup is opt-in, so proximity alone does not fire. */
  () => hasPick(),

  /* Deliberately does not require the ore to be in the pockets: ore lying at
     the bottom of the shaft counts. */
  () => copperOreSeen() >= COPPER_TARGET,

  /* A round trip. `run.deepest` is the deepest `player.y` this run, so the
     first clause is monotonic and climbing cannot undo it. The second measures
     the feet, with a tolerance because a stair need not return the player to
     the row they left. */
  () => {
    const s = surface();
    if (!s) return false;
    return run.deepest - s.y >= WENT_DOWN_TILES * s.tile
        && player.y + PH <= s.y + BACK_UP_TILES * s.tile;
  },

  /* Asks only whether an altar now stands; `rules/cycles.js#ensureAltarPlaced`
     owns the gate and this keeps no second copy of it. Lands a substep late:
     `cycles` runs first, so an altar placed on one substep is seen the next. */
  () => machines.some(m => m.def === M.altar),

  /* `rules/cycles.js#complete` is the only place `run.cycle` advances, and only
     once `model/run.js#tributeMet()` is true. */
  () => run.cycle > 1,

  /* Fires on the first plate rather than the three the cycle wants. Counted on
     the ground as well as in the pockets, since a plate falls out of the
     press. */
  () => pairSeen(S.copper, F.plate) >= 1,

  /* The band is read off `data/machines.js#cloud_dock`'s own `band` key rather
     than as the literal, so a row naming a different band moves this predicate
     with it instead of silently never firing. */
  () => machines.some(m => m.def === M.cloud_dock &&
                           m.band?.id === MACH[M.cloud_dock].band),

  /* One segment anchored to the dock, not a whole chain: `chains` is the
     derived query for a run of them and this has no business re-deriving it. */
  () => segments.some(s => s.a.def === M.cloud_dock || s.b.def === M.cloud_dock),

  /* A miss does not advance `run.cycle`, so a failed attempt cannot fire this
     and the callout stays up through the retry. */
  () => run.cycle > 2
];

/* One beat at most, and nothing once the sheet runs out: `BEATS[next]` being
   `undefined` past the end of the array is what stops this, so there is no
   separate "tutorial over" flag to get out of step with the counter. */
export function step() {
  if (run.dead) return;
  const next = run.tutorialBeat + 1;
  const cond = BEATS[next];
  if (!cond || !cond()) return;
  rw.advanceBeat();
  push('tutorial', null, { beat: next });
}

/* `CALLOUTS` is indexed by beats already fired, so the two arrays must be the
   same length. A beat appended here with no row there would draw `undefined`,
   which renders as nothing rather than failing, so this throws at import. */
if (CALLOUTS.length !== BEATS.length)
  throw new Error(`tutorial: ${BEATS.length - 1} beats but ${CALLOUTS.length} callout slots -- ` +
                  `data/callouts.js needs exactly ${BEATS.length} rows (index 0 is "nothing fired yet")`);
