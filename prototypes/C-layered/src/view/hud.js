/* LAYER view — the HUD. Reads model queries; names no substance.

   Today `render/hud.js:57-62` hardcodes four substance names and a fifth
   special case. Here the pocket strip is a filter and a sort over the substance
   table, so appending `tin` gave it a slot and appending `brick` gave it
   another. `hud:{ order }` on the row is the only control. */

import { SUB } from '../data/substances.js';
import { COL } from '../data/palette.js';
import { MACH } from '../data/machines.js';
import { R, drawText, textWidth } from '../core/pixels.js';
import { mix } from '../core/color.js';
import { run, invCount } from '../model/run.js';
import { fill } from '../model/machines.js';
import { mods } from '../model/mods.js';
import { TRINKET } from '../data/trinkets.js';

/* Built once at module load: the sorted list of substances that want a pocket
   slot. Adding a row to `data/substances.js` with `item.hud` is the whole diff.
   `always:true` shows a zero, which is how the tutorial teaches copper. */
const POCKETS = SUB.filter(s => s.item?.hud)
                   .sort((a, b) => a.item.hud.order - b.item.hud.order);

export function drawHUD(g, W, H) {
  hearts(g, 6, 6);
  pockets(g, 6, 18);
  boons(g, 6, H - 30);
  /* Narrow viewports: below ~240 px base width these panels overlap, so the
     pocket strip clamps its width and the boon list drops to icons. Kept from
     today's `drawHUD`, which learned it the hard way. */
}

function hearts(g, x, y) {
  for (let i = 0; i < run.maxHearts; i++) {
    const col = i < run.hearts ? COL.bloodA : COL.uiBack;
    R(g, x + i * 9, y, 5, 5, col);
    R(g, x + i * 9 + 1, y + 5, 3, 1, col);
  }
}

function pockets(g, x, y) {
  let cx = x;
  for (const s of POCKETS) {
    const n = invCount(s.id);
    if (!n && !s.item.hud.always) continue;
    const col = COL[s.look.item[0]];
    R(g, cx, y + 1, 4, 4, col);
    R(g, cx, y + 4, 4, 1, mix(col, '#000000', 0.4));
    drawText(g, String(n), cx + 6, y, COL.ui, 1, 1);
    cx += 12 + textWidth(String(n));
  }
}

/* Machine buffer pips, also from the row: `look.pips` names a selector and a
   row index, and `fill()` is a model query. No machine name here either. */
export function drawMachinePips(g, m) {
  const def = MACH[m.def];
  for (const p of def.look.pips || []) {
    const f = fill(m, p.sel);
    R(g, m.box.x + 1, m.box.y + 1 + p.row * 3, Math.round(f * (def.tw * 8 - 2)), 2,
      f > 0.55 ? COL.lavaA : COL.ui);
  }
}

/* Active trinkets and what they are bending, straight out of the mod store.
   This is the debug overlay that answers "why is my walk speed 69". */
function boons(g, x, y) {
  let ty = y;
  for (const id of run.trinkets) {
    drawText(g, TRINKET[id].name, x, ty, COL.ui, 1, 1);
    ty += 8;
  }
  for (const m of mods.rows) {
    drawText(g, `${m.key} ${m.mul !== undefined ? 'x' + m.mul : '+' + m.add}`,
             x, ty, COL.uiDim, 1, 1);
    ty += 8;
  }
}
