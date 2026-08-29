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
