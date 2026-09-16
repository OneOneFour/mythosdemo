/* LAYER rules — PLACEMENT: putting a machine or a tile into the world.
   Imports `core`, `data`, `model`, and no other `rules` module.

   THE FOOTPRINT CHECK READS `tw`, `th` AND `footing` OFF THE ROW, so every
   machine that will ever exist is placeable and there is no `placeFurnace()`
   anywhere.

   WHAT MAY BE PLACED IS A RUN-STATE SET, NOT A REGISTRY EDIT. `run.granted`
   holds machine ids, so granting a machine mid-run costs no architecture.

   A GRANTED MACHINE IS A HELD ITEM. Exactly ONE unit is spent, and only once
   every other check has passed, so a refused placement never touches the
   pockets. Every refusal pushes a journal row carrying its reason; nothing
   here knows what a toast is.

   THE VALIDITY DECISION ITSELF LIVES IN `model/run.js#placementCheck`, because
   `view`'s ghost preview needs the identical yes/no and may not import
   `rules`. This file calls the query and turns a `false` into a journal row
   plus the mutation -- ONE implementation, TWO readers. */

import { rand } from '../core/rng.js';
import { AIR, F, FORM, NATIVE } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { push } from '../model/journal.js';
import { write as iw } from '../model/items.js';
import { machineAt, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { invCount, machineHeldSub, placementCheck, write as rw } from '../model/run.js';
import { linkCheck, write as segw } from '../model/segments.js';
import { climbAt, solidAt, tileAt, write as tw } from '../model/tiles.js';
import { inBounds, worldX, worldY } from '../model/world.js';

/* machines */

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

/* The inverse of `placeMachine`. A machine proven EMPTY gives its own
   `<id>/rig` pair back, exactly one unit: relocating a machine is "mine it
   back out as the same item you built", not "get raw materials back". One
   still holding anything refuses, with a reason, so nobody discovers ore has
   quietly vanished along with the machine holding it.

   EMPTY is `m.buf` having no keys and `m.charges === 0`, the same two fields
   `rules/machines.js` treats as holding something. `m.made` is a lifetime
   counter and `m.prog` cannot be nonzero with an empty buffer. */
export function deconstruct(band, tx, ty) {
  const at = { x: worldX(band, tx), y: worldY(band, ty) };
  const no = (why, machineId) => { push('refused', at, { machine: machineId, why }); return false; };

  const m = machineAt(band, tx, ty);
  if (!m) return no('NOTHING TO DECONSTRUCT');

  const def = MACH[m.def];
  if (Object.keys(m.buf).length > 0 || m.charges > 0)
    return no('EMPTY IT FIRST', def.id);

  /* The refund returns as a FALLING ITEM, never a pocket credit, tossed from
     the machine's centre with the SAME `tossUp`/`tossSpread` the drop verb
     reads rather than a sixth toss magnitude. Exactly one unit of the
     machine's own pair -- the exact inverse of `placeMachine`'s spend. */
  const cx = m.box.x + m.box.w / 2, cy = m.box.y + m.box.h / 2;
  const up = eff('tossUp'), spread = eff('tossSpread');
  const heldSub = machineHeldSub(def.id);
  if (heldSub !== undefined)
    iw.spawn(band, cx, cy, heldSub, F.rig, (rand() - 0.5) * 2 * spread, -up);

  /* A REMOVED HUB CANNOT LEAVE A DANGLING SEGMENT. A segment holds the two
     hub RECORDS, so the instant one leaves `machines` every query over it
     reads a ghost. Cut here, after the empty-check and before the removal, so
     the order reads "prove it is empty, pay the refund, cut the cables, then
     remove".

     A rider aboard a cut segment simply FALLS, and deconstruct does NOT
     refuse while one is aboard: gravity is the answer and the fall curve
     already exists to be the consequence. No journal row, because the removal
     row already reports the event. */
  segw.unlinkAll(m);

  mw.remove(m);
  push('place', { x: m.box.x, y: m.box.y }, { machine: def.id });
  return true;
}

/* THE DECISION LIVES IN `model/segments.js#linkCheck`, for the reason
   `placeMachine` gives about `placementCheck`: `view`'s cable ghost needs the
   identical yes/no and may not import `rules`.

   THE CABLE IS FREE -- the hubs are priced and the span costs nothing but
   reach -- so unlike `placeMachine` there is nothing to spend and no ordering
   question about when to spend it. */
export function linkSegment(a, b) {
  const at = a ? { x: a.box.x + a.box.w / 2, y: a.box.y + a.box.h / 2 } : null;
  const check = linkCheck(a, b);
  if (!check.ok) {
    /* `check.at` is the first blocked sample when there is one, so the toast
       and the chips land WHERE the problem is rather than at the hub the
       player armed. Falls back to the armed hub for a refusal with no place
       on the span to point at ('NOT A HUB', 'TOO FAR APART'). */
    push('refused', check.at || at, { why: check.why });
    return null;
  }

  const seg = segw.link(a, b);
  /* A JOURNAL KIND DELIBERATELY UNMAPPED in `shell/notify.js`: `data/sfx.js`
     decides what is audible and `notify.js#TEXT` what is legible, and a kind
     with no entry in either is SILENT ON PURPOSE rather than broken. */
  push('link', { x: seg.ax, y: seg.ay }, { len: Math.round(seg.len) });
  return seg;
}

/* Cut a cable. Not a refusal and not a failure -- the player asked. The same
   deliberately-unmapped journal kind as `linkSegment`, and the message travels
   as DATA so whichever phase wires the text needs no second copy. */
export function unlinkSegment(seg) {
  if (!seg) return false;
  segw.unlink(seg);
  push('unlink', { x: seg.ax, y: seg.ay }, { why: 'THE CABLE IS CUT' });
  return true;
}

/* Only a form carrying a `tile` block may be placed as terrain. There is no
   ladder id, no ladder recipe and no ladder code -- and no PLANT verb either:
   planting is `cmd.place` on an armed `timber/seed` pair through this same
   unified placement, with no special case anywhere.

   "A deposit is never placeable" is a property of `data/forms.js#block`'s
   `subTags` rather than a check here, which is why NOTHING IN THIS FILE
   CHANGED when `gravel` and `log` became feedstock only. */

/* Every `{sub, form}` pair in the pockets that could be PLACED -- a
   tile-capable form (terrain: `rung`, `stair`, `block`, `seed`) OR a
   machine's own `rig` pair (a structure: `rules/placement.js#placeMachine`)
   -- in HUD order. `shell/main.js#applyIntents`'s `cmd.place` branch places
   the first of these, dispatching to `placeTile` or `placeMachine`
   depending on which kind it is; a real build menu would offer the list.
*/
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
     climbable tile to join. THE ONE BELOW COUNTS TOO -- that is the direction
     you build climbing out of your own shaft, and without it the last two
     rungs cannot be placed and the shaft becomes a grave.

     THE FIFTH SATISFIER IS OPTED INTO BY THE FORM, NOT ADDED TO THE RULE: a
     `tile.roots` form is also backed by A SOLID TILE DIRECTLY BELOW. Added
     unconditionally it would let a `rung` stand on a floor with nothing beside
     it, which is a real change to how a ladder is built. Gated on the form's
     key, `rung`/`stair`/`block` placement is BIT-IDENTICAL. */
  const t = FORM[form].tile;
  const backed = solidAt(band, tx - 1, ty) || solidAt(band, tx + 1, ty)
              || solidAt(band, tx, ty - 1)
              || climbAt(band, tx, ty - 1) || climbAt(band, tx, ty + 1)
              || (t.roots === true && solidAt(band, tx, ty + 1));
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
