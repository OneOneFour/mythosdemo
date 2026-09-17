/* rules layer — where the pick points, what it wears down, what breaks and what
   falls out. `model/mining.js` owns the accumulated seconds; this file decides
   that a tile has broken, comparing seconds against seconds so that no
   framerate makes anything unbreakable.

   Hardness is `baseHardAt` times `eff('hard', <substance>)`, applied in one
   place so a modifier cannot be read around. Tool tier is a separate gate:
   `tile.tier` against the held tool's tier scaled by
   `eff('toolTier', <substance>)` decides whether a swing is legal at all,
   while `hard` decides how long a legal swing takes. The tool's `power`
   multiplies `eff('pickPower')` in that same place. */

import { rand } from '../core/rng.js';
import { AIR, F, NATIVE } from '../data/forms.js';
import { S, SUB } from '../data/substances.js';
import { DROPS } from '../data/drops.js';
import { aim, write as aw } from '../model/aim.js';
import { activeCount as markCount, committedWithin, nearestWithin, write as qw } from '../model/digqueue.js';
import { push } from '../model/journal.js';
import { unitsCrossed, write as digw, workAt } from '../model/mining.js';
import { write as iw } from '../model/items.js';
import { eff } from '../model/mods.js';
import { PW, player, playerCentre } from '../model/player.js';
import { bestTool, hasPick, invCount, run } from '../model/run.js';
import { baseChargeAt, baseHardAt, dropAt, formAt, formOf, solidAt, subAt, tileAt, write as tw } from '../model/tiles.js';
import { bandAt, inBounds, tileX, tileY, worldX, worldY } from '../model/world.js';

/* A break above this many base seconds selects the stone journal kind rather
   than the soil one. Selects a kind, not a mechanic. */
const HARD_BREAK = 0.5;

/* Seconds between repeats of the tier refusal row, which a held dig key
   against an unbreakable wall would otherwise push every substep. One scalar
   rather than a per-tile map: one pick swings at one tile. */
const TIER_REFUSAL_GAP = 1.0;
let lastTierRefusal = -Infinity;

/* The aimed point resolves to a band before it resolves to a tile, which is
   what lets a shaft cross a band seam: aiming down from the last row of one
   band resolves into row 0 of the next. */

/* Mouse aim: the cursor, clamped to reach from the player's centre. */
export function aimAtWorld(wx, wy) {
  const c = playerCentre();
  const reach = eff('reach');
  let dx = wx - c.x, dy = wy - c.y;
  const d = Math.hypot(dx, dy);
  if (d > reach) { dx = dx / d * reach; dy = dy / d * reach; }
  resolve(c.x + dx, c.y + dy);
}

/* Keyboard fallback: the tile faced, or the one under or over the player. The
   6 x 16 px hitbox straddles two columns and fills two rows, so down and up
   pick the column, facing picks the row, and `up` beats a held sideways key. */
export function aimAtKeys(cmd) {
  const c = playerCentre();
  const b = player.band;
  if (!b) return;

  if (cmd.down && !cmd.left && !cmd.right) { resolveStraightDown(c, b); return; }
  if (cmd.up && !cmd.down) { resolveStraightUp(c, b); return; }
  if (!cmd.down) { resolveFacing(c, b); return; }
  resolve(c.x + player.face * b.tile, c.y + b.tile);          // down and sideways
}

/* Targets whichever of the two straddled columns is solid at the row below the
   feet, recomputed each call, so the two break sequentially. `PW` is 6 px on
   an 8 px tile and walk physics is not grid-snapped, so a fixed centre-x
   column would leave the other solid forever with the player wedged on it. */
function resolveStraightDown(c, b) {
  const py = c.y + b.tile;                       // the row just below the feet
  const bb = bandAt(c.x, py);
  if (!bb) { aw.set(null, 0, 0, false); return; }
  const ty = tileY(bb, py);
  const tx0 = tileX(bb, player.x), tx1 = tileX(bb, player.x + PW - 1);
  let target = tileX(bb, c.x);
  if (tx0 !== tx1) {
    if (solidAt(bb, tx0, ty)) target = tx0;
    else if (solidAt(bb, tx1, ty)) target = tx1;
  }
  aw.set(bb, target, ty, inBounds(bb, target, ty));
}

/* Probes the faced column at the centre row then the row above, so a two-tile
   obstacle can be cleared; both probes are inside `eff('reach')`. Occupied
   means not air rather than `solidAt` — a pegged rung is a legitimate target. */
