/* rules layer — falling material — gravity, landing, resting, pickup.

   Collision is swept: motion splits into substeps no longer than half a tile,
   so no solid tile is skipped at any dt. Point-sampling the tile under an
   integrated position instead would tunnel through a one-tile floor at
   terminal velocity, which is a tile and a half per 30 ms frame. */

import { rand } from '../core/rng.js';
import { push } from '../model/journal.js';
import { items, massOfPair, sizeOf, write as iw } from '../model/items.js';
import { eff } from '../model/mods.js';
import { PH, player, playerCentre } from '../model/player.js';
import { burdenOf, run, write as rw } from '../model/run.js';
import { solidAt } from '../model/tiles.js';
import { bandBelow, heightPx, tileX, tileY, worldY } from '../model/world.js';

/* Hard cap on live items; an unbounded pile is a frame-time leak. */
const MAX_ITEMS = 400;

/* Seconds a drop must age before it may be pocketed. */
const MAGNET_DELAY = 0.35;

/* Fraction of horizontal speed kept after a bounce. */
const BOUNCE = 0.3;

/* Slack so a pickup landing exactly on the hard cap succeeds rather than
   failing on a rounding hair. */
const MASS_EPS = 1e-6;

/* Seconds between repeats of a refusal journal row, which would otherwise
   push every substep the item sits in the pickup radius. Keyed by object
   identity to keep the item record monomorphic; a removed item is never
   queried again, so nothing needs cleaning up. */
const REFUSAL_GAP = 1.0;
const refusedAt = new WeakMap();
function refusalDue(it) {
  const last = refusedAt.get(it);
  if (last !== undefined && run.t - last < REFUSAL_GAP) return false;
  refusedAt.set(it, run.t);
  return true;
}

/* Spend one unit of the heaviest held pair and respawn it at the player's
   feet, tossed by `eff('tossUp')` / `eff('tossSpread')`. */
export function dropHeaviest() {
  if (run.dead || !player.band) return;

  let best = null, bestMass = -1;
  for (const slot of run.inv) {
    if (!slot) continue;
    const m = massOfPair(slot.sub, slot.form);
    if (m > bestMass) { bestMass = m; best = { sub: slot.sub, form: slot.form }; }
  }
  if (!best) return;
  if (!rw.spend(best.sub, best.form, 1)) return;

  const c = playerCentre();
  const at = { x: c.x, y: c.y + PH / 2 };
  const up = eff('tossUp'), spread = eff('tossSpread');
  iw.spawn(player.band, at.x, at.y, best.sub, best.form,
           (rand() - 0.5) * 2 * spread, -up);
  /* The 'place' journal kind renders a `{sub, form}` row as "<PAIR> PLACED". */
  push('place', at, { sub: best.sub, form: best.form });
}

/* Pickup fires only while `cmd.collect` is true; `shell/main.js#step` folds
   `ui.autoCollect || cmd.collect` into it before calling. */
export function step(dt, cmd) {
  const grav = eff('grav'), term = eff('terminal');
  const pickupR = eff('pickupR');
  const c = playerCentre();

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.age += dt;

    if (it.rest > 0) wake(it);
    else if (!integrate(it, dt, grav, term)) { iw.remove(it); continue; }

    if (cmd.collect && it.age > MAGNET_DELAY && !run.dead && near(it, c, pickupR)) {
      /* Tested before the slot-capacity refusal below. An over-cap pickup
         leaves the item on the ground rather than partially collecting it. */
      if (burdenOf() + massOfPair(it.sub, it.form) > eff('burden') + MASS_EPS) {
        if (refusalDue(it))
          push('refused', { x: it.x, y: it.y }, { sub: it.sub, form: it.form, why: 'TOO HEAVY TO CARRY' });
      } else if (!rw.collect(it.sub, it.form, 1)) {
        /* `model/run.js#write.collect` refused: no stack of this exact pair
           and no free main slot. */
        if (refusalDue(it))
          push('refused', { x: it.x, y: it.y }, { sub: it.sub, form: it.form, why: 'INVENTORY FULL' });
      } else {
        push('pickup', { x: it.x, y: it.y }, { sub: it.sub, form: it.form });
        iw.remove(it);
      }
    }
  }

  if (items.length > MAX_ITEMS)
    for (const it of items.slice(0, items.length - MAX_ITEMS)) iw.remove(it);

  /* Rebuilt once, after every item has moved, so a catch box querying it this
     substep cannot see a stale position. */
  iw.reindex();
}

/* Returns false if the item left the world. */
function integrate(it, dt, grav, term) {
  it.vy = Math.min(term, it.vy + grav * dt);

  const dx = it.vx * dt, dy = it.vy * dt;
  const half = sizeOf(it) / 2;

  /* No substep longer than half a tile, in either axis. */
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

/* A resting item whose support was dug out falls again, which is why `rest` is
   a flag rather than a deletion. */
function wake(it) {
  const b = it.band, half = sizeOf(it) / 2;
  if (!solidAt(b, tileX(b, it.x), tileY(b, it.y + half + 1))) it.rest = 0;
}

const near = (it, c, r) => {
  const dx = it.x - c.x, dy = it.y - c.y;
  return dx * dx + dy * dy < r * r;
};
