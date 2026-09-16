/* LAYER data — FORMS: the shapes a substance can be held in, the tile-id
   packing, and the one selector grammar. Frozen. No logic, no state.
   Imports `data/substances.js`. May be imported by `data`, `model`, `rules`,
   `view`.

   massK     multiplies the substance's base mass, so an ingot is denser than
             the ore it came from for every element, with one number.
   hudOrder  secondary sort in the pocket strip; substance order comes first.
   tags      matched by selectors exactly as substance tags are, so "any
             fuel" is expressible without listing fuels.
   subTags   which substance tags may take this form. `ingot` requires
             `metal`, which is why there is no stone ingot and no row saying
             so. This is a POSSIBILITY gate, not a permission: a pair that
             cannot be expressed beats one someone can forget to check.
   tile      present -> a PLACED unit of this form is a wall or ladder tile.
             `block`, `rung`, `stair` and `seed` are the four with one.
             hardK -> multiplies the substance hardness when placed.
             roots -> OPTIONAL. A solid tile DIRECTLY BELOW satisfies this
             form's backing requirement, in addition to the four satisfiers
             `rules/placement.js#placeTile` already accepts, AND the tile
             enters `model/growth.js`'s ledger when written. One key because
             it is one statement about one kind of tile. Absent means the
             existing rule: solid-below added unconditionally would let a
             `rung` stand on a floor with nothing beside it.
   look      OPTIONAL, and only meaningful with a `tile` block. THE FORM
             DRAWS ITSELF -- `view/paint.js#paintTile` skips every generic
             cube pass for a tile whose form declares one. Same
             `{ treatments:[{ fn, ... }] }` shape a substance's `look` uses.
   climbK    OPTIONAL, multiplies `eff('climb')`. Absent means 1; only
             `stair` sets it, at ~1.8x.

   A FORM IS EITHER FEEDSTOCK OR BUILDABLE, NEVER BOTH. A form carrying a
   `tile` block may not be named by any recipe's `in:`, any machine's
   `handFeed.from`, or any tribute demand. */

import { S, SUB, byTag } from './substances.js';

