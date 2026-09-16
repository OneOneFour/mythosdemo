# The paint layer's measured budgets

Salvaged from `src/view/paint.js` when its budget derivations were cut to the
contract each one states. The numbers below are measurements, not taste, and
anyone changing a budget should re-measure rather than re-argue.

## `REPAINT_BUDGET` is 8, and why 5 is worse

A first paint is never budgeted, because a chunk with no canvas has nothing
stale to show. A re-paint is, so walking a long tunnel while digging cannot
stack forty bakes into one frame.

The decoration margin changed both sides of the trade at once: a tile write now
makes up to nine chunks stale instead of one to three, so the budget is
genuinely REACHED where it used to be approached, and a chunk repaint got
dearer. Cold-baking the 23 chunks a 640x400 viewport holds, where a frame with
nothing stale is 0.2 ms either way:

| | total | per chunk |
|---|---|---|
| before the margin (`0da2a06`) | 23.5 ms | 1.02 ms |
| after | 35.3 ms | 1.53 ms |

So the worst case is 8 × 1.53 = 12.2 ms, in the one frame a tile breaks,
roughly twice a second while digging. That is inside a 16.7 ms frame, and the
simulation is a fixed 1/120 s step that does not care what the draw costs.

**Five was tried and is worse.** It caps the spike at 7.6 ms, but the chunk
being dug is mid-raster-order among the nine, so it loses its turn and the
shaft visibly lags several tiles behind the pick. Caught by `digging.png`,
whose diff was exactly the shaft column and nothing else. A skipped chunk shows
its own previous canvas rather than a blank one, and paying that on the tile
you are looking at is the wrong place.

## `CHUNK_BUDGET` is 24 MB, bounded from both sides

A BYTE budget rather than a chunk count, because a band declares its own
`chunk` and its own `tile`, so two bands need not agree on how many pixels a
chunk canvas is. A canvas costs `px * px * 4` bytes, so a 16×16-tile chunk at
`tile:8` is 128×128 px = 64 KB, and the budget holds 384 of them.

**From below.** The largest base buffer `core/canvas.js#resize` produces is
about 1000×500, a 4K display at its scale-5 step, which covers 45 chunks across
the two or three bands a frame can straddle. So the budget is eight times the
most any one frame can ask for, and a player has to leave eight screens of
terrain behind before walking back costs a re-bake.

**From above.** The whole world is 216 chunks (13.5 MB) at 128 tiles wide and
1,728 (108 MB) at 1,024, both counted off `b.cx * b.cy`. So 24 MB is the
smallest round budget that bounds the wide world while evicting nothing at all
in the narrow one.

It is mutable and on an object because the visual suite lowers it to force the
ceiling — at 128 tiles the whole world fits inside it and eviction can never be
reached by playing.

## The chunk cache key, and the ceiling it removed

The key interleaves BAND ORDINAL with CHUNK INDEX, multiplied by the BAND COUNT
rather than a fixed slot size. The old key was
`b.ord * 0x10000 + cy * b.cx + cx`, which gave each band 65,536 chunk slots and
ran out at a band about 52,400 tiles wide, past which band N's keys collide
with band N+1's and blit the wrong terrain. Interleaved the other way round
there is no ceiling short of `MAX_SAFE_INTEGER / bands.length`. At 1,024 tiles
topsoil is 64 × 20 = 1,280 chunks, which reaches neither, so this was a latent
ceiling removed rather than a bug fixed.

`bands.length` is fixed for the life of a run and `resetChunks` clears the
cache when it changes, so no two keys in one cache were built from different
multipliers.

## Eviction is LRU by frame touched

**Why LRU and not distance from the camera.** This file is never told where the
camera is, and `view/scene.js#drawChunks` already asks for exactly the chunks
the viewport covers — so "touched on the last frame" IS "on screen", derived
from the draw that happened rather than from a second copy of the camera's
window arithmetic.

**Nothing drawn on the last frame is evicted.** Eviction runs from
`beginFrame`, before any of this frame's `chunkCanvas` calls, so the newest
entries are the previous frame's, which are the ones about to be asked for
again. A budget smaller than one viewport therefore OVERSHOOTS rather than
thrashing: you cannot evict what you must draw, and re-baking the visible world
every frame would be worse than holding no cache at all.

## Why the version check sums nine chunks

`model/tiles.js#write.touch` bumps the written tile's chunk and, on a seam, the
one chunk over the seam from it — sized for the 1-2 px of edge shading a
neighbouring tile contributes. A decoration reaching `DECO_MARGIN` tiles means
a chunk's pixels also depend on tiles that far outside it, and `view` may not
extend `touch` because it may not write to `model` at all. So the dependency is
expressed on the READ side: sum the versions of this chunk and all eight
neighbours. Versions only increase, so a sum is strictly increasing and two
neighbourhoods cannot collide on one number.

The cost is one tile write invalidating up to nine chunks. **The margin SCAN
itself is nearly free by comparison:** forcing `DECO_MARGIN` to 0 takes a cold
bake of the visible viewport from 35.3 ms to 33.1 ms, about 0.1 ms of the
1.5 ms a chunk costs. It is the extra invalidation, not the extra reading, that
has to be paid for.

## The look cache's depth quantisation

Resolving five colour names per tile per repaint is the one place a name lookup
would show up, so each substance's palette is resolved once — and once per
DEPTH STEP, because the same granite has to read deeper at row 260 than at row
180 or the deep bands are the shallow ones in a different palette.

The curve is quantised into `DEPTH_STEPS` bands for two reasons: the palette is
meant to be a palette rather than a per-row gradient, and a cache keyed on a
continuous depth would hold one entry per tile row. Twelve steps over the whole
world is about one shade per 280 px, which at this tile size is a shift you
notice over a shaft and not over a tile.

## The grain ratio

`look.speckle` is the FRACTION of a tile's pixels that get a grain dot. This
used to be a fixed pair of thresholds on a per-pixel `hash2` — 16% toward the
dark tone, 10% toward the light — identical for soil and for adamant, which is
a large part of why every stratum read as the same texture in a different
colour.

Two passes rather than one array of two colours, because the ratio matters:
dark grain reads as pitting and light grain as a facet catching the light, and
an even mix looks like static. 62/38 is the ratio the old 16/10 thresholds had.

`core/pixels.js#noiseFill` was ported from the mockup and called by nothing at
all until this. Its seed is positional and never `rand()`, both because a
repaint may not advance the generator and because the same tile has to speckle
identically when a neighbouring chunk redraws it.

## Why a placed ladder suppresses every cube pass

Terrain painting is substance-driven and form-blind, which is why a placed
ladder used to be pixel-identical to a native trunk minus its canopy:
`rung.tile.solid` is false, so an open shaft gave it a lit top face, a jittered
cliff face on both sides and a bottom shade line, and it read as an edge-lit
wooden cube floating in the void.

So a form-level `look` suppresses ALL the generic passes — base fill, grain and
the substance's own treatments — rather than drawing the sprite over them. The
ladder sprite is two rails and a rung with the tile empty between them, and it
can only read that way over the space the tile actually occupies. Copper's
`glint` speckles are suppressed for the same reason: they belong on a vein
face, not floating in a stairwell. What goes behind it is whatever the space
would otherwise have been, so a ladder under rock keeps its neighbours' floor
lip and ceiling fringe, and one climbing into open sky does not carry a black
square with it.
