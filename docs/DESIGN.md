# Design notes

Decisions from the conversation that produced this mockup. Most of it is **not
implemented** — the mockup only visualises the parts marked below. This file
exists so the reasoning isn't lost.

---

## Premise

A 2D side-on vertical factory automation game with a Terraria-style
destructible world and roguelike structure. You are a Prometheus-like figure
forced to delve, refine, and ship luxury goods to demanding Sky Gods. Above:
the heavens. Below: the Abyss, then Hades, then Tartarus.

The genre statement: **downward movement is free, upward movement is
expensive.** Every other automation game has flat, cheap horizontal logistics.
Inverting that forces deep gravity-fed chains where only the most refined,
compact goods are worth lifting.

## The cost of ascension — the core equation

Not flavour, a number. Lift cost per item-slot = `k × depth`, with fuel burned
at the lifter rather than the source. Then fix compression ratios per tier:

| tier | ratio |
|---|---|
| raw ore | 1:1 |
| ingot | 4:1 |
| plate | 12:1 |
| essence | 60:1 |
| ambrosia | ~400:1 |

Every item now has a computable break-even depth. Around depth 30 raw ore
silently becomes net-negative to ship. You never tell the player this — the
fuel bill tells them. That one equation generates most of the factory design
pressure for free.

**Hands compete with machines on throughput; they lose on headcount.** A
player can always perform a machine's transformation by hand — smelt ore,
press plates — at the same rate the machine itself runs, because the reason
to build a furnace was never that a person cannot smelt copper. It is that a
person has exactly one pair of hands and can stand in exactly one place at a
time, while five furnaces run in five shafts at once, unattended, for as long
as they are fed. Get the balance wrong either direction and the automation
game stops being one: make hand-crafting slower or costlier than the
machine's own rate and it is punitive busywork nobody would rationally
choose, which is fine — except it means the game never actually teaches the
recipe before the player can afford the machine that runs it. Make it instant
or free and it becomes strictly *better* than the machine it duplicates, and
no one would ever place one — the exact bug this document opened by warning
against: anything that makes production cheap without the machine's
tradeoff (one body, one place) undermines the reason automation exists at
all. So a hand-craft is built to match the machine's `secs` and spend and
produce identically, and the only lever automation gets to pull is
parallelism: more machines than the player has hands, running in places the
player currently is not.

*Partially in the mockup:* the lift's speed asymmetry and the `perOut`
refinement ratios on stations. The fuel economics are not simulated.
Hand-crafting itself — matching a machine's rate rather than being instant or
throttled — is implemented; see `rules/crafting.js`.

## Run structure

Prometheus is already a roguelike frame: the eagle eats his liver, it grows
back, forever. Each run is one **Torment**. You dig, ship, are eventually
destroyed, and wake chained at a fresh cliff face keeping only stolen recipes
and banked favour with individual gods.

**Cycles.** Each cycle the gods post a tribute demand with a deadline. Meet it
→ the earth opens further (a new depth band unlocks) and you draft a boon. Miss
it → a punishment; two misses ends the run. Depth band = act, so the vertical
axis literally is the run progress bar.

Tribute must escalate in **refinement, not volume**. Cycle 1: 20 copper plates.
Cycle 6: three bottles of ambrosia, each 400 raw units deep. Volume quotas push
players wide; refinement quotas push them down.

*Not implemented.* The HUD shows a static cycle-4 tribute panel as decoration.

## Physics that generate difficulty for free

**Heat is buoyant.** Model heat as a field where hot cells push upward and
diffuse. Deep smelting then bakes your mid-level distillery, and coolant demand
grows as a function of how deep you have built. Items go down, heat comes up,
and the two fight over the same shafts. An emergent difficulty curve at no
content cost.

**Water fills from the bottom.** An aquifer breach floods upward, drowning your
deepest and most valuable works first while you watch it climb. Pumping it out
pays the same brutal upward tariff as everything else.

*Not implemented.* The mockup places cooling towers directly above the crucible
row to state the conflict compositionally, and has a static water table.

## God boons

Three tiers, drafted 1-of-3 after each cycle:

