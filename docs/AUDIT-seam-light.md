# Audit — the II→III seam lights a row that nothing reaches

User-reported: "when we approach II -> III boundary suddenly things start
glitching, the interface shows up with full visibility out of nowhere and also
the player can start glitching around."

`II` is `surface` and `III` is `topsoil` (`view/ui/ruler.js#roman` over
`data/world.js#BANDS`), so the seam is **world-Y 768**. The reported depth of
35 M puts the player on it.

## 1. What is actually wrong

**One defect class, three sites: a band-local query standing in for a
world-space fact.** `CLAUDE.md` invariant 2 and `ARCHITECTURE.md` §6 both say a
band ordinal is never assumed to be zero, and these three sites assume a band's
own row 0 is open sky.

### 1.1 `rules/light.js:165-169` seeds every band's row 0 as daylight

```js
for (let tx = 0; tx < b.tw; tx++)
  for (let ty = 0; ty < b.th; ty++) {
    seed(tx, ty, max);
    if (solidAt(b, tx, ty)) break;
  }
```

`topsoil` has `origin.y:768` and stone from row 0 (`data/world.js:146-155`), so
its row 0 is the first solid tile and is seeded at `eff('lightMax')` = 15.
Measured after four substeps from a fresh `newRun(1337)`:

```
surface ty=54   lit   0/128  max= 0  solid=128
surface ty=55   lit   0/128  max= 0  solid=128   <-- last row above the seam
---------------------- world-Y 768 ----------------------
topsoil ty=0    lit 128/128  max=15  solid= 76
topsoil ty=1    lit 128/128  max=15  solid=128
topsoil ty=2    lit 128/128  max=12  solid=128
topsoil ty=3    lit 128/128  max= 9  solid=128
topsoil ty=4    lit 128/128  max= 6  solid=128
topsoil ty=5    lit  52/128  max= 3  solid=128
```

28 rows of solid `surface` rock sit above at light 0, and the row 8 px below
them is full daylight. `lightFalloffRock` is 3 (`data/tuning.js:197`), so no
legitimate path delivers 15 there.

`view/scene.js#darkBucket` returns -1 when `level >= max`, so rows 0 and 1 get
no darkening rect at all and render at full brightness. That is the bright
full-width strip in the report.

This contradicts `rules/light.js`'s own header, which says light decrements per
tile crossed "so light does not leak through strata the way sight already does
not", and `docs/SPEC.md:928-932`, which says a hollow with no air path to a
light source stays dark. A room in `topsoil` rows 2-4 is lit at 12/9/6 with no
air path to any source.

### 1.2 `rules/reveal.js:84-89, 111-115` un-fogs 128 columns at once

`model/tiles.js#skyExposedAt` walks to row 0 of **this band's own grid**, so a
player standing in their own shaft in `topsoil` satisfies it — measured still
true 38 tiles down. Pass A then reveals the band's whole "sky-exposed
silhouette", which for `topsoil` is all 128 columns of row 0, permanently. In
the real loop the newly-seen count jumps 0 → 254 in the single substep
`player.band` flips.

### 1.3 `rules/reveal.js:66-74` has no seam split, so the player is bisected

```js
const b = player.band;
const box = playerBox();
const ty0 = tileY(b, box.y), ty1 = tileY(b, box.y + box.h - 1);
```

With `player.band === topsoil` and `box.y === 760`, `tileY(topsoil, 760)` is
**-1**. `model/world.js:84` rejects out-of-bounds rows silently and the Pass B
flood only walks `player.band`, so the tiles the player's own head occupies in
the band above are never revealed. `drawFog` runs after `drawPlayer`
(`view/scene.js:140-142`) by design — an unseen tile is opaque regardless of
what is behind it — so seven of the sixteen sprite rows are painted over.
Sampled down the 6 px sprite:

```
worldY 761..767   16,14,24      (INK.fog under the depth tint)
worldY 768..775   107,41,39     (INK.tunicA, undimmed)
```

The split is pinned at 768 while `player.y` moves sub-pixel, and a standing
player creeps 0.8 px and snaps back on a ~9-substep cycle
(`tools/check.mjs:6470`), so the visible fraction oscillates. That is the
"glitching" as a *rendering* effect.

`rules/light.js:99-105` has the same shape for the carried brand: it seeds only
into `player.band`, so a brand held while straddling a seam lights half the
player's own tiles.

## 2. Aggravating, and a separate site

`view/scene.js:791-799` — `atmosphere()` reads
`bandAt(cam.x + W/2, cam.y + H/2)` and tints the whole screen by
`min(0.55, (1 - ambient) * 1.1)`. `surface` ambient is 0.95 → 0.055;
`topsoil` is 0.6 → 0.440. That is an **8.0x whole-screen brightness step in a
single frame** when the camera centre crosses 768, brighter going up. A second
reading of "full visibility out of nowhere".

## 3. What is NOT wrong

- **The near-black around the strip is correct fog of war.** `surface` rows
  52-55 and `topsoil` rows 2+ have `seen = 0`, and `drawFog`
  (`view/scene.js:745-751`) is documented to paint an unrevealed tile opaque
  regardless of content. Pass B deliberately refuses to flood through unlit air
  (`rules/reveal.js:188-192`, `docs/SPEC.md:928-932`), so a 40-tile shaft dug
  without a brand reveals almost nothing. Designed, and arguably poor game
  feel, but not a defect. **The strip is the bug; the black around it is what
  the strip should also be.**
