/* LAYER rules — GROWTH: a planted seed becoming a tree. Imports `core`,
   `data`, `model`. Imports no other `rules` module.

   THE ONLY THING IN THE GAME THAT CHANGES ON ITS OWN (Phase 15,
   docs/PLAN-phase15-trees.md D15-D, docs/SPEC.md section 22). Everything
   else in `rules` is driven by an input this frame or by material another
   step just moved; this step is driven by nothing but elapsed time, which is
   why the two things it must not touch are worth naming before the code.

   ============================================================================
   TIME COMES FROM `dt`, NEVER FROM A WALL CLOCK (invariant 10). The
   simulation runs a fixed 1/120 s substep and no `rules` module ever sees a
   variable dt, so a seed takes its stated `eff('treeGrowSecs')` of SIMULATION
   time at 20 fps and at 240 fps alike. `Date.now()` and `performance.now()`
   would both "work" and both drift -- and worse, they would keep growing a
   seed while the tab was in the background, where no other mechanic in the
   game advances at all. `clock.t` is not an option either: it is `shell`-owned
   and `rules` may not import `shell`. `model/run.js#run.t` exists and is
   ticked first in `shell/schedule.js#STEPS`, but is not used here either --
   an accumulator per seed is what makes the transition independent of WHEN
   the seed was planted, where a comparison against a run clock would need a
   planted-at stamp and would drift the day anything reset that clock.
   CLAUDE.md records that a fixed-`DT` harness cannot see framerate bugs, so
   `tools/check.mjs` section 8g drives the REAL `step()` at all 8 framerates
   its hardness table already sweeps.

   HEIGHT COMES FROM `hash2`, NEVER FROM `rand()` (invariant 7). A trunk's
   height must be a function of WHERE the seed was planted and nothing else.
   `rand()` is a stream, so its value depends on how many draws preceded it:
   two runs from the same seed in which the player planted the same tile at
   different times -- having mined a different number of tiles first, say --
   would resolve to different heights, and the run would no longer be
   bit-reproducible from its seed in any useful sense. `hash2(tx, ty)` is
   stateless (`core/rng.js`'s own header says so), consumes nothing from the
   stream, and is already the idiom for positional pseudo-randomness in
   `view/treatments.js` and in `rules/generate.js`'s own jitter.
   ============================================================================

   WHAT THIS STEP DELIBERATELY DOES NOT DO:

     IT DOES NOT DRAW ANYTHING. The growth-stage cue is `view/scene.js`'s
     live overlay, reading `model/growth.js#stageAt`.

     IT DOES NOT TOUCH THE CANOPY, THE CHUNK CACHE OR ANY REPAINT. A grown
     trunk is written as NATIVE tiles through `model/tiles.js#write.set` --
     the identical call `rules/generate.js#trees` makes -- and `write.touch`
     inside `setByte` already bumps the right 3x3 neighbourhood of chunk
     versions, so `view/paint.js#decorate` grows the crown on the next
     repaint with no code here and no code there. That is the single best
     property of a tree being N stacked native tiles and nothing else.

     IT DOES NOT PUSH A JOURNAL ROW. Deliberately, and for the reason
     docs/PLAN-phase14-mining-and-drops.md gives for declining a "vein
     exhausted" row: the tile appearing IS the event, and a notification for
     something three minutes downstream of any input the player made is noise
     rather than feedback.

     IT DOES NOT REGROW A TREE NOBODY PLANTED. `rules/generate.js`'s `trees`
     handler is untouched and nothing here scans for stumps. A world that
     reforests itself removes the reason to carry a seed. */

import { hash2 } from '../core/rng.js';
import { NATIVE } from '../data/forms.js';
import { BANDS } from '../data/world.js';
import { planted, write as gw } from '../model/growth.js';
import { eff } from '../model/mods.js';
import { formAt, subAt, write as tw } from '../model/tiles.js';
import { bandByOrd } from '../model/world.js';