- **Trinkets** — passive modifiers
- **Machines** — new production verbs
- **Miracles** — one-shot terrain edits (calcify a lava flow, collapse a lake,
  petrify a nest)

The rule that makes it interesting: **boons from different gods are mutually
hostile.** Poseidon's aquifer tap floods the strata Hephaestus's kilns need
dry. Dionysus's vats want the exact temperature band your smelters ruin. And
some gifts are traps — a lifter that runs on blood instead of fuel, offered on
cycle 3 when you are desperate. Prometheus's whole story is that divine gifts
come with terms.

*Not implemented.* The HUD shows three static boon cards, one of them the
cursed blood winch.

## Monsters

Don't make them HP bags in a side-scroller; that isn't the game's strength.

- **Attracted to what the factory emits** — noise, heat plume, light. Aggro is
  self-inflicted and scales with production.
- **They attack logistics, not you.** Eat items off chutes, nest in disused
  shafts, sever pipes, ride your elevators up into the clean zone.
- **Ichor** is a fluid that only comes from monsters and is required for
  top-tier divine goods. You cannot finish the game without deliberately
  provoking things.

*Partially in the mockup:* blinking eyes in the Abyss, an ichor harvesting rig
with a spike barricade, and a still that never runs.

## Failure states

Flood, cave-in, thermal runaway, fuel death spiral, divine wrath. Four of the
five are your own factory killing you, which is the right feel.

## The Hades act

Going below eventually means meeting Hades, and it works because **he is the
one god you can afford.**

- **He is the anti-quota.** Zeus wants refinement — small, compressed, hauled
  up at ruinous cost. Hades wants *mass*: slag, tailings, spoil, bones, broken
  machinery. You deliver by opening a hole. Your waste stream, pure nuisance in
  every other factory game, becomes currency.
- **No deadlines.** Sky tribute is a timer; Hades contracts are volume
  thresholds with no clock, because he has forever and knows it. A completely
  different planning problem, and in character.
- **First contact is a negotiation, not a boss fight.** The sky gods shout
  demands from clouds you cannot reach and never address you directly. Hades
  walks up to you, underground, in person, and asks politely. That contrast
  does more characterisation than dialogue could.
- **He wants the luxuries too.** The third brother got the worst share in the
  draw and knows it. Nothing luxurious has ever come from below, so he has
  never had any — and now there is a factory in his ceiling. He pays better
  than Zeus, because for him your shipping cost is zero.
- **Below him: Tartarus.** Correct to myth — Hades' realm sits above it, so he
  is the landlord, not the floor. Down there are the Titans, chained by the
  same gods currently starving you over quotas. Prometheus is a Titan. The
  descent stops being "going to hell" and becomes going home to your imprisoned
  kin. That is the third act, the escape from the eternal loop, and the only
  reason to dig past the point where the ore stops improving.
- **Playing both sides is the endgame verb.** A hidden suspicion meter: Zeus
  eventually notices tonnage going the wrong direction. Concealment starts to
  matter — hidden downward chutes, cooked spoil ledgers, a plausible surface
  factory that looks compliant. This gives the fog of war a late-game purpose.
- **Meta-progression:** first contact is a permanent unlock. Once you have met
  him on any run, later runs can court him from cycle 1. The closest thing to
  unlocking a new character.

*Partially in the mockup:* the Gates of Hades band with a queue of shades and
the line "NO CARGO FEE", a suspicion meter that fills with depth, and Hades
masked as `????????` in the favour panel until you descend far enough.

---

## Implemented vs design-only, at a glance

| | mockup |
|---|---|
| vertical strata, carved drifts and shafts | yes |
| gravity-fed material flow, piles, backpressure | yes |
| refinement ratios (`perOut`) | yes |
| staged lift as the bottleneck | yes |
| mining rigs, breakout, haulage | yes |
| spoil dumped to lava for free | yes |
| suspicion meter, Hades gated by depth | cosmetic |
| tribute cycles, boon drafting, favour | cosmetic |
| buoyant heat, bottom-up flooding | no |
| monsters, aggro from emissions, ichor economy | no |
| destructible terrain, fog of war, player movement | no |
| run loop, death, meta-progression | no |
