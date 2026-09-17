/* Produces dist/mythos-factory.html: one self-contained file, openable from
   disk. esbuild bundles and minifies, and the result is inlined into the HTML
   shell. `npm start` does not go through here; it serves `src/` untransformed. */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(ROOT, 'dist', 'mythos-factory.html');

const minify = !process.argv.includes('--no-minify');

const result = await build({
  entryPoints: [join(ROOT, 'src', 'shell', 'main.js')],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  minify,
  write: false,
  legalComments: 'inline',        // keep the vendored ZzFX MIT notice
  logLevel: 'warning'
});

const js = result.outputFiles[0].text;

const shell = await readFile(join(ROOT, 'index.html'), 'utf8');

const TAG = '<script type="module" src="./src/shell/main.js"></script>';
if (!shell.includes(TAG))
  throw new Error(`index.html no longer contains the expected script tag:\n  ${TAG}`);

// A literal </script> in the bundle would close the tag early; the split
// sequence is inert inside a string, regex or comment alike.
const safe = js.replaceAll('</script', '<\\/script');

/* A replacer function, not a replacement string: `String.replace` interprets
   `$&`, `$'`, `` $` `` and `$1`..`$99` in a string, and minified JS contains
   `$` in identifiers. A function replacer disables all of it. */
const html = shell.replace(TAG, () => `<script type="module">\n${safe}\n</script>`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, html);

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`\n  dist/mythos-factory.html`);
console.log(`  bundled js  ${kb(Buffer.byteLength(js))}${minify ? ' (minified)' : ''}`);
console.log(`  total html  ${kb(Buffer.byteLength(html))}`);
console.log(`  self-contained: ${/src=["']\.\//.test(html) ? 'NO — external refs remain' : 'yes'}\n`);
