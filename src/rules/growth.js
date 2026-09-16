/* LAYER rules — GROWTH: a planted seed becoming a tree. Imports `core`,
   `data`, `model`, and no other `rules` module.

   THE ONLY THING IN THE GAME THAT CHANGES ON ITS OWN, so the two things it
   must not touch are worth naming before the code.

   TIME COMES FROM `dt`, NEVER FROM A WALL CLOCK, so a seed takes its stated
   `eff('treeGrowSecs')` of SIMULATION time at 20 fps and at 240 fps alike.
   An ACCUMULATOR PER SEED, not a comparison against `run.t`, is what makes
   the transition independent of when the seed was planted.

   HEIGHT COMES FROM `hash2`, NEVER FROM `rand()`. A trunk's height must be a
   function of WHERE the seed was planted and nothing else; `rand()` is a
   stream, so the same tile planted after a different number of draws would
   resolve to a different height.

   IT DOES NOT DRAW, DOES NOT TOUCH THE CANOPY OR THE CHUNK CACHE, DOES NOT
   PUSH A JOURNAL ROW, AND DOES NOT REGROW A TREE NOBODY PLANTED. A grown
   trunk is written as NATIVE tiles through the identical call worldgen makes,
   so the crown grows on the next repaint with no code here. */

import { hash2 } from '../core/rng.js';
import { NATIVE } from '../data/forms.js';
import { BANDS } from '../data/world.js';
import { planted, write as gw } from '../model/growth.js';
import { eff } from '../model/mods.js';
import { formAt, subAt, write as tw } from '../model/tiles.js';
import { bandByOrd } from '../model/world.js';

/* THE HEIGHT RANGE IS READ OFF THE WORLDGEN ROW, NOT RE-LITERALLED, so a
   planted tree is the same size as a wild one by construction. Found once at
   import, because `BANDS` is frozen content. Whether a CULTIVATED tree should
   differ is a real design question and is deferred; the answer would be a key
   on a content row, not a number here. */
const TREE_HEIGHT = (() => {
  for (const cfg of BANDS)
    for (const row of cfg.strata || [])
      if (row.kind === 'trees' && Array.isArray(row.height)) return row.height;
  /* No `trees` row anywhere in the world is a legal content state (a band set
     with no surface), and a planted seed would then have no declared height
     to grow to. One tile is the honest minimum: a seed that resolved into
     nothing at all would leave the player holding an item that does nothing,
     with no way to find out why. */
  return [1, 1];
})();

/* HOW TALL THIS PARTICULAR TILE'S TREE IS. `hash2` returns [0, 1) for a
   coordinate pair, so this is an integer in `[lo, hi]` depending on the tile
   and nothing else. The band ordinal is folded in, so the same `(tx, ty)` in
   two bands is not forced to the same height.

   MULTIPLY-AND-FLOOR rather than a modulo of the raw word, matching `randInt`
   and every other `hash2` reader, and `| 0` can never reach `hi - lo + 1`. */
function heightAt(b, tx, ty) {
  const [lo, hi] = TREE_HEIGHT;
  if (!(hi >= lo)) return Math.max(1, lo | 0);
  return lo + ((hash2(tx * 31 + b.ord * 7919, ty * 17 + 3) * (hi - lo + 1)) | 0);
}

/* A SEED BECOMES A TREE IN ONE WRITE PER TILE, the identical call worldgen
   makes -- so a grown tree is the same BYTES and every downstream reader sees
   no difference at all. The seed's OWN tile becomes the base, which is what
   makes the tree stand where the player put it, and UPWARD is the only
   direction that cannot bury them.

   Off the top of the band is not a special case: `write.set` refuses it, so a
   seed two rows below row 0 yields a two-tile tree. THE SUBSTANCE IS THE
   SEED'S OWN, so a second organic element grows into its own kind of tree. */
function resolve(b, tx, ty, sub) {
  const h = heightAt(b, tx, ty);
  for (let k = 0; k < h; k++) tw.set(b, tx, ty - k, sub, NATIVE);
}

export function step(dt) {
  const total = eff('treeGrowSecs');
  /* A zero, negative or non-finite grow time would resolve every seed on the
     substep it was planted -- which is not a growth mechanic, and is a state
     a trinket with a pathological `mul` could reach. Refusing to grow at all
     is the safer failure: the seed stays in the ground and stays diggable. */
  if (!(total > 0) || !Number.isFinite(total)) return;

  const grown = planted();
  if (grown.size === 0) return;                 // the overwhelmingly common case

  /* Walked as the map's own entries rather than per band, because the record
     carries its band ordinal (`model/growth.js` states why) -- so this is one
     pass over the handful of live seeds instead of one pass per band over all
     of them. Deleting the current entry mid-iteration is safe on a `Map` and
     is what both branches below do, directly or through `tw.set`. */
  for (const e of grown.values()) {
    /* A MISSING BAND IS NOT RECOVERABLE FROM HERE and is SKIPPED rather than
       cleared: `write.clear` needs the band record itself to rebuild the key.
       It is also unreachable in a correct build, since the only thing that
       destroys a band record clears this ledger in the same teardown. */
    const b = bandByOrd(e.ord);
    if (!b) continue;

    /* IS THE SEED STILL THERE? Defensive rather than required, since
       `model/tiles.js#write.setByte` clears an entry the moment the byte at
       that coordinate stops declaring `tile.roots` -- so a seedling mined
       back out, or swallowed by the `chasm` miracle, has already left this
       map before this step runs. It is kept because the cost is two reads on
       a single-digit set and the failure it guards against is a seed
       accumulating time forever against a tile that is now solid rock, which
       nothing else in the game would report. */
    const sub = subAt(b, e.tx, e.ty);
    if (sub < 0 || formAt(b, e.tx, e.ty) === NATIVE) { gw.clear(b, e.tx, e.ty); continue; }

    if (gw.add(b, e.tx, e.ty, dt) < total) continue;

    /* `resolve` writes the seed's own tile first, and that write goes through
       `setByte` -> `groww.clear`, so the entry is already gone by the time
       the explicit clear below runs. The clear is kept anyway: this step must
       not depend on a `model` hook to finish its own job, and a no-op delete
       costs a `Map.delete` on a key that is not there. */
    resolve(b, e.tx, e.ty, sub);
    gw.clear(b, e.tx, e.ty);
  }
}
