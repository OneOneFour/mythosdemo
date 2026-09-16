# Why the rules run in the order they do

Salvaged from `src/shell/schedule.js`'s 230-line file header when it was
trimmed to one line per adjacent pair. `rules` modules may not import each
other, so `STEPS` in that file is the simulation — there is no other place a
step can hide, and reordering the game is reordering that array. Read this
before you reorder it.

The run clock is ticked first and is not a rule. `run.t` is a number, not a
decision, and no `rules` module may claim ownership of the frame.

## The adjacent pairs

**aim before player.** The reticle resolves against where the player is, so
the tile you were pointing at is the tile you dig.

**player before mining.** Moving first means reach is measured from this
frame's position, not the last one's. The dig queue rests on this twice over.
With no dig key held, `rules/mining.js` asks `model/digqueue.js` for the
nearest marked tile within `eff('reach')` of `playerCentre()`, so a player who
walks into range of a deferred mark starts breaking it on the frame they arrive
rather than one later. There is deliberately no separate queue step — choosing
a target and swinging at it are one decision, and a sibling module would need
`rules/mining.js#swing`, which siblings may not import.

**mining before light.** A tile broken this frame can open a new path for light
the same frame. A wall that just came down between the player and a lit
corridor should not wait a frame to brighten. `rules/light.js` reads tile
solidity, never mining state, so this is freshness rather than a data
dependency.

**light before reveal.** Fog of war's own flood (`rules/reveal.js#passB`) gates
past its first ring on `lightAt()`, so it has to read this frame's light field.
Otherwise a torch lighting a corridor and the corridor becoming visible would
be one frame apart for no reason a player could see.

**mining before items.** A tile broken this frame drops before anything falls,
so the drop gets a full step of gravity immediately.

**items before belts.** A belt drags what just landed, not what was resting a
whole frame stale. `rules/belts.js` re-indexes the item grid itself after it
moves anything, so nothing downstream — crafting, trinkets, machines — ever
sees a position `items` rebuilt the index for but a belt has since moved.

**belts before crafting.** Unrelated ledgers. A belt spends its own charge and
moves items on the ground; a hand-craft spends the player's pockets; neither
reads the other. Placed here rather than after `trinkets` so the two steps that
move physical things stay adjacent. An ingredient `items` just caught with the
pickup radius is already in `run.inv` by the time `crafting` runs, since
nothing in `belts` touches `run.inv`.

Consequence, recorded: holding the craft key through the exact frame an
ingredient lands counts that frame toward the bar. The cost is that a completed
craft's output item waits one extra frame for its first gravity step. Judged
the smaller loss — a player is likelier to feel a fresh pickup count toward a
craft in progress than to notice one frame of an item sitting nearly still.

**crafting before trinkets.** Spending or gaining pocket material this frame is
visible to the trinket sync the same frame. No hand-recipe makes a relic today,
but the ordering costs nothing to hold.

**trinkets before boons.** Unrelated ledgers again. The trinket sync reads
`run.equipped`/`run.inv`, the boon sync reads `model/boons.js#active`. Every
row either tier adds is keyed by its own `src` prefix — `'boon:'+id` against
the trinket's own id — so the two tiers can never remove each other's rows
regardless of which runs first. Adjacent so both modifier syncs sit together,
immediately before the one thing either can change this frame.

**items before machines.** An item that lands in a mouth is caught this frame.
The catch box is checked against fresh positions, and `items` rebuilt the
spatial index.

**boons before machines**, and **trinkets before machines.** A rate modifier
either tier just turned on applies to this same frame's recipe tick.

This is also why `belts`, three steps earlier, is still before `machines`. A
belt that dragged an item into a furnace's mouth this frame has to be caught by
that furnace's catch box this frame, or a belt-fed machine is a frame slower
than a hand-fed one for no reason a player could see.

**machines before drive.** A hub's buffered state settles before the drivetrain
is solved, so feeding a machine and turning a crank are one beat. `rules/drive.js`
has no charge or fuel of its own — the only power source is a crank the player
is holding this very frame.

