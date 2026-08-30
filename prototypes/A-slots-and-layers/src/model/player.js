/* The player's body. A record, no methods. `rules/player.js` moves it;
   `view/` reads it; `rules/parts/handfeed.js` reads its box. */

import { bump } from './epoch.js';

export const PW = 6, PH = 16;             // hitbox px (2px slack in an 8px corridor)

export const player = {
  x: 0, y: 0, vx: 0, vy: 0,
  onGround: false, onLadder: false, coyote: 0, fallFrom: 0,
  face: 1, walkPhase: 0, landFlash: 0, hurtFlash: 0,
  cmd: { left: 0, right: 0, up: 0, dig: 0 }   // written by shell/input.js
};

export const box = () => ({ x: player.x, y: player.y, w: PW, h: PH });

export const write = {
  spawn(tx, ty, tile) {
    Object.assign(player, { x: tx * tile + (tile - PW) / 2, y: ty * tile,
                            vx: 0, vy: 0, onGround: false, fallFrom: ty * tile });
    bump();
  },
  move(x, y) { player.x = x; player.y = y; bump(); }
};
