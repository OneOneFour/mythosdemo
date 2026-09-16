/* LAYER rules — LIGHT: the current-lit-level field, and the one carried light
   source. Imports `core`, `data`, `model`, and no other `rules` module.

   TWO SEPARATE FACTS, AND THIS FILE OWNS ONLY THE SECOND: `b.seen` is memory,
   `b.light` is a current condition. `rules/reveal.js` owns `seen` and reads
   only `lightAt()` from here, to keep its flood from mapping a pitch-black
   cavern by standing in it.

   PROPAGATION is a multi-source flood from every emitter, decrementing
   `lightFalloffAir` per tile of open air and `lightFalloffRock` per tile of
   solid rock, so light does not leak through strata the way sight does not.
   A BAND'S ROW 0 IS NOT SKY -- only a band with sky of its own seeds daylight.

   Bucketed relaxation rather than a plain BFS, because a WEIGHTED spread
   cannot be visited in insertion order the way an unweighted flood can.

   NO `rand()`. The order is fixed by tile index inside each level's bucket.

   RECOMPUTE ONLY WHEN SOMETHING THAT MATTERS CHANGED, never per frame, and
   "changed" is two things: the band's chunk versions summed over EVERY chunk
   (a distant emitter's light can pass through a tunnel dug anywhere), and a
   SIGNATURE of the active emitter set, because a charge running out never
   touches a tile byte. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { MACH } from '../data/machines.js';
import { machines } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { player, playerBox } from '../model/player.js';
import { invCount, run, write as rw } from '../model/run.js';
import { solidAt } from '../model/tiles.js';
import { bandAt, bandSpans, bands, hasOwnSky, inBounds, lightAt, tileX, tileY, worldX,
         write as ww } from '../model/world.js';

/* THE SEAM CASCADE. `recompute` carries light down across a band seam, so a
   band's field depends on the band above having settled. `bands` is in
   top-down declaration order (`model/world.js#bandAbove` is the previous
   element, by construction), so one pass in that order is enough -- and a
   band whose upstairs neighbour relit must relight too, or it keeps a flood
   seeded from a field that has since moved. `carried` is that signal, and it
   is a scalar rather than a set because the only band it ever has to describe
   is the one immediately above. */
export function step(dt) {
  tickBrand(dt);
  const brand = brandSeeds();
  let carried = false;
  for (const b of bands) {
    const emitters = emittersFor(b, brand);
    const relight = isDirty(b, signatureOf(emitters)) || carried;
    if (relight) recompute(b, emitters);
    carried = relight;
  }
}

/* `run.brandLeft` is a SCALAR rather than per-item state, because a player has
   one pair of hands and there is only ever one lit brand. It resets with the
   run for free by living on `RUN_SCHEMA`; module-scoped state here would have
   no way for `newRun()` to reset it. */
function tickBrand(dt) {
  if (run.brandLeft > 0) rw.brand(Math.max(0, run.brandLeft - dt));
  if (run.brandLeft <= 0 && invCount(S.timber, F.brand) > 0 &&
      rw.spend(S.timber, F.brand, 1))
    rw.brand(eff('brandSecs'));
}

/* emitters
   Every source this band's flood seeds from, besides open sky and the seam
   carry (both in `forEachSeed`). NO MACHINE NAME APPEARS HERE -- `def.light` is
   a generic `{ level, whileRunning }` key any row may carry, read exactly like
   every other interpreter key in `rules/machines.js`. `level:'max'` is the
   one sentinel, for a fixture (the hearth) whose brightness must track
   `eff('lightMax')` itself rather than a fixed number -- data cannot call
   `eff()` (only `model/mods.js` may import `data/tuning.js`), so the row
   says the WORD and this, the interpreter, resolves it.
*/
function emittersFor(b, brand) {
  const out = [];
  for (const m of machines) {
    if (m.band !== b) continue;
    const def = MACH[m.def];
    if (!def.light) continue;
    if (def.light.whileRunning && !m.running) continue;
    const level = def.light.level === 'max' ? eff('lightMax') : def.light.level;
    out.push({ tx: m.tx, ty: m.ty, level });
  }
  for (const s of brand)
    if (s.b === b) out.push({ tx: s.tx, ty: s.ty, level: eff('brandLevel') });
  return out;
}

/* WHERE A LIT BRAND SEEDS, one entry per band the player's hitbox overlaps.
   `player.band` alone leaves the half of a straddling player's body that sits
   in the other band's grid unlit, since the flood is per band and the seam
   carry only runs downward.

   The tile is the occupied one nearest the box CENTRE, clamped into that
   band's own span, so a player standing clear of a seam seeds exactly the one
   tile their centre falls in and nothing about the common case moves. */
