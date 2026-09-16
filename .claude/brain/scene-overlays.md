# The scene composer's overlay decisions

Salvaged from `src/view/scene.js` when its per-pass essays were cut.

## Why the live-tile cues are ONE pass

`drawDepletion` and the growth cue are the same shape of work: walk the visible
tile window of every visible band, ask a sparse `model` Map about one tile, and
paint an integer-pixel cue over what the chunk canvas already baked. As two
functions they would walk that window twice per frame for one answer each, and
the second one added would silently double the cost of the first for no pixels.
So it is one loop with two guarded cases, and a third live per-tile cue joins
it there rather than beside it.

**The two cases are mutually exclusive by construction** and the loop relies on
it: depletion only ever fires on a NATIVE `deposit` tile, growth only ever on a
PLACED `tile.roots` form. A tile cannot be both, so the ordering between them
is arbitrary rather than a constraint.

## Both cues are overlays and not chunk bakes

A chunk canvas caches the STATIC ROCK TEXTURE; depletion and growth stage are
LIVE conditions. `model/mining.js#write.add` and `model/growth.js#write.add`
bump the epoch and never a chunk version, so a cue painted in `paintTile` would
only ever be as fresh as the last time something ELSE in that chunk happened to
invalidate it — it would show what was true several swings ago, which is worse
than showing nothing. That is not a hypothesis: it is what the crack marks in
the bake do today.

The rejected alternative for growth was calling `write.touch` at each of the
three stage changes so the sprite could bake — legal, and cheap in the abstract
at three repaints per seed over 180 s against a budget of 8 per frame. It was
rejected because a chunk repaint triggered by something that is not a tile-byte
change is exactly the coupling the band record's own notes on `seen` and
`light` argue against.

## Depletion needs TWO cues, because one always reads badly somewhere

A pale wash alone is nearly invisible on granite, already a light grey, and a
dark notch alone is nearly invisible on adamant, already near-black. So a spent
tile gets both: the wash carries the read on the dark rows, the notches on the
light ones, and on copper — warm mid-tone with a bright glint — both land. No
substance name is involved; the cue is keyed on `charge`, so any future deposit
row gets it for free.

The wash also mutes every `glint` pip in the tile at once, which is the
requirement. Reproducing the glint's own pip coordinates to over-paint them one
by one was the first design and was rejected as a second copy of a positional
formula that would drift the first time either changed.

**Quantised per unit, not continuous:** `spent / charge`, so the wash steps
visibly the instant a unit falls out and holds still while the next is worked.
The fractional remainder is deliberately not drawn here at all — that is the
crack's job in the bake.

**Units already out of the ground are FLOORED WITH NO EPSILON,** so the cue can
never claim a unit the rule has not dropped, and it errs low. Capped one short
of `charge`, because the last unit IS the break and a tile at full charge no
longer exists — without the cap the single frame between "work reached total"
and "the rule cleared the tile" would flash a fully spent tile.

## The seedling is THREE discrete silhouettes

Seed, shoot, sapling. At 8 px a tile there are about six usable rows, so a
continuous height would spend most of 180 seconds not visibly changing and then
change by one pixel. A player needs to glance at a seedling and say which third
it is in; three states do that and a ramp does not.

**It draws over what the bake already put there, deliberately.** A
`timber/seed` tile carries no form `look`, so `paintTile` paints it as an 8×8
timber cube. The overlay cannot erase that — there is no record of what was
behind it — and does not need to: at this scale a small dark-brown block reads
as turned earth, which is the correct thing to be growing out of. The sprite
uses the CANOPY's own greens, so a seedling reads as the same plant the crown
belongs to.

**Strictly inside its own tile.** A sapling poking a row into the air above
would read slightly better and is not worth what it costs: the pixel-scope
assertion in the visual suite is what proves this pass does anything at all,
and a cue that bleeds into a neighbour makes that assertion either weaker or a
second copy of this geometry.

Unlike the depletion notches it needs no positional hash: a seedling's shape is
a function of its stage alone, so two at the same stage are identical, which is
what a row of planted seeds should look like.

## The sky is quantised, not interpolated

This was one `createLinearGradient`, a smooth 24-bit ramp in a game whose every
other pixel comes off a named palette. It is now a fixed number of discrete
bands, so the sky is a stack of tones you could name — and it gains the two
things a two-stop ramp cannot express: a DEEPER ZENITH, because the top of the
sky is further from the sun than the horizon, and a PALE HAZE where it meets
the ground.

