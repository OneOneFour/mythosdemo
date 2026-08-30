/* LAYER data — BOONS: the MACHINE-GRANT tier. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   The trinket tier bends numbers and lives in `data/trinkets.js`. This tier
   grants a MACHINE, which is a different thing: it changes what the player may
   place, not what a number is.

   It is a run-state SET and not a registry edit. `data/machines.js` is a plain
   frozen table read at placement time and there is no boot compile step, so
   nothing has to support "late" content: `rules/boons.js` adds an id to
   `run.granted` and `rules/placement.js` refuses anything not in it. That is
   about fifteen lines of grant layer, and it is why granting a machine mid-run
   costs no architecture.

     grants   a machine id from `data/machines.js`.
     trap     for the HUD: this boon has a cost the text does not state.

   One row, because the tier is the point and the content is not. */

export const BOONS = [

  { id:'gift-kiln', name:'THE DIVINE KILN', god:'hephaestus',
    text:'HIS OWN FIRE, LENT',
    grants:'kiln_divine' }
];

export const BOON = Object.freeze(Object.fromEntries(
  BOONS.map(b => [b.id, Object.freeze(b)])));

/* The machines a run may place before any boon is drafted. Everything else is
   granted. `rules/placement.js` reads this and nothing else. */
export const STARTING_MACHINES = Object.freeze(['furnace', 'lift']);
