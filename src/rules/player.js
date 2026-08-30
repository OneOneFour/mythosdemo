/* LAYER rules — THE PLAYER STEP. Walk, hop, ladder climb, gravity, terminal
   velocity, fall damage, and the axis-separated collision resolution.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   ============================================================================
   THE COLLISION RESOLUTION BELOW IS PORTED, NOT REWRITTEN. Its comments record
   three bugs that cost real debugging time, and every one of them is a case
   that looks like it cannot happen:

     1  `moveY` must report a landing in EVERY case, including the one where the
        player comes to rest flush without a collision step ever firing. That is
        how fall damage first went missing entirely.
     2  the one-tile auto-step must ALSO apply while on a ladder. A player who
        climbs to the top of a shaft hangs with their feet in the last rung, a
        pixel or two below the lip, and without the ladder case they are wedged
        in their own shaft forever.
     3  every field must be reset on spawn (`model/player.js` does this), or
        jump grace and animation phase survive a restart and two runs of the
        same seed render differently.

   Do not "simplify" this into a single swept AABB. The one-pixel stepping is
   what makes the snap flush, and flush is what makes a 5-tile drop measure
   exactly 40 px.
   ============================================================================

   Every physics number comes from `eff()`, so a god's boon can bend walk speed,
   hop height, gravity and both fall-damage thresholds. There is no module
   constant here for anyone to read around; the hitbox is in `model/player.js`
   because a hitbox is geometry, not a tunable. */

import { clamp } from '../core/math.js';
import { push } from '../model/journal.js';
import { eff } from '../model/mods.js';
import { PH, PW, fallHearts, player, write as pw } from '../model/player.js';
import { run, write as rw } from '../model/run.js';
import { climbAt, solidAt } from '../model/tiles.js';
import { bandAbove, bandBelow, bands, heightPx, tileX, tileY, widthPx, worldX, worldY } from '../model/world.js';

export function step(dt, cmd) {
  if (run.dead) return;
  const b0 = player.band;
  if (!b0) return;

  /* Band handoff FIRST, so collision resolves against the tiles the player is
     actually standing in. A band's out-of-bounds rows read BEDROCK, so without
     this a shaft dug to the bottom of a band ends at an unbreakable floor. */
  const b = reband(b0);
  if (b !== b0) pw.band(b);

  /* Presentation timers. In `model` because `view` reads them; decayed here
     because `view` may not write. This is the sibling rule doing its job. */
  pw.set('landFlash', Math.max(0, player.landFlash - dt * 4));
  pw.set('hurtFlash', Math.max(0, player.hurtFlash - dt * 3));

  const walk = eff('walk'), climb = eff('climb'), hop = eff('hop');
  const grav = eff('grav'), term = eff('terminal');

  let onLadder = boxClimb(b, player.x, player.y);
  pw.set('onLadder', onLadder);

  /* ---- horizontal: no acceleration, on purpose. This is a digging game and a
          momentum model makes a 1-tile corridor infuriating. ---- */
  const want = (cmd.right ? 1 : 0) - (cmd.left ? 1 : 0);
  if (want) pw.set('face', want);
  const vx = want * walk;

  /* ---- vertical ---- */
  let vy = player.vy;
  if (onLadder) {
    /* Gravity is off on a ladder and travel is half walk speed in BOTH
       directions. Down is free everywhere else; a ladder is the one place
       descending costs the same as ascending. */
    const v = (cmd.down ? 1 : 0) - (cmd.up ? 1 : 0);
    vy = v * climb;
    if (cmd.hop && !v) { vy = -hop; onLadder = false; pw.set('onLadder', false); }
  } else {
    if ((player.onGround || player.coyote > 0) && cmd.hop) {
      vy = -hop;
      pw.set('onGround', false);
      pw.set('coyote', 0);
    }
    vy = Math.min(term, vy + grav * dt);
  }
  pw.vel(vx, vy);

  /* ---- move and resolve, one axis at a time ---- */
  const wasGround = player.onGround;
  moveX(b, vx * dt);
  const hitFloor = moveY(b, player.vy * dt);

  pw.set('coyote', player.onGround ? eff('coyote') : Math.max(0, player.coyote - dt));

  /* `fallFrom` is the APEX of the current airborne arc, not the launch point.
     Tracking the apex is what makes the impact speed below equal sqrt(2gh) for
     the real drop even when the fall started with a hop. */
  if (wasGround && !player.onGround) pw.set('fallFrom', player.y);
  if (!player.onGround && !player.onLadder && player.y < player.fallFrom)
    pw.set('fallFrom', player.y);

  if (hitFloor && !wasGround) land(b, term, grav);
  if (player.onGround || player.onLadder) pw.set('fallFrom', player.y);

  if (Math.abs(vx) > 1 && player.onGround) pw.set('walkPhase', player.walkPhase + dt * 7);
  else pw.set('walkPhase', 0);

  /* Keep inside the band horizontally; a band is the world as far as the player
     is concerned, and its width is a row in `data/world.js`. */
  pw.move(clamp(player.x, b.origin.x, b.origin.x + widthPx(b) - PW), player.y);

  /* Below the last band there is nothing to land on and no band to hand off
     to, so falling out of the world is fatal rather than infinite. */
  const last = bands[bands.length - 1];
  if (last && player.y > last.origin.y + heightPx(last)) hurt(5, 'THE VOID');

  rw.deepest(player.y);
}

