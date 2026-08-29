# Underground Mythos Factory — visual mockup

A pixel-art concept mockup for a gravity-fed vertical factory roguelike. Greek
myth, underground alchemy, and a mine that gets stranger the deeper it goes.

**This is eye candy, not a game.** Nothing is playable. It exists to show what
the game looks like and to prove the world model holds together geometrically.

## Running it

```bash
npm install     # no dependencies; this is instant and optional
npm start       # http://localhost:5173
```

ES modules need a real HTTP origin, so opening `index.html` off the filesystem
will not work. `tools/serve.mjs` is a ~40-line zero-dependency static server;
any other static server does the job equally well.

```bash
npm run check    # headless: builds the world at 4 viewport sizes, runs 60s of
                 # simulation, renders every depth band, asserts no material
                 # escapes the excavated space
npm run bundle   # inline everything into dist/mythos-factory.html (no server)
```

## Controls

| | |
|---|---|
| scroll / drag / arrows | descend |
| `T` | toggle the auto-tour |
| `G` | 8px grid overlay |

## Layout

```
src/
  core/        canvas scaling, pixel primitives, palette, bitmap font, RNG
  world/       everything baked once into the static strip
    config.js      strata bands, working levels, key elevations
    layout.js      THE MODEL — shafts, voids, piles, stations, lift, rigs
    strata.js      procedural rock for each band
    excavate.js    carving voids out of that rock, timbering, shoring
    structures.js  lift, rails, station bodies, service pipes
    build.js       orchestrates the above into one offscreen canvas
  sim/         per-frame dynamics (rigs, carts, drops, piles, stations, lift)
  render/      per-frame drawing (scene composition, entities, HUD)
  input.js     scroll / drag / keys
  main.js      the RAF loop
```

## How the world model works

Everything derives from an explicit excavation model in `world/layout.js`.
Read that file first; the rest is presentation.

- **`LEVELS`** — six working levels, each a horizontal drift with a floor. The
  drifts narrow with depth, because less has been excavated down there.
- **`SHAFTS`** — vertical connections. Each names the floor it lands on. Ore
  only falls inside a shaft; rock is solid everywhere else.
- **`VOIDS`** — the carved volumes, derived from levels + shafts. `carve()`
  removes rock; `shore()` timbers it. The surface is a void of kind `open`,
  since daylight needs no excavating.
- **`PILES`** — material accumulates on floors. A pile only shrinks if
  something consumes it, so a pile with no consumer fills up and flags `FULL`.
- **`STATIONS`** — drain input piles and emit output after `perOut` charges,
  which is where refinement ratios live. A station with an unsatisfiable input
  flags `STARVED` (the bottom-level still has no fuel line reaching it).
- **`CAGES`** — the lift is five independent stages, one per level pair, each
  with its own drum, deck, and counterweight. Goods relay upward landing by
  landing. The lift is deliberately the throughput bottleneck.

Material moves: rig breaks out a face → cart hauls along rails on the drift
floor → tips into a shaft → free-falls under gravity → lands on a pile →
station consumes it → output hauled to a landing → lift relays it up.

## Changing things

Most edits are data, not code:

- **new working level** — add to `LEVELS` in `config.js`, add shafts to reach
  it, add a pile at each shaft floor
- **new machine** — add to `STATIONS` in `layout.js`, then a body in
  `stationBodies()` in `structures.js`
- **rebalance throughput** — a rig yields one cart per breakout, i.e. every
  `4 * period` seconds; a station consumes one input per `rate` seconds and
  emits per `perOut` charges. Stations run 38% faster when their feed pile is
  over 55% full, which keeps piles bounded.
- **palette** — `core/palette.js`, lifted from the concept art

After any geometry change run `npm run check`. It will catch material falling
through solid rock, off-canvas placement on narrow viewports, and non-finite
draw coordinates.

## Known scope limits

- The player figure does not move or have collision
- No fog of war; the whole strip is visible
- The HUD is decorative — quotas, favour and boons are static data
- Only tested against the headless stub, so visual regressions need eyeballing
