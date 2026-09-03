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

   BEATS 5, 6 AND 10 ARE `rules/cycles.js`'S BEATS, PER D-E/E1
   (docs/PLAN-phase10.md 3.5): the director is the only writer of the STATE
   these predicates read (the altar's existence, `run.cycle`), but
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

/* docs/SPEC.md section 5: "Mine 6 copper". The number is design copy that
   lives there first; it is not a tunable, because bending it with a boon
   would mean bending the tutorial. */
const COPPER_TARGET = 6;

/* Beat 4's two thresholds, in TILES of the spawn band, measured against the
   surface floor line -- see the beat's own comment for why each is where it
   is. Tiles rather than px so they survive a band with a different tile size. */
const WENT_DOWN_TILES = 2, BACK_UP_TILES = 1;

/* How much of one pair this run has produced, near enough: what the pockets
   hold plus what is still lying on the ground. The ground half is the point
   in both places it is used -- ore falls to the bottom of the shaft (beat 3)
   and a pressed plate falls out of the press (beat 7), and invariant 5 means
   neither is ever credited straight to the pockets. */
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

/* Index N holds the condition for beat N; index 0 is unused so the array
   index IS the beat number. Every index from 1 to the end now carries a real
   predicate: beats 1-6 are docs/SPEC.md section 5's two-minute sheet and
   beats 7-10 are cycle 2 (Phase 13d, docs/SPEC.md section 20.4). Nothing is
   `null` as a placeholder any more -- the array simply ENDS, and running off
   the end is what stops `step()` below. */
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
  () => run.cycle > 1,

  /* ============================================================================
     BEATS 7-10 ARE CYCLE 2 (Phase 13d, docs/SPEC.md section 20.4), and they
     are past the end of section 5's own two-minute sheet on purpose. The sheet
     stopped here, and the comment that used to sit at the bottom of this file
     said there was "nothing left to teach" -- which was written before cycle
     2's requirements existed. Cycle 2 asks for four things a player has never
     done ONCE: refine ore into plate, build the Cloud Dock, get a segment
     chain up to it, and beat a clock. That is four first-time asks arriving in
     the same instant all guidance stopped.

     THEY ARE STILL PURE OBSERVATIONS OF STATE ANOTHER STEP WROTE, exactly like
     beats 1-6, and not one of them adds a counter, flag or hook anywhere else
     (this file's own header). Each names the state that PROVES the lesson
     landed, never a second ledger of whether it did.
     ============================================================================ */

  /* 7 — REFINEMENT. Cycle 2 wants three copper PLATE, which is two compression
     steps and 36 ore (docs/SPEC.md section 18.4) -- the first ask in the game
     that cannot be answered by mining harder. Fires on the FIRST plate, not on
     three: the lesson is "ore is not the currency any more", and it is learned
     the moment one exists. Counted on the ground as well as in the pockets
     (`pairSeen`), because a pressed plate falls out of the press. */
  () => pairSeen(S.copper, F.plate) >= 1,

  /* 8 — THE DOCK, AND WHERE IT GOES. Cycle 2 is paid at `cloud_dock` and
     nowhere else (`data/cycles.js`'s `at`, enforced since Phase 13d in
     `rules/cycles.js#drainReceivers`), and the dock may only stand in the band
     its own row names (`data/machines.js#cloud_dock`'s `band` key, gated in
     `model/run.js#placementCheck`). So the predicate asks for a dock placed in
     exactly that band -- read OFF THE MACHINE ROW rather than as the literal
     'astral', so a row that ever names a different band moves this beat with
     it and cannot silently stop firing. */
  () => machines.some(m => m.def === M.cloud_dock &&
                           m.band?.id === MACH[M.cloud_dock].band),

  /* 9 — THE CHAIN. A dock standing in the Heavens with nothing linked to it is
     a dock nothing can deliver to: cargo reaches it only along a segment
     (CLAUDE.md D10, docs/SPEC.md section 17). One segment anchored to the dock
     is the proof, not three -- `model/segments.js#chains` is the derived query
     for a whole run of them and this beat has no business re-deriving it. The
     player will discover they need three from the reach they actually have
     (96 px against astral's 240 px gap, docs/SPEC.md section 18.2), which is
     the lesson the callout names and the arithmetic teaches. */
  () => segments.some(s => s.a.def === M.cloud_dock || s.b.def === M.cloud_dock),

  /* 10 — THE CLOCK. Cycle 1 famously has none (`deadlineSecs:null`,
     docs/SPEC.md section 4); cycle 2 has 480 seconds and a punishment. There
     is nothing to OBSERVE about noticing a clock, so the beat fires on the
     only thing that proves the player beat it: cycle 2 paid. A miss does not
     advance `run.cycle` (`rules/cycles.js#miss` -- the retry is the mercy), so
     this beat also cannot fire off a failed attempt, and the callout stays up
     through the retry, which is exactly when it is worth reading. */
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

/* FAIL AT IMPORT ON A BEAT WITH NO CALLOUT SLOT (Phase 13d). `CALLOUTS` is
   indexed by beats ALREADY FIRED -- 0 through `BEATS.length - 1` -- so the two
   arrays must be exactly the same length, and a beat appended here without a
   row there would draw `undefined` (silently nothing, per
   `view/hud.js#hint`'s early return) rather than fail. That is
   docs/FINDINGS.md #10's own failure mode: guidance that is absent rather
   than wrong is guidance nobody notices is missing. Same import-time-guard
   idiom `data/sfx.js` uses for a kind mapped to a sound that does not exist;
   `tools/check.mjs` imports every module, so this runs in `npm run check`. */
if (CALLOUTS.length !== BEATS.length)
  throw new Error(`tutorial: ${BEATS.length - 1} beats but ${CALLOUTS.length} callout slots -- ` +
                  `data/callouts.js needs exactly ${BEATS.length} rows (index 0 is "nothing fired yet")`);
