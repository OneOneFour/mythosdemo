/* LAYER rules — THE BEAT SHEET, AS PREDICATES OVER MODEL STATE.
   Imports `data`, `model`. Imports no other `rules` module.

   ============================================================================
   WHERE THIS LIVES AND WHY. docs/SPEC.md section 5 is the design copy; this is
   the only code behind it. "Has the player done the thing beat N teaches" is a
   DECISION with the lifetime of a frame, which makes it `rules`; the counter it
   advances is a number with the lifetime of the run, which is why the number is
   `model/run.js#RUN_SCHEMA.tutorialBeat` and the query over it is
   `model/tutorial.js#beat`. `view` reads the query and never this file.

   EVERY PREDICATE IS A READ OF STATE THAT ALREADY EXISTS. Not one beat gets its
   own counter, flag or hook in another module -- deliberately, because a second
   ledger of "how much copper have you mined" is a ledger that can disagree with
   the copper. Where that costs precision it is written down on the beat itself
   below.

   MONOTONIC AND ONE-WAY. Only the condition for `run.tutorialBeat + 1` is ever
   evaluated, so a beat never regresses, never skips, and a player who happens
   to satisfy a later beat early still gets the earlier lesson first. At most
   ONE beat fires per frame, which also means the journal can never emit two
   callouts a player would see as one.

   BEATS 5 AND 6 ARE `rules/cycles.js`'S BEATS, PER D-E/E1
   (docs/PLAN-phase10.md 3.5): the director is the only writer of the STATE
   these two predicates read (the altar's existence, `run.cycle`), but
   `rules/tutorial.js` stays the only WRITER of `run.tutorialBeat` -- one
   writer, two reads, the same split `model/segments.js#linkCheck` and
   `rules/drive.js` already use for a link's own legality. `shell/schedule.js`
   runs `cycles` immediately before this file for exactly that reason: both
   predicates read the SAME frame's truth the director just wrote, never a
   frame stale.
   ============================================================================

   NOTIFICATION FLOWS DOWNWARD: a beat firing pushes a journal row and calls
   nothing. `data/sfx.js` has no `tutorial` entry, so the row is silent by
   design until something wants it audible. */

import { F } from '../data/forms.js';
import { M } from '../data/machines.js';
import { S } from '../data/substances.js';
import { SPAWN_BAND } from '../data/world.js';
import { items } from '../model/items.js';
import { push } from '../model/journal.js';
import { machines } from '../model/machines.js';
import { PH, player } from '../model/player.js';
import { hasPick, invCount, run, write as rw } from '../model/run.js';
import { bandOf, worldY } from '../model/world.js';

/* docs/SPEC.md section 5: "Mine 6 copper". The number is design copy that
   lives there first; it is not a tunable, because bending it with a boon
   would mean bending the tutorial. */
const COPPER_TARGET = 6;

/* Beat 4's two thresholds, in TILES of the spawn band, measured against the
   surface floor line -- see the beat's own comment for why each is where it
   is. Tiles rather than px so they survive a band with a different tile size. */
const WENT_DOWN_TILES = 2, BACK_UP_TILES = 1;

/* How much copper ore this run has produced, near enough: what the pockets
   hold plus what is still lying on the ground. NOT a mined-ever counter --
   there is no such field and inventing one would be a second ledger that can
   disagree with the copper (see this file's header). The two differ only once
   something CONSUMES copper ore, and the only consumer is a machine the player
   does not have until beat 6; the check below runs every substep, so the total
   is read the same frame the sixth ore spawns and long before anything could
   eat it. The `items` scan is bounded in practice as well as in principle: it
   is only ever reached while `run.tutorialBeat === 2`. */
function copperOreSeen() {
  let n = invCount(S.copper, F.ore);
  for (const it of items) if (it.sub === S.copper && it.form === F.ore) n++;
  return n;
}

/* The surface floor line and the spawn band's tile size, or null headless /
   before worldgen. The same datum `view/hud.js`'s depth gauge and
   `model/run.js#placementCheck`'s depth gate both measure from, so "back at
   spawn height" here and "0 M" on the gauge are the same zero. */
