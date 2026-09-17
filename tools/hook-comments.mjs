#!/usr/bin/env node
/* PostToolUse hook: comment-lints the file named by `tool_input.file_path` on
   stdin. Exit 2 feeds stderr back to Claude Code as a correction; an untracked
   path, an unreadable payload or a broken checker all exit 0. */
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
