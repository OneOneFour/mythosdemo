#!/usr/bin/env node
/* Comment lint. Zero dependencies, no parser: a state machine walks the source
   tracking strings, template literals and regex literals so a comment marker
   inside one is never mistaken for a comment.

   Usage:
     node tools/check-comments.mjs <file> [...]   check the named files
     node tools/check-comments.mjs --all          walk the whole tree

   Exits 1 with one `path:line: reason` per violation on stderr. */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Every path exclusion lives here. `vendor/` is a drop-in and carries its own
   licence header; `reference/` is a preserved art target; `dist/` is build
   output. */
const IGNORE = [
  'node_modules/', 'dist/', 'vendor/', 'reference/', 'playwright-report/',
  'test-results/', '.git/', 'tests/fixtures/'
];

const ESCAPE = 'comment-lint-ignore-next-line';

/* A block may run to ten lines. Most should be one or two. This is the only
   length rule: a comment-longer-than-the-code ratio was tried and removed,
   because the comments most worth keeping here sit above a single subtle
   line and it flagged every one of them. */
const MAX_BLOCK_LINES = 10;

/* A file-top block gets more room, because a `data/` table's field key and
   `shell/schedule.js`'s one-row-per-pair order are reference tables a reader
   of the file needs in the file. 36 is `data/machines.js`'s 22-key table at
   one line per key plus its layer declaration, which is the largest honest
   one in the tree. Prose does not qualify at any length. */
const MAX_HEADER_LINES = 36;

/* A block whose body is mostly ALIGNED ROWS -- a short key, two or more
   spaces, then a description -- is a reference table rather than prose, and
   the length cap does not apply to it. Scannability is the whole point of the
   shape, so squeezing one costs the reader and saves nothing. Four rows is
   the floor -- one prose sentence cannot reach it, and `data/forms.js`'s
   selector grammar has one row whose column is too tight to detect. */
const TABLE_MIN_ROWS = 4;

/* A row is `<key>  <description>` with two or more spaces between, and a TABLE
   is four or more rows whose description starts at the SAME column. Column
   agreement is what tells a table from prose that happens to contain a double
   space, and it allows a multi-word key (`the two hubs`) that a single-token
   pattern would miss. */
const isTable = text => {
  const cols = new Map();
  for (const l of text.split('\n')) {
    const m = l.match(/^(\s*(?:\*\s*)?)(\S.{0,30}?)\s{2,}(\S)/);
    if (!m) continue;
    const col = m[0].length - 1;
    if (col < 6) continue;
    cols.set(col, (cols.get(col) ?? 0) + 1);
  }
  for (const n of cols.values()) if (n >= TABLE_MIN_ROWS) return true;
  return false;
};

/* More than this many consecutive `//` lines is a block wearing a disguise. */
const MAX_RUN = 4;

