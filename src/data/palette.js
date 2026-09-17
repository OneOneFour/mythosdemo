/* data layer — the named colours content rows may use.
   Aliases belong here; new hex belongs in `core`. */

import { P } from '../core/palette.js';

export const COL = Object.freeze({ ...P });

export const hasColour = name => Object.prototype.hasOwnProperty.call(COL, name);

/* Resolve a name to hex. Throws on an unknown name. */
export const colour = name => {
  if (!hasColour(name)) throw new Error(`palette: no colour "${name}"`);
  return COL[name];
};
