// Produces dist/mythos-factory.html: one self-contained file, no external
// requests, openable from disk. esbuild does the bundling and minifying; the
// only hand-written part is inlining the result into the HTML shell.
//
// Dev does NOT go through here. `npm start` serves src/ as native ES modules
// with no transform, so what you debug is what you wrote — real line numbers,
// no source maps, inspectable module graph. This script exists for the
// shipping artifact only, and `npm run parity` asserts the two agree.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(ROOT, 'dist', 'mythos-factory.html');

const minify = !process.argv.includes('--no-minify');

const result = await build({
  entryPoints: [join(ROOT, 'src', 'main.js')],
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

const TAG = '<script type="module" src="./src/main.js"></script>';
if (!shell.includes(TAG))
  throw new Error(`index.html no longer contains the expected script tag:\n  ${TAG}`);

// A literal </script> anywhere in the code would close the tag early. Splitting
// the sequence is safe inside a JS string and inside a regex/comment alike.
const safe = js.replaceAll('</script', '<\\/script');

// Use a REPLACER FUNCTION, not a replacement string. String.replace interprets
// $&, $', $` and $1..$99 inside a replacement string, and minified JS contains
// `$` in identifiers — a bundle containing `$&` silently re-inserted the very
// <script src> tag it was replacing, producing a broken artifact that still
// looked plausible. A function replacer disables all `$` interpretation.
const html = shell.replace(TAG, () => `<script type="module">\n${safe}\n</script>`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, html);

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`\n  dist/mythos-factory.html`);
console.log(`  bundled js  ${kb(Buffer.byteLength(js))}${minify ? ' (minified)' : ''}`);
console.log(`  total html  ${kb(Buffer.byteLength(html))}`);
console.log(`  self-contained: ${/src=["']\.\//.test(html) ? 'NO — external refs remain' : 'yes'}\n`);
