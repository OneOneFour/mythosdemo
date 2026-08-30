/* LAYER data — FORMS: the shapes a substance can be held in, the tile-id
   packing, and the one selector grammar. Frozen. No logic, no state.
   Imports `data/substances.js`. May be imported by `data`, `model`, `rules`,
   `view`.

   ============================================================================
   THE RULE THAT DECIDES WHERE A NEW THING GOES. Stated once, verbatim from the
   design decision, because this exact ambiguity is what the previous content
   model got wrong:

     A SUBSTANCE IS AN ELEMENT. Anything you can hold is substance x form.
     If a new thing has no element of its own, it is a FORM of the element
     it came from -- not a new substance. A brick is fired copper gravel,
     and stays copper.

   So `gravel`, `ingot` and `log` are forms, not substances. That is why one
   `smelt` row covers every ore in the game, and why adding `tin` -- an element
   -- added no row here at all.
   ============================================================================

     massK     multiplies the substance's base mass. An ingot is denser than the
               ore it came from, for every element, with one number.
     hudOrder  secondary sort in the pocket strip; substance order comes first.
     tags      matched by selectors exactly as substance tags are, so
               "any fuel" is expressible without listing fuels.
     subTags   which substance tags may take this form. `ingot` requires
               `metal`, which is why there is no stone ingot and no row saying so.
     tile      present -> a PLACED unit of this form is a wall/ladder tile.
               Only `log` has one: placing logs is how a ladder is built, and it
               is the same two nouns as a felled tree.
               hardK -> multiplies the substance hardness when placed. */

import { S, SUB, byTag } from './substances.js';

export const FORMS = [

  /* ---- the commented row. ---- */
  { id:'ore', label:'ORE',
    size:4, massK:1.0, hudOrder:1,
    tags:['ore', 'crushable'],
    subTags:['metal'] },

  { id:'gravel', label:'GRAVEL',
    size:3, massK:0.5, hudOrder:2,
    tags:['bakeable', 'spoil'],
    subTags:['metal', 'rock'] },

  { id:'ingot', label:'INGOT',
    size:4, massK:1.6, hudOrder:3,
    tags:['refined'],
    subTags:['metal'] },

  /* The only tile-capable form. `solid:false, climb:true` is the ladder, and
     it is also why a standing tree can be climbed. */
  { id:'log', label:'LOG',
    size:4, massK:1.0, hudOrder:4,
    tags:['fuel'],
    subTags:['organic'],
    tile:{ solid:false, climb:true, hardK:0.30 } }
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

/* ---- tile id packing -------------------------------------------------------
   A tile stores one byte. ARCHITECTURE section 2 names this as the stated cost
   of substance x form, and here is the whole of it.

     0     AIR
     255   BEDROCK / world edge
     else  1 + subOrd * STRIDE + (formOrd + 1)

   `formOrd === NATIVE` is the element as it comes out of the ground -- a copper
   vein, a granite wall, a standing trunk. Any other form is a PLACED unit.
   With four forms the stride is five, so a byte holds 50 substances; the guard
   below fails the build rather than wrapping silently. */

export const NATIVE  = -1;
export const AIR     = 0;
export const BEDROCK = 255;
const STRIDE = FORM.length + 1;

if (1 + (SUB.length - 1) * STRIDE + FORM.length >= BEDROCK)
  throw new Error(`forms: ${SUB.length} substances x ${FORM.length} forms overflows the tile byte`);

export const packTile = (subOrd, formOrd = NATIVE) => 1 + subOrd * STRIDE + (formOrd + 1);

export const subOfTile  = byte => ((byte - 1) / STRIDE) | 0;
export const formOfTile = byte => (byte - 1) % STRIDE - 1;

/* ---- the one selector grammar ----------------------------------------------
   `subPart` then a slash then `formPart`, where each part is a star, a bare id,
   or a hash-tag. A missing form part means "any form". There is exactly one
   implementation, so the machine interpreter, the catch box and the resolver
   cannot disagree about what "any ore" means.

     star-slash-hash-ore     any element in any ore-tagged form  <- smelt input
     star-slash-hash-fuel    any element in any fuel-tagged form
     copper-slash-ingot      exactly copper ingots
     timber                  timber in any form
     hash-metal-slash-gravel crushed metal, whatever the metal

   (Spelled out in words rather than symbols because a star followed by a slash
   closes this comment. The literals themselves appear in `recipes.js`.)
   ---------------------------------------------------------------------------- */

const idsOf = (part, tagIndex, idIndex) =>
  part === '*' ? null
  : part.charCodeAt(0) === 35 ? (tagIndex[part.slice(1)] || [])
  : (idIndex[part] === undefined ? [] : [idIndex[part]]);

/* Parsed once per distinct selector string and memoised: selectors appear in
   frozen data, so the set is finite and known before the first frame. */
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

/* Does this pair satisfy the selector? `null` on a side means "anything",
   which is what makes a star cost no array scan. */
export function matches(sel, subOrd, formOrd) {
  const p = parseSel(sel);
  if (p.subs  && !p.subs.includes(subOrd))   return false;
  if (p.forms && !p.forms.includes(formOrd)) return false;
  return true;
}

/* Every legal pair a selector covers. Used by the resolver to prove a selector
   is not empty -- an empty one is the failure that let tin accumulate forever
   in a buffer no recipe consumed. */
export function expand(sel) {
  const p = parseSel(sel);
  const subs  = p.subs  || SUB.map((_, i) => i);
  const forms = p.forms || FORM.map((_, i) => i);
  const out = [];
  for (const s of subs) for (const f of forms) if (crossable(s, f)) out.push({ sub:s, form:f });
  return out;
}

/* ---- ordering. One rule for anything that lists held things: substance
        first, then form. Exported so the HUD and a future tribute panel
        cannot drift apart. ---- */
export const byHudOrder = (a, b) =>
  ((SUB[a.sub].item?.hud?.order ?? 99) - (SUB[b.sub].item?.hud?.order ?? 99)) ||
  (FORM[a.form].hudOrder - FORM[b.form].hudOrder);

/* Display name for a pair, built from two rows. Nothing hand-writes
   "COPPER INGOT". */
export const labelOf = (subOrd, formOrd) =>
  `${SUB[subOrd].name} ${FORM[formOrd].label}`.trim();
