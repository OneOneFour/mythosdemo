/* rules layer — a planted seed becoming a tree.

   Time accumulates per seed from `dt` rather than comparing against `run.t`,
   so a seed takes its `eff('treeGrowSecs')` of simulation time at any
   framerate and independently of when it was planted. Trunk height comes from
   `hash2` on the tile coordinate, never `rand()`, so it does not depend on how
   many draws preceded it.

   A grown trunk is written as native tiles through worldgen's own call, so the
   crown appears on the next chunk repaint with no drawing code here. */

import { hash2 } from '../core/rng.js';
import { NATIVE } from '../data/forms.js';
import { BANDS } from '../data/world.js';
import { planted, write as gw } from '../model/growth.js';
import { eff } from '../model/mods.js';
import { formAt, subAt, write as tw } from '../model/tiles.js';
import { bandByOrd } from '../model/world.js';

/* Height range read off the worldgen `trees` row in `data/world.js#BANDS`, so
   a planted tree matches a wild one. Resolved once at import; `BANDS` is
   frozen. */
const TREE_HEIGHT = (() => {
  for (const cfg of BANDS)
    for (const row of cfg.strata || [])
      if (row.kind === 'trees' && Array.isArray(row.height)) return row.height;
  /* No `trees` row anywhere is a legal content state — a band set with no
     surface — leaving a seed no declared height. One tile is the minimum a
     seed may resolve to. */
  return [1, 1];
})();

/* An integer in `[lo, hi]`, a function of the tile coordinate alone. The band
   ordinal is folded in so the same `(tx, ty)` in two bands can differ.
   Multiply-and-floor, as every `hash2` reader does; `| 0` never reaches
   `hi - lo + 1` because `hash2` returns [0, 1). */
function heightAt(b, tx, ty) {
  const [lo, hi] = TREE_HEIGHT;
  if (!(hi >= lo)) return Math.max(1, lo | 0);
  return lo + ((hash2(tx * 31 + b.ord * 7919, ty * 17 + 3) * (hi - lo + 1)) | 0);
}

/* Write the trunk upward from the seed's own tile, in the seed's own
   substance. Off the top of the band is not special-cased: `write.set`
   refuses those rows, so a seed two rows below row 0 yields a two-tile tree. */
function resolve(b, tx, ty, sub) {
  const h = heightAt(b, tx, ty);
  for (let k = 0; k < h; k++) tw.set(b, tx, ty - k, sub, NATIVE);
}

export function step(dt) {
  const total = eff('treeGrowSecs');
  /* A zero, negative or non-finite grow time — reachable through a trinket
     `mul` — would resolve every seed on the substep it was planted. Refusing
     to grow leaves the seed in the ground and diggable. */
  if (!(total > 0) || !Number.isFinite(total)) return;

  const grown = planted();
  if (grown.size === 0) return;

  /* One pass over the live seeds rather than per band: each record carries its
     own band ordinal. Deleting the current entry mid-iteration is safe on a
     `Map`, and both branches below do it, directly or through `tw.set`. */
  for (const e of grown.values()) {
    /* Skipped rather than cleared: `write.clear` needs the band record itself
       to rebuild the key. */
    const b = bandByOrd(e.ord);
    if (!b) continue;

    /* Defensive: `model/tiles.js#write.setByte` already clears an entry whose
       byte stops declaring `tile.roots`. Guards a seed accumulating time
       forever against a tile that is now solid rock. */
    const sub = subAt(b, e.tx, e.ty);
    if (sub < 0 || formAt(b, e.tx, e.ty) === NATIVE) { gw.clear(b, e.tx, e.ty); continue; }

    if (gw.add(b, e.tx, e.ty, dt) < total) continue;

    /* `resolve`'s first write goes through `setByte` -> the growth ledger's
       own clear, so the explicit clear below is usually a no-op. It stays so
       this step does not depend on that hook to finish its own job. */
    resolve(b, e.tx, e.ty, sub);
    gw.clear(b, e.tx, e.ty);
  }
}
