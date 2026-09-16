/* LAYER rules — THE CYCLE DIRECTOR: arms a trial, drains what was fed to it,
   and decides completion or debt. Imports `core`, `data`, `model`, and no
   other `rules` module.

   ONE DECISION PER STEP, IN ORDER: ensure a live cycle, drain every tribute
   receiver into it, tick its deadline, then resolve -- complete or miss,
   never both, never twice in one frame. `model/run.js#tributeMet()` is the
   completion predicate and is a QUERY rather than a decision here, so the
   TRIBUTE panel can draw the same yes/no without importing this file.

   `run.tribute` IS REPLACED WHOLE, NEVER PATCHED IN PLACE, so a demand and
   its own deadline can never be observed half-applied.

   TWO BRIDGES, both because a `rules` sibling may not be imported.
   `run.offer` carries a tier name for `shell/main.js` to perform, because
   `draftable()` lives in four siblings. `run.awarded` carries machine ids for
   `rules/grants.js#step`, the only module that pushes a `'grant'` row,
   scheduled immediately after this one.

   NO `rand()` outside the drop roll, and the deadline accumulates from `dt`
   alone -- never `Date.now()`. */

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

/* `run.tribute === null` is "nothing armed" -- true on a fresh run and true
   again the instant a cycle completes or is missed, so THIS is the one place
   a new cycle ever arms, first or retry.

   PAST THE LAST SHIPPED ROW, THE RUN IS WON. `run.cycle > CYCLES.length` is
   the FACT; `rw.win()` is the EVENT, set exactly once, with a journal row to
   sound and a screen to draw. The boundary is the shipped table's own length
   and moves when the table grows -- there is no literal 4 anywhere. */
function ensureLiveCycle() {
  if (run.tribute) return;
  if (run.cycle > CYCLES.length) {
    /* A RUN IS NOT WON WHILE A REWARD IS OUTSTANDING. `complete()` writes
       `run.offer` and bumps `run.cycle` in one call, so on the last trial the
       boundary is visible in a later substep of the frame that paid it -- and
       `applyIntents` returns on `run.won` above both the offer's dispatch and
       its lay-out, so the final draft would be discarded on whichever substep
       parity the framerate gave.

       IT CANNOT HANG: a request is laid out or dropped the same frame, a
       laid-out offer always holds at least one card, and taking one is always
       available since Escape cannot dismiss it. */
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
   every player-facing check, at a position DERIVED from the spawn band's own
   per-seed fields and never a world-px literal.

   `SPAWN_GAP` TILES CLEAR OF `spawnTx`, NOT FLUSH AGAINST IT. It clears
   `handFeed.reach` plus the player's own width with room over, while staying
   the short deliberate walk the beat sheet asks for first. An altar in the
   player's own footprint is bad staging whatever it takes. */
const SPAWN_GAP = 4;

/* Beat 4 of `rules/tutorial.js#BEATS`, the climbed-back-up beat. The two
   must agree, and neither file may import the other. */
const ALTAR_BEAT = 4;

/* IT DOES NOT ARRIVE ON FRAME 0: the director waits for beat 4, read through
   `model/tutorial.js#beat` so this needs no sibling import.

   THE GRACE IS NOT BELT-AND-BRACES. Cycle 1 has exactly one receiver and
   nothing else can pay it, so a beat predicate that never fires would
   soft-lock the first trial outright. `eff('altarGraceSecs')` places it anyway
   once `run.t` passes. RE-ASKED EVERY STEP rather than once when the cycle
   armed, since neither the beat nor the clock has usually reached the gate. */
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

/* ONLY THE LIVE CYCLE'S OWN RECEIVER PAYS IT. Draining every machine tagged
   `tribute:{}` is fine about the KEY and wrong about the GAME: with the altar
   four tiles from spawn all run, that made cycles 2, 3 and 4 payable by
   hand-feeding it -- no ascent, no dock, no drivetrain, no climb. So `cyc.at`
   is the gate, and one drain path still serves both receivers.

   MATERIAL FED TO THE WRONG RECEIVER STAYS IN THAT BUFFER, uncredited, rather
   than refused at its port: refusing would put director policy inside the
   machine layer, and a catch box swallowing what falls in is physics rather
   than permission. Draining is real consumption, not a peek. */
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

/* A CREDIT IS STAMPED WITH `run.t`, simulated time and never `Date.now()`.
   Only the batched pair is stamped.

   ON ARRIVAL, WHICH IS WHY THE CLAUSE IS `batch` AND NOT `rate`: this runs
   when a buffer is drained, so a haul of four plates is one credit of four at
   one instant however long it took to make or climb.

   THE LEDGER IS REBUILT PER CREDIT rather than pushed into, because
   `run.tribute` is replaced whole. `prunedCredits` caps the array, so the copy
   stays short rather than growing with the run. */
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
  /* THE GRANT BRIDGE, NOT `rw.grant`: the raw model writer appends a machine
     id and pushes NOTHING, so calling it directly would give cycle 1's reward
     -- the furnace and the dock -- no toast, no sound and no line anywhere.

     `rules/grants.js` is the only module that pushes a `'grant'` row and is a
     sibling this file may not import, so the ids go onto `run.awarded` and
     its `step` performs them the same frame. NOT a second grant path:
     `write.grant` still has exactly one calling module. */
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
   through `rand()` and nothing else, and skipped entirely if a
   copy is already held, the same "one is enough" rule the mining roll uses.
   Spawns in the RECEIVER'S OWN BAND, never the spawn band by assumption --
   the dock sits in `astral`, and world px is only meaningful within the band
   that owns it. */
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
