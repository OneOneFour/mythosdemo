# The widget layer's rejected alternatives and measurements

Salvaged from `src/view/ui/*.js` when their header essays were cut. Every
number here was measured against the 200x180 base-buffer floor
(`core/canvas.js#resize`), which is reachable on desktop near a 400x360 window.

## `slot.js#frameSlot` — why the highlight is two concentric borders

One 1-px line was too quiet once slot selection became the primary surface for
placing, mining-vs-placing disambiguation, feeding and miracle use at once. At
roughly one third of window resolution a single pixel of `uiGood` against a
substance swatch reads as an edge, not as a choice. Two rejected alternatives:

- **colour only** — one more green barely reads as "stronger" against the
  swatch palette.
- **a background tint under the swatch** — fights the swatch colour it sits
  behind, and the swatch is the thing being identified.

The double frame costs eight `R()` calls, no new parameter and no new
primitive, and all three call sites take it unconditionally.

## `mainPanel.js` — why the stats block scrolls instead of getting a tab

Four stat rows: the desktop buffer drew one and the rest clipped at
`body.bottom`. A fourth tab was the alternative and does not fit — three tabs
already cost 171 px of the floor's 188, and `tabs.js` DROPS a tab it cannot
fit, so the feature would have been absent at the floor with nothing on screen
to say so. Scrolling reuses `drawn.grids`, which is already what a wheel notch
is hit-tested against.

AUTO COLLECT and AUTO FEED share one row because stacking them cost 11 px and
this tab has no spare 11 px — a second row pushed the last surviving stat line
off the panel. The stacked fallback is not dead code: a longer label or a
narrower floor makes it right.

## `quickbar.js#inHand` — why a line of text and not a cursor icon

A mouse-following cursor icon was the rejected alternative. This game's
placement already answers "where" with the aim reticle and the build ghost, so
the icon would have restated position while the open question was *what* is
armed. The line is transient on purpose: `ui.armedPlace` is null most of the
time, and a permanent fixture reading "IN HAND --" would spend eight pixels of
the most contested HUD row on saying nothing.

## `menu.js` — the one-pixel label wrap

The longest shipped trial name measures 185 px against the 184 px the floor
affords. Wrapping is not defensive; without it that label painted outside the
frame.

## `ruler.js` — why the bar is 6 px and the numerals sit beside it

An 8 px bar could not fit 'III' inside it and the numerals clipped off the
right edge of the canvas on the first render. `rulerWidth()` measures the bar
plus the widest numeral in the world, so a fourth band costs no edit — and
`view/hud.js#hudRuler` runs after `drawQuickbar` so it can read the quickbar's
real rect, which is why `quickbar.js#inHand` reserves the ruler's column from
`rulerWidth()` rather than from `drawn`.

## `tooltip.js` — why the caller supplies a line's colour

Every body line draws in `uiInk2`. The one line in the game that draws on the
state tone instead is `mainPanel.js#recipeTooltip`'s "UNKNOWN -- NOT YET
STOLEN". Teaching the primitive to recognise that string would put a name check
in a generic widget — the same mistake a second paint pipeline beside
`look:{}` would be — so the caller hands over a colour on the line, the way
`bar.js` is handed `fillColour` rather than learning what "burden" means.

See also [[scene-overlays]], [[treatments-art]], [[interaction-model-brief]].

## `core/font.js` — why the font is vendored bytes rather than a text library

`fillText` is out because an antialiased system font inside a nearest-neighbour
upscale reads as a different resolution. A text-shaping or bitmap-font library
does not fix that: it generally rasterises the same way `fillText` does. So the
shape is "vendor a bitmap font and blit it ourselves" — `vendor/font5x7.js`
carries the bytes and the licence, `core/font.js` decodes them once at import.
Upstream's 8th row is the descender row `,gpqy` use; it is dropped rather than
adopted so the existing 7-row cell and every caller's line pitch are unchanged.

`wrap()` lives beside `textWidth()` rather than in a caller because `textWidth`
is the only authority on how wide a string is, and a wrapper that estimated
would drift from it. A word wider than the budget overhangs rather than being
cut: a cut word reads as a rendering fault, a long one reads as a long word.

`textWidth` deliberately ignores `drawText`'s 1 px shadow offset. Widening it
would move every anchored panel that shadows any of its text, since the layout
pass measures shadowed and unshadowed strings through the same function.