The haze is anchored in PIXELS above the horizon rather than as a fraction of
the sky, because what it sits behind is the terrain silhouette — the surface
band's relief puts hilltops well above `floorTy`, so the haze has to reach past
them or it only shows in the valleys.

The ramp is built once per BAND rather than per frame, since it depends on
nothing but two colour names and the sky height, all constant for a run.

**The sky reaches the SKYLINE, not the horizon.** Relief may put a valley floor
`dip` rows below the ground line and the air over it is sky-exposed, so the
backdrop there has to be sky rather than void. One rect, not one per column: the
rows below the horizon are a single tone, so run-length encoding a per-column
skyline would trade one rect for one per run and save only fill area that
opaque rock covers anyway.

## Three cloud layers, and everything varies together

A single layer of same-sized puffs at one parallax factor is a texture; depth
needs size, speed, parallax and opacity to agree. Large slow cumulus far back,
hazy and barely moving; a middle band; small fast wisps near the ground, opaque
and sliding past.

`par` is how much of the camera's HORIZONTAL motion the layer does not take: 1
pins a cloud to the screen, 0 pins it to the world. **Horizontal only, and
deliberately so** — walking is where parallax is legible, while the camera's
vertical motion is falling and climbing, and a cloud lagging DOWNWARD out of
its band's sky region would either pop out at the edge or draw over the band
above's rock. Clouds are world-anchored in y.

The drift is `f.t` and never `rand()`, and every shape parameter comes from a
per-cloud positional hash, so a cloud keeps its silhouette as it crosses the sky
instead of reshuffling every frame.

A stepped half-ellipse is drawn one integer row at a time — no `arc`, no fill
path, because a canvas curve would antialias its own edge.

## Darkness and fog are two facts, one pass each

`drawFog` hides a tile NEVER seen, regardless of what is there — memory,
permanent and one-way. `drawDarkness` renders how lit a tile is RIGHT NOW for
tiles that already passed the fog test, so a torch burning out darkens a
remembered room without erasing the memory of it.

Darkness runs after everything it should darken and BEFORE fog, which is the
one pass allowed to win outright. Quantised to three fixed alpha steps: a torch
is a prerequisite for reading detail, not a mood dial. `DARK_ALPHA[0]` is
deliberately close to opaque, so that both "a seen tile reads as
remembered-but-dark rather than as fog" and "an ore vein is indistinguishable
from rock below light ~4" are true at once — 6% of a distinct base colour still
reads as differing from flat fog while looking like plain dark rock.

**Darkness is NOT additive.** The machine-fire glow paints with `'lighter'` and
is gated on `seenAt`, because additive light would shine straight through an
opaque fog rect painted under it. This pass subtracts brightness with ordinary
alpha compositing, runs entirely before fog, and touches only tiles `seenAt`
allows, so there is no matching way for it to leak information.

Both are ROW-RUN COALESCED, and both walk one sentinel column past the visible
edge so a run still open at the screen edge flushes without a second copy of
the flush logic.

## The depth tint is world-anchored

A world row's alpha is a function of that row's place in the band stack and
nothing else, so the same rock reads the same whatever the camera is doing.

A single frame-wide alpha read off the camera centre used to step the whole
screen from 0.055 to 0.440 the frame the centre crossed world-Y 768, and an
area-weighted mean over the visible bands fixed the step but dimmed surface sky
in proportion to how much topsoil happened to be in frame under it.

Each band's interior takes its own `look.ambient` exactly, and adjacent bands
ramp into each other over `TINT_SPAN` world pixels centred on the shared seam,
half painted by each side, which keeps a seam from reading as a drawn line.

**32 world px is 4 tiles at every shipped band's `tile:8`.** The widest ambient
gap is surface's 0.95 against topsoil's 0.6, which is 0.385 of alpha; over 32
rows that is 3 units of 255 per row against the near-black void, under the ~5
units where a 1 px row starts to read as an edge. A rendering constant with no
gameplay meaning, so not a tuning row — there is no god whose gift should widen
a gradient.

## `drawBandLabel` has no caller

It is exported and nothing in `src/`, `tools/` or `tests/` invokes it, so the
band name is not on screen today and its recolour is latent. Wiring it back
into the draw order is a HUD-layout decision about which anchor it hangs from.
