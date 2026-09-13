/* LAYER data — GRANTS: the MACHINE tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   This tier grants a MACHINE: it changes what the player may place, not what a
   number is. See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers

     grants  a machine id from `data/machines.js`. Its MIRROR, if it has one,
             comes with it -- `rules/grants.js` grants the pair, so a row
             never names a `_l` id.
     trap     for the HUD: this grant has a cost the text does not state.

   TWO ROWS, AND THAT IS THE WHOLE TIER FOR NOW. `gift-kiln` used to be the
   only row and granted `kiln_divine`, which has no substance and therefore
   cannot be placed at any depth by any player (`data/substances.js`'s own
   comment on why one was not shippable) -- so the tier had never once done
   anything. A third row needs a third machine that does not exist yet;
   inventing one to make the number three would be padding, and the draft
   offers two of two honestly instead.

   A GRANT UNLOCKS THE BUILD, NOT JUST THE PLACEMENT. `model/run.js#isKnown`
   gates a machine-build recipe on `canPlace`, so until one of these rows is
   drafted the CRAFTING tab draws both machines as locked silhouettes. */

export const GRANTS = [

  { id:'gift-talos', name:'THE HEAD OF TALOS', god:'hephaestus',
    text:'THE BRONZE MAN STILL BITES',
    grants:'talos_head' },

  { id:'gift-maw', name:'THE CYCLOPS MAW', god:'poseidon',
    text:'HIS SON EATS STONE',
    grants:'cyclops_maw' }
];

export const GRANT = Object.freeze(Object.fromEntries(
  GRANTS.map(g => [g.id, Object.freeze(g)])));

/* The machines a run may place before any grant is drafted. Everything else is
   granted. `rules/placement.js` reads this and nothing else.

   `hub`/`crank`/`gear`/`axle` (docs/PLAN-gears-and-winches.md) are ungated for
   the reason the retired winch stage was: transport is the game's bottleneck,
   not a reward, and gating the ONLY way up behind a draft would make a run's
   viability a dice roll. The winch stage itself left this list
   along with its machine row.

   `furnace` IS NOT HERE, and that is Phase 10b (D-H/H1): docs/SPEC.md
   section 4 and 5 have always locked the furnace as CYCLE 1's REWARD --
   "the altar gifts a crude furnace" -- and this row quietly contradicted that
   from run start until now. `rules/cycles.js#complete` grants it (and
   `cloud_dock`) the moment the first trial pays. */
export const STARTING_MACHINES = Object.freeze(
  ['press', 'belt_r', 'belt_l', 'brazier', 'hearth',
   'hub', 'crank', 'gear', 'axle']);
