/* LAYER rules — WORLDGEN. Reads the `strata` array off a `data/world.js` row and
   writes tiles. Imports `core`, `data`, `model`. Imports no other `rules`
   module; its place in the boot order is stated in `shell/boot.js`.

   ============================================================================
   WHY GENERATION IS A `rules` MODULE AND NOT A `model` ONE.
   `model` owns the number and the query; `rules` owns the decision and the
   consequence. "Where does a copper blob go" is a decision — it consumes the
   run's random stream, it depends on tunables, and it has the lifetime of one
   boot. `model/world.js` allocates the array; this file decides what is in it.
   ============================================================================

   THE KIND TABLE IS THE WHOLE FILE. `data/world.js` declares strata rows by
   `kind`, exports `STRATA_KINDS`, and the assertion at the bottom fails at
   import if a kind has no handler here. So a row with a typo'd kind is a build
   error rather than a silently missing vein — which is the failure the previous
   generator had, where an unknown row was skipped without a word.

   Adding a LAYER, a VEIN or an ORE FIELD costs one row in `data/world.js`.
   Adding a new KIND costs a handler here, once. That trade is the same one
   `rules/machines.js` makes, and it is deliberate.

   ALL RANDOMNESS THROUGH `rand()`, in a fixed traversal order: bands in
   declaration order, strata rows in row order, columns left to right. A run is
   therefore bit-reproducible from its seed (ARCHITECTURE invariant 7), and that
   property is only true because the order is fixed here rather than emergent. */

import { rand, randInt, randRange } from '../core/rng.js';
import { NATIVE } from '../data/forms.js';
import { S } from '../data/substances.js';
import { STRATA_KINDS } from '../data/world.js';
import { write as tw, solidAt } from '../model/tiles.js';
import { inBounds } from '../model/world.js';

/* Half-width in tiles of the guaranteed flat shelf around the spawn column.
   The first two minutes must not depend on the seed: a ragged lip or a tree
   where the player wakes is the difference between "walk" and "fall". */
const SHELF = 6;

/* Fraction of a layer's top row that is carved away, so a stratum boundary
   reads as ground rather than as a ruled line. One tile deep only: any more and
   `floorTy` stops meaning what `data/world.js` says it means. */
const LIP = 0.35;

/* ---------- the kind table ---------- */

const KINDS = {

  /* A solid band of one element across the full width. The bulk of every band
     is one of these. `fromTy` is the ground line when it is the topmost layer,
     which is why the top row gets the ragged lip BY DEFAULT -- `lip:false`
     opts a row out, for a stratum boundary that sits underground and was never
     exposed to open sky. Without that flag, giving a band's stone layer its
     own `fromTy` (to sit under a shallow soil cap, say) would punch random air
     pockets along the seam, because the lip check does not know "top of my own
     range" from "top of the world". */
  layer(b, row) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    for (let ty = top; ty < bot; ty++)
      for (let tx = 0; tx < b.tw; tx++) {
        if (ty === top && row.lip !== false && !onShelf(b, tx) && rand() < LIP) continue;
        tw.set(b, tx, ty, sub, NATIVE);
      }
  },

  /* Scattered round clusters: ore fields. `count` attempts, each at a random
     column and a row inside the declared window. */
  blobs(b, row) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    if (bot <= top) return;
    for (let n = 0; n < row.count; n++) {
      const cx = randInt(0, b.tw - 1);
      const cy = randInt(top, bot - 1);
      blob(b, cx, cy, randRange(row.r[0], row.r[1]), sub);
    }
  },

  /* One guaranteed cluster at a named landmark. `near:'spawn'` is resolved
     HERE and not in `data/world.js`, because "where is spawn" is a fact about
     the band record and a content row should not have to know it. */
  vein(b, row) {
    const cx = row.near === 'spawn' && b.cfg.spawnTx !== undefined
      ? b.cfg.spawnTx : (b.tw >> 1);
    const cy = (b.cfg.floorTy ?? 0) + (row.dy ?? 0);
    blob(b, cx, cy, row.r, S[row.sub]);
  },

  /* Standing trunks, grown UP from whatever surface a column happens to have.
     `fromTy`/`toTy` is the window a trunk's BASE may sit in, not the extent of
     the trunk: a 5-tall tree on a 4-row window is a tree, not an error.

     Trees are the only timber above ground, and timber's `log` form is the only
     tile-capable form in the game — so this loop is also the ladder supply.
     See `data/forms.js`. */
  trees(b, row) {
    const sub = S[row.sub];
    const top = Math.max(0, row.fromTy);
    const bot = Math.min(b.th, row.toTy);
    for (let tx = 0; tx < b.tw; tx++) {
      if (rand() >= row.chance) continue;
      if (onShelf(b, tx)) continue;                  // never in front of spawn
      let base = -1;
      for (let ty = top; ty < bot; ty++) if (solidAt(b, tx, ty)) { base = ty; break; }
      if (base < 0) continue;
      const h = randInt(row.height[0], row.height[1]);
      for (let k = 1; k <= h; k++) tw.set(b, tx, base - k, sub, NATIVE);
    }
  }
};

/* ---------- the one entry point ---------- */

/* Apply every strata row of a band, in row order. The band's tile array is
   freshly allocated (and therefore all AIR) when this is called, so there is no
   clear step: `shell/boot.js` allocates and then generates, once. */
export function generate(b) {
  for (const row of b.cfg.strata) KINDS[row.kind](b, row);
}

/* ---------- shared shapes ---------- */

/* A round-ish cluster with a ragged rim. `hash2` would make the rim identical
   between two seeds at the same coordinates, so the rim uses `rand()` too —
   worldgen is exactly the place where consuming the run stream is correct. */
function blob(b, cx, cy, r, sub) {
  const rr = r * r, ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++)
    for (let dx = -ri; dx <= ri; dx++) {
      const d = dx * dx + dy * dy;
      if (d > rr) continue;
      if (d > rr * 0.45 && rand() < 0.42) continue;          // ragged rim
      const tx = cx + dx, ty = cy + dy;
      if (inBounds(b, tx, ty)) tw.set(b, tx, ty, sub, NATIVE);
    }
}

const onShelf = (b, tx) =>
  b.cfg.spawnTx !== undefined && Math.abs(tx - b.cfg.spawnTx) <= SHELF;

/* ---------- coverage, asserted at import ----------
   `data/world.js` exports `STRATA_KINDS` for exactly this. A content row naming
   a kind nothing implements used to be skipped in silence; now it cannot be
   committed. This is the cheap half of `tools/resolve.mjs`, paid at import. */
for (const kind of STRATA_KINDS)
  if (typeof KINDS[kind] !== 'function')
    throw new Error(`generate: no handler for strata kind "${kind}"`);
