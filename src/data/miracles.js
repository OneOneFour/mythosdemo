/* LAYER data — MIRACLES: the ONE-SHOT tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Frozen. Imports nothing.
   May be imported by `data`, `model`, `rules`, `view`.

   A miracle is a HELD PAIR: `id` is a substance id crossed with the one
   `phial` form, so "holding a miracle" is exactly
   `invCount(S[id], F.phial) > 0`. See
   docs/DEVELOPER_GUIDE.md#the-four-gift-tiers

   `rules/miracles.js#use` spends exactly one unit on use, applies `effect` to
   the world through `model/tiles.js#write`, and may grant a `data/boons.js`
   row afterward as a side-effect.

     effect.kind    'collapse' -- clear every tile in a `radius`-tile square
                    centred on the aim reticle to AIR, THROUGH
                    `model/tiles.js#write.clear`, which already repaints only
                    the chunks it touches (invariant 3). Picked over
                    "petrify" (converting tiles TO a harder substance)
                    because it needs no new tile-write verb beyond one
                    already used everywhere mining breaks a tile.
     effect.boon    OPTIONAL. A `data/boons.js` id granted as a side-effect
                    the instant the miracle is used. */

export const MIRACLES = [

  { id:'chasm', name:'RIFT OF HADES', god:'hades',
    text:'THE GROUND REMEMBERS ITS OWNER',
    effect:{ kind:'collapse', radius:1, boon:'hades-passage' } }
];

export const MIRACLE = Object.freeze(Object.fromEntries(
  MIRACLES.map(m => [m.id, Object.freeze(m)])));