/* ---------- landing ----------
   Impact speed is derived from the DISTANCE FALLEN and not from a per-frame
   velocity sample, so the same drop costs the same hearts at any framerate and
   the table in docs/SPEC.md is exact rather than approximate:

     40 px (5 tiles)  -> sqrt(2*320*40)  = 160 px/s -> 0 hearts
     64 px (8 tiles)  -> sqrt(2*320*64)  = 202 px/s -> 1 heart
     160 px (20 tiles)-> sqrt(2*320*160) = 320 px/s -> 5 hearts, lethal

   Both landings snap flush to a tile boundary, so `fallen` is always an exact
   multiple of the tile size and the boundary cases land ON the numbers. */
function land(b, term, grav) {
  const fallen = Math.max(0, player.y - player.fallFrom);
  const v = Math.min(term, Math.sqrt(2 * grav * fallen));
  pw.set('landFlash', Math.min(1, v / term));

  const h = fallHearts(v);
  if (h > 0) {
    /* Report the distance ACTUALLY fallen, not one back-solved from velocity:
       terminal velocity would under-report a very long drop. */
    const tiles = Math.max(1, Math.round(fallen / b.tile));
    hurt(h, `A ${tiles}-TILE FALL`);
  } else if (v > 60) {
    push('land', { x: player.x, y: player.y }, { v, fallen });
  }
}

/* Damage is a `rules` decision with a `model` consequence, and the notification
   is a journal row — never a `play()` call. `shell/notify.js` is what makes
   noise, and a call from here to `shell` would be an upward edge. */
export function hurt(n, cause) {
  if (run.dead) return;
  pw.set('hurtFlash', 1);
  rw.hurt(n, cause);
  push('hurt', { x: player.x, y: player.y }, { hearts: n, cause });
  if (run.dead) push('death', { x: player.x, y: player.y }, { cause: run.deathCause });
}

/* ---------- band handoff ----------
   Only ever into AIR. Handing off into rock would embed the hitbox in solid
   stone and the resolution below would eject it in an arbitrary direction. */
function reband(b) {
  const cx = player.x + PW / 2;

  if (player.y + PH >= b.origin.y + heightPx(b)) {
    const nb = bandBelow(b);
    if (nb && !solidAt(nb, tileX(nb, cx), tileY(nb, player.y + PH))) return nb;
  }
  if (player.y < b.origin.y) {
    const nb = bandAbove(b);
    if (nb && !solidAt(nb, tileX(nb, cx), tileY(nb, player.y))) return nb;
  }
  return b;
}

/* ---------- AABB probes over the tile grid ----------
   The tile grid is the only source of truth for terrain (ARCHITECTURE
   invariant 1). There is no second collision model to fall out of sync with. */
function boxSolid(b, x, y) {
  const t0 = tileX(b, x), t1 = tileX(b, x + PW - 1);
  const r0 = tileY(b, y), r1 = tileY(b, y + PH - 1);
  for (let ty = r0; ty <= r1; ty++)
    for (let tx = t0; tx <= t1; tx++)
      if (solidAt(b, tx, ty)) return true;
  return false;
}

function boxClimb(b, x, y) {
  const t0 = tileX(b, x), t1 = tileX(b, x + PW - 1);
  const r0 = tileY(b, y), r1 = tileY(b, y + PH - 1);
  for (let ty = r0; ty <= r1; ty++)
    for (let tx = t0; tx <= t1; tx++)
      if (climbAt(b, tx, ty)) return true;
  return false;
}

/* ---------- axis-separated resolution ----------
   Both axes step at one pixel and snap flush against whatever they hit. */
function moveX(b, d) {
  if (!d) return;
  const step = Math.sign(d);
  let rem = Math.abs(d);
  while (rem > 0) {
    const amt = Math.min(1, rem) * step;
    const nx = player.x + amt;
    if (boxSolid(b, nx, player.y)) {
      /* Auto-step a single-tile lip, so walking over rubble is not a chore.
         THE LADDER CASE IS NOT OPTIONAL — see bug 2 in the header. Both
         headroom probes are required: the destination column and the current
         one, or the step teleports through a one-tile ceiling gap. */
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

/* Returns true if this step ended with the player standing on a floor they were
   not standing on before. BOTH exits must be able to say so: the collision exit
   AND the ran-out-of-travel exit (bug 1 in the header). */
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
      if (step > 0) {                                     // hit a floor
        pw.move(player.x, worldY(b, tileY(b, ny + PH - 1)) - PH);
        pw.set('onGround', true);
        pw.vel(player.vx, 0);
        return true;
      }
      pw.move(player.x, worldY(b, tileY(b, ny)) + b.tile); // bonked a ceiling
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
