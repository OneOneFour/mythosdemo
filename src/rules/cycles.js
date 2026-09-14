/* LAYER rules — THE CYCLE DIRECTOR: arms a trial, drains what was fed to it,
   and decides completion or debt. Imports `core`, `data`, `model`. Imports
   no other `rules` module. See docs/PLAN-phase10.md 4.7 and docs/SPEC.md 18.

   ONE DECISION PER STEP, IN ORDER: ensure a live cycle, drain every tribute
   receiver into it, tick its deadline, then resolve -- complete or miss,
   never both, never twice in the same frame. `model/run.js#tributeMet()` is
   the completion predicate and is a QUERY, not a decision here, precisely so
   the TRIBUTE panel can draw the same yes/no without importing
   this file (`view` may not import `rules`).

   `run.tribute` IS REPLACED WHOLE, NEVER PATCHED IN PLACE. `write.tribute(t)`
   is documented as the one setter for the whole live-demand record so a
   demand and its own deadline can never be observed half-applied; crediting
   a pair or ticking the clock therefore always goes through a fresh object
   built from the current one, the same discipline `write.craft` already
   holds itself to for its own pair.

   NO RULES SIBLING IMPORT. Two things that would otherwise come from one
   would need it, and both are deliberately duplicated instead, each with a
   comment naming the original:
     - the rare-drop roll (`rollTributeDrop`, below) duplicates
       `rules/mining.js`'s trinket roll, filtered to `trigger:'tribute'`.
     - the hurt-and-announce pair (`hurtFor`, below) duplicates
       `rules/player.js#hurt`'s three lines (flash, hurt, and a death row if
       it proves fatal).
   Two duplications is the point at which hoisting to a shared module would
   pay; this file is the second caller of the drop-roll shape and the second
   caller of the hurt-and-announce shape, so neither crosses that line yet.

   A DRAFT IS WRITTEN INTO `run.offer`, NOT PERFORMED HERE. `draftable()`
   lives in four `rules` siblings this file may not import
   (`rules/grants.js`, `rules/boons.js`, `rules/trinkets.js`,
   `rules/miracles.js`), so completion writes the tier name and
   `shell/main.js` performs it next frame, exactly as it already does for the
   four debug-key drafts (`model/run.js#RUN_SCHEMA.offer`'s own comment).

   A REWARD GRANT GOES THROUGH THE SAME KIND OF BRIDGE, `run.awarded`, and
   for the identical reason: `rules/grants.js#grant` is the only thing in the
   project that pushes a `'grant'` journal row, and it is one of the four
   siblings above. `complete()` writes the machine ids; `rules/grants.js#step`
   performs them, immediately after this module in `shell/schedule.js`, so the
   BUILD list gains the row the same frame the trial pays.

   NO `rand()` outside the drop roll (invariant 7). The deadline accumulates
   from `dt` alone and a batch credit is stamped with `run.t`, never with
   `Date.now()` (invariant 10) -- see `RUN_SCHEMA.tribute`'s own comment in
   `model/run.js`. */

