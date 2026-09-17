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

/* A block may run to four lines; most should be one. */
const MAX_BLOCK_LINES = 4;

/* A file-top block gets more room for a reference table a reader needs while
   in the file: a `data/` field key, `shell/boot.js`'s boot order,
   `shell/schedule.js`'s step order. Prose does not qualify at any length. */
const MAX_HEADER_LINES = 20;

/* A block of aligned rows is a reference table, not prose, so the length cap
   does not apply to it. Three rows is the floor: `data/forms.js`'s tile-byte
   cases and `data/scenarios.js`'s lift stages are both three. */
const TABLE_MIN_ROWS = 3;

/* A row is `<key>  <description>`, two or more spaces between, and a table is
   TABLE_MIN_ROWS rows whose description starts at the same column. Column
   agreement tells a table from prose holding one double space; the 40-char
   key window admits a multi-word key and an arithmetic one. */
const isTable = text => {
  const cols = new Map();
  for (const l of text.split('\n')) {
    const m = l.match(/^(\s*(?:\*\s*)?)(\S.{0,40}?)\s{2,}(\S)/);
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

/* An identifier or a UI string in backticks or quotes is not shouting, so the
   emphasis rule reads the prose around them rather than the whole comment. */
const unquoted = t => t.replace(/`[^`]*`|'[^']*'|"[^"]*"/g, ' ');

const RULES = [
  [/\b[A-Za-z][A-Za-z0-9_-]*\.md\b/, 'references a document; state the constraint instead'],
  [/\u00a7\s*\d|\bsections?\s+\d/i, 'cites a document section'],
  /* comment-lint-ignore-next-line -- a rule may name what it rejects.
     Capital-P `Phase 13d`, or a lowercase one with a letter suffix
     (`phase 6e`). Bare lowercase `phase 0` is a gear's rotational phase. */
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
  /* comment-lint-ignore-next-line -- naming the style rule that bans them.
     Both words call a line important instead of saying what breaks. */
  [/\bload-bearing\b|\bcrux\b/i, 'banned word; say what breaks instead'],
  /* Four or more caps words in a row, counted outside backticks and quotes so
     an identifier or an asserted UI string never trips it. */
  [/(?:\b[A-Z][A-Z]+\b[ ,]+){3}\b[A-Z][A-Z]+\b/, 'shouted emphasis; say what the code does', unquoted],
  [/\bthis is (critical|important|essential)\b|\bthe whole point\b|\bis the whole of\b|\bnot cosmetic\b|\bworth having in one place\b/i, 'self-assessment'],
  [/\bwas rejected\b|\brejected (alternative|because)\b|\bthe old [a-z]+\b|\bcarries? forward\b/i, 'describes a previous version'],
  [/\bthe player (feels|wonders|would have to)\b|\bthe myth\b|\bevokes\b|\bthe premise\b/i, 'game-design rationale'],
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
  /* The header is the file's FIRST block, not necessarily the one on line 1: a
     shebang, a `use strict` or a lone import ahead of it does not make it an
     ordinary mid-file block. */
  const header = cs.find(c => c.kind === 'block' && !c.inline)?.start ?? -1;
  for (const c of cs) {
    if (exempt.has(c.start)) continue;
    const len = c.end - c.start + 1;
    for (const [re, why, prep] of RULES) if (re.test(prep ? prep(c.text) : c.text)) say(c.start, why);
    const cap = c.start === header && c.start <= 8 ? MAX_HEADER_LINES : MAX_BLOCK_LINES;
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