function surface() {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return null;
  return { y: worldY(ref, ref.cfg.floorTy ?? 0), tile: ref.tile };
}

/* Index N holds the condition for beat N; index 0 is unused so the array
   index IS the beat number, and 5/6 are `null` rather than `() => false` so
   "reserved, nothing advances into it yet" is visible rather than inferred. */
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

  /* 2 — "Stock pickaxe planted in the soil. Stand over it and hold `c` to
     take it." NOT "walk into it": pickup has been opt-in since Phase 12b
     (docs/PLAN-phase12.md §3 D-E/D-F), so proximity alone collects nothing
     unless `cmd.collect` is held or AUTO COLLECT is on. Beat 3 counts ore on
     the GROUND, so progression was never blocked by the change -- only this
     sentence and docs/SPEC.md §5's copy of it were left describing the old
     magnet.
     `hasPick()` is exactly "is a mining tool in the pockets", already the
     gate `rules/mining.js` swings on, so this beat fires on the same datum
     that makes digging possible rather than on a parallel copy of it. Reads
     any tool, not `S.pick` specifically -- picking up a better one first
     would still have taught the lesson. */
  () => hasPick(),

  /* 3 — "Dig down 5 tiles ... Mine 6 copper -- the ore falls to the bottom of
     your own shaft." THE GRAVITY THESIS, so the signal deliberately does NOT
     require the ore to be in the pockets: ore lying at the bottom of the shaft
     counts, which is the whole point of the beat. */
  () => copperOreSeen() >= COPPER_TARGET,

  /* 4 — "You are in a 5-tile hole and a 1-tile hop will not clear it ... Cut a
     diagonal stair out, or fell the olive tree for a ladder." TEACHES THAT UP
     IS EXPENSIVE, and the lesson lands on ARRIVAL, so the predicate is a
     round trip: they got down there, and they are back.

     `run.deepest` is the deepest `player.y` this run (written every frame by
     `rules/player.js`), so the first clause is monotonic and cannot be undone
     by climbing. Two tiles below the floor line is unambiguously "in a shaft"
     -- standing on the surface reads MINUS two tiles, since `player.y` is the
     top of a 16 px body -- while the guaranteed vein sits 8 tiles down
     (`data/world.js`), so anyone who has satisfied beat 3 clears this by a
     wide margin.

     The second clause measures FEET (`player.y + PH`), not the body top, so
     the tolerance means what it reads as: within one tile of the surface they
     started on. It is a tolerance rather than an equality because the shelf is
     flat but the stair or ladder they cut out of the shaft need not deliver
     them to exactly the row they left from. */
  () => {
    const s = surface();
    if (!s) return false;
    return run.deepest - s.y >= WENT_DOWN_TILES * s.tile
        && player.y + PH <= s.y + BACK_UP_TILES * s.tile;
  },

  /* 5 — "Sky darkens a notch ... an altar rises. First Trial: deliver 10 raw
     copper." `rules/cycles.js#ensureAltarPlaced` places the altar
     UNCONDITIONALLY from the run's very first frame -- this predicate is
     purely a report that it now exists, never a timer or a second copy of
     "has the director run yet". It reads true from frame 0 in the
     underlying data, but the monotonic evaluator above never even asks
     until beat 4 has already fired, so the player still meets the altar
     only after climbing back out of their own shaft, exactly as the beat
     sheet orders it. */
  () => machines.some(m => m.def === M.altar),

  /* 6 — "Deliver. The altar gifts a crude furnace." `rules/cycles.js#complete`
     is the only place `run.cycle` ever advances, and only once
     `model/run.js#tributeMet()` is true -- so "cycle 1 is over" is exactly
     "the first trial was paid". */
  () => run.cycle > 1
];

/* Run once a frame (see `shell/schedule.js`). One beat at most, and nothing at
   all once the sheet has run out of implemented beats -- the `null` at index 5
   is what stops this, so no separate "the tutorial is over" flag exists to get
   out of step with the counter. */
export function step() {
  if (run.dead) return;
  const next = run.tutorialBeat + 1;
  const cond = BEATS[next];
  if (!cond || !cond()) return;
  rw.advanceBeat();
  push('tutorial', null, { beat: next });
}
