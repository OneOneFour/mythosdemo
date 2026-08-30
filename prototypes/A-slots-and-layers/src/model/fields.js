/* ============================================================
   FIELDS — the heat seam (DESIGN items 5, 6, 11, 15).

   One Float32Array per named field, sized from the band, plus an ACTIVE SET:
   an Int32Array ring of cell indices and a Uint8Array membership mask, so
   push and dedup are O(1) and an idle region costs literally nothing.

   Which fields a band has is a row in data/bands.js, not a constant.

   Deliberately does NOT reuse the chunk-dirty machinery: a chunk repaint is
   thousands of fill calls and a flowing field changes every frame, so fields
   draw as a viewport-culled overlay in view/overlays.js over the cached blit.

   NO DIFFUSION HERE, on purpose (out of scope for this skeleton). The seam is
   `add`, `drain`, `at` and `active`; the solver is rules/fields.js.
   ============================================================ */

import { bump } from './epoch.js';

export const write = {
  allocate(b) {
    for (const name of b.fieldNames) {
      const n = b.tw * b.th;
      b.fields[name] = {
        v: new Float32Array(n),
        ring: new Int32Array(n), mask: new Uint8Array(n), head: 0, len: 0
      };
    }
    bump();
  },

  add(b, name, tx, ty, amount) {
    const f = b.fields[name];
    if (!f) return;                       // a band without this field ignores it
    const i = ty * b.tw + tx;
    f.v[i] += amount;
    write.wake(f, i);
    bump();
  },

  drain(b, name, tx, ty, amount) {
    const f = b.fields[name];
    if (!f) return 0;
    const i = ty * b.tw + tx;
    const got = Math.min(f.v[i], amount);
    f.v[i] -= got;
    write.wake(f, i);
    bump();
    return got;
  },

  wake(f, i) {
    if (f.mask[i]) return;
    f.mask[i] = 1;
    f.ring[(f.head + f.len++) % f.ring.length] = i;
  }
};

export const at = (b, name, tx, ty) => {
  const f = b.fields[name];
  if (!f) return 0;
  if (tx < 0 || tx >= b.tw || ty < 0 || ty >= b.th) return 0;
  return f.v[ty * b.tw + tx];
};

export const active = (b, name) => b.fields[name] ?? null;
