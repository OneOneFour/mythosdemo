/* LAYER data — CYCLES: what the gods ask for, in order. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   A CYCLE IS ONE TRIAL: a god, a place to pay, a bill of concrete pairs, a
   clock, a reward and a punishment. `rules/cycles.js` arms row `run.cycle - 1`
   and never looks at any other row, so "which trial am I on" is one integer on
   `run` and this table is read-only content. docs/SPEC.md section 18 is the
   contract; docs/DESIGN.md's "Run structure" is the reasoning.

     id            stable string, and the key `run.tribute.id` stores.
     god           who is asking. The same god-id namespace `data/boons.js`,
                   `data/grants.js`, `data/trinkets.js` and `data/miracles.js`
                   already use -- one vocabulary, four tiers, no map.
     at            THE MACHINE ID of the receiver that satisfies this cycle --
                   `'altar'` or `'cloud_dock'` today. A machine id and not a
                   nickname, and `tools/content.mjs` assertion 19 checks the row
                   it names really carries `tribute:{}`: a cycle pointing at the
                   furnace would be unpayable for ever and nothing would throw.
                   Cycle 1 is the altar and every later cycle is the dock, which is how
                   docs/SPEC.md section 4's "cycle 1 is unmoved at the surface"
                   is expressed as DATA rather than as a branch in the director.
     demand        [{ sub, form, n }], CONCRETE PAIRS and never selectors. Two
                   readers need them concrete: a panel has to name the row
                   exactly, and `model/items.js#massOfPair` has to price it.
                   Validated two ways in `tools/content.mjs` assertion 19 --
                   `holdable(sub, form)` proves the pair can exist at all, and
                   `expand(sub/form)` proves the selector is non-empty, which is
                   the check `data/forms.js#expand` exists for.
     deadlineSecs  seconds, or `null` for NO CLOCK. `null` is a real branch and
                   not a large number: cycle 1 has no clock (docs/SPEC.md
                   section 4), so it can never be missed, and a panel must draw
                   no timer for it rather than a zero.
     reward        { favour, grants?, charts?, draft? } -- see below.
     punishment    { hearts?, favour? }. Absent entirely on a cycle that cannot
                   be missed.

   REWARD KEYS, and each one is a different tier of the same promise:
     favour   integer added to `run.favour[god]`. Always present: a trial
              always changes how the asking god feels about you, and the
              FAVOUR panel is a picture of this run (CLAUDE.md D1, decision I).
     grants   machine ids appended to `run.granted`, i.e. docs/DESIGN.md's
              MACHINE tier paid out directly rather than drafted.
     charts   band ids appended to `run.charted`. KNOWLEDGE, NOT ACCESS
              (docs/PLAN-phase10.md 3.4): there is no band lock in this game
              and this does not invent one. It takes the `????????` off a
              band's name on the ruler.
     draft    'grant' | 'boon' | 'trinket' | 'miracle' -- a tier to be offered
              1-of-3 from. The director writes the offer into `run` and
              `shell/main.js` performs it, because `draftable()` lives in four
              `rules` siblings a `rules` module may not import.

   ============================================================================
   WHY THESE FOUR ROWS AND NOT SIX. docs/DESIGN.md runs the progression to a
   sixth cycle asking for three bottles of ambrosia; docs/SPEC.md section 8
   marks the `essence` (60:1) and `ambrosia` (~400:1) tiers NOT IMPLEMENTED. A
   cycle demanding a substance nothing can make is precisely the orphan
   `tools/content.mjs`'s reachability fixpoint exists to catch, and it would
   catch it. Cycles 5 and 6 arrive with those tiers.

   ESCALATION IS IN REFINEMENT, NOT VOLUME. Cycle 2 wants three PLATE, which is
   36 ore against cycle 1's 10 -- a 3.6x jump in mining that reads as a
   three-unit ask, which is the whole point of pricing a demand in compression
   (docs/DESIGN.md). Cycle 3 forces DEPTH (`tin` starts at topsoil row 60,
   `data/world.js`). Cycle 4 forces the TIER GATE (`granite` is `tile.tier 2`,
   so a stock pick cannot break it -- docs/SPEC.md section 12 -- and the auger
   becomes necessary).

   HADES NEVER ASKS. The asker set is {hephaestus, athena, poseidon}. `ares` is
   the shipped trap god (docs/SPEC.md section 14) and stays out of the asking;
   `hades` is protected by docs/DESIGN.md's Hades act, where his being the FIRST
   GOD TO ADDRESS THE PLAYER IN PERSON is the whole reveal. A minor god takes
   cargo off an altar and says nothing. This table must not spend that.
   ============================================================================ */

