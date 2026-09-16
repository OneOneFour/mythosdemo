/* LAYER data — TUNABLES: the frozen DESIGN. Base values only. Never written.

   IMPORT RULE, ENFORCED: only `model/mods.js` may import this file.
   `tools/layers.mjs` fails the build on any other importer. Why, and what
   `eff()` does with these rows: docs/DEVELOPER_GUIDE.md#the-tunable-pipeline

   Two kinds of row, and the difference is only what `base` means:

     kind:'value'  the number itself. `eff('walk')` is 60, or 69 with sandals.
     kind:'scale'  a multiplier on a literal that lives on a data row, because
                   there are as many of those as there are rows. Hardness lives
                   on the substance and recipe time lives on the machine; this
                   table holds the 1.0 a trinket bends. `scope` names what may
                   follow a dot: `hard.stone`, `rate.furnace`.

     scoped        PER-SCOPE BASE OVERRIDES for a scale row. This is how a
                   variant machine is faster purely by tuning:
                   `rate.kiln_divine` has base 2.0 while every other machine has
                   base 1.0, and a trinket still stacks multiplicatively on top
                   without either knowing the other exists.

   A trinket mod key that is not a row here -- or whose scope does not resolve to
   a real substance or machine id -- fails `tools/content.mjs`. */

