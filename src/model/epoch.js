/* model layer — the mutation epoch. Only `model` calls `bump`.

   Every `write.*` in every `model` module calls `bump()`, and a check tool
   snapshots `epoch.n` across a `render()` and fails if it moved. Covers writes
   that go through `write.*`, not a typed array written through a reference a
   query handed out. */

export const epoch = { n: 0 };

export const bump = () => { epoch.n++; };