export const CYCLES = [

  /* ---- 1. THE FIRST TRIAL, unmoved and unclocked (docs/SPEC.md section 4 and
     section 5's beats 5-6). Ten RAW copper on the surface altar, which is a
     five-tile dig from the guaranteed spawn vein -- the beat sheet's own
     promise -- and no clock at all, because the only thing this trial teaches
     is that the gods ask and the player answers.

     IT PAYS FOR THE NEXT TRIAL. The furnace is cycle 1's reward, which is what
     docs/SPEC.md section 4 has always said and what `data/grants.js` was
     quietly contradicting by putting it in `STARTING_MACHINES`; the dock comes
     with it, because cycle 2 asks for a delivery to a dock and a reward that
     does not make the next ask possible is a reward in name only.

     CHARTS ASTRAL, and that is the answer to "give the player a reason to look
     up". Before this the top of the ruler reads `????????` and always will,
     because no player enters astral early. Completing the first trial names it
     -- at exactly the moment the game has finished teaching that up is
     expensive. ---- */
  { id:'first-trial', god:'hephaestus', at:'altar',
    demand:[ { sub:'copper', form:'ore', n:10 } ],
    deadlineSecs:null,
    reward:{ favour:1, grants:['furnace', 'cloud_dock'], charts:['astral'] } },

  /* ---- 2. THE FIRST DELIVERY. Three copper PLATE at the dock: 36 ore and 12
     fuel through two compression steps, up a three-segment chain the player has
     to build first.

     480 s IS GENEROUS ON PURPOSE and is the number most likely to be wrong.
     This is the cycle in which the whole ascent gets built --
     docs/PLAN-phase10.md 4.5 prices it at ~42 s of crafting alone, 108 ore, and
     some thirty tiles of climbing scaffold. Tune it against a real
     playthrough, not against this comment.

     CHARTS TOPSOIL, and the honest note is that this is nearly a no-op today:
     any player who has dug at all has already entered topsoil, so `bandKnown`
     is already true for it. The charting reward is a HOOK whose payoff arrives
     with more bands. Said here rather than pretended otherwise. ---- */
  { id:'first-delivery', god:'hephaestus', at:'cloud_dock',
    demand:[ { sub:'copper', form:'plate', n:3 } ],
    deadlineSecs:480,
    reward:{ favour:2, charts:['topsoil'], draft:'grant' },
    punishment:{ hearts:1, favour:-1 } },

  /* ---- 3. ATHENA, AND DEPTH. Tin does not exist above topsoil row 60
     (`data/world.js`), so this trial cannot be paid out of the surface band at
     all: the factory has to reach down before it can reach up. ---- */
  { id:'grey-eyed-tithe', god:'athena', at:'cloud_dock',
    demand:[ { sub:'copper', form:'plate', n:6 },
             { sub:'tin',    form:'ingot', n:4 } ],
    deadlineSecs:420,
    reward:{ favour:2, draft:'boon' },
    punishment:{ hearts:2, favour:-1 } },

  /* ---- 4. POSEIDON, AND THE TIER GATE. `granite` is `tile.tier 2`, which a
     stock pick cannot break at any framerate (docs/SPEC.md section 12), so this
     trial is unpayable until the player has built the adamant auger. That is
     the gate the tool tiers exist for, asked for by name for the first time. ---- */
  { id:'salt-tribute', god:'poseidon', at:'cloud_dock',
    demand:[ { sub:'copper',  form:'plate',  n:8 },
             { sub:'granite', form:'gravel', n:8 } ],
    deadlineSecs:360,
    reward:{ favour:3, draft:'trinket' },
    punishment:{ hearts:2, favour:-1 } }
];

export const CYCLE = Object.freeze(Object.fromEntries(
  CYCLES.map(c => [c.id, Object.freeze(c)])));

/* Every god this table lets ask for anything, derived rather than listed, so a
   fifth cycle by a fourth god needs no edit anywhere. Read by the FAVOUR panel
   (Phase 10c) for which rows to draw at all, and by `tools/content.mjs`. */
export const ASKERS = Object.freeze([...new Set(CYCLES.map(c => c.god))]);
