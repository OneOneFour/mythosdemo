import { TILE, WORLD_H, WORLD_W, climbAt, solidAt } from '../world/grid.js';
import { GRAV, TERMINAL, clock, run, toast } from './state.js';


/* ============================================================
   THE PLAYER

   1 x 2 tiles. Walks, hops one tile, climbs ladders at half speed,
   and takes discrete heart damage on landing. The asymmetry is the
   whole game: falling is fast and free, going back up is slow and
   costs material.
   ============================================================ */
export const PW = 6, PH = 16;              // hitbox, px (2px slack in an 8px corridor)

export const WALK   = 60;                  // px/s
export const HOP    = 92;                  // px/s launch -> ~13 px = 1 tile + margin
export const CLIMB  = 30;                  // px/s, half walk speed on purpose
export const COYOTE = 0.09;                // s of grace after leaving ground

/* Fall damage, from docs/SPEC.md. With g = 320:
     safe   = 5 tiles  (40 px) -> 160 px/s
     lethal = 20 tiles (160px) -> 320 px/s = 5 hearts
   so one heart per 32 px/s above 160. */
export const SAFE_V = 160, HEART_V = 32;

export const fallHearts = v => Math.max(0, Math.min(5, Math.floor((v - SAFE_V) / HEART_V)));

export const player = {
  x: 0, y: 0, vx: 0, vy: 0,
  onGround: false, onLadder: false, coyote: 0, fallFrom: 0,
  face: 1, walkPhase: 0, wasAir: 0, landFlash: 0, hurtFlash: 0
};

export function spawnPlayer(txp, typ) {
  player.x = txp * TILE + (TILE - PW) / 2;
  player.y = typ * TILE;
  player.vx = player.vy = 0;
  player.onGround = false; player.onLadder = false; player.fallFrom = player.y;
  player.face = 1; player.wasAir = 0;
}

/* --- AABB helpers over the tile grid --- */
export function boxSolid(x, y, w, h) {
  const t0 = Math.floor(x / TILE), t1 = Math.floor((x + w - 1) / TILE);
  const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 1) / TILE);
  for (let ty = r0; ty <= r1; ty++)
    for (let tx = t0; tx <= t1; tx++)
      if (solidAt(tx, ty)) return true;
  return false;
}

export function boxClimb(x, y, w, h) {
  const t0 = Math.floor(x / TILE), t1 = Math.floor((x + w - 1) / TILE);
  const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 1) / TILE);
  for (let ty = r0; ty <= r1; ty++)
    for (let tx = t0; tx <= t1; tx++)
      if (climbAt(tx, ty)) return true;
  return false;
}

export function updatePlayer(dt, cmd) {
  const p = player;
  if (run.dead) return;

  p.landFlash = Math.max(0, p.landFlash - dt * 4);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 3);
  if (run.invuln > 0) run.invuln -= dt;

  p.onLadder = boxClimb(p.x, p.y, PW, PH);

  /* --- horizontal --- */
  const want = (cmd.right ? 1 : 0) - (cmd.left ? 1 : 0);
  if (want) p.face = want;
  p.vx = want * WALK;

  /* --- vertical --- */
  if (p.onLadder) {
    // on a ladder gravity is off and you move at half pace, up or down
    const v = (cmd.down ? 1 : 0) - (cmd.up ? 1 : 0);
    p.vy = v * CLIMB;
    if (cmd.hop && !v) { p.vy = -HOP; p.onLadder = false; }   // step off
    p.wasAir = 0;
  } else {
    if (p.onGround || p.coyote > 0) {
      if (cmd.hop) { p.vy = -HOP; p.onGround = false; p.coyote = 0; }
    }
    p.vy = Math.min(TERMINAL, p.vy + GRAV * dt);
  }

  /* --- move and resolve, one axis at a time --- */
  const wasGround = p.onGround;
  moveX(p, p.vx * dt);
  const hitFloor = moveY(p, p.vy * dt);

  p.coyote = p.onGround ? COYOTE : Math.max(0, p.coyote - dt);
  if (wasGround && !p.onGround) p.fallFrom = p.y;          // just left the ground
  if (!p.onGround && !p.onLadder) p.wasAir = Math.max(p.wasAir, p.vy);

  /* --- landing: fall damage from the impact speed --- */
  if (hitFloor && !wasGround) {
    const v = p.wasAir;
    p.landFlash = Math.min(1, v / TERMINAL);
    const h = fallHearts(v);
    // report the distance actually fallen, not one back-solved from velocity,
    // which terminal velocity would under-report on very long drops
    const tilesFallen = Math.max(1, Math.round((p.y - p.fallFrom) / TILE));
    if (h > 0) hurt(h, `A ${tilesFallen}-TILE FALL`);
    p.wasAir = 0;
  }
  if (p.onGround || p.onLadder) { p.wasAir = 0; p.fallFrom = p.y; }

  if (Math.abs(p.vx) > 1 && p.onGround) p.walkPhase += dt * 7;
  else p.walkPhase = 0;

  // keep inside the world
  p.x = Math.max(0, Math.min(WORLD_W - PW, p.x));
  if (p.y > WORLD_H) hurt(5, 'THE VOID');

  run.deepest = Math.max(run.deepest, p.y);
}

