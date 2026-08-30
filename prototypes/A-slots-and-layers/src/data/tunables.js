/* ============================================================
   TUNABLES — every number a boon is allowed to touch.

   CLAUDE.md: "ES module bindings are read-only for importers." So a trinket
   cannot reassign `export const WALK = 60`. The reviewer found that none of
   the six RFCs moved these anywhere, which makes DESIGN item 8 — one of the
   three boon tiers, a third of the reward economy — unreachable in all six.

   The rule here is blunt: IF A BOON MIGHT CHANGE IT, IT IS A ROW IN THIS
   TABLE AND NOWHERE ELSE. These are BASE values. Nothing reads them
   directly; every consumer reads it through the `stat` accessor in
   model/mods.js, which applies the modifier stack. tools/layers.mjs scans
   every call site and fails the build on a name that is not a row here.

   Scoped modifiers. `stat(name, scope)` multiplies the unscoped stack by a
   scoped one, so a boon can say "kilns 50% faster" without this table
   growing a row per machine:
       stat('machine.rate', 'bake')  ->  base * mul['machine.rate']
                                              * mul['machine.rate@bake']
   Adding the kiln therefore adds NO row here.
   ============================================================ */

export const TUNABLES = {

  /* --- the player. Was `export const` at src/sim/player.js:16-25. ------- */
  'walk':            60,      // px/s
  'hop':             92,      // px/s launch, ~1 tile + margin
  'climb':           30,      // px/s, half walk on purpose
  'coyote':          0.09,    // s of grace after leaving ground
  'grav':            320,     // px/s^2
  'terminal':        400,     // px/s cap on fall speed

  /* --- fall damage. Was inline literals 160 and 32. ------------------- */
  'fall.safe':       160,     // px/s impact below which you take nothing
  'fall.perHeart':   32,      // px/s per heart above that

  /* --- mining. Scope is the substance id: stat('mine.hardness','granite') */
  'mine.power':      1.0,     // multiplier on seconds applied per second
  'mine.hardness':   1.0,     // multiplier on a substance's `hard`
  'mine.reach':      3,       // tiles

  /* --- machines. Scope is the recipe tag. ---------------------------- */
  'machine.rate':    1.0,     // multiplier on recipe speed
  'machine.yield':   1.0,     // multiplier on output counts (rounded down)
  'burn.span':       1.0,     // multiplier on how long one unit of fuel lasts

  /* --- the lift. Down is free, up is expensive (CLAUDE.md invariant 5). */
  'lift.up':         11,      // px/s
  'lift.down':       26,      // px/s

  /* --- the economy. DESIGN item 1: lift cost = k * depth. ------------- */
  'lift.k':          0.02,    // fuel per unit mass per tile of depth
  'item.mass':       1.0      // scope is the substance id
};
