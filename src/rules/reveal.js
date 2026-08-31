/* LAYER rules — REVEAL: permanent fog of war. Imports `model` only (no `core`
   or `data` needed). Imports no other `rules` module.

   ============================================================================
   A TILE, ONCE REVEALED, IS NEVER RE-HIDDEN. The product decision this file
   exists to implement is memory, not a shrinking light radius, so this only
   ever SETS a bit in `model/world.js#seen` and never clears one. The storage
   already enforces the permanence -- `write.reveal` has no opposite -- so this
   file's only job is deciding WHICH bits to set, once a frame.

   WHY A SIBLING, NOT A CASE FOLDED INTO `rules/player.js` OR `rules/mining.js`.
   Reveal shares no ledger with either: it never touches health, velocity,
   mining progress or an item, and nothing it writes is read by anything else
   in `rules`. It only ever reads the player's OWN resting position for this
   frame and writes one array `model/world.js` owns -- a complete, self-
   contained mechanic the same size as a belt's drag or a trinket's sync, which
   is the same case those two files' own headers already make for why THEY are
   not folded into something bigger either.

   OCCUPIED TILES, NOT ONE POINT. The player's hitbox (`PW`x`PH`, `model/
   player.js`) is 6x16 px in an 8 px tile -- 16 px is exactly two rows when the
   box happens to be tile-aligned, but it need not be, so this walks every tile
   the box's bounding rectangle actually overlaps (2 tiles most of the time, up
   to 4 while straddling a seam on both axes) rather than sampling one centre
   point. A single point would quietly shrink the lit patch to follow the
   player's waist and leave a foot or a head one tile short of what "standing
   here" should mean. Each occupied tile reveals ITSELF plus its 4 ORTHOGONAL
   neighbours -- never a diagonal, per the confirmed rule -- which is what
   makes the lit patch read as "a small area around the player" with no radius
   constant or distance check anywhere in this file. */

import { player, playerBox } from '../model/player.js';
import { tileX, tileY, write as ww } from '../model/world.js';

export function step() {
  const b = player.band;
  if (!b) return;                                // no world yet; never in play

  const box = playerBox();
  const tx0 = tileX(b, box.x), tx1 = tileX(b, box.x + box.w - 1);
  const ty0 = tileY(b, box.y), ty1 = tileY(b, box.y + box.h - 1);

  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      ww.reveal(b, tx,     ty);
      ww.reveal(b, tx - 1, ty);
      ww.reveal(b, tx + 1, ty);
      ww.reveal(b, tx,     ty - 1);
      ww.reveal(b, tx,     ty + 1);
    }
}
