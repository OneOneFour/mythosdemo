/* LAYER view — the BAR primitive: a labelled fill bar (burden, craft
   progress). Pure geometry and a fraction in; this file owns no game colour
   rule (amber past a soft cap, red at a hard cap) — the caller resolves that
   through `model/mods.js#eff` and hands over a colour name, exactly the way
   `view/hud.js#burden` already picks `UI.amber`/`UI.heart` itself today. A
   generic widget must not learn what "burden" means.
   See docs/DEVELOPER_GUIDE.md#widget-primitives */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const DIM = colour('uiDim'), INK = colour('ui'), BACK = colour('uiBack');
const TRACK = mix(BACK, DIM, 0.3);

/* `opts`: { id, x, y, w, h?, frac, fillColour?, label?, valueText?, vw? }.
   `label` draws one line above the bar; `valueText` draws to the bar's
   right (e.g. "12.5 / 40 T"). Either may be omitted. `vw` is optional
   because a bar is usually placed inside an already-clamped panel's content
   area and inherits that safety — but a caller drawing one directly against
   the HUD (a burden line with no panel around it, `view/hud.js`'s own
   pre-Phase-5 precedent) still needs it to not run off a narrow viewport. */
export function drawBar(g, opts) {
  const {
    id, h = 3, frac, fillColour = INK, label = '', valueText = '', vw = Infinity
  } = opts;
  let { x, y, w } = opts;
  x |= 0; y |= 0;
  w = Math.max(1, Math.min(w | 0, vw - x - 2));
  const clamped = Math.max(0, Math.min(1, frac));

  let barY = y;
  if (label) { drawText(g, label, x, y, INK, 1, 1); barY = y + 8; }

  R(g, x, barY, w, h, TRACK);
  R(g, x, barY, Math.round(w * clamped), h, fillColour);

  /* FINDINGS #13: a fixed `x + w + 3` put the value flush past the BAR alone,
     so a `label` wider than the bar (every TRIBUTE demand row: "COPPER
     PLATE" is 71 px, the bar under it is 50) let the value text start
     underneath the label's own tail end rather than clear of it -- the
     bar and the label share one x origin, and only the bar's own width was
     ever measured against. Clearing the wider of the two, then clamping the
     whole string against `vw`, is what actually keeps a wide value off both
     the label above it and the edge of a narrow viewport, instead of just
     moving the failure from "overlaps the bar" (never true here -- the bar's
     own track ends 3 px before either screenshot's value text starts, by
     measurement) to "overlaps the label" or "runs off the canvas". */
  if (valueText) {
    const startX = x + Math.max(w, label ? textWidth(label) : 0) + 3;
    const vtw = textWidth(valueText);
    const tx = Math.min(startX, Math.max(x, vw - vtw - 2));
    drawText(g, valueText, tx, barY - 2, DIM, 1, 1);
  }

  const rect = { id, x, y, w, h: barY + h - y, frac: clamped, label, valueText };
  drawn.bars.push(rect);
  return rect;
}
