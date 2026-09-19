/* data layer — RECIPES: shared, named transformations. Frozen. Imports
   nothing.

   A machine row may NAME a recipe here or INLINE a literal one; both are the
   same shape and `recipesOf()` resolves either.

   in     { selector: units }. Grammar is in `data/forms.js`.
   fuel   energy one run burns, drawn from `#fuel` pairs in the buffer and
          converted at `eff('burnEff', <machine>)`. Absent means none.
   from   which `data/sources.js` row the inputs come from, default 'buffer'.
   needs  { field: { min, max } } gate on a scalar field at the machine.
   secs   seconds per run at rate 1.0, before `servo` and the `rate` tunable.
   out    output clauses. `[]` means it consumes and produces nothing and
          banks a CHARGE instead, which a belt and a brazier both do.
            { sub, form, n }      literal output.
            { subFrom, form, n }  DERIVED: the substance that satisfied the
                                  named input clause, in the named form.
   hand   true if a PLAYER may run this exact row by hand.
   smelt  true if only a machine carrying `smelts:{}` may run it.

   Declaration order is a correctness property: `rules/crafting.js#choose`
   takes the first affordable row, matched by one pocketed pair holding the
   whole count, so if bill A strictly contains bill B, A must come first or B
   wins forever and A is uncraftable. */

export const RECIPES = Object.freeze({

  /* Machine builds come first, largest bill outward: every one is
     `hand:true`, because a machine is built by hand and never by another
     machine. */

  winch: Object.freeze({
    id:'winch', name:'WINCH',
    in:{ 'copper/ingot':2, 'iron/gear':5 },
    out:[ { sub:'winch', form:'rig', n:1 } ],
    secs:14.0,
    hand:true
  }),

  /* Contains `gear_hub`, `hearth`, `belt` and `kindle`, so it precedes all
     four. */
  cloud_dock: Object.freeze({
    id:'cloud_dock', name:'THE CLOUD DOCK',
    in:{ 'copper/ingot':4, 'iron/gear':2, 'timber/log':2 },
    out:[ { sub:'cloud_dock', form:'rig', n:1 } ],
    secs:14.0,
    hand:true
  }),

  /* Contains `stone_block`'s ten, so it precedes it. */
  kiln: Object.freeze({
    id:'kiln', name:'BASIC KILN',
    in:{ '#bulk/gravel':15 },
    out:[ { sub:'kiln', form:'rig', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* Contains `gear_hub`, `belt`, `ladder` and `kindle`, so it precedes all
     four. */
  contraption: Object.freeze({
    id:'contraption', name:'CONTRAPTION',
    in:{ 'iron/gear':2, 'copper/ingot':1, 'timber/log':4 },
    out:[ { sub:'contraption', form:'rig', n:1 } ],
    secs:9.0,
    hand:true
  }),

  gear_hub: Object.freeze({
    id:'gear_hub', name:'GEAR HUB',
    in:{ 'iron/gear':2, 'copper/ingot':1 },
    out:[ { sub:'hub', form:'rig', n:1 } ],
    secs:10.0,
    hand:true
  }),

  transformer: Object.freeze({
    id:'transformer', name:'GEAR TRANSFORMER',
    in:{ 'iron/gear':3 },
    out:[ { sub:'transformer', form:'rig', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* Contains `ladder` and `kindle`; both follow it. */
  brazier: Object.freeze({
    id:'brazier', name:'BRAZIER',
    in:{ 'timber/log':4, '#bulk/gravel':2 },
    out:[ { sub:'brazier', form:'rig', n:1 } ],
    secs:5.0,
    hand:true
  }),

  /* Contains `iron_gear`, so it precedes it. */
  drive_wheel: Object.freeze({
    id:'drive_wheel', name:'DRIVE WHEEL',
    in:{ 'iron/gear':1, 'iron/ingot':1 },
    out:[ { sub:'drive_wheel', form:'rig', n:1 } ],
    secs:6.0,
    hand:true
  }),

  /* `belt_r`/`belt_l` share one substance and one bill: two rows would be a
     tie `choose`'s first match cannot resolve. One belt covers one tile, so
     the bill buys a pair. Contains `kindle`, so it precedes it. */
  belt: Object.freeze({
    id:'belt', name:'BELT',
    in:{ 'iron/gear':1, 'timber/log':1 },
    out:[ { sub:'belt_r', form:'rig', n:2 } ],
    secs:3.0,
    hand:true
  }),

  hearth: Object.freeze({
    id:'hearth', name:'HEARTH',
    in:{ 'copper/ingot':2 },
    out:[ { sub:'hearth', form:'rig', n:1 } ],
    secs:4.0,
    hand:true
  }),

  auger: Object.freeze({
    id:'auger', name:'ADAMANT AUGER',
    in:{ 'iron/ingot':2, 'timber/log':1 },
    out:[ { sub:'auger', form:'relic', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* Ten rubble of one `bulk` element back into one placeable block of that
     element, recovered at native hardness. `#bulk/gravel` rather than
     `#rock/gravel` keeps granite's spoil out of contention. */
  stone_block: Object.freeze({
    id:'stone_block', name:'STONE BLOCK',
    in:{ '#bulk/gravel':10 },
    out:[ { subFrom:'#bulk/gravel', form:'block', n:1 } ],
    secs:2.5,
    hand:true
  }),

  iron_gear: Object.freeze({
    id:'iron_gear', name:'IRON GEAR',
    in:{ 'iron/ingot':1 },
    out:[ { sub:'iron', form:'gear', n:1 } ],
    secs:2.0,
    hand:true
  }),

  /* Contains `kindle`'s single log, so it precedes it. */
  /* Contains `ladder` and `kindle`, so it precedes both. */
  bucket: Object.freeze({
    id:'bucket', name:'BUCKET',
    in:{ 'timber/log':5 },
    out:[ { sub:'bucket', form:'rig', n:1 } ],
    secs:4.0,
    hand:true
  }),

  ladder: Object.freeze({
    id:'ladder', name:'LADDER',
    in:{ 'timber/log':3 },
    out:[ { sub:'timber', form:'rung', n:2 } ],
    secs:1.5,
    hand:true
  }),

  /* The weakest bill in the file, so it is tried last. */
  kindle: Object.freeze({
    id:'kindle', name:'KINDLE',
    in:{ 'timber/log':1 },
    out:[ { sub:'timber', form:'brand', n:2 } ],
    secs:1.5,
    hand:true
  }),

  /* One ore, one ingot, in a device carrying `smelts:{}`. Never by hand:
     `HAND_RECIPES` filters on `hand`, so the player cannot run this row at
     all. `subFrom` carries the element across. */
  smelt: Object.freeze({
    id:'smelt', name:'SMELT',
    in:{ '*/#ore':1 },
    fuel:0.5,
    out:[ { subFrom:'*/#ore', form:'ingot', n:1 } ],
    secs:3.0,
    smelt:true
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
