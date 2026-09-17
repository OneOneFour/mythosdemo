/* data layer — the shapes a substance can be held in, the tile-id packing,
   and the one selector grammar. Frozen. No logic, no state. Imports
   `data/substances.js`.

   massK     multiplies the substance's base mass, in talents.
   hudOrder  secondary sort in the pocket strip; substance order comes first.
   tags      matched by selectors exactly as substance tags are.
   subTags   which substance tags may take this form. A pair whose substance
             carries none of them cannot be expressed at all.
   tile      present -> a placed unit of this form is a wall or ladder tile.
             hardK -> multiplies the substance hardness when placed.
             roots -> a solid tile directly below satisfies this form's
             backing requirement, on top of the satisfiers
             `rules/placement.js#placeTile` accepts, and the tile enters
             `model/growth.js`'s ledger when written.
   look      only meaningful with a `tile` block: `view/paint.js#paintTile`
             skips every generic cube pass for a tile whose form declares
             one. Same `{ treatments:[{ fn, ... }] }` shape a substance's
             `look` uses.
   climbK    multiplies `eff('climb')`. Absent means 1.

   A form carrying a `tile` block may not be named by any recipe's `in:`, any
   machine's `handFeed.from`, or any tribute demand. */

import { S, SUB, byTag } from './substances.js';

export const FORMS = [

  { id:'ore', label:'ORE',
    size:4, massK:1.0, hudOrder:1,
    tags:['ore', 'crushable'],
    subTags:['metal'] },

  /* Feedstock only; `data/recipes.js#pack` is the route to a `block`. */
  { id:'gravel', label:'GRAVEL', short:'GRVL',
    size:3, massK:0.5, hudOrder:2,
    tags:['bakeable', 'spoil'],
    subTags:['metal', 'rock'] },

  { id:'ingot', label:'INGOT', short:'ING',
    size:4, massK:1.6, hudOrder:3,
    /* `refined` also covers `plate`, so `ingot` is the exact-form tag a
       press selects on to avoid eating its own output. */
    tags:['refined', 'ingot'],
    subTags:['metal'] },

  /* Feedstock only; `data/recipes.js#peg_rungs` is the route to a `rung`. */
  { id:'log', label:'LOG',
    size:4, massK:1.0, hudOrder:4,
    tags:['fuel'],
    subTags:['organic'] },

  /* A trinket's only form. */
  { id:'relic', label:'RELIC',
    size:4, massK:1.0, hudOrder:5,
    tags:['relic'],
    subTags:['relic'] },

  /* Three ingots, so 12 ore per plate at the 4:1 ingot ratio. */
  { id:'plate', label:'PLATE', short:'PLT',
    size:4, massK:2.4, hudOrder:6,
    tags:['refined', 'plate'],
    subTags:['metal'] },

  /* The carried light: held and burned down over `eff('brandSecs')`, never
     placed. `kindle` splits one log into three, so 3 x 0.3 stays under 1.0. */
  { id:'brand', label:'BRAND',
    size:3, massK:0.3, hudOrder:7,
    tags:['fuel', 'light'],
    subTags:['organic'] },

  /* The one form a miracle may take, kept out of `#relic` selectors. */
  { id:'phial', label:'PHIAL',
    size:3, massK:0.2, hudOrder:8,
    tags:['miracle'],
    subTags:['miracle'] },

  /* `every:3` in the `look` block counts band rows, not rows within the
     tile. `lo` is unused at `tread:1`. */
  { id:'rung', label:'LADDER',
    size:3, massK:0.3, hudOrder:9,
    tags:[],
    subTags:['organic'],
    tile:{ solid:false, climb:true, hardK:0.20 },
    look:{ treatments:[{ fn:'ladder', body:'woodC', hi:'woodA', lo:'woodD',
                         inset:1, every:3, tread:1 }] } },

  /* No `hardK`, so a stair recovers at its substance's own hardness. A form
     `look` cannot see which substance it was crossed with, so `tin/stair`
     draws in copper. */
  { id:'stair', label:'STAIR',
    size:4, massK:3.0, hudOrder:10, climbK:1.8,
    tags:[],
    subTags:['metal'],
    tile:{ solid:false, climb:true },
    look:{ treatments:[{ fn:'ladder', body:'cuC', hi:'cuA', lo:'cuD',
                         inset:0, every:4, tread:2 }] } },

  /* No `tile` block: a machine is placed as a multi-tile structure through
     `rules/placement.js#placeMachine`, never as grid terrain. `massK:1.0`,
     so the substance's own `item.mass` is the carried mass. */
  { id:'rig', label:'RIG', short:'RIG',
    size:4, massK:1.0, hudOrder:11,
    tags:['machine', 'placeable'],
    subTags:['machine'] },

  /* `subTags:['bulk']` makes `crossable(granite, block)` false, so no
     deposit pair can be built. */
  { id:'block', label:'BLOCK', short:'BLK',
    size:4, massK:2.0, hudOrder:12,
    tags:['built'],
    subTags:['bulk'],
    tile:{ solid:true, climb:false, hardK:1.0 } },

  /* `rules/mining.js` drops one when the last trunk tile of a tree breaks;
     placing it plants it, and `rules/growth.js` replaces it with native
     trunk tiles after `eff('treeGrowSecs')`. No recipe produces one. */
  { id:'seed', label:'SEED',
    size:2, massK:0.1, hudOrder:13,
    tags:[],
    subTags:['organic'],
    tile:{ solid:false, climb:false, hardK:0.05, roots:true } }
];

export const FORM = Object.freeze(FORMS.map(Object.freeze));
export const F    = Object.freeze(Object.fromEntries(FORM.map((f, i) => [f.id, i])));

