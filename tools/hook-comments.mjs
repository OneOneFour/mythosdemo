#!/usr/bin/env node
/* PostToolUse hook: comment-lint the one file an edit just touched.

   Reads the hook payload on stdin, picks `tool_input.file_path` out of it,
   and runs `tools/check-comments.mjs` on that path alone. Exit 2 is the code
   Claude Code feeds stderr back on, so a violation arrives as a correction
   rather than as a silent pass.

   It stays quiet for anything that is not a tracked `.js`/`.mjs` file, and it
   never fails the edit for its own reasons: an unreadable payload, a missing
   path or a checker that cannot run all exit 0. A lint that blocks work when
   it is itself broken gets turned off. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const read = () => new Promise(res => {
  let s = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { s += d; });
  process.stdin.on('end', () => res(s));
  setTimeout(() => res(s), 2000).unref();
});

let path;
try {
  path = JSON.parse(await read())?.tool_input?.file_path;
} catch { process.exit(0); }

if (!path || !/\.(js|mjs)$/.test(path) || !existsSync(path)) process.exit(0);
const rel = relative(ROOT, path).split('\\').join('/');
if (rel.startsWith('..') || /^(node_modules|dist|vendor|reference)\//.test(rel)) process.exit(0);

const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'check-comments.mjs'), path], { encoding: 'utf8' });
if (r.status === 1) {
  process.stderr.write((r.stderr || '') + `\nFix ${rel}'s comments before moving on.\n`);
  process.exit(2);
}
process.exit(0);