export const TUNABLES = [

  /* the player. */
  { id:'walk',      kind:'value', base:60,   unit:'px/s',   note:'ground speed; 7.5 tiles/s' },
  { id:'hop',       kind:'value', base:92,   unit:'px/s',   note:'launch; ~1 tile + margin, deliberately not enough to escape a 5-tile hole' },
  /* A SIXTH OF WALK, NOT HALF OF IT, and the sentence that used to say "half
     walk, on purpose" described the old 30. Half walk measured as no tax at
     all: docs/PLAYTEST.md finding 1 climbed the whole world in 7.5 s against a
     480 s clock at every load a player carried, so ascent was free and the
     premise never fired. At 10 the same climb costs 22.4 s and the carrier
     chain the game is named around can beat it. This number is what makes up
     expensive for the PLAYER; `segUp` below is the same question for cargo. */
  { id:'climb',     kind:'value', base:10,   unit:'px/s',   note:'ladder speed. A sixth of walk, and the whole of what an unaided ascent costs.' },
  { id:'coyote',    kind:'value', base:0.09, unit:'s',      note:'grace after leaving the ground' },
  { id:'reach',     kind:'value', base:25.6, unit:'px',     note:'3.2 tiles from the player centre' },
  { id:'pickPower', kind:'value', base:1.0,  unit:'x',      note:'seconds of dig credited per second held' },
  { id:'pickupR',   kind:'value', base:10,   unit:'px',     note:'radius at which a resting item is pocketed' },

  /* THE DIG QUEUE'S ONLY NUMBER. A drag marks tiles
     and the player then mines the marked ones inside `reach` with no button
     held, so the cap answers two questions at once: it bounds the O(n) nearest
     query `rules/mining.js` runs once per substep, and it bounds "did I mean to
     paint the whole screen". 256 is a 16x16 block -- eight times the ~32 tiles
     `reach` covers at any one moment, so marking well past where you stand is
     the normal use and hitting the cap is not. */
  { id:'digQueueMax', kind:'value', base:256, unit:'tiles',  note:'marks the dig queue holds; a further mark is refused' },

  /* falling. The table is locked in docs/SPEC.md section 3:
            safe   =  5 tiles  ( 40 px) -> 160 px/s -> 0 hearts
            lethal = 20 tiles  (160 px) -> 320 px/s -> 5 hearts
          so one heart per 32 px/s above 160. */
  { id:'grav',      kind:'value', base:320,  unit:'px/s^2' },
  { id:'terminal',  kind:'value', base:400,  unit:'px/s' },
  { id:'fallSafe',  kind:'value', base:160,  unit:'px/s',   note:'5 tiles; no damage at or below' },
  { id:'fallHeart', kind:'value', base:32,   unit:'px/s',   note:'one heart per this much over fallSafe' },
  { id:'fallMax',   kind:'value', base:5,    unit:'hearts', note:'clamp; equals a full heart bar, so 20 tiles kills' },

  /* SEGMENT TRANSPORT. Eight rows, and the mechanic they price is
     invariant 4 as reworded: a carrier rises only while something is actively
     turning it and slides back down under its own weight for nothing.

     `rules/drive.js` is the only reader, and the motion expression they
     parameterise is one line with three cases:

       need    = segBase + segLoad * mass * slope
       surplus = supply - need                      (supply is the DRIVETRAIN
                                                     COMPONENT's own torque)
       drive   = min(1, supply / demand)            (demand = the component's
                                                     total `need`)
       surplus > 0 -> ascend at segUp * min(1, surplus / segBase) * drive
       surplus = 0 -> hold still
       surplus < 0 -> descend at segDown * min(1, -surplus / segBase) * slope

     Weighted descent is what that expression ALREADY produces at zero supply,
     which is why there is no separate "descend" number and no charge gate. The
     `* drive` factor on the ascent case is the ONE place the implementation
     departs from the plan's section 4.3, and `rules/drive.js`'s header argues
     it at length: it is what makes sharing one crank between two segments slow
     both rather than stop both.

     `segUp` AND `segDown` ARE THE SAME NUMBER, AND THAT IS THE RULE, NOT A
     COINCIDENCE. Nothing on a cable rises faster than it falls, so a fed
     drivetrain at most matches what gravity gives back for free. What makes up
     expensive is that it happens only while a player stands at a crank holding
     a key, and that is now the whole of the cost. `segUp` used to be 11
     because it was pinned to the retired winch deck's own ascent rate; that
     deck is gone, and docs/PLAYTEST.md finding 2 measured what the pin bought
     -- a three-segment chain moved cargo 14x slower than the player's own
     legs, so no rational player built one. A measurement of the shipped game
     outranks a constraint inherited from a deleted module.

     `segLoad` PUTS ONE CRANK'S STALL EXACTLY ON THE BURDEN CAP. At 0.0125 a
     vertical segment needs `1.0 + 0.0125 x 40 = 1.5` drive to lift 40 T, which
     is precisely `crank.torque` -- so one crank raises anything a player's
     pockets could hold and stops dead at the boundary, and a player riding
     with full pockets (48 T with their body) runs backwards. That stall has to
     stay reachable: a carrier strong enough that load stops mattering is the
     free ladder again, from the other side, and `tools/check.mjs`'s WEIGHT
     REVERSES IT probe fails outright if the burden cap ever climbs. */
  { id:'segUp',     kind:'value', base:26,    unit:'px/s',       note:'carrier ascent at full surplus and full drive. Equal to segDown by construction -- a carrier never rises faster than it sinks.' },
  { id:'segDown',   kind:'value', base:26,    unit:'px/s',       note:'free descent on a VERTICAL segment, scaled by slope. The ceiling segUp is held to, and free. Also the retired deck\'s own number.' },
  { id:'segBase',   kind:'value', base:1.0,   unit:'drive',      note:'drive needed to raise an EMPTY carrier at full speed. The unit crank.torque is denominated in.' },
  { id:'segLoad',   kind:'value', base:0.0125, unit:'drive/talent', note:'added drive per talent aboard, at full slope. 40 T -- the whole burden cap -- is exactly where one crank stalls.' },
  { id:'riderMass', kind:'value', base:8,     unit:'talents',    note:"the player's own body on a carrier, before their pockets. Boarding is never refused; this is the load that makes it physics instead." },

  /* Three scales, scope `machine`, so a better hub tier or a strength boon is
     one row here and no edit anywhere else. */
  { id:'segReach',   kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `hub.reach`. Where a range boon or a longer-reach hub tier goes. `segReach.hub` scopes it.' },
  { id:'crankTorque', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `crank.torque`. Where a strength boon goes.' },
  { id:'torqueLoss', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `gear.loss`. Lower is a tighter drivetrain.' },

  /* belts. Horizontal, not vertical, so neither "down is free" nor "up is
     expensive" applies directly -- the cost is paid up front, in `cost` on
     `data/machines.js`'s belt rows, and continuously, in the fuel that keeps
     `rules/belts.js` dragging at all. This number is deliberately closer to
     `walk` than to either carrier speed: a belt earns its keep by running
     unattended, not by outrunning the player. */
  { id:'beltSpeed', kind:'value', base:50,   unit:'px/s',   note:'drag speed while charged. See rules/belts.js.' },

  /* fields. Seam only: `rules/fields.js` decays and does not diffuse. */
  { id:'heatDecay', kind:'value', base:0.35, unit:'/s',     note:'fraction lost per second' },

  /* fog of war. `rules/reveal.js` runs two passes; only the second needs a
     number. Pass A (standing in open sky) is deliberately UNBOUNDED and reads
     nothing here -- there is nothing to obstruct a view across open air, so it
     has no radius to tune. Pass B (a flood through open tiles, blocked by
     solid rock) is what makes an underground cavern read as "somewhat, not
     all the way" visible, and this is its cap. 14 is a graph distance, not a
     straight line -- a corridor that switches back on itself burns distance
     fast -- and was picked as obviously more than the old radius-1 behaviour
     (a single tile's worth of neighbours) and obviously short of "reveal the
     whole cavern" for any room bigger than a small one. */
  { id:'sightRadius', kind:'value', base:14, unit:'tiles',
    note:'graph-distance cap on the Pass B flood in rules/reveal.js. Pass A has no cap.' },

  /* scales, one row per family of data rows */
  { id:'hard', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies `tile.hard`. Lower is faster to mine. `hard.stone` scopes it.' },

  /* See docs/DEVELOPER_GUIDE.md#variants-are-nearly-free -- `kiln_divine` is
     twice as fast because of this one line and nothing else. */
  { id:'rate', kind:'scale', base:1.0, scope:'machine',
    scoped:{ kiln_divine:2.0 },
    note:'multiplies machine progress. Higher is faster. `rate.furnace` scopes it.' },

  { id:'yield', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies output counts, rounded down. Where a "doubling" boon goes.' },

  /* encumbrance (CLAUDE.md "Resolved decisions" D3/D4). Mass is in
     TALENTS. `burden` is the hard cap; `burdenSoft` is the fraction of it
     where climb speed begins to fall off; `burdenClimbFloor` is the climb
     multiplier AT the hard cap, the tick before ladder-up/hop are refused
     outright. Walking on level ground and every downward movement are never
     scaled by any of these three -- enforced in rules/player.js.

     `burdenSoft` IS `riderMass / burden`, so the falloff starts the moment
     your pockets weigh as much as your own body does (8 T of 40). It was 0.75
     and docs/PLAYTEST.md finding 1 measured what that cost -- the knee sat at
     30 T while a cycle-2 tribute load is 7.2 T, so D4's whole curve was off
     the critical path and a full-height climb took 7.5 s at every load a
     player actually carried. The curve is linear from 1.0 at the knee to
     `burdenClimbFloor` at the cap, so it stays shallow near the knee and only
     bites past half a cap, and docs/FINDINGS.md's phase 6t entry records what
     a knee that bites earlier would cost. */
  { id:'burden',           kind:'value', base:40,   unit:'talents', note:'hard carry cap; a pickup or a climb over this is refused' },
  { id:'burdenSoft',       kind:'value', base:0.20, unit:'x',       note:'fraction of burden where climb-speed falloff starts; riderMass / burden' },
  { id:'burdenClimbFloor', kind:'value', base:0.40, unit:'x',       note:'climb-speed multiplier at the hard cap, the tick before lockout' },

  /* trinkets. See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */
  { id:'trinketSlots', kind:'value', base:3, unit:'slots', note:'length of run.equipped; a boon could someday widen it' },

  /* the draft. `offerSize` is
     how many of a tier's still-undrafted rows a god lays out; a tier with
     fewer left offers fewer, because `rules/draft.js` never pads.
     `rerollCost` is in FAVOUR and is spent with the god whose trial raised
     the offer. 2 against the running totals docs/SPEC.md section 18.4 pays
     out -- 3 at cycle 2's draft, 2 at cycle 3's, 3 at cycle 4's -- buys
     exactly one second look per trial and never two. */
  { id:'offerSize',  kind:'value', base:3, unit:'cards',  note:'cards in one draft offer; fewer candidates offer fewer' },
  { id:'rerollCost', kind:'value', base:2, unit:'favour', note:'favour spent with the asking god to re-pick the offer' },

  /* the altar's arrival. The director
     withholds cycle 1's altar until the player has climbed back out of their
     own shaft, and this is the deadline on that wait.

     80 S IS THE BEAT SHEET'S OWN 1:20. Section 5 raises the altar between 1:20
     and 1:40, so a player who never digs meets it at the earliest instant the
     sheet allows rather than at a time this row invented. A player who does
     dig has fired beat 4 well before then and never reaches this number at
     all. Read only by `rules/cycles.js`, against `run.t`, which is simulated
     seconds at the fixed 1/120 s substep. */
  { id:'altarGraceSecs', kind:'value', base:80, unit:'s',
    note:'the altar arrives this long into a run whatever the tutorial beat says; the beat sheet puts it at 1:20' },

  /* How long the arrival is still happening. `view/scene.js` measures
     `run.t - run.arrival.t` against this and draws nothing once it is past,
     so the presentation ends on simulated seconds rather than on frames.

     1.6 S IS TWO BEATS AT THE GAME'S OWN WALKING TEMPO. Long enough to look
     up at, short enough that a player already walking toward the altar
     arrives after it has settled -- `SPAWN_GAP`'s 4 tiles plus the altar's
     own 2 is 48 px, which `walk` above covers in 0.8 s, so the light is
     still on when they set off and gone before they can feed it. Read only
     by `view/scene.js`. */
  { id:'altarRiseSecs', kind:'value', base:1.6, unit:'s',
    note:'how long the altar takes to rise and its shaft of light to fade' },

  /* the HUD's one urgency threshold. Every
     countdown `view/hud.js` draws flashes under the same number of seconds:
     a boon's remaining time and the tribute deadline. 5 s is what the boon
     stack has always used, and it is about two beats of the 3 Hz flash --
     long enough to notice and short enough that it means now. Read only by
     `view/hud.js`, so a boon that widened it would widen both readouts at
     once, which is the point of it being one row. */
  { id:'urgentSecs', kind:'value', base:5, unit:'s', note:'seconds left at which a HUD countdown starts flashing' },

  /* inventory (Phase 12c, docs/PLAN-phase12.md D-G/D-H). `invSlots` is
     `run.mainSlots` at reset; `quickbarSlots` is the tail of `run.inv` past
     it -- the same "a slot count is content, read through eff()" precedent
     `trinketSlots` above already sets. */
  { id:'invSlots',      kind:'value', base:30, unit:'slots', note:'length of the main inventory grid; run.mainSlots at reset' },
  { id:'quickbarSlots', kind:'value', base:8,  unit:'slots', note:'length of the quickbar; the tail of run.inv past run.mainSlots' },

  /* light. `lightMax` is both daylight and the ceiling any
     emitter can reach (the hearth). The two falloffs are per-tile-of-travel
     losses a BFS in rules/light.js subtracts, rock lossier than air so
     light does not leak through strata the way sight already does not. */
  { id:'lightMax',         kind:'value', base:15, unit:'levels', note:'daylight level, and the ceiling any emitter can reach' },
  { id:'lightFalloffAir',  kind:'value', base:1,  unit:'levels', note:'lost per tile of open air the light BFS crosses' },
  { id:'lightFalloffRock', kind:'value', base:3,  unit:'levels', note:'lost per tile of solid rock the light BFS crosses' },
  { id:'brandSecs',        kind:'value', base:90, unit:'s',      note:'one lit timber/brand burns this long, then is consumed' },
  { id:'brandLevel',       kind:'value', base:9,  unit:'levels', note:'light level while a timber/brand is lit' },

  /* tool tiers. `hard` already scales a substance's
     seconds-to-break; this is a SEPARATE gate on whether a tool may swing at
     a tile at all, scoped the same way (`toolTier.copper` narrows to one
     substance) so a boon can lend a tier without touching mining speed. */
  { id:'toolTier', kind:'scale', base:1.0, scope:'substance',
    note:'bends tile.tier gating in rules/mining.js; a boon could lend a tier' },

  /* deposit depletion. Scales a
     `deposit` substance's `tile.charge`: how many units one native tile
     yields before it is gone. It does NOT touch `hard`, so it changes the
     SIZE of a find and never the rate of a swing -- which is why
     docs/SPEC.md section 8's compression table and docs/DESIGN.md's
     break-even depths survive it untouched. Scoped like `hard` and
     `toolTier` (`richness.copper` narrows to one element), rounded and floored
     at 1 by both readers, so no bend can make a tile yield nothing. */
  { id:'richness', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies a deposit substance tile.charge. A boon could enrich a vein.' },

  /* yield quality: not every unit a tile WOULD give actually drops.
     Base 1.0 -- a real ore (copper, tin) is unaffected, every unit lands.
     `soil`/`stone` are overridden low, the same "bulk" pair docs/SPEC.md
     section 19.1 already groups together as filler you tunnel through
     rather than a vein of anything -- most swings at them come up empty.
     `granite`/`adamant` are `deposit`-tagged named bodies, not this pair,
     and are left at the default. Rolled once per unit in `rules/mining.js`,
     ORE included (a roll against 1.0 always passes), so the position of
     every downstream `rand()` draw does not depend on which substance is
     being mined. */
  { id:'dropChance', kind:'scale', base:1.0, scope:'substance',
    scoped:{ soil:0.05, stone:0.10 },
    note:'chance a mined unit actually drops. `dropChance.soil` scopes it.' },

  /* worldgen. Only ONE number from
     that phase lives here, and the test is the one this file's header states:
     `hollowOre` is what a hollow is WORTH, so a god who wants to make the dark
     pay better bends it through `model/mods.js` like anything else. The
     relief, contact and ore-shape numbers are purely generative — no boon
     could sensibly move them mid-run, and worldgen has already run by the time
     a boon exists — so they are named consts in `rules/generate.js` or keys on
     a `data/world.js` strata row instead. */
  { id:'hollowOre', kind:'value', base:0.25, unit:'fraction',
    note:'chance a carved hollow has its walls lined with ore. Read once per hollow, at worldgen.' },

  /* tree regrowth (Phase 15, docs/PLAN-phase15-trees.md D15-E,
     docs/SPEC.md section 22). `log` is the only fuel a player can mine
     (`brand` exists too, but only ever made from a log; `data/world.js`'s
     own `trees` row says so), so a felled forest is a run that has quietly
     ended. These two numbers are the whole of the answer.

     `treeGrowSecs` IS 180 AND NOT 90, and 90 is the number it was measured
     against: `brandSecs` above is 90 and is this game's existing unit of "one
     long errand". A tree ought to cost more than one errand, and 180 s is
     three eighths of a cycle-2 deadline (`data/cycles.js#first-delivery`,
     `deadlineSecs` 480), 3/7 of cycle 3's 420 and half of cycle 4's 360 --
     so a seed planted in the first third of any trial still pays back inside
     that trial, and planting mid-trial is a real move rather than a
     decorative one. Read ONLY through `eff('treeGrowSecs')` in
     `rules/growth.js`, which accumulates the `dt` it is handed at the fixed
     1/120 s substep and never `Date.now()` (invariant 10; a timed transition
     is exactly the class of thing that silently breaks framerate
     independence, so `tools/check.mjs` section 8g asserts it at all 8
     framerates the hardness table sweeps).

     `seedYield` IS 2 AND IS NOT A `chance`. It is 2 because 2 is the
     smallest integer that compounds: at 1 a fell returns exactly the tree it
     took, so a grove can be sustained and never grown. At 2 the rule reads
     in one sentence -- fell one, plant two -- and the grove doubles every
     `treeGrowSecs` until the player's own hands are the limit. That limit is
     arithmetic: a tree is 3-5 tiles at `timber`'s `hard` 0.35 s each, so one
     fell-and-replant cycle costs about 6 s of attention, a grove of G trees
     needs 6G seconds per 180 s of growth, and it saturates around G = 30. A
     yield of 3 clears that ceiling in one generation and the surplus seeds
     just sit in the player's pockets. docs/SPEC.md section 22.1 holds the
     whole derivation.

     It stays a VALUE and not a `chance` because a regrowth mechanic that
     sometimes gives you nothing is a mechanic that sometimes silently ends
     the timber economy -- `log` is the only fuel a player can mine. If
     scarcity is ever wanted, the lever is the growth TIME above, not the
     drop odds, which is why there is no `seedChance` beside this.

     RAISING THIS CHANGES THE `rand()` STREAM. `rules/mining.js` spends two
     draws per seed on the toss, so a fell now consumes four where it
     consumed two, and a seed shared across the change does not replay past
     the first tree felled (invariant 7 requires only that `newRun(s)` twice
     match, and it does). */
  { id:'treeGrowSecs', kind:'value', base:180, unit:'s',
    note:'accumulated simulation seconds a planted timber/seed takes to become a tree' },
  { id:'seedYield',    kind:'value', base:2,   unit:'units',
    note:'seeds dropped when the LAST remaining trunk tile of a tree is felled' },

  { id:'tossUp',     kind:'value', base:50, unit:'px/s', note:'upward toss on a newly dropped item; drop verb only' },
  { id:'tossSpread', kind:'value', base:12, unit:'px/s', note:'horizontal scatter on the same drop' }
];

export const TUNE = Object.freeze(Object.fromEntries(
  TUNABLES.map(t => [t.id, Object.freeze(t)])));
