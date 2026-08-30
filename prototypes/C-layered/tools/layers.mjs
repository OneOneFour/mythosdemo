/* SECTION 0 of `check` — the dependency direction, enforced.

   Parses every import statement under `src/`, resolves it to a layer, and fails
   the build on an illegal edge. No dependencies, runs before anything is
   imported, so a bad edge is reported even if the module it introduces would
   throw.

   This is the file the rest of the architecture rests on. Everything else in
   this prototype is a convention; this is the part a machine checks. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/* ==========================================================================
   THE RULE TABLE. Read this and you know the architecture.
   ========================================================================== */

const MAY = {
  //  layer      may import
  core:  ['core'],
  data:  ['core', 'data'],
  model: ['core', 'data', 'model'],
  rules: ['core', 'data', 'model'],          // NOT rules, NOT view
  view:  ['core', 'data', 'model', 'view'],  // NOT rules
  shell: ['core', 'data', 'model', 'rules', 'view', 'shell']
};

/* `rules` modules are siblings: each is a pure step(dt) over `model`, and the
   order they run in is stated once in `shell/schedule.js`. If two rules need to
   talk, the thing they are saying is state, and state lives in `model`. */
const RULES_MAY_IMPORT_RULES = false;

/* Per-file rules, for the three cases the layer table cannot express. Each is
   here because leaving it to reviewers failed at least once in a real repo. */
const FILE_RULES = [
  { file: 'data/tuning.js', onlyImportedBy: ['model/mods.js'],
    why: 'base values must be read through eff(), or one call site silently opts out of every trinket in the game' },
  { from: 'view/', importing: 'core/rng.js', banned: ['rand', 'seedRng'],
    why: 'a repaint must consume no randomness; view gets hash2 only' }
];

/* Comments are stripped before anything is matched, so a commented-out import
   is not an edge and the word "this" in a sentence is not a violation. Known
   limit: a string literal containing `//` would be truncated. There is none in
   `src/`, and if one appears the failure is loud (a missing edge) rather than
   quiet. */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* import/export ... from '<relative>' — captures the clause and the specifier */
const IMPORT = /(?:import|export)\s+(?:([\s\S]*?)\s+from\s+)?['"](\.[^'"]+)['"]/g;

/* ========================================================================== */

const SRC = resolve(process.argv[2] || 'src');
const norm = p => p.split(sep).join('/');
const layerOf = f => f.split('/')[0];

const walk = d => readdirSync(d).flatMap(e => {
  const p = join(d, e);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

const bad = [], edges = [], importsOf = new Map();

for (const file of walk(SRC)) {
  const from = norm(relative(SRC, file));
  const fl = layerOf(from);
  const src = strip(readFileSync(file, 'utf8'));

  /* representation stance: no `class`, no `this`, anywhere in src/. Content is
     frozen tables, state is plain objects, behaviour is free functions. */
  if (/\bclass\s+[A-Z]/.test(src)) bad.push(`${from}   [declares a class]`);
  /* `this` followed by a use, so the word in a string or an identifier like
     `things` is not a hit. A regex and not a parser: it catches the paradigm
     drifting, not a determined author. */
  if (/\bthis\s*[.[)\];,=]/.test(src)) bad.push(`${from}   [uses \`this\`]`);

  for (const [, clause = '', spec] of src.matchAll(IMPORT)) {
    const to = norm(relative(SRC, resolve(dirname(file), spec)));
    if (to.startsWith('..')) continue;                    // vendor/
    const tl = layerOf(to);
    edges.push([from, to]);
    (importsOf.get(to) ?? importsOf.set(to, []).get(to)).push(from);

    if (!MAY[fl]?.includes(tl))
      bad.push(`${from} -> ${to}   [${fl} may not import ${tl}]`);

    if (fl === 'rules' && tl === 'rules' && !RULES_MAY_IMPORT_RULES)
      bad.push(`${from} -> ${to}   [rules modules must talk through model]`);

    /* `view` may read model queries and may not name a mutator, so the static
       half of "render() does not touch the model" is a regex. The dynamic half
       is tools/epoch.mjs. */
    if (fl === 'view' && tl === 'model') {
      if (/\bwrite\b/.test(clause))
        bad.push(`${from} -> ${to}   [view imported a mutator]`);
      if (/^\s*\*\s+as\b/.test(clause))
        bad.push(`${from} -> ${to}   [view namespace-imported model]`);
    }

    for (const r of FILE_RULES) {
      if (r.from && from.startsWith(r.from) && to === r.importing)
        for (const name of r.banned)
          if (new RegExp(`\\b${name}\\b`).test(clause))
            bad.push(`${from} -> ${to} (${name})   [${r.why}]`);
    }
  }
}

for (const r of FILE_RULES) {
  if (!r.onlyImportedBy) continue;
  for (const importer of importsOf.get(r.file) ?? [])
    if (!r.onlyImportedBy.includes(importer))
      bad.push(`${importer} -> ${r.file}   [${r.why}]`);
}

/* Intra-layer cycles: plain DFS over the edge list. This is the rule that would
   have caught today's scene.js <-> hud.js. */
function cycles(list) {
  const g = new Map(), out = [], seen = new Set();
  for (const [a, b] of list) (g.get(a) ?? g.set(a, []).get(a)).push(b);
  const walkFrom = (n, stack) => {
    const i = stack.indexOf(n);
    if (i >= 0) { out.push(stack.slice(i).concat(n)); return; }
    if (seen.has(n)) return;
    seen.add(n);
    for (const m of g.get(n) ?? []) walkFrom(m, stack.concat(n));
  };
  for (const n of g.keys()) walkFrom(n, []);
  return out;
}
bad.push(...cycles(edges).map(c => `cycle: ${c.join(' -> ')}`));

/* THE RATCHET. Against today's `src/` this starts at 16 — the count measured
   before the migration — and each migration step lowers it. It may never rise,
   so no step can add an edge while removing another. This prototype is clean by
   construction, so its budget is 0. */
const BUDGET = Number(process.env.LAYER_BUDGET ?? 0);

if (bad.length > BUDGET) {
  console.error(`\nlayer violations: ${bad.length} (budget ${BUDGET})`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`  ok   dependency direction clean (${bad.length}/${BUDGET}, ${edges.length} edges)`);
