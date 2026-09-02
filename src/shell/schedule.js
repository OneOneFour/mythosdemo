/* LAYER shell — THE ORDER THE RULES RUN IN, STATED ONCE.
   Imports `model` (the run clock) and every `rules` module.

   `rules` MODULES MAY NOT IMPORT EACH OTHER, so THIS LIST IS THE SIMULATION:
   there is no other place a step can hide, and reordering the game is
   reordering this array. See docs/DEVELOPER_GUIDE.md#the-rules-order

   ORDER MATTERS, AND HERE IS WHY FOR EACH ADJACENT PAIR:

     aim before player     the reticle is resolved against where the player IS,
                           so the tile you were pointing at is the tile you dig.
     player before mining   moving first means reach is measured from this
                           frame's position, not the last one's.
     mining before light    a tile broken this frame can open a new path for
                           light THIS frame -- a wall that just came down
                           between the player and a lit corridor should not
                           wait a frame to brighten. `rules/light.js` reads
                           tile solidity, never mining state directly, so this
                           is freshness, not a data dependency.
     light before reveal    fog of war's own flood (`rules/reveal.js#passB`)
                           gates past its first ring on `lightAt()`, so it has
                           to read THIS frame's light field, not last frame's
                           -- otherwise a torch lighting up a corridor and the
                           corridor becoming visible would be one frame apart
                           for no reason a player could ever see, the same
                           freshness argument `items before machines`, further
                           down, already makes for a catch box. (`reveal` used
                           to sit immediately after `player`, on the grounds
                           that it read nothing mining touched and wrote
                           nothing anything else read -- true before this
                           phase, and exactly the invariant gating Pass B on
                           light breaks, which is why it moved instead of
                           gaining a second, contradictory adjacency comment.)
     mining before items    a tile broken this frame drops before anything falls,
                           so the drop gets a full step of gravity immediately.
     items before belts     a belt drags what just landed, not what was resting
                           a whole frame stale — the same freshness `items
                           before machines` (below) already relies on, paid
                           here first because a belt's own drag has to run on
                           this frame's true positions too. `rules/belts.js`
                           re-indexes the item grid itself after it moves
                           anything, so nothing downstream of it — crafting,
                           trinkets, machines — ever sees a position `items`
                           rebuilt the index for but a belt has since moved.
     belts before crafting  unrelated ledgers: a belt spends its own charge and
                           moves items on the ground, a hand-craft spends the
                           PLAYER's pockets, and neither reads the other. Placed
                           here rather than after `trinkets` so the two steps
                           that move physical things in the world — what just
                           fell, what just got dragged — stay adjacent, and so
                           the ORIGINAL "items before crafting" promise this
                           pair used to state directly still holds transitively:
                           an ingredient `items` just caught with the pickup
                           radius is already in `run.inv` by the time `crafting`
                           runs, whether or not a belt sits between them, since
                           nothing in `belts` touches `run.inv`. (The rest of
                           that promise, for the record: holding the craft key
                           through the exact frame an ingredient lands still
                           counts that frame toward the bar, not the next one.
                           The cost of that is a COMPLETED craft's own output
                           item waits one extra frame for its first gravity
                           step — judged the smaller loss, since a player is
                           far more likely to feel a fresh pickup count toward
                           a craft already in progress than to notice one frame
                           of an item sitting nearly still at the moment it
                           appears.)
     crafting before trinkets  spending or gaining pocket material this frame
                           is visible to the trinket sync in the SAME frame,
                           the same promise `items before trinkets` already
                           makes for a picked-up relic — no hand-recipe makes
                           one today, but the ordering costs nothing to hold.
     trinkets before boons  unrelated ledgers, the SAME reasoning
                           `belts before crafting` already states above: the
                           trinket sync reads `run.equipped`/`run.inv`, the
                           boon sync reads `model/boons.js#active`, and
                           neither touches the other's rows even though both
                           write into `model/mods.js` — every row either tier
                           adds is keyed by its OWN `src` prefix
                           ('boon:'+id vs. the trinket's own id), so the two
                           tiers can never remove each other's rows regardless
                           of which runs first. Placed adjacent so both
                           modifier-sync steps stay together, immediately
                           before the ONE thing either of them can change the
                           behaviour of this frame:
     items before machines  an item that lands in a mouth is caught THIS frame —
                           the catch box is checked against fresh positions, and
                           `items` is what rebuilt the spatial index.
     boons before machines  a rate modifier a boon just turned on (or a
                           conflict just suppressed) should apply to this
                           same frame's recipe tick, not the next — the
                           IDENTICAL promise `trinkets before machines`
                           already made below, now made twice because there
                           are two modifier tiers instead of one.
     trinkets before machines  a rate modifier a relic just turned on should
                           apply to this same frame's recipe tick, not the next.

                           THIS IS ALSO WHY `belts`, THREE STEPS EARLIER, IS
                           STILL BEFORE `machines`: a belt that dragged an item
                           into a furnace's mouth this frame has to be caught
                           by that furnace's catch box THIS frame, or a
                           belt-fed machine is one frame slower than a
                           hand-fed one for no reason a player could ever see.
                           `machines` is where that catch box is checked.
     machines before drive  a hub's own buffered state settles before the
                           drivetrain is solved, so feeding a machine and
                           turning a crank are one beat. (This pair used to
                           read "a charge banked this frame turns the drum
                           now": the staged winch spent a BANKED FUEL CHARGE
                           to move, and `rules/machines.js` is what banked it.
                           `rules/drive.js` has no charge and no fuel at all --
                           the only power source is a crank the player is
                           holding this very frame -- so the freshness this
                           pair buys is now about a machine's buffer, not
                           about the drivetrain's supply. The ORDER is
                           unchanged; only the reason is.)

                           IT IS ALSO WHY `player` IS FAR EARLIER IN THIS
                           LIST, and that pair matters more than this one:
                           `rules/drive.js` translates a RIDING player by the
                           carrier's own delta with `pw.move`, which is only
                           safe on a position collision has already resolved.
                           `player` moves and resolves; `drive` then carries.
                           Two writers of `player.y` in one frame, in an order
                           stated here -- the identical freshness argument
                           `items before belts` above already makes for an
                           item and a belt, and the reason the ride branch
                           needs no collision model of its own.
     drive before cycles    the drivetrain is what delivers a haul to the dock
                           and releases it (`rules/drive.js`), and the director
                           is what turns a delivery into a credit. Running the
                           director first would credit LAST frame's arrival and
                           report a completion one frame after the carrier
                           reached the top — the same freshness argument
                           `items before machines` already makes about the
                           catch box, one link further along the chain.
     cycles before tutorial  THIS REPLACES, VERBATIM IN ITS REASONING, THE OLD
                           `drive before tutorial` PAIR (Phase 8-and-earlier):
                           `rules/tutorial.js` is a pure OBSERVER: every one of
                           docs/SPEC.md section 5's beat conditions is a READ of
                           state another step wrote, and the only things it
                           writes — `run.tutorialBeat` and a `tutorial` journal
                           row — are read by no other step in this array. So it
                           goes as LATE as it can, where every fact of the frame
                           has settled: the walking step `player` recorded
                           (beat 1), the pick `items` just caught (beat 2), the
                           ore `mining` just dropped and `items` just moved
                           (beat 3), the `run.deepest` `player` just updated
                           (beat 4), and now the altar `cycles` just placed and
                           the cycle `cycles` just advanced (beats 5 and 6,
                           Phase 10b). Judging a beat mid-frame would mean a
                           callout could name something the player has not
                           finished doing yet.
     tutorial before fields  ONLY so `fields last` below stays literally true.
                           The two are unrelated ledgers — a beat predicate
                           reads no field and emits none — so this pair is the
                           one adjacency in this list that carries no freshness
                           argument at all, and it is stated rather than left
                           implied precisely because there isn't one:
                           `fields`'s position is a statement about the NEXT
                           frame, and nothing may be appended after it without
                           re-arguing that.
     fields last            emissions made this frame decay from NEXT frame, so a
                           recipe gate sees the heat that was just poured in.

   The run clock is ticked first and is not a rule: `run.t` is a number, not a
   decision, and no `rules` module may claim ownership of the frame. */

