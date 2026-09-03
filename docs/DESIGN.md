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

Not flavour, a number. Transport cost per item-slot = `k × depth`, paid **at the
lifter rather than at the source**. Then fix compression ratios per tier:

| tier | ratio |
|---|---|
| raw ore | 1:1 |
| ingot | 4:1 |
| plate | 12:1 |
| essence | 60:1 |
| ambrosia | ~400:1 |

**REPRICED FROM FUEL TO PLAYER TIME (Phase 8f).** `k` was originally denominated
in *talents of fuel*, because the staged winch burned timber (or, in the trap
recipe, a heart) per haul. That winch is retired: segment transport
(`docs/SPEC.md` §17, `CLAUDE.md` D10) burns nothing at all and is powered only
by a hand crank the player has to stand at and hold. So `k` is now **seconds of
player cranking per item-slot per tile**, and the equation is otherwise
untouched.

That is a *stronger* statement of this section's own thesis, not a weaker one:
the one resource automation cannot give you more of is your own standing there,
and it cannot be stockpiled, boon-ed or bought. `tools/check.mjs`'s BREAK-EVEN
DEPTH section measures it against live numbers, with what an item-slot is worth
taken as the seconds it cost to mine its contents by hand. Measured at the
shipped tuning: raw ore breaks even at **0.62 tiles**, ingot at **2.40**, plate
at **6.90**. Read the first figure as the headline it is — raw ore does not pay
to crank up even *one* tile — which is this table holding, not a bug.

The compression ratios themselves are unchanged and are not up for retuning
here (`docs/SPEC.md` §8).

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

*Partially in the mockup:* the lift's speed asymmetry (`reference/mockup/`
only — the staged winch it describes is gone from `src/`, retired in Phase 8f
and replaced by player-driven segment transport, `docs/SPEC.md` §17) and the `perOut`
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

Tribute must escalate in **refinement, not volume**. Cycle 1: 10 raw copper,
no clock — `docs/SPEC.md` §4 and §18.4 lock the number, the form and the
absence of a deadline; this file used to say 20 plates against a per-cycle
deadline and was stale on all three counts. Cycle 6: three bottles of
ambrosia, each 400 raw units deep. Volume quotas push players wide;
refinement quotas push them down.

*Implemented as of Phase 10.* Four cycles ship (`data/cycles.js`,
`rules/cycles.js`), each armed, drained and resolved by a real director —
`docs/SPEC.md` §18 is the contract. Cycles 5 and 6 (the ambrosia end of this
progression) wait on the `essence`/`ambrosia` tiers above, which are still
not implemented.

*Implemented as of Phase 13d.* Paying all four cycles now **ends the run**
with a real win state and screen (`run.won`, `docs/SPEC.md` §20.2); it used to
return silently and let the game run out. Cycles 2–4 can only be paid at the
Cloud Dock, which can only stand in the astral band (§20.1) — so the ascent is
the progression rather than an optional flourish.

*Three promises in the two paragraphs above are NOT IMPLEMENTED*, and each is
named here rather than deleted, because the intent is still the design:

- **"the earth opens further (a new depth band unlocks)"** — there is **no band
  lock anywhere in this game**, and `model/run.js`'s own comment on
  `run.charted` says so in capitals: charting is *knowledge and not access*.
  A cycle's `charts` reward takes the `????????` mask off a band's **name** on
  the ruler (`view/ui/ruler.js#masked`) and nothing else. Nothing stops a
  player digging into topsoil on minute three, and "depth band = act" is
  therefore a statement about pacing, not about a gate that exists.
- **"you draft a boon"** — the *tier* is real and all four ship
  (`CLAUDE.md` D1), but the **draft is 1-of-1, not a choice**:
  `shell/main.js` takes `draftable()[0]` and grants it outright, with no
  offer and no pause, and three of the four tiers ship exactly one content
  row. See `docs/SPEC.md` §18.6.
- **"keeping only stolen recipes and banked favour with individual gods"** —
  there is **no meta-progression and no save**. `meta` has three fields and no
  serialiser (`model/run.js`), `run.favour` is deliberately run-scoped so the
  FAVOUR panel is a picture of *this* Torment, and `run.known` is seeded with
  every hand recipe at run start because no source exists that reveals one —
  so nothing is stolen and nothing is banked. `CLAUDE.md` also forbids
  `localStorage`, so a save is a real design question and not a missing
  function call.

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

## God gifts — four tiers, and the word for each

