# The brief that produced segment transport (CLAUDE.md D10)

Verbatim user messages, salvaged from `docs/PLAN-gears-and-winches.md` §1
when that section was trimmed to a pointer. The staged winch was rejected
outright ("nothing like what i wanted"). The reference image was a
continuous bucket chain running between two large gears — one at a shaft
floor, one at the surface — a separate counterweighted pulley bucket, and a
ladder alongside for climbing by hand.

1. **Replace the current winch entirely.** Not an additional tier.
2. **Segments, not one cage, and not five fixed vertical stages.** *"you can
   link but there are LIMITS (maybe expandable) about how long lift segments
   can be. note that they don't purely have to be straight up either (though
   the space for them must be clear) in theory you can just pick two
   endpoints (that are within a certain radius) and then join them with a
   cable (can be automatic) is my vision."*
3. **Unpowered by default, weighted to descend.** *"there should also be a
   handle where the player can 'manually' winch material up (the player can
   i guess ride the pulley if they wish but it will be weighted right, so if
   they get on a platform it will want to go down!)"* and *"They should be
   unpowered (only either by player winch OR by generator (implement that
   later)."*
4. **Power, in implementation order:** (a) NOW — a manual crank the player
   holds: *"Active — player must hold/turn it to generate power... matches
   hold-to-mine/hold-to-craft. Manual labor has a real time cost."* (b)
   LATER, out of scope — generators, then (much later, flagged only)
   electricity. *"for all motion like this to be a form of gears and pulleys
   initially connected to a manual winch that the player has to turn to
   drive belts and vertical elevator/mine shafty type bucket things upwards
   (they can connect with gears multiple systems together) and then
   eventually generators can drive the shafts. Feels a bit more greco roman
   than electricity."*
5. **Gears connect multiple systems.** *"Spatial — gears are real, placed,
   physically connected... Power only flows through adjacent/connected gear
   and shaft tiles you actually place."*
6. **Visual iteration is part of the work, not after it.** *"I think you
   will need to iterate visually on this so you will need to add many
   playwright tests for how they look."*
7. **CORRECTION received mid-plan, and it is load-bearing:** *"don't bar the
   player from riding the lift! but they are heavy so they will probably
   weight it down either slowing the lift down or causing it to run in
   reverse! ... lift should be physicy!"* This superseded the obvious port of
   the old over-cap boarding refusal and, with it, one clause of CLAUDE.md
   D4 — landed as the D4 amendment (§3.3 in the plan) and the "boarding is
   never refused" rule `docs/TRANSPORT.md` states.
