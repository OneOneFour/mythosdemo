// Content lint. See ARCHITECTURE.md section 8: enforcement checks direction
// and names, not sense, and this is the "not sense" half for `data/`.
//
// `tools/layers.mjs` proves the DEPENDENCY GRAPH is legal. This proves the
// CONTENT TABLES it guards are self-consistent: every selector expands, every
// mass is real, every machine's build bill is payable and obtainable, no
// recipe manufactures mass, and every tunable a data row names actually
// exists. Run as section 1b of `npm run check`, and runnable alone via
// `npm run check:content`.
// See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves
//
// Imports from src/data and src/model directly. tools/ is outside the layer
// graph `tools/layers.mjs` scans (it only walks src/), so this is not a rules
// violation -- it is a build tool reading frozen content, the same way
// tools/check.mjs already does.

import { SUB, S } from '../src/data/substances.js';
import { FORM, F, expand, matches, crossable, packable, PACKABLE_LIMIT } from '../src/data/forms.js';
import { HAND_RECIPES, RECIPES, recipesOf } from '../src/data/recipes.js';
import { MACH } from '../src/data/machines.js';
import { TUNE } from '../src/data/tuning.js';
import { TRINKETS } from '../src/data/trinkets.js';
import { GRANTS } from '../src/data/grants.js';
import { BOONS, BOON } from '../src/data/boons.js';
import { MIRACLES } from '../src/data/miracles.js';
import { DROPS } from '../src/data/drops.js';
import { CYCLES } from '../src/data/cycles.js';
import { BANDS, SPAWN_BAND } from '../src/data/world.js';
import { hasColour } from '../src/data/palette.js';
import { TREAT } from '../src/view/treatments.js';
import { holdable, massOfPair } from '../src/model/items.js';

const EPS = 1e-6;

/* Every recipe in the game: the named table, plus every machine's resolved
   list (inline rows and named lookups both), deduplicated by reference so a
   shared named row (e.g. `smelt`, used only by `furnace` today) is checked
   once. */
function collectRecipes() {
  const out = new Set(Object.values(RECIPES));
  for (const m of MACH) for (const r of recipesOf(m)) out.add(r);
  return [...out];
}

/* Every {sub, form} pair some substance yields when mined -- the seed of the
   reachability fixpoint (assertion 5) and the "mined directly" half of the
   cost-reachability check (assertion 4). */
function minedPairs() {
  const out = [];
  for (let s = 0; s < SUB.length; s++) {
    const t = SUB[s].tile;
    if (t && t.drops) out.push({ sub: s, form: F[t.drops] });
  }
  return out;
}

const keyOf = (sub, form) => `${sub}:${form}`;

/* Pure re-derivation of `model/world.js#worldY`, over the RAW `data/world.js`
   rows rather than an allocated band record — this tool runs before anything
   is booted, so there is no live band to ask. `origin`/`tile` are both plain
   numbers on the row already, which is what makes this safe: `worldY` itself
   has no allocation-time state, only arithmetic over the cfg. */
const worldYOf = (bandCfg, ty) => bandCfg.origin.y + ty * bandCfg.tile;

/* Depth (in the SPAWN band's own tile units), same datum `view/hud.js#depth`
   and `model/run.js#placementCheck`'s `minDepth` gate both use: the spawn
   band's own floor line. Used below to prove a `minDepth`-gated machine's
   OWN build bill never requires material gated deeper than the machine
   itself -- a catch-22 (nothing could ever mine what the machine needs to
   reach the depth it needs) would otherwise pass every other check here. */
function depthOfTy(bandCfg, ty, spawnCfg, datum) {
  return (worldYOf(bandCfg, ty) - datum) / spawnCfg.tile;
}

/* The shallowest depth at which a substance is ever minable, scanning every
   band's `strata` rows directly -- `layer`/`blobs`/`trees` all carry a
   `fromTy`; `vein` carries `dy` off the band's own `floorTy` instead. Returns
   Infinity for a substance no stratum ever places (a relic, a trinket, a
   miracle -- anything with no `tile` block at all). `subOrd` is a SUBSTANCE
   ORDINAL (an `S[...]` value), like every other query in this file -- a
   strata row's own `sub` is the bare content-id STRING `data/world.js` was
   written with, so it is translated through `S[...]` for the comparison
   rather than compared directly (comparing a string to an ordinal always
   silently fails, which is exactly the bug this comment now guards against:
   an early draft of this function did that and the depth-gate check below
   never once fired, on real content or on a deliberately broken one). */
function minMineDepth(subOrd) {
  const spawnCfg = BANDS.find(b => b.id === SPAWN_BAND);
  const datum = worldYOf(spawnCfg, spawnCfg.floorTy ?? 0);
  let min = Infinity;
  for (const band of BANDS) {
    for (const s of band.strata || []) {
      if (S[s.sub] !== subOrd) continue;
      const ty = s.kind === 'vein' ? (band.floorTy ?? 0) + (s.dy || 0) : s.fromTy;
      if (ty === undefined) continue;
      const d = depthOfTy(band, ty, spawnCfg, datum);
      if (d < min) min = d;
    }
  }
  return min;
}

