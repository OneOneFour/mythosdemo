/* data layer — RECIPES: shared, named transformations. Frozen. Imports
   nothing.

   A machine row may NAME a recipe here or INLINE a literal one; both are the
   same shape and `recipesOf()` resolves either. Named rows are for
   transformations more than one machine performs.

   in     { selector: units }. Grammar is in `data/forms.js`.
   from   which `data/sources.js` row the inputs come from, default 'buffer'.
          With `units:'named'` the input keys are bare unit names. No row uses
          either today.
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

   Declaration order is a correctness property: `rules/crafting.js#choose`
   takes the first affordable row, matched by one pocketed pair holding the
   whole count, so if bill A strictly contains bill B, A must come first or B
   wins forever and A is uncraftable. */

export const RECIPES = Object.freeze({

  /* A machine-build row spends a bill and produces one `<machine>/rig`.
     Every one is `hand:true` -- a machine is built by hand, never by another
     machine -- and all of them precede the other hand recipes, whose bills
     they contain. */

  furnace: Object.freeze({
    id:'furnace', name:'CRUDE FURNACE',
    in:{ 'copper/ore':12, 'timber/log':6 },
    out:[ { sub:'furnace', form:'rig', n:1 } ],
    secs:8.0,
    hand:true
  }),

  brazier: Object.freeze({
    id:'brazier', name:'BRAZIER',
    in:{ 'timber/log':4, 'stone/gravel':2 },
    out:[ { sub:'brazier', form:'rig', n:1 } ],
    secs:5.0,
    hand:true
  }),

  /* {3 log, 3 gravel} contains, and is contained by, nothing: at 2 gravel it
     would be a subset of `brazier`'s {4 log, 2 gravel} and unreachable by
     hand for anyone holding four logs. */
  crank: Object.freeze({
    id:'crank', name:'HAND CRANK',
    in:{ 'timber/log':3, 'stone/gravel':3 },
    out:[ { sub:'crank', form:'rig', n:1 } ],
    secs:4.0,
    hand:true
  }),

  /* A subset of both `brazier` and `crank`, so it follows both, and precedes
     `peg_rungs`/`kindle`, which are subsets of it. */
  gear: Object.freeze({
    id:'gear', name:'GEAR',
    in:{ 'timber/log':2, 'stone/gravel':1 },
    out:[ { sub:'gear', form:'rig', n:1 } ],
    secs:2.0,
    hand:true
  }),

  /* Precedes `hub`, whose {3 plate, 1 ingot, 2 log} this bill strictly
     contains; with `hub` first the dock would be uncraftable. */
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

  /* Strictly contains `talos_head` and `press_machine`, so it precedes both. */
  cyclops_maw: Object.freeze({
    id:'cyclops_maw', name:'CYCLOPS MAW',
    in:{ 'copper/plate':16, 'copper/ingot':6, 'granite/gravel':6 },
    out:[ { sub:'cyclops_maw', form:'rig', n:1 } ],
    secs:24.0,
    hand:true
  }),

  /* Strictly contains `press_machine`, so it precedes it. */
  talos_head: Object.freeze({
    id:'talos_head', name:'TALOS HEAD',
    in:{ 'copper/plate':8, 'copper/ingot':2 },
    out:[ { sub:'talos_head', form:'rig', n:1 } ],
    secs:16.0,
    hand:true
  }),

  /* Keyed `press_machine` because `press` below is the ingot-to-plate
     recipe. Its output is the `press` machine. */
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

  /* Ingot is locked at 4 ore to 1. */
  smelt: Object.freeze({
    id:'smelt', name:'SMELT',
    in:{ '*/#ore':4, '*/#fuel':1 },
    out:[ { subFrom:'*/#ore', form:'ingot', n:1 } ],
    secs:4.0,
    hand:true
  }),

  /* Three ingots is 12 ore to 1 plate. The input selects `#ingot` and not
     `#refined`, which also tags `plate`, so a press cannot eat its own
     output; `subFrom` carries the substance across, as in `smelt`. */
  press: Object.freeze({
    id:'press', name:'PRESS',
    in:{ '*/#ingot':3, '*/#fuel':1 },
    out:[ { subFrom:'*/#ingot', form:'plate', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* Two logs rather than one, and declared above `kindle`: at one log the two
     rows would have identical trigger sets, a tie `rules/crafting.js#choose`
     resolves by declaration order alone. */
  peg_rungs: Object.freeze({
    id:'peg_rungs', name:'PEG RUNGS',
    in:{ 'timber/log':2 },
    out:[ { sub:'timber', form:'rung', n:4 } ],
    secs:1.5,
    hand:true
  }),

  /* One log, under `peg_rungs`'s two, so neither it nor `kindle` {1 log} is
     a subset of this bill. 8.0 talents consumed against 6.0 produced. */
  daedalan: Object.freeze({
    id:'daedalan', name:'DAEDALAN STAIR',
    in:{ 'copper/plate':3, 'timber/log':1 },
    out:[ { sub:'copper', form:'stair', n:2 } ],
    secs:6.0,
    hand:true
  }),

  /* After `daedalan`, which asks one more plate at the same log count, and
     before `kindle`, whose {1 log} is a subset of this bill. */
  auger: Object.freeze({
    id:'auger', name:'ADAMANT AUGER',
    in:{ 'copper/plate':2, 'timber/log':1 },
    out:[ { sub:'auger', form:'relic', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* The weakest log bill in the file, so it is tried after `daedalan` and
     `auger`. A log and a brand are each one unit to a fuel selector, so this
     count is the fuel exchange rate. */
  kindle: Object.freeze({
    id:'kindle', name:'KINDLE',
    in:{ 'timber/log':1 },
    out:[ { sub:'timber', form:'brand', n:2 } ],
    secs:1.5,
    hand:true
  }),

  /* Last of every plate-consuming row: {2 plate} is a strict subset of all
     of them, and would starve whichever followed it. */
  hearth: Object.freeze({
    id:'hearth', name:'HEARTH',
    in:{ 'copper/plate':2 },
    out:[ { sub:'hearth', form:'rig', n:1 } ],
    secs:4.0,
    hand:true
  }),

  /* `#bulk/gravel` rather than `#rock/gravel` keeps `cyclops_maw`'s granite
     out of contention. Declared last of all: gravel is abundant, so first it
     would starve the brazier, crank, gear and belt builds. */
  pack: Object.freeze({
    id:'pack', name:'PACK EARTH',
    in:{ '#bulk/gravel':5 },
    out:[ { subFrom:'#bulk/gravel', form:'block', n:1 } ],
    secs:2.5,
    hand:true
  })
});

/* Every recipe a player may run directly, in table order, which is the order
   `rules/crafting.js` tries them in. Derived once here so the craft list and
   the chooser cannot disagree. */
export const HAND_RECIPES = Object.freeze(
  Object.values(RECIPES).filter(r => r.hand));

/* Resolve a machine row's `recipes` into concrete rows: named strings are
   looked up, objects pass through. Throws on an unknown name. */
export function recipesOf(def) {
  return (def.recipes || []).map(r => {
    if (typeof r !== 'string') return r;
    const row = RECIPES[r];
    if (!row) throw new Error(`recipes: machine "${def.id}" names unknown recipe "${r}"`);
    return row;
  });
}