import { write as rw } from '../model/run.js';
import * as belts from '../rules/belts.js';
import * as boons from '../rules/boons.js';
import * as crafting from '../rules/crafting.js';
import * as cycles from '../rules/cycles.js';
import * as drive from '../rules/drive.js';
import * as fields from '../rules/fields.js';
import * as grants from '../rules/grants.js';
import * as items from '../rules/items.js';
import * as light from '../rules/light.js';
import * as machines from '../rules/machines.js';
import * as mining from '../rules/mining.js';
import * as miracles from '../rules/miracles.js';
import * as player from '../rules/player.js';
import * as reveal from '../rules/reveal.js';
import * as trinkets from '../rules/trinkets.js';
import * as tutorial from '../rules/tutorial.js';

export const STEPS = [
  { id: 'clock',    step: (dt) => rw.tick(dt) },
  { id: 'aim',      step: (dt, cmd) => aim(cmd) },
  { id: 'player',   step: (dt, cmd) => player.step(dt, cmd) },
  { id: 'mining',   step: (dt, cmd) => mining.step(dt, cmd) },
  { id: 'light',    step: (dt) => light.step(dt) },
  { id: 'reveal',   step: () => reveal.step() },
  { id: 'items',    step: (dt, cmd) => items.step(dt, cmd) },
  { id: 'belts',    step: (dt) => belts.step(dt) },
  { id: 'crafting', step: (dt, cmd) => crafting.step(dt, cmd) },
  { id: 'trinkets', step: () => trinkets.step() },
  { id: 'boons',    step: (dt) => boons.step(dt) },
  { id: 'machines', step: (dt) => machines.step(dt) },
  { id: 'drive',    step: (dt, cmd) => drive.step(dt, cmd) },
  { id: 'cycles',   step: (dt) => cycles.step(dt) },
  { id: 'tutorial', step: () => tutorial.step() },
  { id: 'fields',   step: (dt) => fields.step(dt) }
];

/* Mouse aim when there is a mouse, keyboard fallback otherwise. Which of the two
   is a DEVICE question, which is why it is resolved in `shell` and `rules/mining`
   exposes both entry points rather than guessing.
   See docs/DEVELOPER_GUIDE.md#the-rules-order */
function aim(cmd) {
  if (cmd.hasMouse) mining.aimAtWorld(cmd.mx, cmd.my);
  else mining.aimAtKeys(cmd);
}

export function stepAll(dt, cmd) {
  for (const s of STEPS) s.step(dt, cmd);
}

/* Re-exported so `shell/boot.js`/`shell/main.js` have one import for the
   rules they must call OUTSIDE the per-frame order — granting, drafting and
   using a miracle are events, not steps, and putting them in the array above
   would be a lie about when they happen (docs/DEVELOPER_GUIDE.md#the-rules-order).
   `boons` is exported for its `grant`/`draftable` pair even though it ALSO has
   a per-frame `step` in `STEPS` above, the same dual role `trinkets` has. */
export { boons, grants, miracles, trinkets };
