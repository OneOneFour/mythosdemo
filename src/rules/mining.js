/* LAYER rules — MINING: where the pick points, what it wears down, what breaks
   and what falls out. Imports `core`, `data`, `model`. Imports no other `rules`
   module.

   ============================================================================
   WHERE THIS LIVES AND WHY. `model/mining.js` owns the accumulated seconds;
   this file owns the decision that a tile has broken and the consequence that
   material falls. Storage has the lifetime of the world; a decision has the
   lifetime of a frame.

   That split is not cosmetic. While progress lived inside the tile-storage
   module it was under constant pressure to be a byte in the same array as the
   material — and it became one, which made hard material permanently unmineable
   above a threshold framerate. Granite at 2.4 s died above 106 fps, i.e. on any
   120 Hz display. Progress is now seconds compared against seconds, and there
   is no framerate at which anything becomes unbreakable.
   ============================================================================

   HARDNESS IS BASE PLUS A MODIFIER, ALWAYS. `baseHardAt` deliberately returns
   the base, and the `hard` tunable is applied HERE, in exactly one place, so a
   trinket that softens one material cannot be read around. See
   docs/DEVELOPER_GUIDE.md#the-tunable-pipeline

   TOOL TIER IS A GATE ON TOP OF HARDNESS, NOT A SECOND HARDNESS (Phase 2c).
   `hard` decides how long a legal swing takes; `tile.tier` (absent means 1,
   `data/substances.js`) decides whether a swing is legal AT ALL, checked
   against the held tool's own tier (`model/run.js#bestTool()`, itself read off
   a relic substance's `item.tool` block) and scaled by `eff('toolTier', <the
   substance being struck>)` so a boon can lend a tier without touching mining
   speed. The tool's `power` multiplies `eff('pickPower')` in the same single
   place `hard` is applied above, for the same reason. */

import { rand } from '../core/rng.js';
import { AIR, F, NATIVE } from '../data/forms.js';
import { S, SUB } from '../data/substances.js';
import { DROPS } from '../data/drops.js';
import { aim, write as aw } from '../model/aim.js';
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

/* ---------- aiming ----------
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

/* Keyboard fallback: the tile the player faces, or the one under/over them.

   STRAIGHT DOWN (`cmd.down` with no horizontal key) is special-cased below,
   not resolved through the generic centre-x `resolve()`. Every other
   direction picks a single column fine, because the player is never wedged
   BY it — but straight down is exactly the tile `boxSolid` (`rules/player.js`)
   tests both columns of, and `PW` (6px, `model/player.js`) is narrower than a
   tile (8px), so continuous, never-grid-snapped walk physics almost never
   leaves `player.x` a multiple of the tile size. A fixed centre-x column
   breaks one of the two columns the hitbox straddles and leaves the other
   solid forever: the player is wedged standing on what reads as open air
   from directly overhead (docs/FINDINGS.md, "Machine status/hover/
   right-click-deconstruct pass"). */
export function aimAtKeys(cmd) {
  const c = playerCentre();
  const b = player.band;
  if (!b) return;

  if (cmd.down && !cmd.left && !cmd.right) { resolveStraightDown(c, b); return; }

  let px = c.x, py = c.y;
  if (cmd.down)    py += b.tile;
  else if (cmd.up) py -= b.tile;
  else             px += player.face * b.tile;
  if (cmd.down && (cmd.left || cmd.right)) px += player.face * b.tile;
  resolve(px, py);
}

/* Targets whichever of the two columns the player's hitbox can straddle is
   CURRENTLY solid at the row just below their feet — recomputed fresh every
   call, so no state is needed beyond `model/mining.js`'s existing per-tile
   work map. Once the targeted column breaks, the next resolve finds it no
   longer solid and retargets the other one if it still is, so the two break
   SEQUENTIALLY at their normal one-tile hardness cost each — never both at
   once for the price of one. When the player is tile-aligned (the two
   columns coincide) or neither column is currently blocking (e.g. digging
   ahead of a fall), this degenerates to the same centre-x column the old
   unconditional `resolve()` always used, so aligned play is unchanged. */
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

