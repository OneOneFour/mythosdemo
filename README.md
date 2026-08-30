# Mythos Factory

A gravity-fed vertical factory roguelike. Greek myth, underground alchemy.

You are a Prometheus-like figure who digs, refines, and ships goods upward to
demanding gods. The genre statement is one sentence: **downward movement is
free, upward movement is expensive.** Every other automation game has flat,
cheap logistics. Inverting that forces deep gravity-fed chains where only the
most refined, compact goods are worth lifting.

This is **scaffolding, not a game yet.** The architecture is complete and the
core loop runs. Content is deliberately thin.

---

## Run it

```bash
npm install          # dev tooling only; the game itself has zero dependencies
npm start            # http://localhost:5173
```

That is all you need for manual testing. ES modules need an HTTP origin, which
is the only reason a server is involved — nothing is compiled or transformed in
development, so what you read in `src/` is exactly what the browser runs.

## Controls

| key | |
|---|---|
| **A / D** | walk left and right |
| **W / S** | climb up and down a ladder |
| **Space** | hop — one tile, enough for a ledge, not enough to escape a hole |
| **click** or **X** | dig the aimed tile |
| **E** | place the first placeable thing in your pockets (logs make ladders) |
| **F** | place a furnace |
| **L** | place a winch stage |
| **T** | equip a trinket (a god's passive boon) |
| **B** | grant a machine boon |
| **G** | tile grid overlay |
| **C** | chunk boundaries overlay |
| **H** | debug panel |
| **M** | mute |
| **R** | restart the run |

Mouse aim when you move the mouse; keyboard aim otherwise (facing, or up/down).

## What to try, and what should happen

1. **Walk around.** You spawn on the **surface** band. Hop a ledge. Note that
   one hop cannot get you out of a hole — that is deliberate.
2. **Dig down.** Hold **S** and **X**. Tiles crack, then break, then drop an
   item that **falls**. Walk over it to collect. Nothing teleports into your
   inventory: material becomes a physical thing, which is how the game teaches
   that down is free before any machine exists.
3. **Keep digging.** Fall damage starts at 5 tiles and a 20-tile drop is lethal,
   at any framerate. You have five discrete hearts.
4. **Fell a tree, then place logs with E.** A log is the only tile-capable form,
   so placing logs *is* the ladder mechanic — and a standing trunk is climbable
   for the same reason. That is emergent from the content model, not coded.
5. **Place a furnace with F**, and drop ore into its mouth from above. Material
   that falls in is free; hand-feeding while standing next to it also works.
   Putting it *below* a vein is strictly better than putting it on the surface.
6. **Press T** to equip a trinket, then watch a machine speed up. Press it again
   to see the effective value restored.
7. **Look up.** There is an **astral** band above the surface where minor gods
   live, and a **topsoil** band below. The winch is how you get up. It only
   ascends with a lit burner, and it is the whole thesis in one machine.

### What is deliberately absent

No tutorial beats, no tribute cycles, no monsters, no fluids, no heat
diffusion, no save file, and only three machines. The *seams* for all of those
exist and are documented; the content does not. `docs/DESIGN.md` marks what is
designed versus built, and `FUTURE_IDEAS.md` holds the backlog.

**The art has not been reviewed since the refactor.** Screenshot baselines were
re-taken mechanically to catch future regressions, not because anyone judged
them good. If it looks wrong, it probably is.

---

## Verifying

```bash
npm run check         # headless: architecture, content, purity, behaviour
npm run test:visual   # screenshot regression in a real browser
npm run test          # check + build + visual
npm run lint          # oxlint, no config
npm run build         # dist/mythos-factory.html — one self-contained file
npm run preview       # serve the built artifact on :5174
npm run parity        # build, then assert dev and dist render identically
```

What each layer can and cannot tell you is documented in `CLAUDE.md`. The short
version: `check` proves behaviour, `test:visual` proves appearance has not
*changed*, and neither proves the game is any good.

## Reading the code

Start with **`ARCHITECTURE.md`**. It was written before the code, so it governs
rather than describes, and it records what was rejected as well as what was
chosen.

```
src/core/    pure utilities — rng, palette, bitmap font, pixel ops, canvas
src/data/    frozen content tables — substances, forms, machines, tuning, world
src/model/   world state and queries. Owns numbers, makes no decisions.
src/rules/   mechanics. Owns decisions and consequences.
src/view/    rendering and HUD. Reads the model, never mutates it.
src/shell/   the loop, input, devices, wiring
tools/       serve, build, check, layers (the dependency checker)
reference/   the original non-interactive pixel-art mockup, preserved
docs/        SPEC (locked numbers), DESIGN (the game), rfc/ (why this shape)
```

Nothing may import upward. `rules` and `view` may never import each other.
`tools/layers.mjs` enforces it and runs as section 0 of `npm run check`.

Two rules answer most "where does this go?" questions:

- **`model` owns the number and the query; `rules` owns the decision and the
  consequence.** Storage has the lifetime of the world, a decision the lifetime
  of a frame.
- **A substance is an element; anything you can hold is substance x form.** A
  thing with no element of its own is a *form* of the element it came from. A
  brick is fired copper gravel, and stays copper.

## Adding content

Adding a substance or a machine should be copying an adjacent row and changing
values. It genuinely is:

- **a new ore** — one row in `src/data/substances.js`. One `smelt` recipe
  already covers every ore, so it needs no recipe.
- **a new machine** — one row in `src/data/machines.js`.
- **a faster variant of a machine** — a row naming the base, plus one line in
  `src/data/tuning.js`. No variant code, and a trinket still stacks on top.

If you find yourself editing `src/rules/` to add content, something is wrong —
either with the content or with this claim. Both are worth investigating.
