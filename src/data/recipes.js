/* LAYER data — RECIPES: shared, named transformations. Frozen. Imports
   nothing.

   A machine row may NAME a recipe here or INLINE a literal one; both are the
   same shape and `recipesOf()` resolves either. Named rows are for
   transformations more than one machine performs.

   in     { selector: units }. Grammar is in `data/forms.js`.
   from   which `data/sources.js` row the inputs come from, default 'buffer'.
          With `units:'named'` the input KEYS are bare unit names. NO ROW USES
          EITHER TODAY; the mechanism stays because it is the only way a
          non-item input can be expressed.
   needs  { field: { min, max } } gate on a scalar field at the machine.
          Delete the line and the recipe runs cold.
   secs   seconds per run at rate 1.0, before `servo` and the `rate` tunable.
   out    output clauses. `[]` means it consumes and produces nothing and
          banks a CHARGE instead, which a belt and a brazier both do.
            { sub, form, n }      literal output.
            { subFrom, form, n }  DERIVED: the substance that satisfied the
                                  named input clause, in the named form.
          Exactly one of `sub` / `subFrom` per clause.
   hand   true if a PLAYER may run this exact row by hand. Deliberately not a
          second row -- one row, two runners.

   DECLARATION ORDER IS A CORRECTNESS PROPERTY. `rules/crafting.js#choose`
   takes the FIRST affordable row, matched by ONE pocketed pair holding the
   whole count, so if bill A strictly CONTAINS bill B, A must come first or
   B wins forever and A is uncraftable. Four rows were unobtainable this way
   before their positions were fixed. */

