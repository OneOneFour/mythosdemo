/* LAYER rules — MINING: where the pick points, what it wears down, what
   breaks and what falls out. Imports `core`, `data`, `model`, and no other
   `rules` module.

   `model/mining.js` owns the accumulated seconds; this file owns the decision
   that a tile has broken. While progress lived in the tile-storage module it
   became a BYTE in the same array as the material, which made granite
   permanently unmineable above 106 fps -- any 120 Hz display. Progress is
   seconds compared against seconds, so there is no framerate at which
   anything becomes unbreakable.

   HARDNESS IS BASE PLUS A MODIFIER, ALWAYS. `baseHardAt` returns the base and
   the `hard` tunable is applied HERE, in exactly one place, so a trinket that
   softens one material cannot be read around.

   TOOL TIER IS A GATE ON TOP OF HARDNESS, NOT A SECOND HARDNESS. `hard`
   decides how long a legal swing takes; `tile.tier` decides whether a swing is
   legal AT ALL, checked against the held tool's tier and scaled by
   `eff('toolTier', <substance>)`, so a boon can lend a tier without touching
   speed. The tool's `power` multiplies `eff('pickPower')` in the same single
   place `hard` is applied. */

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

/* A break above this many BASE seconds reads as stone rather than as soil. The
   only number in this file, and it selects a journal kind — not a mechanic. */
const HARD_BREAK = 0.5;

/* Rate limit for the tier refusal below, mirroring `rules/items.js`'s own
   idiom for a refused pickup: 'refused' carries no sound to gap it downstream
   in `data/sfx.js`, only the toast text, so a held dig key against a wall it
   cannot bite must not repaint that toast sixty times a second. A single
   scalar, not a WeakMap keyed by tile -- there is exactly one pick swinging at
   exactly one tile at a time. */
const TIER_REFUSAL_GAP = 1.0;
let lastTierRefusal = -Infinity;

/* aiming
   The aimed point is resolved to a BAND before it is resolved to a tile, which
   is what lets a shaft continue across a band seam: standing on the last row of
   the surface band and aiming down resolves into the topsoil band's row 0. The
   alternative — band-local tiles only — makes the bottom of every band an
   unbreakable floor. */

/* Mouse aim: the cursor, clamped to reach from the player's centre. */
export function aimAtWorld(wx, wy) {
  const c = playerCentre();
  const reach = eff('reach');
  let dx = wx - c.x, dy = wy - c.y;
  const d = Math.hypot(dx, dy);
  if (d > reach) { dx = dx / d * reach; dy = dy / d * reach; }
  resolve(c.x + dx, c.y + dy);
}

/* Keyboard fallback: the tile the player faces, or the one under or over them.

   THREE DIRECTIONS ARE SPECIAL-CASED, for one reason on two axes. The hitbox
   is 6 x 16 px on an 8 px tile, so it straddles two columns and fills two
   rows, and a single centre point picks the wrong one of the pair. Straight
   down and up pick the COLUMN; facing picks the ROW. Down-and-sideways keeps
   the generic centre-x resolve, since a diagonal aim has a tile of slack on
   both axes. A held horizontal key is IGNORED while `up` is held. */
export function aimAtKeys(cmd) {
  const c = playerCentre();
  const b = player.band;
  if (!b) return;

  if (cmd.down && !cmd.left && !cmd.right) { resolveStraightDown(c, b); return; }
  if (cmd.up && !cmd.down) { resolveStraightUp(c, b); return; }
  if (!cmd.down) { resolveFacing(c, b); return; }
  resolve(c.x + player.face * b.tile, c.y + b.tile);          // down and sideways
}

/* Targets whichever of the two straddled columns is CURRENTLY solid at the
   row just below the feet, recomputed every call, so no state is needed. Once
   it breaks, the next resolve retargets the other if it is still solid, so the
   two break SEQUENTIALLY at their own one-tile cost rather than both at once
   for the price of one.

   `PW` is 6 px against an 8 px tile and walk physics is never grid-snapped, so
   a fixed centre-x column breaks one of the two columns `boxSolid` tests and
   leaves the other solid forever -- the player then stands wedged on what
   reads as open air from directly overhead. */
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

/* The bare horizontal aim, and the aim with no direction held. The body fills
   two rows and only one need hold the tile in the way, so this takes the first
   OCCUPIED of the two in the faced column -- centre row first, the row above
   second, so a wall comes down belly-height then head-height.

   The SECOND probe is what makes the aim ADVANCE through an obstacle rather
   than expire on its own work: with only the centre row, a keyboard player
   could not clear anything two tiles tall. Both probes sit inside
   `eff('reach')` BY CONSTRUCTION. OCCUPIED means not air rather than
   `solidAt`, because a pegged rung is a legitimate thing to swing at. */
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