The bigger reason `player` is far earlier: `rules/drive.js` translates a riding
player by the carrier's own delta with `pw.move`, which is only safe on a
position collision has already resolved. `player` moves and resolves, `drive`
then carries. Two writers of `player.y` in one frame, in a stated order, and
the reason the ride branch needs no collision model of its own.

**drive before cycles.** The drivetrain delivers a haul to the dock and
releases it; the director turns a delivery into a credit. Running the director
first would credit last frame's arrival and report a completion one frame after
the carrier reached the top.

**cycles before grants** — the grant bridge, and the tightest pair in the
array. `rules/cycles.js` decides that a completed trial awards a machine but
may not perform it, because `rules/grants.js` is a sibling and is the only
module that pushes a `'grant'` journal row. So the director writes machine ids
onto `run.awarded` and this step performs them. Immediately after, not later in
the frame and not in `shell/main.js#applyIntents`, so the BUILD list gains the
row and the toast fires in the same substep the trial was paid in. Nothing
between them could write `run.awarded`, because nothing else anywhere does.

**grants before tutorial.** No freshness argument, and stated rather than
implied. No beat predicate reads `run.granted` — beat 6 reads `run.cycle` — so
this pair could be either way round. It is here because the pair below carries
the argument, and inserting the bridge anywhere else would have put it between
`cycles` and `tutorial` and broken that adjacency instead.

**cycles before tutorial**, transitively true with `grants` between them.
`rules/tutorial.js` is a pure observer. Every beat condition is a read of state
another step wrote, and the only things it writes, `run.tutorialBeat` and a
`tutorial` journal row, are read by no other step. So it goes as late as it
can, where every fact of the frame has settled — the walking step `player`
recorded, the pick `items` just caught, the ore `mining` dropped and `items`
moved, the `run.deepest` `player` updated, the altar `cycles` placed and the
cycle `cycles` advanced. Judging a beat mid-frame would let a callout name
something the player has not finished doing.

**tutorial before growth.** Only so `fields last` stays literally true. No beat
reads a growing seed, a planted tile or `model/growth.js`, so this pair could
be either way round. `growth` sits at the tail because that is where the
frame's facts have settled and because `fields` must stay last.

It is deliberately not earlier, and that is the real decision. Putting `growth`
before `light` would let a tree that finished growing this frame cast its own
shade this frame instead of next — a freshness nobody can perceive on a
180-second timer — and would cost re-arguing four adjacent pairs. Putting it
before `mining` would be worse than useless: the seed drop lives in
`rules/mining.js`'s break branch, so a seed cannot exist before `mining` has
run, and a step that grows what has not been planted is one frame of latency
dressed up as precision.

**growth before fields.** `fields last` is a stated invariant of the file and
this pair keeps it literally true, the same job `tutorial before fields` did
before `growth` existed. Unrelated ledgers — `rules/growth.js` reads
`model/growth.js` and writes tile bytes, `rules/fields.js` reads and writes a
per-band scalar field, and neither imports the other's storage.

What this order costs, named: a trunk tile written by `growth` this frame is
not seen by `light`/`reveal` until the next frame, so a tree that just grew
fails to shadow anything for 1/120 of a second. One frame of latency on an
event 180 seconds in the making, and not worth reordering for. **Nothing may
be appended after `fields` without re-arguing this.**

**fields last.** Emissions made this frame decay from next frame, so a recipe
gate sees the heat that was just poured in.

## Two asides that were in the same header

`machines` takes `cmd` for exactly one field, `cmd.autoFeed`, the preference
deciding whether the proximity drain runs at all. `items` takes `cmd` for the
identical reason, `cmd.collect`, the pickup magnet's preference. A preference
is not a dependency on another step, so neither affects the order.

`boons`, `grants`, `miracles` and `trinkets` are re-exported from
`schedule.js` so `shell/boot.js` and `shell/main.js` have one import for the
rules they call outside the per-frame order. Granting, drafting and using a
miracle are events rather than steps, and putting them in `STEPS` would be a
lie about when they happen. `boons`, `trinkets` and `grants` each have both a
per-frame `step` and an event-time pair.