Shadowed text is for sites drawn straight onto rendered world with nothing
behind them. A site inside a panel takes no shadow, and one beside an
already-backed site takes a backing rect instead.

## Salvaged from the `src/view/` comment pass — art attempts and measurements

Rejected shapes, all arrived at by looking rather than reasoning. Each is a
thing already tried and discarded, so it does not need trying again.

- **`treatments.js#gearWheel` teeth.** `rt = d/2 + 2` made every gear read as
  an orange sunburst: at 8 px to the tile a two-pixel spike is a quarter of the
  wheel, and eight of them swamp the disc. `rt = d/2` puts the 2x2 tooth
  astride the rim, protruding about a pixel — enough that two wheels one tile
  apart abut, which is all the meshing argument needed. Teeth in the highlight
  tone merged into the lit rim and the gear read as a blob, so a tooth takes
  the body tone. Spokes drawn in the boss tone read as a painted star; in the
  outline tone they read as slots cut through the wheel.
- **`treatments.js#disc`/`wheel` outline.** Shaded symmetrically, an 11 px
  wheel in an unlit shaft was a grey amoeba — the lit arc ran into the teeth,
  the shaded arc into the background. The 1 px dark ring is what says where the
  wheel ends, and it is also what makes a tooth read as a tooth.
- **`treatments.js#crankArm`.** A 1 px arm with a 2x2 knob read as a stray
  scratch over the post. `thick:2` is the whole difference between a scratch
  and a handle. A handle pointing dead right at phase 0 reads as a lever or a
  flag, hence `a0`.
- **`CANOPY_BLOBS` is five.** Three blobs leave visible lobes, seven average
  out into a circle. A flat rectangle reads as a rectangle and the mockup's 26
  polar-scattered dots read as fuzz at this viewport.
- **`paint.js` bucket chain.** Strands separated by two pixels with background
  between them: in an unlit shaft the shaded strand vanished into the rock and
  the lit one read as a taut white thread. Adjacent, they are one two-pixel
  cable with a lit and a shaded edge. Bucket shapes 3x2 and
  5x4-with-a-bright-top-row both read as RUNGS — a horizontal bar beside a
  vertical line is a rung whatever its colour. 4 wide, 5 tall, open at the top,
  on a one-pixel link (a 3 px link is itself a little bar).
- **`paint.js#paintCarriers`.** A 10x4 plank — the model's stand box exactly —
  read as a splinter with no room for cargo. The deck line stays on the box's
  top edge and the body hangs below it, which costs collision nothing.
- **`scene.js` clouds.** The old three-rect puff read as a stack of bricks: it
  had neither a flat base nor a domed top. A rectangle lump on a slab reads as
  a step.

Text tones and contrast, measured:

- **`ui/bar.js` value text is `uiInk2`, not `uiDim`.** A bar's value is the
  highest-traffic de-emphasised text in the game — BURDEN, every TRIBUTE demand
  row, the tribute aggregate and every FAVOUR row — and three of those four
  draw against the live world with no panel. It encodes no state, so it has no
  business on the state tone. `uiInk2` on lit sky with no backing measures
  1.73:1, and 12.33:1 with a shadow under it, which is why `shadow` is the
  caller's decision rather than the primitive's. `DIM` stays bound in that file
  only because `TRACK` derives from it.
- **`ui/tooltip.js` takes no shadow.** The 0.92-alpha `BACK` fill behind every
  line is already the backing a shadow would substitute for.
- **`hud.js#favour` bar width.** A bar narrower than its label pushed the
  number against the label's tail and read as an exponent ("HEPHAESTUS" is
  59 px against a 24 px bar).

Two bugs the comments recorded, kept so the fix is not undone:

- **`fx.js` toasts were a single slot**, and the newest fact won. The furnace
  and the dock are awarded in the same substep, so `CRUDE FURNACE IS GRANTED`
  was overwritten inside its own frame. Three held, drained from the front, and
  the front row cut to `TOAST_HANDOFF` the moment anything waits. The banner
  keeps its single slot: two cannot land in one frame, and two in a row would
  hold the screen's centre for five seconds.
- **`hud.js#depth` measured `player.y`**, the top of the 16 px body, and read
  `+2M` standing on the spawn floor. It measures the feet.