This section used to call every drafted tier a "boon" and treat trinkets as a
subtype of boon. It no longer does, because "boon" is now the name of a
specific, *timed* thing. The vocabulary below is binding on the code; see
`CLAUDE.md` §"Resolved decisions" D1 for the file-by-file mapping, and
`docs/BUILD_PLAN.md` Phase 4 for the migration.

| term | lifetime | source | surfaced as |
|---|---|---|---|
| **Boon** | timed, N seconds | god grant, altar use, miracle side-effect | top-right timer stack |
| **Trinket** | whole run, while equipped | drop, tribute reward, cycle draft | equipment slots, Character tab |
| **Miracle** | one shot | draft | a consumable you carry |
| **Machine grant** | whole run, permanent | cycle reward | a new row in the BUILD list |

Three of the four are the old list under sharper names: **Trinkets** are still
passive modifiers, **Machines** are still new production verbs (renamed *machine
grant*, since a machine is granted rather than owned), and **Miracles** are
still one-shot terrain edits — calcify a lava flow, collapse a lake, petrify a
nest. What is new is **Boons**: a timed effect that happens *to* you and counts
down in the corner of the screen. Nothing in that stack is clickable. A boon is
not a resource you spend; it is weather. That is the Prometheus of it.

A draft is still 1-of-3 after each cycle, and may now mix tiers — a timer, a
trinket and a machine offered against each other is a real decision in a way
three trinkets is not.

The rule that makes it interesting: **gifts from different gods are mutually
hostile.** Poseidon's aquifer tap floods the strata Hephaestus's kilns need
dry. Dionysus's vats want the exact temperature band your smelters ruin. Two
hostile gifts must not silently co-exist, so a row carries `conflictsWith`: the
later gift either suppresses or *inverts* the earlier one, and the HUD says
which. And some gifts are traps. The original example was a *lifter that runs on blood
instead of fuel*, offered on cycle 3 when you are desperate — and it was built,
as the staged winch's second recipe. It is **gone**, deliberately and by the
designer's own instruction, with the winch itself in Phase 8f
(`docs/PLAN-gears-and-winches.md` A5): the hand crank is manual only, and there
is no passive or heart-powered power source of any kind. The *tier* is
unaffected and the trap idea is not withdrawn — `data/sources.js` still carries
the mechanism a non-item input would use — but the blood winch specifically is
not the shape it will take. Prometheus's whole story is that divine gifts come
with terms; nothing about that needed a lift stage.

*All four tiers exist and reach numbers/the world through the one stat
pipeline and the tile grid, per `docs/BUILD_PLAN.md` Phase 4.* The
machine-grant tier is real and works end to end — `data/grants.js` /
`rules/grants.js` (renamed from the old, misnamed `boons.js` in Phase 4 step
1) — writing `run.granted`, which `rules/placement.js` refuses anything
absent from. The trinket tier is real and requires BOTH holding and
equipping: `run.equipped` is a fixed-length selection over `run.inv`
(`eff('trinketSlots')` slots), and `rules/trinkets.js#step` clears a slot the
pockets no longer back in the same pass it syncs `model/mods.js`, so the two
can never disagree. Timed boons are real: `data/boons.js` ships four (plus
one miracle side-effect), decremented in the fixed step and synced into
`model/mods.js` keyed `'boon:'+id` so the tiers can never remove each other's
rows; `conflictsWith` resolves both ways content can name — SUPPRESS (the
Poseidon/Hephaestus pair `docs/DESIGN.md` names above) and INVERT (a second,
shipped pair doubling as the one trap: Ares' frenzy reads as a flat buff but
inverts Athena's focus if both run at once, netting WORSE than no boon at
all). Miracles are real: `data/miracles.js` ships one, a held phial that
collapses a radius of terrain to air and grants a side-effect boon. The HUD's
top-right timer stack (`view/hud.js`) shows active boons only, newest first,
draining and flashing in the last five seconds, derived from `clock.t` and
never `rand()`. *Built since Phase 10:* the 1-of-3 draft itself now has a
director deciding WHEN a god offers something — `rules/cycles.js`, arming,
draining and resolving four tribute cycles (`docs/SPEC.md` §18) and writing
the tier into `run.offer` on completion for `shell/main.js` to perform. The
Character tab's equip UI is drag-to-equip for real, not only the model-driven
`p` key. And tribute completion is a real event: `data/drops.js`'s
tribute-triggered row (`tribute-bellows`, `chance:1`) is rolled by
`rules/cycles.js#rollTributeDrop` on every cycle completion, so the first
trial paid always hands over the bellows trinket.

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

