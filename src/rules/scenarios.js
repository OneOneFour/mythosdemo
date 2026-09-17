/* rules layer — applies one named debug diorama as a set of edits on top of a
   completed `newRun()`. Not a per-frame step.

   Every write goes through `model` — `rules/placement.js` is a sibling this
   file may not import — so `placementCheck` never runs and a diorama may stand
   a machine where a player could not have built one. `linkCheck`'s clear-path
   sweep is asked here instead, since it is a question about live tiles, and a
   refusal becomes a journal row.

   Consumes no `rand()`: every coordinate derives from the spawn band's
   `spawnTx` and the named band's `floorTy`. */

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

/* Returns false when no row carries `id`, which `shell` turns into a message
   rather than booting a world that ignored the request. */
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

  /* A scenario writes the cycle number and clears the live tribute; building
     the tribute record itself is `rules/cycles.js#ensureLiveCycle`'s. A cycle
     number beside a stale tribute is what the director cannot reconcile. */
  if (row.cycle !== undefined && row.cycle >= 1 && row.cycle <= CYCLES.length) {
    rw.cycle(row.cycle);
    rw.tribute(null);
  }

  return true;
}

/* `dx` is tiles right of the spawn band's own `spawnTx`, `dy` tiles below the
   target band's own `floorTy`; one column datum works across bands only
   because they share a tile size. The `??` fallbacks match `shell/boot.js`. */
const bandFor = (row, spec) => bandOf(spec.band ?? row.band);

function txOf(spec) {
  const spawn = bandOf(SPAWN_BAND);
  return (spawn.cfg.spawnTx ?? (spawn.tw >> 1)) + spec.dx;
}

const tyOf = (b, spec) => (b.cfg.floorTy ?? 0) + spec.dy;

/* Every tile of one declared rect, revealing each as it goes: a diorama below
   the boot reveal depth would otherwise be applied into the dark. */
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
  /* A belt spends one charge per item delivered off its end, so a scenario
     that filled only the fuel buffer would sit still until the first burned. */
  if (spec.charges) mw.charge(m, spec.charges);

  /* The footprint and one row past it, so a machine standing in fresh carve
     is visible along with the floor it stands on. */
  for (let j = -1; j <= def.th; j++)
    for (let i = -1; i <= def.tw; i++) worldw.reveal(b, tx + i, ty + j);

  return m;
}

/* `linkCheck`'s reach half is proved at build time, so a refusal here is
   always about the live path between the two hubs. */
function link(a, b) {
  if (!a || !b) return;
  const check = linkCheck(a, b);
  if (!check.ok) {
    push('refused', check.at || { x: a.box.x, y: a.box.y }, { why: check.why });
    return;
  }
  segw.link(a, b);
}
