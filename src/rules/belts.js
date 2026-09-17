/* rules layer — belts drag resting items along their declared axis, spending one
   banked charge per item delivered off the end. Position only — no substance or
   form change. */

import { defOf, machines, write as mw } from '../model/machines.js';
import { itemsIn, write as iw } from '../model/items.js';
import { eff } from '../model/mods.js';

/* Vertical slack in px around the floor line a resting item settles at, sized
   to straddle every item's half-size (up to 2 px) plus settling slop. */
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

/* Drag every resting item in the belt's footprint toward `def.belt.dir`. An
   item mid-fall (`it.rest === 0`) stays `rules/items.js`'s. */
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
    /* No charge left to pay for delivery: the item piles at the lip rather
       than resuming its fall, and moves again once fuel arrives. */
    if (m.charges <= 0) continue;

    it.vx = 0;
    it.rest = 0;
    mw.spendCharge(m, 1);
  }

  /* `rules/items.js#step` already rebuilt the item grid this substep, before
     anything moved here, and a machine catch box queries that grid. Re-index
     so an item dragged into a mouth is found on this same substep. */
  if (moved) iw.reindex();
}
