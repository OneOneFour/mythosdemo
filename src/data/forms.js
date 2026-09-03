/* LAYER data — FORMS: the shapes a substance can be held in, the tile-id
   packing, and the one selector grammar. Frozen. No logic, no state.
   Imports `data/substances.js`. May be imported by `data`, `model`, `rules`,
   `view`.

   See docs/DEVELOPER_GUIDE.md#adding-a-form for the rule that decides whether a
   new thing is a row here or a row in `substances.js`.

     massK     multiplies the substance's base mass. An ingot is denser than the
               ore it came from, for every element, with one number.
     hudOrder  secondary sort in the pocket strip; substance order comes first.
     tags      matched by selectors exactly as substance tags are, so
               "any fuel" is expressible without listing fuels.
     subTags   which substance tags may take this form. `ingot` requires
               `metal`, which is why there is no stone ingot and no row saying so.
     tile      present -> a PLACED unit of this form is a wall/ladder tile.
               `block`, `rung` and `stair` are the three that have one:
               placing a `rung` or a `stair` is how a ladder is built, and
               placing a `block` is how a hole is filled back in.
               hardK -> multiplies the substance hardness when placed.

               A FORM IS EITHER FEEDSTOCK OR BUILDABLE, NEVER BOTH
               (CLAUDE.md D12). A form carrying a `tile` block may not also be
               named by any recipe's `in:` selector, any machine's
               `handFeed.from`, or any tribute demand. `gravel` and `log` both
               violated that and both lost their `tile` block in Phase 14a --
               see their own rows below, and docs/SPEC.md section 19.
     look      OPTIONAL, and only meaningful on a form that also has a `tile`
               block. THE FORM DRAWS ITSELF: `view/paint.js#paintTile` skips
               every generic cube pass -- base fill, grain, lit top face, cliff
               faces, bottom shade line and the SUBSTANCE's own treatments --
               for any tile whose form declares one, and draws this instead
               over whatever the space would otherwise have been. Same
               `{ treatments:[{ fn, ...}] }` shape a substance's `look` uses and
               the same `view/treatments.js#TREAT` table, so `npm run check`
               validates the `fn` and the colour names here exactly as it does
               there. `rung` and `stair` are the two rows that have one; a form
               with no `look` is painted as terrain, as every form was before
               Phase 13b.
     climbK    OPTIONAL. Multiplies `eff('climb')` for this form
               (rules/player.js). Absent means 1; only `stair` sets it
               (~1.8x), which is the point of a tier-2 ladder buying
               VERTICAL THROUGHPUT rather than a new capability (Phase 2a). */

import { S, SUB, byTag } from './substances.js';

