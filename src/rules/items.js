/* LAYER rules — FALLING MATERIAL: gravity, landing, resting, pickup.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   ============================================================================
   THE COLLISION HERE IS SWEPT, AND THAT IS A FIX RATHER THAN A FLOURISH.
   The previous version integrated in one shot and then point-sampled the tile
   under the item's new position. At terminal velocity (400 px/s) and a 30 ms
   frame an item travels 12 px, which is one and a half tiles — so a one-tile
   floor could be entirely stepped over, and ore mined above a thin ledge fell
   through it into the cavern below. It was invisible at 60 fps and reproducible
   the moment the tab lost focus.

   The sweep splits the motion into substeps no longer than half a tile, so no
   solid tile can be skipped regardless of dt. The cost is up to a handful of
   probes per item per frame, against hundreds of items — measured in
   microseconds, and worth it for a mechanic whose entire promise is that
   material lands where you expect.
   ============================================================================

   ARCHITECTURE invariant 5, restated because this file is where it is felt:
   mined material is a physical thing that falls. Machines are catch boxes and
   material that falls in is free, which is what makes placing a machine UNDER a
   vein strictly better than placing it on the surface. */

import { rand } from '../core/rng.js';
import { push } from '../model/journal.js';
import { items, massOfPair, parseKey, sizeOf, write as iw } from '../model/items.js';
import { eff } from '../model/mods.js';
import { PH, player, playerCentre } from '../model/player.js';
import { burdenOf, run, write as rw } from '../model/run.js';
import { solidAt } from '../model/tiles.js';
import { bandBelow, heightPx, tileX, tileY, worldY } from '../model/world.js';

/* Hard cap on live items. A pile that grows without bound is a frame-time leak,
   and the oldest material is the least interesting. */
const MAX_ITEMS = 400;

/* Seconds before a fresh drop may be pocketed. Without it, ore mined at your
   feet jumps into your hands before you ever see it fall — and seeing it fall
   is the only thing teaching the thesis in the first thirty seconds. */
const MAGNET_DELAY = 0.35;

/* Fraction of horizontal speed kept after a bounce. Material should settle,
   not skitter. */
const BOUNCE = 0.3;

/* Floating-point slack for the burden comparison below -- a pickup landing
   EXACTLY on the hard cap must succeed, not fail on a rounding hair. */
const MASS_EPS = 1e-6;

/* A refused pickup must not re-test -- and re-push the journal -- every
   single frame it sits in the pickup radius. The same idiom
   `rules/mining.js`'s 'pick' row already leans on (pushed every frame,
   rate-limited downstream by `data/sfx.js`'s MIN_GAP) is applied here
   directly rather than through that table: `data/sfx.js` belongs to a later
   phase this cycle, and 'refused' already carries no sound to throttle --
   only the toast text, which this local, transient side-table gates
   instead. Keyed by object identity rather than a field on the item record
   (`model/items.js`'s own header insists the shape stay monomorphic, and
   this is not that file's phase to edit): a removed item is simply never
   queried again and needs no explicit cleanup. */
const REFUSAL_GAP = 1.0;
const refusedAt = new WeakMap();
function refusalDue(it) {
  const last = refusedAt.get(it);
  if (last !== undefined && run.t - last < REFUSAL_GAP) return false;
  refusedAt.set(it, run.t);
  return true;
}

/* ---------- the drop verb ----------
   CLAUDE.md D4's own stated prerequisite: shipping the encumbrance lockout
   without a way to put material down would soft-lock an over-cap player.
   Spends exactly one unit of the HEAVIEST held pair -- the one that buys
   the most relief per item dropped, not the first in HUD order -- and hands
   it back to gravity at the player's feet, the same "material becomes a
   falling item" idiom (invariant 5) `rules/crafting.js` and
   `rules/trinkets.js#grant` already use, with a small toss read through
   `eff('tossUp')`/`eff('tossSpread')` (Phase 1 rows) rather than a fifth
   independently-chosen toss magnitude (docs/FINDINGS.md's toss-velocity
   finding). */
export function dropHeaviest() {
  if (run.dead || !player.band) return;

  let best = null, bestMass = -1;
  for (const k in run.inv) {
    const { sub, form } = parseKey(k);
    const m = massOfPair(sub, form);
    if (m > bestMass) { bestMass = m; best = { sub, form }; }
  }
  if (!best) return;
  if (!rw.spend(best.sub, best.form, 1)) return;

  const c = playerCentre();
  const at = { x: c.x, y: c.y + PH / 2 };
  const up = eff('tossUp'), spread = eff('tossSpread');
  iw.spawn(player.band, at.x, at.y, best.sub, best.form,
           (rand() - 0.5) * 2 * spread, -up);
  /* Reuses the 'place' journal kind -- see docs/FINDINGS.md: `shell/notify.js`
     and `data/sfx.js` (the only files that could name a dedicated 'dropped'
     kind and its text) are outside this phase's FILE OWNERSHIP, and 'place'
     already renders exactly this shape of row ({sub, form}) as
     "<PAIR> PLACED", which is the closest true statement already wired. */
  push('place', at, { sub: best.sub, form: best.form });
}

