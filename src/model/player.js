/* model layer — the player record and the fall-damage table.

   A plain record with no methods; `rules/player.js` moves it. Every physics
   number lives in `data/tuning.js` and is read through `eff()`; only the
   hitbox is here. */

import { rect } from '../core/math.js';
import { bump } from './epoch.js';
import { eff } from './mods.js';

/* 1 x 2 tiles, 2 px narrower than an 8 px tile so a one-tile corridor has
   slack. */
export const PW = 6, PH = 16;

export const player = {
  band: null,                 // the band record whose tiles they collide against
  x: 0, y: 0, vx: 0, vy: 0,   // world px
  onGround: false, onLadder: false, coyote: 0,
  fallFrom: 0,                // world y where the current fall began
  face: 1, walkPhase: 0,
  landFlash: 0, hurtFlash: 0, digging: false
};

export const playerBox    = () => rect(player.x, player.y, PW, PH);
export const playerCentre = () => ({ x: player.x + PW / 2, y: player.y + PH / 2 });

export const write = {
  /* `tx`/`ty` are band-local tiles. Every field is reset, not just position:
     one surviving a spawn makes two runs of the same seed diverge. */
  spawn(band, tx, ty) {
    player.band = band;
    player.x = band.origin.x + tx * band.tile + (band.tile - PW) / 2;
    player.y = band.origin.y + ty * band.tile;
    player.vx = 0; player.vy = 0;
    player.onGround = false; player.onLadder = false; player.coyote = 0;
    player.fallFrom = player.y;
    player.face = 1; player.walkPhase = 0;
    player.landFlash = 0; player.hurtFlash = 0; player.digging = false;
    bump();
  },

  move(x, y)   { player.x = x; player.y = y; bump(); },
  vel(vx, vy)  { player.vx = vx; player.vy = vy; bump(); },
  band(b)      { player.band = b; bump(); },
  set(k, v)    { player[k] = v; bump(); }
};

/* Hearts lost for an impact speed in px/s. With g = 320 px/s^2 and
   v = sqrt(2gh): 40 px (5 tiles) -> 160 px/s -> 0 hearts, 64 px (8 tiles) ->
   202 px/s -> 1, 160 px (20 tiles) -> 320 px/s -> 5 and lethal. */
export const fallHearts = v => {
  const safe = eff('fallSafe'), per = eff('fallHeart'), max = eff('fallMax');
  return Math.max(0, Math.min(max, Math.floor((v - safe) / per)));
};
