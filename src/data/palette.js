/* LAYER data — the named colours that CONTENT ROWS are allowed to use.
   Imports `core` only. May be imported by `data`, `model`, `rules`, `view`.

   Why this exists separately from `core/palette.js`'s hex table:
   docs/DEVELOPER_GUIDE.md#colour-and-appearance

   Add art-direction aliases here, not new hex — hex belongs in `core`. */

import { P } from '../core/palette.js';

export const COL = Object.freeze({ ...P });

export const hasColour = name => Object.prototype.hasOwnProperty.call(COL, name);

/* Resolve a name to hex. Throws rather than returning a plausible black,
   because a missing colour is a content bug and should be loud. */
export const colour = name => {
  if (!hasColour(name)) throw new Error(`palette: no colour "${name}"`);
  return COL[name];
};
