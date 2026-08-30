/* LAYER data — the named colours that CONTENT ROWS are allowed to use.
   Imports `core` only. May be imported by `data`, `model`, `rules`, `view`.

   Why this file exists when `core/palette.js` already holds the hex: a `look`
   block anywhere in `data/` names a colour as a STRING. `tools/resolve.mjs`
   fails the build on a key that is not in `COL`, so a typo'd colour is a build
   error and not a black tile at depth 300. Keeping the checked name-set separate
   from the hex means `core` stays a table and this stays a contract.

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
