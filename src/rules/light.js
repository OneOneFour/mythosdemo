/* LAYER rules — LIGHT: the current-lit-level field, and the one carried
   light source. Imports `core`, `data`, `model`. Imports no other `rules`
   module.

   ============================================================================
   TWO SEPARATE FACTS, AND THIS FILE OWNS ONLY THE SECOND. `model/world.js#
   b.seen` is memory: has the player ever stood here, permanent, one-way,
   never cleared. `model/world.js#b.light` is a CURRENT CONDITION: how lit is
   this tile right now, recomputed, and it goes down as well as up. This file
   decides the second fact and never touches the first -- `rules/reveal.js`
   owns `seen`, and the only thing it reads FROM here is `lightAt()`, to keep
   its own flood from mapping a pitch-black cavern by standing in it.
   ============================================================================

   PROPAGATION is a multi-source flood from every emitter -- every sky-exposed
   tile at `eff('lightMax')`, every lit machine, and the player's own tile
   while a `timber/brand` burns -- decrementing `eff('lightFalloffAir')` per
   tile of open air crossed and `eff('lightFalloffRock')` per tile of solid
   rock, so light does not leak through strata the way sight already does not.
   Implemented as a bucketed relaxation (Dial's algorithm: levels are small
   bounded integers, so a level-indexed array of queues, walked from brightest
   to dimmest, replaces a real priority queue at no cost) rather than a plain
   BFS, because a WEIGHTED spread -- rock costs three times what air does --
   cannot be visited in insertion order the way `rules/reveal.js#passB`'s
   unweighted flood can.

   NO `rand()` ANYWHERE (invariant 7). The BFS order is fixed by tile index
   inside each level's bucket, so two runs of the same seed relight identically.

   RECOMPUTE ONLY WHEN SOMETHING THAT MATTERS ACTUALLY CHANGED, never per
   frame -- a full-band flood over 40,000-odd tiles is not a per-frame cost.
   "Changed" is two independent things, both cheap to check every frame even
   when nothing did: the band's own chunk versions (`b.ver`, already bumped by
   every tile write, so a dug tunnel opens a new path THIS check) summed over
   every chunk -- not just the ones near the player, the way `passB`'s own
   throttle limits itself, because a distant emitter's light can pass through
   a tunnel dug anywhere in the band -- and a SIGNATURE of the currently active
   emitter set (position and level of every lit machine, plus the carried
   brand), because an emitter turning on or off or a fuel charge running out
   never touches a tile byte at all and would otherwise be invisible to a
   `ver`-based check. Whichever band actually changed recomputes; the other two
   do not, most frames neither does. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { MACH } from '../data/machines.js';
import { machines } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { player, playerBox } from '../model/player.js';
import { invCount, run, write as rw } from '../model/run.js';
import { solidAt } from '../model/tiles.js';
import { bands, idx, inBounds, tileX, tileY, write as ww } from '../model/world.js';

export function step(dt) {
  tickBrand(dt);
  for (const b of bands) {
    const emitters = emittersFor(b);
    const sig = signatureOf(emitters);
    if (isDirty(b, sig)) recompute(b, emitters);
  }
}

/* ---------- the one carried light source ----------
   `run.brandLeft` is a SCALAR, not per-item state, for the same reason
   `run.craftProgress` is: a player has one pair of hands and there is only
   ever one lit brand. It resets with the run for free (invariant 8) because
   it lives on `RUN_SCHEMA` alongside `craftProgress` -- see the deviation
   note in `docs/FINDINGS.md` for why that one field and its one writer were
   added to `model/run.js` despite this phase's file ownership not listing
   that file; the alternative was module-scoped state here that `newRun()`
   has no way to reset, which is exactly the class of bug invariant 8 exists
   to prevent.

   Auto-relights: the moment the current brand burns out (or at the start of
   the run, when it is already at zero), the next `timber/brand` in the
   pockets is spent and lit, with no separate "light your torch" verb -- the
   phase names no such intent, and Prometheus does not re-steal the fire every
   time it catches. */
function tickBrand(dt) {
  if (run.brandLeft > 0) rw.brand(Math.max(0, run.brandLeft - dt));
  if (run.brandLeft <= 0 && invCount(S.timber, F.brand) > 0 &&
      rw.spend(S.timber, F.brand, 1))
    rw.brand(eff('brandSecs'));
}

/* ---------- emitters ----------
   Every source this band's flood seeds from, besides open sky (handled
   directly in `recompute`). NO MACHINE NAME APPEARS HERE -- `def.light` is a
   generic `{ level, whileRunning }` key any row may carry, read exactly like
   every other interpreter key in `rules/machines.js`. `level:'max'` is the
   one sentinel, for a fixture (the hearth) whose brightness must track
   `eff('lightMax')` itself rather than a fixed number -- data cannot call
   `eff()` (only `model/mods.js` may import `data/tuning.js`), so the row
   says the WORD and this, the interpreter, resolves it. */