export function checkContent({ quiet = false } = {}) {
  const violations = [];
  let checks = 0;
  const fail = msg => violations.push(msg);
  const recipes = collectRecipes();

  /* ---- 1. every recipe selector expands, and every literal output pair is
     legal -- USE data/forms.js#expand and model/items.js#holdable; do not
     hand-roll a string check (CLAUDE.md records that mistake).
     See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves ---- */
  for (const r of recipes) {
    if (!r.from) {
      for (const sel of Object.keys(r.in || {})) {
        checks++;
        if (expand(sel).length === 0)
          fail(`recipe "${r.id}": input selector "${sel}" expands to no legal pair`);
      }
    }
    for (const c of r.out || []) {
      if (c.subFrom) {
        checks++;
        if (expand(c.subFrom).length === 0)
          fail(`recipe "${r.id}": output subFrom selector "${c.subFrom}" expands to no legal pair`);
      } else if (c.sub !== undefined) {
        checks++;
        const sub = S[c.sub], form = F[c.form];
        if (sub === undefined || form === undefined || !holdable(sub, form))
          fail(`recipe "${r.id}": output "${c.sub}/${c.form}" is not a real, holdable pair`);
      }
    }
  }

  /* ---- 2. every substance with an `item` block has a finite positive mass;
     every form has a finite positive massK. ---- */
  for (const s of SUB) {
    if (!s.item) continue;
    checks++;
    if (!(Number.isFinite(s.item.mass) && s.item.mass > 0))
      fail(`substance "${s.id}": item.mass is not a finite positive number (${s.item.mass})`);
  }
  for (const f of FORM) {
    checks++;
    if (!(Number.isFinite(f.massK) && f.massK > 0))
      fail(`form "${f.id}": massK is not a finite positive number (${f.massK})`);
  }

  /* ---- 3. every machine `cost` key parses to a real, holdable sub/form
     pair. ---- */
  const mined = minedPairs();

  /* ---- the reachability fixpoint, built ONCE and shared by assertions 4 and
     5. Ties a `subFrom` clause's resolution to WHICHEVER SUBSTANCES ARE
     ALREADY REACHABLE for the matching input selector, using `matches()`
     against the reachable set itself -- never `expand()`'s full crossable()
     scan -- which is what keeps e.g. `adamant/ingot` out of the reachable
     set: nothing ever mines `adamant/ore` (adamant's `tile.drops` is
     `gravel`), so `adamant/ore` never enters `R`, so `smelt`'s
     star-slash-hash-ore subFrom clause never resolves to adamant, so
     `adamant/ingot` is never "reachable" at all -- there is nothing to flag,
     by construction, not by exemption.

     Built here, BEFORE the machine-cost loop below, so assertion 4 (a build
     bill's exact pair) can ask the SAME transitive question assertion 5 (an
     orphan recipe output) already had to answer, rather than the shallower
     one-hop "mined, or produced by ANY recipe whose OWN inputs might
     themselves be unreachable" check this file shipped with.
     See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves */
  const R = new Set(mined.map(p => keyOf(p.sub, p.form)));
  const reachableSubsFor = sel => {
    const subs = new Set();
    for (const k of R) {
      const [sub, form] = k.split(':').map(Number);
      if (matches(sel, sub, form)) subs.add(sub);
    }
    return subs;
  };
  {
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of recipes) {
        if (r.from) continue;                     // non-item source (vital); no pair to propagate
        const inSels = Object.keys(r.in || {});
        if (inSels.some(sel => reachableSubsFor(sel).size === 0)) continue;   // cannot fire yet

        for (const c of r.out || []) {
          if (c.sub !== undefined) {
            const k = keyOf(S[c.sub], F[c.form]);
            if (!R.has(k)) { R.add(k); grew = true; }
          } else if (c.subFrom) {
            for (const sub of reachableSubsFor(c.subFrom)) {
              const k = keyOf(sub, F[c.form]);
              if (!R.has(k)) { R.add(k); grew = true; }
            }
          }
        }
      }
    }
  }

  for (const m of MACH) {
    for (const key of Object.keys(m.cost || {})) {
      checks++;
      const [subId, formId] = key.split('/');
      const sub = S[subId], form = F[formId];
      if (sub === undefined || form === undefined || !holdable(sub, form)) {
        fail(`machine "${m.id}": cost key "${key}" is not a real, holdable pair`);
        continue;
      }

      /* ---- 4. every machine `cost` key is REACHABLE: mined pair -> recipes
         -> the exact cost bill, TRANSITIVELY -- `R` already proves every one
         of its own members is reachable from a mined pair through zero or
         more recipe hops, so a straight membership test here is strictly
         stronger than (and now replaces) the one-hop "produced by SOME
         recipe" scan this used to be: a recipe whose OWN inputs are
         themselves unreachable no longer counts as "producing" a cost pair,
         which the old one-hop check could not see. ---- */
      checks++;
      if (!R.has(keyOf(sub, form)))
        fail(`machine "${m.id}": cost key "${key}" is neither mined directly nor reachable through any recipe`);
    }
  }

  /* ---- 5. no orphans -- reachability graph SCOPED TO DECLARED PAIRS.
     Corrected scope per docs/BUILD_PLAN.md Phase 1 section 5 (the version
     re-read before this file was written, not the original plan): asserting
     over the FULL crossable() cartesian space (data/forms.js#expand's
     "holdable" universe) fails on a pre-existing, harmless gap --
     `crossable()` is an ANY-match on tags, so `copper/gravel` and
     `tin/gravel` are holdable today with no mining path or recipe ever
     touching them, and adamant's `metal` tag (kept deliberately, for a
     future ore/ingot/plate path) would add `adamant/ore`, `adamant/ingot`
     and `adamant/plate` to that universe too, with nothing declaring any of
     them this phase.

     `R` is the fixpoint built above, shared with assertion 4. Machine `cost`
     keys are EXCLUDED from this graph on purpose: that is assertion 4's job,
     and asserting it twice would just be two implementations of the same
     check that could silently disagree. */
  {
    /* Now assert every LITERAL-sub output is actually in the fixpoint's
       reachable set -- if it is not, that recipe's inputs could never be
       satisfied from any mined pair or any other recipe's output, which is
       exactly an orphan. subFrom outputs need no separate assertion: they
       enter R only when already reachable, so they cannot be orphans by
       construction -- but a subFrom clause that resolves to NOTHING at all
       (every substance permitted by tags is unreachable) is still a dead
       recipe worth flagging. */
    for (const r of recipes) {
      for (const c of r.out || []) {
        if (c.sub !== undefined) {
          checks++;
          const k = keyOf(S[c.sub], F[c.form]);
          if (!R.has(k))
            fail(`recipe "${r.id}": output "${c.sub}/${c.form}" is never reachable -- its inputs cannot be satisfied from any mined pair or recipe output`);
        } else if (c.subFrom) {
          checks++;
          if (reachableSubsFor(c.subFrom).size === 0)
            fail(`recipe "${r.id}": output subFrom "${c.subFrom}"/"${c.form}" never resolves to a reachable substance -- this recipe can never actually produce anything`);
        }
      }
    }
  }

  /* ---- 6. no recipe produces more total mass than it consumes, unless
     tagged `transmute`. Mirrors model/items.js#massOfPair's formula
     (substance mass x form massK) rather than duplicating it -- the two are
     asserted to agree, for one known pair, right here. ---- */
  {
    const knownMass = SUB[S.copper].item.mass * FORM[F.ingot].massK;
    checks++;
    if (Math.abs(knownMass - massOfPair(S.copper, F.ingot)) > EPS)
      fail(`mass check: hand formula (${knownMass}) disagrees with model/items.js#massOfPair (${massOfPair(S.copper, F.ingot)}) for copper/ingot`);

    for (const r of recipes) {
      if (r.from || r.transmute) continue;
      const sels = new Set(Object.keys(r.in || {}));
      for (const c of r.out || []) if (c.subFrom) sels.add(c.subFrom);
      const selList = [...sels];

      /* Cartesian product of each distinct selector's legal pairs. Small by
         construction: the content table has a handful of substances and
         forms, so this is at most a few dozen combinations, never a
         performance concern. */
      let combos = [{}];
      for (const sel of selList) {
        const pairs = expand(sel);
        const next = [];
        for (const combo of combos) for (const p of pairs) next.push({ ...combo, [sel]: p });
        combos = next;
      }
      if (selList.length === 0) combos = [{}];    // no selectors at all (e.g. out:[])

      for (const combo of combos) {
        let massIn = 0;
        for (const [sel, n] of Object.entries(r.in || {})) massIn += n * massOfPair(combo[sel].sub, combo[sel].form);
        let massOut = 0;
        for (const c of r.out || []) {
          if (c.sub !== undefined) massOut += c.n * massOfPair(S[c.sub], F[c.form]);
          else if (c.subFrom) massOut += c.n * massOfPair(combo[c.subFrom].sub, F[c.form]);
        }
        checks++;
        if (massOut > massIn + EPS)
          fail(`recipe "${r.id}": produces ${massOut.toFixed(3)} mass from ${massIn.toFixed(3)} consumed ` +
               `(combo ${JSON.stringify(Object.fromEntries(Object.entries(combo).map(([k, v]) => [k, `${SUB[v.sub].id}/${FORM[v.form].id}`])))}) ` +
               `-- tag \`transmute:true\` if this is deliberate`);
      }
    }
  }

  /* ---- 7. every hand:true recipe is object-identical to what a machine
     names -- guaranteed today because recipesOf() looks named strings up in
     the SAME frozen RECIPES table rather than cloning, so this asserts that
     guarantee holds rather than re-deriving it. ---- */
  for (const m of MACH) {
    const resolved = recipesOf(m);
    (m.recipes || []).forEach((raw, i) => {
      if (typeof raw !== 'string') return;
      const row = RECIPES[raw];
      if (!row || !row.hand) return;
      checks++;
      if (resolved[i] !== row)
        fail(`machine "${m.id}": recipe "${raw}" resolved to a DIFFERENT object than RECIPES.${raw} -- ` +
             `hand-crafting and this machine would silently drift apart the first time one was tuned and the other forgotten`);
    });
  }

  /* ---- 8. every tunable key named by any data/ modifier row resolves,
     scope included. Written generically over "any data row with a `mods`
     array", which is why it needed NO edit when `data/boons.js` gained real
     `mods` rows; `GRANTS` costs nothing extra to include since its rows carry
     no `mods` at all.
     See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves ---- */
  for (const row of [...TRINKETS, ...GRANTS, ...BOONS]) {
    for (const mod of row.mods || []) {
      checks++;
      const raw = mod.tunable || mod.key || '';
      const dot = raw.indexOf('.');
      const base = dot < 0 ? raw : raw.slice(0, dot);
      const scope = dot < 0 ? undefined : raw.slice(dot + 1);
      const t = TUNE[base];
      if (!t) { fail(`"${row.id}": tunable "${base}" is not in data/tuning.js`); continue; }
      if (scope !== undefined) {
        if (t.scope === 'substance' && S[scope] === undefined)
          fail(`"${row.id}": "${raw}" scopes to unknown substance "${scope}"`);
        else if (t.scope === 'machine' && !MACH.some(m => m.id === scope))
          fail(`"${row.id}": "${raw}" scopes to unknown machine "${scope}"`);
        else if (t.scope !== 'substance' && t.scope !== 'machine')
          fail(`"${row.id}": "${raw}" names a scope but tunable "${base}" is not scopable`);
      }
    }
  }

  /* ---- 9. tile.tier is monotonic against hard: nothing at a higher tier is
     softer than something at a lower one. ---- */
  for (let i = 0; i < SUB.length; i++) {
    const a = SUB[i].tile;
    if (!a) continue;
    for (let j = 0; j < SUB.length; j++) {
      const b = SUB[j].tile;
      if (!b) continue;
      const tierA = a.tier ?? 1, tierB = b.tier ?? 1;
      if (tierA >= tierB) continue;
      checks++;
      if (a.hard > b.hard)
        fail(`tile tiers: "${SUB[i].id}" (tier ${tierA}, hard ${a.hard}) is HARDER than ` +
             `"${SUB[j].id}" (tier ${tierB}, hard ${b.hard}) -- a higher tier must never be softer`);
    }
  }

  /* ---- 10. every BOONS#conflictsWith entry names a real boon id and a
     real mode. Phase 4 (docs/BUILD_PLAN.md): "two hostile gifts must not
     silently co-exist" only means something if the id it points at
     resolves.

     Phase 6 (docs/BUILD_PLAN.md) extends this with two more shapes:
     NEVER SELF-REFERENTIAL -- a boon named as its own rival is either a typo
     or a paradox (`rules/boons.js#step` only ever compares a LATER boon's
     row against an EARLIER one by id; a self-reference could never even be
     "the older one" of itself) -- and SYMMETRIC WHERE BOTH SIDES BOTHER TO
     SAY SO: `rules/boons.js#step` resolves a conflict off whichever boon was
     granted LATER, so today's shipped content (`hephaestus-forge` /
     `poseidon-flood`, `athena-focus` / `ares-frenzy`) is deliberately
     ONE-DIRECTIONAL -- the rivalry only fires if the aggressor is the one
     granted second, and that is accepted design, not a bug this lints
     against. What IS a bug: a pair that DOES declare both directions
     disagreeing about HOW the fight resolves -- 'suppress' one way and
     'invert' the other would make the outcome depend on grant order in a way
     no content author would choose on purpose. So: symmetry is not required,
     but where both directions exist, their modes must agree. */
  for (const b of BOONS) {
    for (const c of b.conflictsWith || []) {
      checks++;
      if (c.id === b.id) { fail(`boon "${b.id}": conflictsWith names itself`); continue; }
      checks++;
      if (!BOON[c.id])
        fail(`boon "${b.id}": conflictsWith names unknown boon "${c.id}"`);
      checks++;
      if (c.mode !== 'suppress' && c.mode !== 'invert')
        fail(`boon "${b.id}": conflictsWith "${c.id}" has mode "${c.mode}", expected "suppress" or "invert"`);

      checks++;
      const rival = BOON[c.id];
      const back = rival?.conflictsWith?.find(rc => rc.id === b.id);
      if (back && back.mode !== c.mode)
        fail(`boon "${b.id}" <-> "${c.id}": conflictsWith is declared in both directions with ` +
             `DIFFERENT modes ("${c.mode}" vs "${back.mode}") -- the outcome would depend on grant order`);
    }
  }

  /* ---- 11. every miracle is a real, HOLDABLE substance x phial pair (the
     substance named by `id`, per data/miracles.js's own header), and its
     optional side-effect boon names a real boon. ---- */
  for (const m of MIRACLES) {
    checks++;
    const sub = S[m.id];
    if (sub === undefined || !holdable(sub, F.phial))
      fail(`miracle "${m.id}": no holdable substance x phial pair -- add a data/substances.js row tagged 'miracle'`);
    if (m.effect?.boon) {
      checks++;
      if (!BOON[m.effect.boon])
        fail(`miracle "${m.id}": effect.boon names unknown boon "${m.effect.boon}"`);
    }
  }

  /* ---- 12. every drop row names a real, holdable trinket, a real
     trigger, and an in-range chance. ---- */
  for (const d of DROPS) {
    checks++;
    if (d.trigger !== 'mine' && d.trigger !== 'tribute')
      fail(`drop "${d.id}": trigger "${d.trigger}" is neither "mine" nor "tribute"`);
    checks++;
    const sub = S[d.give];
    if (sub === undefined || !TRINKETS.some(t => t.id === d.give) || !holdable(sub, F.relic))
      fail(`drop "${d.id}": give "${d.give}" is not a real, holdable trinket`);
    checks++;
    if (!(d.chance > 0 && d.chance <= 1))
      fail(`drop "${d.id}": chance ${d.chance} is not in (0, 1]`);
  }

  /* ---- 13. every trinket `id` is a real, HOLDABLE substance x relic pair --
     the identity trick `data/trinkets.js`'s own header names ("a trinket
     refines from nothing -- it IS the element"), the same shape assertion 11
     already proves for a miracle x phial pair. `run.invCount(S[t.id],
     F.relic)` is how `rules/trinkets.js` asks "is this held" everywhere, so a
     trinket whose id does not resolve to a holdable relic pair would silently
     never be obtainable, equippable or spendable. (Phase 6, docs/BUILD_PLAN.md
     tier-1 bullet: "every substance/form pair referenced by any ... trinket
     ... exists and is holdable".) ---- */
  for (const t of TRINKETS) {
    checks++;
    const sub = S[t.id];
    if (sub === undefined || !holdable(sub, F.relic))
      fail(`trinket "${t.id}": no holdable substance x relic pair -- add a data/substances.js row tagged 'relic'`);
  }

  /* ---- 14. DEPTH GATES ARE MONOTONIC: nothing a machine's build bill
     requires is gated deeper than the machine's OWN `minDepth`. Only
     `cyclops_maw` (and its mirrored variant) carries `minDepth` today, and
     its cost is deliberately priced in granite-tier goods reachable well
     above depth 200 -- see that row's own comment ("the one substance the
     Maw alone can mine cannot also be a prerequisite for building it, or
     nothing could ever build the first one"). This is the lint that keeps
     that a PROVEN fact rather than an eyeballed one, and the one a future
     T5 gated behind an even deeper `minDepth` would need to keep satisfying.
     `minMineDepth` (above) is Infinity for a substance no stratum ever
     places (a relic, a trinket bought elsewhere) -- those are caught by
     assertion 3/4 already (a cost pair must be minable or produced), not
     here, so Infinity would only ever fire THIS check for a substance that
     is otherwise unreachable, a duplicate report of an existing failure; to
     keep this assertion's own failures legible, skip a substance already
     Infinity (unreachable), since assertion 4 already named it. ---- */
  for (const m of MACH) {
    if (!m.minDepth) continue;
    for (const key of Object.keys(m.cost || {})) {
      const [subId] = key.split('/');
      const sub = S[subId];
      if (sub === undefined) continue;                  // already failed assertion 3
      const need = minMineDepth(sub);
      if (!Number.isFinite(need)) continue;              // already failed assertion 3/4
      checks++;
      if (need > m.minDepth)
        fail(`machine "${m.id}": minDepth ${m.minDepth} but its own cost key "${key}" is not minable ` +
             `until depth ${need.toFixed(0)} -- nothing could ever build the first one`);
    }
  }

  /* ---- 15. EVERY `look` BLOCK RESOLVES: every colour name is in
     `data/palette.js` and every treatment `fn` is a key in
     `view/treatments.js#TREAT`.

     THIS WAS NOT CHECKED ANYWHERE. Three separate file headers claim
     `tools/resolve.mjs` fails an unknown `fn` "at build time rather than
     drawing nothing at depth 300" -- there is no `tools/resolve.mjs`, and
     grepping `check.mjs` for `colour`, `palette`, `treat` or `fn` returns
     nothing. The real behaviour was: a typo'd colour threw from `colour()` the
     first time that tile painted, and a typo'd `fn` drew nothing at all,
     forever, in silence (`treat()` does `if (fn) fn(...)`). Phase 8 adds
     several new colour keys and a treatment, so the claim is made true here
     rather than left as a comment.

     Both halves are generic and structural, not a list of the keys that happen
     to exist today: a colour is any string under a key in `COLOUR_KEYS`
     (scalar or array), and the walk recurses, so a colour named inside a
     future treatment's params is covered the day it is written.

     `view/treatments.js` imports `core` and `data` only and touches no
     `document`, so importing it here costs nothing and asserts against the
     REAL table rather than a copy of its key list. ---- */
  const COLOUR_KEYS = new Set([
    'base', 'hi', 'lo', 'face', 'contact', 'col', 'low', 'dark',
    'leaves', 'item', 'sky', 'tint', 'body', 'trim', 'halo'
  ]);

  const walkLook = (where, node) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'fn' && typeof v === 'string') {
        checks++;
        if (!TREAT[v]) fail(`${where}: look treatment fn "${v}" is not in view/treatments.js#TREAT`);
        continue;
      }
      if (COLOUR_KEYS.has(k)) {
        for (const name of Array.isArray(v) ? v : [v]) {
          if (typeof name !== 'string') continue;
          checks++;
          if (!hasColour(name)) fail(`${where}: look colour "${name}" (key "${k}") is not in data/palette.js`);
        }
        continue;
      }
      if (v && typeof v === 'object') walkLook(where, v);
    }
  };

  for (const s of SUB) walkLook(`substance "${s.id}"`, s.look);
  for (const m of MACH) walkLook(`machine "${m.id}"`, m.look);
  for (const b of BANDS) walkLook(`band "${b.id}"`, b.look);

  /* ---- 16. THE TILE BYTE: THE FACT THE NARROWED GUARD RESTS ON.
     `data/forms.js`'s import-time guard used to price every substance row as
     if it were tile-capable and so refused content over a cost nothing was
     paying (Phase 8c; the arithmetic is in that file's packing block and in
     docs/SPEC.md section 15). It now measures from the highest PACKABLE
     ordinal instead -- native terrain, or a legal crossing with a form that
     carries a `tile` block. That is derived from the tables, so it cannot be
     stale; what it DEPENDS on is a fact `data/forms.js` cannot check for
     itself, and this is that check.

     A substance crossable with a tile-capable form is placeable as TERRAIN
     through `rules/placement.js#placeTile`. If it has no `tile` block of its
     own, `model/tiles.js#baseHardOf` returns `Infinity` for the tile it
     writes: a wall that can never be mined back out, with no `drops` and no
     `look.tile` to paint it. So crossability with `gravel`/`log`/`rung`/
     `stair` must imply a real `tile` block -- which is exactly what keeps the
     eight machine substances, the three relics and the miracle off the byte,
     and therefore what makes the narrowed guard true rather than hopeful.
     Widening a tile-capable form's `subTags` (or adding `metal`/`rock`/
     `organic` to a machine row) is the one edit that would break it silently,
     and it fires here.

     The second half is the byte itself, restated per substance so the failure
     names the row: nothing packable may sit above `PACKABLE_LIMIT`, the last
     ordinal whose byte clears `BEDROCK`. `data/forms.js` throws on the same
     fact at import, which is the harder gate -- this exists so a content
     author reading the lint output sees WHICH row is over the line. ---- */
  for (let s = 0; s < SUB.length; s++) {
    for (let f = 0; f < FORM.length; f++) {
      if (!FORM[f].tile || !crossable(s, f)) continue;
      checks++;
      if (!SUB[s].tile)
        fail(`substance "${SUB[s].id}": crossable with tile-capable form "${FORM[f].id}", so it ` +
             `can be PLACED as terrain, but it has no \`tile\` block -- the tile would have ` +
             `Infinity hardness (model/tiles.js#baseHardOf) and could never be mined back out`);
    }
    if (!packable(s)) continue;
    checks++;
    if (s > PACKABLE_LIMIT)
      fail(`substance "${SUB[s].id}": packable (native terrain or a tile-capable crossing) at ` +
           `ordinal ${s}, above the last ordinal that fits the tile byte (${PACKABLE_LIMIT}) ` +
           `-- move it earlier in data/substances.js or drop a form`);
  }

  /* ---- 17. THE RELIC GLOW IS A RULE, NOT A PER-ROW REMINDER (Phase 8b).
     "Any item whose form or substance carries the divine marker draws with a
     halo" only stays true if something enforces it structurally -- otherwise
     a future trinket `data/drops.js` produces reads as ordinary loot forever,
     silently, exactly the failure mode assertion 15 already exists to catch
     for a typo'd `fn`. `tags:['relic']`/`tags:['machine']` already separate
     the two cleanly (grepped: no substance carries both), so this checks the
     tag, not a per-row flag nothing enforces. `rig`-form machine items must
     NOT glow -- they are one-substance-per-thing too, same as a relic, but
     they are not divine. ---- */
  const hasHalo = s => (s.look?.treatments || []).some(tr => tr.fn === 'halo');
  for (const s of SUB) {
    if (s.tags?.includes('relic') || s.tags?.includes('miracle')) {
      checks++;
      if (!hasHalo(s))
        fail(`substance "${s.id}": tagged relic/miracle but has no look.treatments halo -- ` +
             `every divine item draws with a glow (Phase 8b); add { fn:'halo', col:'ichor', ... }`);
    }
    if (s.tags?.includes('machine')) {
      checks++;
      if (hasHalo(s))
        fail(`substance "${s.id}": tagged machine but has a look.treatments halo -- a held/placed ` +
             `rig is not divine and must not glow (Phase 8b's exclusion)`);
    }
  }

  /* ---- 18. THE TRANSPORT INTERPRETER BLOCKS ARE WELL FORMED (Phase 8g).
     `hub`, `crank` and `gear` are read by exactly the generic-interpreter
     route every other key here takes, which means a typo in one of them fails
     SILENTLY and permanently rather than loudly: `hub:{ carries:['players'] }`
     makes `model/segments.js#carries(seg,'player')` answer false for ever, so
     every carrier in the game quietly refuses to bear a rider and nothing
     anywhere throws. That is the exact failure mode this file exists for -- a
     typo in `data/` must fail here, not at 3am.

     `tools/check.mjs` asserts the BEHAVIOUR of these numbers (torque
     conservation, gear-loss monotonicity, the diagonal zero); this asserts
     they are numbers at all, and in the range the behaviour assumes. The
     `carries` vocabulary is hardcoded for the same reason assertion 10
     hardcodes 'suppress'/'invert': it is a closed set defined by
     `rules/drive.js`'s two call sites, and a lint may not learn its
     vocabulary from the data it is linting.

     Plus one existence check per key. Every one of them is a whole mechanic --
     no hub row means no cable can ever be anchored, no crank row means no
     torque can ever be supplied -- and CLAUDE.md's own list of mistakes
     includes a tool that was moved and left the project unable to build for
     two commits. A deleted row should say so here. ---- */
  const CARRIES = ['material', 'player'];
  const finitePos = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const seen = { hub: 0, crank: 0, gear: 0 };
  for (const m of MACH) {
    if (m.hub) {
      seen.hub++;
      checks++;
      if (!finitePos(m.hub.reach))
        fail(`machine "${m.id}": hub.reach is ${JSON.stringify(m.hub.reach)}, not a finite positive ` +
             `number of px -- model/segments.js#reachOf multiplies it by eff('segReach') and compares ` +
             `a length against it, so a link would be refused or accepted at every distance`);
      checks++;
      if (!Array.isArray(m.hub.carries) || m.hub.carries.length === 0)
        fail(`machine "${m.id}": hub.carries is ${JSON.stringify(m.hub.carries)}, not a non-empty ` +
             `array -- a carrier that may bear nothing is a cable with no purpose`);
      else for (const what of m.hub.carries) {
        checks++;
        if (!CARRIES.includes(what))
          fail(`machine "${m.id}": hub.carries names "${what}", which nothing reads. The only two ` +
               `values rules/drive.js ever asks for are ${CARRIES.map(c => `"${c}"`).join(' and ')}, ` +
               `and an unknown one fails silently for the whole run`);
      }
    }
    if (m.crank) {
      seen.crank++;
      checks++;
      if (!finitePos(m.crank.torque))
        fail(`machine "${m.id}": crank.torque is ${JSON.stringify(m.crank.torque)}, not a finite ` +
             `positive drive figure -- docs/SPEC.md 17.9 denominates supply in these units`);
      checks++;
      if (!finitePos(m.crank.reach))
        fail(`machine "${m.id}": crank.reach is ${JSON.stringify(m.crank.reach)}, not a finite ` +
             `positive number of px -- it is the slack in the same overlaps() call handFeed uses`);
    }
    if (m.gear) {
      seen.gear++;
      checks++;
      const loss = m.gear.loss;
      if (typeof loss !== 'number' || !Number.isFinite(loss) || loss < 0 || loss >= 1)
        fail(`machine "${m.id}": gear.loss is ${JSON.stringify(loss)}; it is a FRACTION lost per hop ` +
             `and must be in [0, 1). At 0 a drivetrain sprawls for free (docs/PLAN-gears-and-winches.md ` +
             `section 4.1's whole reason for the key) and at 1 or more it delivers nothing or negates`);
    }
  }
  for (const [key, n] of Object.entries(seen)) {
    checks++;
    if (n === 0)
      fail(`no machine row carries a \`${key}\` block -- that is a whole mechanic with no content ` +
           `behind it (a hub anchors every cable, a crank supplies all torque, a gear carries it)`);
  }

  /* ---- 19. THE CYCLE TABLE IS PAYABLE (Phase 10b, docs/SPEC.md section 18).
     Modelled on assertion 12: closed-set vocabularies hardcoded here rather
     than learned from the data being linted, plus one existence check per
     reference.

     THE TWO VOCABULARIES ARE CLOSED SETS defined by call sites, not by
     content. `at` is a MACHINE ID and must name a row carrying `tribute:{}`,
     because that marker is the whole of what `rules/cycles.js` scans for -- a
     cycle pointing at the furnace would be unpayable forever and nothing would
     throw. `reward.draft` names one of the four gift tiers of CLAUDE.md D1, and
     the list is exactly the four `draftable()` exports `shell/main.js`
     dispatches to; a fifth string would silently offer nothing.

     THE DEMAND ROWS ARE CHECKED TWICE, ON PURPOSE, because the two checks catch
     different mistakes. `holdable(sub, form)` proves the PAIR can exist as
     carried material at all (the element has an `item` block AND the crossing
     is legal), which is what a receiver's buffer and the player's pockets both
     require. `expand(sub + '/' + form).length > 0` proves the SELECTOR is
     non-empty -- the validator `data/forms.js#expand` exists for and CLAUDE.md
     names, and the failure mode that once let tin pile up in a buffer no recipe
     consumed. A demand row is also checked against the receiver's own
     `accepts`, which is the one that would catch "the gods want logs" -- a
     perfectly holdable pair that the machine they asked for it at will not take.

     `deadlineSecs` is `null` OR a finite positive number, and `null` is not a
     spelling of zero: `rules/cycles.js` branches on it and a panel draws no
     timer for it (docs/SPEC.md 18.4). A cycle with no clock must also have no
     punishment, since it can never be missed -- asserted, because a punishment
     nothing can trigger is a design statement that is not true. ---- */
  {
    const AT = Object.freeze(Object.fromEntries(
      MACH.filter(m => m.tribute).map(m => [m.id, m])));
    const TIERS = ['grant', 'boon', 'trinket', 'miracle'];
    const ids = new Set();

    checks++;
    if (!Object.keys(AT).length)
      fail('no machine row carries a `tribute:{}` block -- there is nowhere in the world to pay a ' +
           'cycle, so every row in data/cycles.js is unpayable and rules/cycles.js drains nothing');

    for (const c of CYCLES) {
      checks++;
      if (!c.id || ids.has(c.id))
        fail(`cycle "${c.id}": id is missing or duplicated -- run.tribute.id stores it and the ` +
             `director looks the row back up by it`);
      ids.add(c.id);

      checks++;
      const recv = AT[c.at];
      if (!recv)
        fail(`cycle "${c.id}": at "${c.at}" is not a machine id carrying tribute:{} ` +
             `(the receivers are ${Object.keys(AT).join(', ') || 'none'}) -- this cycle can never be paid`);

      checks++;
      if (!Array.isArray(c.demand) || c.demand.length === 0)
        fail(`cycle "${c.id}": demand is ${JSON.stringify(c.demand)}, not a non-empty array -- a ` +
             `trial that asks for nothing completes on the frame it arms`);
      else for (const d of c.demand) {
        checks++;
        const sub = S[d.sub], form = F[d.form];
        if (sub === undefined || form === undefined || !holdable(sub, form)) {
          fail(`cycle "${c.id}": demands ${d.sub}/${d.form}, which is not a holdable pair -- the ` +
               `element needs an item block in data/substances.js and the crossing must be legal ` +
               `for the form's subTags`);
          continue;
        }
        checks++;
        if (expand(`${d.sub}/${d.form}`).length === 0)
          fail(`cycle "${c.id}": the selector ${d.sub}/${d.form} expands to nothing -- see ` +
               `data/forms.js#expand, which exists for exactly this`);
        checks++;
        if (!(Number.isInteger(d.n) && d.n > 0))
          fail(`cycle "${c.id}": demands ${JSON.stringify(d.n)} of ${d.sub}/${d.form}; a demand ` +
               `count is a positive integer of held units`);
        checks++;
        if (recv && !recv.ports?.some(p => p.mode === 'in' &&
              p.accepts?.some(sel => matches(sel, sub, form))))
          fail(`cycle "${c.id}": demands ${d.sub}/${d.form} at "${c.at}", but no in-port on that ` +
               `machine accepts the pair -- the player could hold it, walk up to the receiver and ` +
               `not be able to give it away`);
      }

      checks++;
      const dl = c.deadlineSecs;
      if (!(dl === null || (Number.isFinite(dl) && dl > 0)))
        fail(`cycle "${c.id}": deadlineSecs is ${JSON.stringify(dl)}; it is null (no clock) or a ` +
             `finite positive number of seconds. Zero is not a spelling of null -- it would expire ` +
             `on the frame the cycle arms`);

      checks++;
      if (dl === null && c.punishment)
        fail(`cycle "${c.id}": has no clock but carries a punishment ${JSON.stringify(c.punishment)} ` +
             `-- nothing can ever trigger it, so it states a rule the game does not have`);
      checks++;
      if (dl !== null && !c.punishment)
        fail(`cycle "${c.id}": has a ${dl}s deadline and no punishment -- a clock with no consequence ` +
             `is a clock the player may correctly ignore`);

      checks++;
      if (!c.reward || !Number.isInteger(c.reward.favour))
        fail(`cycle "${c.id}": reward.favour is ${JSON.stringify(c.reward?.favour)}, not an integer -- ` +
             `every trial changes how the asking god feels about you (CLAUDE.md D1, decision I)`);

      for (const id of c.reward?.grants ?? []) {
        checks++;
        if (!MACH.some(m => m.id === id))
          fail(`cycle "${c.id}": reward.grants names "${id}", which is not a machine id -- ` +
               `model/run.js#canPlace would refuse it forever`);
      }
      for (const id of c.reward?.charts ?? []) {
        checks++;
        if (!BANDS.some(b => b.id === id))
          fail(`cycle "${c.id}": reward.charts names "${id}", which is not a band id`);
      }
      if (c.reward?.draft !== undefined) {
        checks++;
        if (!TIERS.includes(c.reward.draft))
          fail(`cycle "${c.id}": reward.draft is "${c.reward.draft}"; the four gift tiers are ` +
               `${TIERS.map(t => `"${t}"`).join(', ')} (CLAUDE.md D1) and an unknown one offers nothing`);
      }

      if (c.punishment) {
        checks++;
        const h = c.punishment.hearts;
        if (h !== undefined && !(Number.isInteger(h) && h > 0))
          fail(`cycle "${c.id}": punishment.hearts is ${JSON.stringify(h)}; it is spent through ` +
               `model/run.js#write.hurt and must be a positive whole number of the five`);
        checks++;
        if (!Object.keys(c.punishment).length)
          fail(`cycle "${c.id}": punishment is an empty object -- write no key rather than an empty one`);
      }
    }
  }

  /* ---- 20. EVERY MINEABLE TERRAIN ROW IS CLASSIFIED (Phase 14a,
     docs/SPEC.md section 19). Three buckets, one substance tag each, and the
     split has to be expressible IN CONTENT rather than as a branch in code:
     `#bulk/gravel` is a recipe input granite can never satisfy, and
     `data/forms.js#block`'s `subTags:['bulk']` is the whole of "a deposit is
     never player-placeable". Both of those read a TAG, so a terrain row added
     without one silently gets neither behaviour -- its rubble packs into
     nothing, and a future tile-capable form could quietly admit it.

     EXACTLY ONE, not "at least one": a row tagged both `bulk` and `deposit`
     would be placeable-by-recipe AND a named body at once, which is the
     contradiction the classification exists to prevent, and `#bulk/gravel`
     would start matching a deposit's rubble the moment it happened.

     Scoped to `tile` + `mineable` on purpose. `bedrock`/`air` are pseudo-rows
     (`VOID_SUB`/`EDGE_SUB`) and not in `SUB` at all; a relic, a miracle and
     the machine items have no `tile` block and are not unclassified terrain,
     they are not terrain. The vocabulary is hardcoded here for the same
     reason assertions 10, 18 and 19 hardcode theirs: it is a closed set
     defined by call sites, and a lint may not learn its vocabulary from the
     data it is linting. ---- */
  {
    const BUCKETS = ['bulk', 'deposit', 'organic'];
    for (const s of SUB) {
      if (!s.tile || !s.tags?.includes('mineable')) continue;
      checks++;
      const held = BUCKETS.filter(b => s.tags.includes(b));
      if (held.length !== 1)
        fail(`substance "${s.id}": mineable terrain tagged ${held.length ? held.map(b => `"${b}"`).join(' and ') : 'with no bucket'} ` +
             `-- every row with a \`tile\` block and \`mineable\` must carry EXACTLY ONE of ` +
             `${BUCKETS.map(b => `"${b}"`).join(', ')} (docs/SPEC.md section 19). Without one, its rubble ` +
             `packs into no block (data/recipes.js#pack reads #bulk) and nothing decides whether it may ` +
             `ever be player-placed (data/forms.js#block reads subTags bulk)`);
    }
  }

  /* ---- 21. NO DEPOSIT IS OBTAINABLY PLACEABLE (Phase 14e,
     docs/PLAN-phase14-mining-and-drops.md D14-B/D14-C). D14-C's whole claim is
     that `rules/placement.js` needed NO new gate, because a deposit has no
     tile-capable crossing anything can produce -- "unplaceable by
     construction". That is a property of `data/`, and this is the check that
     makes it a proven one rather than a true-by-accident one. The failure it
     exists to catch is named in that plan's own risk register: a future
     tile-capable form tagged `rock` or `metal` silently admits granite or
     adamant, and nothing anywhere throws.

     WRITTEN AGAINST OBTAINABILITY, NOT CROSSABILITY, and the difference is
     load-bearing. `stair`'s `subTags:['metal']` legitimately admits
     `adamant/stair` -- a legal pair, deliberately kept (adamant carries
     `metal` for a future smelt path its own row describes), that no recipe
     outputs and no `tile.drops` yields. Asserting mere crossability would
     flag it and the honest fix would be to weaken the rule. So the question
     asked here is the one that matters: can a player ever HOLD this pair?
     Producers are exactly two, the same two `minedPairs()` and assertion 5's
     fixpoint read: a substance's own `tile.drops`, and a recipe output
     (literal `sub`, or `subFrom` resolved over every substance the selector
     permits -- the widest reading, so this errs towards flagging).

     ONE NAMED EXEMPTION, and it is a real design decision rather than a
     known bug. `copper/stair` IS obtainable: `data/recipes.js#daedalan`
     (2 copper/plate + 4 timber/log -> 2 copper/stair) is Phase 2a's tier-2
     ladder, `data/forms.js#stair` is written around it, and
     `model/tiles.js#baseChargeOf` explicitly handles it ("`stair` crosses
     with `metal`, so `copper/stair` is a real placeable pair, and charging it
     by its substance would turn one stair into four on the way back out").
     A bronze stair is not a copper vein: it is placed, so `formOf(byte) !==
     NATIVE`, so it carries charge 1, drops itself back rather than ore, and
     is refused by every `#deposit`-blind selector in the game. What the brief
     forbids is placing a new DEPOSIT of a resource, which no crossing here
     can do. The exemption is per-PAIR, not per-substance or per-form, so a
     new `tin/stair` recipe, or a `granite`-admitting form, still fails the
     build -- which is the whole point of listing it rather than dropping the
     check. Note that D14-B/D14-C's prose ("no deposit substance has an
     obtainable tile-capable crossing") is stale on exactly this pair; the
     shipped design is what this comment describes. ---- */
  {
    const TILE_FORMS = FORM.reduce((a, f, i) => (f.tile ? (a.push(i), a) : a), []);

    /* Deliberate, reviewed exceptions. Add nothing here without the argument
       above being true of the new row as well. */
    const OBTAINABLE_DEPOSIT_TILES = new Set(['copper/stair']);

    const produced = new Map();                 // pair key -> how it is obtained
    for (let s = 0; s < SUB.length; s++) {
      const drops = SUB[s].tile?.drops;
      if (drops !== undefined && F[drops] !== undefined)
        produced.set(keyOf(s, F[drops]), `mined from "${SUB[s].id}" (tile.drops)`);
    }
    for (const r of recipes) {
      for (const c of r.out || []) {
        if (c.sub !== undefined) {
          const k = keyOf(S[c.sub], F[c.form]);
          if (!produced.has(k)) produced.set(k, `recipe "${r.id}" output`);
        } else if (c.subFrom) {
          for (const p of expand(c.subFrom)) {
            const k = keyOf(p.sub, F[c.form]);
            if (!produced.has(k)) produced.set(k, `recipe "${r.id}" output (subFrom "${c.subFrom}")`);
          }
        }
      }
    }

    for (let s = 0; s < SUB.length; s++) {
      if (!SUB[s].tags?.includes('deposit')) continue;
      for (const f of TILE_FORMS) {
        checks++;
        if (!crossable(s, f)) continue;               // illegal by subTags -- the D14-B mechanism
        const how = produced.get(keyOf(s, f));
        if (!how) continue;                           // legal but unobtainable, e.g. adamant/stair
        if (OBTAINABLE_DEPOSIT_TILES.has(`${SUB[s].id}/${FORM[f].id}`)) continue;
        fail(`substance "${SUB[s].id}" is tagged \`deposit\` and "${SUB[s].id}/${FORM[f].id}" is BOTH a ` +
             `legal crossing (form "${FORM[f].id}" carries a \`tile\` block and its subTags admit this row) ` +
             `AND obtainable -- ${how}. A deposit is natural-generation-only ` +
             `(docs/PLAN-phase14-mining-and-drops.md D14-B/D14-C): either narrow the form's \`subTags\`, or ` +
             `stop producing the pair. If the crossing is genuinely intended, add it to this assertion's ` +
             `OBTAINABLE_DEPOSIT_TILES with the argument written down, as \`copper/stair\` is`);
      }
    }
  }

  /* ---- 22. EVERY `tile.charge` IS A WHOLE NUMBER >= 1, AND ONLY A `deposit`
     ROW CARRIES ONE (Phase 14e, D14-D/D14-F).

     Two different content bugs, both silent. A fractional or zero charge
     breaks `model/mining.js#unitsCrossed`'s arithmetic without throwing:
     `Math.floor(charge) - 1` is the cap it counts unit boundaries against, so
     0.5 yields a cap of -1 (clamped to 0, i.e. no per-unit drops at all) while
     `rules/mining.js` still multiplies `hard * charge` for the break -- a tile
     that takes half as long and drops nothing on the way. A charge of 0 makes
     `total` 0, and the floor at `Math.max(1, ...)` in both break sites is the
     only thing standing between that and a tile that breaks on the first
     frame. Neither would fail any other check here.

     The second half is a copy-paste guard. `charge` on a `bulk` or `organic`
     row would multiply the yield of soil, plain stone or a felled trunk by
     however many units it named, silently inflating an economy that
     docs/SPEC.md section 19 states is unchanged for those three, and quietly
     re-opening the "5 rubble packs one block" trade at a discount. Charge
     describes a NAMED BODY in the ground and nothing else. ---- */
  for (const s of SUB) {
    const c = s.tile?.charge;
    if (c === undefined) continue;                   // absent means 1, which every non-deposit row is
    checks++;
    if (!Number.isInteger(c) || c < 1)
      fail(`substance "${s.id}": tile.charge is ${JSON.stringify(c)}; it is a WHOLE NUMBER of units ` +
           `>= 1 (model/mining.js#unitsCrossed floors it and counts unit boundaries against ` +
           `charge - 1, and rules/mining.js multiplies hard x charge for the break)`);
    checks++;
    if (!s.tags?.includes('deposit'))
      fail(`substance "${s.id}": carries tile.charge ${JSON.stringify(c)} but is not tagged \`deposit\` ` +
           `(tags ${JSON.stringify(s.tags || [])}) -- only a named body depletes over several units. On a ` +
           `\`bulk\` or \`organic\` row this silently multiplies its yield and docs/SPEC.md section 19 ` +
           `says those three are unchanged`);
  }

  /* ---- 23. NO HAND RECIPE SHADOWS A LATER ONE (Phase 14e, section 2.9).
     `rules/crafting.js#choose` takes THE FIRST `HAND_RECIPES` row whose inputs
     are all satisfied, so declaration order is load-bearing and a row whose
     bill is implied by a later row's bill makes that later row permanently
     unreachable by hand. Nineteen `hand:true` rows, every one carrying a
     comment arguing its position by hand -- and three of those arguments are
     wrong, which is the case for checking it mechanically.

     THE IMPLICATION TEST, and why it is a subset test over EXPANDED SELECTORS
     rather than over selector strings. Row `i` is satisfied by every pockets
     state that satisfies row `j` if, for each of `i`'s clauses (sel_i, n_i),
     `j` has a clause (sel_j, n_j) with n_j >= n_i and every pair matching
     sel_j also matching sel_i. Then any state satisfying j holds some single
     pair with at least n_j of it that also answers sel_i, which is exactly
     what `model/run.js#pocketedPair` asks. Comparing the strings would miss
     that `timber/log` implies star-slash-hash-fuel (spelled in words for the
     reason `data/forms.js`'s grammar block gives), and comparing counts would
     claim `#bulk/gravel:5` implies `stone/gravel:4`, which is backwards.
     Sound rather than complete: it can miss a shadowing (two clauses of `j`
     answered by one pair), never invent one.

     THREE KNOWN, PRE-EXISTING VIOLATIONS, ALLOWLISTED BY NAME rather than
     silently tolerated. docs/FINDINGS.md (Phase 8d, #5, and the Phase 14e
     entry) records them: `peg_rungs {2 log}` and `kindle {1 log}` are strict
     subsets of `daedalan {2 plate, 4 log}`, and `kindle` is a strict subset of
     `auger {2 plate, 1 log}`, so `daedalan` and `auger` are unreachable by
     hand for any player holding a log. Fixing them means moving `daedalan` and
     `auger` above `peg_rungs`/`kindle`, which mechanically works (re-derived:
     it introduces no new shadowing) but TRADES ONE UNREACHABLE RECIPE FOR
     ANOTHER -- a player holding 2 plates and 4 logs would then get stairs
     where they get rungs today. That is a gameplay change and does not belong
     in a harness phase (this plan's section 6.5 says so in as many words), so
     it is recorded, not made. Every pair NOT on this list fails the build,
     which is what makes a twentieth recipe safe to add. ---- */
  {
    /* `HAND_RECIPES` itself, not `recipes.filter(r => r.hand)`: the thing under
       test is DECLARATION ORDER, and that array is the one
       `rules/crafting.js#choose` actually walks. Re-deriving it here would be a
       second implementation of "which rows have hand:true, in what order",
       which is the drift assertion 7 above already exists to prevent. */
    const HAND = HAND_RECIPES;
    /* Ordered `before -> after`, i.e. "the earlier row that eats the later
       one". docs/FINDINGS.md 8d #5. */
    const KNOWN_SHADOWS = new Set([
      'peg_rungs>daedalan',
      'kindle>daedalan',
      'kindle>auger'
    ]);

    const pairSet = sel => new Set(expand(sel).map(p => keyOf(p.sub, p.form)));
    const covers = (outer, inner) => {                // every pair in inner is in outer
      for (const k of inner) if (!outer.has(k)) return false;
      return true;
    };

    for (let i = 0; i < HAND.length; i++) {
      const A = HAND[i], billA = Object.entries(A.in || {});
      for (let j = i + 1; j < HAND.length; j++) {
        const B = HAND[j], billB = Object.entries(B.in || {});
        checks++;
        const implied = billA.every(([selA, nA]) => {
          const setA = pairSet(selA);
          return billB.some(([selB, nB]) => nB >= nA && covers(setA, pairSet(selB)));
        });
        if (!implied) continue;
        if (KNOWN_SHADOWS.has(`${A.id}>${B.id}`)) continue;
        fail(`hand recipes: "${A.id}" (declared #${i}) is satisfied by EVERY pockets state that satisfies ` +
             `"${B.id}" (#${j}) -- ${JSON.stringify(A.in)} against ${JSON.stringify(B.in)}. ` +
             `rules/crafting.js#choose takes the first affordable row, so "${B.id}" can never be ` +
             `hand-crafted at all. Move "${B.id}" above "${A.id}" in data/recipes.js, or change one of the ` +
             `two bills so neither contains the other`);
      }
    }
  }

  if (!quiet) {
    for (const v of violations) console.error(`  FAIL ${v}`);
    const verdict = violations.length ? 'FAIL' : 'ok  ';
    console.log(`  ${verdict} content lint: ${checks} checks, ${violations.length} violation(s)`);
  }
  return { checks, violations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkContent();
  if (r.violations.length) process.exit(1);
}
