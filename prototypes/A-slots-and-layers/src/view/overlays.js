/* ============================================================
   OVERLAYS — fields, fog, mining cracks on top of the cached chunk blit.

   Fields deliberately do NOT dirty chunk canvases: a chunk repaint is
   thousands of fill calls and a flowing field changes every frame, so a flood
   front would thrash the cache. Drawing them here as a viewport-culled
   overlay is what keeps DESIGN items 5, 6 and 22 cheap.

   STUB (leaf): the draw bodies. The seam is that this stage exists at all —
   src/ has scene/entities/hud and no overlay stage, which is why its fog-of-war
   cell is AWKWARD.
   ============================================================ */

import { active } from '../model/fields.js';
import { R } from '../core/pixels.js';
import { COL } from '../data/palette.js';

export function heatOverlay(g, b, view) {
  const f = active(b, 'heat');
  if (!f) return;
  void view;
  /* Walk f.ring[0..f.len) and shade cells whose value exceeds epsilon. */
  R(g, 0, 0, 0, 0, COL.hot);
}

export function fog(g, b, view) { void g; void b; void view; }
