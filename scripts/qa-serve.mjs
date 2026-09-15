// scripts/qa-serve.mjs — a static server for a QA harness that wants one.
//
// WHY THIS EXISTS. Most harnesses in this repo stand up their own tiny server
// over public/ and never think about it again. Three did not: qa-skyflyer-hud,
// qa-skyflyer-look and qa-skyflyer-sky each expected somebody to have already
// run `python3 -m http.server 8899` in another window, and when nobody had they
// died with ERR_CONNECTION_REFUSED and a stack trace. In `qa-all.mjs` that reads
// exactly like a broken game. It is not: it is a missing window.
//
// So: ask for a base URL and get one. If something is already answering on
// SKY_BASE (or on the old 8899, or on whatever you pass), that is used and
// nothing is started. If nothing answers, this serves public/ on a free port
// for the life of the process.
//
// Usage:
//   import { qaBase } from './scripts/qa-serve.mjs';
//   const { base, close } = await qaBase();     // ... and call close() at the end
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

// Is somebody already serving here? One quick HEAD, and no waiting around: a
// harness should not spend three seconds finding out that nothing is listening.
function alreadyUp(base, ms = 900) {
  return new Promise((res) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; res(v); } };
    try {
      const u = new URL(base);
      const req = http.request(
        { host: u.hostname, port: u.port || 80, path: '/', method: 'HEAD', timeout: ms },
        (r) => { r.resume(); finish(r.statusCode > 0); });
      req.on('error', () => finish(false));
      req.on('timeout', () => { req.destroy(); finish(false); });
      req.end();
    } catch { finish(false); }
  });
}

export async function qaBase(opts = {}) {
  const dir = path.resolve(ROOT, opts.dir || 'public');
  const wanted = opts.base || process.env.SKY_BASE || process.env.QA_BASE || '';
  for (const candidate of [wanted, 'http://127.0.0.1:8899'].filter(Boolean)) {
    if (await alreadyUp(candidate)) return { base: candidate, close() {}, started: false };
  }
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found: ' + rel); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, close() { try { server.close(); } catch {} }, started: true };
}
