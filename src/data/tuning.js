/* data layer — TUNABLES: base values only. Never written. Only
   `model/mods.js` may import this file, and `tools/layers.mjs` fails the
   build on any other importer.

   Two kinds of row, differing in what `base` means:

     kind:'value'  the number itself.
     kind:'scale'  a multiplier on a literal that lives on a data row --
                   hardness on the substance, recipe time on the machine. This
                   table holds the 1.0 a trinket bends, and `scope` names what
                   may follow a dot: `hard.stone`, `rate.furnace`.
     scoped        per-scope base overrides for a scale row, stacking
                   multiplicatively under any trinket.

   A mod key that is not a row here, or whose scope does not resolve to a real
   substance or machine id, fails the content lint. */

export const TUNABLES = [

  { id:'walk',      kind:'value', base:60,   unit:'px/s',   note:'ground speed; 7.5 tiles/s' },
  { id:'hop',       kind:'value', base:92,   unit:'px/s',   note:'launch; ~1 tile + margin, deliberately not enough to escape a 5-tile hole' },
  { id:'climb',     kind:'value', base:10,   unit:'px/s',   note:'ladder speed. A sixth of walk, and the whole of what an unaided ascent costs.' },
  { id:'coyote',    kind:'value', base:0.09, unit:'s',      note:'grace after leaving the ground' },
  { id:'reach',     kind:'value', base:25.6, unit:'px',     note:'3.2 tiles from the player centre' },
  { id:'pickPower', kind:'value', base:1.0,  unit:'x',      note:'seconds of dig credited per second held' },
  { id:'pickupR',   kind:'value', base:10,   unit:'px',     note:'radius at which a resting item is pocketed' },

  /* Also bounds the O(n) nearest-mark query `rules/mining.js` runs once per
     substep. 256 is a 16x16 block, eight times the ~32 tiles `reach` covers
     at one moment. */
  { id:'digQueueMax', kind:'value', base:256, unit:'tiles',  note:'marks the dig queue holds; a further mark is refused' },

  /* safe   =  5 tiles  ( 40 px) -> 160 px/s -> 0 hearts
     lethal = 20 tiles  (160 px) -> 320 px/s -> 5 hearts
     so one heart per 32 px/s above 160. */
  { id:'grav',      kind:'value', base:320,  unit:'px/s^2' },
  { id:'terminal',  kind:'value', base:400,  unit:'px/s' },
  { id:'fallSafe',  kind:'value', base:160,  unit:'px/s',   note:'5 tiles; no damage at or below' },
  { id:'fallHeart', kind:'value', base:32,   unit:'px/s',   note:'one heart per this much over fallSafe' },
  { id:'fallMax',   kind:'value', base:5,    unit:'hearts', note:'clamp; equals a full heart bar, so 20 tiles kills' },

  /* `rules/drive.js` is the only reader, and its motion expression is
     `need = segBase + segLoad * mass * slope` against the drivetrain's torque.
     Weighted descent is what that produces at zero supply, so there is no
     separate descent number. */
  { id:'segUp',     kind:'value', base:26,    unit:'px/s',       note:'bucket ascent at full surplus and full drive. Equal to segDown by construction -- a bucket never rises faster than it sinks.' },
  { id:'segDown',   kind:'value', base:26,    unit:'px/s',       note:'free descent on a VERTICAL rope, scaled by slope. The ceiling segUp is held to, and free.' },
  { id:'segBase',   kind:'value', base:1.0,   unit:'drive',      note:'torque needed to raise an EMPTY bucket at full speed. The unit drive.torque is denominated in.' },
  { id:'segLoad',   kind:'value', base:0.0125, unit:'drive/talent', note:'added torque per talent aboard, at full slope. One winch stops rising at 36 T aboard and runs back above 44 T, under the 48 T a fully laden rider weighs.' },
  { id:'segFric',   kind:'value', base:0.05,  unit:'drive',      note:'torque a rope costs to turn at all, whichever way it is going. Small against segBase, so a balanced loop does not creep and an unbalanced one still runs.' },
  { id:'bucketCap', kind:'value', base:20,    unit:'talents',    note:'what one bucket hauls. Half the burden cap, so a full pocketload is two bucket loads.' },
  { id:'ropeBuckets', kind:'value', base:4,   unit:'buckets',    note:'how many one rope takes. Four is two a side, so a loop can be balanced.' },
  { id:'attachR',   kind:'value', base:12,    unit:'px',         note:'how near the aim must fall to a rope to hang a bucket on it. A tile and a half, so two ropes in one shaft stay apart.' },

  { id:'riderMass', kind:'value', base:8,     unit:'talents',    note:"the player's own body in a bucket, before their pockets. Boarding is never refused; this is the load that makes it physics instead." },

  { id:'segReach',   kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `hub.reach`. Where a range boon or a longer-reach hub tier goes. `segReach.hub` scopes it.' },

  /* Torque and speed are two quantities and power is their product. A
     transformer multiplies one and divides the other along the path past it,
     so `driveTorque` and `driveSpeed` bend a source and `gearRatio` bends
     what the transformer does to both. */
  { id:'driveTorque', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `drive.torque`. Where a strength boon goes. `driveTorque.winch` scopes it.' },
  { id:'driveSpeed', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `drive.speed`, the rate an unloaded shaft turns at.' },
  { id:'gearRatio', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `ratio.mul`. Higher trades more speed for more torque.' },
  { id:'gearLoss', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies `ratio.loss`. Lower is a tighter drivetrain.' },
  { id:'spinRate', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies how fast a driven wheel is drawn turning, on top of shaft speed.' },

  { id:'beltMaxSlope', kind:'value', base:0.5, unit:'sin',
    note:'steepest belt that still grips, as |dy|/len. 0.5 is 30 degrees; above it items slide back.' },

  { id:'beltDrag', kind:'value', base:0.08, unit:'drive',
    note:'torque one belt tile costs its drivetrain, in the same unit as segBase. At 1.0 per bucket, one winch turns 19 tiles or a bucket and six.' },

  { id:'beltSpeed', kind:'value', base:50,   unit:'px/s',
    note:'drag speed at full drive and shaft speed 1, scaled down by both.' },

  { id:'beltSlip', kind:'value', base:34,   unit:'px/s',
    note:'how fast an item runs back down a belt steeper than beltMaxSlope. Above segDown, so a belt is a worse way down than a rope.' },

  /* `rules/fields.js` decays a field and does not diffuse it. */
  { id:'heatDecay', kind:'value', base:0.35, unit:'/s',     note:'fraction lost per second' },

  /* Graph distance through open tiles, not a straight line, so a corridor
     that switches back on itself burns it fast. */
  { id:'sightRadius', kind:'value', base:14, unit:'tiles',
    note:'graph-distance cap on the Pass B flood in rules/reveal.js. Pass A has no cap.' },

  { id:'hard', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies `tile.hard`. Lower is faster to mine. `hard.stone` scopes it.' },

  { id:'rate', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies machine progress. Higher is faster. `rate.kiln` scopes it.' },

  { id:'yield', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies output counts, rounded down. Where a "doubling" boon goes.' },

  /* A fuel unit's energy is `form.fuel.energy x eff('fuelEnergy', <sub>)`,
     and a burner converts what it draws at `eff('burnEff', <machine>)`. A
     smelt costs 0.5, so in a kiln one log is exactly one ore and one coal
     lump is three. */
  { id:'fuelEnergy', kind:'scale', base:1.0, scope:'substance',
    scoped:{ coal:3.0 },
    note:'multiplies a fuel form\'s own energy, per element. `fuelEnergy.coal` scopes it.' },

  { id:'burnEff', kind:'scale', base:1.0, scope:'machine',
    scoped:{ kiln:0.5 },
    note:'fraction of drawn fuel energy a burner actually converts. `burnEff.kiln` scopes it.' },

  /* Climb speed falls linearly from 1.0 at `burdenSoft` of the cap to
     `burdenClimbFloor` at it; walking on level ground and every downward
     movement are never scaled. `burdenSoft` is `riderMass / burden`. */
  { id:'burden',           kind:'value', base:40,   unit:'talents', note:'hard carry cap; a pickup or a climb over this is refused' },
  { id:'burdenSoft',       kind:'value', base:0.20, unit:'x',       note:'fraction of burden where climb-speed falloff starts; riderMass / burden' },
  { id:'burdenClimbFloor', kind:'value', base:0.40, unit:'x',       note:'climb-speed multiplier at the hard cap, the tick before lockout' },

  { id:'trinketSlots', kind:'value', base:3, unit:'slots', note:'length of run.equipped; a boon could someday widen it' },

  /* `offerSize` counts a tier's still-undrafted rows; `rules/draft.js` never
     pads a short offer. */
  { id:'offerSize',  kind:'value', base:3, unit:'cards',  note:'cards in one draft offer; fewer candidates offer fewer' },
  { id:'rerollCost', kind:'value', base:2, unit:'favour', note:'favour spent with the asking god to re-pick the offer' },

  /* The deadline on the wait for cycle 1's altar, measured against `run.t`
     in simulated seconds at the fixed substep. A player who digs at all
     triggers the arrival before reaching it. */
  { id:'altarGraceSecs', kind:'value', base:80, unit:'s',
    note:'the altar arrives this long into a run whatever the tutorial beat says; the beat sheet puts it at 1:20' },

  /* `view/scene.js` is the only reader: it measures `run.t - run.arrival.t`
     against this, so the presentation ends on simulated seconds rather than
     on frames. The 48 px walk to the altar takes 0.8 s at `walk`. */
  { id:'altarRiseSecs', kind:'value', base:1.6, unit:'s',
    note:'how long the altar takes to rise and its shaft of light to fade' },

  /* Read only by `view/hud.js`: every countdown it draws -- a boon's
     remaining time and the tribute deadline -- flashes under this, at 3 Hz. */
  { id:'urgentSecs', kind:'value', base:5, unit:'s', note:'seconds left at which a HUD countdown starts flashing' },

  { id:'invSlots',      kind:'value', base:30, unit:'slots', note:'length of the main inventory grid; run.mainSlots at reset' },
  { id:'quickbarSlots', kind:'value', base:8,  unit:'slots', note:'length of the quickbar; the tail of run.inv past run.mainSlots' },

  /* The two falloffs are per-tile-of-travel losses the BFS in
     `rules/light.js` subtracts, rock lossier than air. */
  { id:'lightMax',         kind:'value', base:15, unit:'levels', note:'daylight level, and the ceiling any emitter can reach' },
  { id:'lightFalloffAir',  kind:'value', base:1,  unit:'levels', note:'lost per tile of open air the light BFS crosses' },
  { id:'lightFalloffRock', kind:'value', base:3,  unit:'levels', note:'lost per tile of solid rock the light BFS crosses' },
  { id:'brandSecs',        kind:'value', base:90, unit:'s',      note:'one lit timber/brand burns this long, then is consumed' },
  { id:'brandLevel',       kind:'value', base:9,  unit:'levels', note:'light level while a timber/brand is lit' },

  /* Separate from `hard`: this gates whether a tool may swing at a tile at
     all, not how long the swing takes. */
  { id:'toolTier', kind:'scale', base:1.0, scope:'substance',
    note:'bends tile.tier gating in rules/mining.js; a boon could lend a tier' },

  /* Scales how many units one native tile yields before it is gone, not the
     rate of a swing. Rounded and floored at 1 by both readers, so no bend can
     make a tile yield nothing. */
  { id:'richness', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies a deposit substance tile.charge. A boon could enrich a vein.' },

  /* Rolled once per unit including ore, where a roll against 1.0 always
     passes, so no downstream `rand()` position depends on which substance is
     being mined. */
  { id:'dropChance', kind:'scale', base:1.0, scope:'substance',
    scoped:{ soil:0.05, stone:0.10 },
    note:'chance a mined unit actually drops. `dropChance.soil` scopes it.' },

  /* The only worldgen number here, because it is the one a mod could bend.
     The relief, contact and ore-shape numbers are consts in
     `rules/generate.js` or keys on a `data/world.js` strata row. */
  { id:'hollowOre', kind:'value', base:0.25, unit:'fraction',
    note:'chance a carved hollow has its walls lined with ore. Read once per hollow, at worldgen.' },

  /* 180 s is between a third and a half of every shipped deadline. Raising
     `seedYield` changes the `rand()` stream: two draws per seed. */
  { id:'treeGrowSecs', kind:'value', base:180, unit:'s',
    note:'accumulated simulation seconds a planted timber/seed takes to become a tree' },
  { id:'seedYield',    kind:'value', base:2,   unit:'units',
    note:'seeds dropped when the LAST remaining trunk tile of a tree is felled' },

  { id:'tossUp',     kind:'value', base:50, unit:'px/s', note:'upward toss on a newly dropped item; drop verb only' },
  { id:'tossSpread', kind:'value', base:12, unit:'px/s', note:'horizontal scatter on the same drop' }
];

export const TUNE = Object.freeze(Object.fromEntries(
  TUNABLES.map(t => [t.id, Object.freeze(t)])));
