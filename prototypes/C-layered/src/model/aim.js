/* LAYER model — where the pick is pointed.

   In `model` rather than in `rules/mining.js` for exactly one reason: the HUD
   draws the aim reticle, and `view` may not import `rules`. This is RFC 04's
   sibling rule doing its job and also RFC 04's weakness 2 being paid: a
   transient that morally belongs to the mining rule becomes a piece of model
   state with a `newRun()` reset obligation. Three lines of state, and the
   alternative was the renderer importing gameplay, which is the coupling this
   whole design exists to prevent. */

import { bump } from './epoch.js';

export const aim = { tx: 0, ty: 0, valid: false, mode: 'dig' };

export const write = {
  set(tx, ty, valid) { aim.tx = tx; aim.ty = ty; aim.valid = valid; bump(); },
  mode(mode) { aim.mode = mode; bump(); },
  reset() { aim.tx = 0; aim.ty = 0; aim.valid = false; aim.mode = 'dig'; bump(); }
};
