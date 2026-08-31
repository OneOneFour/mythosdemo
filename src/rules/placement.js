/* LAYER rules — PLACEMENT: putting a machine or a tile into the world.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   ============================================================================
   THE FOOTPRINT CHECK READS `tw`, `th` AND `footing` OFF THE ROW, so every
   machine that will ever exist is placeable and there is no `placeFurnace()`
   anywhere. The previous codebase had eighteen lines of furnace-specific
   footprint checking in a module that also reached into the player, the tile
   grid, the item list, the toast queue and the audio device.
   ============================================================================

   WHAT MAY BE PLACED IS A RUN-STATE SET, NOT A REGISTRY EDIT. `run.granted`
   holds machine ids, seeded from `data/boons.js#STARTING_MACHINES` and extended
   by `rules/boons.js`. `data/machines.js` is a plain frozen table read at
   placement time, so granting a machine mid-run costs no architecture at all.

   Every refusal pushes a journal row carrying its reason. `shell/notify.js`
   turns that into text; nothing here knows what a toast is.

   A GRANTED MACHINE IS A HELD ITEM (design reversal superseding Phase 3's
   cost-at-placement deviation -- see `data/forms.js#rig` and the
   machine-substance block in `data/substances.js` for the full argument).
   `model/run.js#machineHeldSub` names which substance's `rig` pair a machine
   id places from; `placementCheck` checks `invCount(that, F.rig) > 0` after
   every other refusal, and exactly ONE unit is spent with `rw.spend` only
   once every other check has already passed, so a refused placement never
   touches the pockets.

   ============================================================================
   PHASE 3: THE VALIDITY DECISION ITSELF LIVES IN `model/run.js#placementCheck`
   NOW, NOT HERE. `view`'s ghost preview needs the identical yes/no this
   function enforces and `view` may not import `rules` -- the same reason
   `canAfford`/`canPlace` were already model queries rather than private to
   this file. This function's own job shrank to "call the query, and turn a
   `false` into a journal row plus the actual mutation" -- ONE implementation
   of the checks, TWO readers of the answer.
   ============================================================================ */

