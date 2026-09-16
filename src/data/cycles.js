/* LAYER data — CYCLES: what the gods ask for, in order. Frozen. Imports
   nothing.

   A CYCLE IS ONE TRIAL: a god, a place to pay, a bill of concrete pairs, a
   clock, a reward and a punishment. `rules/cycles.js` arms row
   `run.cycle - 1` and never looks at another, so "which trial am I on" is one
   integer on `run` and this table is read-only content.

   id            stable string, and the key `run.tribute.id` stores.
   god           who is asking, in the same god-id namespace every other gift
                 tier uses -- one vocabulary, four tiers, no map.
   at            THE MACHINE ID of the receiver that satisfies this cycle. A
                 machine id and not a nickname, and the content lint checks
                 the row it names really carries `tribute:{}` -- a cycle
                 pointing at the furnace would be unpayable for ever and
                 nothing would throw. Cycle 1 is the altar and every later
                 cycle the dock, which is how "cycle 1 is unmoved at the
                 surface" is expressed as DATA rather than a branch.
   demand        [{ sub, form, n }], CONCRETE PAIRS and never selectors: a
                 panel has to name the row exactly and `massOfPair` has to
                 price it. Validated two ways -- `holdable` proves the pair
                 can exist, `expand` proves the selector is non-empty.
   batch         OPTIONAL `{ sub, form, n, secs }`: deliver `n` of that pair
                 inside ANY window of `secs` SIMULATED seconds. A SECOND
                 clause on `tributeMet()` and never a replacement for
                 `demand`. It constrains the PATTERN of delivery and not the
                 speed of production, because a credit stamps on ARRIVAL.
   deadlineSecs  seconds, or `null` for NO CLOCK. `null` is a real branch and
                 not a large number: a panel must draw no timer rather than a
                 zero.
   reward        { favour, grants?, charts?, draft? }. `favour` is always
                 present. `charts` is KNOWLEDGE, NOT ACCESS -- it takes the
                 `????????` off a band's name. `draft` names a tier to offer
                 1-of-3 from, written into `run` for `shell` to perform.
   punishment    { hearts?, favour? }, absent on a cycle that cannot be missed.

   WHY FOUR ROWS AND NOT SIX: the `essence` and `ambrosia` tiers are not
   implemented, and a cycle demanding a substance nothing can make is exactly
   the orphan the content lint's reachability fixpoint would catch.

   ESCALATION IS IN REFINEMENT, NOT VOLUME. Cycle 2 wants three PLATE, which
   is 36 ore against cycle 1's 10 -- a 3.6x jump in mining that reads as a
   three-unit ask. Cycle 3 forces DEPTH, cycle 4 the TIER GATE.

   HADES NEVER ASKS. `ares` is the shipped trap god and stays out of the
   asking; `hades` being the FIRST GOD TO ADDRESS THE PLAYER IN PERSON is a
   reveal this table must not spend. */

export const CYCLES = [

  /* THE FIRST TRIAL, unmoved and unclocked. Ten RAW copper on the surface
     altar, a five-tile dig from the guaranteed spawn vein, and NO CLOCK --
     the only thing it teaches is that the gods ask and the player answers.

     IT PAYS FOR THE NEXT TRIAL: the furnace is cycle 1's reward and the dock
     comes with it, because cycle 2 asks for a delivery to a dock and a reward
     that does not make the next ask possible is a reward in name only. It
     also CHARTS ASTRAL, which is the reason to look up. */
  { id:'first-trial', god:'hephaestus', at:'altar',
    demand:[ { sub:'copper', form:'ore', n:10 } ],
    deadlineSecs:null,
    reward:{ favour:1, grants:['furnace', 'cloud_dock'], charts:['astral'] } },

  /* THE FIRST DELIVERY. Three copper PLATE at the dock: 36 ore and 12 fuel
     through two compression steps, up a chain the player must build first.

     480 s IS GENEROUS ON PURPOSE and is the number most likely to be wrong.
     This is the cycle in which the whole ascent gets built. Tune it against a
     real playthrough, not against this comment.

     CHARTS TOPSOIL, and the honest note is that this is nearly a no-op today:
     any player who has dug at all is already there. The charting reward is a
     HOOK whose payoff arrives with more bands. */
  { id:'first-delivery', god:'hephaestus', at:'cloud_dock',
    demand:[ { sub:'copper', form:'plate', n:3 } ],
    deadlineSecs:480,
    reward:{ favour:2, charts:['topsoil'], draft:'grant' },
    punishment:{ hearts:1, favour:-1 } },

  /* 3. ATHENA, AND DEPTH. Tin does not exist above topsoil row 60
     (`data/world.js`), so this trial cannot be paid out of the surface band at
     all: the factory has to reach down before it can reach up. */
  { id:'grey-eyed-tithe', god:'athena', at:'cloud_dock',
    demand:[ { sub:'copper', form:'plate', n:6 },
             { sub:'tin',    form:'ingot', n:4 } ],
    deadlineSecs:420,
    reward:{ favour:2, draft:'boon' },
    punishment:{ hearts:2, favour:-1 } },

  /* THE TIER GATE. `granite` is `tile.tier 2`, which a stock pick cannot break
     at any framerate, so this trial is unpayable until the auger is built.

     AND THE TABLE'S ONLY BATCH CLAUSE, on the plate half. Cycle 2 taught
     compression and cycle 3 taught depth, so a third plate demand teaches
     nothing alone; asking for four inside two minutes makes this cycle about
     how you SHIP. A credit stamps on ARRIVAL, so it forbids the dribble of
     one plate per trip. On these numbers it does not bite a player who hauls
     the whole bill in one climb -- eight plates weigh 19.2 T against a 30 T
     soft cap -- and making it bite would take triple this trial's cost. */
  { id:'salt-tribute', god:'poseidon', at:'cloud_dock',
    demand:[ { sub:'copper',  form:'plate',  n:8 },
             { sub:'granite', form:'gravel', n:8 } ],
    batch:{ sub:'copper', form:'plate', n:4, secs:120 },
    deadlineSecs:360,
    reward:{ favour:3, draft:'trinket' },
    punishment:{ hearts:2, favour:-1 } }
];

export const CYCLE = Object.freeze(Object.fromEntries(
  CYCLES.map(c => [c.id, Object.freeze(c)])));

/* Every god this table lets ask for anything, derived rather than listed, so a
   fifth cycle by a fourth god needs no edit anywhere. Read by the FAVOUR panel
   for which rows to draw at all, and by `tools/content.mjs`. */
export const ASKERS = Object.freeze([...new Set(CYCLES.map(c => c.god))]);
