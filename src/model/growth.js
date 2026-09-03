/* LAYER model — accumulated growth time per planted seed, in SECONDS as a
   float. Imports `model` only. May be imported by `model`, `rules`, `view`.

   ONE FACT PER PLANTED SEED: how much simulation time has passed since it
   went into the ground. `rules/growth.js` adds `dt` to it every substep and
   swaps the tile for a stack of native trunk tiles once it reaches
   `eff('treeGrowSecs')`; `view/scene.js` reads `stageAt` for the seed /
   shoot / sapling silhouette. This module owns the number and the query and
   makes no decision about either — the same split `model/mining.js` and
   `rules/mining.js` state at length, for the same reason: storage has the
   lifetime of the world, a decision the lifetime of a frame.

   WHY THIS IS A SPARSE `Map` AND NOT A `model/fields.js` NAMED FIELD, which
   is the near-miss worth recording because it is genuinely tempting. A field
   is a per-band scalar-per-tile store with an active `Set`, already built,
   already band-addressed, and adding `'growth'` to `data/world.js`'s
   `fields` array would have cost one word. Two things kill it:

     1. A FIELD DECAYS BY DEFAULT AND THIS ACCUMULATES. `rules/fields.js`
        walks every declared field against a `DECAY` table every frame — the
        whole shape of that loop is "a value bleeds away unless something
        keeps pouring it in", which is what makes heat heat. A growth timer
        is the exact inverse: it only ever goes up, it must survive the
        player walking to the other end of the map for three minutes, and it
        is meaningless the instant it is touched. Storing it in a structure
        whose default behaviour is to erase it would mean opting out of that
        structure's only real feature and then relying on the opt-out.
     2. A FIELD COSTS A DENSE `Float32Array(tw * th)` PER BAND — ~28 KB for
        the surface band alone — to describe a mechanic that will have
        single-digit live instances. `model/fields.js` makes that trade for
        `heat`, where a plume really is hundreds of adjacent cells; a seed
        is one cell, and the player will rarely have more than a handful in
        the ground at once.

   So: a `Map`, keyed exactly the way `model/mining.js` keys its own — band
   ordinal prefixing the band-local tile index, because two bands may hold
   seeds at once and a bare tile index would collide between them — and every
   write goes through `bump()` for the same reason every write in this layer
   does (`model/epoch.js`, and the render-purity check that reads it).

   AN ENTRY IS CREATED AND CLEARED IN ONE PLACE, and it is the SAME place
   `model/mining.js`'s entries are cleared: `model/tiles.js#write.setByte`,
   the single funnel every terrain edit in the game passes through. A byte
   whose form declares `tile.roots` plants; any other byte at that coordinate
   clears. That covers mining a seedling back out, the seed resolving into a
   trunk, the `chasm` miracle swallowing it, and whatever the next terrain
   verb turns out to be, without any of those four callers knowing this
   module exists — which is exactly the argument D14-E makes there for
   `digw.clear`, made a second time.

   Note the asymmetry with `model/mining.js`, which that hook only ever
   CLEARS: a rooting tile is the one kind of tile whose own creation is a
   fact this ledger needs, so the hook plants as well. Hanging only a clear
   off it would delete the entry on the seed's own planting write.

   The one clear that hook cannot perform is `clearAll()` from
   `shell/boot.js#newRun`, because `model/world.js#write.clear` replaces
   `b.mat` wholesale rather than tile by tile. That call is invariant 8 — a
   growing seed surviving a restart would make two runs from one seed
   diverge, the determinism bug docs/FINDINGS.md 8d #2 records happening to
   `segments`.

   Phase 15, docs/PLAN-phase15-trees.md D15-B, docs/SPEC.md section 22. */

import { bump } from './epoch.js';
import { idx } from './world.js';

/* Band ordinal prefixes the tile index, because two bands may hold planted
   seeds at once and a bare tile index would collide between them. Verbatim
   `model/mining.js`'s own key, and it must stay verbatim: the two modules
   address the same coordinates. */
