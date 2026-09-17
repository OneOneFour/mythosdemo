/* rules layer — the current lit-level field, and the one carried light source.
   Owns `b.light`; `rules/reveal.js` owns `b.seen` and reads only `lightAt()`
   from here.

   A multi-source weighted flood from every emitter, decrementing
   `lightFalloffAir` per tile of open air and `lightFalloffRock` per tile of
   solid rock. Only a band with sky of its own seeds daylight — a band's row 0
   is not inherently sky. Consumes no `rand()`: order is fixed by tile index
   within each level's bucket.

   Recomputes only when the band's chunk versions summed over every chunk
   change, or when the emitter signature does — a charge running out touches
   no tile byte. */

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

/* `recompute` carries light down across a band seam, so a band's field depends
   on the band above having settled. `bands` is in top-down order, so one pass
   suffices; `carried` relights a band whose upstairs neighbour just relit. */
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

/* `run.brandLeft` lives on the run schema so `newRun()` resets it; a
   module-scoped counter here would survive a restart. */
function tickBrand(dt) {
  if (run.brandLeft > 0) rw.brand(Math.max(0, run.brandLeft - dt));
  if (run.brandLeft <= 0 && invCount(S.timber, F.brand) > 0 &&
      rw.spend(S.timber, F.brand, 1))
    rw.brand(eff('brandSecs'));
}

/* Sources besides open sky and the seam carry, both of which live in
   `forEachSeed`. `def.light` is a generic `{ level, whileRunning }` key any
   `data/machines.js` row may carry; `level:'max'` resolves to `eff('lightMax')`
   here, since `data` may not call `eff()`. */
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

/* One seed per band the player's hitbox overlaps: the flood is per band and
   the seam carry only runs downward, so `player.band` alone would leave a
   straddling player's other half unlit. The tile is the one under the box
   centre, clamped into that band's own span. */
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

/* Rolling hash of the active emitter set, so an emitter running dry or moving
   is detected without a deep compare against last substep's array. */
function signatureOf(emitters) {
  let sig = 0;
  for (const e of emitters)
    sig = (sig * 131 + e.tx * 977 + e.ty * 37 + Math.round(e.level)) | 0;
  return sig;
}

/* Keyed by the band object rather than `b.ord`: `newRun()` hands out fresh
   band records, so a stale entry can never be read back into a live run and
   there is no reset call to wire up. */
const bandState = new WeakMap();

function isDirty(b, sig) {
  let verSum = 0;
  for (let i = 0; i < b.ver.length; i++) verSum += b.ver[i];
  const prev = bandState.get(b);
  bandState.set(b, { verSum, sig });
  return !prev || prev.verSum !== verSum || prev.sig !== sig;
}

/* Dial's algorithm: `buckets[lvl]` holds every tile currently believed to be
   at level `lvl`, and levels only fall, so walking buckets from `max` down to
   1 visits each tile at its final level the first time a live entry pops. */
/* The scratch field spans the lit region's bounding box, not the band — a
   band-sized `Int8Array` is 320 KB at 1,024 columns, reallocated whenever any
   tile broke. Indices in `best` are window-local. */
function recompute(b, emitters) {
  const max = Math.max(1, Math.round(eff('lightMax')));
  const air = eff('lightFalloffAir'), rock = eff('lightFalloffRock');

  /* Hops one seed can reach, in tiles: `relax` charges at least
     `min(air, rock)` per hop and drops a tile below 1 rather than seeding it.
     Anything further in Chebyshev distance can neither light nor relay, so the
     window is exact. A non-positive falloff spreads unbounded, so fall back. */
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

/* Every tile this band's flood starts from, with its starting level, in a
   fixed order. Called twice per recompute — to measure the bounding box, then
   to fill it — rather than listing the tens of thousands of seeds a sky band
   produces. Both passes see the same seeds in the same order. */
function forEachSeed(b, emitters, max, air, rock, cb) {
  /* Clamps and drops a seed under 1, so the box never grows around a tile that
     would not have seeded. The sky pass calls `cb` directly instead: `max` is
     already an integer at least 1, and that pass is the expensive one. */
  const emit = (tx, ty, level) => {
    const lvl = Math.min(max, Math.max(0, Math.round(level)));
    if (lvl >= 1) cb(tx, ty, lvl);
  };

  /* Only a band carrying sky of its own gets any. Walk down from row 0 once
     per column and stop after the first solid tile; every tile down to and
     including it has a clear path to sky, so all of them seed at `max`. A
     whole-column query per tile would be close to quadratic. */
  if (hasOwnSky(b))
    for (let tx = 0; tx < b.tw; tx++)
      for (let ty = 0; ty < b.th; ty++) {
        cb(tx, ty, max);
        if (solidAt(b, tx, ty)) break;
      }

  /* The seam carry, which is what a buried row 0 gets instead. Each column
     takes the level the band above finished at one world row up, minus this
     tile's entry cost, so a shaft carries daylight and rock does not. With no
     band above, it seeds at `max`. Downward only. */
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

/* `win` is clamped inside the band, so the window test is also the bounds
   test and there is no second `inBounds` call. */
function relax(b, win, nx, ny, lvl, air, rock, best, buckets, max) {
  if (nx < win.tx0 || nx > win.tx1 || ny < win.ty0 || ny > win.ty1) return;
  const cost = solidAt(b, nx, ny) ? rock : air;
  const nlvl = Math.min(max, Math.floor(lvl - cost));
  if (nlvl < 1) return;
  const ni = (ny - win.ty0) * win.w + (nx - win.tx0);
  if (nlvl > best[ni]) { best[ni] = nlvl; buckets[nlvl].push(ni); }
}
