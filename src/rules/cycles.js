/* LAYER rules — THE CYCLE DIRECTOR: arms a trial, drains what was fed to it,
   and decides completion or debt. Imports `core`, `data`, `model`. Imports
   no other `rules` module. See docs/PLAN-phase10.md 4.7 and docs/SPEC.md 18.

   ONE DECISION PER STEP, IN ORDER: ensure a live cycle, drain every tribute
   receiver into it, tick its deadline, then resolve -- complete or miss,
   never both, never twice in the same frame. `model/run.js#tributeMet()` is
   the completion predicate and is a QUERY, not a decision here, precisely so
   the TRIBUTE panel (Phase 10c) can draw the same yes/no without importing
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

   NO `rand()` outside the drop roll (invariant 7), and the deadline
   accumulates from `dt` alone, never `Date.now()` (invariant 10) -- see
   `RUN_SCHEMA.tribute.left`'s own comment in `model/run.js`. */

import { rand } from '../core/rng.js';
import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { CYCLE, CYCLES } from '../data/cycles.js';
import { DROPS } from '../data/drops.js';
import { M, MACH } from '../data/machines.js';
import { SPAWN_BAND } from '../data/world.js';
import { push } from '../model/journal.js';
import { parseKey, write as iw } from '../model/items.js';
import { defOf, machines, write as mw } from '../model/machines.js';
import { player, write as pw } from '../model/player.js';
import { invCount, run, tributeMet, write as rw } from '../model/run.js';
import { bandOf } from '../model/world.js';

export function step(dt) {
  if (run.dead) return;
  ensureLiveCycle();
  drainReceivers();
  tickDeadline(dt);
  resolve();
}

/* `run.tribute === null` is "nothing armed" -- true on a fresh run (`cycle`
   starts at 1) and true again the instant a cycle completes or is missed
   below, so THIS is the one place a new cycle ever arms, whether it is the
   first or a retry of one just missed. Beyond the shipped table (D-J: cycles
   5-6 do not exist yet) there is nothing to arm and the ledger stays empty. */
function ensureLiveCycle() {
  if (run.tribute) return;
  if (run.cycle > CYCLES.length) return;
  const cyc = CYCLES[run.cycle - 1];
  rw.tribute({ id: cyc.id, have: {}, left: cyc.deadlineSecs });
  if (cyc.at === 'altar') ensureAltarPlaced();
}

/* THE ONE MACHINE THE PLAYER CANNOT BUILD gets placed the one way that skips
   every player-facing check (`model/machines.js#write.place`, the sanctioned
   route `data/machines.js`'s own altar-row comment names) at a position
   DERIVED from the spawn band's own fields, never a world-px literal --
   invariant 2. `spawnTx`/`floorTy` are per-band and per-seed; this reads them
   rather than assuming topsoil's current numbers. */
function ensureAltarPlaced() {
  if (machines.some(m => m.def === M.altar)) return;
  const band = bandOf(SPAWN_BAND);
  const def = MACH[M.altar];
  mw.place(band, M.altar, band.spawnTx - def.tw, band.floorTy - def.th);
}

/* Every machine tagged `tribute:{}` (today: the altar and the dock) empties
   its own buffer into the live ledger every frame, regardless of which one
   `cyc.at` names -- ONE DRAIN PATH SERVES BOTH, per `data/machines.js`'s own
   header on the two receiver rows, and a pair fed to the "wrong" receiver
   still counts because nothing about a `sub/form` key says which building it
   arrived at. Draining is real consumption (`mw.consume`), not a peek --
   the buffer must not also feed some future recipe on the same machine. */
function drainReceivers() {
  if (!run.tribute) return;
  for (const m of machines) {
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

function creditTribute(k, n) {
  const have = { ...run.tribute.have, [k]: (run.tribute.have[k] || 0) + n };
  rw.tribute({ ...run.tribute, have });
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
  for (const id of reward.grants ?? []) rw.grant(id);
  for (const id of reward.charts ?? []) rw.chart(id);
  if (reward.draft) rw.offer(reward.draft);
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
    if (rand() < d.chance)
      iw.spawn(m.band, m.box.x + m.box.w / 2, m.box.y,
               giveSub, F.relic, (rand() - 0.5) * 24, -30 - rand() * 20);
  }
}
