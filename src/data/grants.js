/* data layer — the god-gift tier that unlocks a machine. Frozen.

     god     a `data/gods.js` id.
     grants  a `data/machines.js` id. Its mirror, if it has one, comes with
             it, so a row never names a `_l` id.
     trap    for the HUD: this grant has a cost the text does not state.

   `isKnown` gates a machine-build recipe on `canPlace`, so an ungranted
   machine draws as a locked silhouette in the crafting tab. */

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

/* The machines a run may place before any grant is drafted;
   `rules/placement.js` reads this and nothing else. `furnace` and
   `cloud_dock` arrive when the first trial pays. */
export const STARTING_MACHINES = Object.freeze(
  ['press', 'belt_r', 'belt_l', 'brazier', 'hearth',
   'hub', 'crank', 'gear', 'axle']);
