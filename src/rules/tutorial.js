/* LAYER rules — THE BEAT SHEET, AS PREDICATES OVER MODEL STATE. Imports
   `data`, `model`, and no other `rules` module.

   "Has the player done the thing beat N teaches" is a DECISION with the
   lifetime of a frame, which makes it `rules`; the counter it advances lives
   on `run` and the query over it is `model/tutorial.js#beat`, which is what
   `view` reads. `view` never reads this file.

   EVERY PREDICATE IS A READ OF STATE THAT ALREADY EXISTS. Not one beat gets
   its own counter, flag or hook, because a second ledger of "how much copper
   have you mined" is a ledger that can disagree with the copper.

   MONOTONIC AND ONE-WAY. Only the condition for `tutorialBeat + 1` is ever
   evaluated, so a beat never regresses or skips, and at most ONE fires per
   frame -- so the journal can never emit two callouts a player reads as one.

   `rules/cycles.js` is the only WRITER of the state beats 5, 6 and 10 read,
   and this file stays the only writer of the counter. `shell/schedule.js` runs
   `cycles` immediately before this, so both read the SAME frame's truth.

   NOTIFICATION FLOWS DOWNWARD: a beat firing pushes a journal row and calls
   nothing. */

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

/* "Mine 6 copper". NOT a tunable, because bending it with a boon would mean
   bending the tutorial. */
const COPPER_TARGET = 6;

/* Beat 4's two thresholds, in TILES of the spawn band, measured against the
   surface floor line -- see the beat's own comment for why each is where it
   is. Tiles rather than px so they survive a band with a different tile size. */
const WENT_DOWN_TILES = 2, BACK_UP_TILES = 1;

/* How much of one pair this run has produced, near enough: the pockets plus
   what is still on the ground. The GROUND half is the point in both places it
   is used -- ore falls to the bottom of a shaft and a plate falls out of the
   press, and neither is ever credited straight to the pockets. */
function pairSeen(sub, form) {
  let n = invCount(sub, form);
  for (const it of items) if (it.sub === sub && it.form === form) n++;
  return n;
}

/* How much copper ore this run has produced, near enough: what the pockets
   hold plus what is still lying on the ground. NOT a mined-ever counter --
   there is no such field and inventing one would be a second ledger that can
   disagree with the copper (see this file's header). The two differ only once
   something CONSUMES copper ore, and the only consumer is a machine the player
   does not have until beat 6; the check below runs every substep, so the total
   is read the same frame the sixth ore spawns and long before anything could
   eat it. The `items` scan is bounded in practice as well as in principle: it
   is only ever reached while `run.tutorialBeat === 2`. */
const copperOreSeen = () => pairSeen(S.copper, F.ore);

/* The surface floor line and the spawn band's tile size, or null headless /
   before worldgen. The same datum `view/hud.js`'s depth gauge and
   `model/run.js#placementCheck`'s depth gate both measure from, so "back at
   spawn height" here and "0 M" on the gauge are the same zero. */
function surface() {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return null;
  return { y: worldY(ref, ref.cfg.floorTy ?? 0), tile: ref.tile };
}

/* Index N holds the condition for beat N, and index 0 is unused so the array
   index IS the beat number. Nothing is `null` as a placeholder -- the array
   simply ENDS, and running off the end is what stops `step()`. */
