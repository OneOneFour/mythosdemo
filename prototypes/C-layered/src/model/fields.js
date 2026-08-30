/* LAYER model — named scalar fields per tile, with an active set.

   The heat seam, and the water seam behind it. One `Float32Array` per named
   field per band, sized from the band row, plus a set of cell indices worth
   visiting. `rules/fields.js` walks only the active set.

   DELIBERATELY NOT IMPLEMENTED: diffusion. The brief says show the seam and do
   not implement the solver, so `rules/fields.js` decays and re-activates
   neighbours and does no transport. DESIGN item 5 (buoyant heat) is an upward
   bias inside that one loop.

   It also deliberately does NOT bump `b.ver`, the chunk paint version. Those
   chunk canvases cache static rock; a flood front would invalidate them every
   frame and thrash the repaint. Fields draw as a viewport-culled overlay in
   `view/overlays.js` instead. */

import { bump } from './epoch.js';
import { idx, inBounds } from './world.js';

export const write = {
  /* called once per band, from `shell/boot.js`, with the band row's `fields` */
  allocate(b, names) {
    for (const name of names)
      b.fields[name] = { v: new Float32Array(b.tw * b.th), act: new Set() };
    bump();
  },

  add(b, name, tx, ty, amount) {
    const f = b.fields[name];
    if (!f || !inBounds(b, tx, ty)) return 0;
    const i = idx(b, tx, ty);
    f.v[i] += amount;
    f.act.add(i);
    bump();
    return f.v[i];
  },

  drain(b, name, tx, ty, amount) {
    const f = b.fields[name];
    if (!f || !inBounds(b, tx, ty)) return 0;
    const i = idx(b, tx, ty);
    const got = Math.min(f.v[i], amount);
    f.v[i] -= got;
    f.act.add(i);
    bump();
    return got;
  },

  set(b, name, i, v) { b.fields[name].v[i] = v; bump(); },
  activate(b, name, i) { b.fields[name].act.add(i); bump(); },
  deactivate(b, name, i) { b.fields[name].act.delete(i); bump(); }
};

export function fieldAt(b, name, tx, ty) {
  const f = b?.fields[name];
  if (!f || !inBounds(b, tx, ty)) return 0;
  return f.v[idx(b, tx, ty)];
}

export const hasField = (b, name) => !!b?.fields[name];
export const activeOf = (b, name) => b.fields[name]?.act ?? new Set();