/* The mirror of `resolveStraightDown`, reaching TWO rows because nothing moves
   the player up out of its own work: the first tile that is not AIR in the two
   rows above the body, nearest first.

   THE SECOND ROW IS WHAT MAKES A TWO-TILE CEILING COME DOWN -- breaking the
   first leaves the player where they were, so a single probe finds the air it
   just made and expires. Both rows sit inside `eff('reach')` BY CONSTRUCTION,
   measured from the body's top edge rather than a row index; A THIRD ROW
   REACHES 29.8 px against a reach of 25.6. Straight down tests `solidAt`
   instead, because nothing stands on a ceiling. */
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

/* IS THIS TILE PART OF A STANDING TRUNK? Both halves are needed and neither
   is enough. The SUBSTANCE test alone would count a placed `timber/rung`
   ladder as trunk (a rung's byte reads `timber` through `subOf` just as a
   trunk's does -- only the form differs); the NATIVE test alone would count
   any native tile at all, so a trunk sitting on soil would never read as
   felled. Out of bounds is BEDROCK and above a band is AIR, both of which
   answer `false` here with no boundary case -- which is what lets the seed
   drop below read one tile past the top of the world without checking.
   See the seed-drop block in `step` for why this is the whole test. */
const trunkAt = (b, tx, ty) =>
  subAt(b, tx, ty) === S.timber && formAt(b, tx, ty) === NATIVE;

/* TWO SOURCES OF A TARGET, AND THE HAND ALWAYS WINS. A held dig key swings at
   the reticle; with nothing held, the dig queue supplies a marked tile inside
   `eff('reach')`. Both routes go through the one `swing`, so a queued tile
   costs exactly what a hand-swung one costs at any framerate.

   THE QUEUE COMMITS TO ONE TILE AND FINISHES IT -- `nearestWithin` is asked
   only when nothing is committed. Re-deciding every frame was measured and
   does not work: a column is the nearest mark for about 8 px of travel, 0.13 s
   against soil's 0.50 s, so a painted seam finished nothing. */
