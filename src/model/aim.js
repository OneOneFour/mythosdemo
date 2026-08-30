/* LAYER model — where the pick is pointed.
   Imports `model` only. May be imported by `model`, `rules`, `view`.

   In `model` rather than in `rules/mining.js` for exactly one reason: the HUD
   draws the aim reticle, and `view` may not import `rules`. This is the sibling
   rule doing its job, and it is also the sibling rule's cost being paid -- a
   transient that morally belongs to the mining rule becomes model state with a
   `newRun()` reset obligation. Five fields of state, and the alternative was the
   renderer importing gameplay, which is the coupling the whole design exists to
   prevent.

   `band` is here because a reticle at a band seam must know which band's tile it
   is pointing at; the same tile coordinates mean different things in two bands. */

import { bump } from './epoch.js';

export const aim = { band: null, tx: 0, ty: 0, valid: false, mode: 'dig' };

export const write = {
  set(band, tx, ty, valid) {
    aim.band = band; aim.tx = tx; aim.ty = ty; aim.valid = valid;
    bump();
  },

  /* 'dig' | 'place'. What the mode MEANS is a `rules` decision; that it has one
     is model state, because the reticle is drawn differently for each. */
  mode(mode) { aim.mode = mode; bump(); },

  reset() {
    aim.band = null; aim.tx = 0; aim.ty = 0; aim.valid = false; aim.mode = 'dig';
    bump();
  }
};
