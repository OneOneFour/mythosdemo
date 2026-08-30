/* ============================================================
   tools/layers.mjs — the build gate. No dependencies.

   Two passes, both of which fail the build:

   PASS 1  DIRECTION. Parses every import in src/ and checks it against the
           MAY table below. Catches the 16 illegal edges that exist in src/
           today: 5 upward (rules reaching for the audio device), 10 sideways
           (view reaching into rules), 1 cycle (scene.js <-> hud.js).

   PASS 2  RESOLUTION. Imports data/ and asserts every string that names
           something actually resolves: parts, slots, selectors, tunables,
           treatments and palette keys. A typo fails here, before any module
           is imported, naming the bad key — rather than throwing at depth 300
           or, worse, silently producing a machine that never runs.

   Run:  node tools/layers.mjs
         LAYER_BUDGET=16 node tools/layers.mjs     (migration ratchet)
   ============================================================ */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/* ------------------------------------------------------------------
   THE RULE TABLE. Layer -> the layers it may import. Most specific path
   prefix wins, so 'rules/parts' is checked before 'rules'.

   Read the table as a sentence: nothing may point sideways or up. A layer
   that does not list ITSELF is a layer whose modules may not import each
   other — that is how `rules` siblings are forced to talk through `model` and
   how `rules/parts` leaves are forced to talk through slots.
   ------------------------------------------------------------------ */
const MAY = {
  'core':        ['core'],
  'data':        ['core', 'data'],
  'model':       ['core', 'data', 'model'],
  'rules/parts': ['core', 'data', 'model'],
  'rules':       ['core', 'data', 'model', 'rules/parts'],
  'view':        ['core', 'data', 'model', 'view'],
  'shell':       ['core', 'data', 'model', 'rules', 'rules/parts', 'view', 'shell']
};

/* `view` may read model queries and may not touch a mutator. */
const VIEW_MAY_NOT_NAME = /\bwrite\b/;

const SRC = resolve('src');
const IMPORT = /(?:import|export)\s+(?:([\s\S]*?)\s+from\s+)?['"](\.[^'"]+)['"]/g;

const layerOf = f => {
  const parts = f.split('/');
  const two = parts.slice(0, 2).join('/');
  return MAY[two] ? two : parts[0];
};

