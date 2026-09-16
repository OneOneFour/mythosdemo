# The substance table's derivations

Salvaged from `src/data/substances.js` when its header and per-row essays were
cut. The file keeps the field key and each row's constraint; this holds the mass
arithmetic, the ordinal ceiling, and the art recoveries.

## Tile-capable rows cannot be appended at all

Appending is safe for anything that never reaches the tile byte — a relic, a
miracle, a machine item — because those cost an ordinal and nothing else. It is
NOT safe for a row with a `tile` block, or one crossable with a tile-capable
form: `data/forms.js`'s import-time guard prices the highest PACKABLE ordinal
against `BEDROCK`, and `SUB.length` is already past `PACKABLE_LIMIT`, so
appending such a row THROWS AT IMPORT today. Measured rather than predicted —
at 27 rows and 13 forms an appended packable row packs to
`1 + 27 * 14 + 13 = 392` of 255.

`docs/SPEC.md` §15 used to read as if twelve ordinals of tile-capable headroom
remained. That was true as a SLOT COUNT and misleading as advice: all twelve of
those slots, ordinals 9-20, are already occupied by non-packable rows, so real
appendable headroom for a tile-capable row is ZERO. Such a row must be INSERTED
at an ordinal at or below `PACKABLE_LIMIT`, which is safe because no tile byte
is ever persisted — an insertion is only ever a renumbering.

## Machine-substance masses, all from one arithmetic

Every mass is `Σ substance.item.mass × form.massK × n` over the build recipe,
the same `model/items.js#massOfPair` arithmetic every other row uses, never a
second sum.

| substance | bill | mass |
|---|---|---|
| furnace | 12 copper/ore + 6 timber/log | 12×1.0 + 6×0.8 = 16.8 T |
| press | 4 copper/plate + 2 copper/ingot | 4×2.4 + 2×1.6 = 12.8 T |
| belt | 2 copper/plate + 4 stone/gravel | 2×2.4 + 4×0.3 = 6.0 T |
| cloud_dock | 5 copper/plate + 1 copper/ingot + 2 timber/log | 5×2.4 + 1×1.6 + 2×0.8 = 15.2 T |

**The segment-transport family is priced around one number.** A segment needs
TWO hubs, so 2 × 10.4 = 20.8 T is the pair — exactly what the one winch stage
it replaced weighed, to the decigram. A complete minimal segment, two hubs plus
one crank, is 24.1 T, so it fits inside one 40 T trip; adding a gear makes it
26.0 T and it still does. That is why a hub is HALF the retired winch rather
than equal to it: pricing a hub at the stage's own 20.8 T would put a working
segment at 44.9 T and make "carry the way up down a shaft" a two-trip errand
for no design gain.

**`cloud_dock` is a hub plus a deck.** The hub's own bill with two more plate,
nothing else changed, because a dock is a hub with a platform bolted to it and
the platform is the plate. That makes it the heaviest machine substance except
`cyclops_maw`, which is the honest statement of what the top of the chain
costs — the whole ascent is 3 hubs plus this against a 40 T cap, so more than
one trip, by design.

**The plate rather than gravel is also an ordering decision.** A bill with
gravel in it would strictly contain `gear`'s {2 log, 1 gravel}, and `gear` is
declared before `hub`, so the row would have had to jump ahead of the whole
segment-transport block. With no gravel the only containment is `hub`'s own
bill, so `cloud_dock` is declared immediately before `hub` and nothing else
moves.

## The mirrored pair is ONE substance

Two substances would mean two hand-recipes with a BIT-IDENTICAL bill, which
`rules/crafting.js#choose`'s first-match rule would starve one of forever, with
no float-management workaround — unlike `daedalan`/`auger`, whose log counts
differ. The id is `belt_r`, the base row's own.

## `auger`'s `power: 1.8` is the T2 equality proof

`rules/machines.js`'s Talos Head reads it back generically, scanning every
substance's `item.tool` block for the largest `power` with no id named, rather
than carrying a hand-copied literal. So "mines at exactly the T2 hand rate" is
true by construction rather than by two authors remembering to agree. 1.8 also
bites `tile.tier:2` granite that a `power:1.0` pick's tier 1 cannot reach at
all.

## Two art recoveries, and one addition

**The relic halo is a recovery.** The flat prototype's `drawPickup()` gave a
relic on the ground a `glow()` halo in warm gold, and it was dropped unported
when the old source was deleted — while every piece of machinery needed to have
it back (`look.treatments`, `TREAT.halo`, `core/pixels.js#glow`) survived
intact and in use.

It is a RULE rather than a one-off: `bellows`/`auger`/`chasm` carry the
identical `treatments:[{fn:'halo'}]` shape, and the content lint enforces that
every `relic`- or `miracle`-tagged substance has one and no `machine`-tagged
substance does — so a future trinket fails the build the moment someone forgets
it, rather than silently reading as ordinary loot forever.

`sprite:'pick'` replaces the generic two-colour square with an angled
haft-and-head shape and its own slow bob, ported freehand from the same
`drawPickup()`. `paintItem` runs `treat()` after either path, so the sprite and
the halo are independent additions rather than alternatives.

**The turf cap is a recovery too.** Three greens rather than one, and a whole
tile rather than two pixels: a full band of `grassA` over a lower edge of
`grassB` with a `noiseFill` speckle of `grassC` across both. `drape` is the
part that is new rather than recovered — turf spilling a few pixels down an
exposed vertical face, so relief reads as banks of earth instead of a stack of
cut cubes.

**Soil's `hi` is a plain soil tone rather than green for a specific reason.**
`paintTile`'s generic "exposed face" highlight fires for ANY open neighbour,
tunnels included, and painting it green was grass appearing on cave ceilings.
The turf cap is drawn only where `skyExposedAt` says the tile has an open shot
straight up.
