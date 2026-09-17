/* model layer — named scalar fields per tile, with an active set. Imports
   `model`.

   One `Float32Array` per named field per band, sized from the band row, plus a
   Set of cell indices worth visiting; `rules/fields.js` walks only that set.

   Writes here do not bump the chunk paint version: a chunk canvas caches
   static rock, and fields draw as a live viewport-culled overlay. */

import { bump } from './epoch.js';
import { idx, inBounds } from './world.js';

/* Shared so a band with no such field does not allocate a Set per query. */
const EMPTY = new Set();

export const write = {
  /* Called once per band from `shell/boot.js` with the band row's `fields`
     list; a name absent from it has no field, which `hasField` reports. */
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

  /* Index-form writes, for the decay loop, which already holds `i`. */
  set(b, name, i, v)      { b.fields[name].v[i] = v; bump(); },
  activate(b, name, i)    { b.fields[name].act.add(i); bump(); },
  deactivate(b, name, i)  { b.fields[name].act.delete(i); bump(); },

  clear(b, name) {
    const f = b.fields[name];
    if (!f) return;
    f.v.fill(0); f.act.clear();
    bump();
  }
};

export function fieldAt(b, name, tx, ty) {
  const f = b?.fields[name];
  if (!f || !inBounds(b, tx, ty)) return 0;
  return f.v[idx(b, tx, ty)];
}

export const hasField = (b, name) => !!b?.fields[name];
export const activeOf = (b, name) => b.fields[name]?.act ?? EMPTY;
export const valuesOf = (b, name) => b.fields[name]?.v ?? null;
