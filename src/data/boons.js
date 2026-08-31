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
   granted. `rules/placement.js` reads this and nothing else.

   `press` is here PROVISIONALLY, for testability while the plate tier has no
   content consuming it yet (no cycle-2 tribute, no boon gating it). It reads
   as free content now for the same reason `furnace` is a starting machine and
   not a boon grant: cycle 1 has no clock, so there is nothing yet to make
   pressing plates a reward rather than a given. Once tribute past cycle 1
   exists, this almost certainly wants to move to a `BOONS` row instead — a
   press earned late is refinement-quota pressure; a press free from spawn is
   just an unused row on the HUD.

   `belt_r` / `belt_l` are here PROVISIONALLY TOO, and more so than `press`:
   belts are supposed to be RARE per `docs/DESIGN.md`'s genre statement, so a
   belt costing plate is only half the point if it is also handed out free at
   spawn. They are free-for-testability now for the same reason every row in
   this list is — there is no director yet to decide when a god would offer
   one — but this is the row on this list most likely to move to `BOONS` the
   moment there is one: earned late, a belt is a real reward for the cost it
   already carries; free from spawn, the cost is just a tax on a starting
   machine, which is backwards. */
/* `brazier` and `hearth` (Phase 2b, `docs/BUILD_PLAN.md`) are here for the
   identical "free for testability now, no director exists yet to gate them
   behind" reason `press`/`belt_r`/`belt_l` already state above -- outside
   this phase's own FILE OWNERSHIP list, added anyway because without it
   neither machine is placeable at all (nothing else grants a machine before
   a director exists) and the phase's own required manual verification is
   "place a brazier ... none of that may require a debug key." See
   docs/FINDINGS.md. */
export const STARTING_MACHINES = Object.freeze(
  ['furnace', 'lift', 'press', 'belt_r', 'belt_l', 'brazier', 'hearth']);