function resolveFacing(c, b) {
  const px = c.x + player.face * b.tile;
  for (const py of [c.y, c.y - b.tile]) {
    const bb = bandAt(px, py);
    if (!bb) continue;
    const tx = tileX(bb, px), ty = tileY(bb, py);
    if (tileAt(bb, tx, ty) !== AIR) { aw.set(bb, tx, ty, inBounds(bb, tx, ty)); return; }
  }
  resolve(px, c.y);
}

/* Mirrors `resolveStraightDown` but reaches two rows, nearest first: breaking
   the first leaves the player in place, so one probe would find the air it had
   just made. Measured from the body's top edge, a third row would reach
   29.8 px against a reach of 25.6. Tests non-air, since nothing stands here. */
function resolveStraightUp(c, b) {
  for (let i = 0; i < 2; i++) {
    const py = player.y - 1 - i * b.tile;      // world px, just above the body
    const bb = bandAt(c.x, py);
    if (!bb) continue;
    const ty = tileY(bb, py);
    const tx0 = tileX(bb, player.x), tx1 = tileX(bb, player.x + PW - 1);
    let target = null;
    if (tileAt(bb, tx0, ty) !== AIR) target = tx0;
    else if (tx1 !== tx0 && tileAt(bb, tx1, ty) !== AIR) target = tx1;
    if (target !== null) { aw.set(bb, target, ty, inBounds(bb, target, ty)); return; }
  }
  resolve(c.x, c.y - b.tile);            // nothing overhead: the body's own head row
}

function resolve(px, py) {
  const b = bandAt(px, py);
  if (!b) { aw.set(null, 0, 0, false); return; }
  const tx = tileX(b, px), ty = tileY(b, py);
  aw.set(b, tx, ty, inBounds(b, tx, ty));
}

/* A native `timber` tile. Substance alone would count a placed `timber/rung`
   ladder; `NATIVE` alone would count any native tile. Out of bounds is bedrock
   and above a band is air, so both answer false with no boundary case. */
const trunkAt = (b, tx, ty) =>
  subAt(b, tx, ty) === S.timber && formAt(b, tx, ty) === NATIVE;

/* A held dig key swings at the reticle; otherwise the dig queue supplies a
   marked tile inside `eff('reach')`, through the same `swing`. The queue
   commits to one tile and asks `nearestWithin` only when nothing is
   committed — a column is the nearest mark for only about 8 px of travel. */
export function step(dt, cmd) {
  /* Pruned here rather than inside the queries that notice staleness, because
     `view` reads those queries and may not write to `model`. Ahead of every
     gate below, so a break or a restart drops its marks regardless. */
  if (markCount() > 0) qw.prune();

  if (run.dead || !hasPick()) return;

  if (cmd.dig) {
    /* The queue gives up its commitment while the hand is digging; the marks
       and the partial work stay. */
    qw.abandon();
    if (aim.valid && aim.band) swing(dt, aim.band, aim.tx, aim.ty);
    return;
  }

  /* Reach is measured from where the player stands; there is no pathfinding
     and no auto-walk. A tile this pick cannot break loses its mark, or
     `nearestWithin` hands back the same impossible tile every substep. */
  if (markCount() === 0) return;
  const c = playerCentre();
  const reach = eff('reach');
  let m = committedWithin(c.x, c.y, reach);
  if (!m) {
    m = nearestWithin(c.x, c.y, reach);
    if (!m) return;           // every mark is out of reach; they all persist
    qw.commit(m.b, m.tx, m.ty);
  }
  if (!swing(dt, m.b, m.tx, m.ty)) qw.unmark(m.b, m.tx, m.ty);
}

/* One dig substep against one tile. Returns false when this pick can never
   break it -- a tier gate, bedrock, an unmineable substance or bare air -- and
   true when work was credited or the tile broke. */
