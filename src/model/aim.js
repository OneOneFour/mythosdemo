/* model layer — where the pick is pointed.

   `band` is part of the aim because the same tile coordinates mean different
   things in two bands, and the reticle may sit on a seam. */

import { bump } from './epoch.js';

export const aim = { band: null, tx: 0, ty: 0, valid: false, mode: 'dig' };

export const write = {
  set(band, tx, ty, valid) {
    aim.band = band; aim.tx = tx; aim.ty = ty; aim.valid = valid;
    bump();
  },

  /* 'dig' | 'place'. The reticle is drawn differently for each. */
  mode(mode) { aim.mode = mode; bump(); },

  reset() {
    aim.band = null; aim.tx = 0; aim.ty = 0; aim.valid = false; aim.mode = 'dig';
    bump();
  }
};
