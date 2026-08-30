/* LAYER rules — the staged lift, one stage per machine row carrying `lift`.

   Five stages, five machine records, five drums. A stage rises only while it
   has a charge, and a charge is what the machine interpreter banks when a
   recipe with `out:{}` completes. That indirection is the whole reason the
   blood winch needs no lift code of its own: the winch's second recipe pays a
   heart for a charge, and this file cannot tell a heart from a log.

   Down is free, up is expensive: `liftUp` 11 px/s against `liftDown` 26 px/s,
   both through the tunable store so a boon may bend them (CLAUDE.md
   invariant 5). */

import { MACH } from '../data/machines.js';
import { eff } from '../model/mods.js';
import { machines, write as mw } from '../model/machines.js';
import { push } from '../model/journal.js';

export function step(dt) {
  for (const m of machines) {
    const def = MACH[m.def];
    if (!def.lift) continue;

    const top = m.box.y, bottom = m.box.y + def.lift.span;
    const up = eff('liftUp'), down = eff('liftDown');

    if (m.deck.dir >= 0 && m.charges > 0) {
      /* ascending: burns one charge per stage traverse */
      const y = Math.max(top, m.deck.y - up * dt);
      mw.deck(m, y, 1);
      if (y <= top) {
        mw.spendCharge(m, 1);
        mw.deck(m, top, -1);
        push('lift', { x: m.box.x, y: top }, { machine: def.id, dir: 'up' });
      }
    } else {
      /* descending under gravity, free */
      const y = Math.min(bottom, m.deck.y + down * dt);
      mw.deck(m, y, y >= bottom ? 1 : -1);
    }
  }
}