function brandSeeds() {
  if (run.brandLeft <= 0 || !player.band) return [];
  const box = playerBox();
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return bandSpans(box.x, box.y, box.w, box.h).map(s => ({
    b: s.b,
    tx: Math.min(s.tx1, Math.max(s.tx0, tileX(s.b, cx))),
    ty: Math.min(s.ty1, Math.max(s.ty0, tileY(s.b, cy)))
  }));
}

/* A cheap rolling hash of the active emitter set, so "a brazier just ran dry"
   is detectable without a deep-equal against last frame's array. Position and
   level both fold in, so a machine merely MOVING (nothing does today, but
   nothing should have to know that) would also be caught. */
function signatureOf(emitters) {
  let sig = 0;
  for (const e of emitters)
    sig = (sig * 131 + e.tx * 977 + e.ty * 37 + Math.round(e.level)) | 0;
  return sig;
}

/* the dirty check
   Keyed by the band OBJECT, not by `b.ord`, and deliberately module-local
   rather than in `model/` -- exactly `rules/reveal.js#passB`'s own perf
   cache, for the identical reason: `newRun()` always hands out fresh band
   records, so a stale entry here can never be read back into a live run,
   and there is no reset call to wire up or forget. */
const bandState = new WeakMap();

function isDirty(b, sig) {
  let verSum = 0;
  for (let i = 0; i < b.ver.length; i++) verSum += b.ver[i];
  const prev = bandState.get(b);
  bandState.set(b, { verSum, sig });
  return !prev || prev.verSum !== verSum || prev.sig !== sig;
}

/* Dial's algorithm: `buckets[lvl]` holds every tile CURRENTLY BELIEVED to be
   at level `lvl`, and levels only fall as the flood spreads, so walking
   buckets from `max` down to 1 visits every tile at its FINAL level the first
   time a live entry is popped. `best[i] !== lvl` on pop ignores a
   since-beaten stale entry rather than searching a bucket to remove it.

   THE SCRATCH FIELD IS THE LIT REGION'S BOUNDING BOX, NOT THE BAND: a
   band-sized `Int8Array` is 320 KB at 1,024 columns, allocated and thrown
   away every time a tile broke anywhere. Indices here are WINDOW-LOCAL. */
function recompute(b, emitters) {
  const max = Math.max(1, Math.round(eff('lightMax')));
  const air = eff('lightFalloffAir'), rock = eff('lightFalloffRock');

  /* HOW FAR ONE SEED CAN POSSIBLY REACH, in tiles. `relax` charges at least
     `min(air, rock)` per hop and drops a tile below 1 rather than seeding it,
     so a seed at `max` dies after `(max - 1) / step` hops: 14 at the shipped
     15/1/3. A tile outside the box is further than that from EVERY seed in
     Chebyshev distance and therefore in hops, so it can be neither lit nor a
     live relay -- which is what makes the window bit-identical to the whole
     band rather than an approximation of it. A zero or negative falloff would
     spread without bound, so it falls back to the band. */
  const step = Math.min(air, rock);
  const reach = step > 0 ? Math.floor((max - 1) / step) : b.tw + b.th;

  let tx0 = b.tw, ty0 = b.th, tx1 = -1, ty1 = -1;
  forEachSeed(b, emitters, max, air, rock, (tx, ty) => {
    if (tx < tx0) tx0 = tx;
    if (tx > tx1) tx1 = tx;
    if (ty < ty0) ty0 = ty;
    if (ty > ty1) ty1 = ty;
  });

  ww.clearLight(b);
  if (tx1 < 0) { ww.touchLight(b); return; }        // nothing lights this band

  const win = {
    tx0: Math.max(0, tx0 - reach), ty0: Math.max(0, ty0 - reach),
    tx1: Math.min(b.tw - 1, tx1 + reach), ty1: Math.min(b.th - 1, ty1 + reach),
    w: 0
  };
  win.w = win.tx1 - win.tx0 + 1;
  const best = new Int8Array(win.w * (win.ty1 - win.ty0 + 1));
  const buckets = Array.from({ length: max + 1 }, () => []);

  forEachSeed(b, emitters, max, air, rock, (tx, ty, lvl) => {
    const i = (ty - win.ty0) * win.w + (tx - win.tx0);
    if (lvl > best[i]) { best[i] = lvl; buckets[lvl].push(i); }
  });

  for (let lvl = max; lvl >= 1; lvl--) {
    const q = buckets[lvl];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      if (best[i] !== lvl) continue;                    // stale: already beaten
      const tx = win.tx0 + (i % win.w), ty = win.ty0 + ((i / win.w) | 0);
      relax(b, win, tx - 1, ty, lvl, air, rock, best, buckets, max);
      relax(b, win, tx + 1, ty, lvl, air, rock, best, buckets, max);
      relax(b, win, tx, ty - 1, lvl, air, rock, best, buckets, max);
      relax(b, win, tx, ty + 1, lvl, air, rock, best, buckets, max);
    }
  }

  for (let i = 0; i < best.length; i++)
    if (best[i] > 0)
      ww.setLight(b, win.tx0 + (i % win.w), win.ty0 + ((i / win.w) | 0), best[i]);
  ww.touchLight(b);
}

