/* view layer — per-item sprites, dispatched by `look.sprite` string key.
   `draw(g, px, py, t)` takes `px, py` as the sprite's centre, not a tile's
   top-left, and `size` is independent of the pickup's 4 px hitbox. Integer
   pixels; the bob derives from the caller's clock, never from `rand()`. */

import { R, lineTo } from '../core/pixels.js';
import { colour } from '../data/palette.js';

export const SPRITE = {
  pick: {
    size: 10,
    draw(g, px, py, t) {
      const bob = Math.sin(t * 2.4) * 1;
      const cy = py + bob;
      lineTo(g, (px - 4) | 0, (cy + 4) | 0, (px + 2) | 0, (cy - 3) | 0, colour('woodB'));
      R(g, px - 2, cy - 5, 6, 2, colour('irA'));
      R(g, px - 2, cy - 3, 6, 1, colour('irC'));
    }
  },

  bellows: {
    size: 10,
    draw(g, px, py, t) {
      const bob = Math.sin(t * 2.4) * 1;
      const cy = py + bob;
      R(g, px - 6, cy - 4, 2, 8, colour('woodC'));
      lineTo(g, (px - 4) | 0, (cy - 4) | 0, (px + 3) | 0, (cy - 1) | 0, colour('ochreB'));
      lineTo(g, (px - 4) | 0, (cy + 4) | 0, (px + 3) | 0, (cy + 1) | 0, colour('ochreC'));
      R(g, px + 3, cy - 1, 3, 2, colour('irB'));
    }
  },

  brand: {
    size: 9,
    draw(g, px, py, t) {
      const bob = Math.sin(t * 2.4) * 1;
      const cy = py + bob;
      lineTo(g, (px - 4) | 0, (cy + 4) | 0, (px + 2) | 0, (cy - 3) | 0, colour('woodB'));
      R(g, px + 1, cy - 4, 2, 2, colour('lavaD'));
      R(g, px + 2, cy - 4, 1, 1, colour('lavaB'));
    }
  }
};
