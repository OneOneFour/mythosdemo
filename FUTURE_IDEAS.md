# Future ideas

Parked ideas, with enough context to pick them up cold. Nothing here is
implemented or scheduled. Add to the bottom; move to `docs/SPEC.md` when a
thing becomes a commitment.

---

## Load-bearing fall damage

**Idea.** Fall damage scales with what you are carrying, not just how far you
fell. Hauling a full load of ore multiplies impact damage.

**Why it's good.** It taxes upward movement a *second* time, on top of the fuel
bill and the ladder cost. The player who tries to shortcut the lift by hand-
carrying ore up a shaft and dropping down the fast way gets punished for it.
Thematically it is the cost of ascension expressed through the body.

**Why it's parked.** Needs the item-identity layer (mass per item) before it can
exist, and it is hard to communicate to a player at minute two. The discrete
5-heart model ships first; this is a layer on top, not a replacement.

**Sketch.** `hearts = base(v) * (1 + carriedMass / capacity)`, rounded up. Show
carried mass in the HUD as a weight bar that visibly changes your jump arc, so
the player feels it before it kills them.

---

## Heavy and fragile resources

**Idea.** Materials get physical properties beyond "one unit of ore".

- **Fragile** — breaks if dropped more than N tiles. Bottled essence, ambrosia,
  glass distillation ware, monster eggs. You cannot use the free downward chute
  for these; you have to build cushioned descents, water landings, or slow
  ratchet chutes. A whole second logistics network for the *valuable* half of
  your output.
- **Heavy** — costs disproportionately more to lift, damages the floor or the
  cage on landing, may break a lift stage under repeated load. Slag, ingot
  stacks, machinery, monster corpses.

**Why it's good.** It attacks the game's own core assumption. "Down is free" is
the thesis; fragile goods are the exception that makes the thesis interesting
rather than absolute. And it gives Hades' mass contracts a mechanical texture —
he wants the heavy stuff, which is exactly the stuff that wrecks your lift.

**Why it's parked.** Same blocker: needs item identity. Also needs a second
descent verb (cushioning) designed before fragility is anything but a tax.

**Sketch.** Per-item `{ mass, fragility }`. Fragile items landing above their
threshold shatter into a lesser material rather than vanishing, so the failure
is legible and partially recoverable. Water at the bottom of a shaft becomes a
real piece of infrastructure worth building.

---

## Ideas inherited from docs/DESIGN.md, not yet scheduled

These were reasoned through in the original design conversation and are recorded
in full in `docs/DESIGN.md`. Listed here so the backlog is in one place.

- **Buoyant heat as a field.** Hot cells push upward and diffuse, so deep
  smelting bakes your mid-level distillery. Coolant demand becomes a function of
  build depth. Items go down, heat comes up, both fight over the same shafts.
- **Bottom-up flooding.** An aquifer breach floods upward, drowning the deepest
  and most valuable works first while you watch it climb.
- **Mutually hostile god boons.** Poseidon's aquifer tap floods the strata
  Hephaestus's kilns need dry. Some gifts are traps (the blood winch).
- **Monsters that attack logistics, not the player.** Aggro from what the
  factory emits — noise, heat plume, light. Self-inflicted and scaling with
  production. Ichor only comes from monsters and gates top-tier goods.
- **The Hades act.** He is the anti-quota: he wants mass, has no deadlines, pays
  better, and your waste stream becomes currency. Playing both sides against a
  hidden suspicion meter is the endgame verb.
- **Tartarus below Hades.** The Titans are Prometheus's kin, chained by the same
  gods starving you over quotas. The reason to dig past where the ore stops
  improving.

---

## Mechanical power for belts — partially shipped, one idea still open

**Shipped, differently than discussed here.** A manual hand-crank and a
gear-train sharing a mechanical budget between multiple draws was once a
discussed alternative to burner fuel; it shipped in Phase 8f as player-driven
segment transport (CLAUDE.md D10, `docs/PLAN-gears-and-winches.md`) --
`crank`/`gear`/`axle` machines, torque as a divisible component scalar, one
crank able to feed several segments through gears at a shared, divided speed.
Belts (`rules/belts.js`) still run on the unrelated burner/charge mechanism
(feed a machine fuel, it banks a charge, the charge gets spent moving
material) and are not on the drivetrain.

