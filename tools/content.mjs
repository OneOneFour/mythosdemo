// Content lint. See ARCHITECTURE.md section 8: enforcement checks direction
// and names, not sense, and this is the "not sense" half for `data/`.
//
// `tools/layers.mjs` proves the DEPENDENCY GRAPH is legal. This proves the
// CONTENT TABLES it guards are self-consistent: every selector expands, every
// mass is real, every machine's build bill is payable and obtainable, no
// recipe manufactures mass, and every tunable a data row names actually
// exists. Exported the same way `tools/layers.mjs` exports `checkLayers`, run
// as section 1b of `npm run check`, and runnable alone via `npm run
// check:content` for a pre-commit hook.
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

export function checkContent({ quiet = false } = {}) {
  const violations = [];
  let checks = 0;
  const fail = msg => violations.push(msg);
  const recipes = collectRecipes();

  /* ---- 1. every recipe selector expands, and every literal output pair is
     legal -- USE data/forms.js#expand and model/items.js#holdable; do not
     hand-roll a string check (CLAUDE.md records that mistake). ---- */
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
  for (const m of MACH) {
    for (const key of Object.keys(m.cost || {})) {
      checks++;
      const [subId, formId] = key.split('/');
      const sub = S[subId], form = F[formId];
      if (sub === undefined || form === undefined || !holdable(sub, form)) {
        fail(`machine "${m.id}": cost key "${key}" is not a real, holdable pair`);
        continue;
      }

      /* ---- 4. every machine `cost` key is REACHABLE: mined directly, or
         produced by some recipe's out clause. Shallow on purpose -- one hop,
         not the transitive graph assertion 5 builds -- because a build bill
         names an exact pair and either something makes that exact pair or it
         does not. ---- */
      checks++;
      const minedHere = mined.some(p => p.sub === sub && p.form === form);
      const producedHere = recipes.some(r => (r.out || []).some(c =>
        c.subFrom ? (F[c.form] === form && expand(c.subFrom).some(p => p.sub === sub))
                  : (c.sub !== undefined && S[c.sub] === sub && F[c.form] === form)));
      if (!minedHere && !producedHere)
        fail(`machine "${m.id}": cost key "${key}" is neither mined directly nor produced by any recipe`);
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

     So the fixpoint below ties a `subFrom` clause's resolution to WHICHEVER
     SUBSTANCES ARE ALREADY REACHABLE for the matching input selector, using
     `matches()` against the reachable set itself -- never `expand()`'s full
     crossable() scan -- which is exactly what keeps `adamant/ingot` out of
     the declared set: nothing ever mines `adamant/ore` (adamant's
     `tile.drops` is `gravel`), so `adamant/ore` never enters the reachable
     set, so `smelt`'s star-slash-hash-ore subFrom clause never resolves to adamant, so
     `adamant/ingot` is never "declared" at all -- there is nothing to flag,
     by construction, not by exemption. Machine `cost` keys are EXCLUDED from
     this graph on purpose: that is assertion 4's job, and asserting it twice
     would just be two implementations of the same check that could silently
     disagree. */
  {
    const R = new Set(mined.map(p => keyOf(p.sub, p.form)));
    const reachableSubsFor = sel => {
      const subs = new Set();
      for (const k of R) {
        const [sub, form] = k.split(':').map(Number);
        if (matches(sel, sub, form)) subs.add(sub);
      }
      return subs;
    };

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
     array" so a future table (boons, once Phase 4 gives them mods) needs no
     edit here. ---- */
  for (const row of [...TRINKETS, ...GRANTS]) {
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
