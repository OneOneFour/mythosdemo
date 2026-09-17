/* view layer — the bar primitive: a labelled fill bar. The caller resolves
   any state colour rule through `model/mods.js#eff` and hands over
   `fillColour`; this file owns no game colour rule. */
import { drawText, textWidth } from '../../core/font.js';
import { R } from '../../core/pixels.js';
import { mix } from '../../core/palette.js';
import { colour } from '../../data/palette.js';
import { drawn } from './state.js';

const DIM = colour('uiDim'), INK = colour('ui'), INK2 = colour('uiInk2'), BACK = colour('uiBack');
const TRACK = mix(BACK, DIM, 0.3);

/* `label` draws one line above the bar, `valueText` to its right, and either
   may be omitted. `vw` clamps the right edge for a bar drawn straight onto the
   world rather than inside an already-clamped panel. */
export function drawBar(g, opts) {
  const {
    id, h = 3, frac, fillColour = INK, label = '', valueText = '', vw = Infinity,
    shadow = null
  } = opts;
  let { x, y, w } = opts;
  x |= 0; y |= 0;
  w = Math.max(1, Math.min(w | 0, vw - x - 2));
  const clamped = Math.max(0, Math.min(1, frac));

  let barY = y;
  if (label) { drawText(g, label, x, y, INK, 1, 1, shadow); barY = y + 8; }

  R(g, x, barY, w, h, TRACK);
  R(g, x, barY, Math.round(w * clamped), h, fillColour);

  /* The value clears the wider of bar and label -- they share one x origin and
     a label can outrun its bar -- then clamps against `vw`. */
  if (valueText) {
    const startX = x + Math.max(w, label ? textWidth(label) : 0) + 3;
    const vtw = textWidth(valueText);
    const tx = Math.min(startX, Math.max(x, vw - vtw - 2));
    drawText(g, valueText, tx, barY - 2, INK2, 1, 1, shadow);
  }

  const rect = { id, x, y, w, h: barY + h - y, frac: clamped, label, valueText };
  drawn.bars.push(rect);
  return rect;
}
