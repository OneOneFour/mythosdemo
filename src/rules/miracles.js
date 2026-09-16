/* LAYER rules — MIRACLES: the ONE-SHOT gift tier. Imports `data`, `model`,
   and no other `rules` module.

   `use()` is the whole mechanic: find the first held miracle, spend exactly
   one unit, apply its `effect` to the tile grid at the AIMED tile, and grant
   its side-effect boon if it has one. `grant()`/`draftable()` are the
   debug-only spawn path. */

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

/* The first held miracle, spent and applied at (band, tx, ty) -- the AIMED
   tile, resolved by `model/aim.js` exactly as a dig or a placement is.
   Returns false with nothing spent if no miracle is held or nowhere is
   aimed at, so a stray press against open sky costs nothing. */
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

  /* 'collapse': the simplest real terrain edit available -- clear a
     radius-tile square to AIR through the SAME `model/tiles.js#write.clear`
     every dig already uses, which is why a chasm repaints only the chunks
     it touches with no new tile-write verb. */
  if (e.kind === 'collapse') {
    for (let dy = -e.radius; dy <= e.radius; dy++)
      for (let dx = -e.radius; dx <= e.radius; dx++)
        tw.clear(band, tx + dx, ty + dy);
  }

  /* 'transmute': the same square, one verb over -- `write.set` instead of
     `write.clear`. The `solidAt` test is NOT redundant with `write.set`'s own
     bounds check and must not be "simplified" away: it is the whole reason
     this cannot conjure floor out of air, and without it the miracle is a
     terrain generator.

     THE THIRD CALLER OF `packTile`, and the only one nothing validates on the
     way in, so the content lint proves `e.sub` exists and is packable -- an
     absent one packs to NaN and stores as AIR, a non-packable one wraps the
     byte into an unrelated pair. */
  if (e.kind === 'transmute') {
    for (let dy = -e.radius; dy <= e.radius; dy++)
      for (let dx = -e.radius; dx <= e.radius; dx++)
        if (solidAt(band, tx + dx, ty + dy)) tw.set(band, tx + dx, ty + dy, S[e.sub]);
  }

  /* The side-effect boon. Reads `data/boons.js` and calls
     `model/boons.js#write.grant` rather than `rules/boons.js#grant`, because
     siblings may not import one another -- this is the same primitive that
     file's own `grant()` wraps. */
  if (e.boon) {
    const b = BOON[e.boon];
    if (b) {
      bw.grant(e.boon, b.secs);
      push('grant', null, { boon: e.boon, name: b.name, text: b.text });
    }
  }
}

/* debug spawn path
   Same idiom `rules/trinkets.js#grant` uses for a drafted trinket: the
   miracle falls at the player's feet as a physical item, never a direct
   inventory credit. */
export function grant(id) {
  const m = MIRACLE[id];
  if (!m) throw new Error(`grant: no miracle "${id}"`);
  const c = playerCentre();
  iw.spawn(player.band, c.x, c.y - 24, S[id], F.phial, 0, -60);
  push('grant', null, { miracle: id, name: m.name, text: m.text });
  return true;
}

/* Miracles not currently held -- same shape as the other three tiers'
   `draftable()`, so a debug key that grants `draftable()[0]` repeatedly does
   not just hand out the same miracle every press once one is already in the
   pockets. */
export const draftable = () => MIRACLES.filter(m => invCount(S[m.id], F.phial) === 0);
