/* LAYER data — MIRACLES: the ONE-SHOT tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Frozen. Imports nothing.
   May be imported by `data`, `model`, `rules`, `view`.

   A miracle is a HELD PAIR, not a verb of its own: `id` is a substance id
   from `data/substances.js` (one row per miracle, the same identity trick
   `data/trinkets.js` already uses for `bellows`), crossed with the one
   `phial` form Phase 1 added specifically so a miracle could never satisfy a
   `relic` selector by accident. "Holding a miracle" is therefore exactly
   `invCount(S[id], F.phial) > 0` -- the same question asked of a lump of ore,
   nothing new to track.

   `rules/miracles.js#use` spends exactly one unit on use, applies
   `effect` to the world through `model/tiles.js#write`, and -- per
   docs/DESIGN.md, "a miracle may grant a timed boon as a side-effect" -- may
   grant a `data/boons.js` row afterward, which is one of that tier's three
   stated sources (god grant, altar use, miracle side-effect).

     effect.kind    'collapse' -- clear every tile in a `radius`-tile square
                    centred on the aim reticle to AIR, THROUGH
                    `model/tiles.js#write.clear`, which already repaints only
                    the chunks it touches (invariant 3). The simplest real
                    terrain edit available, per this phase's own
                    instruction -- picked over "petrify" (converting tiles TO
                    a harder substance) because it needs no new tile-write
                    verb beyond one already used everywhere mining breaks a
                    tile.
     effect.boon    OPTIONAL. A `data/boons.js` id granted as a side-effect
                    the instant the miracle is used. */

export const MIRACLES = [

  { id:'chasm', name:'RIFT OF HADES', god:'hades',
    text:'THE GROUND REMEMBERS ITS OWNER',
    effect:{ kind:'collapse', radius:1, boon:'hades-passage' } }
];

export const MIRACLE = Object.freeze(Object.fromEntries(
  MIRACLES.map(m => [m.id, Object.freeze(m)])));
