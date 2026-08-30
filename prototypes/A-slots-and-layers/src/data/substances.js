/* ============================================================
   SUBSTANCES — one row is the whole of a substance.

   Physics, item identity, appearance, HUD placement and where worldgen puts
   it are all aspects of ONE row in ONE file. Nothing outside this file names
   a substance. Array index is the tile id byte, so at most 256 rows.

   Any block may be omitted, and an absent block is a declaration:
     no `tile` -> it can never be a wall (gravel, ingot, brick)
     no `item` -> it can never be carried (air, bedrock)
     no `gen`  -> worldgen never places it

   Selector grammar, used by recipes and buffer caps. Three forms, no more:
     'copper'     an exact substance
     '#ore'       any substance carrying that tag
     '@smeltsTo'  the named FIELD of the substance a #tag input bound to
   ============================================================ */

export const SUBSTANCES = [

  { id: 'air', name: 'AIR',
    tile: { solid: false } },

  { id: 'bedrock', name: 'BEDROCK',
    tile: { solid: true, hard: Infinity },
    look: { base: 'abyC', hi: 'abyC', lo: 'abyC' } },

  { id: 'soil', name: 'SOIL',
    tags: ['mineable'],
    tile: { solid: true, hard: 0.30, drop: 'soil' },
    item: { label: 'SOIL', size: 3, mass: 0.5, hud: { order: 6 } },
    look: { base: 'soilB', hi: 'soilA', lo: 'soilC', item: ['soilA', 'soilC'],
            treatments: [['grain'], ['edges']] },
    gen:  { fill: { fromTy: 0, toTy: 40 } } },

  { id: 'granite', name: 'GRANITE',
    tags: ['mineable', 'stone'],
    tile: { solid: true, hard: 2.40, drop: 'gravel' },
    look: { base: 'irC', hi: 'irB', lo: 'irD',
            treatments: [['grain'], ['edges']] },
    gen:  { fill: { fromTy: 40, toTy: 384 } } },

  /* --- the ore the game opens on ------------------------------------- */
  { id: 'copper', name: 'COPPER VEIN',
    tags: ['ore', 'mineable'],
    smeltsTo: 'ingot',                     // read by the smelt recipe's '@smeltsTo'
    tile: { solid: true, hard: 0.95, drop: 'copper' },
    item: { label: 'COPPER', size: 4, mass: 1.00, hud: { order: 1, always: true } },
    look: { base: 'cuB', hi: 'cuA', lo: 'cuD', item: ['cuA', 'cuC'],
            treatments: [['grain'], ['edges'], ['glint', { col: 'veinA', n: 2 }]],
            sfx: { break: 'ore', pickup: 'pickup' } },
    gen:  { blobs: { fromTy: 38, chance: 0.25, r: [1.6, 3.8], count: 90 } } },

  /* --- fuel. The '#fuel' tag is what Burner spends; nothing hardcodes
         'timber' anywhere in rules/. -------------------------------------- */
  { id: 'timber', name: 'TIMBER',
    tags: ['mineable', 'fuel'],
    tile: { solid: true, hard: 0.35, drop: 'timber' },
    item: { label: 'TIMBER', size: 4, mass: 0.60, hud: { order: 2, always: true } },
    look: { base: 'woodB', hi: 'woodA', lo: 'woodD', item: ['woodA', 'woodC'],
            treatments: [['grain'], ['edges']] },
    gen:  { blobs: { fromTy: 8, chance: 0.10, r: [1.2, 2.4], count: 30 } } },

  { id: 'ingot', name: 'INGOT',
    tags: ['refined'],
    item: { label: 'INGOT', size: 4, mass: 1.60, hud: { order: 3 } },
    look: { item: ['cuA', 'cuB'], shiny: true, sfx: { pickup: 'ingot' } } },

  { id: 'gravel', name: 'GRAVEL',
    tags: ['crushed'],
    item: { label: 'GRAVEL', size: 3, mass: 0.60, hud: { order: 4 } },
    look: { item: ['limeB', 'limeD'] } },

  /* --- added with the kiln. One row. ---------------------------------- */
  { id: 'brick', name: 'FIREBRICK',
    tags: ['refined', 'building'],
    item: { label: 'BRICK', size: 4, mass: 1.20, hud: { order: 5 } },
    look: { item: ['brickA', 'brickC'],
            /* "this material glows" is this row and nothing else. `glow` is
               already a treatment in view/treatments.js; no paint function
               is edited, no branch is added anywhere. */
            treatments: [['glow', { col: 'hot', r: 6, a: 0.3 }]] } },

  /* --- ADDED LAST, to test the one-row claim. Everything below is what
         one row buys: a vein worldgen places, a mineable tile, a carryable
         item, a HUD swatch, a paint treatment, acceptance by the crusher
         (via #ore) and by the furnace (via #ore), and a tin ingot out of
         the furnace (via @smeltsTo) with no edit to the furnace row. ---- */
  { id: 'tin', name: 'TIN VEIN',
    tags: ['ore', 'mineable'],
    smeltsTo: 'ingot',
    tile: { solid: true, hard: 1.10, drop: 'tin' },
    item: { label: 'TIN', size: 3, mass: 1.00, hud: { order: 7 } },
    look: { base: 'irB', hi: 'irA', lo: 'irD', item: ['irA', 'irC'],
            treatments: [['grain'], ['edges'], ['glint', { col: 'limeA', n: 2 }]],
            sfx: { break: 'ore', pickup: 'pickup' } },
    gen:  { blobs: { fromTy: 60, chance: 0.18, r: [1.6, 3.8], count: 70 } } }
];

/* Derived indices, built once and frozen. */
export const SUB = Object.freeze(SUBSTANCES.map(Object.freeze));
export const S = Object.freeze(Object.fromEntries(SUBSTANCES.map((s, i) => [s.id, i])));
export const AIR = S.air;

export const BY_TAG = Object.freeze(SUBSTANCES.reduce((m, s, i) => {
  for (const t of s.tags || []) (m[t] = m[t] || []).push(i);
  return m;
}, {}));

/* The one implementation of the selector grammar. Returns substance indices.
   Throws on a selector that resolves to nothing — a typo'd tag is a crash at
   assembly, not a machine that silently never runs. */
export function matches(sel) {
  if (sel === '*') return SUBSTANCES.map((_, i) => i);
  if (sel[0] === '#') {
    const hit = BY_TAG[sel.slice(1)];
    if (!hit) throw new Error(`no substance carries the tag ${sel}`);
    return hit;
  }
  if (sel[0] === '@') return [];              // resolved per-run from the binding
  const i = S[sel];
  if (i === undefined) throw new Error(`unknown substance '${sel}'`);
  return [i];
}
