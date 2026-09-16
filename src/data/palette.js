/* LAYER data — the named colours CONTENT ROWS are allowed to use. Imports
   `core` only.

   Add art-direction ALIASES here, not new hex -- hex belongs in `core`. */

import { P } from '../core/palette.js';

export const COL = Object.freeze({ ...P });

export const hasColour = name => Object.prototype.hasOwnProperty.call(COL, name);

/* Resolve a name to hex. Throws rather than returning a plausible black,
   because a missing colour is a content bug and should be loud. */
export const colour = name => {
  if (!hasColour(name)) throw new Error(`palette: no colour "${name}"`);
  return COL[name];
};
