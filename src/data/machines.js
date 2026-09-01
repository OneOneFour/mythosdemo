/* LAYER data — MACHINES: one row per machine, all of it literals. Frozen.
   Imports `data` only. May be imported by `data`, `model`, `rules`, `view`.

   Read this key reference before adding a row, and
   docs/DEVELOPER_GUIDE.md#adding-a-machine for how the interpreter reads one.

     tw, th      footprint in tiles.
     footing     how many solid tiles must be under it to place it.

     ports       [{ side, mode, accepts }]
                 side     'top' | 'bottom' | 'left' | 'right'
                 mode     'in'   accepts items pushed or dropped in
                          'out'  where produce() ejects
                 accepts  selectors -- see the grammar in `data/forms.js`.

     buffer.cap  { selector: units }. Per-selector, so the furnace's
                 8-ore / 2-fuel asymmetry is expressible without two fields.

     catchBox    { mouth, slack } items falling through the mouth are swallowed
                 for free. This is the thesis of the game in one flag: placing a
                 machine under a vein beats placing it on the surface.

     handFeed    { reach, from } draws from the player's pockets while they
                 stand within `reach` px.

     emit        [{ field, at, rate, whileRunning }] pours into a scalar field.

     servo       { over, mult } run `mult` times faster while the feed buffer is
                 over `over` full. This is what keeps buffers bounded; without
                 it small surpluses accumulate to FULL over ~20 minutes.

     recipes     names from `data/recipes.js`, or inline rows of the same shape.
                 Tried IN ORDER; the first whose inputs are all present runs, so
                 order is a design decision -- see the lift.

     lift        { span, toBand } marks the machine as one stage of the staged
                 lift. Speeds come from the `liftUp` / `liftDown` tunables, so
                 "down is free, up is expensive" is one place, not one per row.
                 BEING REPLACED by `hub`/`crank`/`gear` below -- see
                 docs/PLAN-gears-and-winches.md. Both mechanisms exist side by
                 side until Phase 8f retires this one.

     hub         { reach, carries } marks the machine as an ENDPOINT a segment
                 may be anchored to (CLAUDE.md D10: "hub"). `reach` is px, the
                 longest cable this hub may anchor, multiplied by the
                 `segReach` scale tunable (scope `machine`) so a longer-reach
                 tier is a `variantOf` row and a range boon is one tuning row.
                 `carries` is `['material']` or `['material','player']` --
                 WHAT the carrier may bear, as data, so a cheap material-only
                 chain needs no engine edit. A SEGMENT IS NOT A MACHINE: it
                 has no footprint, no buffer and no recipe, it lives in
                 `model/segments.js`, and it is created by an action BETWEEN
                 two of these rather than placed.

     crank       { torque, reach } the manual power source. `torque` is drive
                 units supplied while the player is turning it, denominated in
                 `segBase` (1.0 raises one empty carrier at full speed);
                 `reach` is px the player must stand within, the same shape
                 and units `handFeed:{reach}` already uses, so "close enough
                 to feed" and "close enough to turn" cannot disagree. Nothing
                 reads this yet -- Phase 8f does.

     gear        { loss } fraction of torque lost per hop along the drivetrain
                 graph. This is why a drivetrain is not free to sprawl, and
                 the seam a generator eventually plugs into. `axle` is this
                 row with three tiles of reach for a third of the loss --
                 content, exactly as `kiln_divine` and `belt_l` are.

     variantOf   copy another row and override these keys. See `kiln_divine`.

     look        appearance only. `view/` is the only reader, and no machine or
                 substance name appears anywhere in `view/`.

     light       { level, whileRunning }. Phase 2b's one new interpreter key:
                 `rules/light.js` reads it exactly like every other key here,
                 no machine name involved. `level` is a number, or the literal
                 string `'max'`, a sentinel meaning "read `eff('lightMax')` at
                 tick time" -- this file may not import `model/mods.js` (only
                 `model/mods.js` may import `data/tuning.js`), so a row that
                 needs to track a tunable rather than state a constant has to
                 say the WORD and let the interpreter resolve it. Absent
                 `whileRunning` (or `false`) means the machine emits whenever
                 it exists, placed or not; `true` gates it on `m.running`,
                 the same flag the fire-glow look already reads, which for a
                 fuel-charge recipe (`out:[]`) stays true for as long as the
                 buffer holds at least one charge's worth -- "while fuelled".

     mine        { facing, tier, tiles, secs }. Phase 2c's PLACED miner --
                 a GATE on hardness, not a second one: `rules/machines.js`
                 chews the tile(s) it faces with the exact same seconds-to-
                 break arithmetic `rules/mining.js` uses by hand, so the two
                 can only ever agree. `facing` is `1`/`-1`, the same
                 direction convention `belt.dir` already uses. `tier` gates
                 which `tile.tier` it may bite at all (scaled by
                 `eff('toolTier', <substance>)`, same as a hand tool).
                 `tiles` is how many tiles tall the face is -- one at a time,
                 topmost unbroken tile first, so a taller face is reach, not
                 simultaneity. `secs` is how many seconds of active chewing
                 one buffered fuel unit lasts, independent of any tile's own
                 hardness -- the "high fuel draw" difference between tiers is
                 a smaller `secs`, nothing about the break-speed formula
                 itself, which is read generically off `item.tool.power`
                 (`data/substances.js`) and never a machine-specific literal.

     minDepth    tiles below the spawn band's datum a machine may not be
                 placed above. `rules/placement.js`'s one new check this
                 phase; refused with a reason, like every other placement
                 gate on this list.

   Rows are append-only: the index is the id a save stores. */

