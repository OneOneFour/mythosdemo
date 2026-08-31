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

   A GRANTED MACHINE MAY STILL COST SOMETHING TO BUILD. `data/machines.js`'s
   `cost` key is an optional bill of exact `sub/form` pairs, checked with
   `model/run.js#canAfford` after every other refusal and spent with `rw.spend`
   only once every other check -- including affordability -- has already
   passed, so a refused placement never touches the pockets. */

import { AIR, FORM, NATIVE } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { SPAWN_BAND } from '../data/world.js';
import { push } from '../model/journal.js';
import { machineAt, write as mw } from '../model/machines.js';
import { parseKey } from '../model/items.js';
import { canAfford, canPlace, invCount, write as rw } from '../model/run.js';
import { climbAt, solidAt, tileAt, write as tw } from '../model/tiles.js';
import { bandOf, inBounds, worldX, worldY } from '../model/world.js';

/* ---------- machines ---------- */

/* `tx`/`ty` is the top-left tile of the footprint. Returns the machine record,
   or null with a reason on the journal. */
export function placeMachine(band, machineId, tx, ty) {
  const defIdx = M[machineId];
  const def = MACH[defIdx];
  const at = { x: worldX(band, tx), y: worldY(band, ty) };
  const no = why => { push('refused', at, { machine: machineId, why }); return null; };

  if (def === undefined) return no('NO SUCH MACHINE');
  if (!canPlace(machineId)) return no('THE GODS HAVE NOT GRANTED IT');

  for (let j = 0; j < def.th; j++)
    for (let i = 0; i < def.tw; i++) {
      if (!inBounds(band, tx + i, ty + j)) return no('NOT THERE');
      if (tileAt(band, tx + i, ty + j) !== AIR) return no('NEEDS CLEAR SPACE');
      if (machineAt(band, tx + i, ty + j)) return no('SOMETHING IS ALREADY THERE');
    }

  let footing = 0;
  for (let i = 0; i < def.tw; i++) if (solidAt(band, tx + i, ty + def.th)) footing++;
  if (footing < def.footing) return no('NEEDS A FLOOR');

  /* DEPTH GATE (Phase 2c, `minDepth`): tiles below the SPAWN band's own floor
     line -- `view/hud.js`'s depth gauge reads the identical datum, so "the
     HUD says you are 40m down" and "this machine will place here" can never
     disagree about what depth means. Measured against WHERE IT IS BEING
     PLACED, not the player's own depth, so a machine hauled to the surface
     cannot borrow legality from a shaft the player is merely standing in. */
  if (def.minDepth) {
    const ref = bandOf(SPAWN_BAND);
    const datum = worldY(ref, ref.cfg.floorTy ?? 0);
    const depth = (at.y - datum) / ref.tile;
    if (depth < def.minDepth) return no('TOO SHALLOW');
  }

  if (def.cost && !canAfford(def.cost)) return no('CANNOT AFFORD IT');

  const m = mw.place(band, defIdx, tx, ty);
  /* Spent AFTER `mw.place`, not before: every check above -- including
     affordability -- has already passed by this line, so this can only ever
     run once the placement itself is guaranteed to succeed. */
  if (def.cost) for (const k in def.cost) {
    const { sub, form } = parseKey(k);
    rw.spend(sub, form, def.cost[k]);
  }
  push('place', { x: m.box.x, y: m.box.y }, { machine: machineId, def: defIdx });
  return m;
}

/* ---------- tiles ----------
   Only a form carrying a `tile` block may be placed, which today is exactly
   `log` — so building a ladder and felling a tree are the same two nouns in
   different places. There is no ladder id, no ladder recipe and no ladder code.
   See `data/forms.js`. */

/* Every `{sub, form}` pair in the pockets that could become a tile, in HUD
   order. `shell/input.js` places the first of these; a build menu would offer
   the list. */
export function placeableFromPockets(rows) {
  return rows.filter(r => r.n > 0 && FORM[r.form]?.tile);
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
