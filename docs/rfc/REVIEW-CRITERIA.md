# Review criteria

How the six RFCs are graded. Criteria 1 and 2 are the repo owner's additions and
carry the most weight — they are the difference between an architecture that is
clever and one that is pleasant to live in for a year.

---

## 1. Comprehensibility — heaviest weight

A human reading the codebase must be able to work out **where things live**, and
adding content in the *same family* as something that already exists must be
obvious without asking anyone.

**The cold-open test.** A developer who has never seen this repo is handed the
tree and told: *"add tin ore, and add a kiln that bakes 2 gravel into 1 brick."*
Judge each RFC on:

- How long before they know which files to open? Which files *are* they?
- Can they do it by copying an adjacent example and changing values, or must
  they first understand an interpreter, a compiler, a registration lifecycle or
  a class hierarchy?
- If they typo something, does it fail loudly and near the edit, or silently and
  far away?
- Can they still `grep` a name and find the thing? Losing greppability is a real
  cost and must be priced, not waved away.

A design that is more extensible but less comprehensible **loses**. Cleverness
that a future reader has to reverse-engineer is a defect.

## 2. DESIGN.md coverage — pass/fail per item, then weighted

`docs/DESIGN.md` is the living design document. It will grow. Every idea in it
must be *accounted for*: implementable within the architecture without a rewrite,
even if the RFC cannot say exactly how.

**Fail an RFC on any item that would require massive boilerplate, or where the
path is genuinely unclear.** Go through this checklist explicitly, item by item,
and mark each `CLEAN` / `AWKWARD` / `BLOCKED` with one line of reasoning:

**Economy and progression**
1. **Cost of ascension** — lift cost `k x depth`, fuel burned *at the lifter*,
   per-tier compression ratios (raw 1:1 → ambrosia ~400:1), yielding a
   computable break-even depth per item. Needs per-item mass and a fuel account.
2. **Tribute cycles** — a demand with a deadline; meet it → a new depth band
   unlocks *and* a boon is drafted; miss → punishment; two misses ends the run.
3. **Torments / meta-progression** — permadeath; a run keeps only stolen recipes
   and banked per-god favour. Requires a run-state vs meta-state split.
4. **Refinement tiers** — ore → ingot → plate → essence → ambrosia, with tribute
   escalating in refinement rather than volume.

**Fields and physics**
5. **Buoyant heat** — a diffusing field with an upward bias; deep smelting bakes
   a mid-level distillery; coolant demand grows with build depth.
6. **Bottom-up flooding** — an aquifer breach floods upward, drowning the
   deepest works first; pumping pays the upward tariff.
7. **Failure states** — flood, cave-in, thermal runaway, fuel death spiral,
   divine wrath.

**Boons — the hardest architectural test in the document**
8. **Trinkets: passive modifiers.** A boon must be able to change walk speed,
   pick power, machine rates, fall damage thresholds. Note that `CLAUDE.md`
   forbids the obvious implementation: ES module bindings are read-only for
   importers, so a trinket **cannot** reassign `export const WALK`. Every
   tunable a boon touches must already live somewhere mutable. **An RFC that
   leaves tunables as module constants is BLOCKED on this item.**
9. **Machines: new production verbs**, granted mid-run. Tests whether content
   registration works at runtime, not only at boot.
10. **Miracles: one-shot terrain edits** — calcify a lava flow, collapse a lake,
    petrify a nest. Needs arbitrary region-scoped tile transformation.
11. **Mutually hostile boons** — Poseidon's aquifer tap floods strata
    Hephaestus's kilns need dry; Dionysus's vats want a temperature band the
    smelters ruin. Requires boons to read and write the fields.
12. **Trap boons** — the blood winch: a lifter fuelled by the player's own
    health instead of timber. Tests whether "fuel" is a generic concept rather
    than a hardcoded item slot.

**Monsters and the Hades act**
13. **Emission-driven aggro** — monsters attracted by noise, heat plume and
    light; aggro is self-inflicted and scales with production.
14. **Monsters attack logistics** — eat items off chutes, nest in disused
    shafts, sever pipes, **ride the player's elevators upward**.
15. **Ichor** — a fluid obtainable only from monsters, gating top-tier goods.
16. **Hades wants mass** — slag, tailings, spoil, bones, broken machinery,
    delivered by opening a hole. The waste stream becomes currency, so items
    need mass and a notion of worthlessness-to-Zeus.
17. **Suspicion and concealment** — a hidden meter tracking tonnage moving
    *downward*; hidden chutes, cooked ledgers, a surface factory that looks
    compliant. Cross-cutting and needs a visibility concept.
18. **Tartarus** — a third act below Hades.

**Infrastructure the mockup had and the game still needs**
19. **Staged lift** — five independent stages, each with its own drum, deck and
    counterweight. Never one continuous cage.
20. **Piles with backpressure** — a pile only shrinks if something consumes it;
    an unconsumed pile fills and flags FULL.
21. **Chutes, carts, pipes** — item and fluid routing between machines.
22. **Fog of war**, which gains a late-game purpose from concealment (17).

## 3. Extensibility

Does adding content genuinely avoid touching engine code? Be sceptical of
claims. Two RFCs volunteered honest limits — 01 says "just add a row" holds
**~60% of the time**; 04 concedes **~490 LOC of moves that buy the player
nothing**. Treat those admissions as data, not modesty, and check whether the
RFCs that did *not* volunteer such limits actually lack them or merely failed to
mention them.

The sharpest sub-question, and the only genuinely contested axis across the six:
**what happens when you need a behaviour nothing else has?** A new
self-contained component, a registered verb, or an edit to a closed map inside
the engine? Price that difference.

## 4. Separation of concerns

Can the renderer be swapped without touching the sim? Is appearance separable
from physics from gameplay? Is there a single source of truth per concept? Note
that today `paint.js:127` string-compares a material id, and `mining.js` imports
the tutorial.

## 5. Simplicity proportionate to the problem

This is a 1,889-line game, not an engine. **Speculative generality is a defect.**
An abstraction with exactly one implementation and no second one in sight is
marked against. Weigh this against criterion 2 honestly: DESIGN.md is real
planned work, not speculation — but a mechanism built for a DESIGN.md feature
should be justified by that feature specifically, not by generic flexibility.

## 6. Migration realism

Can this land incrementally against a working game with a passing test suite, or
is it stop-the-world? Estimated LOC touched, and whether the tutorial keeps
working at each step.

## 7. Fit with the project's grain

Zero runtime dependencies, native ES modules with no transform, data tables over
code, integer pixels, seeded determinism, honest verification.

---

## Deliverable

1. **A graded table**: all six RFCs against criteria 1-7, with a score and a
   one-line justification each.
2. **The DESIGN.md checklist**, all 22 items x 6 RFCs, marked
   CLEAN/AWKWARD/BLOCKED. This is the most valuable artifact — be rigorous.
3. **A shortlist of three** to carry into implementation, with reasoning.
   Combinations are explicitly permitted and encouraged: name which parts of
   which RFCs compose, and say why they are compatible.
4. **An escalation option.** If all six genuinely fail — particularly on
   criteria 1 or 2 — you may recommend **not** proceeding to implementation and
   instead propose **five new architectural directions** to research. Taking
   this option requires naming precisely which criteria all six fail and why a
   new direction would do better. Do not take it out of perfectionism; the bar
   is "no combination of these six is worth building," not "none is perfect."