const BEATS = [
  null,

  /* 1 — "Wake chained at a cliff face. Chain snaps. Only left/right respond."
     TEACHES WALK, so the signal is a walking step actually taken:
     `player.walkPhase` is advanced by `rules/player.js` only while the player
     is moving horizontally AND on the ground, and is reset to 0 the instant
     they stop, so a single frame above zero is proof of a deliberate step. It
     is 0 at spawn (`model/player.js#write.spawn` resets it), so falling the
     two tiles onto the shelf does not fire this. Chosen over `vx !== 0`
     because a shove from a landing or a slope is not walking. */
  () => player.walkPhase > 0,

  /* 2 -- take the planted pickaxe. NOT "walk into it": pickup is opt-in, so
     proximity alone collects nothing unless `cmd.collect` is held or AUTO
     COLLECT is on. Beat 3 counts ore on the GROUND, so progression was never
     blocked by that change.

     `hasPick()` is exactly "is a mining tool in the pockets", already the gate
     `rules/mining.js` swings on, so this fires on the same datum that makes
     digging possible. Reads ANY tool, not the stock pick, since picking up a
     better one first would still have taught the lesson. */
  () => hasPick(),

  /* 3 — "Dig down 5 tiles ... Mine 6 copper -- the ore falls to the bottom of
     your own shaft." THE GRAVITY THESIS, so the signal deliberately does NOT
     require the ore to be in the pockets: ore lying at the bottom of the shaft
     counts, which is the whole point of the beat. */
  () => copperOreSeen() >= COPPER_TARGET,

  /* 4 -- TEACHES THAT UP IS EXPENSIVE, and the lesson lands on ARRIVAL, so the
     predicate is a round trip: they got down there, and they are back.

     `run.deepest` is the deepest `player.y` this run, so the first clause is
     monotonic and cannot be undone by climbing. Two tiles below the floor line
     is unambiguously "in a shaft", since the surface reads MINUS two with
     `player.y` at the top of a 16 px body. The second clause measures FEET, so
     the tolerance means what it reads as -- and it is a tolerance rather than
     an equality because a stair need not deliver them to the row they left. */
  () => {
    const s = surface();
    if (!s) return false;
    return run.deepest - s.y >= WENT_DOWN_TILES * s.tile
        && player.y + PH <= s.y + BACK_UP_TILES * s.tile;
  },

  /* 5 -- A GENUINE REPORT THAT THE DIRECTOR HAS RUN.
     `rules/cycles.js#ensureAltarPlaced` withholds the altar until beat 4 has
     fired or the grace has passed, and this asks only whether one now stands
     -- never a timer, and never a second copy of the director's gate.

     IT LANDS ONE FRAME LATE, HARMLESSLY: `cycles` runs before this file, so
     the director has been and gone on the frame beat 4 fires, places the altar
     on the next, and this beat fires later in that same frame. */
  () => machines.some(m => m.def === M.altar),

  /* 6 — "Deliver. The altar gifts a crude furnace." `rules/cycles.js#complete`
     is the only place `run.cycle` ever advances, and only once
     `model/run.js#tributeMet()` is true -- so "cycle 1 is over" is exactly
     "the first trial was paid". */
  () => run.cycle > 1,

  /* BEATS 7-10 ARE CYCLE 2, past the end of the two-minute sheet on purpose.
     Cycle 2 asks for four things a player has never done ONCE -- refine ore
     into plate, build the dock, run a chain up to it, and beat a clock --
     four first-time asks arriving the instant all guidance stopped.

     They are still PURE OBSERVATIONS of state another step wrote, and not one
     adds a counter, flag or hook anywhere else. */

  /* 7 — REFINEMENT. Cycle 2 wants three copper PLATE, which is two compression
     steps and 36 ore -- the first ask in the game
     that cannot be answered by mining harder. Fires on the FIRST plate, not on
     three: the lesson is "ore is not the currency any more", and it is learned
     the moment one exists. Counted on the ground as well as in the pockets
     (`pairSeen`), because a pressed plate falls out of the press. */
  () => pairSeen(S.copper, F.plate) >= 1,

  /* 8 — THE DOCK, AND WHERE IT GOES. Cycle 2 is paid at `cloud_dock` and
     nowhere else (`data/cycles.js`'s `at`, enforced in
     `rules/cycles.js#drainReceivers`), and the dock may only stand in the band
     its own row names (`data/machines.js#cloud_dock`'s `band` key, gated in
     `model/run.js#placementCheck`). So the predicate asks for a dock placed in
     exactly that band -- read OFF THE MACHINE ROW rather than as the literal
     'astral', so a row that ever names a different band moves this beat with
     it and cannot silently stop firing. */
  () => machines.some(m => m.def === M.cloud_dock &&
                           m.band?.id === MACH[M.cloud_dock].band),

  /* 9 -- THE CHAIN. A dock with nothing linked to it is a dock nothing can
     deliver to, because cargo reaches it only along a segment. ONE segment
     anchored to the dock is the proof, not three: `chains` is the derived
     query for a whole run of them and this beat has no business re-deriving
     it. The player discovers they need three from the reach they have. */
  () => segments.some(s => s.a.def === M.cloud_dock || s.b.def === M.cloud_dock),

  /* 10 -- THE CLOCK. Cycle 1 has none; cycle 2 has a deadline and a
     punishment. There is nothing to OBSERVE about noticing a clock, so the
     beat fires on the only thing that proves the player beat it: cycle 2 paid.
     A miss does not advance `run.cycle`, so this cannot fire off a failed
     attempt and the callout stays up through the retry. */
  () => run.cycle > 2
];

/* Run once a frame (see `shell/schedule.js`). One beat at most, and nothing at
   all once the sheet has run out of beats -- `BEATS[next]` being `undefined`
   past the end of the array is what stops this, so no separate "the tutorial
   is over" flag exists to get out of step with the counter. */
export function step() {
  if (run.dead) return;
  const next = run.tutorialBeat + 1;
  const cond = BEATS[next];
  if (!cond || !cond()) return;
  rw.advanceBeat();
  push('tutorial', null, { beat: next });
}

/* FAIL AT IMPORT ON A BEAT WITH NO CALLOUT SLOT. `CALLOUTS` is indexed by
   beats ALREADY FIRED, so the two arrays must be exactly the same length --
   a beat appended here without a row there would draw `undefined`, which
   renders as silently nothing rather than failing. Guidance that is absent
   rather than wrong is guidance nobody notices is missing. */
if (CALLOUTS.length !== BEATS.length)
  throw new Error(`tutorial: ${BEATS.length - 1} beats but ${CALLOUTS.length} callout slots -- ` +
                  `data/callouts.js needs exactly ${BEATS.length} rows (index 0 is "nothing fired yet")`);