**Not to be confused with:** a separate, previously-discussed "blood winch"
idea where a player SACRIFICES HP to instantly TELEPORT resources rather than
moving them physically — a teleport-for-blood mechanic with no belt or
segment involved at all. This is still unbuilt and still open. It must not be
confused with the heart-fuel-for-lift-charge trade the staged winch's second
recipe once offered (`{ in:{heart:1}, from:'vital' }`, spending hearts for an
ordinary lift charge once timber ran out): that mechanic is gone along with
the winch it belonged to, the user rejected it outright when segment transport
replaced the winch (D10 explicitly rules out a passive or heart-powered
alternative to the manual crank), and `data/sources.js#SOURCES` no longer
carries a `vital` row at all.

---

## Machine output as a held queue, offloaded by a grabber

**Idea.** A machine recipe's output (`rules/machines.js#produce`) stays inside
the machine as an internal FIFO buffer instead of ejecting as a physical,
gravity-affected item the instant it is made. A not-yet-built "grabber" machine
would then pull from the oldest queued item and move it onward — a Factorio-
style inserter, rather than the current catch-box chaining where one machine's
ejected output literally falls into the mouth of whatever sits below it.

**Why it's good.** It decouples "a machine finished a recipe" from "the output
is now a physical object subject to gravity and collision," which is exactly
what a grabber needs to reach into: a queue it can query and drain on its own
schedule, not a stream of falling items it has to catch mid-air.

**Why it's parked.** No grabber machine exists yet, and today's multi-machine
automation (belts, stacked machines) depends on `produce()`'s output actually
falling as a physical item so the catch-box under it can collect it for free
(the same idiom mining output uses, `ARCHITECTURE.md` invariant 5). Switching
machine output to an internal buffer before a grabber exists would strand that
output with no way to leave the machine. Needs the grabber designed first, not
this queue on its own.

**Sketch.** A machine record gains an `outQueue` array (or bounded ring buffer)
that `produce()` pushes onto instead of calling `write.spawn`. A grabber
machine, placed adjacent, dequeues the oldest entry on its own tick and either
credits it to the player's inventory (if the player is the target) or ejects it
as a physical item toward its own output side. Hand-craft output goes straight
to the player's inventory, but machine output should stay machine-side until
something (this grabber) moves it, rather than becoming a player pickup.

---

## A callout for "I chopped a lot of trees and got no seeds"

**Idea.** A tree only drops its one seed on the last trunk tile felled
(`docs/PLAN-phase15-trees.md` D15-A — the seed is intentionally still there,
in whatever tiles of the trunk are still standing), so a player who fells a
few tiles off several trees and wanders away can rack up a real sense of "I
chopped a lot of trees and got no seeds," even though nothing is actually
lost. `log` is the only fuel in the game, so a player stuck in this state
reads it as the timber economy running out, not as their own felling habit.

**Why it's good.** Cheap to fix with a beat, not a mechanic change — the
seed drop and one-seed-per-tree design (never a `chance`) are both already
right; this is a legibility gap, not a balance one.

**Why it's parked.** Needs `docs/PLAN-phase13.md` 13d's callout-extension
plumbing (or its equivalent) to land first, and should be worded to teach
"fell a tree **completely**" rather than just reacting to zero seeds.

**Sketch.** A callout beat that fires the first time a player fells a tile
off a trunk without felling the whole tree, along the lines of "fell it all
the way down for the seed."

---

## Cycles 5 and 6, and the refinement tiers they need

**Idea.** `data/cycles.js` ships four rows and the run ends past the last one
(`docs/SPEC.md` §20.2). `docs/DESIGN.md`'s progression runs to six, ending on
three bottles of ambrosia, each 400 raw units deep.

