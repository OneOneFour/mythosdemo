/* ============================================================
   Deck — needs `footprint`, `heat`. One lift stage: drum, deck, counterweight.

   CLAUDE.md invariant 4: five independent stages, one per level pair, never
   one continuous cage. Each stage is its own machine row, so "five stages" is
   five placements and not a special case.

   CLAUDE.md invariant 5: down is free, up is expensive. Ascends at
   stat('lift.up') = 11 px/s and descends at stat('lift.down') = 26 px/s, and
   ONLY ascends while the heat slot is lit. The asymmetry is two tunable rows,
   so a boon can change it and a trinket can be a genuine lift upgrade.

   This is the file to read to see the blood winch work. There is nothing in
   it about fuel, timber, hearts, buffers or items. It asks the heat slot one
   question — `need.heat.hot` — and that question has two answers in the
   codebase today and will have more.
   ============================================================ */

import { stat } from '../../model/mods.js';

export function deck(rec, need, host, ctx) {
  const fp = need.footprint;
  const up = stat(rec.up), down = stat(rec.down);

  if (rec.dir < 0) {
    if (!need.heat.hot) { host.look.stall = 'NO HEAT'; return; }   // stalls, lit or not
    host.look.stall = null;
    rec.y -= up * ctx.dt;
    if (rec.y <= 0) { rec.y = 0; rec.dir = 1; }
  } else {
    rec.y += down * ctx.dt;                                         // gravity is free
    if (rec.y >= rec.span) { rec.y = rec.span; rec.dir = -1; }
  }

  host.look.deckY = fp.y + rec.y;
}