/* THE HEIGHT RANGE IS READ OFF THE WORLDGEN ROW, NOT RE-LITERALLED, so a
   planted tree is the same size as a wild one by construction and the two
   cannot drift apart in a tuning pass that only remembered one of them.
   `data/world.js`'s `trees` strata row is the single declaration of what a
   tree's height is; this finds it once at import rather than per resolve,
   because `BANDS` is frozen content.

   Whether a CULTIVATED tree should differ from a wild one -- taller, faster,
   or worth more -- is a real design question and is explicitly deferred
   (docs/PLAN-phase15-trees.md section 6). When someone answers it, the answer
   is a key on a content row, not a number here. */
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

/* HOW TALL THIS PARTICULAR TILE'S TREE IS, and the whole of the positional
   argument in the header. `hash2` returns 0..1 for a coordinate pair, so this
   is an integer in `[lo, hi]` that depends on the tile and on nothing else --
   not on the run's `rand()` stream, not on the clock, not on how many seeds
   have already resolved. The band ordinal is folded in so the same (tx, ty)
   in two bands is not forced to the same height.

   MULTIPLY-AND-FLOOR rather than a modulo of the raw 32-bit word, matching
   `randInt` in `core/rng.js` and every other `hash2` reader in the project
   (`view/treatments.js#glint`, `view/scene.js#drawDepletion`). `hash2`
   returns [0, 1) — its own header says so — so `| 0` can never reach
   `hi - lo + 1` and the result can never exceed `hi`. */
function heightAt(b, tx, ty) {
  const [lo, hi] = TREE_HEIGHT;
  if (!(hi >= lo)) return Math.max(1, lo | 0);
  return lo + ((hash2(tx * 31 + b.ord * 7919, ty * 17 + 3) * (hi - lo + 1)) | 0);
}

/* A SEED BECOMES A TREE IN ONE WRITE PER TILE AND NOTHING ELSE.
   `tw.set(..., NATIVE)` is the identical call `rules/generate.js:293` makes
   for a wild trunk, so a grown tree is not merely similar to a generated one
   -- it is the same bytes, and every downstream reader (the canopy, the
   drop table, `dropAt`'s `tile.drops`, the seed drop in `rules/mining.js`
   that will fire when it is felled again) sees no difference at all.

   The seed's OWN tile becomes the trunk's base rather than being cleared and
   the trunk starting above it, which is what makes the tree stand exactly
   where the player put it. Growing upward from there is the same direction
   worldgen grows, and it is the only direction that cannot bury the player:
   downward would overwrite the ground the seed was planted on.

   Off the top of the band is not a special case -- `write.set` refuses an
   out-of-bounds coordinate and returns false -- so a seed planted two tiles
   below row 0 simply yields a two-tile tree. A REFUSAL TO GROW would be
   worse: the player would be left with a seedling that never resolves and no
   way to learn why.

   THE SUBSTANCE IS THE SEED'S OWN, not the literal `timber`. `subTags` on
   `data/forms.js#seed` admits `organic`, of which timber is the only member
   today, but reading the substance off the tile costs nothing and means a
   second organic element would grow into its own kind of tree rather than
   into a timber one. `tools/content.mjs` assertion 16 guarantees any
   substance that can cross into `seed` has a `tile` block of its own, so the
   trunk this writes can always be mined back out. */
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
    /* A MISSING BAND IS NOT RECOVERABLE FROM HERE and is skipped rather than
       cleared: `model/growth.js#write.clear` needs the band record itself to
       rebuild the key (it reads `b.tw` through `world.js#idx`), so there is
       no honest way to delete an entry whose band is gone. It is also not a
       state this can reach in a correct build -- the only thing that
       destroys a band record is `shell/boot.js#newRun`, which calls
       `growthw.clearAll()` in the same teardown block. If this branch ever
       runs, that call has been removed, which is invariant 8's determinism
       bug and is what `tools/check.mjs`'s reset fingerprint asserts. */
    const b = bandByOrd(e.ord);
    if (!b) continue;

    /* IS THE SEED STILL THERE? Defensive rather than load-bearing since
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
