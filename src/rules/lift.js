/* LAYER rules — THE STAGED LIFT. One stage per machine row carrying a `lift`
   block. Imports `core`, `data`, `model`. Imports no other `rules` module.

   ============================================================================
   INVARIANT 4: THE LIFT IS INDEPENDENT STAGES, ONE PER LEVEL PAIR, EACH WITH
   ITS OWN DRUM, DECK AND COUNTERWEIGHT. NEVER ONE CONTINUOUS CAGE.
   Five stages would be five machine records placed at five level pairs, and
   modelling a stage AS A MACHINE is what keeps it that way — there is no object
   in this file that could grow into a world-spanning elevator.

   One stage exists in this pass, pointed surface -> astral, because that is
   what the scope allows. The mechanism is complete; the count is content.
   ============================================================================

   INVARIANT 5 / DESIGN THESIS: DOWN IS FREE, UP IS EXPENSIVE. The deck descends
   under gravity for nothing at `liftDown`, and ascends only while the machine
   holds a CHARGE — which `rules/machines.js` banks when a recipe with no
   liftable output completes, i.e. when the burner has been fed. Both speeds are
   tunables, so a boon may bend them and neither number appears here.

   The charge indirection is why the blood winch needs no code of its own: the
   winch's second recipe pays a heart for a charge, and this file cannot tell a
   charge bought with timber from one bought with a heart. */

import { overlaps } from '../core/math.js';
import { push } from '../model/journal.js';
import { itemsIn, write as iw } from '../model/items.js';
import { defOf, machines, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { playerBox } from '../model/player.js';
import { burdenFrac } from '../model/run.js';
import { bandAt, bandOf } from '../model/world.js';

/* Vertical slack, in px, within which material counts as ON the deck rather
   than merely above it. Matches the catch-box slack idiom in `data/machines.js`. */
const DECK_GRAB = 3;

export function step(dt) {
  for (const m of machines) {
    const def = defOf(m);
    if (!def.lift || !m.deck) continue;

    const top = m.box.y - def.lift.span;
    const bottom = m.box.y;

    if (m.charges > 0 && m.deck.y > top) {
      /* CLAUDE.md D4: boarding a lift stage going UP is refused over the
         hard cap, same as a ladder. The winch carries only MATERIAL today
         (see `carry()` below -- there is no player-ride mechanic here to
         extend), so this is the one place the PLAYER's own hitbox is tested
         against a stage at all: an over-cap player standing on the deck
         holds the stage where it is, charge intact, rather than riding it
         up. */
      if (overlaps(playerBox(), deckBox(m)) && burdenFrac() >= 1)
        push('refused', { x: m.box.x, y: m.deck.y }, { why: 'TOO HEAVY TO CLIMB' });
      else
        ascend(m, def, dt, top);
    } else descend(m, dt, bottom);
  }
}

/* Ascending: slow, and only with a lit burner. The load rides with the deck. */
function ascend(m, def, dt, top) {
  const y = Math.max(top, m.deck.y - eff('liftUp') * dt);
  const dy = y - m.deck.y;
  carry(m, dy);
  mw.deck(m, y, -1);
  mw.fire(m, 1);

  if (y > top) return;

  /* Arrived. The haul is handed to whichever band the deck top physically
     occupies. `lift.toBand` is the row's DECLARED destination and `reaches()`
     below is how anything else asks whether this stage's span actually gets
     there — a stage too short delivers to the band it is standing in, which is
     a placement mistake and not a crash. */
  const dest = bandAt(m.box.x + m.box.w / 2, y) || m.band;
  const handed = deposit(m, dest);
  mw.spendCharge(m, 1);
  mw.load(m, 0);
  push('winch', { x: m.box.x, y }, { def: m.def, to: dest.id, units: handed });
}

/* Descending: free, and 2.4x faster. The deck returns empty. */
function descend(m, dt, bottom) {
  const y = Math.min(bottom, m.deck.y + eff('liftDown') * dt);
  mw.deck(m, y, y < bottom ? 1 : 0);
}

const deckBox = m => ({
  x: m.box.x, y: m.deck.y - DECK_GRAB, w: m.box.w, h: DECK_GRAB * 2
});

/* Move whatever is resting on the deck with it. Items are world-positioned, so
   this is one addition per item — no parenting, no transform stack. */
function carry(m, dy) {
  let n = 0;
  for (const it of itemsIn(deckBox(m))) {
    it.y += dy;
    it.vy = 0;
    it.rest = 1;
    n++;
  }
  mw.load(m, n);
}

/* Hand the load to the destination band. An item's `band` is which band's tiles
   it collides against, and the only sanctioned way to change it is through the
   write API — so the item is removed and respawned at the same world pixel. */
function deposit(m, dest) {
  let n = 0;
  for (const it of itemsIn(deckBox(m))) {
    if (it.band === dest) { n++; continue; }
    const moved = iw.spawn(dest, it.x, it.y, it.sub, it.form, 0, 0);
    if (moved) { moved.rest = 0; n++; }
    iw.remove(it);
  }
  return n;
}

/* Does this stage's span actually reach the band its row promises? A query, not
   an assertion: placement is a player decision and a short stage is a mistake
   they are allowed to make. `view` and `shell` both want to be able to say so. */
export const reaches = m => {
  const def = defOf(m);
  if (!def.lift) return false;
  return bandAt(m.box.x + m.box.w / 2, m.box.y - def.lift.span) === bandOf(def.lift.toBand);
};
