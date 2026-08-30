/* ============================================================
   THE MUTATION EPOCH.

   Every `write.*` in every model module calls bump(). Nothing else does.

   tools/epoch.mjs reads the counter, runs one full render, and reads it
   again: if it moved, `render()` mutated the model and the build fails.
   Together with "painting reads hash2, never rand()" this makes the
   renderer provably swappable — the property that convention alone failed
   to hold in src/, where view/paint.js:127 string-compares a material id
   because the renderer is allowed to import the gameplay table.

   Honest limit: this catches writes that go through `write.*`. It cannot
   catch a typed array written through a reference a query handed out. See
   README, "What fought me".
   ============================================================ */

export const meta = { epoch: 0 };

export const bump = () => { meta.epoch++; };
