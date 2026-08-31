/* LAYER view — the BAR primitive: a labelled fill bar (burden, craft
   progress). Pure geometry and a fraction in; this file owns no game colour
   rule (amber past a soft cap, red at a hard cap) — the caller resolves that
   through `model/mods.js#eff` and hands over a colour name, exactly the way
   `view/hud.js#burden` already picks `UI.amber`/`UI.heart` itself today. A
   generic widget must not learn what "burden" means. */
import { drawText } from '../../core/font.js';
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
  if (valueText) drawText(g, valueText, x + w + 3, barY - 2, DIM, 1, 1);

  const rect = { id, x, y, w, h: barY + h - y, frac: clamped, label, valueText };
  drawn.bars.push(rect);
  return rect;
}
