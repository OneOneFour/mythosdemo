/* LAYER rules — SCENARIOS: apply one named debug diorama.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   APPLIED AFTER `newRun()`, NEVER INSTEAD OF IT (CLAUDE.md invariant 8). The
   world is already generated from its seed and the ledger already reset by the
   time this runs, so a scenario is a set of edits on top of a clean run and
   there is no second code path through boot. `shell` calls `apply(id)` once,
   immediately after `newRun()`; nothing here is a per-frame step, so this
   module has no place in `shell/schedule.js`.

   WHY EVERY WRITE HERE IS A `model` WRITE, AND NOT A CALL TO
   `rules/placement.js`. A scenario has to place machines, and the obvious
   route -- `rules/placement.js#placeMachine` / `#placeTile` / `#linkSegment` --
   is a `rules` sibling this file may not import (`tools/layers.mjs` section 0).
   The legal route already exists and is already used for exactly this job:
   `rules/cycles.js#ensureAltarPlaced` places the altar through
   `model/machines.js#write.place`, the director route that asks nothing about
   footing, grants or held items. This file does the same.

   WHAT THAT COSTS, STATED: `model/run.js#placementCheck` never runs, so a
   diorama can stand a machine in a place a player could not have built it --
   floating, unfooted, or past its own `minDepth`. That is not left to a
   reviewer's eye. `tools/content.mjs` assertion 27 re-derives each footprint's
   depth and band from the row's own `dx`/`dy` and fails the build on either
   gate, and every scenario's geometry is verified by actually driving it. The
   one check that cannot move to build time is `linkCheck`'s clear-path sweep,
   because it is a question about live tiles -- so that one is asked here, at
   apply time, and a refusal becomes a journal row rather than a silently
   missing segment.

   NO `rand()`. Every coordinate is derived from the spawn band's
   `spawnTx` and the named band's `floorTy`, so applying a scenario does not
   disturb the stream and a seed still reproduces the same terrain underneath. */

import { F } from '../data/forms.js';
import { CYCLES } from '../data/cycles.js';
import { M, MACH } from '../data/machines.js';
import { SCENARIO, SCENARIO_IDS } from '../data/scenarios.js';
import { S } from '../data/substances.js';
import { SPAWN_BAND } from '../data/world.js';
import { write as iw } from '../model/items.js';
import { push } from '../model/journal.js';
import { write as mw } from '../model/machines.js';
import { write as rw } from '../model/run.js';
import { linkCheck, write as segw } from '../model/segments.js';
import { write as tw } from '../model/tiles.js';
import { bandOf, inBounds, worldX, worldY, write as worldw } from '../model/world.js';

export { SCENARIO_IDS };

export const has = id => Object.hasOwn(SCENARIO, id);

/* Apply the named scenario. Returns true when one was applied, false when no
   row carries that id -- `shell` turns the false into a message rather than
   booting into a world that silently ignored the request. */
export function apply(id) {
  const row = SCENARIO[id];
  if (!row) return false;

  const home = bandOf(row.band);
  if (!home) return false;

  for (const r of row.carve || []) rect(row, r, (b, tx, ty) => tw.clear(b, tx, ty));
  for (const r of row.tiles || [])
    rect(row, r, (b, tx, ty) => tw.set(b, tx, ty, S[r.sub], F[r.form]));

  const placed = (row.machines || []).map(spec => place(row, spec));

  for (const [i, j] of row.segments || []) link(placed[i], placed[j]);

  for (const it of row.items || []) {
    const b = bandFor(row, it);
    const t = b.tile;
    for (let k = 0; k < it.n; k++)
      iw.spawn(b, worldX(b, txOf(it)) + t / 2, worldY(b, tyOf(b, it)) + t / 2,
               S[it.sub], F[it.form], 0, 0);
  }

  for (const mid of row.grant || []) rw.grant(mid);
  for (const bid of row.chart || []) rw.chart(bid);
  for (const [god, n] of Object.entries(row.favour || {})) rw.favour(god, n);
  for (const g of row.give || []) rw.collect(S[g.sub], F[g.form], g.n);

  /* THE DIRECTOR ARMS THE CYCLE, NOT THIS FILE. Writing `run.cycle` and
     clearing the live tribute is all a scenario is entitled to do: a tribute
     record carries a demand, a deadline and a batch ledger, and building one
     here would be `rules/cycles.js#ensureLiveCycle`'s decision made in two
     places. Cleared rather than left alone because a cycle number with a
     stale tribute beside it is the one state the director cannot reconcile. */
  if (row.cycle !== undefined && row.cycle >= 1 && row.cycle <= CYCLES.length) {
    rw.cycle(row.cycle);
    rw.tribute(null);
  }

  return true;
}

/* coordinates
   `dx` is tiles right of the SPAWN band's own `spawnTx`, and `dy` tiles below
   the target band's own `floorTy`. One column datum across every band is only
   sound because all three share a tile size;
   `tools/content.mjs` asserts that rather than trusting it. The `??` fallbacks
   are `shell/boot.js`'s own, so a band with no spawn column resolves the same
   way there and here. */
const bandFor = (row, spec) => bandOf(spec.band ?? row.band);

function txOf(spec) {
  const spawn = bandOf(SPAWN_BAND);
  return (spawn.cfg.spawnTx ?? (spawn.tw >> 1)) + spec.dx;
}

const tyOf = (b, spec) => (b.cfg.floorTy ?? 0) + spec.dy;

/* Every tile of one declared rect, plus the fog lifted off it: a diorama below
   `shell/boot.js`'s own reveal depth would otherwise be applied into the dark,
   and a developer cannot verify what they cannot see. */
function rect(row, r, fn) {
  const b = bandFor(row, r);
  const tx0 = txOf(r), ty0 = tyOf(b, r);
  for (let ty = ty0; ty < ty0 + r.h; ty++)
    for (let tx = tx0; tx < tx0 + r.w; tx++) {
      if (!inBounds(b, tx, ty)) continue;
      fn(b, tx, ty);
      worldw.reveal(b, tx, ty);
    }
}

function place(row, spec) {
  const b = bandFor(row, spec);
  const def = MACH[M[spec.id]];
  const tx = txOf(spec), ty = tyOf(b, spec);
  const m = mw.place(b, M[spec.id], tx, ty);

  for (const e of spec.buf || []) mw.take(m, S[e.sub], F[e.form], e.n);
  /* Honest fuel, banked: a
     belt spends one charge per item it delivers off its end, so a scenario
     that only filled the fuel buffer would sit still for the six seconds the
     first charge takes to burn. */
  if (spec.charges) mw.charge(m, spec.charges);

  /* The footprint and one row past it, so a machine standing in fresh carve
     is visible along with the floor it stands on. */
  for (let j = -1; j <= def.th; j++)
    for (let i = -1; i <= def.tw; i++) worldw.reveal(b, tx + i, ty + j);

  return m;
}

/* ONE SEGMENT, CHECKED. `linkCheck` is the one decision and this is its third
   reader after `rules/placement.js#linkSegment` and the cable ghost;
   the reach half is proved
   at build time, so a refusal here is always about the live path between two
   hubs and is worth saying out loud. */
function link(a, b) {
  if (!a || !b) return;
  const check = linkCheck(a, b);
  if (!check.ok) {
    push('refused', check.at || { x: a.box.x, y: a.box.y }, { why: check.why });
    return;
  }
  segw.link(a, b);
}