const RULES = [
  [/\b[A-Za-z][A-Za-z0-9_-]*\.md\b/, 'references a document; state the constraint instead'],
  [/\u00a7\s*\d|\bsections?\s+\d/i, 'cites a document section'],
  /* Capital-P `Phase 13d`, or a lowercase one with a letter suffix (`phase 6e`).
     Bare lowercase `phase 0` is a gear's rotational phase, not a project one. */
  [/\bPhases?\s?\d|\bphases?\s?\d+[a-z]\b|\bgate\s?\d|\bwave\s?\d/, 'names a phase, gate or wave'],
  [/(?<![A-Za-z])D1?\d(-[A-Z]\b|\b(?!\s*(px|ms|s\b|tiles?|talents?)))/, 'cites a decision number'],
  [/\binvariants?\s+\d/i, 'cites an invariant by number'],
  [/\bassertion\s+\d/i, 'cites an assertion by number'],
  [/\bacceptance criteri/i, 'restates acceptance criteria'],
  [/\borchestrator\b|\bsub-?agent\b|\breview panel\b/i, 'names the authoring process'],
  [/as (noted|discussed|described|stated) (above|below|earlier)/i, 'narrates the document'],
  [/(per|according to) the (spec|plan|design|requirements?)/i, 'defers to a document'],
  [/\b(I|we)\s+(chose|decided|opted|kept|added|implemented|will)\b/, 'narrates your own process'],
  [/^\s*(?:\/\/|\*|\/\*)\s*(First|Then|Next|Finally|Now),\s/m, 'narrates control flow'],
  [/TODO:?\s*(confirm|ask|check with|revisit|maybe|later)|FIXME:?\s*maybe/i, 'speculative TODO'],
  [/\bfor now\b|\bplaceholder for\b|\bstub for future\b|\bwill be replaced\b/i, 'defers to a future version'],
  [/^\s*(?:\/\/|\*)\s*(was|previously|old|changed from|used to be)\b/im, 'describes a previous version'],
  [/\bused to (be|say|live|claim|hold|call|return|sit|mean)\b|\bthis (comment|file) used to\b|\ban earlier (version|comment|pass)\b/i, 'describes a previous version'],
  [/^\s*(?:\/\/|\/\*)\s*[=*\-~#_]{4,}/m, 'section banner'],
  [/^\s*\/\/\s*(?:const|let|var|if|for|while|return|function|import|export|class)\b.*[;{)]\s*$/m, 'commented-out code'],
];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(ROOT, p).split('\\').join('/') + (e.isDirectory() ? '/' : '');
    if (IGNORE.some(ig => rel.startsWith(ig))) continue;
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const RE_BEFORE = /[({[,;=+\-*%&|^!?:~<>]|\b(return|typeof|instanceof|in|of|new|delete|void|do|else|case|yield|await)$/;

/* Every comment in `src`, with its line span and whether it shares a line with
   code. Skips comment markers inside strings, templates and regex literals. */
function comments(src) {
  const out = [];
  let i = 0, line = 1, col = 0, lastCode = '';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; col = 0; lastCode = ''; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; col++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i); if (j < 0) j = n;
      out.push({ kind: 'line', start: line, end: line, text: src.slice(i, j), inline: col > 0 && lastCode !== '' });
      i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      const text = src.slice(i, j), nl = (text.match(/\n/g) || []).length;
      out.push({ kind: 'block', start: line, end: line + nl, text, inline: col > 0 && lastCode !== '' });
      line += nl; i = j; col = 0; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++; col++;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
        if (d === '\n') { line++; i++; continue; }
        if (q === '`' && d === '$' && src[i + 1] === '{') {
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            const e = src[i];
            if (e === '\n') line++;
            else if (e === '{') depth++;
            else if (e === '}') depth--;
            else if (e === '"' || e === "'" || e === '`') {
              const q2 = e; i++;
              while (i < n && src[i] !== q2) { if (src[i] === '\\') i++; if (src[i] === '\n') line++; i++; }
            }
            i++;
          }
          continue;
        }
        if (d === q) { i++; break; }
        i++;
      }
      lastCode = q; col++; continue;
    }
    if (c === '/' && RE_BEFORE.test(lastCode)) {
      i++;
      let inClass = false;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { i++; break; }
        else if (d === '\n') break;
        i++;
      }
      lastCode = '/re/'; continue;
    }
    lastCode = (lastCode + c).slice(-12); i++; col++;
  }
  return out;
}

function checkFile(abs) {
  const rel = relative(ROOT, abs).split('\\').join('/');
  const src = readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  const found = [];
  const say = (line, why) => found.push(`${rel}:${line}: ${why}`);

  const exempt = new Set();
  lines.forEach((l, i) => { if (l.includes(ESCAPE)) exempt.add(i + 2); });

  const cs = comments(src).filter(c => !c.text.includes(ESCAPE));
  for (const c of cs) {
    if (exempt.has(c.start)) continue;
    const len = c.end - c.start + 1;
    for (const [re, why] of RULES) if (re.test(c.text)) say(c.start, why);
    const cap = c.start === 1 ? MAX_HEADER_LINES : MAX_BLOCK_LINES;
    if (len > cap && !isTable(c.text)) say(c.start, `block is ${len} lines, cap ${cap}`);
  }

  let run = 0, runStart = 0;
  for (const c of cs) {
    if (c.kind === 'line' && !c.inline && c.start === runStart + run) run++;
    else { if (run > MAX_RUN && !exempt.has(runStart)) say(runStart, `${run} consecutive // lines, cap ${MAX_RUN}`); run = 1; runStart = c.start; }
  }
  if (run > MAX_RUN && !exempt.has(runStart)) say(runStart, `${run} consecutive // lines, cap ${MAX_RUN}`);

  return found;
}

const args = process.argv.slice(2).filter(Boolean);
const all = args.includes('--all') || args.length === 0;
const targets = all
  ? await walk(ROOT)
  : args.flatMap(a => a.split(/\s+/)).filter(a => /\.(js|mjs)$/.test(a))
       .map(a => (a.startsWith('/') ? a : join(ROOT, a)))
       .filter(a => !IGNORE.some(ig => relative(ROOT, a).split('\\').join('/').startsWith(ig)));

const found = targets.flatMap(checkFile);
if (found.length) {
  for (const f of found) console.error(f);
  console.error(`\n${found.length} comment violation(s). See CLAUDE.md "Comments".`);
  process.exit(1);
}
if (all) console.log(`comment lint: ${targets.length} files, 0 violations`);
