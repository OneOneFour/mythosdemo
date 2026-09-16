# The cycle director's decisions

Salvaged from `src/rules/cycles.js` when its per-branch essays were cut.

## Only the LIVE cycle's own receiver pays it

Draining every machine tagged `tribute:{}` into the live ledger regardless of
which one `cyc.at` names is tempting — nothing about a `sub/form` key says
which building it arrived at — and is wrong about the GAME even though it is
fine about the key.

With the altar standing four tiles from spawn for the whole run and accepting
the same three material classes the dock does, that version made cycles 2, 3
and 4 all payable by hand-feeding the altar. No ascent, no dock, no drivetrain,
no climb. The one thing the second half of this game is about was optional, and
the only thing standing between a player and skipping it was not knowing they
could.

**Material fed to the WRONG receiver stays in that machine's buffer,
uncredited, rather than being refused at its port.** Refusing it would mean the
generic port interpreter asking what the live cycle is — director policy inside
the machine layer, and a second place that would have to agree with this one
about which receiver is live. It would also contradict the rule that a catch
box swallowing what falls into it is physics rather than permission. A
receiver's buffer is a ledger with a footprint, so the pile is visible, bounded
and drained in full the moment a cycle does name that machine. The altar after
cycle 1 is the honest cost: nothing later asks for it, so what is fed there
stays there.

## The altar's 4-tile gap: the reason changed, the gap stayed

Originally the proximity drain was real and unconditional from the frame the
altar was placed — reach 10 px, no key — so flush-against-spawn meant a player
who had taken zero steps was already standing in its reach with whatever they
were handed at run start. Found the hard way: the burden test and a
furnace-crafting scene both fed the player ore near spawn and had it silently
vanish into the altar.

That drain is now opt-in and off by default, so the hazard is a preference
rather than a fact of the world. The 4 tiles are kept anyway for two reasons
that stand on their own:

1. AUTO FEED is one click from being on, and the trap it re-creates is exactly
   as unfair with the click as without it. A gap costs nothing; discovering
   this again would cost the same day it cost the first time.
2. FRAMING. An altar standing in the player's own footprint is bad staging
   regardless of what it does or does not take. 4 tiles clears
   `handFeed.reach` plus the player's own width with room over, while staying
   a short deliberate walk — and that walk is the first thing the beat sheet
   asks for.

## The grace is not belt-and-braces

The altar waits for beat 4, because the sheet raises it once the player has
climbed back out of their own shaft. But cycle 1 has exactly one receiver and
nothing else can pay it, so a beat predicate that never fires would soft-lock
the first trial outright. `eff('altarGraceSecs')` places it anyway once `run.t`
passes — the same argument that leaves the one-tile auto-step ungated, because
the only way forward must never wait on a state that can fail to arrive.

Re-asked every step rather than once when the cycle armed, since neither the
beat nor the clock has usually reached the gate by then.

## A run is not WON while a reward is outstanding

`complete()` writes `run.offer` and bumps `run.cycle` in the same call, so on
the LAST trial the boundary is visible in a later substep of the very frame
that paid it — and `shell/main.js#applyIntents` returns on `run.won` above both
the offer's dispatch and its lay-out, so the final draft would be discarded on
whichever substep parity the framerate happened to give.

Deferring the win means it states "everything is resolved" rather than "the
counter moved", and it keeps the decision in the director instead of reordering
the shell's guards.

**It cannot hang.** A request is laid out or dropped the same frame by
`rules/draft.js#offer`, which clears the field outright when the tier has
nothing left. A laid-out offer always holds at least one card, and the only
verb that can end it — taking one — is always available, since Escape cannot
dismiss it and a reroll never removes a candidate.

## Past the last shipped row, the run is WON

This used to `return` and do nothing, for ever: the TRIBUTE panel simply
stopped drawing, FAVOUR kept reading full, and the game did not end so much as
run out. `run.cycle > CYCLES.length` was already the FACT; `rw.win()` is the
EVENT, set exactly once. The boundary is the shipped table's own length and
moves on its own when the table grows — there is no literal 4 anywhere.

## Two deliberate duplications, and where the line is

No `rules` sibling import, so two things that would otherwise come from one
place are duplicated, each naming its original:

- `rollTributeDrop` duplicates `rules/mining.js`'s trinket roll, filtered to
  `trigger:'tribute'`.
- `hurtFor` duplicates `rules/player.js#hurt`'s three lines — flash, hurt, and
  a death row if it proves fatal.

Two duplications is the point at which hoisting to a shared module would pay.
This file is the SECOND caller of each shape, so neither crosses that line yet.

## `batch` and not `rate`

A credit is stamped with `run.t` on ARRIVAL, which is why the clause is called
`batch`. The function runs when a receiver's buffer is drained, so a haul of
four plates is one credit of four at one instant however long it took to make
or to climb. That measures how tightly deliveries are bunched and cannot be
made to measure production.

The ledger is REBUILT per credit rather than pushed into, because `run.tribute`
is replaced whole and never patched in place. Hand-feeding is one unit per
substep, so that is one fresh array per unit, and `prunedCredits` caps the array
at `batch.n` entries so the copy stays short rather than growing with the run.

## The grant bridge, not `rw.grant`

The raw model writer appends a machine id to `run.granted` and pushes NOTHING,
so calling it directly would give cycle 1's reward — the furnace and the dock,
the single most important gift in the game — no toast, no sound and no line
anywhere. `rules/grants.js` is the only module that pushes a `'grant'` row and
is a sibling this file may not import, so the ids go onto `run.awarded` and
`rules/grants.js#step` performs them immediately after this module.
