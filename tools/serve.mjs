// Zero-dependency static server. ES modules need a real HTTP origin
// (file:// blocks them), but they do not need a bundler.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    // refuse to serve outside the project directory
    const safe = normalize(join(ROOT, path));
    if (!safe.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const body = await readFile(safe);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(safe)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }).end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(String(err.code || err));
  }
}).listen(PORT, () => {
  console.log(`\n  Underground Mythos Factory`);
  console.log(`  serving ${ROOT}`);
  console.log(`  http://localhost:${PORT}\n`);
});
