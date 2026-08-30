/* LAYER model — the player record, and the fall-damage table.
   Imports `core`, `model`. May be imported by `model`, `rules`, `view`.

   In `model` and not in `rules` for one reason: `view` must be able to draw the
   player, and `view` may not import `rules`. That sibling rule is what stops the
   renderer growing a gameplay dependency.

   The record is a plain object with no methods. `rules/player.js` moves it.
   Every physics NUMBER lives in `data/tuning.js` and is read through
   `eff()`, so a god's boon can change walk speed; only the hitbox is here,
   because a hitbox is geometry and not a tunable. */

import { rect } from '../core/math.js';
import { bump } from './epoch.js';
import { eff } from './mods.js';

/* 1 x 2 tiles, with 2px of slack in an 8px corridor. */
export const PW = 6, PH = 16;

export const player = {
  band: null,                 // the band record whose tiles they collide against
  x: 0, y: 0, vx: 0, vy: 0,   // world px
  onGround: false, onLadder: false, coyote: 0,
  fallFrom: 0,                // world y where the current fall began
  face: 1, walkPhase: 0,
  /* Presentation timers. In `model` because `view` reads them and `rules`
     writes them, which is exactly the case the sibling rule creates. */
  landFlash: 0, hurtFlash: 0, digging: false
};

export const playerBox    = () => rect(player.x, player.y, PW, PH);
export const playerCentre = () => ({ x: player.x + PW / 2, y: player.y + PH / 2 });

export const write = {
  /* `tx`/`ty` are band-local tiles. Every field is reset, not just position: a
     spawn that left `coyote` and `walkPhase` set carried jump grace and
     animation phase across a restart, and made two runs of the same seed render
     differently. A field that survives a restart is a determinism bug. */
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

/* ---- the fall-damage table, from docs/SPEC.md section 3 --------------------
   With g = 320 px/s^2 and v = sqrt(2gh):

     drop 40 px  =  5 tiles -> 160 px/s -> 0 hearts
     drop 64 px  =  8 tiles -> 202 px/s -> 1 heart
     drop 160 px = 20 tiles -> 320 px/s -> 5 hearts, lethal

   A query and not a decision: it returns a number, and `rules/player.js` is
   what spends it. It reads through `eff` so a trinket can add to `fallSafe`. */
export const fallHearts = v => {
  const safe = eff('fallSafe'), per = eff('fallHeart'), max = eff('fallMax');
  return Math.max(0, Math.min(max, Math.floor((v - safe) / per)));
};
