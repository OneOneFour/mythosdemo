/* LAYER view — the TOOLTIP primitive: follows the cursor, clamps to the
   viewport, multi-section (a blank line separates sections — inputs vs.
   output vs. flavour text, for instance). One at a time: `drawn.tooltip` is
   a single slot, the same singular idiom `view/hud.js#hoverInfo` already
   uses, because only one tooltip can be under the cursor at once. */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const INK = colour('ui'), INK2 = colour('uiInk2'), BACK = colour('uiBack');

/* `opts`: { sections: Line[][], cx, cy, vw, vh, offset? }, where a `Line` is
   either a plain string or `{ s, col }`.

   `sections` is an array of line-arrays; a blank line is inserted between
   sections when joining. Returns `{ x, y, w, h, lines }`, and `lines` is
   always a flat array of PLAIN STRINGS whatever form went in -- it is the
   test hook's projection (`shell/main.js`'s `__mf.ui.tooltip`) and several
   assertions call `String.prototype.startsWith` on its members.

   ---------------------------------------------------------------------------
   TONE. Line 0 of the joined list is the title and draws in `INK`; every body
   line draws in `INK2`, the secondary body tone, NOT in `uiDim`. This is the
   single highest-traffic grey in the game -- band tips, recipe tooltips, pair
   tooltips and machine tooltips all land here -- and none of it encodes
   state, so none of it belongs on the state tone (Phase 13a,
   docs/PLAN-phase13.md §2.3/§2.4).

   The ONE exception §2.3 names is a body line that IS a state: `view/ui/
   mainPanel.js#recipeTooltip`'s "UNKNOWN -- NOT YET STOLEN". Rather than
   teach this primitive to recognise that string -- a name check in a generic
   widget, the same mistake D7 refuses for `decorate` -- the CALLER hands over
   its own colour on the line, the same way `view/ui/bar.js` is handed
   `fillColour` rather than learning what "burden" means. A generic widget
   must not learn which of its lines are semantic.

   NO SHADOW. A tooltip is a panel with a 0.92-alpha `BACK` fill behind every
   line of it, which is already the backing a shadow would be substituting
   for. */
export function drawTooltip(g, opts) {
  const { sections, cx, cy, vw, vh, offset = 8 } = opts;
  const rows = [];
  sections.forEach((sec, i) => {
    if (i > 0) rows.push({ s: '', col: null });
    for (const l of sec) rows.push(typeof l === 'string' ? { s: l, col: null } : l);
  });

  let w = 0;
  for (const r of rows) w = Math.max(w, textWidth(r.s));
  w += 8;
  const h = rows.length * 8 + 4;

  const x = Math.max(0, Math.min(cx + offset, vw - w - 2));
  const y = Math.max(0, Math.min(cy + offset, vh - h - 2));

  g.globalAlpha = 0.92; R(g, x, y, w, h, BACK); g.globalAlpha = 1;
  R(g, x, y, w, 1, mix(BACK, INK, 0.55));

  rows.forEach((r, i) => {
    if (!r.s) return;
    drawText(g, r.s, x + 4, y + 3 + i * 8, r.col || (i === 0 ? INK : INK2), 1, 1);
  });

  const rect = { x, y, w, h, lines: rows.map(r => r.s) };
  drawn.tooltip = rect;
  return rect;
}
