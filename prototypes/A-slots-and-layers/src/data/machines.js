/* ============================================================
   MACHINES — one row per machine. A row is a PARTS LIST.

   A reader who has never seen this repo can enumerate what a machine can do
   from its parts list without opening another file. Part names resolve
   against data/parts.js; a typo throws at assembly, naming the machine and
   the part you typed.

   There is no machine type identity beyond the parts list. `crusher` is not
   a kind of Machine; it is the set { Footprint, Buffer, CatchBox, Recipe,
   Emitter }. Capabilities intersect freely, so a heated washery is one more
   row rather than a diamond.
   ============================================================ */

export const MACHINES = [

  /* 3x2. 2 copper + 1 timber -> 1 ingot per 4s.
     Catch box swallows anything falling into the mouth; hand-feeds from the
     player's pockets when they stand adjacent. The HotServo row is
     CLAUDE.md's throughput servo. */
  { id: 'furnace', name: 'CRUDE FURNACE', tw: 3, th: 2,
    parts: [
      ['Footprint', { footing: 2 }],
      ['Buffer',    { cap: { '#ore': 4, '#fuel': 2 } }],
      ['CatchBox',  { mouth: 'top', slack: 2, accepts: ['#ore', '#fuel'] }],
      ['HandFeed',  { reach: 10 }],
      ['Recipe',    { tag: 'smelt' }],
      ['HotServo',  { over: 0.55, boost: 1.38 }],
      ['Emitter',   { at: 'top', vy: -70 }]
    ],
    look: { body: 'irC', trim: 'irB', base: 'irD', fire: true,
            pips: [{ sel: '#ore', row: 0 }, { sel: '#fuel', row: 1 }] } },

  /* 2x2. 1 ore -> 2 gravel, accepting ANY ore by tag. No substance named. */
  { id: 'crusher', name: 'CRUSHER', tw: 2, th: 2,
    parts: [
      ['Footprint', { footing: 2 }],
      ['Buffer',    { cap: { '#ore': 6 } }],
      ['CatchBox',  { mouth: 'top', slack: 2, accepts: ['#ore'] }],
      ['Recipe',    { tag: 'crush' }],
      ['Emitter',   { at: 'bottom', vy: 10 }]
    ],
    look: { body: 'irD', trim: 'irB', base: 'limeD', shake: true,
            pips: [{ sel: '#ore', row: 0 }] } },

  /* ---- THE KILN. 2 gravel -> 1 brick, and it BAKES: the `bake` recipe row
          declares `heat: 0.2`, the Burner part supplies it from any '#fuel'.
          Written by copying the crusher and adding two lines. ------------- */
  { id: 'kiln', name: 'KILN', tw: 2, th: 2,
    parts: [
      ['Footprint', { footing: 2 }],
      ['Buffer',    { cap: { gravel: 6, '#fuel': 2 } }],
      ['CatchBox',  { mouth: 'top', slack: 2, accepts: ['gravel', '#fuel'] }],
      ['Burner',    { fuel: '#fuel', secs: 8 }],
      ['Recipe',    { tag: 'bake' }],
      ['HeatEmit',  { field: 'heat', rate: 30 }],
      ['Emitter',   { at: 'bottom', vy: 10 }]
    ],
    look: { body: 'brickB', trim: 'brickA', base: 'brickC', fire: true,
            pips: [{ sel: 'gravel', row: 0 }, { sel: '#fuel', row: 1 }] } },

  /* ---- ONE LIFT STAGE. Five of these, never one continuous cage
          (CLAUDE.md invariant 4). Ascends only while lit, at 11 px/s up
          against 26 px/s down (invariant 5), both tunable names. ---------- */
  { id: 'winch', name: 'WINCH STAGE', tw: 2, th: 3,
    parts: [
      ['Footprint', { footing: 2 }],
      ['Buffer',    { cap: { '#fuel': 4 } }],
      ['CatchBox',  { mouth: 'top', slack: 2, accepts: ['#fuel'] }],
      ['Burner',    { fuel: '#fuel', secs: 6 }],
      ['HeatEmit',  { field: 'heat', rate: 12 }],
      ['Deck',      { span: 96 }]
    ],
    look: { body: 'woodC', trim: 'irB', base: 'irD', fire: true } },

  /* ---- THE BLOOD WINCH. DESIGN's trap boon, offered on cycle 3 when you
          are desperate.

          Diff against `winch` above, in full:
            - Buffer      deleted   (health is not an item, so no stock)
            - CatchBox    deleted   (nothing to catch)
            - Burner      REPLACED BY BloodBurner

          `Deck` and `HeatEmit` are carried over verbatim and both keep
          working: the deck ascends on blood, and the winch still warms the
          shaft it is in, because both of them read the `heat` slot and
          neither has any way to ask what filled it.

          That is it. `Deck` is untouched and cannot tell the difference,
          because it reads the `heat` slot's {hot, level} record and has no
          way to ask what filled it. The recipe engine, the assembler, the
          tunable store, the field seam and the HUD are all untouched.
          Player health does not become a substance. ---------------------- */
  { id: 'bloodWinch', name: 'BLOOD WINCH', tw: 2, th: 3,
    parts: [
      ['Footprint',   { footing: 2 }],
      ['BloodBurner', { secs: 6, hearts: 1 }],
      ['HeatEmit',    { field: 'heat', rate: 12 }],
      ['Deck',        { span: 96 }]
    ],
    look: { body: 'brickC', trim: 'heart', base: 'irD', fire: true, cursed: true } }
];

export const M = Object.freeze(Object.fromEntries(MACHINES.map((m, i) => [m.id, i])));
export const MACH = Object.freeze(MACHINES.map(Object.freeze));
