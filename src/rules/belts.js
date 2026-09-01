/* LAYER rules — BELTS: fuel-powered horizontal relocation.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   A BELT IS NOT A RECIPE-DRIVEN MACHINE THE WAY `furnace`/`press` ARE. Those
   turn inputs into outputs; a belt turns a POSITION into a later position,
   with no substance or form change anywhere in between. `rules/machines.js`'s
   generic interpreter has no `out` clause shaped like "keep whatever this
   already was, moving sideways at whatever height it already had" — and it
   should not grow one for a single mechanic. So this file exists instead of a
   new interpreter key. See
   docs/DEVELOPER_GUIDE.md#when-a-machine-needs-its-own-rules-module

   THE MECHANISM IS `rules/drive.js#haul()` WITH ONE AXIS TAKEN AWAY. Machines
   are not solid — `model/tiles.js#solidAt` is the only thing item collision
   consults, and a machine's footprint is a `model/machines.js` record, not a
   terrain tile (ARCHITECTURE invariant 1) — so an item resting inside a belt's
   footprint is resting on the actual floor beneath it, at exactly the height
   `haul()` grabs a resting item off a carrier at. Where `haul` does
   `it.x += dx; it.y += dy` along a cable, this does `it.x += dx` alone while a
   belt is charged: same shape, same idiom, flattened. (Both descend from the
   retired staged winch's `carry()`, which is where the idiom was written and
   which this comment used to name.)

   POWER IS A BANKED CHARGE, AND THIS IS NOW THE ONLY MOVER THAT USES ONE
   (docs/DEVELOPER_GUIDE.md#charges-and-honest-fuel). This file only ever
   SPENDS a charge, exactly one per item it actually delivers off the belt's
   end, and it cannot tell a charge bought with timber from one bought with
   anything else. Vertical transport used to work the same way and no longer
   does: `rules/drive.js` has no charge at all, only a crank the player is
   holding. Whether a belt should take drivetrain torque instead is
   docs/PLAN-gears-and-winches.md section 6.6, named and deliberately not
   built.

   DELIBERATELY RARE. `docs/DESIGN.md`'s genre statement names flat, cheap
   horizontal logistics as the thing this project is not — so a belt is priced
   in plate, not raw ore, and gated on running fuel besides. Nothing here
   softens that; this file only ever moves what a lit, fed belt is entitled to
   move. */

import { defOf, machines, write as mw } from '../model/machines.js';
import { itemsIn, write as iw } from '../model/items.js';
import { eff } from '../model/mods.js';

/* Vertical slack, in px, around the floor line a resting item settles at —
   the belt's box is exactly one tile tall standing on solid ground, so a
   resting item's centre sits within a couple of pixels of the box's own
   bottom edge. Mirrors `model/segments.js#CARRIER_GRAB`'s slack idiom, sized to
   straddle every item's half-size (up to 2 px) plus a little settling slop. */
const GRAB = 4;

const groundBox = m => ({
  x: m.box.x, y: m.box.y + m.box.h - GRAB, w: m.box.w, h: GRAB * 2
});

export function step(dt) {
  for (const m of machines) {
    const def = defOf(m);
    if (def.belt && m.charges > 0) drag(m, def, dt);
  }
}

/* Drag every RESTING item within the belt's footprint toward its declared
   direction. An item mid-fall (`it.rest === 0`) is not this file's business —
   it is still `rules/items.js`'s, exactly as it would be over open air, which
   is what lets a belt sit directly under a vein without swallowing the drop
   before it has even landed. */
function drag(m, def, dt) {
  const dir = def.belt.dir;
  const dx = dir * eff('beltSpeed') * dt;
  const edge = dir > 0 ? m.box.x + m.box.w : m.box.x;

  let moved = false;
  for (const it of itemsIn(groundBox(m))) {
    if (it.rest <= 0) continue;

    it.x += dx;
    moved = true;
    const reached = dir > 0 ? it.x >= edge : it.x <= edge;
    if (!reached) continue;

    it.x = edge;
    /* Backpressure, not a bug (see CLAUDE.md on the item cap): no charge left
       THIS frame to pay for delivery, so the item piles at the lip instead of
       resuming its fall. Whatever fuel arrives next frame moves it again. */
    if (m.charges <= 0) continue;

    it.vx = 0;
    it.rest = 0;                 // resumes falling off the end, same as any
                                  // other item whose support just went away
    mw.spendCharge(m, 1);
  }

  /* Re-index NOW, not only at the end of `rules/items.js#step` (which already
     ran this frame, before this file moved anything). This is the whole of
     why `shell/schedule.js` places `belts` before `machines`: an item just
     dragged into a neighbouring machine's mouth has to be found by THAT
     machine's catch box this same frame, and a catch box queries the grid
     `rules/items.js` last rebuilt — stale by exactly the distance this
     function just moved things, without this call. */
  if (moved) iw.reindex();
}
