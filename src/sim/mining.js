import { TILE, damage, dmgAt, inBounds, solidAt, tileAt, setTile } from '../world/grid.js';
import { AIR, MAT, T } from '../world/tiles.js';
import { chips, run, toast } from './state.js';
import { PH, PW, boxSolid, player } from './player.js';
import { spawnItem, spend } from './items.js';
import { notedDig } from './tutorial.js';


/* ============================================================
   PICK AND PLACE

   Reach is 3 tiles from the player's centre. Hardness is
   seconds-to-break, so the tutorial's soft seam (0.15) yields
   almost instantly while granite (2.40) is a statement that you
   are not meant to be here yet.
   ============================================================ */
export const REACH = 3.2 * TILE;
export const PICK_POWER = 1;

export const aim = { tx: 0, ty: 0, valid: false, mode: 'dig' };

/* Mouse aim when there is a mouse, keyboard fallback otherwise. */
export function setAim(worldX, worldY) {
  const cx = player.x + PW / 2, cy = player.y + PH / 2;
  let dx = worldX - cx, dy = worldY - cy;
  const d = Math.hypot(dx, dy);
  if (d > REACH) { dx = dx / d * REACH; dy = dy / d * REACH; }
  aim.tx = Math.floor((cx + dx) / TILE);
  aim.ty = Math.floor((cy + dy) / TILE);
  aim.valid = inBounds(aim.tx, aim.ty);
}

export function setAimKeys(cmd) {
  const cx = player.x + PW / 2, cy = player.y + PH / 2;
  let ax = Math.floor(cx / TILE), ay = Math.floor(cy / TILE);
  if (cmd.down)      ay += 1;
  else if (cmd.up)   ay -= 1;
  else               ax += player.face;
  if (cmd.down && (cmd.left || cmd.right)) ax += player.face;
  aim.tx = ax; aim.ty = ay;
  aim.valid = inBounds(ax, ay);
}

export function updateMining(dt, cmd) {
  if (run.dead) return;

  if (cmd.dig && run.hasPick && aim.valid) {
    const m = tileAt(aim.tx, aim.ty);
    if (m !== AIR && m !== -1) {
      const before = dmgAt(aim.tx, aim.ty);
      const drop = damage(aim.tx, aim.ty, dt, PICK_POWER);
      // chips fly while the tile is still standing, so the swing has weight
      if (dmgAt(aim.tx, aim.ty) > before && Math.random() < dt * 26)
        chips.push({ x: aim.tx * TILE + Math.random() * TILE,
                     y: aim.ty * TILE + Math.random() * TILE,
                     vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 40,
                     g: 340, life: 0.3 + Math.random() * 0.3, col: MAT[m].a });
      if (drop) {
        notedDig();
        spawnItem(aim.tx * TILE + TILE / 2, aim.ty * TILE + TILE / 2, drop,
                  0, -30 - Math.random() * 20);
        for (let k = 0; k < 8; k++)
          chips.push({ x: aim.tx * TILE + Math.random() * TILE,
                       y: aim.ty * TILE + Math.random() * TILE,
                       vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60,
                       g: 340, life: 0.35 + Math.random() * 0.4,
                       col: Math.random() < 0.5 ? MAT[m].a : MAT[m].c });
      }
    }
  }

  if (cmd.place && aim.valid) placeLadder();
}

/* One timber yields three ladder tiles. The dead olive tree is the only
   timber on the surface, so the first climb out is materially bounded. */
export const LADDERS_PER_TIMBER = 3;

export function placeLadder() {
  if (tileAt(aim.tx, aim.ty) !== AIR) return false;
  // A ladder needs rock beside or above it, or another ladder to join. The
  // ladder BELOW counts too — that is the direction you build when climbing
  // out of a shaft, and without it the last two rungs cannot be placed and
  // the shaft becomes a grave.
  const backed = solidAt(aim.tx - 1, aim.ty) || solidAt(aim.tx + 1, aim.ty)
              || solidAt(aim.tx, aim.ty - 1)
              || tileAt(aim.tx, aim.ty - 1) === T.ladder
              || tileAt(aim.tx, aim.ty + 1) === T.ladder;
  if (!backed) { toast('LADDERS NEED SOMETHING TO HANG FROM'); return false; }
  if (run.ladderStock === undefined) run.ladderStock = 0;
  if (run.ladderStock < 1) {
    if (!spend('timber', 1)) { toast('NO TIMBER — FELL THE OLIVE TREE'); return false; }
    run.ladderStock += LADDERS_PER_TIMBER;
  }
  run.ladderStock--;
  setTile(aim.tx, aim.ty, T.ladder);
  return true;
}