/* Every tile this band's flood starts from, with the level it starts at, in a
   fixed order. Called TWICE per recompute -- once to measure the bounding box,
   once to fill it -- rather than materialising a seed list, because a band with
   sky of its own seeds tens of thousands of tiles and a list of them costs more
   than the scratch field the box exists to shrink. Both passes see the same
   seeds in the same order, so the flood is unaffected by which one is running.

   Levels are clamped and a seed under 1 is dropped here, so the box never grows
   around a seed that would not have seeded. */
function forEachSeed(b, emitters, max, air, rock, cb) {
  /* `max` is already an integer at least 1 (`recompute` clamps it once), so the
     sky pass calls `cb` directly and only the two sources that can hand over a
     fractional or out-of-range level pay for `emit`. That matters: the sky pass
     is tens of thousands of seeds in a band with sky of its own, and this is
     walked twice. */
  const emit = (tx, ty, level) => {
    const lvl = Math.min(max, Math.max(0, Math.round(level)));
    if (lvl >= 1) cb(tx, ty, lvl);
  };

  /* SKY, and only a band carrying sky of its own gets any. Walk DOWN from row 0
     once per COLUMN and stop after the first solid tile -- running a
     whole-column query per TILE over a band this deep is close to quadratic.
     Every tile down to and including that first solid one has a clear path to
     the band's sky, so all of them seed at `max`, not just the ground line.

     `topsoil` carries no sky, and its row 0 used to seed at `max` under 28
     rows of surface rock: row 0 was the first solid tile the loop saw. */
  if (hasOwnSky(b))
    for (let tx = 0; tx < b.tw; tx++)
      for (let ty = 0; ty < b.th; ty++) {
        cb(tx, ty, max);
        if (solidAt(b, tx, ty)) break;
      }

  /* THE SEAM CARRY, which is what a buried row 0 gets instead. Each column
     takes the level the band above finished at one world row up, minus the
     cost of entering this tile -- the same falloff `relax` charges anywhere
     else, so a shaft through the seam carries daylight and rock carries
     nothing. Where no band lies above, the world really is open, so it seeds
     at `max`.

     ONE DIRECTION ONLY: a brazier below a seam does not light the rock above
     it, because both directions would need a fixed point across bands. */
  const wyAbove = b.origin.y - 1;
  for (let tx = 0; tx < b.tw; tx++) {
    const wx = worldX(b, tx) + b.tile / 2;
    const a = bandAt(wx, wyAbove);
    if (!a || a.ord >= b.ord) { emit(tx, 0, max); continue; }
    const lvl = lightAt(a, tileX(a, wx), tileY(a, wyAbove));
    if (lvl > 0) emit(tx, 0, lvl - (solidAt(b, tx, 0) ? rock : air));
  }

  for (const e of emitters) if (inBounds(b, e.tx, e.ty)) emit(e.tx, e.ty, e.level);
}

/* `win` is clamped inside the band, so the window test IS the bounds test --
   there is no second `inBounds` call and an out-of-band neighbour is rejected
   by the same four comparisons. */
function relax(b, win, nx, ny, lvl, air, rock, best, buckets, max) {
  if (nx < win.tx0 || nx > win.tx1 || ny < win.ty0 || ny > win.ty1) return;
  const cost = solidAt(b, nx, ny) ? rock : air;
  const nlvl = Math.min(max, Math.floor(lvl - cost));
  if (nlvl < 1) return;
  const ni = (ny - win.ty0) * win.w + (nx - win.tx0);
  if (nlvl > best[ni]) { best[ni] = nlvl; buckets[nlvl].push(ni); }
}
