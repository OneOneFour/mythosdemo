/* rules layer — the player step — walk, hop, ladder climb, gravity, terminal
   velocity, fall damage, axis-separated collision. Both axes step one pixel
   and snap flush against what they hit; a single swept AABB would lose the
   snap, and flush is what makes a 5-tile drop measure exactly 40 px.

   `moveY` must report a landing on both its exits, including coming to rest
   flush with no collision step, or fall damage never fires. The one-tile
   auto-step must apply on a ladder too, or a player at the top of a shaft
   wedges with their feet in the last rung. Every physics number comes from
   `eff()`; the hitbox is geometry and lives in `model/player.js`. */

import { clamp, lerp } from '../core/math.js';
import { FORM } from '../data/forms.js';
import { push } from '../model/journal.js';
import { eff } from '../model/mods.js';
import { PH, PW, fallHearts, player, write as pw } from '../model/player.js';
import { burdenFrac, run, write as rw } from '../model/run.js';
import { carrierTop, riddenCarrier } from '../model/segments.js';
import { climbAt, formAt, solidAt } from '../model/tiles.js';
import { bandAt, bands, heightPx, tileX, tileY, widthPx, worldX, worldY } from '../model/world.js';

export function step(dt, cmd) {
  if (run.dead) return;
  const b0 = player.band;
  if (!b0) return;

  /* Band handoff first, so everything below concerns the band the player is
     actually in. Bookkeeping only: what keeps a shaft from ending at an
     unbreakable band floor is the seam split in the probes below. */
  const b = reband(b0);
  if (b !== b0) pw.band(b);

  /* Presentation timers. In `model` because `view` reads them; decayed here
     because `view` may not write. */
  pw.set('landFlash', Math.max(0, player.landFlash - dt * 4));
  pw.set('hurtFlash', Math.max(0, player.hurtFlash - dt * 3));

  const walk = eff('walk'), climb = eff('climb'), hop = eff('hop');
  const grav = eff('grav'), term = eff('terminal');

  let onLadder = boxClimb(b, player.x, player.y);
  pw.set('onLadder', onLadder);

  /* A carrier is not terrain: it holds the player up the way a ladder does,
     through `model/segments.js#riddenCarrier` — the one predicate
     `rules/drive.js` reads too. A ladder wins, and burden is not consulted. */
  const riding = onLadder ? null : riddenCarrier();

  /* `frac` is the fraction of the hard cap carried; `overCap` refuses
     ladder-up and hop through a journal row. Level walking and every downward
     movement read neither. */
  const frac = burdenFrac(), overCap = frac >= 1;

  /* No acceleration: `vx` is the command itself, not a target. */
  const want = (cmd.right ? 1 : 0) - (cmd.left ? 1 : 0);
  if (want) pw.set('face', want);
  const vx = want * walk;

  let vy = player.vy;
  if (onLadder) {
    /* `climbK` is the ladder tier's own speed from `data/forms.js`, a property
       of the tile rather than the load, so it multiplies both directions.
       Burden touches only the ascending half below. */
    const climbK = boxClimbK(b, player.x, player.y);
    const laddSpeed = climb * climbK;
    const v = (cmd.down ? 1 : 0) - (cmd.up ? 1 : 0);
    if (v > 0) {
      /* Descending is never scaled by burden. */
      vy = v * laddSpeed;
    } else if (v < 0) {
      if (overCap) {
        vy = 0;                            // ladder-up refused at or over the cap
        if (cmd.up) push('refused', { x: player.x, y: player.y }, { why: 'TOO HEAVY TO CLIMB' });
      } else {
        const soft = eff('burdenSoft'), floor = eff('burdenClimbFloor');
        const mult = frac <= soft ? 1 : lerp(1, floor, (frac - soft) / (1 - soft));
        vy = v * laddSpeed * mult;
      }
    } else {
      vy = 0;
    }
    if (cmd.hop && !v) {
      if (overCap) push('refused', { x: player.x, y: player.y }, { why: 'TOO HEAVY TO CLIMB' });
      else { vy = -hop; onLadder = false; pw.set('onLadder', false); }
    }
  } else if (riding && !cmd.hop) {
    /* Gravity is not integrated and the deck is snapped flush, the way `moveY`
       snaps to a tile boundary, so `rules/drive.js`'s translation lands the
       rider on the deck. Refused into solid, which would wedge the player. */
    vy = 0;
    const ny = carrierTop(riding.seg, riding.c) - PH;
    if (ny !== player.y && !boxSolid(b, player.x, ny)) pw.move(player.x, ny);
  } else {
    if ((player.onGround || player.coyote > 0 || riding) && cmd.hop) {
      /* Hopping off a carrier is not burden-gated, so an over-cap rider can
         step onto a ledge; off the ground it is refused. */
      if (overCap && !riding) {
        push('refused', { x: player.x, y: player.y }, { why: 'TOO HEAVY TO CLIMB' });
      } else {
        vy = -hop;
        pw.set('onGround', false);
        pw.set('coyote', 0);
      }
    }
    vy = Math.min(term, vy + grav * dt);
  }
  pw.vel(vx, vy);

  const wasGround = player.onGround;
  moveX(b, vx * dt);
  const hitFloor = moveY(b, player.vy * dt);

  /* A carrier deck is a floor, resolved after `moveY`, which reads only the
     tile grid. `onGround` pins `fallFrom`, so no fall damage accrues aboard,
     though `land()` still fires on arrival. Re-queried rather than trusted
     from the top of the substep, since `moveX` may have walked off the edge. */
  const still = riding && !cmd.hop ? riddenCarrier() : null;
  const landed = !!still && still.c === riding.c;
  if (landed) pw.set('onGround', true);

  pw.set('coyote', player.onGround ? eff('coyote') : Math.max(0, player.coyote - dt));

  /* `fallFrom` is the apex of the current airborne arc, not the launch point,
     so the impact speed below equals sqrt(2gh) for the real drop even when the
     fall began with a hop. */
  if (wasGround && !player.onGround) pw.set('fallFrom', player.y);
  if (!player.onGround && !player.onLadder && player.y < player.fallFrom)
    pw.set('fallFrom', player.y);

  if ((hitFloor || landed) && !wasGround) land(b, term, grav);
  if (player.onGround || player.onLadder) pw.set('fallFrom', player.y);

  if (Math.abs(vx) > 1 && player.onGround) pw.set('walkPhase', player.walkPhase + dt * 7);
  else pw.set('walkPhase', 0);

  /* Keeps the player inside the band horizontally; band width is a row in
     `data/world.js`. */
  pw.move(clamp(player.x, b.origin.x, b.origin.x + widthPx(b) - PW), player.y);

  /* Below the last band there is nothing to land on and no band to hand off
     to. Reads `eff('fallMax')` so void death and ordinary fall lethality
     cannot disagree under a modifier. */
  const last = bands[bands.length - 1];
  if (last && player.y > last.origin.y + heightPx(last)) hurt(eff('fallMax'), 'THE VOID');

  rw.deepest(player.y);
}

