# Why the map overview is width-fit, depth-scrolled and integer-zoomed

Salvaged from `src/view/overview.js`'s 83-line file header when it was cut to a
statement of the mode's invariant. The file keeps the invariant and the two
non-obvious mechanics; this holds the decision history.

## It was a vertical strip, and the fix was the other axis

The overview started as a 37-line `drawMap` inside `view/scene.js`. It derived
`scale = min(1/minTile, W/worldW, H/worldH)` over the union of every band. The
world is 1024 px wide and 3328 px tall, so `H/worldH` won at every realistic
window size and the whole world collapsed to fit the viewport HEIGHT — about
111 px of map inside a 640 px canvas, a small vertical strip in a black field.
Measured by arithmetic rather than by eyeballing a screenshot.

The default scale now fits the world's WIDTH and the vertical axis scrolls,
because no one scale shows a world of this aspect whole and is also legible.

## Zoom is an integer number of screen pixels per tile

Fractional scale is forbidden outright — everything renders at integer pixels
and is upscaled nearest-neighbour by CSS. So zoom is an integer count, never a
continuous factor, and a tile's map cell is always a whole number of pixels
wide. The default is the largest level whose world still fits the viewport
width, derived from the band union, so widening `astral` from `tw:96` to the
full width needs no edit in that file.

## One screen pixel per tile is a FLOOR, not a fallback

At 1,024 tiles wide the map shows all of the depth and a WINDOW of the width,
and the smallest zoom level stops being a fallback and becomes the projection.
Three reasons, in the order they bind:

1. **A level below one pixel per tile is a resampling,** and the mode's
   invariant forbids one. A pixel covering four tiles has to pick: drop the
   tiles it cannot show, and a one-tile shaft the player dug disappears from
   the map of their own work; or take a block's colour from a sample, and a
   sample may be a tile they have never seen.
2. **Cost.** A full-world pixel map at 1,024 tiles reads about 426,000 tiles
   per frame, eight times what the viewport cull was written to avoid.
3. **The axis.** Depth is the axis this game is about, and at that floor it is
   the axis very nearly all of which is on screen — 387 of 416 rows, against
   609 of 1,024 columns.

So the width gets an affordance rather than a scale: `extentRibbon`, the
horizontal twin of the band ruler on the right edge.

## Why it reads the tile grid rather than downscaling baked chunk canvases

Downscaling the chunk bake was the stated goal, and the answer is no. The
reason is not performance.

1. **The chunk bake is fog-blind.** `view/paint.js#paintChunk` paints a tile's
   true material regardless of `seenAt`, because fog is a separate live overlay
   pass and not baked into the bitmap. Downscaling a baked chunk would draw
   every unseen tile in it, which is the one thing this mode may not do. That
   is also a hazard for any later consumer of chunk canvases — a minimap
   thumbnail would have to gate on `seenAt` itself.
2. **`chunkCanvas` paints on any call.** Asking for a chunk the player has
   never visited does not return null, it BAKES it — so an overview reaching
   for the whole world would cold-bake all 216 chunks at roughly 1.5 ms each
   and hold every one in the cache afterward.

The per-tile path got CHEAPER rather than dearer in the process, which is what
makes the answer comfortable. `drawMap` read every tile of every band every
frame, about 52,000. The current pass culls to the visible world-y range first
and coalesces each row into runs of one colour, so a scrolled-in view of the
surface touches a few thousand tiles.

## The byte-keyed memo, and why it earns its keep

`tileLook` resolves three answers per packed tile byte — the terrain colour or
null, whether the substance is ore, and the ore layer's mark colour. Keyed on
the byte, of which there are 256, so it is a complete memo rather than a cache
with a policy, and it replaces a `rowAt` plus a `tags.includes` plus a guarded
`colour()` lookup per tile with one array index. Never invalidated, because
every input is a frozen `data/` row.

This is the pass that gets dearer with width: at one screen pixel per tile the
window is the viewport in tiles, 128 columns today and 609 at 1,024 wide, and
the ore layer alone was 1.5 ms of a 3.9 ms map frame before the table.

## The clamp is exposed on purpose

`mapClamp` is the same `fit` over the same `unionBox` the transform uses — one
implementation, two callers, which is why `shell` is not allowed its own copy.
`shell/input.js` needs it because `ui.map.x/y` is stored UNCLAMPED: a player
holding the pan key at the bottom of the world parks the stored offset
thousands of pixels past the edge and then has to press the other way as many
times before the view moves. A pan therefore seeds from the clamped position
and adds its delta to that.

## Two orders, on purpose

The order the metadata layers DRAW in is fixed in the file; the order they are
LISTED in, for the legend and for which digit toggles which, is
`ui.map.layers`' own key order. Shading has to go under the markers it shades,
but a legend wants a stable list a player can learn.