const walk = d => readdirSync(d).flatMap(e => {
  const p = join(d, e);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

const bad = [];
const files = walk(SRC).map(f => relative(SRC, f).split('\\').join('/'));

/* ---------------- PASS 1: direction ---------------- */
const edges = [];
for (const from of files) {
  const fl = layerOf(from);
  const text = readFileSync(join(SRC, from), 'utf8');

  for (const [, clause = '', spec] of text.matchAll(IMPORT)) {
    const to = relative(SRC, resolve(dirname(join(SRC, from)), spec))
                 .split('\\').join('/');
    if (to.startsWith('..')) continue;
    const tl = layerOf(to);
    edges.push([from, to]);

    if (!MAY[fl])
      bad.push(`${from}   [file is in no declared layer]`);
    else if (!MAY[fl].includes(tl))
      bad.push(`${from} -> ${to}   ${fl === tl
        ? `[${fl} modules must talk through a lower layer, not each other]`
        : `[${fl} may not import ${tl}]`}`);

    if (fl === 'view' && tl === 'model') {
      if (VIEW_MAY_NOT_NAME.test(clause))
        bad.push(`${from} -> ${to}   [view imported a model mutator]`);
      if (/^\s*\*\s+as\b/.test(clause))
        bad.push(`${from} -> ${to}   [view namespace-imported a model module]`);
    }
  }
}

/* Intra-layer cycles: plain DFS over the edges collected above. This is the
   rule that catches src/render/scene.js <-> src/render/hud.js. */
function cycles(list) {
  const g = new Map(), out = [], seen = new Set();
  for (const [a, b] of list) {
    if (!g.has(a)) g.set(a, []);
    g.get(a).push(b);
  }
  const from = (n, stack) => {
    const i = stack.indexOf(n);
    if (i >= 0) { out.push(stack.slice(i).concat(n)); return; }
    if (seen.has(n)) return;
    seen.add(n);
    for (const m of g.get(n) ?? []) from(m, stack.concat(n));
  };
  for (const n of g.keys()) from(n, []);
  return out;
}
bad.push(...cycles(edges).map(c => `cycle: ${c.join(' -> ')}`));

/* ---------------- PASS 2: resolution ---------------- */
const load = p => import(pathToFileURL(join(SRC, p)).href);

const [slots, parts, subs, recipes, machines, tunables, trinkets, bands, palette, treat]
  = await Promise.all([
      load('data/slots.js'), load('data/parts.js'), load('data/substances.js'),
      load('data/recipes.js'), load('data/machines.js'), load('data/tunables.js'),
      load('data/trinkets.js'), load('data/bands.js'), load('data/palette.js'),
      load('view/treatments.js')
    ].map(p => p.catch(e => { bad.push(`import failed: ${e.message}`); return {}; })));

const T = tunables.TUNABLES ?? {};
const SL = slots.SLOTS ?? {};
const PA = parts.PARTS ?? {};

const resolves = sel => {
  try { subs.matches(sel); return true; } catch { return false; }
};

/* (a) every part row is coherent, and no parameter name collides with a slot
       output field — the collision documented in rules/parts/hotservo.js. */
for (const [name, P] of Object.entries(PA)) {
  for (const s of P.provides) if (!SL[s]) bad.push(`data/parts.js ${name}: provides unknown slot '${s}'`);
  for (const sel of P.needs) {
    const s = slots.slotOf(sel);
    if (!SL[s]) bad.push(`data/parts.js ${name}: needs unknown slot '${s}'`);
  }
  const outFields = new Set(P.provides.flatMap(s => SL[s]?.out ?? []));
  for (const k of Object.keys(P.defaults ?? {}))
    if (outFields.has(k))
      bad.push(`data/parts.js ${name}: parameter '${k}' collides with the slot output field of the same name`);
  for (const k of P.tunables ?? [])
    if (T[P.defaults?.[k]] === undefined)
      bad.push(`data/parts.js ${name}: '${k}' names tunable '${P.defaults?.[k]}' which data/tunables.js does not declare`);
}

/* (b) every slot's declared ops exist. Importing model/slots.js asserts it. */
await load('model/slots.js').catch(e => bad.push(`model/slots.js: ${e.message}`));

/* (c) every machine's parts exist, its needs are satisfied, and no slot is
       double-provided. This is assemble()'s validation, run statically over
       every row so it fails without placing anything. */
for (const m of machines.MACHINES ?? []) {
  const provided = new Set();
  for (const [name] of m.parts) {
    const P = PA[name];
    if (!P) { bad.push(`data/machines.js ${m.id}: unknown part '${name}'`); continue; }
    for (const s of P.provides) {
      if (provided.has(s)) bad.push(`data/machines.js ${m.id}: slot '${s}' provided twice`);
      provided.add(s);
    }
  }
  for (const [name] of m.parts)
    for (const sel of PA[name]?.needs ?? []) {
      const s = slots.slotOf(sel);
      if (!provided.has(s) && !slots.optional(sel))
        bad.push(`data/machines.js ${m.id}.${name}: needs slot '${s}' and no part provides it`);
    }
  if (!m.parts.some(([n]) => n === 'Footprint'))
    bad.push(`data/machines.js ${m.id}: no Footprint part`);

  /* selectors in caps and catch-box accept lists */
  for (const [, p] of m.parts) {
    for (const sel of Object.keys(p?.cap ?? {}))
      if (!resolves(sel)) bad.push(`data/machines.js ${m.id}: buffer cap selector '${sel}' resolves to nothing`);
    for (const sel of p?.accepts ?? [])
      if (!resolves(sel)) bad.push(`data/machines.js ${m.id}: accepts selector '${sel}' resolves to nothing`);
    if (p?.fuel && !resolves(p.fuel))
      bad.push(`data/machines.js ${m.id}: fuel selector '${p.fuel}' resolves to nothing`);
  }

  /* every Recipe part's tag has at least one row */
  const tag = m.parts.find(([n]) => n === 'Recipe')?.[1]?.tag;
  if (tag !== undefined && !(recipes.RECIPES ?? []).some(r => r.tag === tag))
    bad.push(`data/machines.js ${m.id}: recipe tag '${tag}' has no row in data/recipes.js`);

  /* a recipe row requiring heat on a machine with no heat provider would
     never fire. Silent by nature, so it is checked here. */
  if (tag !== undefined && !provided.has('heat'))
    for (const r of (recipes.RECIPES ?? []).filter(r => r.tag === tag))
      if (r.heat !== undefined)
        bad.push(`data/machines.js ${m.id}: recipe '${r.tag}' requires heat and this machine has no heat provider`);

  for (const key of Object.values(m.look ?? {}))
    if (typeof key === 'string' && palette.COL?.[key] === undefined)
      bad.push(`data/machines.js ${m.id}: look colour '${key}' is not in data/palette.js`);
}

/* (d) recipe selectors, both sides. THE CHECK RFC 04 AND RFC 06 LACKED:
       a '@field' output reads a field off the substance bound by a '#tag'
       input, so every substance carrying that tag must declare the field, and
       a row with an '@field' output and no '#tag' input can never bind. */
for (const r of recipes.RECIPES ?? []) {
  for (const sel of Object.keys(r.in))
    if (!resolves(sel)) bad.push(`data/recipes.js '${r.tag}': input selector '${sel}' resolves to nothing`);

  const tagIn = Object.keys(r.in).find(s => s[0] === '#');
  for (const sel of Object.keys(r.out)) {
    if (sel[0] !== '@') {
      if (!resolves(sel)) bad.push(`data/recipes.js '${r.tag}': output '${sel}' is not a substance`);
      continue;
    }
    const field = sel.slice(1);
    if (!tagIn) {
      bad.push(`data/recipes.js '${r.tag}': output '${sel}' needs a '#tag' input to bind to`);
      continue;
    }
    for (const i of subs.matches(tagIn)) {
      const s = subs.SUB[i];
      const target = s[field];
      if (!target)
        bad.push(`data/recipes.js '${r.tag}': substance '${s.id}' matches '${tagIn}' `
               + `but declares no '${field}', so it would be consumed and produce nothing`);
      else if (subs.S[target] === undefined)
        bad.push(`data/substances.js ${s.id}.${field}: '${target}' is not a substance`);
    }
  }
  for (const name of Object.keys(r.field ?? {}))
    if (!(bands.BANDS ?? []).some(b => (b.fields ?? []).includes(name)))
      bad.push(`data/recipes.js '${r.tag}': gates on field '${name}' which no band in data/bands.js declares`);
}

/* (e) look rows: treatment names and palette keys */
for (const s of subs.SUBSTANCES ?? []) {
  const L = s.look;
  if (!L) continue;
  for (const key of ['base', 'hi', 'lo'])
    if (L[key] !== undefined && palette.COL[L[key]] === undefined)
      bad.push(`data/substances.js ${s.id}.look.${key}: '${L[key]}' is not in data/palette.js`);
  for (const key of L.item ?? [])
    if (palette.COL[key] === undefined)
      bad.push(`data/substances.js ${s.id}.look.item: '${key}' is not in data/palette.js`);
  for (const [name, p] of L.treatments ?? []) {
    if (treat.TREAT?.[name] === undefined)
      bad.push(`data/substances.js ${s.id}: unknown treatment '${name}' — add a row to view/treatments.js`);
    if (p?.col && palette.COL[p.col] === undefined)
      bad.push(`data/substances.js ${s.id}: treatment colour '${p.col}' is not in data/palette.js`);
  }
  if (s.tile && s.tile.drop !== undefined && subs.S[s.tile.drop] === undefined)
    bad.push(`data/substances.js ${s.id}.tile.drop: '${s.tile.drop}' is not a substance`);
  if (s.item?.hud === undefined && s.item !== undefined)
    bad.push(`data/substances.js ${s.id}: has an item block but no hud block, so it can be held and never shown`);
}

/* (f) every stat() call site in src/ names a declared tunable, and every
       trinket modifies one. This is what makes DESIGN item 8 checkable.

       Honest limit: the scan is textual and does not know comments from code,
       so writing the call in prose inside a comment is a false positive. Fixed
       by rewording the comment, which is the cheaper end of the trade. */
for (const f of files) {
  const text = readFileSync(join(SRC, f), 'utf8');
  for (const [, name] of text.matchAll(/\bstat\(\s*'([^']+)'/g))
    if (T[name] === undefined)
      bad.push(`${f}: stat('${name}') — no such row in data/tunables.js`);
}
const TAGS = new Set((recipes.RECIPES ?? []).map(r => r.tag));
for (const t of trinkets.TRINKETS ?? [])
  for (const m of t.mods) {
    if (T[m.tunable] === undefined)
      bad.push(`data/trinkets.js ${t.id}: modifies unknown tunable '${m.tunable}'`);
    /* A scope is a recipe tag or a substance id. A scope that names neither
       silently modifies nothing, forever — the exact failure mode the review
       flagged in RFC 04 and RFC 06, arriving here through the boon table. */
    if (m.scope !== undefined && !TAGS.has(m.scope) && subs.S?.[m.scope] === undefined)
      bad.push(`data/trinkets.js ${t.id}: scope '${m.scope}' is neither a recipe tag `
             + `nor a substance id, so this modifier can never apply`);
  }

/* (g) the parts vocabulary is fully bound to behaviour. Importing the driver
       runs the same assertion; doing it here means it fails before boot. */
await load('rules/machines.js').catch(e => bad.push(`rules/machines.js: ${e.message}`));

/* ---------------- report ---------------- */
const BUDGET = Number(process.env.LAYER_BUDGET ?? 0);
if (bad.length > BUDGET) {
  console.error(`\nviolations: ${bad.length} (budget ${BUDGET})`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`  ok   ${files.length} files, ${edges.length} import edges`);
console.log(`  ok   dependency direction clean (${bad.length}/${BUDGET})`);
console.log(`  ok   ${Object.keys(SL).length} slots, ${Object.keys(PA).length} parts, `
          + `${(machines.MACHINES ?? []).length} machines, `
          + `${(subs.SUBSTANCES ?? []).length} substances resolve`);
