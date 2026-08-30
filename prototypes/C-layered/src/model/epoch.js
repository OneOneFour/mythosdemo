/* LAYER model — the mutation epoch.

   Every `write.*` in every `model` module calls `bump()`. `tools/epoch.mjs`
   snapshots `meta.epoch`, calls `render()`, and fails if it moved. That is the
   dynamic half of "view may not mutate model": the static half is
   `tools/layers.mjs` refusing `view` an import named `write`.

   Honest limit, and it is the RFC's own weakness 4: this proves nothing about a
   typed array written through a reference a query handed out. It covers writes
   that go through `write.*`, which is all of them by convention and none of them
   by proof. Two partial nets where a type system would give one guarantee. */

export const meta = { epoch: 0 };

export const bump = () => { meta.epoch++; };
