/* Dependency-direction checker: resolves every import in `src/` to a layer and
   fails on any illegal edge. Direction and names only -- an unreachable
   recipe, an unfeedable machine and a wrong number all pass. */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'src');

/* What each layer may import, in legal downward order. */
const MAY_IMPORT = {
  core:  [],
  data:  ['core'],
  model: ['core', 'data'],
  rules: ['core', 'data', 'model'],             // not view, not rules
  view:  ['core', 'data', 'model'],             // not rules, and read-only
  shell: ['core', 'data', 'model', 'rules', 'view']
};

// `rules` siblings may not import each other; their order lives in
// shell/schedule.js. A driver may bind leaf helpers from a sub-directory.
const SIBLING_EXCEPTION = (from, to) =>
  from.startsWith('rules/') && to.startsWith('rules/') &&
  to.split('/').length > from.split('/').length;

// One reader per target: any second importer of the frozen design table makes
// the tunable store bypassable.
const SOLE_READER = {
  'data/tuning.js': 'model/mods.js'
};

// Ratchet: may only ever go down.
const LAYER_BUDGET = 0;

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const layerOf = rel => rel.split('/')[0];

// static imports and re-exports; deliberately not dynamic import()
const IMPORT_RE = /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/gm;
const BARE_RE   = /^\s*import\s*['"]([^'"]+)['"]/gm;

export async function checkLayers({ quiet = false } = {}) {
  const files = await jsFiles(SRC);
  const violations = [];
  let edges = 0;

  for (const abs of files) {
    const rel = relative(SRC, abs).split('\\').join('/');
    const from = layerOf(rel);
    const src = await readFile(abs, 'utf8');

    for (const re of [IMPORT_RE, BARE_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const spec = m[1];

        if (!spec.startsWith('.')) {
          // vendor/ is allowed; anything else bare is a runtime dependency
          if (!spec.includes('vendor/'))
            violations.push({ rel, spec, why: 'bare specifier — runtime dependency' });
          continue;
        }

        const target = relative(SRC, resolve(dirname(abs), spec)).split('\\').join('/');
        if (target.startsWith('..')) {
          if (!spec.includes('vendor/'))
            violations.push({ rel, spec, why: 'import escapes src/' });
          continue;
        }

        edges++;
        const to = layerOf(target);

        // sole-reader rules first: most specific wins
        const owner = SOLE_READER[target];
        if (owner && rel !== owner) {
          violations.push({ rel, spec, why: `only ${owner} may import ${target}` });
          continue;
        }

        if (from === to) {
          if (from === 'rules' && !SIBLING_EXCEPTION(rel, target))
            violations.push({ rel, spec, why: 'rules may not import rules — order lives in shell/schedule.js' });
          continue;
        }

        if (!MAY_IMPORT[from]) {
          violations.push({ rel, spec, why: `unknown layer "${from}"` });
          continue;
        }

        if (!MAY_IMPORT[from].includes(to)) {
          const upward = Object.keys(MAY_IMPORT).indexOf(to) > Object.keys(MAY_IMPORT).indexOf(from);
          violations.push({
            rel, spec,
            why: upward ? `${from} may not import upward into ${to}`
                        : `${from} may not import ${to} (siblings are forbidden)`
          });
        }
      }
    }
  }

  if (!quiet) {
    for (const v of violations)
      console.error(`  FAIL ${v.rel}\n         imports ${v.spec}\n         ${v.why}`);
    const verdict = violations.length <= LAYER_BUDGET ? 'ok  ' : 'FAIL';
    console.log(`  ${verdict} dependency direction: ${files.length} files, ` +
                `${edges} edges, ${violations.length} violation(s), budget ${LAYER_BUDGET}`);
  }
  return { files: files.length, edges, violations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await checkLayers();
  if (r.violations.length > LAYER_BUDGET) process.exit(1);
}
