/* LAYER data — GRANTS: the MACHINE god-gift tier. Frozen. Imports nothing.

   This tier grants a MACHINE: it changes what the player may PLACE, not what
   a number is.

     grants  a machine id. Its MIRROR, if it has one, comes with it, so a row
             never names a `_l` id.
     trap    for the HUD: this grant has a cost the text does not state.

   TWO ROWS, AND THAT IS THE WHOLE TIER. A third needs a third machine that
   does not exist, and inventing one to make the number three would be
   padding; the draft offers two of two honestly instead.

   A GRANT UNLOCKS THE BUILD, NOT JUST THE PLACEMENT: `isKnown` gates a
   machine-build recipe on `canPlace`, so until a row is drafted the CRAFTING
   tab draws both machines as locked silhouettes. */

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

/* The machines a run may place before any grant is drafted. Everything else
   is granted, and `rules/placement.js` reads this and nothing else.

   `hub`/`crank`/`gear`/`axle` are UNGATED because transport is the game's
   bottleneck rather than a reward, and gating the only way up behind a draft
   would make a run's viability a dice roll.

   `furnace` IS NOT HERE: it is CYCLE 1's REWARD, granted with `cloud_dock`
   the moment the first trial pays. */
export const STARTING_MACHINES = Object.freeze(
  ['press', 'belt_r', 'belt_l', 'brazier', 'hearth',
   'hub', 'crank', 'gear', 'axle']);
