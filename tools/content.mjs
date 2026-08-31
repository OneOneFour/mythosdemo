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
import { FORM, F, expand, matches } from '../src/data/forms.js';
import { RECIPES, recipesOf } from '../src/data/recipes.js';
import { MACH } from '../src/data/machines.js';
import { TUNE } from '../src/data/tuning.js';
import { TRINKETS } from '../src/data/trinkets.js';
import { GRANTS } from '../src/data/grants.js';
import { BOONS, BOON } from '../src/data/boons.js';
import { MIRACLES } from '../src/data/miracles.js';
import { DROPS } from '../src/data/drops.js';
import { BANDS, SPAWN_BAND } from '../src/data/world.js';
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