export const FORMS = [

  /* ---- the commented row. ---- */
  { id:'ore', label:'ORE',
    size:4, massK:1.0, hudOrder:1,
    tags:['ore', 'crushable'],
    subTags:['metal'] },

  /* FEEDSTOCK ONLY, NEVER PLACED -- CLAUDE.md D12, applied here first
     (Phase 14a, docs/PLAN-phase14-mining-and-drops.md D14-A).

     This row used to carry `tile:{ solid:true, climb:false, hardK:0.5 }`, and
     the comment that went with it argued for the half hardness at length:
     mined rubble could be shovelled 1:1 straight back into the hole it came
     out of, softer than any of the four native rocks it drops from. It was
     deleted, along with that argument, for two reasons that are the same
     reason twice:

       1. `gravel` was simultaneously CONSUMED -- by `brazier` (2), `crank`
          (3), `gear` (1) and `belt_r` (4) in `data/recipes.js`, and by
          `salt-tribute`'s 8 granite/gravel demand in `data/cycles.js` -- and
          PLACED. That is exactly the double duty D12 forbids.
       2. While rubble placed 1:1 for free, mined material WAS the placeable
          unit, so nothing in the game ever had to make it a prerequisite.

     The way back to solid ground is now `data/recipes.js#pack`: 5 rubble of
     one bulk element -> 1 `block` of that element, recovered at NATIVE
     hardness rather than half. Backfill costs five tiles' worth per tile and
     is no longer the easiest dig in the game -- deliberately, and stated in
     docs/SPEC.md section 19. */
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

  /* FEEDSTOCK ONLY, NEVER PLACED -- CLAUDE.md D12, and the row that made the
     rule worth naming (Phase 14a, D14-H). A log is fuel (`tags:['fuel']`,
     which the furnace's own `handFeed.from` selects with star-slash-hash-fuel
     -- spelled in words for the reason the grammar block below gives) and a
     bare ingredient in five recipes (`hub`,
     `crank`, `gear`, `axle`, `daedalan`). While it ALSO carried
     `tile:{ solid:false, climb:true, hardK:0.30 }` it was `gravel`'s exact
     double-duty shape on a different substance, and nothing ever forced a
     player through `data/recipes.js#peg_rungs` -- which already existed, is
     unchanged, and is now the only route to a placeable timber ladder: 2 logs
     -> 4 `rung`.

     THE TWO CLAIMS THIS COMMENT USED TO MAKE WERE BOTH FALSE ALREADY, before
     the tile block went. "The only tile-capable form" ignored `rung`, `stair`
     and `gravel`. "It is also why a standing tree can be climbed" was never
     true at all: `rules/generate.js#trees` writes trunks as `NATIVE`, and a
     NATIVE byte reads the SUBSTANCE's own `tile` block, which carries no
     `climb` key -- `model/tiles.js#tileBlockOf`'s form-wins-over-substance
     rule and `rules/player.js#boxClimbK`'s own comment both say so. Only a
     PLACED form has ever climbed. */
  { id:'log', label:'LOG',
    size:4, massK:1.0, hudOrder:4,
    tags:['fuel'],
    subTags:['organic'] },

  /* A trinket's only form: not mineable, not smeltable, not tile-capable --
     `subTags:['relic']` means only a `relic`-tagged substance may cross into
     it, which is what keeps this from ever matching an ore selector by
     accident. One form covers every trinket that will ever exist -- see
     docs/DEVELOPER_GUIDE.md#adding-a-form */
  { id:'relic', label:'RELIC',
    size:4, massK:1.0, hudOrder:5,
    tags:['relic'],
    subTags:['relic'] },

  /* ---- plate: the SECOND compression tier, `docs/DESIGN.md`'s locked
     12:1 ratio (ore terms) -- `docs/SPEC.md` section 8 spells out that a plate
     is 3 ingots, since 3 x the 4:1 ingot ratio is 12:1. Same `subTags:['metal']`
     restriction as `ingot`: a plate is a further-worked ingot, so whatever may
     not become an ingot may not become a plate either. `massK` is denser than
     ingot's 1.6 -- a plate is the more compact good, consistent with the
     compression-ratio thesis that only refined goods are worth lifting.
     No `tile` block: unlike `block`, a plate is never placed as terrain, only
     ever held or banked -- there is no "plate wall" to dig back out of.
     `hudOrder` is appended after `relic` rather than slotted next to `ingot`
     to avoid renumbering an existing row; it still sorts after ingot within
     any one substance's group, which is the only ordering `byHudOrder`
     actually produces (substance first, form second). ---- */
  { id:'plate', label:'PLATE', short:'PLT',
    size:4, massK:2.4, hudOrder:6,
    tags:['refined', 'plate'],
    subTags:['metal'] },

  /* ---- brand: the carried light, and the first form whose substance is not
     metal. A hollow fennel stalk carrying stolen fire (Prometheus) -- held
     and burned down over `eff('brandSecs')`, never placed, so it carries no
     `tile` block. `subTags:['organic']` is the same restriction `log`
     already uses, which is why timber is the only substance that can take
     it today. Lighter than a log: a brand is a stripped stick, not a whole
     trunk -- `massK:0.3`, not the ~0.5 an earlier draft of this row used,
     because `recipes.js#kindle` turns ONE log into THREE brands and
     `tools/content.mjs`'s mass-conservation check is what caught that at
     0.5 a kindled log would net MORE mass than it started as (3 x 0.5 = 1.5
     against the log's massK of 1.0). 0.3 keeps 3 brands (massK sum 0.9) at
     or under one log (massK 1.0), with no `transmute` tag needed because
     nothing is actually being created here, only split lighter. */
  { id:'brand', label:'BRAND',
    size:3, massK:0.3, hudOrder:7,
    tags:['fuel', 'light'],
    subTags:['organic'] },

  /* ---- phial: the one form a miracle may take (CLAUDE.md "Resolved
     decisions" D1). Kept separate from `relic` on purpose: `crossable()`'s
     whole mechanism is the `subTags` gate, and folding a miracle into
     `relic` would let it satisfy any trinket selector that reads `#relic`
     by accident. `subTags:['miracle']` means only a miracle-tagged
     substance (one row per miracle, added in Phase 4) may ever cross into
     it. No `tile` block: a miracle is a held one-shot, never terrain. */
  { id:'phial', label:'PHIAL',
    size:3, massK:0.2, hudOrder:8,
    tags:['miracle'],
    subTags:['miracle'] },

  /* ---- rung: a cheap, dedicated ladder peg (Phase 2a, CLAUDE.md D4's own
     prerequisite -- the encumbrance lockout needs something cheaper than a
     whole log to climb back out on). `timber/log` used to place as a
     climbable tile too, so this was originally the SAME `climb:true` idiom at
     a fraction of the material; since Phase 14a stripped `log`'s `tile` block
     (D12, see that row above) this is the ONLY climbable timber tile there
     is, and `peg_rungs` is the only way to get one.
     `recipes.js#peg_rungs` turns TWO logs into FOUR rungs (not the plan's
     literal one -- see that recipe's own comment for why the quantity is
     load-bearing against a hand-craft priority collision with `kindle`, a
     separate problem from the one below). `massK:0.3`: at the plan's
     original ~0.35 with a 2-log input, 4 x 0.35 = 1.4 stays safely under
     2 logs' 1.6, so this row no longer needs the sharper cut an earlier
     1-log draft required -- but 0.3 was kept anyway, matching `brand`'s own
     massK, since a peg is exactly that same "split lighter, with real
     waste" shape `tools/content.mjs`'s mass-conservation check already
     validated for brand in Phase 1 (4 x 0.3 = 1.2, under 1.6). `hardK:0.20`
     was set softer than the placed log's own 0.30: a single peg is the
     flimsiest climbable in the game, on purpose, and it stays 0.20 now that
     the log it was measured against no longer places at all. No tag
     membership: a rung is not
     fuel, ore or anything else a selector should be able to find by
     accident.

     THE `look` BLOCK IS PHASE 13b (docs/PLAN-phase13.md section 3.3), and it
     is why a placed one no longer reads as a lit wooden cube: 1 px rails inset
     one pixel from each edge in `woodC`, a `woodA` rung every third BAND ROW
     (never every third row of the tile -- `view/treatments.js#ladder` states
     why at length), and nothing in between. `woodD` goes unused at
     `tread:1` and is named anyway so the row does not have to change shape if
     a deeper peg is ever wanted. Timber is the only `organic` substance, so
     these tones are the only ones this form can currently be drawn in. */
  { id:'rung', label:'LADDER',
    size:3, massK:0.3, hudOrder:9,
    tags:[],
    subTags:['organic'],
    tile:{ solid:false, climb:true, hardK:0.20 },
    look:{ treatments:[{ fn:'ladder', body:'woodC', hi:'woodA', lo:'woodD',
                         inset:1, every:3, tread:1 }] } },

  /* ---- stair: the tier-2 ladder, Daedalus's bronze work (Phase 2a).
     `subTags:['metal']` is the same restriction `ingot`/`plate` use, so
     `copper/stair` is the real pair and no new substance is needed.
     `climbK` is NEW: a per-form multiplier into `eff('climb')`
     (`rules/player.js`), so a stair is not a capability gate like a tool
     tier -- it is a faster VERB, the vertical-throughput axis this phase's
     header names as the point. Absent on every other form, which is why
     they all still climb at exactly `eff('climb')`. `massK:3.0` is not a
     plan-specified number: `recipes.js#daedalan` (2 copper/plate + 4
     timber/log -> 2 copper/stair) allows up to 4.0 before violating mass
     conservation (8.0 consumed / 2 produced), and 3.0 leaves real headroom
     for waste -- some of the timber is scaffolding, not structure, and does
     not survive into the stair. No `hardK` override: a bronze stair
     recovers at plain copper hardness, tougher than a rung,
     which is the other half of "tier 2 costs more and is worth it."

     THE `look` BLOCK IS THE SAME FUNCTION AS `rung`'S, WITH THREE NUMBERS
     CHANGED, and that is the point of putting the geometry in one treatment:
     rails on the tile's own edges (`inset:0`) rather than inset, a tread 2 px
     deep every FOURTH band row rather than a 1 px rung every third, and copper
     rather than timber. So the two tiers read apart at a glance -- bright,
     wider-pitched, heavier-railed -- which docs/SPEC.md section 10 asks for and
     which nothing but the label used to deliver.

     THE TONES ARE COPPER'S, NOT THE SUBSTANCE'S, and that is a real limitation
     rather than an oversight: a form `look` cannot see which substance it was
     crossed with, so a hypothetical `tin/stair` would draw in copper. It is not
     reachable today -- `recipes.js#daedalan` is the only source of a stair and
     it produces `copper/stair` -- and threading a substance's resolved (and
     depth-blended) palette into a form treatment is a wider change than this
     row. Parked in docs/FINDINGS.md. */
  { id:'stair', label:'STAIR',
    size:4, massK:3.0, hudOrder:10, climbK:1.8,
    tags:[],
    subTags:['metal'],
    tile:{ solid:false, climb:true },
    look:{ treatments:[{ fn:'ladder', body:'cuC', hi:'cuA', lo:'cuD',
                         inset:0, every:4, tread:2 }] } },

  /* ---- rig: a MACHINE, held. The shared form every machine-item substance
     takes; see docs/DEVELOPER_GUIDE.md#a-machine-is-a-held-item

     No `tile` block, on purpose: a machine is placed as a multi-tile
     STRUCTURE through `model/machines.js`/`rules/placement.js#placeMachine`,
     never as grid terrain -- do not confuse this with `rung`/`stair`/`block`,
     which place as a single terrain tile through `placeTile`.
     `massK:1.0` so a machine substance's own `item.mass`
     (`data/substances.js`) IS the carried item's mass directly, with no
     second multiplier to keep straight -- unlike `ingot`/`plate`, which
     really do compress a shared element differently per form, a `rig`
     substance's mass already IS the machine (see each row's own comment for
     how it derives from the machine's former `cost` bill). */
  { id:'rig', label:'RIG', short:'RIG',
    size:4, massK:1.0, hudOrder:11,
    tags:['machine', 'placeable'],
    subTags:['machine'] },

  /* ---- block: PACKED EARTH, the way back to solid ground (Phase 14a,
     docs/PLAN-phase14-mining-and-drops.md D14-B, docs/SPEC.md section 19).
     One form covers soil AND stone AND any future `bulk` element, because
     `data/recipes.js#pack`'s `out:[{ subFrom:'#bulk/gravel', ... }]` carries
     the element across exactly as `smelt` carries it from ore -- there is no
     `soil_block` row and there never will be.

     `subTags:['bulk']` IS THE LOAD-BEARING HALF, and it is the whole of
     "a deposit is never player-placeable". `crossable(granite, block)` is
     FALSE, so `granite/block` is not a legal pair and cannot be constructed,
     let alone placed -- the same `subTags` gate that keeps a miracle out of a
     trinket selector (`phial` above), used for the same reason: a
     POSSIBILITY that cannot be expressed beats a PERMISSION someone can
     forget to check. With `gravel` and `log` now feedstock-only, the
     tile-capable forms are `rung`/`stair`/`block` admitting
     organic/metal/bulk, and no `deposit` substance has an obtainable
     crossing into any of them. `rules/placement.js` needed no edit at all.

     `massK:2.0` -- twice the element's base mass, because a block is
     COMPACTED where rubble is loose (`gravel.massK` 0.5). It is also the
     largest round value that clears `tools/content.mjs`'s mass-conservation
     check with real waste in both directions: soil 5 x 0.5 x 0.5 = 1.25 in
     against 1 x 0.5 x 2.0 = 1.00 out; stone 5 x 0.6 x 0.5 = 1.50 against
     1 x 0.6 x 2.0 = 1.20. 2.5 is the ceiling.

     `hardK:1.0` -- a packed block recovers at NATIVE hardness (soil 0.50 s,
     stone 1.60 s), not the retired rubble tile's half. Paired with the 5:1
     cost, filling a hole is a real decision now rather than free.
     `climb:false`: it is a wall, not a rung. ---- */
  { id:'block', label:'BLOCK', short:'BLK',
    size:4, massK:2.0, hudOrder:12,
    tags:['built'],
    subTags:['bulk'],
    tile:{ solid:true, climb:false, hardK:1.0 } }
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
   The stride is `FORM.length + 1` -- 13 at the twelve forms above -- so a byte
   holds 19 substances' worth of ordinals and the last one that fits is
   `PACKABLE_LIMIT`. The guard below fails the build rather than wrapping
   silently. A FORM is cheap and a tile-capable SUBSTANCE is not appendable at
   all; that asymmetry is spelled out in `data/substances.js`'s header and in
   docs/SPEC.md section 15. */

export const NATIVE  = -1;
export const AIR     = 0;
export const BEDROCK = 255;
const STRIDE = FORM.length + 1;

/* ---- what the byte actually costs: PACKABLE substances, not every substance.
   Only two things ever reach `packTile`:

     a NATIVE tile   a substance carrying its own `tile` block, written by
                     worldgen -- `packTile(sub)` with `formOrd === NATIVE`.
     a PLACED tile   a held pair whose FORM carries a `tile` block --
                     `rules/placement.js#placeTile` refuses anything else
                     ('THAT DOES NOT BUILD'), and `#placeableFromPockets`
                     handles `rig` down a separate path (`placeMachine` writes
                     a structure through `model/machines.js`, not a tile).

   So a substance is packable iff it is native terrain OR some tile-capable
   form is a legal crossing for it. Nothing else can be handed to `packTile`:
   the three tile-capable forms are `rung` (`subTags` organic), `stair`
   (metal) and `block` (bulk), so no `relic`, `miracle` or `machine` substance
   crosses into any of them -- and, since Phase 14a, no `deposit` substance
   crosses into one either (`block`'s own comment above).

   The guard used to price EVERY row as if it were tile-capable
   (`1 + (SUB.length - 1) * STRIDE + FORM.length`), which at 19 substances read
   228 of 255 and refused the third new row -- while real usage was
   `1 + 8 * 12 + 11 = 108`, because the highest packable ordinal is `adamant`
   at 8 and twelve of the nineteen rows (`bellows`, `pick`, `auger`, `chasm`
   and all eight machine substances) can never be packed at all. That was a
   cost nothing was paying. The narrowing rests on one fact this file cannot
   check on its own -- that a crossable-with-a-tile-form substance really is
   terrain -- so `tools/content.mjs` assertion 16 enforces it, and a substance
   with no `tile` block placed as terrain would in any case be a wall of
   `Infinity` hardness (`model/tiles.js#baseHardOf`), unmineable forever.

   `packTile`/`subOfTile`/`formOfTile` are untouched: an ordinal is still an
   ordinal, and this only changes WHICH ordinal the ceiling is measured from. */

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

/* POLISH: the abbreviated twin of `labelOf`, for the places a full name
   clips -- the narrow crafting grid's bill-of-materials lines, a recipe
   tooltip's inline references, and the boon timer stack. `short` is a real,
   hand-authored word on the row (`data/substances.js`/`data/forms.js`), not
   a runtime truncation: this project draws with `R()`/`drawText()` only, has
   no `clip()` and no CSS ellipsis (invariant 11), so slicing a full name to
   fit would either cut a word mid-letter or need its own clipping machinery
   -- both worse than shipping the short word as data. Falls back to the full
   name/label wherever a row has not been given one, so adding a substance or
   form never breaks this by omission. */
export const shortLabelOf = (subOrd, formOrd) =>
  `${SUB[subOrd].short || SUB[subOrd].name} ${FORM[formOrd].short || FORM[formOrd].label}`.trim();
