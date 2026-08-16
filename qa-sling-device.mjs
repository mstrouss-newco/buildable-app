// Session SD5 — the real-device play session, made repeatable.
//
// qa-sling.mjs proves things about the SIMULATION: the bot clears every level,
// a sealed critter is unreachable, flinging does not work. None of that tells
// you what a kid's hands meet. This script opens the actual game in a real
// browser at real phone and tablet sizes and plays it with real gestures —
// press on the sling, drag it back, let go — then reports what a player gets:
// does the yard fit the screen, can a thumb reach the sling, is a critter big
// enough to aim at, does a level answer a touch, and does it actually finish.
//
//   node qa-sling-device.mjs .
//
// Needs Playwright and a Chromium. If neither is installed the script says so
// in one plain line and exits 0 — it is an observation harness, not a gate, and
// it must never turn a green QA run red just because a container has no browser.
// It is also NOT a substitute for a child playing on a real iPad: it proves the
// game is reachable and responsive at those sizes, never that it is fun.
import fs from 'fs'; import http from 'http'; import path from 'path';
const dir = process.argv[2] || '.';
const ROOT = path.resolve(dir, 'public');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('SKIP  Playwright is not installed in this container — the device play session did not run.'); process.exit(0); }

// ---- serve public/ exactly as the site does -------------------------------
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? '/index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// The two shapes that matter: the phone in a pocket, and the iPad the kids use.
const DEVICES = [
  { name: 'iPhone (portrait)',  width: 390,  height: 844, scale: 3 },
  { name: 'iPad (landscape)',   width: 1024, height: 768, scale: 2 },
];
// Levels worth watching by hand: the last of the easy on-ramp, the first real
// puzzle, and one from the hard end.
const WATCH = [5, 6, 11];
const YARD_W = 960, YARD_H = 600;      // the engine's own coordinate space
const FORK = { x: 168, y: 360 };       // where the ammo loads (AX, AY in the engine)
// A fingertip is about 44 CSS px across (Apple's own number). Anything a kid has
// to hit needs to be at least that, or aiming becomes a lottery.
const FINGER = 44;

