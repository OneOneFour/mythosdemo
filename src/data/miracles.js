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

     effect.kind    OPTIONAL -- a row carrying only `effect.boon` edits no
                    tiles at all. Two kinds exist, and
                    `tools/content.mjs` holds the closed set:

                    'collapse'  clear every tile in a `radius`-tile square
                                centred on the aim reticle to AIR, THROUGH
                                `model/tiles.js#write.clear`, which already
                                repaints only the chunks it touches
                                (invariant 3). Picked over "petrify"
                                (converting tiles TO a harder substance)
                                because it needs no new tile-write verb
                                beyond one already used everywhere mining
                                breaks a tile.
                    'transmute' turn every ALREADY-SOLID tile in that same
                                square into native `effect.sub`, through
                                `model/tiles.js#write.set`. Same argument
                                for the same reason: an existing verb, no
                                new one. It converts rock and never creates
                                it, so it can neither entomb the player nor
                                hand them a free step upward.

     effect.sub     the substance a 'transmute' turns rock into.
     effect.boon    OPTIONAL. A `data/boons.js` id granted as a side-effect
                    the instant the miracle is used.

   USE IS AIMED, EVEN WHEN THE EFFECT IS NOT. `rules/miracles.js#use`
   returns before spending anything when the reticle resolves to no band, so
   a boon-only phial still cannot be drunk while aiming at open sky -- the
   same rule every other aimed verb obeys. */

export const MIRACLES = [

  { id:'chasm', name:'RIFT OF HADES', god:'hades',
    text:'THE GROUND REMEMBERS ITS OWNER',
    effect:{ kind:'collapse', radius:1, boon:'hades-passage' } },

  /* THE PURE-BOON PHIAL, and it needed no engine change at all: `applyEffect`
     already grants `effect.boon` independently of `effect.kind`. Poseidon's
     flood SUPPRESSES `hephaestus-forge`, so drinking this while the forge is
     lit costs the forge -- the hostile pair `data/boons.js` already ships,
     reached from a second direction. */
  { id:'tide', name:'VIAL OF THE DEEP', god:'poseidon',
    text:'EVERY STONE REMEMBERS THE SEA',
    effect:{ boon:'poseidon-flood' } },

  /* 3x3 of rock become native copper, at copper's own `tile.charge` -- so it
     pays in WALKING SAVED and not in free ore: every unit still costs a full
     swing at copper's own `tile.hard`. It can do nothing at all to air (the
     branch skips any tile that is not already solid), which is what keeps it
     out of the "up is expensive" argument entirely. */
  { id:'lodestone', name:'LODESTONE OF THE FORGE', god:'hephaestus',
    text:'BASE ROCK REMEMBERS THE VEIN',
    effect:{ kind:'transmute', radius:1, sub:'copper' } }
];

export const MIRACLE = Object.freeze(Object.fromEntries(
  MIRACLES.map(m => [m.id, Object.freeze(m)])));