**Why it's good.** The escalation is in refinement rather than volume, and
`essence` (60:1) and `ambrosia` (~400:1) are the two rungs that make the
break-even curve bite. At 400:1 a single bottle is worth hauling from
anywhere, which is the point the whole cost-of-ascension equation is aiming
at.

**Why it's parked.** It is a content wave, not a fix. Two new forms, the
recipes that make them, the machines that run those recipes, and a rebalance
of the whole refinement curve — `docs/SPEC.md` §8 prices both tiers and marks
both not implemented. Two cycle rows on top of that are the cheap part.

**Sketch.** Add the two forms to `data/forms.js` and the two rows to
`docs/SPEC.md` §8's table first. The win boundary is `run.cycle >
CYCLES.length`, so the cycle rows themselves need no code at all.

---

## A genuine throughput quota

**Idea.** A demand that measures how fast the player *produces*, not how
tightly deliveries arrive.

**Why it's good.** Every demand in the game is a pile. A line is the other
half of the factory design, and `docs/SPEC.md` §4 promised one for a long
time before Phase 17d had to withdraw the claim.

**Why it's parked.** The shipped `batch` clause cannot become one. A credit
is stamped when cargo reaches the receiver (`rules/cycles.js#creditTribute`),
so a stockpile hauled up in one trip credits in one instant and the mechanism
never sees production at all — `docs/SPEC.md` §18.10 states this in full. Two
routes out, both real changes: stamp credits at production or when cargo
boards a carrier, which needs a second write path and a decision about where
production is observed; or make the bill too large for one load, which needs
`n × massK` above `eff('burden')` — seventeen `copper/plate` on today's
numbers, triple cycle 4's cost.

---

## Meta-progression, inside one page session

**Idea.** `docs/DESIGN.md`'s run structure says a Torment ends "keeping only
stolen recipes and banked favour with individual gods". `model/run.js#meta`
is the reserved shape — `runs`, `bestDepth`, `godsMet` — and nothing writes
`godsMet` yet.

**Why it's parked, and what it can actually be.** `CLAUDE.md` forbids
`localStorage` and `sessionStorage`, because they fail in some embed
contexts. So "carries between runs" cannot mean what DESIGN implies. What is
constructible is banking **within one page session**. `resetMeta()` runs once
per page and `reset()` once per run (`shell/boot.js:65`), so `meta` already
survives a death; `write.retire` is the fold-the-run-in writer and **nothing
in `src/` calls it yet**. That is a real design question — what a
meta-currency buys, and whether a player who reloads should lose it — rather
than a missing function call.

**Sketch.** Decide the purchase first. `run.favour` is deliberately
run-scoped so the FAVOUR panel is a picture of *this* Torment; a banked
currency has to be a different field with a different name, or the panel
starts lying about which run it is describing.

---

## A source that reveals a recipe

**Idea.** `run.known` is seeded with every `HAND_RECIPES` id at run start
(`model/run.js:286`), so "keeping stolen recipes" has nothing to steal.

**Why it's good.** It is the other half of the meta-progression above, and
the cheaper half. The lock already exists and works: `isKnown`
(`model/run.js:764-770`) gates a machine-build recipe behind its grant, and
the CRAFTING tab draws an unknown recipe as a locked silhouette.

**Why it's parked.** What is missing is a *source* — a thing in the world
that teaches one. A god's gift, a cache in a hollow, or a tablet that has to
be carried up. Picking which one is a design decision about where knowledge
comes from in this myth, and it should be made with the Hades act in view,
since a recipe stolen from below is the obvious candidate.

---

## A third machine grant

**Idea.** `data/grants.js` ships two rows, `gift-talos` and `gift-maw`, so
the machine-grant tier offers two-of-two where every other tier offers
three.

**Why it's parked.** A third grant needs a third machine that does not
exist. Every machine in `data/machines.js` is already reachable — Phase 17b's
`tools/content.mjs` assertion 25 makes an unreachable one a build failure —
so there is nothing left to grant. Padding the tier to three is not a reason
to invent a machine, and `rules/draft.js` already lays out fewer cards
honestly rather than repeating one.