/* ---------- the step ---------- */
export function step(dt, cmd) {
  const b = aim.band;
  if (run.dead || !hasPick() || !cmd.dig || !aim.valid || !b) return;

  const byte = tileAt(b, aim.tx, aim.ty);
  if (byte === AIR) return;

  const sub = subAt(b, aim.tx, aim.ty);

  /* TOOL TIER GATE, on top of hardness, not a second hardness. A silent no-op
     on a wall you are actively swinging at is unreadable (CLAUDE.md), so a
     refusal is a rate-limited journal row, not nothing. */
  const tool = bestTool();
  if (sub >= 0 && tool) {
    const tileTier = SUB[sub].tile?.tier ?? 1;
    const allowedTier = tool.tier * eff('toolTier', SUB[sub].id);
    if (tileTier > allowedTier) {
      if (run.t - lastTierRefusal >= TIER_REFUSAL_GAP) {
        lastTierRefusal = run.t;
        push('refused', { x: worldX(b, aim.tx), y: worldY(b, aim.ty) },
             { sub, why: 'TOO HARD FOR THIS PICK' });
      }
      return;
    }
  }

  const hard = baseHardAt(b, aim.tx, aim.ty) * (sub < 0 ? 1 : eff('hard', SUB[sub].id));
  if (!(hard > 0) || !Number.isFinite(hard)) return;      // bedrock, or unmineable

  /* DEPLETION, and the whole of it (Phase 14b, D14-D). A `deposit` substance's
     tile yields `charge` units before it is gone, each unit costing a full
     `hard` of accumulated work -- so SECONDS PER UNIT ARE EXACTLY WHAT THEY
     WERE and only the walking between tiles changes. `charge` is 1 for
     everything else, which makes every line below a no-op on soil, stone and
     timber. `eff('richness', ...)` is read here, in the one place `hard` and
     `toolTier` are read, for the reason `model/tiles.js#baseChargeOf` states:
     so a boon that enriches a vein cannot be read around. Floored at 1
     because a tile that yields nothing is an unbreakable tile. */
  const charge = sub < 0 ? 1
    : Math.max(1, Math.round(baseChargeAt(b, aim.tx, aim.ty) * eff('richness', SUB[sub].id)));
  const total = hard * charge;

  const at = { x: worldX(b, aim.tx), y: worldY(b, aim.ty) };
  const before = workAt(b, aim.tx, aim.ty);
  const work = digw.add(b, aim.tx, aim.ty, dt * eff('pickPower') * (tool ? tool.power : 1));

  /* A strike that did not break anything is still a fact worth reporting: it is
     what gives the swing weight. `shell` rate-limits it from `data/sfx.js`.
     `progress` is per-UNIT, not per-tile, for the same reason
     `model/mining.js#unitProgressAt` exists: it describes this swing. */
  if (work > before && work < total)
    push('pick', at, { sub, progress: (work % hard) / hard });

  /* ---- a unit chipped loose, but the tile SURVIVES. A new branch BEFORE the
     break test, never interleaved with it: the rare-trinket roll below draws
     from a fixed position in the seed's `rand()` stream immediately after the
     break's own drop spawn (invariant 7), and that relative order is what must
     not move. `unitsCrossed` caps itself one short of `charge`, so the final
     unit is the break branch's drop and a tile never yields charge + 1. ---- */
  const crossed = unitsCrossed(before, work, hard, charge);
  if (crossed > 0) {
    const unit = dropAt(b, aim.tx, aim.ty);
    if (unit) for (let i = 0; i < crossed; i++) {
      const dropped = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                               unit.sub, unit.form, (rand() - 0.5) * 24, -30 - rand() * 20);
      if (dropped) push('drop', at, { sub: unit.sub, form: unit.form });
    }
  }
  if (work < total) return;

  /* ---- broken. Read the drop BEFORE clearing the tile. ---- */
  const drop = dropAt(b, aim.tx, aim.ty);
  digw.clear(b, aim.tx, aim.ty);
  tw.clear(b, aim.tx, aim.ty);
  push(hard > HARD_BREAK ? 'breakHard' : 'breakSoft', at, { sub });

  /* ARCHITECTURE invariant 5: mined material becomes a FALLING ITEM, never a
     direct inventory credit. This one line is the whole thesis of the game —
     dig a shaft and your ore collects at the bottom of it for free. */
  if (!drop) return;
  const it = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                      drop.sub, drop.form, (rand() - 0.5) * 24, -30 - rand() * 20);
  if (it) push('drop', at, { sub: drop.sub, form: drop.form });

  /* ---- THE LAST TILE OF A TRUNK DROPS A SEED (Phase 15,
     docs/PLAN-phase15-trees.md D15-A, docs/SPEC.md section 22). `log` is the
     only fuel in the game (`data/world.js`'s own `trees` row says so), so a
     felled forest is a run that has quietly ended; this is the way back.

     WHY THIS IS CODE AND NOT A `data/drops.js` ROW. That table is the
     existing "mining X also drops Y" hook and it was considered first: a row
     sees the SUBSTANCE and TIER of the tile just broken and nothing else.
     "The last remaining trunk tile" is a fact about the COLUMN, which no
     `DROPS` row can express and which the table must not be bent to try.
     This file is the only one that can make that decision.

     WHY TWO NEIGHBOUR READS AND NOT A COLUMN SCAN. A trunk is a contiguous
     vertical run of tiles, and it is felled one tile at a time from either
     end or from the middle outward -- so the last tile standing is, by
     definition, the one with no trunk above it and none below it. Two reads,
     no loop, no state, and correct for every felling order. `tw.clear` above
     has already run, so both reads are of the world AFTER this tile went.

     `formAt(...) === NATIVE` IS THE HALF THAT KEEPS A PLACED LADDER OUT.
     `subOf` reads `timber` for a `timber/rung` tile exactly as it does for a
     trunk -- the substance is the same and only the form differs -- so
     without the NATIVE test a player could peg rungs into a wall and mine
     them back out for free seeds. It is the same free predicate
     `view/paint.js#decorate` already uses to keep a crown off a placed tile.
     (Phase 14a's D14-H stripped `log`'s own `tile` block, so the placeable
     timber forms are now `rung`, `stair` and `seed` rather than four; the
     test is unchanged and excludes all of them, as it always did.)

     ONE SEED, ALWAYS, AND NOT A `chance`. `eff('seedYield')` is a value row
     and there is deliberately no `seedChance` beside it: a regrowth mechanic
     that sometimes gives you nothing is a mechanic that sometimes silently
     ends the timber economy. If scarcity is wanted later the lever is
     `treeGrowSecs`, not the odds.

     WHERE THIS SITS IN THE `rand()` STREAM IS LOAD-BEARING (invariant 7).
     It is AFTER the ordinary material drop above and BEFORE the `DROPS` loop
     below, so the rare-trinket roll keeps its exact position RELATIVE to
     that drop -- the property `data/drops.js`'s odds were measured against.
     The two `rand()` draws the toss below consumes are therefore a fixed,
     deterministic insertion rather than a moving one. This DOES change what
     an existing seed produces downstream of the first tree ever felled in a
     run, which is what adding any new spawn to this branch must; what
     invariant 7 requires is that `newRun(s)` twice still match, and it
     does. ---- */
  if (sub === S.timber && formOf(byte) === NATIVE
      && !trunkAt(b, aim.tx, aim.ty - 1) && !trunkAt(b, aim.tx, aim.ty + 1)) {
    const n = Math.max(0, Math.round(eff('seedYield')));
    for (let i = 0; i < n; i++) {
      const seed = iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2,
                            S.timber, F.seed, (rand() - 0.5) * 24, -30 - rand() * 20);
      if (seed) push('drop', at, { sub: S.timber, form: F.seed });
    }
  }

  /* ---- RARE TRINKET DROP, the one live trinket source.
     Reads the ODDS from `data/drops.js` so they live in one table a
     designer can tune without opening this file. Rolled through `rand()`
     and NOTHING ELSE (invariant 7: a run is bit-reproducible from its
     seed), immediately after the ordinary material drop above so both draw
     from the same fixed position in the same run's rand() stream every
     time. Skips a trinket already held -- one is enough, and a second copy
     would just be visual noise in the pockets. ---- */
  for (const d of DROPS) {
    if (d.trigger !== 'mine') continue;
    const tileTier = sub >= 0 ? (SUB[sub].tile?.tier ?? 1) : 1;
    if (tileTier < d.minTier) continue;
    const giveSub = S[d.give];
    if (giveSub === undefined || invCount(giveSub, F.relic) > 0) continue;
    if (rand() < d.chance)
      iw.spawn(b, at.x + b.tile / 2, at.y + b.tile / 2, giveSub, F.relic,
               (rand() - 0.5) * 24, -30 - rand() * 20);
  }
}