/* Impact speed derives from the distance fallen rather than a per-frame
   velocity sample, so a drop costs the same hearts at any framerate. At
   `g = 320 px/s^2`, `v = sqrt(2 g h)`:

      5 tiles  ->   40 px  ->  160 px/s  ->  0 hearts
      8 tiles  ->   64 px  ->  202 px/s  ->  1 heart
     20 tiles  ->  160 px  ->  320 px/s  ->  5 hearts, lethal

   Both landings snap flush to a tile boundary, so `fallen` is an exact
   multiple of the tile size and the boundary cases land on the numbers. */
function land(b, term, grav) {
  const fallen = Math.max(0, player.y - player.fallFrom);
  const v = Math.min(term, Math.sqrt(2 * grav * fallen));
  pw.set('landFlash', Math.min(1, v / term));

  const h = fallHearts(v);
  if (h > 0) {
    /* The distance actually fallen, not one back-solved from velocity, which
       terminal velocity would under-report on a long drop. */
    const tiles = Math.max(1, Math.round(fallen / b.tile));
    hurt(h, `A ${tiles}-TILE FALL`);
  } else if (v > 60) {
    push('land', { x: player.x, y: player.y }, { v, fallen });
  }
}

export function hurt(n, cause) {
  if (run.dead) return;
  pw.set('hurtFlash', 1);
  rw.hurt(n, cause);
  push('hurt', { x: player.x, y: player.y }, { hearts: n, cause });
  if (run.dead) push('death', { x: player.x, y: player.y }, { cause: run.deathCause });
}

/* `bandAt` on the hitbox centre, one query about one point. Bands do not
   overlap, so the centre is in at most one; two leading-edge probes are both
   true for the 15 px a 16 px hitbox spends straddling a seam, which flips the
   band every substep and re-snaps flush with `vy` zeroed each time. */
function reband(b) {
  return bandAt(player.x + PW / 2, player.y + PH / 2) || b;
}

/* Every probe below walks world rows rather than band rows: a 16 px hitbox
   spans two bands for 15 px of a crossing, and `tileAt` reads bedrock past a
   band's last row and air above its first — a phantom floor and a lost top
   rung at a seam. Only rows are split, because a seam is horizontal. */

/* The band whose grid owns a world row, through the same `bandAt` query
   `reband` uses. The range test in front of it is the fast path. Falling back
   to `b` makes a column no band spans read as the edge of the world. */