import { rand } from '../core/rng.js';
import { AIR, F, FORM, NATIVE } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { push } from '../model/journal.js';
import { write as iw } from '../model/items.js';
import { machineAt, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { invCount, machineHeldSub, placementCheck, write as rw } from '../model/run.js';
import { climbAt, solidAt, tileAt, write as tw } from '../model/tiles.js';
import { inBounds, worldX, worldY } from '../model/world.js';

/* ---------- machines ---------- */

/* `tx`/`ty` is the top-left tile of the footprint. Returns the machine record,
   or null with a reason on the journal. */
export function placeMachine(band, machineId, tx, ty) {
  const at = { x: worldX(band, tx), y: worldY(band, ty) };
  const no = why => { push('refused', at, { machine: machineId, why }); return null; };

  const check = placementCheck(band, machineId, tx, ty);
  if (!check.ok) return no(check.why);

  const defIdx = M[machineId];
  const m = mw.place(band, defIdx, tx, ty);
  /* Spent AFTER `mw.place`, not before: `placementCheck` -- including holding
     the item -- has already passed by this line, so this can only ever run
     once the placement itself is guaranteed to succeed. Exactly ONE unit of
     the machine's OWN substance x `rig` pair, never a material bill -- see
     `data/forms.js#rig`. */
  rw.spend(machineHeldSub(machineId), F.rig, 1);
  push('place', { x: m.box.x, y: m.box.y }, { machine: machineId, def: defIdx });
  return m;
}

/* ---------- deconstruct ----------
   The inverse of `placeMachine`, and the reason a held item is a real
   commitment rather than a one-way tax: a machine proven EMPTY -- no
   buffered material, no banked fuel charge -- gives its OWN `<id>/rig` pair
   back, exactly one unit, the moment it is removed -- picking up and
   relocating a machine is "mine it back out as the same item you built,"
   not "get raw materials back." A machine still holding anything refuses,
   with a reason, so nobody discovers ore has quietly vanished into the
   abyss along with the machine that was holding it.

   "Empty" is `m.buf` having no keys and `m.charges === 0` -- the same two
   fields `rules/machines.js#produce`/`choose` already treat as "this machine
   is holding something": a buffered ore/fuel unit not yet spent, and a
   banked lift/belt/brazier charge bought but not yet used. `m.made` (a
   lifetime counter) and `m.prog` (recipe progress, which cannot be nonzero
   with an empty buffer -- `choose` re-proves availability every frame) are
   deliberately not part of this test. */
export function deconstruct(band, tx, ty) {
  const at = { x: worldX(band, tx), y: worldY(band, ty) };
  const no = (why, machineId) => { push('refused', at, { machine: machineId, why }); return false; };

  const m = machineAt(band, tx, ty);
  if (!m) return no('NOTHING TO DECONSTRUCT');

  const def = MACH[m.def];
  if (Object.keys(m.buf).length > 0 || m.charges > 0)
    return no('EMPTY IT FIRST', def.id);

  /* The refund returns as a FALLING ITEM, never a direct pocket credit --
     invariant 5's idiom, the same one `rules/crafting.js`'s output and
     `rules/machines.js#produce`'s ejected units already use. Tossed from the
     machine's own centre with the SAME `tossUp`/`tossSpread` tunables the
     drop verb reads (Phase 1/2a), not a sixth independently-chosen toss
     magnitude. Exactly one unit of the machine's OWN substance x `rig` pair
     -- see `placeMachine`'s own spend, this is its exact inverse. */
  const cx = m.box.x + m.box.w / 2, cy = m.box.y + m.box.h / 2;
  const up = eff('tossUp'), spread = eff('tossSpread');
  const heldSub = machineHeldSub(def.id);
  if (heldSub !== undefined)
    iw.spawn(band, cx, cy, heldSub, F.rig, (rand() - 0.5) * 2 * spread, -up);

  mw.remove(m);
  /* Reuses the 'place' journal kind: `shell/notify.js`'s TEXT handler already
     renders `{machine}` as "<NAME> PLACED", the wrong verb for a removal but
     the closest shape already wired -- `shell/notify.js`/`data/sfx.js` (the
     only files that could add a dedicated 'deconstruct' kind and its text)
     are outside this phase's FILE OWNERSHIP, the identical constraint
     Phase 2a's drop verb hit for the same reason. See `docs/FINDINGS.md`. */
  push('place', { x: m.box.x, y: m.box.y }, { machine: def.id });
  return true;
}

/* ---------- tiles ----------
   Only a form carrying a `tile` block may be placed as terrain -- `log`,
   `rung`, `stair` and now `gravel` -- so building a ladder and felling a
   tree are the same two nouns in different places. There is no ladder id,
   no ladder recipe and no ladder code. See `data/forms.js`. */

/* Every `{sub, form}` pair in the pockets that could be PLACED -- a
   tile-capable form (terrain: `log`, `rung`, `stair`, `gravel`) OR a
   machine's own `rig` pair (a structure: `rules/placement.js#placeMachine`)
   -- in HUD order. `shell/main.js#applyIntents`'s `cmd.place` branch places
   the first of these, dispatching to `placeTile` or `placeMachine`
   depending on which kind it is; a real build menu would offer the list. */
export function placeableFromPockets(rows) {
  return rows.filter(r => r.n > 0 && (FORM[r.form]?.tile || r.form === F.rig));
}

export function placeTile(band, tx, ty, sub, form) {
  const at = { x: worldX(band, tx), y: worldY(band, ty) };
  const no = why => { push('refused', at, { sub, form, why }); return false; };

  if (!FORM[form]?.tile) return no('THAT DOES NOT BUILD');
  if (!inBounds(band, tx, ty)) return no('NOT THERE');
  if (tileAt(band, tx, ty) !== AIR) return no('SOMETHING IS ALREADY THERE');
  if (invCount(sub, form) < 1) return no('NOTHING TO BUILD WITH');

  /* A ladder needs something to hang from: rock beside or above it, or another
     climbable tile to join. THE ONE BELOW COUNTS TOO — that is the direction you
     build when climbing out of your own shaft, and without it the last two rungs
     cannot be placed and the shaft becomes a grave. */
  const backed = solidAt(band, tx - 1, ty) || solidAt(band, tx + 1, ty)
              || solidAt(band, tx, ty - 1)
              || climbAt(band, tx, ty - 1) || climbAt(band, tx, ty + 1);
  if (!backed) return no('IT NEEDS SOMETHING TO HANG FROM');

  if (!rw.spend(sub, form, 1)) return no('NOTHING TO BUILD WITH');
  tw.set(band, tx, ty, sub, form);
  push('place', at, { sub, form });
  return true;
}

/* Mining a placed tile gives it back — `model/tiles.js#dropOf` returns the pair
   itself for any non-NATIVE form. So a ladder is recoverable, and nothing here
   or in `rules/mining.js` had to say so. `NATIVE` is imported to make that
   asymmetry visible at the one place placement happens. */
export const isPlaced = form => form !== NATIVE;