- **No physics defect at either seam.** Real-loop crossings at 1- and 2-wide
  shafts, carved and undug, both directions: `flips=1`, `worstBack=0.000`,
  `maxJump=2.00` px against a 3.334 px/substep terminal limit. A 4,630-substep
  randomised-input fuzz in a chamber straddling the seam produced zero
  anomalies. `rules/player.js#reband` and the Phase 8h fix are intact.
- **Framerate is not a factor.** `shell/main.js:842` is
  `while (clock.acc >= STEP) step(STEP)` at `STEP = 1/120`, and
  `updateCamera(dt)` is inside the substep, so no `rules` module sees a
  variable dt (invariant 10).
- **No HUD element changes alpha at the seam.** `__mf.ui.panels` before the
  crossing and on the crossing frame are byte-identical. The one real HUD
  change is `view/ui/ruler.js:179,190`, where segment III goes from
  `mix(BACK, tint, 0.22)` to full `tint` when `bandKnown` flips — intended.
- Rejected with measurements: `player.band` momentarily null; camera or `VIEW`
  discontinuity (all three bands are `tw:128`, `tile:8`, `origin.x:0`); chunk
  repaint starving the band below (first paints are unbudgeted,
  `view/paint.js:37-38`); any `rand()` involvement.

## 4. Two comments that now mislead

- `model/tiles.js:76-77` says `skyExposedAt`'s "only reader" is
  `view/paint.js` and that it is "never per frame". `rules/reveal.js:88` calls
  it every frame.
- `tools/check.mjs:4469-4470` asserts as established fact that `lightAt()`
  reads 0 wherever nothing real reaches, "**in every band alike**". That is
  precisely what is false, and the probe sidesteps it by working at
  `ty0 = 260`.

## 5. Why `tools/check.mjs` section 8h missed it

8h (`tools/check.mjs:6344-6629`) is entirely about motion — five claims on
arrival band, `flips === 1` and `worstBack === 0`. It never calls
`main.draw()` and never reads `b.seen`, `b.light` or `lightAt`. It carves its
shafts in **both** bands, so it manufactures the `skyExposedAt` condition and
then never looks at it.

## 6. The fix, and what is not the fix

1. **Seed sky from world space.** `rules/light.js` must seed a band's row 0 at
   `max` only where the world above it is open. Where the band above reports
   solid, carry that row's own level in through the normal falloff instead.
   `bands` iterates in `BANDS` order (astral, surface, topsoil), so a top-down
   cascade is available — but `isDirty(b, sig)` gates recomputation per band,
   so a cross-band dependency needs the dirty flag to propagate downward or the
   lower band will keep a stale flood.
2. **Give `rules/reveal.js` the seam split `rules/player.js` already has.**
   Pass A's gate must ask about world sky. Pass B must seed over every band the
   hitbox overlaps. `rules/player.js#rowBand` (`:319-322`) and
   `rules/mining.js#resolve` (`:130-135`) already resolve per world row and got
   this right; the shared helper belongs in `model/world.js` beside `bandAt`,
   because `rules` siblings may not import one another.
3. **Make the depth tint continuous** across a seam rather than stepping on a
   single `bandAt` of the camera centre.

**Not the fix, and both would look like one:** raising `DARK_ALPHA` or lowering
`lightMax` so the strip is less glaring, and making `drawFog`/`drawDarkness`
skip the player's own tiles so the sprite stops being cut in half. Both hide
the symptom and leave `topsoil` rows 0-4 lit by nothing.

## 7. The assertions that would have caught it

- **Light does not cross a seam for free.** For every column,
  `|lightAt(surface, tx, 55) - lightAt(topsoil, tx, 0)| <= eff('lightFalloffRock')`.
  Today `|0 - 15| = 15`. Holds at boot, no crossing needed.
- **No band's row 0 is daylight unless the world above it is open.** For each
  band with a band above, `lightAt(b, tx, 0) === 0` wherever the band above is
  solid at its last row. Today 128/128 columns fail.
- **A crossing reveals a bounded neighbourhood.** Newly-seen tiles must stay
  within Pass B's own `eff('sightRadius')` bound, and `seenAt(topsoil, tx, 0)`
  must be false more than `sightRadius` from the shaft. Today 254 tiles in one
  substep and row 0 revealed 128/128.
- **The player's own tiles are revealed in every band the hitbox overlaps.** At
  `player.y === 760` with `player.band === topsoil`, `seenAt(surface, tx, 55)`
  must be true for both straddled columns. Today false. Assert at the
  astral/surface seam too, and with the box straddling downward
  (`ty1 >= b.th`).

## 8. Open question for the reporter

"Glitching around" reads like erratic position, and there is none — 4,630
substeps of randomised input across the seam produced zero motion anomalies.
What is demonstrable is a half-erased sprite whose boundary is pinned at 768
while the player moves sub-pixel, which reads as flicker rather than
displacement. If it is genuinely positional, the one untested writer of
`player.y` is `rules/drive.js:400` (`pw.move` on a riding player) with a
segment spanning the seam, which no seam probe exercises.