function emittersFor(b) {
  const out = [];
  for (const m of machines) {
    if (m.band !== b) continue;
    const def = MACH[m.def];
    if (!def.light) continue;
    if (def.light.whileRunning && !m.running) continue;
    const level = def.light.level === 'max' ? eff('lightMax') : def.light.level;
    out.push({ tx: m.tx, ty: m.ty, level });
  }
  if (player.band === b && run.brandLeft > 0) {
    const box = playerBox();
    out.push({
      tx: tileX(b, box.x + box.w / 2),
      ty: tileY(b, box.y + box.h / 2),
      level: eff('brandLevel')
    });
  }
  return out;
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

/* ---------- the dirty check ----------
   Keyed by the band OBJECT, not by `b.ord`, and deliberately module-local
   rather than in `model/` -- exactly `rules/reveal.js#passB`'s own perf cache
   one function up in that file, for the identical reason: `newRun()` always
   hands out fresh band records, so a stale entry here can never be read back
   into a live run, and there is no reset call to wire up or forget. */
const bandState = new WeakMap();

function isDirty(b, sig) {
  let verSum = 0;
  for (let i = 0; i < b.ver.length; i++) verSum += b.ver[i];
  const prev = bandState.get(b);
  bandState.set(b, { verSum, sig });
  return !prev || prev.verSum !== verSum || prev.sig !== sig;
}

/* ---------- propagation ----------
   Dial's algorithm: `buckets[lvl]` holds every tile index CURRENTLY BELIEVED
   to be at level `lvl`, and levels only ever fall as the flood spreads, so
   processing buckets from `max` down to `1` visits every tile at its FINAL,
   brightest level the first time a live (non-stale) entry for it is popped.
   A tile can be pushed more than once, at different levels, before its best
   one is processed -- `best[i] !== lvl` on pop is the cheap way to ignore a
   since-beaten, now-stale entry rather than searching a bucket to remove it. */
function recompute(b, emitters) {
  const max = Math.max(1, Math.round(eff('lightMax')));
  const air = eff('lightFalloffAir'), rock = eff('lightFalloffRock');
  const best = new Int8Array(b.tw * b.th).fill(0);
  const buckets = Array.from({ length: max + 1 }, () => []);

  const seed = (tx, ty, level) => {
    const lvl = Math.min(max, Math.max(0, Math.round(level)));
    if (lvl < 1) return;
    const i = idx(b, tx, ty);
    if (lvl > best[i]) { best[i] = lvl; buckets[lvl].push(i); }
  };

  /* Sky: walk DOWN from row 0 once per column and stop after the first solid
     tile, exactly `rules/reveal.js#passA`'s own loop -- `skyExposedAt` walks
     to row 0 EVERY call and running it per tile over a 128x320 band is close
     to quadratic, so this never calls it at all. Every tile from row 0 to and
     including that first solid tile is "sky exposed" by the identical
     definition `skyExposedAt` uses (nothing solid strictly above it), so all
     of them seed at `max`, not just the ground line. */
  for (let tx = 0; tx < b.tw; tx++)
    for (let ty = 0; ty < b.th; ty++) {
      seed(tx, ty, max);
      if (solidAt(b, tx, ty)) break;
    }

  for (const e of emitters) if (inBounds(b, e.tx, e.ty)) seed(e.tx, e.ty, e.level);

  for (let lvl = max; lvl >= 1; lvl--) {
    const q = buckets[lvl];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      if (best[i] !== lvl) continue;                    // stale: already beaten
      const tx = i % b.tw, ty = (i / b.tw) | 0;
      relax(b, tx - 1, ty, lvl, air, rock, best, buckets, max);
      relax(b, tx + 1, ty, lvl, air, rock, best, buckets, max);
      relax(b, tx, ty - 1, lvl, air, rock, best, buckets, max);
      relax(b, tx, ty + 1, lvl, air, rock, best, buckets, max);
    }
  }

  ww.clearLight(b);
  for (let i = 0; i < best.length; i++)
    if (best[i] > 0) ww.setLight(b, i % b.tw, (i / b.tw) | 0, best[i]);
  ww.touchLight(b);
}

function relax(b, nx, ny, lvl, air, rock, best, buckets, max) {
  if (!inBounds(b, nx, ny)) return;
  const cost = solidAt(b, nx, ny) ? rock : air;
  const nlvl = Math.min(max, Math.floor(lvl - cost));
  if (nlvl < 1) return;
  const ni = idx(b, nx, ny);
  if (nlvl > best[ni]) { best[ni] = nlvl; buckets[nlvl].push(ni); }
}
