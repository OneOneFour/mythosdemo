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
