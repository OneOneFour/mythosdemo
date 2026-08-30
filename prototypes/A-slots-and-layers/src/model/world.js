/* ============================================================
   WORLD ALLOCATION — no module-scope dimension constants anywhere.

   A band record owns its own arrays and its own dimensions. Bands are held
   in a Map and coexist, so a continuous descent through three acts is a
   third row in data/bands.js and one call.

   Cost, stated plainly: every tile and field query takes the band record as
   its first argument. That is one extra parameter everywhere, and it is the
   price of DESIGN item 18. RFC 04 declined to pay it and was marked AWKWARD
   for exactly that.
   ============================================================ */

import { AIR, S } from '../data/substances.js';
import { bump } from './epoch.js';

export const bands = new Map();
export const cur = { band: null };          // the resident band rules step

export const write = {
  allocate(cfg) {
    const b = {
      ...cfg,
      cx: Math.ceil(cfg.tw / cfg.chunk),
      cy: Math.ceil(cfg.th / cfg.chunk),
      mat: new Uint8Array(cfg.tw * cfg.th).fill(AIR),
      dirty: null,
      /* The row's `fields: ['heat']` is a list of NAMES; `fields` on the band
         record is the allocated storage keyed by those names. Two different
         things, so they get two different property names. */
      fieldNames: cfg.fields ?? [],
      fields: Object.create(null)
    };
    b.dirty = new Uint8Array(b.cx * b.cy).fill(1);
    bands.set(cfg.id, b);
    bump();
    return b;
  },

  activate(id) {
    const b = bands.get(id);
    if (!b) throw new Error(`band '${id}' has not been allocated`);
    cur.band = b;
    bump();
    return b;
  },

  free(id) { bands.delete(id); bump(); }
};

export const idx = (b, tx, ty) => ty * b.tw + tx;
export const inBounds = (b, tx, ty) => tx >= 0 && tx < b.tw && ty >= 0 && ty < b.th;

/* Out of bounds reads BEDROCK, not -1. Deletes every "is it -1" special case
   and makes the world edge a real material rather than a sentinel. */
export const BEDROCK = S.bedrock;
