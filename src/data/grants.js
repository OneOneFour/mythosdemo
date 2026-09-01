/* LAYER data — GRANTS: the MACHINE tier of docs/DESIGN.md's four god-gift
   tiers (CLAUDE.md "Resolved decisions" D1). Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   This tier grants a MACHINE: it changes what the player may place, not what a
   number is. See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers

     grants  a machine id from `data/machines.js`.
     trap     for the HUD: this grant has a cost the text does not state.

   One row, because the tier is the point and the content is not. */

export const GRANTS = [

  { id:'gift-kiln', name:'THE DIVINE KILN', god:'hephaestus',
    text:'HIS OWN FIRE, LENT',
    grants:'kiln_divine' }
];

export const GRANT = Object.freeze(Object.fromEntries(
  GRANTS.map(g => [g.id, Object.freeze(g)])));

/* The machines a run may place before any grant is drafted. Everything else is
   granted. `rules/placement.js` reads this and nothing else.

   `hub`/`crank`/`gear`/`axle` (Phase 8d, docs/PLAN-gears-and-winches.md) are
   ungated for the same reason `lift` is: transport is the game's bottleneck,
   not a reward, and gating the ONLY way up behind a draft would make a run's
   viability a dice roll. `lift` stays on this list beside them until Phase 8f
   retires it -- both mechanisms are buildable at once, on purpose, so the wave
   is never in a half-broken state. */
export const STARTING_MACHINES = Object.freeze(
  ['furnace', 'lift', 'press', 'belt_r', 'belt_l', 'brazier', 'hearth',
   'hub', 'crank', 'gear', 'axle']);
