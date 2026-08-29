// Inline every module back into one self-contained .html, for sharing a build
// with no server. Resolves the import graph, strips import/export keywords,
// and concatenates in dependency order.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';

const ENTRY = 'src/main.js';
const order = [], seen = new Set();

async function walk(file) {
  const abs = resolve(file);
  if (seen.has(abs)) return;
  seen.add(abs);
  const text = await readFile(abs, 'utf8');
  for (const m of text.matchAll(/^import\s+\{[^}]*\}\s+from\s+'([^']+)';?$/gm))
    await walk(resolve(dirname(abs), m[1]));
  order.push([abs, text]);
}

await walk(ENTRY);

const body = order.map(([abs, text]) => {
  const stripped = text
    .replace(/^import\s+\{[^}]*\}\s+from\s+'[^']+';?$/gm, '')
    .replace(/^export\s+(?=(function|const|let|var|class)\b)/gm, '');
  return `/* ==== ${relative(process.cwd(), abs)} ==== */\n${stripped.trim()}`;
}).join('\n\n');

const html = (await readFile('index.html', 'utf8'))
  .replace(/<script type="module"[^>]*><\/script>/,
           `<script>\n"use strict";\n${body}\n</script>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/mythos-factory.html', html);
console.log(`bundled ${order.length} modules -> dist/mythos-factory.html`);
