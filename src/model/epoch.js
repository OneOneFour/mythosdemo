/* LAYER model — the mutation epoch. Imports nothing.
   May be imported by `model`, `rules`, `view`; only `model` should call `bump`.

   Every `write.*` in every `model` module calls `bump()`. A check tool
   snapshots `epoch.n`, calls `render()`, and fails if it moved. That is the
   DYNAMIC half of "view may not mutate model"; the static half is
   `tools/layers.mjs` refusing an illegal import edge.

   Honest limit: this proves nothing about a typed array written through a
   reference that a query handed out. It covers writes that go through `write.*`
   -- which is all of them by convention and none of them by proof. Two partial
   nets where a type system would give one guarantee. */

export const epoch = { n: 0 };

export const bump = () => { epoch.n++; };
