// HD1 — the nine pilot screenshots. Three games, one per HUD layout, at the three
// size tiers, each inside a mock of the real shell so the band and the chips are
// photographed together (which is the only way to see whether they collide).
//
//   npm i --no-save playwright-core
//   node scripts/hd1-shots.mjs            # writes qa/hd1-shots/*.png
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require_ = createRequire(ROOT + '/');
const { chromium } = require_('playwright-core');
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'qa', 'hd1-shots');
fs.mkdirSync(OUT, { recursive: true });

// the one size table, read out of the shell so a shot can never be taken of
// numbers the shell does not actually draw
const jsx = fs.readFileSync(path.join(ROOT, 'src/BuildableKids.jsx'), 'utf8');
const tierTable = (t) => {
  const m = jsx.match(new RegExp(t + '\\s*:\\s*\\{([^}]*)\\}'));
  const o = {};
  for (const p of m[1].matchAll(/(\w+)\s*:\s*([\d.]+)/g)) o[p[1]] = parseFloat(p[2]);
  return o;
};

const SIZES = [
  { name: 'phone', w: 390, h: 844, tier: 'phone', btns: 2 },
  { name: 'tablet', w: 820, h: 1180, tier: 'tablet', btns: 3 },
  { name: 'computer', w: 1440, h: 900, tier: 'computer', btns: 3 },
];
const PILOTS = [
  { id: 'breaker', layout: 'action', src: '/breaker-engine.html?screen=play', wait: 6000 },
  { id: 'farm', layout: 'world', src: '/skyflyer-farm.html', wait: 9000 },
  { id: 'tictactoe', layout: 'board', src: '/tictactoe-engine.html?screen=demo', wait: 7000 },
];

const mock = (src, T, tier, n) => {
  const top = (T.band - T.btn) / 2;
  // the real NavBtn icons, so a screenshot shows the shell as a kid sees it
  const sv = 'stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const sz = Math.round(T.btn * 0.5);
  const ICON = {
    sound: `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24"><g ${sv}><path d="M5 9v6h4l5 4V5L9 9z"/><path d="M17 8a5 5 0 0 1 0 8"/></g></svg>`,
    menu: `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24"><g ${sv}><path d="M4 7h16M4 12h16M4 17h16"/></g></svg>`,
    help: '?',
  };
  const order = tier === 'phone' ? ['sound', 'menu'] : ['sound', 'menu', 'help'];
  let btns = '';
  for (let i = 0; i < n; i++)
    btns += `<button class="navbtn" style="top:${top}px;right:${T.pad + i * (T.btn + T.gap)}px">${ICON[order[n - 1 - i]]}</button>`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 html,body{margin:0;height:100%;overflow:hidden;background:#0F0E17;
   font-family:'Nunito',-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
 .frame{position:fixed;inset:0;z-index:50}
 iframe{width:100%;height:100%;border:none;display:block}
 #shellHome{position:absolute;top:${top}px;left:${T.pad}px;z-index:3;width:${T.home}px;height:${T.btn}px;
   border-radius:999px;background:rgba(18,18,38,0.55);border:1px solid rgba(255,255,255,0.25);
   color:#fff;font-weight:800;font-size:${T.font}px;padding:0;backdrop-filter:blur(6px)}
 .navbtn{position:absolute;z-index:3;width:${T.btn}px;height:${T.btn}px;border-radius:50%;
   border:1px solid rgba(255,255,255,0.25);background:rgba(18,18,38,0.55);color:#fff;
   display:flex;align-items:center;justify-content:center;
   font-weight:800;font-size:${T.font + 3}px;padding:0;backdrop-filter:blur(6px)}
</style>
<div class="frame">
 <button id="shellHome">Home</button>
 ${btns}
 <iframe id="gf" src="${src}"></iframe>
</div>
<script>
var MSG = Object.assign({ type:"bk:band", tier:${JSON.stringify(tier)} }, ${JSON.stringify(T)},
  { navLeft:${T.pad + T.home + T.gap}, navRight:${T.pad + n * T.btn + (n - 1) * T.gap + T.gap} });
document.getElementById("gf").addEventListener("load", function(){
  var w = this.contentWindow, post = function(){ try{ w.postMessage(MSG,"*"); }catch(e){} };
  post(); setTimeout(post,200); setTimeout(post,900); setTimeout(post,2000);
});
</script>`;
};

const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  const f = path.join(PUBLIC, u === '/' ? '/index.html' : u);
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// The HUD's font (Baloo 2) comes from Google Fonts, and a sandbox reaches the
// outside world only through the agent proxy. Route the browser through it when
// one is set, so the screenshots show the real typeface rather than a fallback.
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--mute-audio',
    ...(PROXY ? ['--proxy-server=' + PROXY] : [])],
});
// `node scripts/hd1-shots.mjs farm` retakes just one pilot's three shots
const ONLY = process.argv[2] || null;
for (const g of PILOTS.filter((x) => !ONLY || x.id === ONLY)) {
  for (const S of SIZES) {
    const T = tierTable(S.tier);
    const p = await browser.newPage({ viewport: { width: S.w, height: S.h }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
    p.on('pageerror', (e) => console.log('  PAGE ERROR ' + g.id + '/' + S.name + ': ' + e.message));
    await p.route('**/__hd1_shell', (r) => r.fulfill({ contentType: 'text/html', body: mock(g.src, T, S.tier, S.btns) }));
    await p.goto(BASE + '/__hd1_shell', { waitUntil: 'load', timeout: 45000 });
    await p.waitForTimeout(g.wait);
    const file = path.join(OUT, `${g.id}-${g.layout}-${S.name}.png`);
    await p.screenshot({ path: file });
    console.log('wrote ' + path.relative(ROOT, file));
    await p.close();
  }
}
await browser.close();
server.close();