export function step(dt) {
  const grav = eff('grav'), term = eff('terminal');
  const pickupR = eff('pickupR');
  const c = playerCentre();

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.age += dt;

    if (it.rest > 0) wake(it);
    else if (!integrate(it, dt, grav, term)) { iw.remove(it); continue; }

    if (it.age > MAGNET_DELAY && !run.dead && near(it, c, pickupR)) {
      /* CLAUDE.md D4: a pickup that would cross the HARD cap is refused, and
         the item stays on the ground -- never partially collected. */
      if (burdenOf() + massOfPair(it.sub, it.form) > eff('burden') + MASS_EPS) {
        if (refusalDue(it))
          push('refused', { x: it.x, y: it.y }, { sub: it.sub, form: it.form, why: 'TOO HEAVY TO CARRY' });
      } else {
        rw.collect(it.sub, it.form, 1);
        push('pickup', { x: it.x, y: it.y }, { sub: it.sub, form: it.form });
        iw.remove(it);
      }
    }
  }

  if (items.length > MAX_ITEMS)
    for (const it of items.slice(0, items.length - MAX_ITEMS)) iw.remove(it);

  /* The spatial index is rebuilt once, AFTER every item has moved, so a catch
     box querying it this frame cannot see a stale position. */
  iw.reindex();
}

/* ---------- the swept step. Returns false if the item left the world. ---------- */
function integrate(it, dt, grav, term) {
  it.vy = Math.min(term, it.vy + grav * dt);

  const dx = it.vx * dt, dy = it.vy * dt;
  const half = sizeOf(it) / 2;

  /* No substep longer than half a tile, in either axis. This is the whole of
     the sweep and it is why nothing tunnels. */
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  const n = Math.max(1, Math.ceil(reach / (it.band.tile * 0.5)));

  for (let k = 0; k < n; k++) {
    if (!(it = hop(it, dx / n, dy / n, half))) return false;
    if (it.rest > 0) return true;                    // landed mid-sweep
  }
  return true;
}

/* One substep: x then y, each resolved on its own, so an item sliding along a
   wall does not lose its fall. */
function hop(it, dx, dy, half) {
  const b0 = it.band;

  if (dx) {
    const nx = it.x + dx;
    if (solidAt(b0, tileX(b0, nx + Math.sign(dx) * half), tileY(b0, it.y)))
      it.vx = -it.vx * BOUNCE;                       // slide off, do not embed
    else it.x = nx;
  }

  if (dy > 0) {
    const ny = it.y + dy;
    const b = cross(it, ny + half);
    if (!b) return null;                             // fell out of the world
    if (solidAt(b, tileX(b, it.x), tileY(b, ny + half))) {
      it.y = worldY(b, tileY(b, ny + half)) - half;
      it.vy = 0;
      it.vx *= BOUNCE;
      if (Math.abs(it.vx) < 3) it.vx = 0;
      it.rest = 1;
    } else {
      it.y = ny;
    }
  } else if (dy) {
    it.y += dy;                                      // rising: ejected produce
  }
  return it;
}

/* Band handoff, on the same terms as the player's: only ever into AIR, so an
   item never comes to rest inside solid rock. `it.band` is which band's tiles
   this item collides against, and `x`/`y` stay absolute world pixels. */
function cross(it, bottom) {
  const b = it.band;
  if (bottom < b.origin.y + heightPx(b)) return b;
  const nb = bandBelow(b);
  if (!nb) return null;
  if (solidAt(nb, tileX(nb, it.x), tileY(nb, bottom))) return b;
  it.band = nb;
  return nb;
}

/* A resting item whose support was dug out from under it falls again. This is
   the only reason `rest` is a flag rather than a deletion: a pile under a
   machine that is later moved has to spill. */
function wake(it) {
  const b = it.band, half = sizeOf(it) / 2;
  if (!solidAt(b, tileX(b, it.x), tileY(b, it.y + half + 1))) it.rest = 0;
}

const near = (it, c, r) => {
  const dx = it.x - c.x, dy = it.y - c.y;
  return dx * dx + dy * dy < r * r;
};
