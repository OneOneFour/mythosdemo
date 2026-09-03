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
   a real substance or machine id -- fails `tools/resolve.mjs`. */

export const TUNABLES = [

  /* ---- the player. Ported unchanged from the previous `sim/player.js`. ---- */
  { id:'walk',      kind:'value', base:60,   unit:'px/s',   note:'ground speed; 7.5 tiles/s' },
  { id:'hop',       kind:'value', base:92,   unit:'px/s',   note:'launch; ~1 tile + margin, deliberately not enough to escape a 5-tile hole' },
  { id:'climb',     kind:'value', base:30,   unit:'px/s',   note:'half walk, on purpose. Up is expensive.' },
  { id:'coyote',    kind:'value', base:0.09, unit:'s',      note:'grace after leaving the ground' },
  { id:'reach',     kind:'value', base:25.6, unit:'px',     note:'3.2 tiles from the player centre' },
  { id:'pickPower', kind:'value', base:1.0,  unit:'x',      note:'seconds of dig credited per second held' },
  { id:'pickupR',   kind:'value', base:10,   unit:'px',     note:'radius at which a resting item is pocketed' },

  /* ---- falling. The table is locked in docs/SPEC.md section 3:
            safe   =  5 tiles  ( 40 px) -> 160 px/s -> 0 hearts
            lethal = 20 tiles  (160 px) -> 320 px/s -> 5 hearts
          so one heart per 32 px/s above 160. ---- */
  { id:'grav',      kind:'value', base:320,  unit:'px/s^2' },
  { id:'terminal',  kind:'value', base:400,  unit:'px/s' },
  { id:'fallSafe',  kind:'value', base:160,  unit:'px/s',   note:'5 tiles; no damage at or below' },
  { id:'fallHeart', kind:'value', base:32,   unit:'px/s',   note:'one heart per this much over fallSafe' },
  { id:'fallMax',   kind:'value', base:5,    unit:'hearts', note:'clamp; equals a full heart bar, so 20 tiles kills' },

  /* ---- SEGMENT TRANSPORT (docs/PLAN-gears-and-winches.md section 4.7,
     docs/SPEC.md section 17). Eight rows, and the mechanic they price is
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

     THESE REPLACED `liftUp`/`liftDown`, which carried the same bases (11 and
     26) and were deleted with the staged winch in Phase 8f. Two live readers
     of one number is exactly the drift CLAUDE.md warns about, which is why
     they never coexisted for longer than the two phases it took. ---- */
  { id:'segUp',     kind:'value', base:11,    unit:'px/s',       note:'carrier ascent at full surplus and full drive. The retired winch deck ascended at this exact number: a carrier is not faster than what it replaces.' },
  { id:'segDown',   kind:'value', base:26,    unit:'px/s',       note:'free descent on a VERTICAL segment, scaled by slope. 2.4x ascent, and free. Also the retired deck\'s own number.' },
  { id:'segBase',   kind:'value', base:1.0,   unit:'drive',      note:'drive needed to raise an EMPTY carrier at full speed. The unit crank.torque is denominated in.' },
  { id:'segLoad',   kind:'value', base:0.025, unit:'drive/talent', note:'added drive per talent aboard, at full slope. 40 T -- the whole burden cap -- doubles the requirement.' },
  { id:'riderMass', kind:'value', base:8,     unit:'talents',    note:"the player's own body on a carrier, before their pockets. Boarding is never refused (D4 as amended); this is the load that makes it physics instead." },

  /* Three scales, scope `machine`, so a better hub tier or a strength boon is
     one row here and no edit anywhere else. */
  { id:'segReach',   kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `hub.reach`. Where a range boon or a longer-reach hub tier goes. `segReach.hub` scopes it.' },
  { id:'crankTorque', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `crank.torque`. Where a strength boon goes.' },
  { id:'torqueLoss', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `gear.loss`. Lower is a tighter drivetrain.' },

  /* ---- belts. Horizontal, not vertical, so neither "down is free" nor "up is
     expensive" applies directly -- the cost is paid up front, in `cost` on
     `data/machines.js`'s belt rows, and continuously, in the fuel that keeps
     `rules/belts.js` dragging at all. This number is deliberately closer to
     `walk` than to either carrier speed: a belt earns its keep by running
     unattended, not by outrunning the player. */
  { id:'beltSpeed', kind:'value', base:50,   unit:'px/s',   note:'drag speed while charged. See rules/belts.js.' },

  /* ---- fields. Seam only: `rules/fields.js` decays and does not diffuse. ---- */
  { id:'heatDecay', kind:'value', base:0.35, unit:'/s',     note:'fraction lost per second' },

  /* ---- fog of war. `rules/reveal.js` runs two passes; only the second needs a
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

  /* ---- scales, one row per family of data rows ---- */
  { id:'hard', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies `tile.hard`. Lower is faster to mine. `hard.stone` scopes it.' },

  /* See docs/DEVELOPER_GUIDE.md#variants-are-nearly-free -- `kiln_divine` is
     twice as fast because of this one line and nothing else. */
  { id:'rate', kind:'scale', base:1.0, scope:'machine',
    scoped:{ kiln_divine:2.0 },
    note:'multiplies machine progress. Higher is faster. `rate.furnace` scopes it.' },

  { id:'yield', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies output counts, rounded down. Where a "doubling" boon goes.' },

  /* ---- encumbrance (CLAUDE.md "Resolved decisions" D3/D4). Mass is in
     TALENTS. `burden` is the hard cap; `burdenSoft` is the fraction of it
     where climb speed begins to fall off; `burdenClimbFloor` is the climb
     multiplier AT the hard cap, the tick before ladder-up/hop are refused
     outright. Walking on level ground and every downward movement are never
     scaled by any of these three -- enforced in rules/player.js, Phase 2a. */
  { id:'burden',           kind:'value', base:40,   unit:'talents', note:'hard carry cap; a pickup or a climb over this is refused' },
  { id:'burdenSoft',       kind:'value', base:0.75, unit:'x',       note:'fraction of burden where climb-speed falloff starts' },
  { id:'burdenClimbFloor', kind:'value', base:0.40, unit:'x',       note:'climb-speed multiplier at the hard cap, the tick before lockout' },

  /* ---- trinkets. See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers ---- */
  { id:'trinketSlots', kind:'value', base:3, unit:'slots', note:'length of run.equipped; a boon could someday widen it' },

  /* ---- inventory (Phase 12c, docs/PLAN-phase12.md D-G/D-H). `invSlots` is
     `run.mainSlots` at reset; `quickbarSlots` is the tail of `run.inv` past
     it -- the same "a slot count is content, read through eff()" precedent
     `trinketSlots` above already sets. */
  { id:'invSlots',      kind:'value', base:30, unit:'slots', note:'length of the main inventory grid; run.mainSlots at reset' },
  { id:'quickbarSlots', kind:'value', base:10, unit:'slots', note:'length of the quickbar; the tail of run.inv past run.mainSlots' },

  /* ---- light (Phase 2b). `lightMax` is both daylight and the ceiling any
     emitter can reach (the hearth). The two falloffs are per-tile-of-travel
     losses a BFS in rules/light.js subtracts, rock lossier than air so
     light does not leak through strata the way sight already does not. */
  { id:'lightMax',         kind:'value', base:15, unit:'levels', note:'daylight level, and the ceiling any emitter can reach' },
  { id:'lightFalloffAir',  kind:'value', base:1,  unit:'levels', note:'lost per tile of open air the light BFS crosses' },
  { id:'lightFalloffRock', kind:'value', base:3,  unit:'levels', note:'lost per tile of solid rock the light BFS crosses' },
  { id:'brandSecs',        kind:'value', base:90, unit:'s',      note:'one lit timber/brand burns this long, then is consumed' },
  { id:'brandLevel',       kind:'value', base:9,  unit:'levels', note:'light level while a timber/brand is lit' },

  /* ---- tool tiers (Phase 2c). `hard` already scales a substance's
     seconds-to-break; this is a SEPARATE gate on whether a tool may swing at
     a tile at all, scoped the same way (`toolTier.copper` narrows to one
     substance) so a boon can lend a tier without touching mining speed. */
  { id:'toolTier', kind:'scale', base:1.0, scope:'substance',
    note:'bends tile.tier gating in rules/mining.js; a boon could lend a tier' },

  /* ---- deposit depletion (Phase 14b, docs/SPEC.md section 19). Scales a
     `deposit` substance's `tile.charge`: how many units one native tile
     yields before it is gone. It does NOT touch `hard`, so it changes the
     SIZE of a find and never the rate of a swing -- which is why
     docs/SPEC.md section 8's compression table and docs/DESIGN.md's
     break-even depths survive it untouched. Scoped like `hard` and
     `toolTier` (`richness.copper` narrows to one element), rounded and floored
     at 1 by both readers, so no bend can make a tile yield nothing. */
  { id:'richness', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies a deposit substance tile.charge. A boon could enrich a vein.' },

  /* ---- worldgen (Phase 7, docs/SPEC.md section 16). Only ONE number from
     that phase lives here, and the test is the one this file's header states:
     `hollowOre` is what a hollow is WORTH, so a god who wants to make the dark
     pay better bends it through `model/mods.js` like anything else. The
     relief, contact and ore-shape numbers are purely generative — no boon
     could sensibly move them mid-run, and worldgen has already run by the time
     a boon exists — so they are named consts in `rules/generate.js` or keys on
     a `data/world.js` strata row instead. */
  { id:'hollowOre', kind:'value', base:0.25, unit:'fraction',
    note:'chance a carved hollow has its walls lined with ore. Read once per hollow, at worldgen.' },

  /* ---- tree regrowth (Phase 15, docs/PLAN-phase15-trees.md D15-E,
     docs/SPEC.md section 22). `log` is the only fuel in the game
     (`data/world.js`'s own `trees` row says so), so a felled forest is a run
     that has quietly ended. These two numbers are the whole of the answer.

     `treeGrowSecs` IS 180 AND NOT 90, and 90 is the number it was measured
     against: `brandSecs` above is 90 and is this game's existing unit of "one
     long errand". A tree ought to cost more than one errand, and 180 s is
     about a quarter of a cycle-2 deadline (`deadlineSecs` 480). It is a
     guess and is marked as one -- it is one row, and the acceptance
     walkthrough in docs/PLAN-phase15-trees.md section 5 is the measurement.
     Read ONLY through `eff('treeGrowSecs')` in `rules/growth.js`, which
     accumulates the `dt` it is handed at the fixed 1/120 s substep and never
     `Date.now()` (invariant 10; a timed transition is exactly the class of
     thing that silently breaks framerate independence, so `tools/check.mjs`
     section 8g asserts it at all 8 framerates the hardness table sweeps).

     `seedYield` IS 1 AND IS NOT A `chance`. A regrowth mechanic that
     sometimes gives you nothing is a mechanic that sometimes silently ends
     the timber economy. If scarcity is ever wanted, the lever is the growth
     TIME above, not the drop odds -- which is why this is a value row and
     there is no `seedChance` beside it. */
  { id:'treeGrowSecs', kind:'value', base:180, unit:'s',
    note:'accumulated simulation seconds a planted timber/seed takes to become a tree' },
  { id:'seedYield',    kind:'value', base:1,   unit:'units',
    note:'seeds dropped when the LAST remaining trunk tile of a tree is felled' },

  { id:'tossUp',     kind:'value', base:50, unit:'px/s', note:'upward toss on a newly dropped item; drop verb only, see docs/FINDINGS.md' },
  { id:'tossSpread', kind:'value', base:12, unit:'px/s', note:'horizontal scatter on the same drop' }
];

export const TUNE = Object.freeze(Object.fromEntries(
  TUNABLES.map(t => [t.id, Object.freeze(t)])));
