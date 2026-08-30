/* ============================================================
   MACHINES — one row per machine type. A machine type is not a class and
   not a factory function: it is this row. `sim/assemble.js` turns it into a
   live object, and never needs editing to add one.

   Read a row top to bottom and you can enumerate what the machine can do
   without opening another file. That is the whole bet.

   `parts` is [componentName, params]. Names resolve against comp/index.js;
   a typo throws at boot naming the machine AND the component you typed.
   Order in this list does NOT decide tick order -- assemble() sorts
   topologically by slot so a provider always ticks before its consumers.
   ============================================================ */
export const MACHINES = {

  furnace: {
    name: 'CRUDE FURNACE', size: [3, 2], footing: 2, look: 'furnace',
    parts: [
      ['Footprint', {}],
      ['Buffer',    { cap: { ore: 4, log: 2 } }],
      ['CatchBox',  { mouth: 'top', accepts: '*' }],   // falling material is free
      ['HandFeed',  { pad: 10 }],                      // stand adjacent, it takes
      ['Recipe',    { tag: 'smelt' }],                 // 2 ore + 1 log -> 1 ingot
      ['HeatVent',  { at: 'top', watts: 34 }],         // emits into the heat field
      ['Emitter',   { at: 'top', vy: -70 }]
    ]
  },

  crusher: {
    name: 'CRUSHER', size: [2, 2], footing: 2, look: 'crusher',
    parts: [
      ['Footprint', {}],
      ['Buffer',    { cap: { ore: 6, gravel: 6 } }],
      ['CatchBox',  { mouth: 'top', accepts: { tag: 'crushable' } }],
      ['HandFeed',  { pad: 10 }],
      ['Recipe',    { tag: 'crush' }],
      ['Emitter',   { at: 'bottom', vy: 10 }]
    ]
  },

  /* ---- The kiln. This row is the crusher above with four values changed
     and one part added. `hot: true` on the bake recipe means it needs a
     `heat` slot, so it mounts a Burner.

     Forget the Burner and sim/tables.js throws at boot:
       "MACHINES.kiln: recipe 'bake' is `hot: true` but no part provides
        `heat` -- add a Burner (or a BloodBurner) to this row."
     Note it is tables.js and NOT assemble() that catches this: Recipe must
     declare `heat?` optional or the crusher could not exist, so the
     requirement is a property of the recipe pool rather than of the
     component. See the long comment at that check. ---- */
  kiln: {
    name: 'KILN', size: [2, 2], footing: 2, look: 'kiln',
    parts: [
      ['Footprint', {}],
      ['Buffer',    { cap: { gravel: 8, log: 2 } }],
      ['CatchBox',  { mouth: 'top', accepts: { tag: 'bakeable' } }],
      ['HandFeed',  { pad: 10 }],
      ['Burner',    { fuel: { tag: 'fuel' }, secs: 8 }],
      ['Recipe',    { tag: 'bake' }],
      ['HeatVent',  { at: 'top', watts: 22 }],
      ['Emitter',   { at: 'bottom', vy: 10 }]
    ]
  },

  /* ---- The lift, DESIGN item 19 / CLAUDE invariant 4: five INDEPENDENT
     stages, one row placed five times, each with its own drum and deck.
     Never one continuous cage. `Deck` needs the `heat` slot, which is
     invariant 5: it only ascends with a lit burner. ---- */
  winch: {
    name: 'TIMBER WINCH', size: [2, 3], footing: 2, look: 'winch',
    parts: [
      ['Footprint', {}],
      ['Buffer',    { cap: { log: 4 } }],
      ['CatchBox',  { mouth: 'top', accepts: { tag: 'fuel' } }],
      ['Burner',    { fuel: { tag: 'fuel' }, secs: 8 }],   // provides `heat`
      ['Deck',      { span: 96, up: 11, down: 26 }]        // needs   `heat`
    ]
  },

  /* ---- THE BLOOD WINCH, DESIGN item 12. The trap boon from cycle 3.

     Diff against `winch` above, in full:
        - Buffer, CatchBox and Burner are gone
        + BloodBurner is added
     That is the entire change. `Deck` is byte-identical, the recipe engine
     is untouched, `assemble()` is untouched, and player health never
     becomes a substance or an inventory row.

     It works because capability is keyed to a SLOT, not to a component or a
     type: `Burner` and `BloodBurner` both declare `provides: ['heat']`, and
     `Deck` declares `needs: ['heat']`. Deck cannot tell them apart and has
     no code that could. See comp/bloodburner.js. ---- */
  bloodWinch: {
    name: 'BLOOD WINCH', size: [2, 3], footing: 2, look: 'winch',
    parts: [
      ['Footprint',   {}],
      ['BloodBurner', { hearts: 1, secs: 12 }],       // provides `heat`
      ['Deck',        { span: 96, up: 11, down: 26 }] // needs   `heat`
    ]
  }
};
