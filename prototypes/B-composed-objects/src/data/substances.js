import { P } from '../core/palette.js';

/* ============================================================
   SUBSTANCES — one row per element. The only place the word "copper"
   appears in the codebase.

   Rock hardness, item mass, HUD colour, mining yield and paint treatments
   are aspects of ONE row. A row names nothing about machines: machines
   discover substances through sim/match.js patterns.

   Read data/forms.js first -- it states the rule for whether a new thing
   is a row here or a row there. The brief's six "substances" are three
   elements below x four forms in FORMS:
       copper/tin -> ore, gravel, ingot, brick        timber -> log

   `tile.mine.secs` is a BASE value. The effective value goes through
   sim/tunables.js as `hard.<sub>`, so a trinket can soften granite without
   editing this table. The effective-value reader is `hardOf()` in
   sim/tunables.js -- it is there and not here so that every modifiable
   number is read through one file.
   ============================================================ */
export const SUB = {
  copper: {
    name: 'COPPER VEIN', hudOrder: 1, tags: ['metal'],
    forms: ['ore', 'gravel', 'ingot', 'brick'],
    tile: { solid: true, mine: { secs: 0.95, yields: { form: 'ore' } } },
    col:  { a: P.cuA, b: P.cuB, c: P.cuD },            // rock: light / base / dark
    item: { mass: 1.00, col: P.cuA, col2: P.cuC },     // dropped-item swatch
    paint: [['grain'], ['edges'], ['glint', { col: P.veinA, n: 2 }]]
  },

  /* ---- tin: the one-row claim. Added last, and it added nothing else.
     It gets a vein, ore, gravel, ingot and brick, is smelted by the same
     `smelt` row, crushed by the same `crush` row and baked by the same
     `bake` row, because all three bind $s. ---- */
  tin: {
    name: 'TIN VEIN', hudOrder: 2, tags: ['metal'],
    forms: ['ore', 'gravel', 'ingot', 'brick'],
    tile: { solid: true, mine: { secs: 0.90, yields: { form: 'ore' } } },
    col:  { a: P.tinA, b: P.tinB, c: P.tinD },
    item: { mass: 1.10, col: P.tinC, col2: P.tinB },
    paint: [['grain'], ['edges'], ['glint', { col: P.tinC, n: 2 }]]
  },

  timber: {
    name: 'TIMBER', hudOrder: 3, tags: ['organic'],
    forms: ['log'],
    tile: { solid: true, mine: { secs: 0.35, yields: { form: 'log' } } },
    col:  { a: P.woodB, b: P.woodC, c: P.woodD },
    item: { mass: 0.60, col: P.woodA, col2: P.woodC },
    paint: [['grain'], ['edges']]
  },

  /* Inert filler and the out-of-bounds row. `bedrock` is what tiles.js
     returns outside the world, which deletes the -1 sentinel. */
  lime: {
    name: 'LIMESTONE', hudOrder: 9, tags: ['stone'],
    forms: ['gravel', 'brick'],
    tile: { solid: true, mine: { secs: 0.75, yields: { form: 'gravel' } } },
    col:  { a: P.limeA, b: P.limeB, c: P.limeD },
    item: { mass: 0.80, col: P.limeB, col2: P.limeD },
    paint: [['grain'], ['edges']]
  },
  bedrock: {
    name: 'BEDROCK', hudOrder: 99, tags: ['stone'], forms: [],
    tile: { solid: true, mine: null },
    col:  { a: '#2a2530', b: '#1d1922', c: '#12101a' },
    item: { mass: 9.99, col: '#2a2530', col2: '#12101a' },
    paint: [['grain']]
  },
  air: {
    name: 'AIR', hudOrder: 99, tags: [], forms: [],
    tile: { solid: false, mine: null },
    col:  { a: null, b: null, c: null },
    item: { mass: 0, col: null, col2: null },
    paint: []
  }
};

/* Dense id <-> index mapping, so the tile array can stay a Uint8Array.
   Order is the declaration order of SUB, which makes a save's tile bytes
   depend on this table's ORDER -- sim/save.js writes substance NAMES for
   that reason. */
export const SUB_IDS = Object.keys(SUB);
export const subIndex = {};
SUB_IDS.forEach((k, i) => { subIndex[k] = i; });
export const AIR = subIndex.air;
