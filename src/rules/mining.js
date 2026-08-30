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
   trinket that softens one material cannot be read around. */

import { rand } from '../core/rng.js';
import { AIR } from '../data/forms.js';
import { SUB } from '../data/substances.js';
import { aim, write as aw } from '../model/aim.js';
import { push } from '../model/journal.js';
import { write as digw, workAt } from '../model/mining.js';
import { write as iw } from '../model/items.js';
import { eff } from '../model/mods.js';
import { player, playerCentre } from '../model/player.js';
import { run } from '../model/run.js';
import { baseHardAt, dropAt, subAt, tileAt, write as tw } from '../model/tiles.js';
import { bandAt, inBounds, tileX, tileY, worldX, worldY } from '../model/world.js';

/* A break above this many BASE seconds reads as stone rather than as soil. The
   only number in this file, and it selects a journal kind — not a mechanic. */
const HARD_BREAK = 0.5;

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

/* Keyboard fallback: the tile the player faces, or the one under/over them. */
export function aimAtKeys(cmd) {
  const c = playerCentre();
  const b = player.band;
  if (!b) return;
  let px = c.x, py = c.y;
  if (cmd.down)    py += b.tile;
  else if (cmd.up) py -= b.tile;
  else             px += player.face * b.tile;
  if (cmd.down && (cmd.left || cmd.right)) px += player.face * b.tile;
  resolve(px, py);
}

function resolve(px, py) {
  const b = bandAt(px, py);
  if (!b) { aw.set(null, 0, 0, false); return; }
  const tx = tileX(b, px), ty = tileY(b, py);
  aw.set(b, tx, ty, inBounds(b, tx, ty));
}

/* ---------- the step ---------- */
export function step(dt, cmd) {
  const b = aim.band;
  if (run.dead || !run.hasPick || !cmd.dig || !aim.valid || !b) return;

  const byte = tileAt(b, aim.tx, aim.ty);
  if (byte === AIR) return;

  const sub = subAt(b, aim.tx, aim.ty);
  const hard = baseHardAt(b, aim.tx, aim.ty) * (sub < 0 ? 1 : eff('hard', SUB[sub].id));
  if (!(hard > 0) || !Number.isFinite(hard)) return;      // bedrock, or unmineable

  const at = { x: worldX(b, aim.tx), y: worldY(b, aim.ty) };
  const before = workAt(b, aim.tx, aim.ty);
  const work = digw.add(b, aim.tx, aim.ty, dt * eff('pickPower'));

  /* A strike that did not break anything is still a fact worth reporting: it is
     what gives the swing weight. `shell` rate-limits it from `data/sfx.js`. */
  if (work > before && work < hard) push('pick', at, { sub, progress: work / hard });
  if (work < hard) return;

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
}
