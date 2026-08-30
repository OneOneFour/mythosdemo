/* ============================================================
   THE PLAYER — the consumer side of the tunable store.

   Every number in here used to be an `export const` at src/sim/player.js:
   16-25, which is precisely why no boon could touch them. Now there is not a
   single literal in this file: every value is `stat(name)`, read fresh, so a
   trinket granted mid-run takes effect on the next frame with no
   re-initialisation, no event and no cache to invalidate.

   Walk speed, the brief's worked example:
       data/tunables.js      'walk': 60
       data/trinkets.js      winged_sandals -> { tunable:'walk', mul:1.15 }
       model/mods.js         write.grant('winged_sandals')
       here                  stat('walk')  ->  69
   ============================================================ */

import { cur } from '../model/world.js';
import { isSolid } from '../model/tiles.js';
import { stat } from '../model/mods.js';
import { player, write as pw, PH, PW } from '../model/player.js';
import { run, write as rw } from '../model/run.js';
import { write as jw } from '../model/journal.js';

/* Hearts lost on impact. Both thresholds are tunables, so "the earth is
   softer to you" is a trinket row and not a code change. */
export const fallHearts = v =>
  Math.max(0, Math.min(5, Math.floor((v - stat('fall.safe')) / stat('fall.perHeart'))));

export function step(dt) {
  const b = cur.band;
  const c = player.cmd;

  const speed = player.onLadder ? stat('climb') : stat('walk');
  player.vx = (c.right - c.left) * speed;
  if (c.right || c.left) player.face = c.right ? 1 : -1;

  if (c.up && (player.onGround || player.coyote > 0)) player.vy = -stat('hop');
  player.vy = Math.min(stat('terminal'), player.vy + stat('grav') * dt);

  /* STUB (leaf): the swept AABB integrator. One shared implementation for the
     player and for items is a correctness matter, not an architecture one, so
     the seam is here and the body is not. */
  const wasAir = !player.onGround;
  pw.move(player.x + player.vx * dt, player.y + player.vy * dt);
  player.onGround = isSolid(b, (player.x + PW / 2) / b.tile | 0,
                               (player.y + PH + 1) / b.tile | 0);
  player.coyote = player.onGround ? stat('coyote') : Math.max(0, player.coyote - dt);

  if (player.onGround && wasAir) {
    /* Impact speed from GEOMETRY, not from a per-frame velocity sample:
       v = sqrt(2 * g * distance fallen), capped at terminal. */
    const fell = Math.max(0, player.y - player.fallFrom);
    const v = Math.min(stat('terminal'), Math.sqrt(2 * stat('grav') * fell));
    const h = fallHearts(v);
    if (h > 0 && run.invuln <= 0) {
      rw.spendHearts(h, 'THE FALL');
      jw.push('hurt', h, v);
    }
    player.fallFrom = player.y;
  }
  if (player.onGround) player.fallFrom = player.y;
}
