import { R, drawText, mix } from '../core/px.js';
import { P } from '../core/palette.js';
import { SUB } from '../data/substances.js';
import { FORMS, byHudOrder } from '../data/forms.js';
import { TRINKETS, MACHINE_BOONS, MIRACLES } from '../data/boons.js';
import { stat } from '../sim/tunables.js';

/* ============================================================
   HUD — data-driven, in the same integer pixel space as the world.

   WHAT THIS REPLACES. src/render/hud.js:57-62 today is:

       const kinds = [['copper', P.cuA], ['timber', P.woodA],
                      ['stone', P.limeB], ['ingot', '#ffd469']];

   -- four substance names and four colours hardcoded in the renderer, so
   adding tin means editing a draw function, and a fifth substance silently
   does not appear. Below there are no substance names: the loop is over
   whatever the player is carrying, colours come from the substance row and
   order comes from the shared comparator in data/forms.js.
   ============================================================ */

export function pockets(g, x, y, inv) {
  let cx = x;
  for (const s of [...inv.stacks()].sort(byHudOrder)) {
    const row = SUB[s.sub], form = FORMS[s.form];
    R(g, cx, y + 1, 4, 4, row.item.col);
    /* Form is a swatch modifier, not a second table of colours: an ingot is
       the substance's colour with a highlight, so `shiny` is a form flag. */
    if (form.shiny) R(g, cx, y + 1, 2, 1, row.item.col2);
    R(g, cx, y + 5, 4, 1, mix(row.item.col, '#000000', 0.4));
    drawText(g, String(s.n), cx + 6, y, P.ui);
    cx += 18;
  }
  return cx;
}

/* The machine the player is touching says what it would accept, without the
   HUD knowing any substance. `wants()` is comp/recipe.js's expansion. */
export function machinePanel(g, x, y, host) {
  drawText(g, host.type.toUpperCase(), x, y, P.ui);
  const r = host.slots.recipe;
  if (!r) return;
  let cx = x;
  for (const q of r.wants().slice(0, 6)) {
    R(g, cx, y + 9, 4, 4, SUB[q.sub].item.col);
    cx += 6;
  }
  const h = host.slots.heat;
  if (h) drawText(g, h.hot() ? 'LIT' : 'COLD', x, y + 16, h.hot() ? P.hot : P.uiDim);
}

/* Boon cards. All three tiers come from one loop because a draft entry is
   [tier, id] and each table has `name` and `text`. */
const TIERS = { trinket: TRINKETS, machine: MACHINE_BOONS, miracle: MIRACLES };

export function boonCards(g, x, y, offer) {
  offer.forEach(([tier, id], i) => {
    const b = TIERS[tier][id];
    const cx = x + i * 54;
    R(g, cx, y, 50, 34, P.uiBack);
    drawText(g, b.name, cx + 2, y + 2, b.trap ? P.hot : P.ui);
    drawText(g, tier.toUpperCase(), cx + 2, y + 10, P.uiDim);
    if (b.mods) b.mods.forEach((m, k) =>
      drawText(g, m.key + ' x' + (m.mul ?? 1), cx + 2, y + 18 + k * 7, P.uiDim));
  });
}

/* Reading an effective tunable in the HUD is the same call the sim makes, so
   the number on screen cannot disagree with the number in the physics. */
export function statLine(g, x, y) {
  drawText(g, 'WALK ' + stat('walk').toFixed(0), x, y, P.uiDim);
}

/* STUB: the depth gauge, tribute panel, favour panel and the narrow-viewport
   clamps. Layout is not the thing being evaluated. */
