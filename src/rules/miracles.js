/* LAYER rules — MIRACLES: the ONE-SHOT tier of docs/DESIGN.md's four
   god-gift tiers (CLAUDE.md "Resolved decisions" D1). Imports `data`,
   `model`. Imports no other `rules` module.

   `use()` is the whole mechanic: find the first held miracle (a substance x
   `phial` pair, `data/miracles.js`'s own header), spend exactly one unit,
   apply its `effect` to the tile grid at the AIMED tile, and grant its
   side-effect boon if it has one. `grant()`/`draftable()` below are the
   debug-only spawn path (`docs/BUILD_PLAN.md` Phase 4 Step 6): the same
   "material never teleports into your hands" idiom `rules/trinkets.js#grant`
   already uses for a drafted trinket. */

import { F } from '../data/forms.js';
import { S } from '../data/substances.js';
import { BOON } from '../data/boons.js';
import { MIRACLE, MIRACLES } from '../data/miracles.js';
import { write as bw } from '../model/boons.js';
import { push } from '../model/journal.js';
import { write as iw } from '../model/items.js';
import { player, playerCentre } from '../model/player.js';
import { invCount, run, write as rw } from '../model/run.js';
import { write as tw } from '../model/tiles.js';

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
     it touches (invariant 3) with no new tile-write verb. */
  if (e.kind === 'collapse') {
    for (let dy = -e.radius; dy <= e.radius; dy++)
      for (let dx = -e.radius; dx <= e.radius; dx++)
        tw.clear(band, tx + dx, ty + dy);
  }

  /* The side-effect boon, one of the timed tier's three stated sources.
     Reads `data/boons.js` directly and calls `model/boons.js#write.grant`
     rather than `rules/boons.js#grant` -- `rules` siblings may not import
     one another, so this is the same primitive that file's own `grant()`
     wraps, called here instead of through it. */
  if (e.boon) {
    const b = BOON[e.boon];
    if (b) {
      bw.grant(e.boon, b.secs);
      push('grant', null, { boon: e.boon, name: b.name, text: b.text });
    }
  }
}

/* ---------- debug spawn path (Phase 4 Step 6) ----------
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
