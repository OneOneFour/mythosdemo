/* LAYER view — ITEM SPRITES: a named per-item shape, dispatched by
   `look.sprite` from `view/paint.js#paintItem`, the same "data names it, view
   draws it generically" idiom `view/treatments.js#TREAT` already uses for
   tile decoration (CLAUDE.md D7, SPEC §12 — no substance name may appear in
   this file, only the generic `SPRITE[name]` lookup by string).
   Imports `core` only.

   Integer pixels only (invariant 11). The bob is derived from the clock `t`
   passed in by the caller, never from a frame counter or `rand()`
   (invariant 7) — the same rule `view/treatments.js`'s own header states for
   anything that "has to breathe". */

import { R, lineTo } from '../core/pixels.js';
import { colour } from '../data/palette.js';

export const SPRITE = {
  /* An angled haft and a flat iron head, planted upright — a freehand port of
     docs/ARCHAEOLOGY.md section 4.2's `drawPickup()` (haft via a diagonal
     `lineTo`, head via two stacked rects) into this codebase's own item
     coordinate space (`px, py` is the sprite's CENTRE, not a tile's top-left).
     `size` is this sprite's own declared draw size, independent of the
     pickup's tiny 4px hitbox (`data/forms.js#relic.size`) — the whole point
     of a dedicated sprite is to read at 8-12 px per SPEC §5, larger than the
     generic dropped-item square. */
  pick: {
    size: 10,
    draw(g, px, py, t) {
      const bob = Math.sin(t * 2.4) * 1;
      const cy = py + bob;
      lineTo(g, (px - 4) | 0, (cy + 4) | 0, (px + 2) | 0, (cy - 3) | 0, colour('woodB'));
      R(g, px - 2, cy - 5, 6, 2, colour('irA'));
      R(g, px - 2, cy - 3, 6, 1, colour('irC'));
    }
  }
};