let ok = true;
const say = (pass, msg) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${msg}`); if (!pass) ok = false; };
const note = msg => console.log(`      ${msg}`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  .catch(() => chromium.launch({ args: ['--no-sandbox'] }));

for (const dev of DEVICES) {
  console.log(`\n--- ${dev.name} ${dev.width}x${dev.height} ---`);
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.scale, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${BASE}/sling-squad.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.BUILDABLE_GAME, null, { timeout: 15000 });
  // the standalone game boots to its own start screen; the manifest levels are
  // what the shell hands it, so load those before playing anything.
  await page.evaluate(async base => {
    const m = await (await fetch(base + '/sling/manifest.json')).json();
    window.BUILDABLE_GAME._applyManifest(window.BuildableManifest.toEngineConfig(m), m);
  }, BASE);

  const rectOf = () => page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height,
             pageW: document.documentElement.scrollWidth, winW: innerWidth, winH: innerHeight };
  });
  const toScreen = (r, x, y) => ({ x: r.x + r.w * (x / YARD_W), y: r.y + r.h * (y / YARD_H) });

  // 1) the yard fits the screen, and the page itself never scrolls sideways
  const r0 = await rectOf();
  say(r0.pageW <= r0.winW + 1, `the yard fits side to side — nothing to scroll (page ${r0.pageW}px in a ${r0.winW}px screen)`);
  say(r0.w > 0 && r0.h > 0 && r0.x >= 0 && r0.y >= -1,
      `the yard is on screen the right way up (${Math.round(r0.w)}x${Math.round(r0.h)} at ${Math.round(r0.x)},${Math.round(r0.y)})`);
  note(`the game fills ${Math.round(r0.w * r0.h / (r0.winW * r0.winH) * 100)}% of the glass; one yard pixel is ${(r0.w / YARD_W).toFixed(2)} screen pixels`);

  // 1b) how fast is this browser actually drawing? Every "how long did that take"
  //     number below is only meaningful next to this one: a headless container
  //     with no GPU draws far slower than an iPad, and reporting its seconds as
  //     the game's pacing would be a lie. Measured over a second of real frames.
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(n * 1000 / (performance.now() - t0)); };
    requestAnimationFrame(tick);
  }));
  const realtime = fps / 60;                    // 1.0 = as fast as a real device
  note(`sitting still this browser draws ${fps.toFixed(0)} frames a second — ${(realtime * 100).toFixed(0)}% of a real 60fps device. Every timing below is re-measured mid-shot, when it is working hardest.`);
  // ONE frame counter for the whole page, started once. Starting a fresh rAF
  // loop per shot leaves the old ones running and every one of them keeps
  // counting, so the third shot reads three times as many frames as it had and
  // an ordinary level looks like it drags.
  await page.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t); });

  // 2) the sling has to sit somewhere a thumb can reach, with room to pull back
  const fork = toScreen(r0, FORK.x, FORK.y);
  const pullRoom = fork.x - r0.x;                        // how far back there is to drag
  say(fork.x > FINGER / 2 && fork.x < dev.width - FINGER / 2 && fork.y > FINGER / 2 && fork.y < dev.height - FINGER / 2,
      `the sling sits at ${Math.round(fork.x)},${Math.round(fork.y)} — inside the glass, thumb can reach it`);
  say(pullRoom >= FINGER,
      `there is room to pull the sling back (${Math.round(pullRoom)}px of screen behind it, want ${FINGER}+)`);

  for (const n of WATCH) {
    const info = await page.evaluate(i => {
      window.BUILDABLE_GAME._begin(i);
      const l = window.BUILDABLE_GAME._cfg().levels[i];
      return { name: l.name, shots: l.launches, targets: l.targets.length, difficulty: l.difficulty };
    }, n);
    const r = await rectOf();
    const label = `L${n + 1} ${info.name}`;

    // 3) a critter has to be big enough to aim at. The engine draws them at
    //    roughly 30px across in yard space; on a phone that shrinks with the
    //    canvas, and a critter smaller than a fingertip is a level you squint at.
    const critterPx = 30 * (r.w / YARD_W);
    say(critterPx >= 10, `${label} — a critter is ${critterPx.toFixed(0)}px across on this screen`);
    if (critterPx < FINGER) note(`${label} — smaller than a fingertip (${FINGER}px), so this is an aim-with-your-eyes game here, not a tap-the-critter one. That is the design, but it is why the sling has to be forgiving.`);

    // 4) THE GESTURE, for real: press on the sling, drag it back and down, let
    //    go. Not a synthetic launch call — if a drag does not reach the engine
    //    on this device, this is where it shows.
    const before = await page.evaluate(() => window.BUILDABLE_GAME.dbg().used);
    await page.mouse.move(fork.x, fork.y);
    await page.mouse.down();
    for (let s = 1; s <= 8; s++) await page.mouse.move(fork.x - (pullRoom * 0.09) * s, fork.y + 5 * s);
    const flying = await page.evaluate(() => window.BUILDABLE_GAME.state());
    await page.mouse.up();
    const launched = await page.evaluate(() => window.BUILDABLE_GAME.state());
    say(flying === 'aiming' && launched === 'flying',
        `${label} — pressing and dragging stretches the sling, letting go fires (${flying} -> ${launched})`);

    // and the shot has to actually resolve and be counted, in a time a kid waits.
    // Frames are counted WHILE the pal is in the air, because that is when this
    // browser is doing the most drawing and is least like an iPad — the seconds
    // only mean something once they are converted at the rate that was actually
    // running during the shot.
    const f0 = await page.evaluate(() => window.__f);
    const t0 = Date.now();
    await page.waitForFunction(u => window.BUILDABLE_GAME.dbg().used > u, before, { timeout: 20000 })
      .catch(() => {});
    const secs = (Date.now() - t0) / 1000;
    const after = await page.evaluate(() => window.BUILDABLE_GAME.dbg());
    const frames = await page.evaluate(() => window.__f) - f0;
    const shotFps = frames / secs;
    // the shot's real cost is the FRAMES it took; on a 60fps device that is frames/60
    const onDevice = frames / 60;
    say(after.used > before, `${label} — the shot lands and is counted after ${secs.toFixed(1)}s (${after.used}/${info.shots} used, ${after.launchesLeft} left)`);
    note(`${label} — that was ${frames} frames at ${shotFps.toFixed(0)}fps here; the same shot on a 60fps device is ${onDevice.toFixed(1)}s`);
    say(onDevice <= 8, `${label} — the wait between shots is ${onDevice.toFixed(1)}s on a 60fps device (a kid tolerates about 8)`);
    say(after.targets === info.targets, `${label} — d${info.difficulty}, ${info.targets} critters and ${info.shots} slings, count is honest`);
  }

  // 5) and a level has to actually FINISH under real gestures, not just fire.
  //    The aim comes from the engine's own predictor — the same dotted line the
  //    kid is shown — and is then performed as a real drag, so this measures the
  //    gesture path end to end rather than the physics.
  {
    const i = WATCH[0];
    const res = await page.evaluate(async n => {
      window.BUILDABLE_GAME._begin(n);
      return { name: window.BUILDABLE_GAME._cfg().levels[n].name, shots: window.BUILDABLE_GAME._cfg().levels[n].launches };
    }, i);
    const t0 = Date.now();
    const fLevel0 = await page.evaluate(() => window.__f);
    let shots = 0, state = 'ready';
    while (shots < res.shots + 2 && state !== 'win' && state !== 'lose') {
      const r = await rectOf();
      // ask the game where it would aim, in its own drag coordinates
      const drag = await page.evaluate(() => {
        const g = window.BUILDABLE_GAME;
        if (g.state() !== 'ready') return null;
        return g._aimDragFor();
      });
      if (!drag) { await page.waitForTimeout(300); state = await page.evaluate(() => window.BUILDABLE_GAME.state()); continue; }
      const from = toScreen(r, FORK.x, FORK.y), to = toScreen(r, drag.x, drag.y);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let s = 1; s <= 6; s++)
        await page.mouse.move(from.x + (to.x - from.x) * s / 6, from.y + (to.y - from.y) * s / 6);
      await page.mouse.up();
      shots++;
      await page.waitForFunction(() => ['ready', 'win', 'lose'].includes(window.BUILDABLE_GAME.state()), null, { timeout: 15000 }).catch(() => {});
      state = await page.evaluate(() => window.BUILDABLE_GAME.state());
    }
    const secs = (Date.now() - t0) / 1000;
    const onDevice = (await page.evaluate(() => window.__f) - fLevel0) / 60;
    say(state === 'win', `L${i + 1} ${res.name} — played to the end with real drags: ${state} in ${shots} shots (${onDevice.toFixed(0)}s of game on a 60fps device; ${secs.toFixed(0)}s of wall clock here)`);
    note(`levels 1 to 6 at that pace is roughly ${Math.max(1, Math.round(onDevice * 6 / 60))} minute(s) of play — the on-ramp promise`);
  }

  // 6) nothing threw while a person was playing
  const real = errors.filter(e => !/no-net|Failed to load resource|net::ERR/i.test(e));
  say(real.length === 0, `nothing broke during play${real.length ? ' :: ' + real.slice(0, 3).join(' | ') : ''}`);

  await ctx.close();
}

await browser.close();
server.close();
console.log(ok ? '\nDEVICE SESSION: ALL CHECKS PASS' : '\nDEVICE SESSION: SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
