/* ============================================================
   THE HUD. Data-driven inventory, no substance names.

   src/render/hud.js:57-62 hardcodes four names and their swatch colours:
       const kinds = [['copper', P.cuA], ['timber', P.woodA],
                      ['stone', P.limeB], ['ingot', '#ffd469']];
   so tin is invisible until someone remembers this file exists. Here the rows
   are derived from `item.hud` on the substance rows, which means adding tin
   puts tin in the HUD, in the right order, with the right swatch, from the
   same one row that gave it a vein.

   `always: true` keeps a slot visible at zero (the two the tutorial needs);
   everything else appears when you first hold one.
   ============================================================ */

import { S, SUBSTANCES } from '../data/substances.js';
import { COL } from '../data/palette.js';
import { mix } from '../core/color.js';
import { R, drawText, textWidth } from '../core/pixels.js';
import { invCount, run } from '../model/run.js';
import { mods } from '../model/mods.js';
import { TRINKET } from '../data/trinkets.js';

/* Derived once. Order is the row's `hud.order`, so it is content. */
const POCKETS = SUBSTANCES
  .filter(s => s.item?.hud)
  .sort((a, b) => a.item.hud.order - b.item.hud.order)
  .map(s => ({ sub: S[s.id], col: COL[s.look.item[0]],
               always: s.item.hud.always === true }));

export function pockets(g, x, y) {
  let cx = x;
  for (const p of POCKETS) {
    const n = invCount(p.sub);
    if (!n && !p.always) continue;
    R(g, cx, y + 1, 4, 4, p.col);
    R(g, cx, y + 4, 4, 1, mix(p.col, '#000000', 0.4));
    drawText(g, String(n), cx + 6, y, COL.ui, 1, 1);
    cx += 12 + textWidth(String(n));
  }
  return cx;
}

export function hearts(g, x, y) {
  for (let i = 0; i < run.maxHearts; i++)
    R(g, x + i * 9, y + 1, 5, 5, i < run.hearts ? COL.heart : COL.heartDim);
}

/* Granted trinkets, from the same store the sim reads. No second list. */
export function trinkets(g, x, y) {
  let cy = y;
  for (const id of mods.granted.keys()) {
    const t = TRINKET[id];
    if (!t) continue;                     // non-trinket modifier source
    drawText(g, t.name, x, cy, COL.ui, 1, 1);
    cy += 8;
  }
}
