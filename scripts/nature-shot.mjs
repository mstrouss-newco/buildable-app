// scripts/nature-shot.mjs — the model camera (card AC10).
//
// Turns the CC0 Quaternius Stylized Nature models in public/models/nature into
// flat, transparent, side-on 2D sprites the Ant City meadow is built out of.
// Everything in one lighting rig, so thirteen pieces shot in one run look like
// one set of art rather than thirteen downloads.
//
//   node scripts/nature-shot.mjs                  # every piece in the table
//   node scripts/nature-shot.mjs CommonTree_1     # just these
//   node scripts/nature-shot.mjs --out public/antcity/art/world
//
// HOW IT WORKS, and why it is done this way
//
// three.js renders each .gltf into a canvas with `alpha: true` and
// `preserveDrawingBuffer: true`, lit by a hemisphere fill, a warm key and a cool
// rim, through an OrthographicCamera framed to the model's own bounding box. An
// orthographic camera is the whole point: a perspective one gives a tree a
// vanishing point, and a sprite with a vanishing point cannot be tiled across a
// meadow without every copy pointing at a different place. Then canvas.toDataURL
// and a margin trim, so the PNG is the piece and nothing else.
//
// It runs headless through Playwright with SwiftShader (there is no GPU in the
// sandbox), serves public/ itself, and never touches the network. Thirteen
// pieces take about a minute.
//
// Bush_Common is deliberately NOT in the table: its texture resolves dark red,
// which is a bug in the pack, not in this camera. Bush_Common_Flowers is the
// same bush with the right colours on it.
//
// It writes PNGs and nothing else. Putting a sprite into the game is a separate,
// deliberate step in the engine.
import fs from 'fs';
import path from 'path';
import http from 'http';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT = flag('out', 'public/antcity/art/world');
const only = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');

// Every piece, with the slug it is saved under and how tall to shoot it. `tilt`
// is how far the camera is lifted off the horizon: 0 is dead side-on, which is
// what a side-view game wants, and a few degrees gives a rock or a flower bed
// just enough top to sit on the ground rather than float in front of it.
const PIECES = [
  { file: 'CommonTree_1',       slug: 'tree-round-1',   px: 512, tilt: 4 },
  { file: 'CommonTree_3',       slug: 'tree-round-2',   px: 512, tilt: 4 },
  { file: 'CommonTree_5',       slug: 'tree-round-3',   px: 512, tilt: 4 },
  { file: 'Pine_1',             slug: 'tree-pine-1',    px: 512, tilt: 4 },
  { file: 'Pine_3',             slug: 'tree-pine-2',    px: 512, tilt: 4 },
  { file: 'Bush_Common_Flowers', slug: 'bush-flowers',  px: 384, tilt: 6 },
  // the fern lies almost flat on the ground, so a side-on camera sees it edge-on
  // and gets a sliver. It is the one piece that has to be looked down on.
  { file: 'Fern_1',             slug: 'fern',           px: 320, tilt: 38 },
  { file: 'Grass_Common_Tall',  slug: 'grass-tall',     px: 256, tilt: 3 },
  { file: 'Flower_3_Group',     slug: 'flowers-1',      px: 256, tilt: 8 },
  { file: 'Flower_4_Group',     slug: 'flowers-2',      px: 256, tilt: 8 },
  { file: 'Mushroom_Common',    slug: 'mushroom',       px: 256, tilt: 6 },
  { file: 'Rock_Medium_1',      slug: 'rock-1',         px: 256, tilt: 8 },
  { file: 'Rock_Medium_2',      slug: 'rock-2',         px: 256, tilt: 8 },
];

