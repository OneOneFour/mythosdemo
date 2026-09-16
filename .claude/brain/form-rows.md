# The form table's derivations

Salvaged from `src/data/forms.js` when its per-row essays were cut. The file
keeps the field key and the constraint each row enforces; this holds the
arithmetic and the history behind the numbers.

## Why `gravel` and `log` lost their `tile` block

Both were simultaneously feedstock and buildable, which is the double duty
CLAUDE.md D12 forbids.

`gravel` carried `tile:{ solid:true, climb:false, hardK:0.5 }` while also being
consumed by `brazier` (2), `crank` (3), `gear` (1) and `belt_r` (4), and being
the currency of the salt tribute's 8 granite/gravel demand. Mined rubble
shovelled 1:1 straight back into the hole it came out of, softer than any of
the four native rocks it drops from. While that was true, mined material WAS
the placeable unit, so nothing ever had to make it a prerequisite. The way back
to solid ground is now `recipes.js#pack` — 5 rubble of one bulk element to 1
`block`, at native hardness rather than half, so backfill costs five tiles'
worth per tile.

`log` carried `tile:{ solid:false, climb:true, hardK:0.30 }` while being
`tags:['fuel']` and a bare ingredient in five recipes. `recipes.js#peg_rungs`
already existed and is now the only route to a placeable timber ladder.

Only a PLACED form has ever climbed. `rules/generate.js#trees` writes trunks as
NATIVE, and a NATIVE byte reads the SUBSTANCE's `tile` block, which carries no
`climb` key.

## The massK numbers, and what fixed each

Every one of these is bounded by `tools/content.mjs`'s mass-conservation check.

| form | massK | why that number |
|---|---|---|
| `brand` | 0.3 | `kindle` turns ONE log into THREE brands. At an earlier draft's 0.5, three brands netted 1.5 against the log's 1.0 — the check caught it. 0.3 keeps 3 brands at 0.9, under 1.0. |
| `rung` | 0.3 | `peg_rungs` is 2 logs to 4 rungs, so 4 × 0.35 = 1.4 already cleared 2 logs' 1.6. 0.3 was kept anyway to match `brand`, since a peg is the same split-lighter-with-waste shape. |
| `stair` | 3.0 | `daedalan` is 2 plate + 4 log to 2 stairs, which allows up to 4.0 before violating conservation (8.0 in, 2 out). 3.0 leaves headroom for waste — some timber is scaffolding, not structure. |
| `block` | 2.0 | Twice the element's base mass, because a block is compacted where rubble is loose at 0.5. The largest round value clearing the check with waste both ways: soil 5×0.5×0.5=1.25 in against 1×0.5×2.0=1.00 out; stone 1.50 against 1.20. The ceiling is 2.5. |
| `plate` | 2.4 | Denser than ingot's 1.6, because a plate is the more compact good. |
| `rig` | 1.0 | So a machine substance's own `item.mass` IS the carried mass, with no second multiplier. Unlike `ingot`/`plate`, a `rig` substance's mass already IS the machine. |
| `seed` | 0.1 | The lightest thing in the game, and conservation is not engaged at all: NO RECIPE PRODUCES A SEED, so there is nothing to conserve against. A tree yielding one 0.035 T seed and 3-5 logs is not creating mass. |

## The hardK numbers

`rung` is 0.20, softer than the placed log's old 0.30, because a single peg is
the flimsiest climbable in the game on purpose. `stair` has no override, so a
bronze stair recovers at plain copper hardness — the other half of "tier 2
costs more and is worth it". `block` is 1.0, native hardness, so filling a hole
is a real decision. `seed` is 0.05, about 0.0175 s, near-instant, so a
misplaced seed costs nothing to recover: `dropOf` returns the pair itself for
any placed form, so digging a seedling up gives the seed back with no code, and
`rules/growth.js`'s own "is the seed still there" check drops the accumulated
time with it.

## `seed`, and the three reasons it is `solid:false, climb:false, tags:[]`

You walk straight through a seedling. A seed that blocked movement would be a
trap you planted for yourself, and one that could be climbed would be a free
ladder rung at a tenth of a rung's mass. No tag membership keeps it out of the
furnace's own fuel selector, which is what stops a tile-capable form from also
being feedstock.

`subTags:['organic']` means `timber/seed` is the real pair and there is no
`acorn` substance row — spending a tile-capable substance ordinal on a seedling
would be the worst trade available.

## `subTags` as a possibility gate rather than a permission

`block`'s `subTags:['bulk']` is the whole of "a deposit is never
player-placeable". `crossable(granite, block)` is FALSE, so `granite/block`
cannot be constructed, let alone placed. A possibility that cannot be expressed
beats a permission someone can forget to check, which is the same reason
`phial` is kept separate from `relic` — folding a miracle into `relic` would
let it satisfy any trinket selector reading `#relic`. `rules/placement.js`
needed no edit at all.

## The `look` blocks on `rung` and `stair`

A form `look` makes the FORM draw itself: `view/paint.js#paintTile` skips every
generic cube pass for any tile whose form declares one.

`rung` is 1 px rails inset one pixel from each edge in `woodC`, with a `woodA`
rung every third BAND ROW — never every third row of the tile. `woodD` goes
unused at `tread:1` and is named anyway, so the row need not change shape if a
deeper peg is ever wanted.

`stair` is the same treatment function with three numbers changed: rails on the
tile's own edges rather than inset, a tread 2 px deep every FOURTH band row,
and copper rather than timber. So the two tiers read apart at a glance —
brighter, wider-pitched, heavier-railed.

**A known limitation.** The stair's tones are copper's, not the substance's,
because a form `look` cannot see which substance it was crossed with. A
hypothetical `tin/stair` would draw in copper. It is unreachable today, since
`daedalan` is the only source and it produces `copper/stair`, and threading a
substance's resolved and depth-blended palette into a form treatment is a wider
change.

## The tile-id byte, and why the guard was narrowed

A tile stores one byte. `0` is AIR, `255` is BEDROCK, and everything else is
`1 + subOrd * STRIDE + (formOrd + 1)`. The stride is `FORM.length + 1`, so a
byte holds 17 substances' worth of ordinals.

The guard used to price EVERY row as if it were tile-capable, which at 19
substances read 228 of 255 and refused the third new row — while real usage was
`1 + 8 * 12 + 11 = 108`, because the highest packable ordinal is `adamant` at 8
and twelve of the nineteen rows can never be packed at all. That was a cost
nothing was paying.

A substance is packable iff it is native terrain OR some tile-capable form is a
legal crossing for it. The narrowing rests on one fact the file cannot check
itself — that a crossable-with-a-tile-form substance really is terrain — so
`tools/content.mjs` enforces it, and a substance with no `tile` block placed as
terrain would in any case be a wall of `Infinity` hardness, unmineable forever.

**Three things reach `packTile`,** and only two are constrained by their
caller. A NATIVE tile comes from worldgen. A PLACED tile comes from a held pair
whose FORM carries a `tile` block, and `placeTile` refuses anything else. A
TRANSMUTED tile comes from `rules/miracles.js` rewriting an already-solid tile,
and it passes through NEITHER gate, because the substance comes off a
`data/miracles.js` row — so the content lint requires that substance to be
packable and to exist. A non-packable ordinal would overflow 255 and WRAP into
an unrelated pair, and a missing one packs to NaN, which a Uint8Array stores as
AIR.
