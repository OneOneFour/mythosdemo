/* LAYER model — the player record.

   In `model` and not in `rules` for one reason: `view` must be able to draw the
   player, and `view` may not import `rules`. RFC 04's sibling rule is what
   forces this, and it is the rule that stops the renderer growing a gameplay
   dependency — which is how `paint.js:127` happened.

   The record is a plain object with no methods. `rules/player.js` moves it. */

import { bump } from './epoch.js';
import { rect } from '../core/math.js';

export const PW = 6, PH = 16;          // hitbox px; 2px slack in an 8px corridor

export const player = {
  band: null,                          // the band record they are standing in
  x: 0, y: 0, vx: 0, vy: 0,
  onGround: false, onLadder: false, coyote: 0,
  fallFrom: 0,                         // world y where the current fall began
  face: 1, walkPhase: 0
};

export const playerBox = () => rect(player.x, player.y, PW, PH);
export const playerCentre = () => ({ x: player.x + PW / 2, y: player.y + PH / 2 });

export const write = {
  spawn(band, tx, ty) {
    player.band = band;
    player.x = tx * band.tile + (band.tile - PW) / 2;
    player.y = ty * band.tile;
    player.vx = player.vy = 0;
    player.onGround = false; player.onLadder = false;
    player.fallFrom = player.y;
    bump();
  },

  move(x, y) { player.x = x; player.y = y; bump(); },
  vel(vx, vy) { player.vx = vx; player.vy = vy; bump(); },
  set(k, v) { player[k] = v; bump(); }
};
