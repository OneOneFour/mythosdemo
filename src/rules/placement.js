/* LAYER rules — PLACEMENT: putting a machine or a tile into the world.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   THE FOOTPRINT CHECK READS `tw`, `th` AND `footing` OFF THE ROW, so every
   machine that will ever exist is placeable and there is no `placeFurnace()`
   anywhere. The previous codebase had eighteen lines of furnace-specific
   footprint checking in a module that also reached into the player, the tile
   grid, the item list, the toast queue and the audio device. See
   docs/DEVELOPER_GUIDE.md#adding-a-machine

   WHAT MAY BE PLACED IS A RUN-STATE SET, NOT A REGISTRY EDIT. `run.granted`
   holds machine ids, seeded from `data/grants.js#STARTING_MACHINES` and
   extended by `rules/grants.js`. `data/machines.js` is a plain frozen table
   read at placement time, so granting a machine mid-run costs no architecture.

   Every refusal pushes a journal row carrying its reason. `shell/notify.js`
   turns that into text; nothing here knows what a toast is.

   A GRANTED MACHINE IS A HELD ITEM. `model/run.js#machineHeldSub` names which
   substance's `rig` pair a machine id places from; `placementCheck` checks
   `invCount(that, F.rig) > 0` after every other refusal, and exactly ONE unit
   is spent with `rw.spend` only once every other check has already passed, so
   a refused placement never touches the pockets.

   THE VALIDITY DECISION ITSELF LIVES IN `model/run.js#placementCheck`, NOT
   HERE: `view`'s ghost preview needs the identical yes/no this function
   enforces and `view` may not import `rules`. This function's own job is
   "call the query, and turn a `false` into a journal row plus the actual
   mutation" -- ONE implementation of the checks, TWO readers of the answer.
   See docs/DEVELOPER_GUIDE.md#one-decision-two-readers */

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
   banked belt/brazier charge bought but not yet used. `m.made` (a
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

  /* A REMOVED HUB CANNOT LEAVE A DANGLING SEGMENT. A segment holds the two hub
     RECORDS (`model/segments.js`'s own header on why ids would be worse), so
     the instant one of them stops being in `machines` every query over it is
     reading a ghost. Cut them here, after the empty-check above and before
     `mw.remove` below, so the order reads as "prove it is empty, pay the
     refund, cut the cables, then remove".

     A rider aboard a cut segment simply falls, and deconstruct does NOT refuse
     while one is aboard (docs/PLAN-gears-and-winches.md A6, confirmed:
     allow). Invariant 4's whole argument is that gravity is the answer, and
     docs/SPEC.md section 3's fall curve already exists to be the consequence.
     No journal row: the `'place'` row below already reports the removal, and
     "and its cables went with it" is not news about a different event. */
  segw.unlinkAll(m);

  mw.remove(m);
  push('place', { x: m.box.x, y: m.box.y }, { machine: def.id });
  return true;
}

/* ---------- segments ----------
   THE DECISION LIVES IN `model/segments.js#linkCheck`, NOT HERE, for exactly
   the reason `placeMachine` above states for `placementCheck`: `view`'s cable
   ghost needs the identical yes/no this function enforces and `view` may not
   import `rules`. This function's own job is "call the query, and turn a
   `false` into a journal row plus the actual mutation".
   See docs/DEVELOPER_GUIDE.md#one-decision-two-readers and docs/SPEC.md
   section 17.6, which locks the refusal strings and their order.

   THE CABLE IS FREE (docs/PLAN-gears-and-winches.md A7, confirmed): the hubs
   are priced and the span between them costs nothing but reach. So unlike
   `placeMachine` there is nothing to spend and no ordering question about
   when to spend it. */
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
  /* A NEW JOURNAL KIND, deliberately unmapped in `shell/notify.js` for now:
     `data/sfx.js` decides what is audible and `shell/notify.js#TEXT` decides
     what is legible, neither file is this phase's to edit, and a kind with no
     entry in either is SILENT ON PURPOSE (that file's own words) rather than
     broken. Recorded in docs/FINDINGS.md so 8e/8f wires the text and the
     sound rather than rediscovering it. */
  push('link', { x: seg.ax, y: seg.ay }, { len: Math.round(seg.len) });
  return seg;
}

/* Cut a cable. Not a refusal and not a failure -- the player asked. Same
   deliberately-unmapped journal kind as `linkSegment` above; the message
   docs/PLAN-gears-and-winches.md section 4.5 names for it travels as data so
   that whichever phase wires `shell/notify.js#TEXT` needs no second copy. */
export function unlinkSegment(seg) {
  if (!seg) return false;
  segw.unlink(seg);
  push('unlink', { x: seg.ax, y: seg.ay }, { why: 'THE CABLE IS CUT' });
  return true;
}

/* ---------- tiles ----------
   Only a form carrying a `tile` block may be placed as terrain -- `rung`,
   `stair`, `block` and, since Phase 15, `seed`. There is no ladder id, no
   ladder recipe, no ladder code -- and no PLANT verb either: planting is
   `cmd.place` on an armed `timber/seed` pair through the same unified
   placement `placeableFromPockets` below already offers, with no special
   case anywhere. `gravel` and `log` were also on that list until Phase 14a stripped
   their `tile` blocks (CLAUDE.md D12: a form is either feedstock or buildable,
   never both), which is also why NOTHING IN THIS FILE CHANGED for it -- "a
   deposit is never placeable" is a property of `data/forms.js#block`'s
   `subTags`, not a check here. See docs/DEVELOPER_GUIDE.md#adding-a-form and
   docs/SPEC.md section 19. */

/* Every `{sub, form}` pair in the pockets that could be PLACED -- a
   tile-capable form (terrain: `rung`, `stair`, `block`, `seed`) OR a
   machine's own `rig` pair (a structure: `rules/placement.js#placeMachine`)
   -- in HUD order. `shell/main.js#applyIntents`'s `cmd.place` branch places
   the first of these, dispatching to `placeTile` or `placeMachine`
   depending on which kind it is; a real build menu would offer the list.
   See docs/DEVELOPER_GUIDE.md#adding-a-form */
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
     cannot be placed and the shaft becomes a grave.

     THE FIFTH SATISFIER IS OPTED INTO BY THE FORM, NOT ADDED TO THE RULE
     (Phase 15, docs/PLAN-phase15-trees.md D15-C, docs/SPEC.md section 22).
     A `tile.roots` form is backed by A SOLID TILE DIRECTLY BELOW as well,
     because a seed dropped on open flat ground has soil beneath it and air
     on all three other sides and would otherwise be refused with
     'IT NEEDS SOMETHING TO HANG FROM' — correct for a ladder rung and
     exactly wrong for a seed.

     IT IS A KEY ON THE ROW AND NOT A SIXTH CLAUSE IN THE SHARED PREDICATE,
     and that is the whole point of the flag. `solidAt(band, tx, ty + 1)`
     added unconditionally would let a `rung` be placed standing on a floor
     with nothing beside it — a real change to how a ladder is built, in the
     one function CLAUDE.md records wedging a player in their own shaft — and
     it would let a `block` be stacked on a floor with no wall to key into.
     Gated on the form's own key, `rung`/`stair`/`block` placement is
     BIT-IDENTICAL: none of the three carries `roots`, so the added term is
     `false && ...` and short-circuits before the read. (`log` is not a
     fourth case to hold identical — Phase 14a's D14-H deleted its `tile`
     block, so the form gate above turns it away before this line.)
     `tools/check.mjs` section 8g asserts all three, including that a rung
     with only a floor under it still refuses. */
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