/* Axis-separated resolution. Both snap flush against whatever they hit,
   and moveY reports a landing in every case — including the one where the
   player happens to come to rest without a collision step, which is how
   fall damage first went missing. */
function moveX(p, d) {
  if (!d) return;
  const step = Math.sign(d);
  let rem = Math.abs(d);
  while (rem > 0) {
    const amt = Math.min(1, rem) * step;
    const nx = p.x + amt;
    if (boxSolid(nx, p.y, PW, PH)) {
      // Auto-step a single-tile lip so walking over rubble is not a chore.
      // This must also apply while on a ladder: a player who climbs to the top
      // hangs with their feet in the last ladder tile, a pixel or two below the
      // lip, and without this they are wedged in their own shaft forever.
      if ((p.onGround || p.onLadder) && !boxSolid(nx, p.y - TILE, PW, PH)
                                     && !boxSolid(p.x, p.y - TILE, PW, PH)) {
        p.y -= TILE; p.x = nx; rem -= 1; continue;
      }
      p.x = step > 0 ? Math.floor((nx + PW - 1) / TILE) * TILE - PW
                     : Math.floor(nx / TILE) * TILE + TILE;
      p.vx = 0; return;
    }
    p.x = nx; rem -= 1;
  }
}

function moveY(p, d) {
  p.onGround = false;
  const grounded = () => boxSolid(p.x, p.y + 1, PW, PH);

  if (!d) { p.onGround = grounded(); return false; }

  const step = Math.sign(d);
  let rem = Math.abs(d);
  while (rem > 0) {
    const amt = Math.min(1, rem) * step;
    const ny = p.y + amt;
    if (boxSolid(p.x, ny, PW, PH)) {
      if (step > 0) {                                  // hit a floor
        p.y = Math.floor((ny + PH - 1) / TILE) * TILE - PH;
        p.onGround = true; p.vy = 0;
        return true;
      }
      p.y = Math.floor(ny / TILE) * TILE + TILE;        // bonked a ceiling
      p.vy = 0;
      p.onGround = grounded();
      return false;
    }
    p.y = ny; rem -= 1;
  }
  p.onGround = grounded();
  return step > 0 && p.onGround;                        // came to rest flush
}

export function hurt(hearts, cause) {
  if (run.invuln > 0 || run.dead) return;
  run.hearts -= hearts;
  run.invuln = 0.9;
  player.hurtFlash = 1;
  if (run.hearts <= 0) {
    run.hearts = 0; run.dead = true; run.deathCause = cause || 'UNKNOWN';
  } else {
    toast(cause ? cause + ' COST ' + hearts + (hearts > 1 ? ' HEARTS' : ' HEART') : '');
  }
}

export const centre = () => ({ x: player.x + PW / 2, y: player.y + PH / 2 });