export const RECIPES = Object.freeze({

  /* MACHINE-BUILD RECIPES. Each spends the exact bill `data/machines.js`
     used to charge at placement and produces one `<machine>/rig`. `hand:true`
     on every one: a machine is built by hand, never by another machine.

     DECLARED BEFORE every other hand recipe below, because the first
     matching row wins. Checked pairwise against every other `hand:true` row
     for exactly this containment before the order was picked:
       furnace, brazier  -- both a strict superset of smelt (ore+fuel) /
                             peg_rungs / kindle (log alone) -- declared first.
       cyclops_maw       -- a strict superset of talos_head AND
                             press_machine (plate + ingot) -- declared before
                             both.
       talos_head        -- a strict superset of press_machine -- declared
                             before it.
       hearth            -- the INVERSE case: its own 2 copper/plate is a
                             strict SUBSET of every other plate-consuming
                             recipe here (cyclops_maw, talos_head,
                             press_machine, belt_r, and the EXISTING
                             daedalan/auger), so `hearth` is declared AFTER
                             EVERY PLATE-CONSUMING ROW, or it would starve
                             every one of them the moment enough plate for
                             both existed. Only `pack` is declared
                             after it, and the two share no material at all --
                             see that row's own derivation.

     The four segment-transport rows were checked the same way, against
     every row in this file, and only these containments exist:
       crank             -- nothing contains it and it contains nothing except
                             `gear` (below). {3 log, 3 gravel} is deliberately
                             NOT a subset of `brazier`'s {4 log, 2 gravel}:
                             an earlier draft priced it at {3 log, 2 gravel},
                             which IS a subset, and would have made the crank
                             permanently unreachable by hand for any player
                             holding four logs. Raising the gravel to 3 breaks
                             the containment in both directions. It is still
                             declared after `brazier`, so the pre-existing
                             brazier behaviour is unchanged where the two
                             merely overlap.
       gear              -- {2 log, 1 gravel} is a strict subset of BOTH
                             `brazier` and `crank`, so it is declared after
                             both, and before `peg_rungs`/`kindle` (whose
                             {2 log} / {1 log} are in turn subsets of IT).
       hub               -- no containment with anything still in this file.
                             `hearth`'s {2 plate} is a subset of the hub's
                             {3 plate, 1 ingot, 2 log}, which `hearth` being
                             last of the plate rows already covers.
       axle              -- {2 ingot, 2 log}: no containment with anything
                             either, including `hub` -- the hub needs plate the
                             axle does not, and the axle needs two ingots to
                             the hub's one.
     (Both of these were originally placed after the retired WINCH STAGE row,
     whose {6 plate, 4 log, 2 ingot} bill contained them both. That row is gone;
     the positions are unchanged, since removing a superset can
     only ever relax an ordering constraint.) */

  furnace: Object.freeze({
    id:'furnace', name:'CRUDE FURNACE',
    in:{ 'copper/ore':12, 'timber/log':6 },
    out:[ { sub:'furnace', form:'rig', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* No `kiln_divine` row -- see `data/substances.js`'s own comment on why
     one is not shippable without inventing a number nobody set. */

  brazier: Object.freeze({
    id:'brazier', name:'BRAZIER',
    in:{ 'timber/log':4, 'stone/gravel':2 },
    out:[ { sub:'brazier', form:'rig', n:1 } ],
    secs:5.0,
    hand:true
  }),

  /* SEGMENT TRANSPORT, part 1 of 2: the two timber-and-gravel rows, declared
     here for the containment reasons in the block header above. */

  crank: Object.freeze({
    id:'crank', name:'HAND CRANK',
    in:{ 'timber/log':3, 'stone/gravel':3 },
    out:[ { sub:'crank', form:'rig', n:1 } ],
    /* 4.0s, in `brazier`/`hearth`'s class: the crank is cheap to build and
       expensive to USE, and the whole design rests on the second half. */
    secs:4.0,
    hand:true
  }),

  gear: Object.freeze({
    id:'gear', name:'GEAR',
    in:{ 'timber/log':2, 'stone/gravel':1 },
    out:[ { sub:'gear', form:'rig', n:1 } ],
    /* The cheapest machine recipe in the file, and the fastest. A drivetrain
       is several of these; nothing about them should be a decision. */
    secs:2.0,
    hand:true
  }),

  /* SEGMENT TRANSPORT, part 2 of 2: the two refined rows. `hearth`'s {2 plate}
     is a strict subset of `hub`'s bill, and `hearth` being declared LAST OF
     ALL is what covers that. */

  /* DECLARED BEFORE `hub` BECAUSE ITS BILL STRICTLY CONTAINS THE HUB'S:
     {5 plate, 1 ingot, 2 log} against {3 plate, 1 ingot, 2 log}. Any pockets
     satisfying this also satisfy the hub, so with `hub` first the dock is
     uncraftable forever. The reverse is harmless.

     It also contains `daedalan`, `auger`, `peg_rungs`, `kindle` and `hearth`,
     all declared later already, and contains NEITHER `press_machine` (one
     ingot short) nor `belt_r` nor `gear`.

     14.0s is the hub's 10.0 plus 4.0 for the deck. */
  cloud_dock: Object.freeze({
    id:'cloud_dock', name:'THE CLOUD DOCK',
    in:{ 'copper/plate':5, 'copper/ingot':1, 'timber/log':2 },
    out:[ { sub:'cloud_dock', form:'rig', n:1 } ],
    secs:14.0,
    hand:true
  }),

  hub: Object.freeze({
    id:'hub', name:'WINCH HUB',
    in:{ 'copper/plate':3, 'copper/ingot':1, 'timber/log':2 },
    out:[ { sub:'hub', form:'rig', n:1 } ],
    /* 10.0s, exactly half the retired WINCH STAGE's 20.0 for exactly half its
       mass -- a segment's two endpoints together cost the same time and the
       same talents as the one winch stage they replaced. */
    secs:10.0,
    hand:true
  }),

  axle: Object.freeze({
    id:'axle', name:'AXLE',
    in:{ 'copper/ingot':2, 'timber/log':2 },
    out:[ { sub:'axle', form:'rig', n:1 } ],
    secs:6.0,
    hand:true
  }),

  cyclops_maw: Object.freeze({
    id:'cyclops_maw', name:'CYCLOPS MAW',
    in:{ 'copper/plate':16, 'copper/ingot':6, 'granite/gravel':6 },
    out:[ { sub:'cyclops_maw', form:'rig', n:1 } ],
    secs:24.0,
    hand:true
  }),

  talos_head: Object.freeze({
    id:'talos_head', name:'TALOS HEAD',
    in:{ 'copper/plate':8, 'copper/ingot':2 },
    out:[ { sub:'talos_head', form:'rig', n:1 } ],
    secs:16.0,
    hand:true
  }),

  /* Named `press_machine`, not `press` -- `press` below already names the
     ingot-to-plate compression recipe; the two are unrelated transforms that
     happen to share an English word. */
  press_machine: Object.freeze({
    id:'press_machine', name:'PRESS',
    in:{ 'copper/plate':4, 'copper/ingot':2 },
    out:[ { sub:'press', form:'rig', n:1 } ],
    secs:12.0,
    hand:true
  }),

  belt_r: Object.freeze({
    id:'belt_r', name:'CONVEYOR',
    in:{ 'copper/plate':2, 'stone/gravel':4 },
    out:[ { sub:'belt_r', form:'rig', n:1 } ],
    secs:10.0,
    hand:true
  }),

  /* The locked compression table fixes ingot at 4:1, so `in` reads 4 and not
     the round-number 2 an earlier draft shipped with. */
  smelt: Object.freeze({
    id:'smelt', name:'SMELT',
    in:{ '*/#ore':4, '*/#fuel':1 },
    out:[ { subFrom:'*/#ore', form:'ingot', n:1 } ],
    secs:4.0,
    hand:true
  }),

  /* The SECOND compression tier, locked at 12:1 against raw ore -- and since
     one ingot already costs 4 ore, three ingots IS that ratio in ingot terms.

     The input selects on INGOT and not on REFINED, because `refined` also
     tags `plate` itself, so selecting on it would let a press eat its own
     output and compress a tier into itself for free. `subFrom` carries the
     substance across as `smelt` does, so a tin plate needs no row. */
  press: Object.freeze({
    id:'press', name:'PRESS',
    in:{ '*/#ingot':3, '*/#fuel':1 },
    out:[ { subFrom:'*/#ingot', form:'plate', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* peg_rungs: timber/log -> timber/rung, the cheap dedicated ladder.
     NOT the plan's literal "1 timber/log -> 4 timber/rung", because `kindle`
     also fires off nothing but one log, and two hand recipes with an
     IDENTICAL trigger set is a tie `rules/crafting.js#choose` cannot see --
     whichever is declared first wins every time, forever. Requiring 2 logs
     and declaring this row above `kindle` breaks the tie without touching
     either output: holding exactly 1 log fails this stronger requirement and
     falls through to `kindle`, and holding 2 or more satisfies this row
     first. See `forms.js#rung` for the mass-conservation half of the same
     correction. */
  peg_rungs: Object.freeze({
    id:'peg_rungs', name:'PEG RUNGS',
    in:{ 'timber/log':2 },
    out:[ { sub:'timber', form:'rung', n:4 } ],
    secs:1.5,
    hand:true
  }),

  /* 3 plate + 1 log -> 2 stairs, the tier-2 ladder. `hand:true` because no
     machine builds a ladder, ever.

     THREE PLATE AND ONE LOG, NOT TWO PLATE AND FOUR LOGS, AND THE CHANGE IS
     WHAT MAKES THIS ROW REACHABLE AT ALL: `peg_rungs` {2 log} and `kindle`
     {1 log} are both strict subsets of a four-log bill, so the cheaper timber
     row won at every inventory. One log is under `peg_rungs`'s two, which
     breaks the containment in the one direction that matters.

     Mass is unchanged at 8.0 consumed against 6.0 produced. */
  daedalan: Object.freeze({
    id:'daedalan', name:'DAEDALAN STAIR',
    in:{ 'copper/plate':3, 'timber/log':1 },
    out:[ { sub:'copper', form:'stair', n:2 } ],
    secs:6.0,
    hand:true
  }),

  /* The T2 hand tool, `hand:true` with no machine ever naming it.

     DECLARED AFTER `daedalan` AND BEFORE `kindle`, AND BOTH HALVES MATTER.
     `daedalan` asks one more plate at the same log count, so it is the
     stronger bill and is tried first. `kindle` {1 log} is a strict SUBSET of
     this bill, and above it the auger -- the answer to the granite gate --
     is unobtainable at every inventory. */
  auger: Object.freeze({
    id:'auger', name:'ADAMANT AUGER',
    in:{ 'copper/plate':2, 'timber/log':1 },
    out:[ { sub:'auger', form:'relic', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* THE ONLY ROW WHOSE OUTPUT FORM IS NOT A COMPRESSION TIER: smelt and press
     compress toward density, kindling does the opposite.

     TWO BRANDS PER LOG, NOT THREE. A log and a brand are each ONE unit to a
     fuel selector, so this count IS the fuel exchange rate -- at three, every
     fuel bill silently cost a third of a log and burning a log directly was
     never rational. Two leaves 40% of the log as waste.

     DECLARED AFTER `daedalan` AND `auger`: this is the weakest log bill in
     the file, and the weakest bill must be tried last. */
  kindle: Object.freeze({
    id:'kindle', name:'KINDLE',
    in:{ 'timber/log':1 },
    out:[ { sub:'timber', form:'brand', n:2 } ],
    secs:1.5,
    hand:true
  }),

  /* DECLARED LAST OF EVERY PLATE-CONSUMING ROW, after even `auger`: this bill
     is a strict SUBSET of every other plate-consuming recipe here, so
     declaring it earlier starves whichever came after it the moment a player
     holds 2+ plate. The weakest bill in the file must be the LAST tried. */
  hearth: Object.freeze({
    id:'hearth', name:'HEARTH',
    in:{ 'copper/plate':2 },
    out:[ { sub:'hearth', form:'rig', n:1 } ],
    secs:4.0,
    hand:true
  }),

  /* 5 rubble of one BULK element -> 1 `block` of that element, the only way
     back to solid ground. One row covers soil AND stone AND any future `bulk`
     element, because `subFrom` carries the substance across, and
     `#bulk/gravel` and not `#rock/gravel` is what keeps `cyclops_maw`'s 6
     granite/gravel out of contention entirely.

     NO CONTAINMENT IN EITHER DIRECTION here, so position is decided by WHO
     LOSES THE OVERLAP. Declared first, a player carrying rubble could not
     hand-build most of the drivetrain; declared LAST they must put plate down
     to pack earth, which is the smaller loss. */
  pack: Object.freeze({
    id:'pack', name:'PACK EARTH',
    in:{ '#bulk/gravel':5 },
    out:[ { subFrom:'#bulk/gravel', form:'block', n:1 } ],
    secs:2.5,
    hand:true
  })
});

/* Every recipe a player may run directly, in table order. `rules/crafting.js`
   tries them in this order for the same "first one you have materials for
   wins" reason a machine tries ITS `recipes` list in the order it was
   written. Derived once, here, rather than filtered by every reader --
   `view/hud.js`'s CRAFT list and `rules/crafting.js`'s own chooser would
   otherwise be two implementations of "which rows have `hand:true`" that
   could silently disagree, the same failure `MACH`/`M` exist to prevent for
   machines. */
export const HAND_RECIPES = Object.freeze(
  Object.values(RECIPES).filter(r => r.hand));

/* Resolve a machine row's `recipes` into concrete rows. Named strings are
   looked up; objects pass through. Throws on an unknown name, because a
   silently missing recipe is a machine that never runs and never says why. */
export function recipesOf(def) {
  return (def.recipes || []).map(r => {
    if (typeof r !== 'string') return r;
    const row = RECIPES[r];
    if (!row) throw new Error(`recipes: machine "${def.id}" names unknown recipe "${r}"`);
    return row;
  });
}