import { colour } from './palette.js';

export const MACHINES = [

  /* ---- FURNACE: the commented row. Every machine is this shape. -------------
     3x2, catches what falls into its mouth, can be hand-fed, and smelts. The
     recipe is not here -- it is the shared `smelt` row, which is why this one
     machine smelts every ore in the game and will smelt every ore added later.
     ---- */
  { id:'furnace', name:'CRUDE FURNACE',
    tw:3, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ore', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    /* `smelt` now eats 4 ore per run (`docs/DESIGN.md`'s 4:1 ratio) rather
       than the 2 an earlier draft used, so the ore cap is bumped to 8 to keep
       the same 2-runs-of-headroom the fuel cap already had at 2 -- an
       asymmetric CAP, not an asymmetric ratio of cap to recipe demand. */
    buffer:{ cap:{ '*/#ore':8, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ore', '*/#fuel'] },

    emit:[ { field:'heat', at:'top', rate:18, whileRunning:true } ],
    servo:{ over:0.55, mult:1.38 },

    recipes:['smelt'],

    look:{ body:'irC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* ---- KILN DIVINE: the variant.
     See docs/DEVELOPER_GUIDE.md#variants-are-nearly-free ---- */
  { id:'kiln_divine', name:'DIVINE KILN', variantOf:'furnace',
    look:{ body:'clayB', trim:'clayA', base:'clayC', fire:true, halo:'ichor',
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'divine' } } },

  /* ---- LIFT STAGE ----------------------------------------------------------
     One stage, one drum, one deck, one counterweight, pointed surface ->
     astral. Five stages would be five of these records placed at five level
     pairs; NEVER one continuous cage. The staged relay is a deliberate design
     statement, and modelling it as a machine is what keeps it that way.

     The recipes are inline rather than shared because no other machine ascends,
     and THE ORDER IS THE DESIGN: timber first, so the winch behaves like an
     ordinary fuelled lift for as long as you have timber, and only starts
     eating hearts once you have run dry. That is the trap, expressed as row
     order rather than as a special case in the interpreter.

     `heart` is a bare unit, not a substance -- see
     docs/DEVELOPER_GUIDE.md#non-item-inputs ---- */
  { id:'lift', name:'WINCH STAGE',
    tw:2, th:3, footing:2,

    ports:[ { side:'top',    mode:'in', accepts:['*/#fuel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    lift:{ span:64, toBand:'astral' },

    recipes:[
      { in:{ '*/#fuel':1 }, out:[], secs:6.0 },                  // honest fuel
      { in:{ heart:1 }, from:'vital', out:[], secs:6.0 }          // the terms
    ],

    look:{ body:'woodC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  /* ---- PRESS: the second compression tier, `docs/DESIGN.md`'s 12:1 plate
     ratio. NOT a `variantOf:'furnace'` like `kiln_divine` -- a variant only
     overrides keys on an identical machine, and this one runs a genuinely
     different recipe (`press`, not `smelt`) with a different input shape (3
     ingot / 1 fuel, not 4 ore / 1 fuel), so it earns its own row rather than
     hiding a second machine's worth of change inside `variantOf`. Smaller
     footprint than the furnace (2x2, not 3x2) because it works on ingots
     already reduced from ore, not raw veins -- it wants less mouth to feed
     it, not more.

     NO `needs:{heat:{min:...}}` GATE, though the "sit a press above a
     furnace" buoyant-heat pairing is exactly the kind of thing `needs` exists
     for. `rules/fields.js` states diffusion is deliberately unimplemented --
     heat sits at the exact tile a machine emits it into and only decays
     there, it does not rise -- so a press one tile above a furnace would sit
     at the same heat as a press in a field with no furnace at all: a gate
     that reads as intentional design and is actually just permanently shut
     (or trivially open at threshold 0) is worse than no gate. Wire this once
     `rules/fields.js` grows the buoyant transport its own comment already
     names as the seam. ---- */
  { id:'press', name:'PRESS',
    tw:2, th:2, footing:2,

    ports:[ { side:'top', mode:'in', accepts:['*/#ingot', '*/#fuel'] },
            { side:'top', mode:'out' } ],

    /* Same 2x-recipe headroom rule as the furnace: `press` spends 3 ingot / 1
       fuel per run, so the caps double that. */
    buffer:{ cap:{ '*/#ingot':6, '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#ingot', '*/#fuel'] },

    recipes:['press'],

    /* Iron-toned like the furnace's trim, not its body -- reads as the same
       forge-metal family without being mistaken for a furnace at a glance.
       Reuses `ignite`/`ingot` for accept/produce: there is no dedicated
       press or plate sound row yet, and inventing one is audio content, not
       this machine's data. */
    look:{ body:'irB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#ingot', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* ---- BELT: horizontal relocation, and the one machine explicitly priced to
     be RARE. `docs/DESIGN.md`'s genre statement names flat, cheap horizontal
     logistics as the thing this project refuses to become -- `data/recipes.js
     #belt_r` spends 2 plate and 4 gravel, priced in the game's own SECOND
     compression tier rather than raw ore, so a lane of these is a
     plate-shipping decision and not a doorstep mat laid beside every machine.

     IT RUNS NO TRANSFORM. `rules/machines.js`'s generic interpreter turns
     inputs into outputs; a belt turns a POSITION into a later position with
     the SAME substance and form throughout, which is a shape `out` clauses
     cannot express and should not be made to. `rules/belts.js` is the sibling
     module that reads `belt.dir` off this row and drags a resting item along
     the footprint -- `rules/lift.js#carry()` turned ninety degrees, per its
     own file header.

     THE FUEL RECIPE IS THE LIFT'S HONEST-FUEL ROW, VERBATIM IN SHAPE -- see
     docs/DEVELOPER_GUIDE.md#charges-and-honest-fuel

     4 tiles long, 1 tall, `footing:4` -- a full solid floor under the whole
     span, not just the two end tiles a taller machine checks. `th:1` is why
     `rules/placement.js`'s footing loop (which walks every column under the
     footprint regardless of how many rows tall it is) already covers this
     with no change: it was written for an arbitrary `tw`, not for `th:2`
     specifically.

     `belt:{ dir }` is the one key here `rules/belts.js` reads that no other
     machine's row carries: `1` drags toward increasing world x, `-1` toward
     decreasing. `belt_l` is `belt_r` with that key and the id/name flipped via
     `variantOf` -- the same near-free variant `kiln_divine` proves above.

     A HELD BELT PLACES FACING: `data/substances.js` gives `belt_r`/`belt_l`
     ONE shared substance (`belt_r`'s own id), and `model/run.js#machineIdFor`
     resolves it to whichever of these two rows to instantiate off
     `player.face` (+-1) at the moment of placement -- the exact same
     direction convention `belt.dir` already carries, reused rather than
     reinvented, and the reason `belt_l` needs no build recipe of its own
     (its bill would be bit-identical to `belt_r`'s, an unbreakable tie
     `rules/crafting.js#choose`'s first-match rule could never resolve). ---- */
  { id:'belt_r', name:'CONVEYOR (RIGHT)',
    tw:4, th:1, footing:4,

    ports:[ { side:'top', mode:'in', accepts:['*/#fuel'] } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    belt:{ dir:1 },

    recipes:[ { in:{ '*/#fuel':1 }, out:[], secs:6.0 } ],

    /* Timber-and-iron, not the furnace's fired clay: a belt is built, not
       stoked, and `fire:true` here reads as the burner that pays for the
       drag rather than a kiln. Reuses `ignite`/`winch` for accept/produce --
       the same borrow `press` makes for accept/produce, and for the same
       reason: no dedicated belt sound row exists yet, and inventing one is
       audio content, not this machine's data. */
    look:{ body:'woodB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  { id:'belt_l', name:'CONVEYOR (LEFT)', variantOf:'belt_r',
    belt:{ dir:-1 } },

  /* ---- BRAZIER: the placed, fuel-powered light source. Prometheus carried
     the fire; a brazier is where you put it down. Same honest-fuel recipe
     shape the lift and the belt use, so
     `light:{ level:12, whileRunning:true }` is "lit while fuelled" for free
     (docs/DEVELOPER_GUIDE.md#light-emitters): the moment the last
     charge is spent, `m.running` goes false and `rules/light.js`'s next
     recompute (triggered by the emitter signature changing, not by any tile
     write) darkens the room again. 1x1, footing 1 -- a bowl on the ground,
     not a structure. ---- */
  { id:'brazier', name:'BRAZIER',
    tw:1, th:1, footing:1,

    ports:[ { side:'top', mode:'in', accepts:['*/#fuel'] } ],

    buffer:{ cap:{ '*/#fuel':2 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    recipes:[ { in:{ '*/#fuel':1 }, out:[], secs:6.0 } ],

    light:{ level:12, whileRunning:true },

    look:{ body:'ochreB', trim:'ochreA', base:'ochreD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite', produce:'winch' } } },

  /* ---- HEARTH: placed, never expires. No `recipes`
     at all, so `rules/machines.js#choose` always returns null for it and
     `m.running` never goes true -- `light:{level:'max'}` has no
     `whileRunning`, so it does not care: absent means "lit for as long as it
     exists", which for a machine with no fuel to run out of is "never
     expires". `level:'max'` tracks `eff('lightMax')` itself rather than a
     frozen 15, so a boon that ever widened the daylight ceiling would widen
     the hearth's own light with it, for the same reason the daylight seed in
     `rules/light.js` reads `eff('lightMax')` and not a literal. ---- */
  { id:'hearth', name:'HEARTH',
    tw:2, th:2, footing:2,

    /* An `in:{}` recipe is satisfied by construction -- `rules/machines.js#
       choose`'s availability loop iterates zero selectors and stays `ok` --
       so `m.running` goes true the instant this is placed and STAYS true
       forever: `secs:Infinity` means `m.prog` (which only ever grows) can
       never reach it, so nothing is ever spent or produced. This is here
       ONLY so the existing generic fire-glow look (`view/paint.js`, gated on
       `m.running`) reads as lit with no interpreter change -- `light:{level:
       'max'}` below has no `whileRunning` and would read as "always lit"
       with no recipe at all; this is purely the visual match for that
       already-true fact. */
    recipes:[ { in:{}, out:[], secs:Infinity } ],

    light:{ level:'max' },

    /* No `sfx`: `accept`/`produce` are never pushed for a recipe with no
       inputs and no outputs, so there is nothing here for either key to
       name. */
    look:{ body:'basB', trim:'basA', base:'basD', fire:true, halo:'ichor' } },

  /* ---- TALOS HEAD: T3, the first PLACED miner. A severed bronze automaton
     head, bolted facing sideways into the wall it chews. See
     docs/DEVELOPER_GUIDE.md#placed-miners

     `tier:2` is deliberately IDENTICAL to the adamant auger's own
     `item.tool.tier` -- this machine can bite exactly what a T2 hand can,
     no more. `secs:12.0` (Phase 2c's own number, not named by the plan) is
     how many seconds of active chewing one buffered fuel unit lasts; four
     buffered units is roughly a minute unattended before it needs feeding
     again, which is the entire point of placing one in a shaft you have
     since walked away from.

     THE RATE ITSELF IS NOT A ROW HERE AT ALL. `rules/machines.js#mine` reads
     `eff('pickPower') x bestHandToolPower()` -- the exact same two numbers
     `rules/mining.js` reads for a swinging player -- so "mines at exactly
     the T2 hand rate" is true because both call sites share the SAME data,
     not because two authors copied the same literal into two files. ---- */
  { id:'talos_head', name:'TALOS HEAD',
    tw:1, th:1, footing:1,

    ports:[ { side:'top',    mode:'in',  accepts:['*/#fuel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '*/#fuel':4 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    mine:{ facing:1, tier:2, tiles:1, secs:12.0 },

    look:{ body:'cuB', trim:'irA', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite' } } },

  { id:'talos_head_l', name:'TALOS HEAD (LEFT)', variantOf:'talos_head',
    mine:{ facing:-1, tier:2, tiles:1, secs:12.0 } },

  /* ---- CYCLOPS MAW: T4, gated behind depth. Three tiles tall so it faces a
     3-tile column at once -- WIDTH, not speed: it chews at the identical
     per-tile rate `talos_head` does (see the header note on `mine` above),
     the same "automation buys parallelism and nothing else" rule applied to
     its own gate as well as its rate. `tier:3` is the one thing NEITHER hand
     tool reaches -- adamant is unmineable by anything but this, which is why
     its own `cost` is priced in granite-tier goods a T2 auger CAN reach, not
     adamant: a machine that can only be built from the one material it alone
     can mine would have no way to ever get built.

     `secs:3.0`, a quarter of `talos_head`'s, is the "high fuel draw" the
     tier list names -- a thirstier machine, not a faster one. `minDepth:200`
     keeps it out of reach until a shaft is deep enough that adamant is
     actually nearby (`data/world.js`'s adamant blobs start at topsoil row
     220, which is depth ~256 against `view/hud.js`'s own datum -- 200 leaves
     room to place it on the approach, not only once standing in the vein). */
  { id:'cyclops_maw', name:'CYCLOPS MAW',
    tw:1, th:3, footing:1,

    ports:[ { side:'top',    mode:'in',  accepts:['*/#fuel'] },
            { side:'bottom', mode:'out' } ],

    buffer:{ cap:{ '*/#fuel':6 } },

    catchBox:{ mouth:'top', slack:2 },
    handFeed:{ reach:10, from:['*/#fuel'] },

    minDepth:200,

    mine:{ facing:1, tier:3, tiles:3, secs:3.0 },

    look:{ body:'adamantB', trim:'adamantD', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite' } } },

  { id:'cyclops_maw_l', name:'CYCLOPS MAW (LEFT)', variantOf:'cyclops_maw',
    mine:{ facing:-1, tier:3, tiles:3, secs:3.0 } },

  /* ---- SEGMENT TRANSPORT (Phase 8d, docs/PLAN-gears-and-winches.md;
     CLAUDE.md invariant 4 as reworded, and D10 for the five nouns).
     APPENDED, not inserted: this table is append-only because the index is
     the id a save stores.

     These four rows are the replacement for the `lift` row above. NOTHING
     MOVES YET -- Phase 8d places them, links two hubs into a segment and
     parks the carrier at the low end; Phase 8e draws them; Phase 8f gives
     them torque and motion and deletes the winch. The old winch keeps
     working, untouched, until then.

     WHY THE CABLE IS NOT PLACED TILE BY TILE (D10's reconciliation): power is
     physical -- a crank, a gear, an axle and the hub they feed all conduct
     only through orthogonal footprint adjacency. The CABLE between two hubs
     is the one auto-resolved piece: once both hubs exist, are within reach,
     and the straight span between them is clear, the segment resolves itself
     (`model/segments.js#linkCheck`). So the player places endpoints and
     drivetrains, never cable.

     THESE FOUR ARE THE FIRST ROWS IN THE TABLE THAT ARE NOT CATCH BOXES, and
     their `look` blocks say so with a `parts:[...]` list (Phase 8e). Every
     other row gets `view/paint.js#paintMachine`'s generic body-trim-mouth-
     base-with-hopper-lips box, which is the right picture for a furnace and a
     lie on a gear; a row carrying `parts` draws itself out of named shapes
     from `view/treatments.js#TREAT` instead, dispatched exactly as a terrain
     `treatments:[{fn}]` list already is, so `tools/content.mjs` assertion 15
     validates these `fn` names and colour names for free. NO MACHINE NAME IS
     INVOLVED AT ANY POINT -- see docs/SPEC.md section 12.

     `body`/`trim`/`base` stay on every row even though `parts` supersedes
     them: they are what `view/ui/` and any future generic reader falls back
     to, and a row with no `look.body` at all throws the first time something
     asks for it.

     Only the hub carries `cable` and `carrier`, because only a hub anchors a
     segment. No `fire:true` on any of them: none of these four burns
     anything, ever (the crank's cost is the player's own standing there --
     D10's "manual only", and A5 explicitly rejects a heart-powered
     fallback). ---- */

  /* WINCH HUB: the endpoint, and the investment. 2x2 with a footing of 2, the
     same shape as the press and the hearth.

     `reach:96` is 12 tiles at the 8 px tile every band ships with today.
     THE SMALLER OF THE TWO HUBS GOVERNS a span (`linkCheck`'s 'TOO FAR
     APART'), so a long-reach tier could never lend its reach to a short one.

     NO `ports`, NO `buffer`, NO `recipes` -- the first row in this table with
     none of the three, and the generic interpreter already handles that:
     `rules/machines.js#choose` returns null (so `produce` zeroes progress and
     `m.running` stays false), `catchFalling`/`handFeed`/`emit`/`mine` are all
     gated on their own key being present. A hub receives cargo by having a
     carrier arrive at it, which is `rules/drive.js`'s job in Phase 8f, not a
     buffer's. */
  { id:'hub', name:'WINCH HUB',
    tw:2, th:2, footing:2,

    hub:{ reach:96, carries:['material', 'player'] },

    /* THE HEADFRAME: a timber post-and-beam frame, a winding drum, and one
       large toothed drive gear -- the reference image's own silhouette at
       2x2 tiles. `parts` is an ORDERED list and the order is the z-order, so
       the frame goes down first and the wheels sit in it.

       `cable` and `carrier` are read by `view/paint.js`'s segment pass rather
       than dispatched as parts, for the same reason `pips` and `fire` are read
       directly: they describe something that is not inside this footprint and
       has no `fn` to name. Only the hub carries them -- a crank or a gear has
       no cable of its own -- which is what stops a span being painted twice. */
    look:{ body:'irC', trim:'irA', base:'irD',
           parts:[
             /* THE FRAME RECEDES AND THE MOVING PARTS COME FORWARD, which is
                the one tonal decision the whole family rests on. Everything
                was in the same dark register at first -- dark rock, dark
                timber, dark iron -- and the hub read as a stain on the wall.
                So: the structure is the DARKEST timber, the drum is bright
                ochre, and the gear is pale iron with a bronze boss. What
                turns is what you see. */
             { fn:'frame', body:'woodC', hi:'woodB', lo:'woodD', post:2, beam:2 },
             /* THE DRUM SITS CLEAR OF THE GEAR, in rows 2-6, because when the
                two overlapped the drum was invisible and the hub read as one
                indistinct wheel in a picture frame. A drum and a gear are two
                objects and they have to occupy two places. */
             { fn:'drum',  body:'woodA', hi:'ochreA', lo:'woodC', trim:'irB',
               w:12, h:5, dx:2, dy:2 },
             { fn:'gearWheel', d:9, teeth:8, rt:5, dy:4,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ],
           cable:{ hi:'snB', lo:'irC', col:'ochreA', low:'woodB', dark:'woodD', spacing:12 },
           carrier:{ body:'woodD', hi:'ochreA', lo:'irD', trim:'irA',
                     col:'cuA', full:40, depth:7 } } },

  /* HAND CRANK: the only power source in the game, and manual only. 1x2 and
     footing 1 -- a post with a handle on it, standing beside the hub it
     turns, not a structure.

     `torque:1.0` is exactly `segBase`: one crank raises one EMPTY carrier at
     full `segUp`. A rider plus a load needs more drivetrain, which is the
     whole of "nothing makes ascent cheap".

     `reach:12` is `handFeed`'s own 10 plus a little, deliberately: standing
     close enough to turn a crank and standing close enough to feed a machine
     should read as the same distance. */
  { id:'crank', name:'HAND CRANK',
    tw:1, th:2, footing:1,

    crank:{ torque:1.0, reach:12 },

    /* A POST WITH A HANDLE ON IT. The handle is swept by `m.turn` and is the
       machine's whole turning state -- there is no second indicator, because
       a crank whose handle is at the top and a crank whose handle is at the
       bottom is already the clearest possible statement of "this is moving".
       The small boss gear at the foot is what meshes with an adjacent gear
       or hub, so the crank's teeth reach the footprint edge exactly as a
       gear's do. */
    look:{ body:'woodC', trim:'irA', base:'irD',
           parts:[
             /* POST ON THE LEFT, WHEEL AND HANDLE ON THE RIGHT. They shared
                the middle at first and the wheel swallowed the post, so the
                crank read as a lone cog with a hook floating over it. Eight
                pixels of width is enough for two things only if they are told
                which side each is on. */
             { fn:'shaft', body:'woodA', hi:'ochreA', lo:'woodC', trim:'irB',
               thick:4, inset:1, collars:2, dx:-2 },
             { fn:'gearWheel', d:7, teeth:8, rt:4, dx:2, dy:5,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' },
             /* THE ARM COMES OFF THE POST, not out of the middle of the tile:
                `cx:2` puts the bearing on the post itself, and `a0` swings the
                handle up and out so the resting crank reads as caught
                mid-turn rather than as a lever bolted on sideways. */
             { fn:'crankArm', body:'irB', col:'ochreA', hi:'veinA', dark:'irD',
               cx:2, cy:6, r:5, a0:-0.6 }
           ] } },

  /* GEAR: the linkage primitive, 1x1. `loss:0.06` per hop is what stops a
     drivetrain sprawling for free.

     DIAGONALS DO NOT CONDUCT (docs/PLAN A3, confirmed): a corner needs a gear
     IN it. That is a legibility choice, and Phase 8e's art is what teaches
     it -- an accidentally diagonal pair must visibly not mesh. */
  { id:'gear', name:'GEAR',
    tw:1, th:1, footing:1,

    gear:{ loss:0.06 },

    /* ONE WHEEL, AND ITS TEETH REACH THE FOOTPRINT EDGE. `rt` (the tooth
       radius) is 5 in an 8 px tile, so two gears in orthogonally adjacent
       tiles overlap their teeth across the gap and read as MESHED, while two
       in diagonally adjacent tiles sit 11 px apart and leave an obvious hole
       between them. `teeth:8` keeps one tooth on each of the four axes at
       phase 0, which is what makes a resting train look engaged rather than
       accidentally aligned. That is docs/PLAN A3 taught by geometry instead
       of by a tooltip. */
    look:{ body:'cuB', trim:'cuA', base:'cuD',
           parts:[
             { fn:'gearWheel', d:8, teeth:8, rt:4,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ] } },

  /* AXLE: three tiles of reach for a third of the loss. A `variantOf:'gear'`,
     so it is CONTENT and not code -- the same near-free variant `kiln_divine`
     and `belt_l` already are. `footing:1` (not 3) on purpose: an axle spans a
     gap, so requiring a floor under all three tiles would defeat the point of
     having it. */
  { id:'axle', name:'AXLE', variantOf:'gear',
    tw:3, th:1, footing:1,

    gear:{ loss:0.02 },

    /* A BEAM WITH A WHEEL AT EACH END, which is the whole of what an axle is:
       three tiles of reach for a third of the loss. The two end wheels use
       the SAME `gearWheel` the 1x1 gear does, at the same tooth radius, so an
       axle meshing with a gear and two gears meshing with each other are the
       same picture -- a train reads as continuous across a mixture of the
       two. The middle of the span is bare timber, which is also the honest
       statement that nothing meshes with an axle's middle. */
    look:{ body:'woodB', trim:'cuA', base:'woodD',
           parts:[
             { fn:'shaft', body:'woodB', hi:'woodA', lo:'woodD', trim:'irB',
               thick:4, inset:3, collars:2 },
             { fn:'gearWheel', d:8, teeth:8, rt:4, dx:-8,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' },
             { fn:'gearWheel', d:8, teeth:8, rt:4, dx:8,
               body:'irA', hi:'snA', lo:'irC', col:'irA', dark:'cuC' }
           ] } }
];

/* ---- variant expansion, then derived indices, built once, frozen ------------
   A variant is a shallow merge of the named base row under its own keys. Merge
   and not deep-merge on purpose: a variant that wants to change one port
   restates the whole `ports` array, which is legible, whereas a deep merge of
   arrays is not. This is derivation over frozen tables in the same class as the
   index maps below -- it is not behaviour, and `rules/` never sees it. */

const expand = (row, all) => {
  if (!row.variantOf) return row;
  const base = all.find(r => r.id === row.variantOf);
  if (!base) throw new Error(`machines: "${row.id}" is a variant of unknown "${row.variantOf}"`);
  const over = { ...row };
  delete over.variantOf;
  return { ...base, ...over };
};

export const MACH = Object.freeze(MACHINES.map(r => Object.freeze(expand(r, MACHINES))));
export const M    = Object.freeze(Object.fromEntries(MACH.map((m, i) => [m.id, i])));

/* Fail at import rather than at paint time on a mistyped colour name. `view`
   would otherwise render a black box at depth 300 and say nothing. */
for (const m of MACH)
  for (const k of ['body', 'trim', 'base', 'halo'])
    if (m.look?.[k]) colour(m.look[k]);