function rowBand(b, x, wy) {
  if (wy >= b.origin.y && wy < b.origin.y + heightPx(b)) return b;
  return bandAt(x + PW / 2, wy) || b;
}

function boxSolid(b, x, y) {
  const bot = y + PH - 1;
  for (let wy = y; wy <= bot;) {
    const rb = rowBand(b, x, wy), ty = tileY(rb, wy);
    for (let tx = tileX(rb, x), t1 = tileX(rb, x + PW - 1); tx <= t1; tx++)
      if (solidAt(rb, tx, ty)) return true;
    wy = worldY(rb, ty + 1);      // top of the next row; always > wy, so this ends
  }
  return false;
}

function boxClimb(b, x, y) {
  const bot = y + PH - 1;
  for (let wy = y; wy <= bot;) {
    const rb = rowBand(b, x, wy), ty = tileY(rb, wy);
    for (let tx = tileX(rb, x), t1 = tileX(rb, x + PW - 1); tx <= t1; tx++)
      if (climbAt(rb, tx, ty)) return true;
    wy = worldY(rb, ty + 1);
  }
  return false;
}

/* The fastest `climbK` among the occupied tiles, so a player straddling two
   ladder tiers gets the better. Absent on every form but `stair`, so a rung
   reads as 1; native tiles never carry `climb:true`, so `formAt` here is
   always a placed form. */
function boxClimbK(b, x, y) {
  const bot = y + PH - 1;
  let k = 1;
  for (let wy = y; wy <= bot;) {
    const rb = rowBand(b, x, wy), ty = tileY(rb, wy);
    for (let tx = tileX(rb, x), t1 = tileX(rb, x + PW - 1); tx <= t1; tx++)
      if (climbAt(rb, tx, ty)) {
        const f = formAt(rb, tx, ty);
        if (f >= 0 && FORM[f].climbK) k = Math.max(k, FORM[f].climbK);
      }
    wy = worldY(rb, ty + 1);
  }
  return k;
}

function moveX(b, d) {
  if (!d) return;
  const step = Math.sign(d);
  let rem = Math.abs(d);
  while (rem > 0) {
    const amt = Math.min(1, rem) * step;
    const nx = player.x + amt;
    if (boxSolid(b, nx, player.y)) {
      /* Auto-step a single-tile lip. Both headroom probes are required — the
         destination column and the current one — or the step teleports through
         a one-tile ceiling gap. Applies on a ladder, and is never
         burden-gated: gating a height gain on state wedges a player. */
      if ((player.onGround || player.onLadder) &&
          !boxSolid(b, nx, player.y - b.tile) &&
          !boxSolid(b, player.x, player.y - b.tile)) {
        pw.move(nx, player.y - b.tile);
        rem -= 1;
        continue;
      }
      pw.move(step > 0 ? worldX(b, tileX(b, nx + PW - 1)) - PW
                       : worldX(b, tileX(b, nx)) + b.tile, player.y);
      pw.vel(0, player.vy);
      return;
    }
    pw.move(nx, player.y);
    rem -= 1;
  }
}

/* Returns true if this step ended with the player standing on a floor they
   were not standing on before. Both exits must be able to say so: the
   collision exit and the ran-out-of-travel exit. */
function moveY(b, d) {
  pw.set('onGround', false);
  const grounded = () => boxSolid(b, player.x, player.y + 1);

  if (!d) { pw.set('onGround', grounded()); return false; }

  const step = Math.sign(d);
  let rem = Math.abs(d);
  while (rem > 0) {
    const amt = Math.min(1, rem) * step;
    const ny = player.y + amt;
    if (boxSolid(b, player.x, ny)) {
      /* Snapped in the band that owns the row that blocked, which on a seam is
         not the band the player is in. The blocking row is always the leading
         one — the box was clear a pixel ago — so resolving the band for that
         one pixel keeps flush flush across a seam. */
      if (step > 0) {                                     // hit a floor
        const fb = rowBand(b, player.x, ny + PH - 1);
        pw.move(player.x, worldY(fb, tileY(fb, ny + PH - 1)) - PH);
        pw.set('onGround', true);
        pw.vel(player.vx, 0);
        return true;
      }
      const cb = rowBand(b, player.x, ny);                // bonked a ceiling
      pw.move(player.x, worldY(cb, tileY(cb, ny)) + cb.tile);
      pw.vel(player.vx, 0);
      pw.set('onGround', grounded());
      return false;
    }
    pw.move(player.x, ny);
    rem -= 1;
  }
  pw.set('onGround', grounded());
  return step > 0 && player.onGround;                     // came to rest flush
}
