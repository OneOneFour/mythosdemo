/* ============================================================
   ACTORS — the same table format as MACHINES, assembled by the same
   assemble(). The player is a host with parts, which is why `Pick`,
   `Inventory` and `Hearts` are ordinary components that a machine could
   also mount if a design ever wanted one to.

   A row here has no `size`/`footing` because it has no Footprint part;
   assemble() only runs placement validation when a footprint slot exists.
   ============================================================ */
export const ACTORS = {
  miner: {
    name: 'PROMETHEUS', look: 'miner',
    parts: [
      ['Body',      { w: 6, h: 16 }],
      ['Hearts',    { max: 5 }],
      ['Inventory', { cap: 40 }],
      ['Pick',      { reach: 3.2 }]
    ]
  },

  /* Monsters, DESIGN items 13/14, are this file plus components. Sketched,
     not built: the point is only that a monster is a row here, and that
     "rides the player's elevator" is a `Rider` component rather than a
     branch in lift code. */
  shade: {
    name: 'SHADE', look: 'shade',
    parts: [
      ['Body',   { w: 6, h: 10 }],
      ['Hearts', { max: 2 }]
    ]
  }
};
