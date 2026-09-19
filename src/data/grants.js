/* data layer — the god-gift tier that unlocks a machine. Frozen.

     god     a `data/gods.js` id.
     grants  a `data/machines.js` id. Its mirror, if it has one, comes with
             it, so a row never names a `_l` id.
     trap    for the HUD: this grant has a cost the text does not state.

   `isKnown` gates a machine-build recipe on `canPlace`, so an ungranted
   machine draws as a locked silhouette in the crafting tab.

   Empty: every machine is either known from the start or granted by a cycle
   reward, so `rules/draft.js` has no `grant` tier to offer and no cycle names
   one. */

export const GRANTS = [];

export const GRANT = Object.freeze(Object.fromEntries(
  GRANTS.map(g => [g.id, Object.freeze(g)])));

/* The machines a run may place before any cycle pays. `winch` and
   `cloud_dock` arrive when the first trial does. Read by `model/run.js` and
   the content lint. */
export const STARTING_MACHINES = Object.freeze(
  ['kiln', 'brazier', 'hearth', 'contraption', 'belt_r', 'belt_l',
   'hub', 'drive_wheel', 'transformer', 'transformer_l']);
