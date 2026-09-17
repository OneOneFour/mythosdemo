/* rules layer — the cycle director. Each substep, in order: ensure a live
   cycle, place the altar if the armed cycle wants one, drain every matching
   receiver into the ledger, tick the deadline, then resolve to complete or
   miss — never both, never twice.

   `run.tribute` is replaced whole rather than patched, so a demand and its
   deadline cannot be observed half-applied. `model/run.js#tributeMet()` is the
   shared completion query, so the tribute panel needs no import of this file.

   `run.offer` carries a tier name for `shell/main.js` and `run.awarded` carries
   machine ids for `rules/grants.js#step`, since both live in siblings this file
   may not import. The deadline accumulates from `dt`, never `Date.now()`. */

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

/* `run.tribute === null` means nothing is armed — true on a fresh run and
   again the instant a cycle completes or is missed — so this is the only place
   a cycle arms, first or retry. Past the last row of `CYCLES` the run is won,
   and `rw.win()` fires exactly once. */
function ensureLiveCycle() {
  if (run.tribute) return;
  if (run.cycle > CYCLES.length) {
    /* `complete()` writes `run.offer` and bumps `run.cycle` in one call, and
       `applyIntents` returns early on `run.won`, so the last trial's draft has
       to be taken before the win lands. It cannot hang: an offer is laid out or
       dropped the same frame, always holds a card, and cannot be dismissed. */
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

/* Tiles clear of the spawn band's `spawnTx`, derived rather than a world-px
   literal. Clears `handFeed.reach` plus the player's own width with room over,
   while staying a short walk from spawn. */
const SPAWN_GAP = 4;

/* The climbed-back-up beat in `rules/tutorial.js#BEATS`. The two must agree,
   and neither file may import the other. */
const ALTAR_BEAT = 4;

/* Waits for `ALTAR_BEAT`, read through `model/tutorial.js#beat` rather than a
   sibling import, or for `eff('altarGraceSecs')` of `run.t` — cycle 1 has one
   receiver, so a beat that never fires would soft-lock it. Asked every step,
   since usually neither gate has been reached. */
function ensureAltarPlaced() {
  if (CYCLE[run.tribute?.id]?.at !== 'altar') return;
  if (beat(run) < ALTAR_BEAT && run.t < eff('altarGraceSecs')) return;
  if (machines.some(m => m.def === M.altar)) return;
  const band = bandOf(SPAWN_BAND);
  const def = MACH[M.altar];
  const m = mw.place(band, M.altar, band.cfg.spawnTx - def.tw - SPAWN_GAP, band.cfg.floorTy - def.th);
  /* The instant and the place for `view/scene.js` to draw the rise against. A
     position rather than the machine, so the renderer learns no machine name. */
  rw.arrival(m.box.x, m.box.y);
}

/* Only the receiver the live cycle's own `at` names pays it. Material fed to
   any other tribute receiver stays in that buffer uncredited rather than being
   refused at the port, and draining is real consumption, not a peek. */
function drainReceivers() {
  if (!run.tribute) return;
  /* Resolved by id through `CYCLE` rather than `CYCLES[run.cycle - 1]`: the
     live ledger's own id is the authority on what is armed. */
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

/* Stamped with `run.t`, simulated time, and only for the pair the cycle's
   `batch` clause names. Runs when a buffer is drained, so one drained buffer
   is one credit of n at one instant. Rebuilt rather than pushed into, since
   `run.tribute` is replaced whole; `prunedCredits` caps the array. */
function creditTribute(k, n) {
  const have = { ...run.tribute.have, [k]: (run.tribute.have[k] || 0) + n };
  const batch = CYCLE[run.tribute.id]?.batch;
  const credits = batch && k === keyOf(S[batch.sub], F[batch.form])
    ? [...(run.tribute.credits ?? []), { t: run.t, n }]
    : run.tribute.credits;
  rw.tribute({ ...run.tribute, have, credits });
}

/* `left === null` is a cycle with no clock — a real branch rather than a large
   number — and must never count down. */
function tickDeadline(dt) {
  if (!run.tribute || run.tribute.left === null) return;
  rw.tribute({ ...run.tribute, left: Math.max(0, run.tribute.left - dt) });
}

/* Completion outranks expiry: a delivery landing the same substep the clock
   reaches zero pays the trial rather than missing it. */
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
  /* `rw.grant` appends an id and pushes nothing, so the ids go onto
     `run.awarded` for `rules/grants.js#step` to perform the same frame — that
     is the only module that pushes a `'grant'` row, and a sibling. */
  if (reward.grants?.length) rw.award([...reward.grants]);
  for (const id of reward.charts ?? []) rw.chart(id);
  /* The asking god is written with the request: this function bumps
     `run.cycle` past the row before `shell/main.js` reads the field, and a
     reroll spends a named god's favour. */
  if (reward.draft) rw.offer(reward.draft, cyc.god);
  rollTributeDrop(m);
  push('cycle', pos, { cycleId: cyc.id, god: cyc.god, reward });
  rw.tribute(null);
  rw.cycle(run.cycle + 1);
}

/* A miss forfeits the ledger but not the trial: `run.cycle` does not move, so
   `ensureLiveCycle` re-arms the identical row with a fresh `have` and clock.
   The row's own punishment applies first, then a second miss zeroes hearts
   through `hurtFor` rather than a new death path. */
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

/* Duplicates `rules/player.js#hurt` — flash, hurt, and a death row if fatal —
   because that lives in a sibling this file may not import. Falls back to the
   player's own position when the receiver resolves to no box. */
function hurtFor(pos, n, cause) {
  if (run.dead || n <= 0) return;
  const at = pos ?? { x: player.x, y: player.y };
  pw.set('hurtFlash', 1);
  rw.hurt(n, cause);
  push('hurt', at, { hearts: n, cause });
  if (run.dead) push('death', at, { cause: run.deathCause });
}

/* Duplicates `rules/mining.js`'s drop shape, filtered to `trigger:'tribute'`
   in `data/drops.js` and skipped when a copy is already held. Spawns in the
   receiver's own band: world px is only meaningful within the owning band. */
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
