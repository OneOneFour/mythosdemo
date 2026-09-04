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

## Mechanical power for belts, as an alternative to burner fuel

**Idea.** Belts (`rules/belts.js`) currently run on the same burner/charge
mechanism as the lift: feed a machine fuel, it banks a charge, the charge gets
spent moving material. A discussed alternative is MECHANICAL power instead of
combustion — a waterwheel or drop-weight driven by material already falling
through the factory (a waterfall, a chute of ore under gravity), possibly
sharing a gear-train with the lift's own winch drum, so building more belts
competes with the lift for the same mechanical budget rather than each having
an independent fuel bill. A manual hand-crank is the degenerate case of the
same idea — the player's own effort standing in for a mechanism, the way
`rules/crafting.js` already lets hands stand in for a machine.

**Why it's parked.** All three (falling-object power, a lift/belt gear-split,
hand-cranking) are a real transport/allocation mechanism — power has to be
generated somewhere, carried somewhere, and split between competing draws —
and `model/fields.js` documents diffusion as a deliberately unbuilt seam for
exactly this reason: a spatial power field needs real infrastructure this
project does not have yet. The burner/charge model was chosen for this phase
specifically because it needed none of that: a charge is a number on a machine
record, banked and spent by the exact same generic recipe path a furnace
already uses.

**Not to be confused with:** a separate, previously-discussed "blood winch"
idea where a player SACRIFICES HP to instantly TELEPORT resources rather than
moving them physically — a teleport-for-blood mechanic with no belt or lift
involved at all. That is distinct from the heart-fuel-for-lift-charge trade
`data/machines.js`'s `lift` row already implements today (the winch's second
recipe, `{ in:{heart:1}, from:'vital' }`, spends hearts for an ordinary lift
charge once timber runs out) — the existing mechanic already goes by "blood
winch" in `docs/DESIGN.md`'s prose, and a future teleport-on-blood idea would
need a different name to avoid the two getting conflated.

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
as a physical item toward its own output side. Raised while fixing the
hand-craft direct-inventory bug (`src/rules/crafting.js`), 2026-09-03 — the
user's stated preference is hand-craft output goes straight to the player's
inventory, but machine output should stay machine-side until something
(this grabber) moves it, rather than becoming a player pickup.
