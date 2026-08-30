/* ============================================================
   MINING PROGRESS — seconds of pick time, as a float, per active tile.

   A Map, not an array: at any moment two or three tiles are being mined, so
   a Float32Array over the whole band would be ~196 KB resident to hold three
   single-digit numbers.

   The unit is SECONDS and it is compared against a substance's `hard`, which
   is also seconds. There is no scale factor and no integer store, so a
   material takes exactly its stated time at any framerate.
   ============================================================ */

import { bump } from './epoch.js';

export const dig = { work: new Map() };     // tileIndex -> seconds applied

export const workAt = i => dig.work.get(i) ?? 0;
export const progressAt = (i, hard) => Math.min(1, workAt(i) / hard);
export const active = () => dig.work;

export const write = {
  add(i, secs) {
    const n = workAt(i) + secs;
    dig.work.set(i, n);
    bump();
    return n;
  },
  clear(i) { dig.work.delete(i); bump(); },
  clearAll() { dig.work.clear(); bump(); }
};