export function step(dt, cmd) {
  /* Stale marks are collected HERE, once per substep, and not inside the
     queries that notice them: `view` reads those queries and `view` may not
     write to `model` (`model/digqueue.js`'s header). Ahead of every gate
     below, because none of them is a reason to keep a mark on a tile that is
     no longer that tile: a hand dig must stop the mark spending cap the frame
     it breaks, and a restart's marks must go even though the fresh run has not
     found its pick yet. */
  if (markCount() > 0) qw.prune();

  if (run.dead || !hasPick()) return;

  if (cmd.dig) {
    /* The hand is the intent, so the queue's commitment goes with it rather
       than being resumed the instant the button comes up somewhere else. The
       marks stay and the partial work stays; only the choice is given up. */
    qw.abandon();
    if (aim.valid && aim.band) swing(dt, aim.band, aim.tx, aim.ty);
    return;
  }

  /* NO PATHFINDING AND NO AUTO-WALK. Reach is measured from where the player is
     STANDING, which is why the queue does not make mining something you watch.

     A TILE THIS PICK CANNOT BREAK LOSES ITS MARK, the only thing the queue
     does that a hand swing does not. Leaving the mark makes the nearest query
     hand back the same impossible tile every substep forever -- a stalled
     queue, and a mark that reads as merely deferred. */
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

  /* TOOL TIER GATE, on top of hardness, not a second hardness. A silent no-op
     on a wall you are actively swinging at is unreadable, so a
     refusal is a rate-limited journal row, not nothing. */
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

  /* DEPLETION, and the whole of it. A `deposit` substance's
     tile yields `charge` units before it is gone, each unit costing a full
     `hard` of accumulated work -- so SECONDS PER UNIT ARE EXACTLY WHAT THEY
     WERE and only the walking between tiles changes. `charge` is 1 for
     everything else, which makes every line below a no-op on soil, stone and
     timber. `eff('richness', ...)` is read here, in the one place `hard` and
     `toolTier` are read, for the reason `model/tiles.js#baseChargeOf` states:
     so a boon that enriches a vein cannot be read around. Floored at 1
     because a tile that yields nothing is an unbreakable tile. */
  const charge = sub < 0 ? 1
    : Math.max(1, Math.round(baseChargeAt(b, tx, ty) * eff('richness', SUB[sub].id)));
  const total = hard * charge;

  const at = { x: worldX(b, tx), y: worldY(b, ty) };
  const before = workAt(b, tx, ty);
  const work = digw.add(b, tx, ty, dt * eff('pickPower') * (tool ? tool.power : 1));

  /* A strike that did not break anything is still a fact worth reporting: it is
     what gives the swing weight. `shell` rate-limits it from `data/sfx.js`.
     `progress` is per-UNIT, not per-tile, for the same reason
     `model/mining.js#unitProgressAt` exists: it describes this swing. */
  if (work > before && work < total)
    push('pick', at, { sub, progress: (work % hard) / hard });

  /* a unit chipped loose, but the tile SURVIVES. A new branch BEFORE the
     break test, never interleaved with it: the rare-trinket roll below draws
     from a fixed position in the seed's `rand()` stream immediately after the
     break's own drop spawn, and that relative order is what must
     not move. `unitsCrossed` caps itself one short of `charge`, so the final
     unit is the break branch's drop and a tile never yields charge + 1. */
  const crossed = unitsCrossed(before, work, hard, charge);
  if (crossed > 0) {
    const unit = dropAt(b, tx, ty);
    if (unit) for (let i = 0; i < crossed; i++) {
      /* YIELD QUALITY (`eff('dropChance', ...)`, `data/tuning.js`). Rolled
         unconditionally, ore included, so this draw's position in the
         seed's `rand()` stream never depends on which substance is being
         mined -- only NATIVE forms are gated at all, so pulling a placed
         rung back out is never subject to the roll. */
      const roll = rand();
      if (formOf(byte) === NATIVE && sub >= 0 && roll >= eff('dropChance', SUB[sub].id)) continue;
      const dropped = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                               unit.sub, unit.form, (rand() - 0.5) * 24, -30 - rand() * 20);
      if (dropped) push('drop', at, { sub: unit.sub, form: unit.form });
    }
  }
  if (work < total) return true;

  /* broken. Read the drop BEFORE clearing the tile. */
  const drop = dropAt(b, tx, ty);
  const dropRoll = rand();
  digw.clear(b, tx, ty);
  tw.clear(b, tx, ty);
  push(hard > HARD_BREAK ? 'breakHard' : 'breakSoft', at, { sub });

  /* Mined material becomes a FALLING ITEM, never a direct inventory credit.
     This one line is the whole thesis of the game -- dig a shaft and your ore
     collects at the bottom of it for free.

     `dropRoll` above is drawn BEFORE the tile is cleared, so it always
     consumes exactly one `rand()` regardless of outcome. A real ore's chance
     is 1.0, so the roll always passes for it. */
  if (!drop) return true;
  if (formOf(byte) === NATIVE && sub >= 0 && dropRoll >= eff('dropChance', SUB[sub].id)) return true;
  const it = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                      drop.sub, drop.form, (rand() - 0.5) * 24, -30 - rand() * 20);
  if (it) push('drop', at, { sub: drop.sub, form: drop.form });

  /* THE LAST TILE OF A TRUNK DROPS A SEED, and `log` is the only fuel the game
     can MINE, so this is the way back from a felled forest. TWO NEIGHBOUR
     READS AND NOT A COLUMN SCAN: a trunk is felled from either end or the
     middle outward, so the last tile standing has no trunk above and none
     below, and the tile clear has already run.

     `formAt(...) === NATIVE` KEEPS A PLACED LADDER OUT, or a player pegs rungs
     into a wall and mines them out for free seeds. Sits AFTER the ordinary
     drop and BEFORE the `DROPS` loop, so the trinket roll keeps its position
     in the stream. */
  if (sub === S.timber && formOf(byte) === NATIVE
      && !trunkAt(b, tx, ty - 1) && !trunkAt(b, tx, ty + 1)) {
    const n = Math.max(0, Math.round(eff('seedYield')));
    for (let i = 0; i < n; i++) {
      const seed = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                            S.timber, F.seed, (rand() - 0.5) * 24, -30 - rand() * 20);
      if (seed) push('drop', at, { sub: S.timber, form: F.seed });
    }
  }

  /* RARE TRINKET DROP, the one live trinket source. The odds live in
     `data/drops.js`, so a designer tunes them without opening this file.
     Rolled through `rand()` and nothing else, immediately after the ordinary
     material drop, so both draw from a fixed position in the stream. Skips a
     trinket already held. */
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
