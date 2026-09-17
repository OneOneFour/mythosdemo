/* rules layer — the one-shot gift tier. `use()` spends one unit of the first
   held miracle, applies its `effect` to the tile grid at the aimed tile, and
   grants its side-effect boon if it has one. `grant()` / `draftable()` are the
   debug spawn path. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { BOON } from '../data/boons.js';
import { MIRACLE, MIRACLES } from '../data/miracles.js';
import { write as bw } from '../model/boons.js';
import { push } from '../model/journal.js';
import { write as iw } from '../model/items.js';
import { player, playerCentre } from '../model/player.js';
import { invCount, run, write as rw } from '../model/run.js';
import { solidAt, write as tw } from '../model/tiles.js';

/* `(band, tx, ty)` is the aimed tile, resolved by `model/aim.js` as for a dig
   or a placement. Returns false with nothing spent if no miracle is held or
   nothing is aimed at. */
export function use(band, tx, ty) {
  if (run.dead || !band) return false;
  const held = MIRACLES.find(m => invCount(S[m.id], F.phial) > 0);
  if (!held) return false;
  if (!rw.spend(S[held.id], F.phial, 1)) return false;

  applyEffect(held, band, tx, ty);
  push('grant', null, { miracle: held.id, name: held.name, text: held.text });
  return true;
}

function applyEffect(m, band, tx, ty) {
  const e = m.effect;

  /* Clears a `radius`-tile square to air through the same
     `model/tiles.js#write.clear` a dig uses, so only the chunks it touches
     repaint. Bounds are inclusive on both axes. */
  if (e.kind === 'collapse') {
    for (let dy = -e.radius; dy <= e.radius; dy++)
      for (let dx = -e.radius; dx <= e.radius; dx++)
        tw.clear(band, tx + dx, ty + dy);
  }

  /* The `solidAt` test is not redundant with `write.set`'s own bounds check:
     without it this conjures floor out of air. `e.sub` reaches `packTile`
     unvalidated, so an absent or non-packable row corrupts the tile byte. */
  if (e.kind === 'transmute') {
    for (let dy = -e.radius; dy <= e.radius; dy++)
      for (let dx = -e.radius; dx <= e.radius; dx++)
        if (solidAt(band, tx + dx, ty + dy)) tw.set(band, tx + dx, ty + dy, S[e.sub]);
  }

  /* Calls `model/boons.js#write.grant` directly rather than
     `rules/boons.js#grant`, since sibling `rules` modules may not import one
     another. */
  if (e.boon) {
    const b = BOON[e.boon];
    if (b) {
      bw.grant(e.boon, b.secs);
      push('grant', null, { boon: e.boon, name: b.name, text: b.text });
    }
  }
}

/* Debug spawn: the miracle falls at the player's feet as a physical item
   rather than a direct inventory credit. */
export function grant(id) {
  const m = MIRACLE[id];
  if (!m) throw new Error(`grant: no miracle "${id}"`);
  const c = playerCentre();
  iw.spawn(player.band, c.x, c.y - 24, S[id], F.phial, 0, -60);
  push('grant', null, { miracle: id, name: m.name, text: m.text });
  return true;
}

/* Excludes anything already in the pockets, so repeated debug drafts of
   `draftable()[0]` do not hand out the same miracle every press. */
export const draftable = () => MIRACLES.filter(m => invCount(S[m.id], F.phial) === 0);
