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

import { clamp, lerp } from '../core/math.js';
import { FORM } from '../data/forms.js';
import { push } from '../model/journal.js';
import { eff } from '../model/mods.js';
import { PH, PW, fallHearts, player, write as pw } from '../model/player.js';
import { burdenFrac, run, write as rw } from '../model/run.js';
import { carrierTop, riddenSegment } from '../model/segments.js';
import { climbAt, formAt, solidAt } from '../model/tiles.js';
import { bandAt, bands, heightPx, tileX, tileY, widthPx, worldX, worldY } from '../model/world.js';

export function step(dt, cmd) {
  if (run.dead) return;
  const b0 = player.band;
  if (!b0) return;

  /* Band handoff FIRST, so everything below is about the band the player is
     actually in. What keeps a shaft dug to the bottom of a band from ending at
     an unbreakable floor is NOT this line — a band's out-of-bounds rows read
     BEDROCK, and no ordering of a single-band probe fixes that. It is the seam
     split in the probes further down. This is bookkeeping, and `reband`'s own
     header says why that distinction was worth a bug. */
  const b = reband(b0);
  if (b !== b0) pw.band(b);

  /* Presentation timers. In `model` because `view` reads them; decayed here
     because `view` may not write.
     See docs/DEVELOPER_GUIDE.md#where-does-state-go */
  pw.set('landFlash', Math.max(0, player.landFlash - dt * 4));
  pw.set('hurtFlash', Math.max(0, player.hurtFlash - dt * 3));

  const walk = eff('walk'), climb = eff('climb'), hop = eff('hop');
  const grav = eff('grav'), term = eff('terminal');

  let onLadder = boxClimb(b, player.x, player.y);
  pw.set('onLadder', onLadder);

  /* ---- THE RIDE BRANCH (docs/PLAN-gears-and-winches.md section 4.6) ----
     A CARRIER IS NOT TERRAIN AND MUST NOT BECOME TERRAIN (invariant 1: the
     tile grid is the only source of truth, and there is never a second
     collision model). It holds the player up the exact way a LADDER does:
     through a model query, `model/segments.js#riddenSegment`, which is also
     what `rules/drive.js` reads to translate the rider -- one predicate, two
     rules modules, because siblings may not import each other and two copies
     would eventually disagree about a frame.

     A ladder WINS over a carrier: the player pressing up/down on a rung has
     said which mechanic they mean, and a shaft with both in it is a shaft
     they can always climb by hand.

     Burden is NOT read here at all. Boarding is never refused at any weight
     (CLAUDE.md D4 as amended) -- an over-cap rider is mass in
     `rules/drive.js`'s own arithmetic, and the carrier runs backwards under
     them instead of a refusal saying so. */
  const riding = onLadder ? null : riddenSegment();

  /* CLAUDE.md D4: encumbrance gates ASCENT, and nothing else. `frac` is the
     fraction of the hard cap currently carried; `overCap` is the lockout at
     or over it -- ladder-up and hop are refused there, legibly, through a
     journal row. Walking on level ground and every downward movement below
     never read either value: you can always fall. */
  const frac = burdenFrac(), overCap = frac >= 1;

  /* ---- horizontal: no acceleration, on purpose. This is a digging game and a
          momentum model makes a 1-tile corridor infuriating. ---- */
  const want = (cmd.right ? 1 : 0) - (cmd.left ? 1 : 0);
  if (want) pw.set('face', want);
  const vx = want * walk;

  /* ---- vertical ---- */
  let vy = player.vy;
  if (onLadder) {
    /* `climbK` is the ladder TIER's own speed (data/forms.js#stair, ~1.8x a
       plain rung or log) -- a property of what you built, not of what you
       carry, so it multiplies BOTH directions exactly like `climb` already
       does. Burden only ever touches the ascending half, below. */
    const climbK = boxClimbK(b, player.x, player.y);
    const laddSpeed = climb * climbK;
    const v = (cmd.down ? 1 : 0) - (cmd.up ? 1 : 0);
    if (v > 0) {
      /* Descending: down is free everywhere else, and on a ladder it always
         costs exactly the ladder's own speed, at any weight. Never scaled
         by burden. */
      vy = v * laddSpeed;
    } else if (v < 0) {
      if (overCap) {
        vy = 0;                            // ladder-up REFUSED at/over the hard cap
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
    /* STANDING ON A CARRIER IS STANDING ON GROUND. Gravity is not integrated
       and the deck is snapped to flush, exactly the way `moveY` snaps to a
       tile boundary -- flush is what makes the rider's own translation in
       `rules/drive.js` land them on the deck and not a pixel above or below
       it. The snap is refused if the destination is solid, for the reason bug
       2 in this file's header records: a height change that can wedge a
       player is a height change that eventually will. */
    vy = 0;
    const ny = carrierTop(riding) - PH;
    if (ny !== player.y && !boxSolid(b, player.x, ny)) pw.move(player.x, ny);
  } else {
    if ((player.onGround || player.coyote > 0 || riding) && cmd.hop) {
      /* HOPPING OFF A CARRIER IS NOT BURDEN-GATED, and that is deliberate
         (docs/PLAN section 4.6): a hop is a hop, and an over-cap player
         standing on a sinking bucket must be able to step off it onto the
         ledge beside them -- the same argument exception 1 in CLAUDE.md D4
         already makes for the one-tile auto-step. Off the ground it is
         refused as it always was. */
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

  /* ---- move and resolve, one axis at a time ---- */
  const wasGround = player.onGround;
  moveX(b, vx * dt);
  const hitFloor = moveY(b, player.vy * dt);

  /* A CARRIER'S DECK IS A FLOOR, resolved AFTER `moveY` because `moveY` only
     ever consults the tile grid and would otherwise report standing over open
     air. `onGround` true is what pins `fallFrom` at line 137 below, which is
     the whole of "no fall damage accrues while riding" -- no new code in
     `land()`, and the very next frame after stepping off, gravity and the
     fall-damage curve resume with none either.

     `land()` still fires for the frame the player ARRIVES on a deck out of a
     fall, so dropping onto a bucket costs exactly what dropping onto rock from
     the same height costs. A carrier is a surface, not a safety net.

     RE-QUERIED after the move, not trusted from the top of the frame: `moveX`
     may have walked the player straight off the deck's edge, and the whole
     promise of "walking off resumes gravity on the very next frame" is that
     nothing keeps holding them up once they are not over it. Same query, same
     answer `rules/drive.js` will get one step later. */
  const landed = !!riding && !cmd.hop && riddenSegment() === riding;
  if (landed) pw.set('onGround', true);

  pw.set('coyote', player.onGround ? eff('coyote') : Math.max(0, player.coyote - dt));

  /* `fallFrom` is the APEX of the current airborne arc, not the launch point.
     Tracking the apex is what makes the impact speed below equal sqrt(2gh) for
     the real drop even when the fall started with a hop. */
  if (wasGround && !player.onGround) pw.set('fallFrom', player.y);
  if (!player.onGround && !player.onLadder && player.y < player.fallFrom)
    pw.set('fallFrom', player.y);

  if ((hitFloor || landed) && !wasGround) land(b, term, grav);
  if (player.onGround || player.onLadder) pw.set('fallFrom', player.y);

  if (Math.abs(vx) > 1 && player.onGround) pw.set('walkPhase', player.walkPhase + dt * 7);
  else pw.set('walkPhase', 0);

  /* Keep inside the band horizontally; a band is the world as far as the player
     is concerned, and its width is a row in `data/world.js`. */
  pw.move(clamp(player.x, b.origin.x, b.origin.x + widthPx(b) - PW), player.y);

  /* Below the last band there is nothing to land on and no band to hand off
     to, so falling out of the world is fatal rather than infinite. Reads
     `eff('fallMax')` rather than a bare `5` (docs/FINDINGS.md) -- the two
     only agreed by coincidence before this, and a boon that ever changed
     `fallMax` would have silently desynced void-death lethality from
     ordinary fall lethality. */
  const last = bands[bands.length - 1];
  if (last && player.y > last.origin.y + heightPx(last)) hurt(eff('fallMax'), 'THE VOID');

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
   is a journal row — never a `play()` call.
   See docs/DEVELOPER_GUIDE.md#notification-and-the-journal */
export function hurt(n, cause) {
  if (run.dead) return;
  pw.set('hurtFlash', 1);
  rw.hurt(n, cause);
  push('hurt', { x: player.x, y: player.y }, { hearts: n, cause });
  if (run.dead) push('death', { x: player.x, y: player.y }, { cause: run.deathCause });
}

/* ---------- band handoff ----------
   ONE QUERY ABOUT ONE POINT, AND IT HAS TO BE. `model/world.js#bandAt` is the
   only thing in the project that knows bands share a single vertical space,
   and bands do not overlap — so the hitbox CENTRE is in at most one of them and
   there is no position two bands can both claim. That is the whole property
   this function needs and the one it did not used to have.

   IT WAS TWO LEADING-EDGE TESTS, one per direction: hand off DOWN once the feet
   reached the band's bottom edge, hand off UP once the head rose past its top
   edge. Both are true at once for the whole 15 px a 16 px hitbox spends
   straddling a seam, so a player crossing one flipped band EVERY FRAME — and
   each flip resolved collision against a grid that answered BEDROCK for the
   half of the box hanging out of it, snapping them back up flush to the seam
   with `vy` zeroed. Measured before the fix, free-falling down a cleared shaft
   into the surface/topsoil seam: 154 band flips in 200 frames, y oscillating
   between 752 and 753, never descending a pixel; a ladder out of topsoil
   stalled identically at 767/768. That was the reported "dig from layer II to
   III and you teleport up".

   Handing off into ROCK is no longer a case to guard, which is why the old
   `!solidAt(...)` test is gone rather than moved: the probes below read the
   same tiles from either side of a seam, so a handoff cannot change what the
   hitbox is or is not embedded in. It picks which grid is the fast path, and
   which band mining, aim and the camera are about. It is bookkeeping, not a
   physical event, and it must not be able to argue with itself. */
function reband(b) {
  return bandAt(player.x + PW / 2, player.y + PH / 2) || b;
}

/* ---------- AABB probes over the tile grid ----------
   The tile grid is the only source of truth for terrain (ARCHITECTURE
   invariant 1). There is no second collision model to fall out of sync with.

   THE SEAM SPLIT, AND WHY EVERY PROBE WALKS WORLD ROWS RATHER THAN BAND ROWS.
   The hitbox is 16 px tall and a band boundary is a line, so for 15 px of every
   crossing the box is in two bands at once. A band's own grid cannot answer for
   the half outside it and does not try to: `model/tiles.js#tileAt` reports
   BEDROCK past its last row and AIR above its first. Both are the right answer
   at the edge of the WORLD and a lie at a seam — the bedrock lie is a phantom
   floor that stops a descending player dead, and the air lie takes the last two
   rungs off a ladder climbing out of the band below. Neither band is the one to
   ask; the band that OWNS THE ROW is. Every frame that is not a crossing pays
   one range test for that.

   Only rows are split, because a seam is horizontal: each row's columns are
   addressed in that row's own band, but the flush snap in `moveX` still reads
   the CURRENT band's column lattice. That is exact while adjacent bands agree
   on `tile` and `origin.x` — all three rows of `data/world.js` are tile 8 at
   x 0 today — and it is the same assumption the auto-step's `b.tile` rise
   already makes. A band inset or scaled relative to its neighbour would need
   `moveX` to learn which band stopped it, which is not this fix. */

/* The band whose grid owns a world row, through the SAME `bandAt` query
   `reband` decides the player's own band with — one notion of ownership, so
   "which band am I in" and "which band answers for the row under my feet"
   cannot disagree about a frame. The in-band range test in front of it is the
   fast path, and it is every frame that is not a crossing.

   FALLING BACK TO `b` IS TODAY'S OUT-OF-WORLD CONVENTION RESTATED, not a new
   one, and it is why `bandAt` returning null is not a special case: `tileAt`
   answers AIR above a band's first row (open sky over the astral band) and
   BEDROCK past its last (the floor of the world, whose only exit is the void
   check in `step`). It covers the horizontal case for free — a neighbouring
   band that does not span this column is not a place to fall into, and reads
   as the edge of the world, which is exactly what it is. */
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

/* The fastest `climbK` among the tiles the player currently occupies -- a
   player straddling two different ladder tiers (rare, but the box spans two
   columns) gets the better one, never the worse. Absent on every form but
   `stair` (data/forms.js), so a rung reads as 1 (and so did a placed log,
   until Phase 14a made `log` feedstock only -- CLAUDE.md D12). Native
   tiles never carry `climb:true` (see model/tiles.js#tileBlockOf's FORM-
   wins-over-substance rule), so `formAt` is always a real placed form here,
   never NATIVE. */
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
         one, or the step teleports through a one-tile ceiling gap.
         DELIBERATELY NOT GATED ON BURDEN either (CLAUDE.md D4, exception 1):
         gating a height gain on state is exactly what wedged a player in
         their own shaft permanently (bug 2, restated), and an over-cap
         player must still be able to walk over rubble to reach the ledge
         where they can drop material back under the cap. */
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
      /* THE SNAP IS COMPUTED IN THE BAND THAT OWNS THE ROW THAT BLOCKED, which
         on a seam is not the band the player is in. The blocking row is always
         the LEADING one — the box was clear a pixel ago, so the bottom row is
         the only new row descending and the top row the only new one rising —
         so resolving the band for that one pixel is enough, and flush stays
         flush across a seam. */
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