export const formsByTag = Object.freeze(FORM.reduce((m, f, i) => {
  for (const t of f.tags || []) (m[t] = m[t] || []).push(i);
  return m;
}, {}));

/* Is this crossing legal content? `subTags` is the whole rule. */
export const crossable = (subOrd, formOrd) => {
  const need = FORM[formOrd]?.subTags;
  const have = SUB[subOrd]?.tags || [];
  return !!need && need.some(t => have.includes(t));
};

/* A tile stores one byte:
     0     air
     255   bedrock / world edge
     else  1 + subOrd * STRIDE + (formOrd + 1)

   `formOrd === NATIVE` is the element as it comes out of the ground; any
   other form is a placed unit. The stride is `FORM.length + 1`, so the last
   substance ordinal that fits is `PACKABLE_LIMIT`, and the guard below fails
   the build rather than wrapping. */

export const NATIVE  = -1;
export const AIR     = 0;
export const BEDROCK = 255;
const STRIDE = FORM.length + 1;

/* Packable iff native terrain or some tile-capable form crosses with it. An
   unpackable ordinal wraps past 255 into an unrelated pair and a missing one
   packs to NaN, so the lint checks transmute's substance. */

const TILE_FORMS = FORM.reduce((a, f, i) => (f.tile ? (a.push(i), a) : a), []);

export const packable = subOrd =>
  !!SUB[subOrd]?.tile || TILE_FORMS.some(f => crossable(subOrd, f));

/* The highest ordinal that can reach the byte today, and the highest that
   would still fit under BEDROCK. */
export const PACKABLE_MAX   = SUB.reduce((m, _, i) => (packable(i) ? i : m), -1);
export const PACKABLE_LIMIT = ((BEDROCK - 2 - FORM.length) / STRIDE) | 0;

if (1 + PACKABLE_MAX * STRIDE + FORM.length >= BEDROCK)
  throw new Error(
    `forms: ${SUB.length} substances x ${FORM.length} forms overflows the tile byte ` +
    `-- packable ordinal ${PACKABLE_MAX} ("${SUB[PACKABLE_MAX]?.id}") packs to ` +
    `${1 + PACKABLE_MAX * STRIDE + FORM.length}, and ordinal ${PACKABLE_LIMIT} is the last ` +
    `that fits (tile-capable headroom ${PACKABLE_LIMIT - PACKABLE_MAX} rows)`);

export const packTile = (subOrd, formOrd = NATIVE) => 1 + subOrd * STRIDE + (formOrd + 1);

export const subOfTile  = byte => ((byte - 1) / STRIDE) | 0;
export const formOfTile = byte => (byte - 1) % STRIDE - 1;

/* The selector grammar: `subPart`, a slash, then `formPart`, each part a
   star, a bare id, or a hash-tag. A missing form part means any form.

     star-slash-hash-ore     any element in any ore-tagged form
     star-slash-hash-fuel    any element in any fuel-tagged form
     copper-slash-ingot      exactly copper ingots
     timber                  timber in any form
     hash-metal-slash-gravel crushed metal, whatever the metal

   Spelled in words because a star followed by a slash would close this
   comment. The literals appear in `recipes.js`. */

const idsOf = (part, tagIndex, idIndex) =>
  part === '*' ? null
  : part.charCodeAt(0) === 35 ? (tagIndex[part.slice(1)] || [])
  : (idIndex[part] === undefined ? [] : [idIndex[part]]);

/* Memoised per distinct selector string; selectors appear only in frozen
   data, so the set is finite. */
const cache = new Map();

export function parseSel(sel) {
  let p = cache.get(sel);
  if (p) return p;
  const slash = sel.indexOf('/');
  const sp = slash < 0 ? sel : sel.slice(0, slash);
  const fp = slash < 0 ? '*'  : sel.slice(slash + 1);
  p = Object.freeze({ sel, subs: idsOf(sp, byTag, S), forms: idsOf(fp, formsByTag, F) });
  cache.set(sel, p);
  return p;
}

/* Does this pair satisfy the selector? `null` on a side means anything. */
export function matches(sel, subOrd, formOrd) {
  const p = parseSel(sel);
  if (p.subs  && !p.subs.includes(subOrd))   return false;
  if (p.forms && !p.forms.includes(formOrd)) return false;
  return true;
}

/* Every legal pair a selector covers. The resolver uses it to prove a
   selector is not empty. */
export function expand(sel) {
  const p = parseSel(sel);
  const subs  = p.subs  || SUB.map((_, i) => i);
  const forms = p.forms || FORM.map((_, i) => i);
  const out = [];
  for (const s of subs) for (const f of forms) if (crossable(s, f)) out.push({ sub:s, form:f });
  return out;
}

/* Sort order for anything that lists held things: substance, then form. */
export const byHudOrder = (a, b) =>
  ((SUB[a.sub].item?.hud?.order ?? 99) - (SUB[b.sub].item?.hud?.order ?? 99)) ||
  (FORM[a.form].hudOrder - FORM[b.form].hudOrder);

/* Display name for a pair, built from the substance and form rows. */
export const labelOf = (subOrd, formOrd) =>
  `${SUB[subOrd].name} ${FORM[formOrd].label}`.trim();

/* Abbreviated twin of `labelOf`, for the places a full name clips. `short`
   is authored on the row and falls back to the full name or label. */
export const shortLabelOf = (subOrd, formOrd) =>
  `${SUB[subOrd].short || SUB[subOrd].name} ${FORM[formOrd].short || FORM[formOrd].label}`.trim();