import { rand } from '../core/rng.js';
import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { CYCLE, CYCLES } from '../data/cycles.js';
import { DROPS } from '../data/drops.js';
import { M, MACH } from '../data/machines.js';
import { SPAWN_BAND } from '../data/world.js';
import { push } from '../model/journal.js';
import { keyOf, parseKey, write as iw } from '../model/items.js';
import { defOf, machines, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { player, write as pw } from '../model/player.js';
import { invCount, run, tributeMet, write as rw } from '../model/run.js';
import { beat } from '../model/tutorial.js';
import { bandOf } from '../model/world.js';

export function step(dt) {
  if (run.dead) return;
  ensureLiveCycle();
  ensureAltarPlaced();
  drainReceivers();
  tickDeadline(dt);
  resolve();
}

/* `run.tribute === null` is "nothing armed" -- true on a fresh run (`cycle`
   starts at 1) and true again the instant a cycle completes or is missed
   below, so THIS is the one place a new cycle ever arms, whether it is the
   first or a retry of one just missed.

   PAST THE LAST SHIPPED ROW, THE RUN IS WON (Phase 13d, docs/SPEC.md
   section 20.2). This used to `return` and do nothing, for ever: the TRIBUTE
   panel simply stopped drawing, FAVOUR kept reading full, and the game did
   not end so much as run out. `run.cycle > CYCLES.length` was already the
   fact; `rw.win()` is the EVENT, set exactly once (guarded on `run.won`,
   which is why a second frame is silent) with a journal row for
   `shell/notify.js` to sound and `view/hud.js#winScreen` to draw. Cycles 5-6
   still wait on the `essence`/`ambrosia` tiers (docs/SPEC.md section 8), so
   the boundary this fires at is the shipped table's own length and moves on
   its own when the table grows -- there is no literal 4 anywhere. */
function ensureLiveCycle() {
  if (run.tribute) return;
  if (run.cycle > CYCLES.length) {
    /* A RUN IS NOT WON WHILE A REWARD IS OUTSTANDING. `complete()` writes
       `run.offer` and bumps `run.cycle` in the same call, so on the LAST
       trial this function can see the boundary in a later substep of the
       very frame that paid it -- and `shell/main.js#applyIntents` returns on
       `run.won` above both the offer's dispatch and its lay-out, so the
       final draft would be discarded on whichever substep parity the
       framerate happened to give. Deferring the win means it states
       "everything is resolved" rather than "the counter moved", and it keeps
       the decision here in the director instead of reordering the shell's
       guards.

       IT CANNOT HANG. A request (`ids === null`) is laid out or dropped the
       same frame by `rules/draft.js#offer`, which clears the field outright
       when the tier has nothing left; a laid-out offer always holds at least
       one card and the only verb that can end it -- taking one -- is always
       available, since Escape cannot dismiss it and a reroll never removes a
       candidate. */
    if (run.offer) return;
    if (!run.won) {
      rw.win();
      push('win', null, { cycles: CYCLES.length, favour: { ...run.favour }, misses: run.misses });
    }
    return;
  }
  const cyc = CYCLES[run.cycle - 1];
  rw.tribute({ id: cyc.id, have: {}, left: cyc.deadlineSecs, credits: [] });
}

/* THE ONE MACHINE THE PLAYER CANNOT BUILD gets placed the one way that skips
   every player-facing check (`model/machines.js#write.place`, the sanctioned
   route `data/machines.js`'s own altar-row comment names) at a position
   DERIVED from the spawn band's own fields, never a world-px literal --
   invariant 2. `spawnTx`/`floorTy` are per-band and per-seed; this reads them
   rather than assuming topsoil's current numbers.

   `SPAWN_GAP` TILES CLEAR OF `spawnTx`, NOT FLUSH AGAINST IT. THE GAP STAYS;
   ITS REASON CHANGED (Phase 16b, docs/PLAN-phase16-interaction-model-v2.md
   §5 D16-C).

   ORIGINALLY: `handFeed` was real and unconditional from the
   frame this placed it (reach 10 px, no key), so flush-against-spawn meant a
   player who had taken zero steps, doing nothing, was already standing in
   its reach with whatever they were handed at run start. Found the hard way:
   `tools/check.mjs`'s BURDEN test and a furnace-crafting scene both fed the
   player ore near spawn and had it silently vanish into the altar.

   NOW: that drain is opt-in (`cmd.autoFeed`, the Character tab's AUTO FEED
   row, default off and reset every `newRun`), so the hazard is a preference
   the player has to ask for rather than a fact of the world. The 4 tiles are
   kept anyway, for two reasons that are enough on their own:

     1. AUTO FEED is one click from being on, and the trap it re-creates is
        exactly as unfair with the click as it was without it. A gap costs
        nothing; discovering this again would cost the same day it cost the
        first time.
     2. FRAMING. An altar standing in the player's own footprint is bad
        staging regardless of what it does or does not take -- 4 tiles clears
        `handFeed.reach` plus the player's own width (`model/player.js#PW`)
        with room over, while staying a short, deliberate walk, and that walk
        is the first thing docs/SPEC.md §5's beat sheet asks for. */
const SPAWN_GAP = 4;

/* Beat 4 of `rules/tutorial.js#BEATS`, the climbed-back-up beat. The two
   must agree, and neither file may import the other. */
const ALTAR_BEAT = 4;

/* IT DOES NOT ARRIVE ON FRAME 0 (D17-G, docs/SPEC.md section 5). The beat
   sheet raises the altar once the player has climbed back out of their own
   shaft, so the director waits for beat 4. `model/tutorial.js#beat` is a
   `model` query over `run.tutorialBeat`, which is how this reads a beat
   without importing the `rules` sibling that writes it.

   THE GRACE IS NOT BELT-AND-BRACES. Cycle 1 has exactly one receiver and
   nothing else can pay it, so a beat predicate that never fires would
   soft-lock the first trial outright. `eff('altarGraceSecs')` places the
   altar anyway once `run.t` passes it -- simulated seconds at the fixed
   1/120 s substep, never `Date.now()` (invariant 10). CLAUDE.md D4 leaves
   the one-tile auto-step ungated for the same reason, because the only way
   forward must never wait on a state that can fail to arrive.

   RE-ASKED EVERY STEP, not once when the cycle armed, since neither the
   beat nor the clock has usually reached the gate by then. The live row's
   own `at` is the authority on whether an altar is wanted, resolved by id
   through `CYCLE` the same way `drainReceivers` resolves it. */
function ensureAltarPlaced() {
  if (CYCLE[run.tribute?.id]?.at !== 'altar') return;
  if (beat(run) < ALTAR_BEAT && run.t < eff('altarGraceSecs')) return;
  if (machines.some(m => m.def === M.altar)) return;
  const band = bandOf(SPAWN_BAND);
  const def = MACH[M.altar];
  const m = mw.place(band, M.altar, band.cfg.spawnTx - def.tw - SPAWN_GAP, band.cfg.floorTy - def.th);
  /* The instant and the place, for `view/scene.js` to draw the rise and the
     shaft of light against. A position rather than the machine, so the
     renderer never learns a machine name -- see `RUN_SCHEMA.arrival`. */
  rw.arrival(m.box.x, m.box.y);
}

/* ONLY THE LIVE CYCLE'S OWN RECEIVER PAYS IT (Phase 13d, docs/SPEC.md
   section 18.3 as amended). Draining every machine tagged `tribute:{}` into
   the live ledger regardless of which one `cyc.at` names is tempting --
   nothing about a `sub/form` key says which building it arrived at -- and is
   wrong about the GAME even though it is fine about the key: with the altar
   standing four tiles from spawn for the whole run and accepting the same
   three material classes the dock does, that version made cycles 2, 3 and 4
   all payable by hand-feeding the altar. No ascent, no dock, no drivetrain,
   no climb. The one thing the second half of this game is about was
   optional, and the only thing standing between a player and skipping it
   was not knowing they could.

   So `cyc.at` is the gate. One drain path still serves both receivers -- the
   loop below is unchanged in shape and there is still no machine name in
   this file -- it simply runs for the ONE machine the live row names.

   MATERIAL FED TO THE WRONG RECEIVER STAYS IN THAT MACHINE'S BUFFER,
   uncredited, rather than being refused at its port. Refusing it would mean
   `rules/machines.js`'s generic port interpreter asking what the live cycle
   is, which is director policy inside the machine layer and a second place
   that would have to agree with this one about which receiver is live; and
   it would contradict invariant 5 -- a catch box swallowing what falls into
   it is physics, not permission. A receiver's buffer is a ledger with a
   footprint (`data/machines.js`'s own `cap:64`), so the pile is visible,
   bounded, and drained in full the moment a cycle does name that machine.
   The altar after cycle 1 is the honest cost of that choice: nothing later
   asks for it, so what is fed to it there stays there.

   Draining is real consumption (`mw.consume`), not a peek -- the buffer must
   not also feed some future recipe on the same machine. */
function drainReceivers() {
  if (!run.tribute) return;
  /* Resolved by ID through `CYCLE`, never by `CYCLES[run.cycle - 1]`: the
     live ledger's own id is the authority on what is armed, the same reason
     `model/run.js#cycleRow` resolves it that way. */
  const at = CYCLE[run.tribute.id]?.at;
  const want = at === undefined ? undefined : M[at];
  if (want === undefined) return;
  for (const m of machines) {
    if (m.def !== want) continue;
    if (!defOf(m).tribute) continue;
    for (const k of Object.keys(m.buf)) {
      const n = m.buf[k];
      if (!n) continue;
      const { sub, form } = parseKey(k);
      mw.consume(m, sub, form, n);
      creditTribute(k, n);
      push('tribute', { x: m.box.x + m.box.w / 2, y: m.box.y }, { sub, form, n });
    }
  }
}

/* A CREDIT IS STAMPED WITH `run.t`, which is simulated time at the fixed
   1/120 s substep and never `Date.now()` (invariant 10, docs/SPEC.md section
   18.10). Only the batched pair is stamped; every other pair moves `have` and
   nothing else.

   ON ARRIVAL, WHICH IS WHY THE CLAUSE IS CALLED `batch` AND NOT `rate`. This
   function runs when a receiver's buffer is drained, so a haul of four
   plates is one credit of four at one instant however long it took to make
   or to climb. That measures how tightly deliveries are bunched and cannot
   be made to measure production (docs/SPEC.md section 18.10).

   THE LEDGER IS REBUILT PER CREDIT rather than pushed into, because
   `run.tribute` is replaced whole and never patched in place -- the same
   discipline the rest of this file holds to, stated on the field itself in
   `model/run.js`. Hand-feeding is one unit per substep, so that is one fresh
   array per unit; `model/run.js#prunedCredits` caps the array at `batch.n`
   entries, so that copy stays four elements long rather than growing with the
   run. */
function creditTribute(k, n) {
  const have = { ...run.tribute.have, [k]: (run.tribute.have[k] || 0) + n };
  const batch = CYCLE[run.tribute.id]?.batch;
  const credits = batch && k === keyOf(S[batch.sub], F[batch.form])
    ? [...(run.tribute.credits ?? []), { t: run.t, n }]
    : run.tribute.credits;
  rw.tribute({ ...run.tribute, have, credits });
}

/* `left === null` is cycle 1's "no clock", a real branch and not a large
   number -- it must never count down towards a miss that can never come. */
function tickDeadline(dt) {
  if (!run.tribute || run.tribute.left === null) return;
  rw.tribute({ ...run.tribute, left: Math.max(0, run.tribute.left - dt) });
}

/* COMPLETION OUTRANKS EXPIRY: a delivery landing the same frame the clock
   reaches zero pays the trial rather than missing it. `tributeMet()` is the
   shared query (`model/run.js`) the TRIBUTE panel will read too. */
function resolve() {
  if (!run.tribute) return;
  const cyc = CYCLE[run.tribute.id];
  if (tributeMet()) { complete(cyc); return; }
  if (run.tribute.left !== null && run.tribute.left <= 0) miss(cyc);
}

function receiverOf(cyc) {
  return machines.find(mm => mm.def === M[cyc.at]) ?? null;
}

function complete(cyc) {
  const m = receiverOf(cyc);
  const pos = m ? { x: m.box.x + m.box.w / 2, y: m.box.y } : null;
  const reward = cyc.reward;
  if (reward.favour) rw.favour(cyc.god, reward.favour);
  /* THE GRANT BRIDGE, NOT `rw.grant` (Phase 13d, docs/SPEC.md section 20.3):
     the raw model writer appends a machine id to `run.granted` and pushes
     NOTHING, so calling it directly would give cycle 1's reward -- the
     furnace and the dock, the single most important gift in the game -- no
     toast, no sound and no line anywhere. `rules/grants.js`
     is the only module that pushes a `'grant'` row, and it is a `rules`
     SIBLING this file may not import (`tools/layers.mjs`), so the ids go
     onto `run.awarded` and `rules/grants.js#step` -- scheduled immediately
     after this module in `shell/schedule.js` -- performs them the same frame
     through the same `award()` path a drafted grant takes. Exactly the
     shape `run.offer` below already uses for a draft, for exactly the same
     reason, and NOT a second grant path: `model/run.js#write.grant` is still
     called from exactly one module in all of `src/`, and that module is
     `rules/grants.js`. */
  if (reward.grants?.length) rw.award([...reward.grants]);
  for (const id of reward.charts ?? []) rw.chart(id);
  /* THE ASKING GOD RIDES WITH THE REQUEST. `shell/main.js` cannot work out
     who asked -- by the time it reads the field this function has already
     bumped `run.cycle` past the row -- and a reroll spends a named god's
     favour, so the id is written where it is still a fact rather than an
     inference. See `model/run.js#RUN_SCHEMA.offer`. */
  if (reward.draft) rw.offer(reward.draft, cyc.god);
  rollTributeDrop(m);
  push('cycle', pos, { cycleId: cyc.id, god: cyc.god, reward });
  rw.tribute(null);
  rw.cycle(run.cycle + 1);
}

/* A miss forfeits the ledger but NOT the trial: `run.cycle` does not move, so
   `ensureLiveCycle` re-arms the identical row next frame with a fresh `have`
   and a fresh clock -- the retry IS the mercy, and the punishment is the cost
   of it. TWO MISSES END THE RUN, through the existing `hurtFor`/`write.hurt`
   and no new death path (`RUN_SCHEMA.misses`'s own comment): the ordinary
   punishment applies first, then a second miss tops hearts off to zero
   outright regardless of which cycle it was, so "two" always means "two",
   not "landed on zero by coincidence". */
function miss(cyc) {
  const m = receiverOf(cyc);
  const pos = m ? { x: m.box.x + m.box.w / 2, y: m.box.y } : null;
  const pun = cyc.punishment ?? {};
  rw.miss();
  push('debt', pos, { cycleId: cyc.id, god: cyc.god, hearts: pun.hearts ?? 0, favour: pun.favour ?? 0 });
  if (pun.favour) rw.favour(cyc.god, pun.favour);
  if (pun.hearts) hurtFor(pos, pun.hearts, `${String(cyc.god).toUpperCase()}'S TRIBUTE WENT UNPAID`);
  if (run.misses >= 2 && !run.dead) hurtFor(pos, run.hearts, 'A SECOND TRIBUTE MISSED');
  rw.tribute(null);
}

/* Duplicates `rules/player.js#hurt`'s three lines -- flash, hurt, and a death
   row if it proves fatal -- because that function lives in a `rules` sibling
   this file may not import. Falls back to the player's own position when the
   receiver that triggered it no longer resolves to a box. */
function hurtFor(pos, n, cause) {
  if (run.dead || n <= 0) return;
  const at = pos ?? { x: player.x, y: player.y };
  pw.set('hurtFlash', 1);
  rw.hurt(n, cause);
  push('hurt', at, { hearts: n, cause });
  if (run.dead) push('death', at, { cause: run.deathCause });
}

/* Duplicates `rules/mining.js`'s rare-trinket-drop shape, filtered to
   `trigger:'tribute'` -- `tribute-bellows` (`data/drops.js`) is `chance:1`,
   so the first cycle completion always hands over the bellows trinket. Rolled
   through `rand()` and nothing else (invariant 7), and skipped entirely if a
   copy is already held, the same "one is enough" rule the mining roll uses.
   Spawns in the RECEIVER'S OWN BAND, never the spawn band by assumption --
   the dock sits in `astral`, and world px is only meaningful within the band
   that owns it (invariant 2). */
function rollTributeDrop(m) {
  if (!m) return;
  for (const d of DROPS) {
    if (d.trigger !== 'tribute') continue;
    const giveSub = S[d.give];
    if (giveSub === undefined || invCount(giveSub, F.relic) > 0) continue;
    if (rand() < d.chance) {
      const at = { x: m.box.x + m.box.w / 2, y: m.box.y };
      iw.spawn(m.band, at.x, at.y, giveSub, F.relic, (rand() - 0.5) * 24, -30 - rand() * 20);
      push('relic', at, { sub: giveSub, form: F.relic });
    }
  }
}