const key = (b, tx, ty) => b.ord * 0x1000000 + idx(b, tx, ty);

/* THE VALUE IS A RECORD AND NOT A BARE FLOAT, which is the ONE place this
   file departs from `model/mining.js`'s shape, and the reason is that
   `rules/growth.js` has to ENUMERATE what is planted every substep while
   nothing ever enumerates accumulated pick time. Walking a `Map` of packed
   keys back to (band, tx, ty) means inverting `key` and `world.js#idx`
   here — a second implementation of the packing, which would be wrong the
   first day a band's `tw` changed under it. Carrying the three coordinates
   on the record stores one fact once instead. */
export const grove = { grown: new Map() };

export const write = {
  /* A seed goes into the ground with zero seconds on it. Idempotent by
     construction: re-planting the same tile (which cannot happen — the tile
     is not AIR any more — but which a future verb might) restarts the clock
     rather than compounding it. */
  plant(b, tx, ty) {
    grove.grown.set(key(b, tx, ty), { ord: b.ord, tx, ty, secs: 0 });
    bump();
  },

  /* Returns the new total, so the caller need not read it back — verbatim
     `model/mining.js#write.add`'s own contract. Returns 0 and writes nothing
     for a tile that was never planted, so a stray call cannot conjure a seed
     the tile grid knows nothing about. */
  add(b, tx, ty, secs) {
    const e = grove.grown.get(key(b, tx, ty));
    if (!e) return 0;
    e.secs += secs;
    bump();
    return e.secs;
  },

  /* NO BUMP WHEN THERE WAS NOTHING TO DELETE, unlike
     `model/mining.js#write.clear`, and that is not tidiness: this is called
     from `model/tiles.js#write.setByte` for EVERY terrain edit in the game,
     including the several hundred thousand `write.set` calls worldgen makes
     at boot. An unconditional `bump()` there would advance the epoch counter
     once per generated tile for no state change at all. */
  clear(b, tx, ty) { if (grove.grown.delete(key(b, tx, ty))) bump(); },

  clearAll() { grove.grown.clear(); bump(); }
};

/* Is there a seed growing here at all? A `Map.has`, and it is a DIFFERENT
   question from `grownAt() > 0`: a seed planted this frame has zero seconds
   on it and is still very much growing. `view/scene.js`'s overlay needs the
   distinction to draw stage 0 at all. */
export const growingAt = (b, tx, ty) => grove.grown.has(key(b, tx, ty));

/* Accumulated seconds, or 0 for a tile with nothing planted in it. */
export const grownAt = (b, tx, ty) => grove.grown.get(key(b, tx, ty))?.secs || 0;

/* 0..1 — HOW GROWN IS THIS SEED, against the caller's own total. The total is
   a parameter and not read from `data/tuning.js` here for the reason this
   layer always gives: `eff()` is the only reader of a tunable, `model/mods.js`
   is the only importer of the table, and a `view` pass and a `rules` step must
   not be able to disagree about which number they measured against. Clamped
   at 1 rather than allowed past it: a seed that has overrun its total by a
   substep is a seed the rule is about to resolve, and a stage read above 1
   would index past the last silhouette. */
export const stageAt = (b, tx, ty, total) =>
  !(total > 0) || !Number.isFinite(total) ? 0
    : Math.min(1, grownAt(b, tx, ty) / total);

/* The live map itself, for `rules/growth.js` to walk. Returned rather than
   copied — the step mutates entries in place through `write.add` and removes
   them through `write.clear`, and a defensive copy per substep would allocate
   for nothing. Callers must not write to it directly; `write` above is the
   door. */
export const planted = () => grove.grown;

/* How many seeds are in the ground. A debug read, and unlike
   `model/mining.js#activeCount` it IS a fair bound on the size of the map:
   an entry exists only while a seed tile exists, and every one of the three
   ways a seed stops existing clears it (see the header). */
export const activeCount = () => grove.grown.size;