const want = only.length ? PIECES.filter((p) => only.includes(p.file) || only.includes(p.slug)) : PIECES;
if (!want.length) { console.log('nature-shot: nothing matched'); process.exit(1); }

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { try { ({ chromium } = await import('playwright')); } catch {} }
if (!chromium) { console.log('SKIP  nature-shot needs Playwright, which is not installed.'); process.exit(0); }
const exe = [process.env.BK_CHROME, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .filter(Boolean).find((f) => { try { return fs.existsSync(f); } catch { return false; } });
if (!fs.existsSync('node_modules/three')) {
  console.log('SKIP  nature-shot needs three. Run: npm i three');
  process.exit(0);
}

// serve the repo root, so the page can reach BOTH /public/models and /node_modules/three
const ROOT = path.resolve('.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((res) => srv.listen(0, res));
const PORT = srv.address().port;

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0000">
<script type="importmap">{"imports":{
  "three":"/node_modules/three/build/three.module.js",
  "three/addons/":"/node_modules/three/examples/jsm/"
}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.shoot = async (file, px, tilt) => {
  const cv = document.createElement('canvas'); cv.width = px; cv.height = px;
  const R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
  R.setClearColor(0x000000, 0);
  R.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  // one rig for every piece: a soft sky fill, a warm key from the left where the
  // meadow's sun is, and a cool rim behind so a dark tree still has an edge
  scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x8a7048, 1.5));
  const key = new THREE.DirectionalLight(0xfff4dc, 2.0); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe4ff, 0.9); rim.position.set(3, 2, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55); fill.position.set(2, 1, 5); scene.add(fill);
  const gltf = await new GLTFLoader().loadAsync('/public/models/nature/' + file + '.gltf');
  const obj = gltf.scene;
  obj.traverse((m) => { if (m.isMesh && m.material) { m.material.side = THREE.DoubleSide; m.material.metalness = 0; } });
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(), mid = new THREE.Vector3();
  box.getSize(size); box.getCenter(mid);
  const span = Math.max(size.x, size.y) * 0.58;      // a little air around the piece
  const cam = new THREE.OrthographicCamera(-span, span, span, -span, 0.01, 400);
  const t = (tilt || 0) * Math.PI / 180;
  cam.position.set(mid.x, mid.y + Math.sin(t) * 100, mid.z + Math.cos(t) * 100);
  cam.lookAt(mid);
  R.render(scene, cam);
  // TRIM. Everything outside the piece is transparent, so the sprite is cropped
  // to its own ink here rather than in a second tool: a PNG that is exactly the
  // thing means the engine can place it by its base and never has to guess how
  // much empty space a particular model happened to be shot with.
  // the render canvas belongs to WebGL, so its pixels are read by drawing it onto
  // a plain 2D one first
  const flat = document.createElement('canvas'); flat.width = px; flat.height = px;
  const g2 = flat.getContext('2d'); g2.drawImage(cv, 0, 0);
  const px2 = g2.getImageData(0, 0, px, px).data;
  let x0 = px, y0 = px, x1 = -1, y1 = -1;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    if (px2[(y * px + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) { R.dispose(); return null; }          // nothing rendered at all
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  out.getContext('2d').drawImage(flat, x0, y0, w, h, 0, 0, w, h);
  const url = out.toDataURL('image/png');
  R.dispose();
  return url;
};
window.__ready = 1;
</script></body>`;
fs.writeFileSync('.nature-shot-page.html', PAGE);

let browser;
try {
  browser = await chromium.launch({
    executablePath: exe || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
} catch (e) {
  console.log('SKIP  could not launch Chromium: ' + String((e && e.message) || e).split('\n')[0]);
  srv.close(); process.exit(0);
}
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  page error: ' + e.message));
await page.goto(`http://127.0.0.1:${PORT}/.nature-shot-page.html`);
await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });

fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (const p of want) {
  const url = await page.evaluate(([f, px, tilt]) => window.shoot(f, px, tilt), [p.file, p.px, p.tilt]);
  if (!url) { console.log(`MISS  ${p.slug.padEnd(14)} ${p.file}  rendered nothing`); continue; }
  const raw = Buffer.from(String(url).split(',')[1], 'base64');
  const dest = path.join(OUT, p.slug + '.png');
  fs.writeFileSync(dest, raw);
  console.log(`SHOT  ${p.slug.padEnd(14)} ${p.file}  ${(raw.length / 1024).toFixed(0)}KB`);
  made++;
}
await browser.close(); srv.close();
try { fs.unlinkSync('.nature-shot-page.html'); } catch {}
console.log(`\n${made} sprite(s) in ${OUT}, each already trimmed to its own ink.`);
process.exit(0);
