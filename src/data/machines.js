/* LAYER data — MACHINES: one row per machine, all of it literals. Frozen.
   Imports `data` only. May be imported by `data`, `model`, `rules`, `view`.

   ============================================================================
   READ THIS BLOCK BEFORE ADDING A ROW.
   The interpreter that runs these rows is `rules/machines.js`. It contains no
   machine name, no substance name and no magic number. You should not have to
   read it to add a machine; you should have to read this block once.
   ============================================================================

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

     variantOf   copy another row and override these keys. See `kiln_divine`.

     NO `cost` KEY HERE ANY MORE. Phase 3 (`docs/BUILD_PLAN.md`) priced a
     build here, spent from the pockets the moment the machine was PLACED --
     "cost at placement" was an explicit, accepted DEVIATION from the
     original plan, which asked for a machine ITEM the player carries and
     places, on the grounds that a held thing here is substance x form and a
     furnace is not an element (`data/substances.js`'s header). That
     reasoning has been REVERSED, on direct post-launch feedback: it proved
     too much, since `data/substances.js#bellows` and `#chasm` are already
     "one substance per trinket/miracle," justified by the identical "this
     refines from nothing, it IS the element" argument, crossed with a
     shared form (`relic`, `phial`). A machine is fabricated, not compressed
     from ore, and unique in itself -- the same category. So: a machine IS
     now a held item, `<machine-id>/rig` (`data/forms.js#rig`,
     `data/substances.js`'s machine-substance block), built by an ordinary
     hand:true recipe in `data/recipes.js` naming this row's OWN former bill
     verbatim, and placed through the SAME pockets-driven path a tile-capable
     form already used (`rules/placement.js#placeMachine`,
     `model/run.js#placementCheck` checking `invCount(S[id], F.rig) > 0`
     instead of a cost bill). See `docs/SPEC.md` section 13 and
     `docs/FINDINGS.md` for the full before/after.

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

    /* Building one now costs `data/recipes.js#furnace` (12 copper/ore + 6
       timber/log, ~16.8 T -- `docs/SPEC.md` section 13), a held
       `furnace/rig` item spent at PLACEMENT, not a bill charged here. */

    look:{ body:'irC', trim:'irB', base:'irD', fire:true,
           pips:[ { sel:'*/#ore', row:0 }, { sel:'*/#fuel', row:1 } ],
           sfx:{ accept:'ignite', produce:'ingot' } } },

  /* ---- KILN DIVINE: the variant, and the proof that variants are nearly free.
     It is the furnace row with four keys overridden: a new id, a new name, a new
     look, and a heat gate is NOT added -- nothing mechanical changes here at
     all. It is twice as fast because `data/tuning.js` carries one line,
     `rate.kiln_divine: 2.0`, and for no other reason.

     Total cost of a variant: this six-line row plus one tuning row. No engine
     code learned the word "kiln", and a `rate.furnace` trinket still stacks
     multiplicatively on top without either knowing the other exists. ---- */
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

     `heart` is not a substance. It is a bare unit offered by the `vital` row in
     `data/sources.js`, which is the whole non-item-fuel mechanism. ---- */
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

    /* Building one now costs `data/recipes.js#lift` (6 copper/plate + 4
       timber/log + 2 copper/ingot, ~20.8 T -- refined material, not raw ore,
       priced like the investment a bottleneck stage is), a held `lift/rig`
       item spent at PLACEMENT -- checked AGAINST the shaft-reach gate below
       (`lift.span` must actually land in `lift.toBand`), not instead of it:
       a player can hold a stage and still be refused for aiming it at solid
       rock. */

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

    /* Building one now costs `data/recipes.js#press_machine` (4 copper/plate
       + 2 copper/ingot, 12.8 T -- REFINED goods, not raw ore: a press turns
       ingot into plate, so building one costs the tier it produces, the same
       "pay in the tier above" shape `lift`'s bill already uses), a held
       `press/rig` item spent at PLACEMENT. A player who wants a press before
       holding one can still hand-press (`data/recipes.js#press`, `hand:true`)
       their way to plate directly -- the point of a placed press was never
       "the only way to make a plate", only "more than one pair of hands'
       worth at once" (`docs/DESIGN.md`). */

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

     THE FUEL RECIPE IS THE LIFT'S HONEST-FUEL ROW, VERBATIM IN SHAPE: `out:[]`
     banks a CHARGE through the ordinary `produce()` path below, the exact
     mechanism a lift stage uses, and `rules/belts.js` spends exactly one
     charge per item it delivers off the belt's end. Nothing in this file or
     that one can tell a belt's charge from a lift's.

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

  /* ---- BRAZIER: the placed, fuel-powered light source (Phase 2b). Prometheus
     carried the fire; a brazier is where you put it down. Same honest-fuel
     recipe SHAPE the lift and the belt already use -- `out:[]` banks a
     charge, and `rules/machines.js#choose` keeps `m.running` true for as long
     as the buffer holds at least one, with no code here or there able to tell
     this charge from a lift's or a belt's. `light:{ level:12, whileRunning:
     true }` is therefore "lit while fuelled" for free: the moment the last
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

  /* ---- HEARTH: placed, never expires, and priced FOR NOW at 2 copper/plate
     rather than in the essence tier `docs/DESIGN.md` actually wants for it --
     essence does not exist as of this phase (Phase 1's table, not this
     phase's to invent one row early for). See docs/FINDINGS.md. No `recipes`
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

  /* ---- TALOS HEAD: T3, the first PLACED miner (Phase 2c). A severed bronze
     automaton head, bolted facing sideways into the wall it chews -- `mine:
     {facing:1, ...}` is the SAME direction convention `belt.dir` already
     uses, and `talos_head_l` below is the identical near-free mirrored
     variant `belt_l` already proves.

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

    /* Building one now costs `data/recipes.js#talos_head` (8 copper/plate +
       2 copper/ingot, 22.4 T), a held `talos_head/rig` item spent at
       PLACEMENT -- shared with `talos_head_l` below (`model/run.js
       #machineIdFor` resolves the same held pair to whichever facing
       `player.face` says, the belt's own trick). */

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

    /* Building one now costs `data/recipes.js#cyclops_maw` (16 copper/plate
       + 6 copper/ingot + 6 granite/gravel, 50.7 T), a held
       `cyclops_maw/rig` item spent at PLACEMENT -- shared with
       `cyclops_maw_l` below, the same `player.face`-resolved trick
       `talos_head`/`belt_r` already use. */

    minDepth:200,

    mine:{ facing:1, tier:3, tiles:3, secs:3.0 },

    look:{ body:'adamantB', trim:'adamantD', base:'irD', fire:true,
           pips:[ { sel:'*/#fuel', row:0 } ],
           sfx:{ accept:'ignite' } } },

  { id:'cyclops_maw_l', name:'CYCLOPS MAW (LEFT)', variantOf:'cyclops_maw',
    mine:{ facing:-1, tier:3, tiles:3, secs:3.0 } }
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
