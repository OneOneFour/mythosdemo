/* ============================================================
   BloodBurner — PROVIDES `heat`, needs NOTHING.

   DESIGN item 12, the trap boon: a lifter fuelled by the player's own health
   instead of timber. Offered on cycle 3, when you are desperate.

   The entire mechanic is this file plus one row in data/parts.js plus one row
   in data/machines.js. Read what it does NOT touch:

     - rules/parts/deck.js       unchanged. It reads {hot, level}.
     - rules/parts/recipe.js     unchanged. Blood can bake bricks.
     - model/machines.js         unchanged. Assembly is generic over parts.
     - data/substances.js        unchanged. HEALTH DOES NOT BECOME AN ITEM.
     - model/slots.js            unchanged. `heat` has no ops to add.
     - view/, shell/, tools/     unchanged.

   The reason is the promotion at the top of data/slots.js: capability is
   keyed to a SLOT, not to a type or a recipe shape. `heat` was never "a
   burner"; it was always "something that is hot, to this degree". Timber and
   hearts are two answers to that question and the question does not care.

   The design cost, honestly: `needs: []` means this part has no buffer and no
   footprint, so it cannot show a fuel gauge or emit sparks from a mouth. That
   is correct — there is no fuel and no mouth — but it means `host.look.fire`
   is the only feedback the player gets that they are being drained. The
   `look.cursed` flag on the machine row is there for the renderer to make it
   unmistakable, and whether that is enough is a design question, not an
   architecture one.
   ============================================================ */

import { stat } from '../../model/mods.js';
import { run, write as rw } from '../../model/run.js';
import { write as jw } from '../../model/journal.js';

export function bloodburner(rec, need, host, ctx) {
  void need;
  const span = rec.secs * stat('burn.span');
  rec.lit = Math.max(0, rec.lit - ctx.dt);

  if (rec.lit <= 0 && run.hearts > rec.hearts
      && rw.spendHearts(rec.hearts, 'THE WINCH DRANK YOU')) {
    rec.lit = span;
    rec.paid += rec.hearts;
    jw.push('bleed', host.id, rec.hearts);
  }

  rec.hot = rec.lit > 0;                       // identical slot contract
  rec.level = span > 0 ? Math.min(1, rec.lit / span) : 0;
  host.look.fire = rec.level;
  host.look.cost = rec.paid;
}
