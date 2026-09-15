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
import { GRANTS, STARTING_MACHINES } from '../src/data/grants.js';
import { BOONS, BOON } from '../src/data/boons.js';
import { MIRACLES } from '../src/data/miracles.js';
import { DROPS } from '../src/data/drops.js';
import { CYCLES } from '../src/data/cycles.js';
import { GODS } from '../src/data/gods.js';
import { SCENARIOS } from '../src/data/scenarios.js';
import { BANDS, SPAWN_BAND } from '../src/data/world.js';
import { hasColour } from '../src/data/palette.js';
import { TREAT } from '../src/view/treatments.js';
import { holdable, massOfPair } from '../src/model/items.js';
import { machineHeldSub, mirrorOf } from '../src/model/run.js';

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
     forever, in silence (`treat()` does `if (fn) fn(...)`). So the claim is
     made true here rather than left as a comment.

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
  /* FORMS TOO, SINCE PHASE 13b. A form may now carry its own `look` block
     (`data/forms.js`'s `rung`/`stair`), and it went unwalked here for exactly
     as long as it takes to write this line -- which would have made the newest
     `look` in the project the only unchecked one, i.e. the failure mode this
     whole assertion exists to close. */
  for (const f of FORM) walkLook(`form "${f.id}"`, f.look);

  /* ---- 16. THE TILE BYTE: THE FACT THE NARROWED GUARD RESTS ON.
     `data/forms.js`'s import-time guard used to price every substance row as
     if it were tile-capable and so refused content over a cost nothing was
     paying (the arithmetic is in that file's packing block and in
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

  /* ---- 17. THE RELIC GLOW IS A RULE, NOT A PER-ROW REMINDER.
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

  /* ---- 18. THE SILENT-FAILURE MACHINE KEYS ARE WELL FORMED — the transport
     interpreter blocks and the `band` placement
     gate, which shares their exact failure mode.
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
    /* THE BAND GATE (Phase 13d, docs/SPEC.md 20.1). Same silent-failure
       argument as `hub.carries` above, one notch worse: a `band` naming no
       real band makes `model/run.js#placementCheck` refuse the machine in
       EVERY band for the whole run, with a refusal message built from the id
       it could not resolve -- a machine that can never be placed anywhere and
       nothing thrown. Optional, so only a row that carries the key is
       checked. */
    if (m.band !== undefined) {
      checks++;
      if (typeof m.band !== 'string' || !BANDS.some(b => b.id === m.band))
        fail(`machine "${m.id}": band is ${JSON.stringify(m.band)}, which is not a data/world.js band ` +
             `id (${BANDS.map(b => b.id).join(', ')}) -- placementCheck would refuse this machine in ` +
             `every band in the game and never say why`);
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

      /* THE BATCH CLAUSE IS A CRASH GUARD, NOT A LINT (Phase 17d,
         docs/SPEC.md section 18.10). `rules/cycles.js#creditTribute` calls
         `keyOf(S[batch.sub], F[batch.form])` on every delivery to a batched
         cycle's receiver, and `model/items.js#keyOf` reads `SUB[sub].id`, so
         a typo'd `sub` or `form` throws a TypeError mid-substep on the first
         delivery of ANY pair to that receiver -- it does not quietly leave a
         clause nothing can satisfy. A pair that is valid but unholdable
         (`granite/plate`) is the quiet case, and `holdable` is what catches
         it. `secs` must be positive for the same reason `deadlineSecs` may
         not be zero: a window of no width is one nothing can land inside. */
      if (c.batch !== undefined) {
        const b = c.batch;
        const bsub = S[b?.sub], bform = F[b?.form];
        checks++;
        if (bsub === undefined || bform === undefined || !holdable(bsub, bform)) {
          fail(`cycle "${c.id}": batch names ${b?.sub}/${b?.form}, which is not a holdable pair -- ` +
               `rules/cycles.js#creditTribute keys the window on it through model/items.js#keyOf, ` +
               `which throws a TypeError on the first delivery to this cycle's receiver`);
        } else {
          checks++;
          if (expand(`${b.sub}/${b.form}`).length === 0)
            fail(`cycle "${c.id}": the batch selector ${b.sub}/${b.form} expands to nothing -- see ` +
                 `data/forms.js#expand, which exists for exactly this`);
        }
        checks++;
        if (!(Number.isInteger(b?.n) && b.n > 0))
          fail(`cycle "${c.id}": batch.n is ${JSON.stringify(b?.n)}; it is a positive integer of ` +
               `delivered units, and model/run.js#prunedCredits bounds the ledger by it`);
        checks++;
        if (!(Number.isFinite(b?.secs) && b.secs > 0))
          fail(`cycle "${c.id}": batch.secs is ${JSON.stringify(b?.secs)}; it is a finite positive ` +
               `number of simulated seconds -- zero is a window nothing can land inside, so the ` +
               `trial would be unpayable for ever`);
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
     (2 copper/plate + 4 timber/log -> 2 copper/stair) is the tier-2
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

     THERE IS NO ALLOWLIST. This assertion shipped with three named
     exemptions -- `peg_rungs` and `kindle` both shadowing `daedalan`, and
     `kindle` shadowing `auger` -- recorded because fixing them by reordering
     alone would have traded one dead recipe for another. Phase 6v repriced
     the two bills instead (`daedalan` to {3 plate, 1 log}, `kindle` moved
     below both), so every one of the 19 rows is now craftable at its own
     minimal bill and the exemption has nothing left to cover. Any shadowing
     pair at all fails the build, which is what makes a twentieth recipe safe
     to add. ---- */
  {
    /* `HAND_RECIPES` itself, not `recipes.filter(r => r.hand)`: the thing under
       test is DECLARATION ORDER, and that array is the one
       `rules/crafting.js#choose` actually walks. Re-deriving it here would be a
       second implementation of "which rows have hand:true, in what order",
       which is the drift assertion 7 above already exists to prevent. */
    const HAND = HAND_RECIPES;

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
        fail(`hand recipes: "${A.id}" (declared #${i}) is satisfied by EVERY pockets state that satisfies ` +
             `"${B.id}" (#${j}) -- ${JSON.stringify(A.in)} against ${JSON.stringify(B.in)}. ` +
             `rules/crafting.js#choose takes the first affordable row, so "${B.id}" can never be ` +
             `hand-crafted at all. Move "${B.id}" above "${A.id}" in data/recipes.js, or change one of the ` +
             `two bills so neither contains the other`);
      }
    }
  }

  /* ---- 24. A `tile.roots` FORM IS NEVER SOLID (Phase 15,
     docs/PLAN-phase15-trees.md D15-C/D15-E, docs/SPEC.md section 22).

     `roots` means two things at once (`data/forms.js`'s own header on the key
     says so): a solid tile DIRECTLY BELOW satisfies this form's backing
     requirement, and the tile is entered in `model/growth.js`'s ledger so
     `rules/growth.js` will eventually turn it into something else. The first
     half is what this checks, and it is the half that has a bad interaction
     with `solid`.

     A SOLID TILE THAT NEEDS NOTHING BUT A FLOOR UNDER IT IS A FREE-STANDING
     WALL. `rules/placement.js#placeTile`'s backing predicate exists so that
     terrain has to be keyed into terrain -- rock beside it, rock above it, or
     a climbable to join. `roots` deliberately breaks that for a seedling,
     which is safe precisely because a seedling is not collision: it is
     `solid:false, climb:false`, you walk straight through it, and the worst a
     misplaced one can do is take 0.0175 s to dig back up. Put the same key on
     a SOLID form and the game gains a verb nobody designed: stand on flat
     ground and stack a tower of blocks upward one tile at a time, with no
     ladder, no scaffold and no material cost beyond the blocks themselves --
     which is a direct assault on CLAUDE.md's premise that up is expensive.

     It would also be silent. Nothing else in the project pairs the two keys,
     `tools/layers.mjs` checks direction and names rather than sense, and the
     resulting tower would place, paint and collide perfectly well. The whole
     failure is that it works.

     Stated over the FORM table rather than as a comment on the `seed` row for
     the reason assertion 22 gives about `tile.charge`: the row that breaks
     this is the row someone adds next, by copying the nearest existing one,
     which is what a per-row reminder cannot reach. ---- */
  for (const f of FORM) {
    if (f.tile?.roots === undefined) continue;
    checks++;
    if (f.tile.roots !== true)
      fail(`form "${f.id}": tile.roots is ${JSON.stringify(f.tile.roots)} -- it is a FLAG and ` +
           `rules/placement.js tests it with \`=== true\`, so any other value silently means ` +
           `"absent" while reading as if it were set. Write \`roots:true\` or drop the key`);
    checks++;
    if (f.tile.solid !== false)
      fail(`form "${f.id}": carries tile.roots but tile.solid is ${JSON.stringify(f.tile.solid)} -- ` +
           `a \`roots\` form is backed by a solid tile DIRECTLY BELOW and nothing else ` +
           `(rules/placement.js#placeTile), so a SOLID one is a free-standing wall: stand on flat ` +
           `ground and stack it upward one tile at a time with no ladder and no scaffold, which is ` +
           `CLAUDE.md's "up is expensive" premise inverted. Set \`solid:false\` (docs/SPEC.md ` +
           `section 22)`);
  }

  /* ---- 25. EVERY MACHINE ROW IS REACHABLE IN A REAL RUN: something grants
     it, AND a player who takes that grant can actually place it.

     BOTH HALVES, and the second half is the one that matters. "Named by a
     `data/grants.js` row" on its own would have passed `kiln_divine` — the
     deadest row in the table — green: it was named by the only GRANTS row
     there was, and `machineHeldSub('kiln_divine')` is `undefined`, so
     `model/run.js#placementCheck` refused it `'NOTHING BUILT YET'` at every
     depth, for ever. An assertion that goes green over the bug that
     motivated it is worse than no assertion, so placeability is asked
     through the SAME query `placementCheck` asks, imported rather than
     re-derived.

     `talos_head`/`cyclops_maw` were the other half of the same hole: three
     tables each (machine, substance, recipe) and no grant anywhere, which
     also made their recipes permanently unknown, since
     `model/run.js#isKnown` gates a machine-build recipe on `canPlace`.

     A MIRROR IS SPONSORED BY ITS BASE, because `rules/grants.js` grants the
     pair (`model/run.js#mirrorOf`), so no content row ever names a `_l` id
     and this must not demand one.

     THE TWO EXEMPTIONS ARE FROM THE FIRST HALF ONLY. A row may be exempted
     from having a sponsor -- that is a content decision, written down below
     with its reason. Nothing is ever exempt from the second half: the moment
     something DOES grant a machine, that machine must be placeable, which is
     exactly the assertion that goes red if `gift-kiln` is ever restored. ---- */
  const EXEMPT_UNSPONSORED = new Map([
    /* The player must never obtain it: `rules/cycles.js#ensureAltarPlaced`
       places it, and it deliberately has no substance row, which is
       "never placeable by the player" expressed as an absence rather than
       as a check. Both halves below are expected to fail for it. */
    ['altar', 'placed by rules/cycles.js; deliberately has no substance row'],
    /* Kept as documentation, not as content. `rate.kiln_divine` is
       CLAUDE.md's own worked example of a scoped tunable key,
       `data/machines.js` names it as the worked example for `variantOf`,
       `docs/DEVELOPER_GUIDE.md#variants-are-nearly-free` documents it and
       `shell/notify.js` cites it for the per-machine sound override. It has
       no substance for the reason `data/substances.js`'s own comment gives
       (its inherited build bill is bit-identical to `furnace`'s, so a hand
       recipe for it could never fire), so it can never be placed and its
       grant row was retired rather than left pretending otherwise. */
    ['kiln_divine', 'a live worked example for variantOf and scoped tuning, with no sponsor and no substance']
  ]);
  const sponsors = [...STARTING_MACHINES,
                    ...GRANTS.map(g => g.grants),
                    ...CYCLES.flatMap(c => c.reward?.grants || [])];
  const sponsored = new Set(sponsors);
  for (const id of sponsors) { const mir = mirrorOf(id); if (mir) sponsored.add(mir); }

  for (const m of MACH) {
    const exempt = EXEMPT_UNSPONSORED.get(m.id);
    const isSponsored = sponsored.has(m.id);
    checks++;
    if (!isSponsored && !exempt)
      fail(`machine "${m.id}": nothing grants it -- it is in no STARTING_MACHINES, no data/grants.js row, ` +
           `no cycle reward.grants, and is no mirror of one, so it cannot be placed in any run and its ` +
           `build recipe is permanently unknown (model/run.js#isKnown). Add a grant, or exempt it by name ` +
           `with its reason in tools/content.mjs assertion 25`);
    if (isSponsored) {
      checks++;
      if (machineHeldSub(m.id) === undefined)
        fail(`machine "${m.id}": something grants it, but machineHeldSub() is undefined -- no ` +
             `data/substances.js row and no mirrored base to borrow one from, so ` +
             `model/run.js#placementCheck refuses it 'NOTHING BUILT YET' at every depth however it is ` +
             `granted. A grant of an unplaceable machine is a tier that does nothing: give it a substance ` +
             `row and a recipe, or retire the grant`);
      checks++;
      if (exempt && machineHeldSub(m.id) !== undefined)
        fail(`machine "${m.id}": exempted from the sponsorship half of assertion 25 as "${exempt}", but it ` +
             `is now both sponsored and placeable -- delete the exemption rather than leave a stale one`);
    }
  }

  /* ---- 26. EVERY MIRACLE EFFECT IS A KIND `rules/miracles.js` IMPLEMENTS,
     hardcoded here for the reason assertions 10, 18 and 19 hardcode theirs:
     it is a closed set defined by that file's branches, and a lint may not
     learn its vocabulary from the data it is linting. A row naming a kind
     nobody implements fails SILENTLY -- the phial is spent, the journal row
     is pushed, and the world does not change.

     A row with NO kind at all is legal and is the pure-boon phial
     (`applyEffect` grants `effect.boon` independently of `effect.kind`), so
     the requirement is that it do at least one of the two things. ---- */
  const MIRACLE_KINDS = new Set(['collapse', 'transmute']);
  for (const m of MIRACLES) {
    const e = m.effect || {};
    checks++;
    if (e.kind !== undefined && !MIRACLE_KINDS.has(e.kind))
      fail(`miracle "${m.id}": effect.kind "${e.kind}" is not one of ${[...MIRACLE_KINDS].join('/')} -- ` +
           `rules/miracles.js#applyEffect has no branch for it, so the phial would be spent and nothing ` +
           `would happen`);
    checks++;
    if (e.kind === undefined && !e.boon)
      fail(`miracle "${m.id}": has neither an effect.kind nor an effect.boon, so using it does nothing at all`);
    /* A KIND THAT WRITES A TILE NEEDS A PACKABLE SUBSTANCE, and both halves
       of that are load-bearing rather than tidy. `rules/miracles.js`'s
       `transmute` is a THIRD caller of `data/forms.js#packTile`, alongside
       worldgen's native tile and `rules/placement.js#placeTile`'s validated
       crossing, and it is subject to neither of their constraints -- so
       nothing but this line stands between a content row and a corrupt tile
       byte, silently:

         no `sub` at all      `packTile(undefined)` is NaN, a Uint8Array
                              stores NaN as 0, and 0 is AIR -- the miracle
                              would CLEAR solid rock, which is exactly the
                              step upward its own comment promises it cannot
                              make.
         a non-packable `sub` the ordinal overflows the byte and WRAPS:
                              `lodestone` (26) packs to 365, truncates to
                              109, and decodes as granite/stair -- a
                              climbable tile nobody placed.

       Both are the failure mode this whole file exists for: they place, they
       paint, they collide, and nothing throws. */
    if (e.kind === 'transmute') {
      checks++;
      if (e.sub === undefined)
        fail(`miracle "${m.id}": effect.kind 'transmute' with no effect.sub -- model/tiles.js#write.set ` +
             `would pack an undefined ordinal to NaN, which a Uint8Array stores as 0 (AIR), so the ` +
             `miracle would CLEAR the rock it claims to convert. Name a substance`);
    }
    if (e.sub !== undefined) {
      checks++;
      const sub = S[e.sub];
      if (sub === undefined)
        fail(`miracle "${m.id}": effect.sub "${e.sub}" is not a data/substances.js row`);
      else if (!packable(sub))
        fail(`miracle "${m.id}": effect.sub "${e.sub}" is ordinal ${sub}, which data/forms.js#packable ` +
             `rejects -- a relic, miracle or machine substance never reaches the tile byte, so packing it ` +
             `overflows 255 and WRAPS to an unrelated substance x form pair. Name terrain`);
    }
    if (e.kind !== undefined) {
      checks++;
      if (!(Number.isInteger(e.radius) && e.radius >= 0))
        fail(`miracle "${m.id}": effect.radius is ${JSON.stringify(e.radius)} -- a tile-editing kind needs ` +
             `a whole non-negative radius, and rules/miracles.js loops it directly`);
    }
  }


  /* ---- 27. EVERY DEBUG SCENARIO IS BUILDABLE (Phase 6j, docs/SPEC.md
     section 29). Modelled on assertion 19: one existence check per reference,
     closed vocabularies hardcoded here rather than learned from the rows being
     linted, and the two selector checks (`holdable` and `expand`) kept
     separate because they catch different mistakes.

     WHY THIS ASSERTION HAS TO EXIST AT ALL. `rules/scenarios.js` places
     machines through `model/machines.js#write.place` -- the director route
     `rules/cycles.js#ensureAltarPlaced` already uses, and the only one
     available, since a `rules` sibling may not be imported. That route asks
     nothing about band, depth, grants or held items, so `placementCheck`'s
     refusals never run and a scenario naming an astral-only machine on the
     surface, or a `minDepth` machine above its gate, would apply without a
     word and behave like nothing at all. The gates are therefore re-derived
     here from the raw `data/world.js` rows, exactly as `depthOfTy` above
     already re-derives `model/world.js#worldY` and for the same reason: this
     tool runs before anything is booted, so there is no live band to ask.

     THE REACH CHECK IS THE ONE THAT WOULD OTHERWISE BE FOUND BY EYE. A
     segment whose two anchors are more than `hub.reach` apart is refused by
     `model/segments.js#linkCheck` at apply time, leaving a diorama with a
     visible pair of hubs and no cable -- which reads as a broken mechanic
     rather than as a bad row. The anchor is the footprint's own centre
     (docs/SPEC.md section 17.5), so the distance is computable from the row.
     `eff('segReach')` cannot be read here, so this is the BASE reach: a row
     inside it is inside it under any modifier that only ever widens.

     WHAT IS DELIBERATELY NOT CHECKED: footing, and whether the path between
     two hubs is clear. Both are questions about live tiles after the carve
     rects have been applied, and re-deriving the generated world in a lint
     would be a second worldgen. `linkCheck` asks the path question at apply
     time and journals its refusal; footing is proved by driving each
     scenario, which is what this phase's acceptance step did. ---- */
  {
    const spawnCfg = BANDS.find(b => b.id === SPAWN_BAND);
    const datum = worldYOf(spawnCfg, spawnCfg.floorTy ?? 0);
    const spawnTx = spawnCfg.spawnTx ?? (spawnCfg.tw >> 1);
    const BAND_CFG = Object.freeze(Object.fromEntries(BANDS.map(b => [b.id, b])));
    const GOD_IDS = new Set(GODS.map(g => g.id));
    const ids = new Set();

    /* The same two expressions `rules/scenarios.js#txOf`/`#tyOf` use: `dx` is
       tiles right of the SPAWN band's own column, `dy` tiles below the target
       band's own ground line. */
    const txAt = spec => spawnTx + spec.dx;
    const tyAt = (cfg, spec) => (cfg.floorTy ?? 0) + spec.dy;

    for (const sc of SCENARIOS) {
      checks++;
      if (!sc.id || ids.has(sc.id))
        fail(`scenario "${sc.id}": id is missing or duplicated -- \`?scenario=<id>\` and the menu's ` +
             `debug list both name it, so it is part of the interface`);
      ids.add(sc.id);

      checks++;
      if (!sc.name || !sc.note)
        fail(`scenario "${sc.id}": needs both a \`name\` (the menu draws it) and a one-line \`note\` ` +
             `saying what it is FOR -- a fixture nobody can tell the purpose of is a fixture nobody uses`);

      checks++;
      const home = BAND_CFG[sc.band];
      if (!home) {
        fail(`scenario "${sc.id}": band "${sc.band}" is not a data/world.js row`);
        continue;
      }

      /* Every coordinate is `dx` off ONE column datum, whatever band it lands
         in, which is only sound while every band shares a tile size. Asserted
         rather than assumed: a band with a finer grid would silently shear
         every cross-band diorama sideways. */
      checks++;
      if (home.tile !== spawnCfg.tile)
        fail(`scenario "${sc.id}": band "${sc.band}" has tile ${home.tile} against the spawn band's ` +
             `${spawnCfg.tile}, so \`dx\` no longer names the same world column in both -- see ` +
             `data/scenarios.js's coordinate datum`);

      const bandOfSpec = spec => BAND_CFG[spec.band ?? sc.band];

      for (const kind of ['carve', 'tiles']) {
        for (const r of sc[kind] || []) {
          const cfg = bandOfSpec(r);
          checks++;
          if (!cfg) {
            fail(`scenario "${sc.id}": ${kind} rect names band "${r.band}", which is not a ` +
                 `data/world.js row`);
            continue;
          }
          checks++;
          if (!(Number.isInteger(r.dx) && Number.isInteger(r.dy) &&
                Number.isInteger(r.w) && r.w > 0 && Number.isInteger(r.h) && r.h > 0))
            fail(`scenario "${sc.id}": ${kind} rect ${JSON.stringify(r)} needs whole \`dx\`/\`dy\` and ` +
                 `a positive whole \`w\`/\`h\` -- rules/scenarios.js loops them directly`);
          const tx = txAt(r), ty = tyAt(cfg, r);
          checks++;
          if (tx < 0 || tx + r.w > cfg.tw || ty < 0 || ty + r.h > cfg.th)
            fail(`scenario "${sc.id}": ${kind} rect ${JSON.stringify(r)} resolves to tiles ` +
                 `${tx},${ty}..${tx + r.w - 1},${ty + r.h - 1} in "${cfg.id}", outside its ` +
                 `${cfg.tw}x${cfg.th} grid -- rules/scenarios.js skips out-of-bounds tiles, so the ` +
                 `diorama would come out partly missing and nothing would say so`);
          if (kind !== 'tiles') continue;
          checks++;
          const sub = S[r.sub], form = F[r.form];
          if (sub === undefined || form === undefined) {
            fail(`scenario "${sc.id}": tiles rect names ${r.sub}/${r.form}, and one of those is not a ` +
                 `data/substances.js or data/forms.js row`);
            continue;
          }
          checks++;
          if (!FORM[form].tile)
            fail(`scenario "${sc.id}": tiles rect writes form "${r.form}", which carries no \`tile\` ` +
                 `block -- only rung/stair/block/seed may become terrain (CLAUDE.md D12)`);
          checks++;
          if (!crossable(sub, form))
            fail(`scenario "${sc.id}": ${r.sub}/${r.form} is not a legal crossing, so the pair cannot ` +
                 `exist as a tile (see data/forms.js subTags)`);
          checks++;
          if (!packable(sub))
            fail(`scenario "${sc.id}": tiles rect names substance "${r.sub}", which ` +
                 `data/forms.js#packable rejects -- packing it overflows the tile byte and WRAPS to an ` +
                 `unrelated pair, exactly as a transmute miracle would (assertion 26)`);
        }
      }

      const specs = sc.machines || [];
      for (const spec of specs) {
        checks++;
        const def = MACH.find(m => m.id === spec.id);
        if (!def) {
          fail(`scenario "${sc.id}": places "${spec.id}", which is not a data/machines.js id`);
          continue;
        }
        const cfg = bandOfSpec(spec);
        checks++;
        if (!cfg) {
          fail(`scenario "${sc.id}": machine "${spec.id}" names band "${spec.band}", which is not a ` +
               `data/world.js row`);
          continue;
        }
        const tx = txAt(spec), ty = tyAt(cfg, spec);
        checks++;
        if (tx < 0 || tx + def.tw > cfg.tw || ty < 0 || ty + def.th > cfg.th)
          fail(`scenario "${sc.id}": machine "${spec.id}" footprint resolves to ` +
               `${tx},${ty}..${tx + def.tw - 1},${ty + def.th - 1} in "${cfg.id}", outside its grid`);

        /* THE TWO PLACEMENT GATES `write.place` DOES NOT ENFORCE. Both refuse
           in `model/run.js#placementCheck` for a player and pass silently for
           a director, so both are the scenario table's own responsibility. */
        checks++;
        if (def.band && def.band !== cfg.id)
          fail(`scenario "${sc.id}": machine "${spec.id}" declares band "${def.band}" and the row ` +
               `places it in "${cfg.id}" -- a player could never build it there (docs/SPEC.md 20.1), ` +
               `so the diorama states a rule the game does not have`);
        checks++;
        if (def.minDepth && depthOfTy(cfg, ty, spawnCfg, datum) < def.minDepth)
          fail(`scenario "${sc.id}": machine "${spec.id}" has minDepth ${def.minDepth} and the row ` +
               `places it at ${depthOfTy(cfg, ty, spawnCfg, datum)} M -- placementCheck would refuse ` +
               `it as 'TOO SHALLOW' for a player`);

        for (const e of spec.buf || []) {
          checks++;
          const sub = S[e.sub], form = F[e.form];
          if (sub === undefined || form === undefined || !holdable(sub, form)) {
            fail(`scenario "${sc.id}": fills "${spec.id}" with ${e.sub}/${e.form}, which is not a ` +
                 `holdable pair -- model/machines.js#write.take keys the buffer through ` +
                 `model/items.js#keyOf, which reads SUB[sub].id`);
            continue;
          }
          checks++;
          if (expand(`${e.sub}/${e.form}`).length === 0)
            fail(`scenario "${sc.id}": the buffer selector ${e.sub}/${e.form} expands to nothing -- ` +
                 `see data/forms.js#expand, which exists for exactly this`);
          checks++;
          if (!(Number.isInteger(e.n) && e.n > 0))
            fail(`scenario "${sc.id}": fills "${spec.id}" with ${JSON.stringify(e.n)} of ` +
                 `${e.sub}/${e.form}; a buffer count is a positive integer of units`);
          checks++;
          if (!recipesOf(def).some(r => Object.keys(r.in || {}).some(sel => matches(sel, sub, form))))
            fail(`scenario "${sc.id}": fills "${spec.id}" with ${e.sub}/${e.form}, which no recipe on ` +
                 `that machine consumes -- the units would sit in the buffer for the whole run and the ` +
                 `machine would look fed and do nothing`);
        }

        if (spec.charges !== undefined) {
          checks++;
          if (!(Number.isInteger(spec.charges) && spec.charges > 0))
            fail(`scenario "${sc.id}": machine "${spec.id}" banks ${JSON.stringify(spec.charges)} ` +
                 `charges; it is a positive whole number of units of work`);
          checks++;
          if (!recipesOf(def).some(r => (r.out || []).length === 0))
            fail(`scenario "${sc.id}": machine "${spec.id}" banks charges and has no honest-fuel ` +
                 `recipe (one with \`out:[]\`), so nothing on that row ever spends one -- see ` +
                 `docs/DEVELOPER_GUIDE.md#charges-and-honest-fuel`);
        }
      }

      for (const pair of sc.segments || []) {
        checks++;
        if (!Array.isArray(pair) || pair.length !== 2 ||
            !pair.every(i => Number.isInteger(i) && i >= 0 && i < specs.length)) {
          fail(`scenario "${sc.id}": segment ${JSON.stringify(pair)} is not a pair of indices into ` +
               `this row's own \`machines\` list (${specs.length} entries)`);
          continue;
        }
        const ends = pair.map(i => {
          const spec = specs[i];
          const cfg = bandOfSpec(spec);
          const def = MACH.find(m => m.id === spec.id);
          const tile = cfg.tile;
          return {
            spec, def,
            x: cfg.origin.x + txAt(spec) * tile + (def.tw * tile) / 2,
            y: worldYOf(cfg, tyAt(cfg, spec)) + (def.th * tile) / 2
          };
        });
        checks++;
        const notHub = ends.find(e => !e.def.hub);
        if (notHub) {
          fail(`scenario "${sc.id}": segment ${JSON.stringify(pair)} anchors on "${notHub.spec.id}", ` +
               `which carries no \`hub:{}\` block -- linkCheck answers 'NOT A HUB' and the diorama ` +
               `comes out with no cable`);
          continue;
        }
        checks++;
        const len = Math.hypot(ends[1].x - ends[0].x, ends[1].y - ends[0].y);
        const reach = Math.min(...ends.map(e => e.def.hub.reach));
        if (len > reach)
          fail(`scenario "${sc.id}": segment ${JSON.stringify(pair)} spans ${len.toFixed(1)} px ` +
               `between anchors, past the smaller hub's own reach of ${reach} -- linkCheck answers ` +
               `'TOO FAR APART'. Reaching further is another hub and another segment ` +
               `(CLAUDE.md invariant 4)`);
      }

      for (const kind of ['items', 'give']) {
        for (const g of sc[kind] || []) {
          checks++;
          const sub = S[g.sub], form = F[g.form];
          if (sub === undefined || form === undefined || !holdable(sub, form)) {
            fail(`scenario "${sc.id}": ${kind} names ${g.sub}/${g.form}, which is not a holdable ` +
                 `pair -- the element needs an item block in data/substances.js and the crossing must ` +
                 `be legal for the form's subTags`);
            continue;
          }
          checks++;
          if (expand(`${g.sub}/${g.form}`).length === 0)
            fail(`scenario "${sc.id}": the ${kind} selector ${g.sub}/${g.form} expands to nothing -- ` +
                 `see data/forms.js#expand, which exists for exactly this`);
          checks++;
          if (!(Number.isInteger(g.n) && g.n > 0))
            fail(`scenario "${sc.id}": ${kind} names ${JSON.stringify(g.n)} of ${g.sub}/${g.form}; ` +
                 `a count is a positive integer of units`);
        }
      }

      for (const mid of sc.grant || []) {
        checks++;
        if (!MACH.some(m => m.id === mid))
          fail(`scenario "${sc.id}": grants "${mid}", which is not a machine id -- ` +
               `model/run.js#canPlace would refuse it forever`);
      }
      for (const bid of sc.chart || []) {
        checks++;
        if (!BANDS.some(b => b.id === bid))
          fail(`scenario "${sc.id}": charts "${bid}", which is not a band id`);
      }
      for (const god of Object.keys(sc.favour || {})) {
        checks++;
        if (!GOD_IDS.has(god))
          fail(`scenario "${sc.id}": grants favour to "${god}", which is not a data/gods.js id -- ` +
               `the FAVOUR panel draws no row for it, so the favour would be invisible`);
      }

      if (sc.cycle !== undefined) {
        checks++;
        if (!(Number.isInteger(sc.cycle) && sc.cycle >= 1 && sc.cycle <= CYCLES.length))
          fail(`scenario "${sc.id}": cycle is ${JSON.stringify(sc.cycle)}; it is a 1-based row of ` +
               `data/cycles.js, of which there are ${CYCLES.length}. rules/scenarios.js ignores ` +
               `anything else, so the scenario would silently arm cycle 1`);
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
