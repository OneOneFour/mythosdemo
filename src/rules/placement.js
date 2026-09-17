/* rules layer — putting a machine or a tile into the world. Footprint size and
   `footing` are read off the `data/machines.js` row; `run.granted` holds the
   machine ids that may be placed at all.

   The yes/no itself is `model/run.js#placementCheck`, so `view`'s ghost
   preview shares it without importing `rules`. This file turns a refusal into
   a journal row carrying its reason, and an approval into the mutation plus
   exactly one unit spent. */

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

/* `tx`/`ty` is the top-left tile of the footprint. Returns the machine record,
   or null with a reason on the journal. */
export function placeMachine(band, machineId, tx, ty) {
  const at = { x: worldX(band, tx), y: worldY(band, ty) };
  const no = why => { push('refused', at, { machine: machineId, why }); return null; };

  const check = placementCheck(band, machineId, tx, ty);
  if (!check.ok) return no(check.why);

  const defIdx = M[machineId];
  const m = mw.place(band, defIdx, tx, ty);
  /* Spent after `mw.place`: `placementCheck` has already proved the item is
     held, so this runs only once the placement is guaranteed. One unit of the
     machine's own substance x `rig` pair, never a material bill. */
  rw.spend(machineHeldSub(machineId), F.rig, 1);
  push('place', { x: m.box.x, y: m.box.y }, { machine: machineId, def: defIdx });
  return m;
}

/* The inverse of `placeMachine`: returns exactly one unit of the machine's own
   `<id>/rig` pair, and refuses unless it is empty. Empty is `m.buf` with no
   keys and `m.charges === 0`; `m.made` is a lifetime counter and `m.prog`
   cannot be nonzero with an empty buffer. */
export function deconstruct(band, tx, ty) {
  const at = { x: worldX(band, tx), y: worldY(band, ty) };
  const no = (why, machineId) => { push('refused', at, { machine: machineId, why }); return false; };

  const m = machineAt(band, tx, ty);
  if (!m) return no('NOTHING TO DECONSTRUCT');

  const def = MACH[m.def];
  if (Object.keys(m.buf).length > 0 || m.charges > 0)
    return no('EMPTY IT FIRST', def.id);

  /* The refund is a falling item, not a pocket credit, tossed from the
     machine's centre by the same `tossUp`/`tossSpread` the drop verb reads. */
  const cx = m.box.x + m.box.w / 2, cy = m.box.y + m.box.h / 2;
  const up = eff('tossUp'), spread = eff('tossSpread');
  const heldSub = machineHeldSub(def.id);
  if (heldSub !== undefined)
    iw.spawn(band, cx, cy, heldSub, F.rig, (rand() - 0.5) * 2 * spread, -up);

  /* A segment holds both hub records, so every query over it reads a ghost the
     instant one hub leaves `machines`. Must run before `mw.remove`. A rider
     aboard a cut segment falls, and that is not refused or reported. */
  segw.unlinkAll(m);

  mw.remove(m);
  push('place', { x: m.box.x, y: m.box.y }, { machine: def.id });
  return true;
}

/* `model/segments.js#linkCheck` holds the yes/no, so `view`'s cable ghost
   shares it. The cable itself costs nothing, so there is nothing to spend. */
export function linkSegment(a, b) {
  const at = a ? { x: a.box.x + a.box.w / 2, y: a.box.y + a.box.h / 2 } : null;
  const check = linkCheck(a, b);
  if (!check.ok) {
    /* `check.at` is the first blocked sample along the span when there is one,
       and falls back to the armed hub for a refusal that names no place. */
    push('refused', check.at || at, { why: check.why });
    return null;
  }

  const seg = segw.link(a, b);
  /* Neither `data/sfx.js` nor `shell/notify.js#TEXT` maps the 'link' kind, so
     it is silent by design rather than broken. */
  push('link', { x: seg.ax, y: seg.ay }, { len: Math.round(seg.len) });
  return seg;
}

/* Cut a cable. The 'unlink' kind is unmapped in `shell/notify.js` the same way
   'link' is, and the message travels as data on the row. */
export function unlinkSegment(seg) {
  if (!seg) return false;
  segw.unlink(seg);
  push('unlink', { x: seg.ax, y: seg.ay }, { why: 'THE CABLE IS CUT' });
  return true;
}

/* Every pocketed `{sub, form}` that can be placed — a form carrying a `tile`
   block, or a machine's own `rig` pair — in HUD order.
   `shell/main.js#applyIntents` places the first and dispatches on which kind
   it is. */
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

  /* Backing: rock beside or above, or a climbable tile above or below. The one
     below counts, or the last two rungs out of a shaft could not be placed. A
     `tile.roots` form adds a fifth satisfier, a solid tile directly below. */
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

/* `model/tiles.js#dropOf` returns the pair itself for any non-`NATIVE` form,
   so mining a placed tile gives that tile back. */
export const isPlaced = form => form !== NATIVE;