Two columns, because they are two different artefacts: `reference/mockup/` is
the non-interactive pixel-art mockup (preserved as the art target, not
developed), and **prototype** is the playable build in `src/`. Where prototype
says *planned*, `docs/BUILD_PLAN.md` names the phase.

| | mockup | prototype |
|---|---|---|
| vertical strata, carved drifts and shafts | yes | yes (three bands, `data/world.js`) |
| destructible terrain, player movement, fall damage | no | yes |
| gravity-fed material flow, piles, backpressure | yes | yes |
| refinement ratios | yes (`perOut`) | yes (`smelt` 4:1, `press` 12:1) |
| hand-craft matching the machine's own rate | no | yes (`rules/crafting.js`) |
| staged lift as the bottleneck | yes | yes, and rebuilt: **player-driven segment transport** (`hub` / `crank` / `gear` / `axle` machines, runtime segments in `model/segments.js`, motion in `rules/drive.js` — Phase 8d–8f). The one-stage `lift` machine it replaced is deleted. A carrier rises only while a crank is being held and slides back down for nothing, and a rider is real load that can reverse it |
| belts, priced to be rare | no | yes (`belt_r` / `belt_l`) |
| fog of war, permanent, plus a map overview | no | yes (`rules/reveal.js`, `view/overview.js`, `view/ui/ruler.js` — Phase 9 extracted the overview from the old monolithic `drawMap`) |
| mining rigs, breakout, haulage | yes | yes (`talos_head` / `cyclops_maw`, `rules/machines.js`'s `mine` recipes — Phase 2c) |
| tiered picks gating hard strata | no | yes (`item.tool:{tier,power}`, `tile.tier`, `model/run.js#bestTool()` — Phase 2c) |
| real darkness and carried/placed light | no | yes (`rules/light.js`, carried `timber/brand`, placed brazier/hearth — Phase 2b) |
| encumbrance in talents gating ascent | no | yes (`model/run.js#burdenOf`/`burdenFrac`, climb falloff and lockout in `rules/player.js` — Phase 2a) |
| ladders as a crafted, tiered item | no | yes (`timber/rung` cheap tier 1, `copper/stair` fast tier 2 with `climbK` — Phase 2a) |
| machines built from a real material bill | no | yes (every `STARTING_MACHINES` row has a real `cost`; `docs/SPEC.md` section 13 — Phase 3) |
| machine-grant tier of god gifts | cosmetic | yes (`run.granted`; `data/grants.js`/`rules/grants.js`, renamed from the misnamed `boons.js` — Phase 4) |
| trinket tier, reaching numbers through one pipeline | cosmetic | yes (`model/mods.js`); equip slots real (`run.equipped`, `eff('trinketSlots')` — Phase 4); drag-to-equip real too (`shell/main.js`'s drag/drop resolve, `:445-500`ish); the `p` key (`shell/input.js:129-132`) is now a redundant alternative, not the only path |
| timed boons with a countdown | no | yes (`data/boons.js`, `model/boons.js`, `rules/boons.js`, the HUD's top-right timer stack — Phase 4) |
| miracles, `conflictsWith` hostile gods | cosmetic | yes (`data/miracles.js`, one row; `conflictsWith` both `suppress` and `invert` shipped and proven — Phase 4) |
| dense in-canvas inventory / crafting GUI | no | yes: a grid (`view/ui/grid.js`), a FIFO craft queue (`shell/ui.js#ui.craftQueue`, drawn in `view/ui/mainPanel.js`) and three tabs — CHARACTER / CRAFTING / LOGISTICS (`view/ui/tabs.js`, `mainPanel.js`) — Phase 5 |
| spoil dumped to lava for free | yes | no |
| suspicion meter, Hades gated by depth | cosmetic | still no, but the masked-id predicate it needs now exists and is in use (`view/ui/ruler.js#masked`/`bandKnown`, built for the FAVOUR/ruler panels) — Hades reading as `????????` is one predicate call away, not a new mechanism |
| tribute cycles, boon drafting, favour | cosmetic | yes — `data/cycles.js` + `rules/cycles.js`, four cycles, each arming, draining, ticking and resolving for real; a draft is offered on completion (Phase 10) |
| buoyant heat, bottom-up flooding | no | seam only: `rules/fields.js` decays, does not diffuse |
| monsters, aggro from emissions, ichor economy | no | no |
| run loop, death, meta-progression | no | partial: death and `newRun()` are real; `META_SCHEMA.godsMet` is reserved and reset every meta-reset, but nothing in `src/` writes to it yet (the FAVOUR panel deliberately reads `run.favour`, not `meta`, for exactly this reason); `meta` has no save regardless |