export const FORMS = [

  /* the commented row. */
  { id:'ore', label:'ORE',
    size:4, massK:1.0, hudOrder:1,
    tags:['ore', 'crushable'],
    subTags:['metal'] },

  /* FEEDSTOCK ONLY, NEVER PLACED. Rubble is consumed by four build recipes and
     by a tribute demand, so it may not also be a tile. The way back to solid
     ground is `data/recipes.js#pack`: 5 rubble of one bulk element to 1
     `block`, at native hardness. */
  { id:'gravel', label:'GRAVEL', short:'GRVL',
    size:3, massK:0.5, hudOrder:2,
    tags:['bakeable', 'spoil'],
    subTags:['metal', 'rock'] },

  { id:'ingot', label:'INGOT', short:'ING',
    size:4, massK:1.6, hudOrder:3,
    /* `ingot` tag added alongside `refined` so a recipe can select "any metal
       ingot" the same way `smelt` selects "any ore" -- see `press` in
       `recipes.js`. `refined` stays a broader tag for anything smelted-or-
       further, which `plate` also carries; `ingot` is the exact-form tag that
       keeps a press from also accepting a plate fed back into it. */
    tags:['refined', 'ingot'],
    subTags:['metal'] },

  /* FEEDSTOCK ONLY, NEVER PLACED. A log is fuel and a bare ingredient in five
     recipes, so it may not also be a tile; `recipes.js#peg_rungs` is the only
     route to a placeable timber ladder.

     Only a PLACED form has ever climbed. `rules/generate.js#trees` writes
     trunks as NATIVE, and a NATIVE byte reads the SUBSTANCE's `tile` block,
     which carries no `climb` key. */
  { id:'log', label:'LOG',
    size:4, massK:1.0, hudOrder:4,
    tags:['fuel'],
    subTags:['organic'] },

  /* A trinket's only form: not mineable, not smeltable, not tile-capable.
     `subTags:['relic']` is what keeps it from matching an ore selector by
     accident. One form covers every trinket that will ever exist. */
  { id:'relic', label:'RELIC',
    size:4, massK:1.0, hudOrder:5,
    tags:['relic'],
    subTags:['relic'] },

  /* The SECOND compression tier, 12:1 in ore terms, since a plate is 3 ingots
     at the 4:1 ingot ratio. Same `subTags:['metal']` as `ingot`, so whatever
     cannot become an ingot cannot become a plate. Denser than ingot's 1.6,
     because a plate is the more compact good. No `tile` block: there is no
     plate wall to dig back out of. `hudOrder` is appended rather than slotted
     beside `ingot`, to avoid renumbering an existing row. */
  { id:'plate', label:'PLATE', short:'PLT',
    size:4, massK:2.4, hudOrder:6,
    tags:['refined', 'plate'],
    subTags:['metal'] },

  /* The carried light: a hollow fennel stalk of stolen fire, held and burned
     down over `eff('brandSecs')`, never placed. `subTags:['organic']`, so
     timber is the only substance that takes it. `massK:0.3` because `kindle`
     turns ONE log into THREE, and 3 x 0.3 = 0.9 stays under the log's 1.0 --
     nothing is created here, only split lighter. */
  { id:'brand', label:'BRAND',
    size:3, massK:0.3, hudOrder:7,
    tags:['fuel', 'light'],
    subTags:['organic'] },

  /* The one form a miracle may take, kept separate from `relic` on purpose:
     folding a miracle into `relic` would let it satisfy any trinket selector
     reading `#relic`. No `tile` block -- a held one-shot, never terrain. */
  { id:'phial', label:'PHIAL',
    size:3, massK:0.2, hudOrder:8,
    tags:['miracle'],
    subTags:['miracle'] },

  /* A cheap, dedicated ladder peg, and the ONLY climbable timber tile there is
     now that `log` is feedstock only. `recipes.js#peg_rungs` is the only way
     to get one. `massK:0.3` matches `brand`, and `hardK:0.20` is softer than
     the placed log's old 0.30 -- the flimsiest climbable in the game, on
     purpose. No tag membership, so no selector can find it by accident.

     The `look` block draws 1 px rails inset one pixel in `woodC` with a
     `woodA` rung every third BAND ROW, never every third row of the tile.
     `woodD` is named but unused at `tread:1`, so the row need not change
     shape if a deeper peg is ever wanted. */
  { id:'rung', label:'LADDER',
    size:3, massK:0.3, hudOrder:9,
    tags:[],
    subTags:['organic'],
    tile:{ solid:false, climb:true, hardK:0.20 },
    look:{ treatments:[{ fn:'ladder', body:'woodC', hi:'woodA', lo:'woodD',
                         inset:1, every:3, tread:1 }] } },

  /* The tier-2 ladder. `climbK` is a per-form multiplier into `eff('climb')`,
     so a stair is a faster VERB rather than a capability gate; absent on every
     other form, which all climb at exactly `eff('climb')`. `massK:3.0` leaves
     waste headroom under `daedalan`'s ceiling of 4.0. No `hardK` override, so
     a bronze stair recovers at plain copper hardness.

     The `look` block is `rung`'s treatment with three numbers changed -- rails
     on the tile's edges rather than inset, a 2 px tread every FOURTH band row,
     and copper. KNOWN LIMITATION: a form `look` cannot see which substance it
     was crossed with, so a hypothetical `tin/stair` would draw in copper. */
  { id:'stair', label:'STAIR',
    size:4, massK:3.0, hudOrder:10, climbK:1.8,
    tags:[],
    subTags:['metal'],
    tile:{ solid:false, climb:true },
    look:{ treatments:[{ fn:'ladder', body:'cuC', hi:'cuA', lo:'cuD',
                         inset:0, every:4, tread:2 }] } },

  /* A MACHINE, held: the shared form every machine-item substance takes.

     No `tile` block, on purpose. A machine is placed as a multi-tile
     STRUCTURE through `rules/placement.js#placeMachine`, never as grid
     terrain -- unlike `rung`/`stair`/`block`, which place one tile through
     `placeTile`. `massK:1.0`, so a machine substance's own `item.mass` IS the
     carried mass with no second multiplier. */
  { id:'rig', label:'RIG', short:'RIG',
    size:4, massK:1.0, hudOrder:11,
    tags:['machine', 'placeable'],
    subTags:['machine'] },

  /* PACKED EARTH, the way back to solid ground. One form covers soil AND stone
     AND any future `bulk` element, because `recipes.js#pack`'s `subFrom`
     carries the element across as `smelt` does from ore.

     `subTags:['bulk']` is the whole of "a deposit is never player-placeable":
     `crossable(granite, block)` is FALSE, so the pair cannot be constructed,
     let alone placed. `massK:2.0` is twice the base mass, because a block is
     COMPACTED where rubble is loose. `hardK:1.0` recovers at NATIVE hardness,
     and `climb:false` -- a wall, not a rung. */
  { id:'block', label:'BLOCK', short:'BLK',
    size:4, massK:2.0, hudOrder:12,
    tags:['built'],
    subTags:['bulk'],
    tile:{ solid:true, climb:false, hardK:1.0 } },

  /* THE ONLY THING IN THE GAME THAT TURNS INTO SOMETHING ELSE BY ITSELF.
     `rules/mining.js` drops one when the LAST trunk tile of a tree breaks;
     placing it plants it; `rules/growth.js` accumulates seconds and at
     `eff('treeGrowSecs')` replaces it with NATIVE trunk tiles.
     `subTags:['organic']`, so `timber/seed` is the real pair and there is no
     `acorn` row. `massK:0.1` engages mass conservation not at all, since NO
     RECIPE PRODUCES A SEED. `solid:false, climb:false` -- one that blocked
     movement would be a trap you planted, one that climbed a free rung at a
     tenth of the mass. `hardK:0.05` is near-instant. `tags:[]`, so no
     selector finds it. */
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

/* A tile stores one byte, and this is the whole of it.
     0     AIR
     255   BEDROCK / world edge
     else  1 + subOrd * STRIDE + (formOrd + 1)

   `formOrd === NATIVE` is the element as it comes out of the ground. Any other
   form is a PLACED unit. The stride is `FORM.length + 1`, so a byte holds 17
   substances' worth of ordinals and the last that fits is `PACKABLE_LIMIT`.
   The guard below fails the build rather than wrapping silently. A FORM is
   cheap; a tile-capable SUBSTANCE is not appendable at all. */

export const NATIVE  = -1;
export const AIR     = 0;
export const BEDROCK = 255;
const STRIDE = FORM.length + 1;

/* The byte is priced against PACKABLE substances, not every substance: a
   substance is packable iff it is native terrain OR some tile-capable form is
   a legal crossing for it, and those forms admit only organic, metal and
   bulk. Pricing every row as tile-capable read 228 of 255 and refused a new
   row, where real usage is 108.

   `rules/miracles.js`'s transmute is the one writer passing through neither
   worldgen nor `placeTile`, so the content lint requires its substance to be
   packable and to exist: a non-packable ordinal overflows 255 and WRAPS into
   an unrelated pair, and a missing one packs to NaN, stored as AIR. */

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

/* THE ONE SELECTOR GRAMMAR. `subPart` then a slash then `formPart`, each part
   a star, a bare id, or a hash-tag. A missing form part means "any form". One
   implementation, so the machine interpreter, the catch box and the resolver
   cannot disagree about what "any ore" means.

     star-slash-hash-ore     any element in any ore-tagged form
     star-slash-hash-fuel    any element in any fuel-tagged form
     copper-slash-ingot      exactly copper ingots
     timber                  timber in any form
     hash-metal-slash-gravel crushed metal, whatever the metal

   Spelled in words because a star followed by a slash closes this comment.
   The literals appear in `recipes.js`. */

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

/* ordering. One rule for anything that lists held things: substance
        first, then form. Exported so the HUD and a future tribute panel
        cannot drift apart. */
export const byHudOrder = (a, b) =>
  ((SUB[a.sub].item?.hud?.order ?? 99) - (SUB[b.sub].item?.hud?.order ?? 99)) ||
  (FORM[a.form].hudOrder - FORM[b.form].hudOrder);

/* Display name for a pair, built from two rows. Nothing hand-writes
   "COPPER INGOT". */
export const labelOf = (subOrd, formOrd) =>
  `${SUB[subOrd].name} ${FORM[formOrd].label}`.trim();

/* POLISH: the abbreviated twin of `labelOf`, for the places a full name
   clips -- the narrow crafting grid's bill-of-materials lines, a recipe
   tooltip's inline references, and the boon timer stack. `short` is a real,
   hand-authored word on the row (`data/substances.js`/`data/forms.js`), not
   a runtime truncation: this project draws with `R()`/`drawText()` only, has
   no `clip()` and no CSS ellipsis, so slicing a full name to
   fit would either cut a word mid-letter or need its own clipping machinery
   -- both worse than shipping the short word as data. Falls back to the full
   name/label wherever a row has not been given one, so adding a substance or
   form never breaks this by omission. */
export const shortLabelOf = (subOrd, formOrd) =>
  `${SUB[subOrd].short || SUB[subOrd].name} ${FORM[formOrd].short || FORM[formOrd].label}`.trim();
