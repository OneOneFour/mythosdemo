/* LAYER rules — the player step.

   STUBBED LEAF: the movement itself is a single-shot integration rather than a
   swept one, and jump/climb input handling is reduced to the three flags the
   schedule passes in. Player physics is out of scope in the brief.

   What is NOT stubbed, because it is the structure under evaluation: every
   number this rule uses comes from `eff()`, so a trinket bends walk speed, hop
   height, gravity and both fall-damage thresholds without a single module
   constant existing to be read around. Fall damage is computed from the DISTANCE
   FALLEN and not from a per-frame velocity sample, so it is a function of
   geometry and not of framerate. */

import { eff } from '../model/mods.js';
import { PH, PW, player, write as pw } from '../model/player.js';
import { climbAt, solidAt } from '../model/tiles.js';
import { write as rw } from '../model/run.js';
import { push } from '../model/journal.js';

export function step(dt, cmd) {
  const b = player.band;
  if (!b) return;
  const t = b.tile;

  const walk = eff('walk'), climb = eff('climb'), hop = eff('hop');
  const g = eff('grav'), term = eff('terminal');

  pw.set('onLadder', climbAt(b, Math.floor((player.x + PW / 2) / t),
                                Math.floor((player.y + PH / 2) / t)));

  let vx = (cmd.right ? 1 : 0) - (cmd.left ? 1 : 0);
  vx *= player.onLadder ? climb : walk;
  let vy = player.onLadder
    ? ((cmd.up ? -1 : 0) + (cmd.down ? 1 : 0)) * climb
    : Math.min(term, player.vy + g * dt);

  if (cmd.jump && player.onGround) { vy = -hop; pw.set('fallFrom', player.y); }

  pw.vel(vx, vy);
  pw.move(player.x + vx * dt, player.y + vy * dt);

  const feetTy = Math.floor((player.y + PH) / t);
  const landed = solidAt(b, Math.floor((player.x + PW / 2) / t), feetTy);
  if (landed) {
    pw.move(player.x, feetTy * t - PH);
    if (!player.onGround) land(b);
    pw.set('onGround', true);
    pw.vel(vx, 0);
  } else {
    if (player.onGround) pw.set('fallFrom', player.y);
    pw.set('onGround', false);
  }
}

/* Discrete outcome from an integrated quantity, never from a per-frame sample:
   impact speed comes from how far the fall was, so the same drop costs the same
   hearts at any framerate. */
function land(b) {
  const fallen = player.y - player.fallFrom;
  if (fallen <= 0) return;
  const v = Math.min(eff('terminal'), Math.sqrt(2 * eff('grav') * fallen));
  const n = Math.max(0, Math.floor((v - eff('fallSafe')) / eff('fallHeart')));
  if (n > 0) {
    rw.hurt(n, 'THE FALL');
    push('hurt', { x: player.x, y: player.y }, { hearts: n, from: fallen });
  } else {
    push('land', { x: player.x, y: player.y }, { from: fallen });
  }
  pw.set('fallFrom', player.y);
}