function swing(dt, b, tx, ty) {
  const byte = tileAt(b, tx, ty);
  if (byte === AIR) return false;

  const sub = subAt(b, tx, ty);

  /* A silent no-op on a wall the player is actively swinging at is
     unreadable, so the refusal is a rate-limited journal row. */
  const tool = bestTool();
  if (sub >= 0 && tool) {
    const tileTier = SUB[sub].tile?.tier ?? 1;
    const allowedTier = tool.tier * eff('toolTier', SUB[sub].id);
    if (tileTier > allowedTier) {
      if (run.t - lastTierRefusal >= TIER_REFUSAL_GAP) {
        lastTierRefusal = run.t;
        push('refused', { x: worldX(b, tx), y: worldY(b, ty) },
             { sub, why: 'TOO HARD FOR THIS PICK' });
      }
      return false;
    }
  }

  const hard = baseHardAt(b, tx, ty) * (sub < 0 ? 1 : eff('hard', SUB[sub].id));
  if (!(hard > 0) || !Number.isFinite(hard)) return false;   // bedrock, or unmineable

  /* A `deposit` tile yields `charge` units, each costing a full `hard` of
     work, so seconds per unit are unchanged; `charge` is 1 for everything
     else. `richness` is read here with `hard`, and floored at 1 — a tile that
     yields nothing is an unbreakable tile. */
  const charge = sub < 0 ? 1
    : Math.max(1, Math.round(baseChargeAt(b, tx, ty) * eff('richness', SUB[sub].id)));
  const total = hard * charge;

  const at = { x: worldX(b, tx), y: worldY(b, ty) };
  const before = workAt(b, tx, ty);
  const work = digw.add(b, tx, ty, dt * eff('pickPower') * (tool ? tool.power : 1));

  /* `progress` is per unit rather than per tile, so it describes this swing.
     `shell` rate-limits the row from `data/sfx.js`. */
  if (work > before && work < total)
    push('pick', at, { sub, progress: (work % hard) / hard });

  /* A unit chipped loose while the tile survives. Before the break test and
     never interleaved with it, because the draws below hold fixed positions in
     the seed's `rand()` stream. `unitsCrossed` caps one short of `charge`, so
     the final unit is the break branch's drop. */
  const crossed = unitsCrossed(before, work, hard, charge);
  if (crossed > 0) {
    const unit = dropAt(b, tx, ty);
    if (unit) for (let i = 0; i < crossed; i++) {
      /* Rolled unconditionally, ore included, so this draw's position in the
         `rand()` stream never depends on which substance is mined. Only
         `NATIVE` forms are gated, so a placed rung always comes back. */
      const roll = rand();
      if (formOf(byte) === NATIVE && sub >= 0 && roll >= eff('dropChance', SUB[sub].id)) continue;
      const dropped = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                               unit.sub, unit.form, (rand() - 0.5) * 24, -30 - rand() * 20);
      if (dropped) push('drop', at, { sub: unit.sub, form: unit.form });
    }
  }
  if (work < total) return true;

  /* Read the drop before clearing the tile. */
  const drop = dropAt(b, tx, ty);
  const dropRoll = rand();
  digw.clear(b, tx, ty);
  tw.clear(b, tx, ty);
  push(hard > HARD_BREAK ? 'breakHard' : 'breakSoft', at, { sub });

  /* `dropRoll` is drawn above, before the tile is cleared, so exactly one
     `rand()` is consumed regardless of outcome. */
  if (!drop) return true;
  if (formOf(byte) === NATIVE && sub >= 0 && dropRoll >= eff('dropChance', SUB[sub].id)) return true;
  const it = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                      drop.sub, drop.form, (rand() - 0.5) * 24, -30 - rand() * 20);
  if (it) push('drop', at, { sub: drop.sub, form: drop.form });

  /* The last tile of a trunk drops seeds. Two neighbour reads rather than a
     column scan: the last tile standing has no trunk above or below, and the
     clear has already run. `NATIVE` keeps a placed ladder out of it. */
  if (sub === S.timber && formOf(byte) === NATIVE
      && !trunkAt(b, tx, ty - 1) && !trunkAt(b, tx, ty + 1)) {
    const n = Math.max(0, Math.round(eff('seedYield')));
    for (let i = 0; i < n; i++) {
      const seed = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                            S.timber, F.seed, (rand() - 0.5) * 24, -30 - rand() * 20);
      if (seed) push('drop', at, { sub: S.timber, form: F.seed });
    }
  }

  /* Odds live in `data/drops.js`. Rolled immediately after the ordinary
     material drop, so both draw from fixed positions in the `rand()` stream.
     Skips a trinket already held. */
  for (const d of DROPS) {
    if (d.trigger !== 'mine') continue;
    const tileTier = sub >= 0 ? (SUB[sub].tile?.tier ?? 1) : 1;
    if (tileTier < d.minTier) continue;
    const giveSub = S[d.give];
    if (giveSub === undefined || invCount(giveSub, F.relic) > 0) continue;
    if (rand() < d.chance) {
      const dropAt = { x: at.x + b.tile / 2, y: at.y + b.tile / 2 };
      iw.spawn(b, dropAt.x, dropAt.y, giveSub, F.relic,
               (rand() - 0.5) * 24, -30 - rand() * 20);
      push('relic', dropAt, { sub: giveSub, form: F.relic });
    }
  }
  return true;
}
