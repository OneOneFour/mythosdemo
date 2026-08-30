# Prototype brief

Three skeleton architectures, built for **code inspection only**.

Nobody will run these. Nobody will benchmark them. Do not spend a single minute
on performance, on making them boot, or on visuals. The questions being answered
are only these:

1. Does the scaffolding actually come together, or does it fight itself once
   real content is poured in?
2. Reading it cold, does it make sense? Is it obvious where a thing lives and
   how to add another one like it?

A skeleton that is honest about an unresolved seam is worth more than one that
papers over it. **If something does not work in your design, say so in a comment
at the point of failure.** The reviewer is explicitly instructed to reward that.

---

## Ground rules

- Write only inside your own `prototypes/<X>-<name>/` directory. Never touch
  `src/`, `tools/`, `tests/`, `docs/`, or another prototype.
- Every file must **parse** as a native ES module (`node --check`). It need not
  execute. No TypeScript, no decorators, no build-step syntax.
- No runtime dependencies.
- Include a `README.md` at your root: the tree, the reading order for a
  newcomer, and an honest list of what you left as a stub and why.
- Real code, not `// TODO` walls. Where you stub, stub the *leaf* (a draw call,
  a physics body) and never the *structure* being evaluated.

## Out of scope — do not build

Player physics, rendering internals, the tutorial state machine, audio, input,
worldgen, the test harness. Stub or omit. Also **art and visuals entirely** —
and **bugs and framerate are explicitly not being graded**, so do not discuss
or design around them.

---

## Required content — the same in all three, so they are comparable

You must define these, because they are the cases that discriminated between the
six RFCs.

**Substances (6):** `copper` (ore, smelts to ingot), `timber` (fuel),
`ingot`, `tin` (a second ore — added last, to prove the one-row claim),
`gravel`, `brick`.

**Machines (4):**
1. **furnace** — 3x2, `2 copper + 1 timber -> 1 ingot` per 4s. Catch box: items
   falling into its mouth are swallowed. Hand-feeds from the player's inventory
   when they stand adjacent.
2. **crusher** — 2x2, `1 ore -> 2 gravel`, accepting *any* ore by tag.
3. **kiln** — `2 gravel -> 1 brick`. **This is the cold-open test target.** It
   must be addable by someone copying the crusher and changing values. Write it
   last and, in your README, state exactly which files you touched to add it.
4. **blood winch** — a lift stage fuelled by the **player's health**, not by an
   item. This is the sharpest test in the set. RFC 02 solves it cleanly because
   its `Burner` *provides* a named `heat` slot and a `BloodBurner` can provide
   the same slot from a different source, so the recipe engine never learns the
   difference. Every other RFC was AWKWARD or BLOCKED. Show how yours handles
   it, or show clearly where it breaks.

**Tunables — required, and all six RFCs missed this.** DESIGN.md's trinket boons
are passive modifiers on walk speed, pick power, machine rates and fall
thresholds. `CLAUDE.md` notes ES module bindings are read-only for importers, so
a boon **cannot** reassign `export const WALK = 60`. Provide a tunable store
where a boon can apply a modifier at runtime, and show:
- one base value declared (e.g. walk speed)
- a trinket applying a `x1.15` modifier to it
- the consumer reading the effective value
Include material hardness and machine rates in the same mechanism.

**One field seam:** heat. A per-tile scalar with an active-cell notion. Show the
seam and how a machine emits into it and a recipe could gate on it. Do not
implement diffusion.

**Data-driven painting:** the current renderer does
`if (M.id === 'copper')` at `src/world/paint.js:127`. Show how appearance
becomes data, and how "this material glows" is added without editing a paint
function.

**Injected world config:** `WORLD_TW`/`WORLD_TH` are module constants today and
the arrays are allocated at import, so world size is fixed at import. Show the
seam that makes a second, differently-sized depth band possible.

**Data-driven HUD inventory:** `src/render/hud.js:57-62` hardcodes four
substance names. Show the data-driven version.

**Where mining lives**, and why that placement is defensible. (Mining progress
currently sits in the tile storage module. Do not discuss the resulting bug —
just place the mechanic somewhere sensible.)

---

## Required README sections

```
# <prototype name>
## Reading order            which 5 files a newcomer opens, in order, and why
## Adding a substance       the diff to add `tin`. List every file touched.
## Adding a machine         the diff to add the kiln. List every file touched.
## The blood winch          how it works here, or where it breaks
## Tunables                 how a trinket modifies walk speed at runtime
## What I stubbed           and why
## What fought me           the honest part: where the architecture resisted
## Faithfulness             where you deviated from your source RFC, and why
```

`## What fought me` is not optional and is weighted heavily. It is the section
the reviewer will trust most.

---

## What the reviewer will grade

1. **Comprehensibility, heaviest weight.** The cold-open test: a developer new
   to the repo is told "add tin ore, and add a kiln that bakes 2 gravel into 1
   brick." Which files do they open? Can they succeed by copying an adjacent
   example, or must they first understand machinery? Does a typo fail near the
   edit? Does `grep kiln` still find it?
2. **DESIGN.md coverage**, against the 22-item checklist in
   `docs/rfc/REVIEW-CRITERIA.md`. More than 25% of items landing
   BLOCKED or AWKWARD is a failing grade.
3. **Faithfulness to the source RFC.** Deviating is allowed where the RFC was
   wrong, but it must be declared in `## Faithfulness`. An undeclared deviation
   is treated as a defect.
4. **Whether this is actually an improvement on `src/` as it stands.** Not
   "different" — better, and specifically on comprehensibility and future
   coverage.
5. **Simplicity proportionate to the problem.** This is a 1,889-line game.
   Speculative generality is a defect. An abstraction with exactly one
   implementation and no second one in sight will be marked against.
