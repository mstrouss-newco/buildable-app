// Session AP2 QA — headless end-to-end of "Use in a game" on the Browse page.
// Serves public/ statically, stubs the two API calls, and drives the full flow:
//   render card -> Use in a game -> pick Breaker -> fit filter -> assign background
//   -> manifest POST carries the new studio id in the level -> Undo restores prev.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pw from "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
const { chromium } = pw;

const ROOT = path.resolve("public");
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json", ".css":"text/css", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(ROOT, p === "/" ? "/asset-library.html" : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404).end("nf"); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const fail = (m) => { console.error("FAIL: " + m); process.exitCode = 1; };
const ok = (m) => console.log("PASS: " + m);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|404|net::/.test(m.text())) errors.push(m.text()); });

// Stub the two APIs the flow touches, and capture the manifest writes.
await page.addInitScript(() => {
  window.__posts = [];
  const FAKE_MANIFEST = { id:"breaker", name:"Breaker", type:"game",
    art:{ badge:"breaker/badge/v1", hero:"breaker/hero/v1", music:"audio/breaker/theme-v1" },
    levels:[ { id:"jungle-ruins", name:"Jungle Ruins", difficulty:2,
      parts:{ background:"breaker/bg/jungle-v1", bricks:"breaker/bricks/jungle-v1", balls:"breaker/balls/classic-v1", paddle:"breaker/paddle/classic-v1" } } ] };
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const real = window.fetch.bind(window);
  window.fetch = (u, opt) => {
    const url = String(u);
    if (url.indexOf("/api/manifest") === 0 && (!opt || opt.method !== "POST"))
      return Promise.resolve(new Response(JSON.stringify({ ok:true, source:"static", manifest: JSON.parse(JSON.stringify(FAKE_MANIFEST)) }), { status:200 }));
    if (url.indexOf("/api/manifest") === 0 && opt && opt.method === "POST") {
      window.__posts.push(JSON.parse(opt.body));
      return Promise.resolve(new Response(JSON.stringify({ ok:true, source:"override" }), { status:200 }));
    }
    if (url.indexOf("/api/asset-studio") === 0 && opt && opt.method === "POST") {
      const b = JSON.parse(opt.body);
      return Promise.resolve(new Response(JSON.stringify({ ok:true, slug: b.game+"/"+b.type+"/"+b.theme+"/"+b.name }), { status:200 }));
    }
    // Feed load() one WORLD (layer) and one CHARACTER so real 2d cards render.
    if (url.indexOf("/api/list-assets") === 0) return Promise.resolve(new Response(JSON.stringify({ layers:[{ id:"L1", theme:"ocean", imageUrl:PNG }], sprites:[] }), { status:200 }));
    if (url.indexOf("/api/list-characters") === 0) return Promise.resolve(new Response(JSON.stringify({ characters:[{ id:"c1", name:"knight", theme:"castle", image:PNG }] }), { status:200 }));
    if (url.indexOf("/api/list-audio") === 0) return Promise.resolve(new Response(JSON.stringify({ music:[], sfx:[] }), { status:200 }));
    if (url.indexOf("/api/") === 0) return Promise.resolve(new Response(JSON.stringify({}), { status:200 }));
    return real(u, opt);
  };
});

await page.goto(`http://localhost:${port}/asset-library.html`, { waitUntil: "networkidle" });

// 1) Buttons render on the two 2d image cards (world + character)
const btns = await page.$$(".useg");
if (btns.length === 2) ok("Use-in-a-game button on both image cards"); else fail("expected 2 .useg buttons, got " + btns.length);

// 2) Click the WORLD card's button -> modal + game picker (exercises real ALL.find wiring)
await page.click('.useg[data-uid="L1"]');
await page.waitForSelector(".umodal", { state: "visible" });
const gameChips = await page.$$(".ugames .chip");
if (gameChips.length > 10) ok("Game picker shows " + gameChips.length + " games"); else fail("game picker sparse: " + gameChips.length);

// 3) Pick Breaker -> only WORLD-fitting slots (background yes; paddle/bricks/balls no)
await page.click('.ugames .chip[data-g="breaker"]');
await page.waitForSelector(".uslot");
const slotText = await page.$$eval(".uslot .sname", els => els.map(e => e.textContent));
const hasBg = slotText.some(t => /Background/.test(t));
const hasPaddle = slotText.some(t => /Paddle|Bricks|Balls/.test(t));
if (hasBg && !hasPaddle) ok("Fit filter: world offers Background, not Paddle/Bricks/Balls"); else fail("fit wrong -> " + JSON.stringify(slotText));

// 4) Assign the background slot -> manifest POST carries the studio id at the level
await page.click(".uslot");
await page.waitForSelector(".utoast", { state: "visible" });
const posts1 = await page.evaluate(() => window.__posts);
const bgAfter = posts1[0] && posts1[0].manifest.levels[0].parts.background;
const wrote = posts1.length === 1 && /^studio:breaker\/background\//.test(bgAfter || "");
if (wrote) ok("Apply wrote studio id into breaker level background live (" + bgAfter + ")"); else fail("apply write wrong -> " + bgAfter);
const otherUntouched = posts1[0] && posts1[0].manifest.levels[0].parts.paddle === "breaker/paddle/classic-v1";
if (otherUntouched) ok("Other slots untouched by apply"); else fail("apply clobbered other slots");

// 5) Toast has Open-game link (deep-links to the level) + Undo
const openHref = await page.getAttribute(".utoast a.tbtn", "href");
if (openHref === "/breaker/play/jungle-ruins") ok("Open-game link deep-links to the level"); else fail("open link wrong: " + openHref);

// 6) Undo restores the previous value with another live write
await page.click(".utoast .tundo");
await page.waitForFunction(() => window.__posts.length === 2);
const posts2 = await page.evaluate(() => window.__posts);
const restored = posts2[1].manifest.levels[0].parts.background === "breaker/bg/jungle-v1";
if (restored) ok("Undo restored the previous background live"); else fail("undo did not restore -> " + posts2[1].manifest.levels[0].parts.background);

// 7) A CHARACTER asset must NOT be offered the background slot (reverse invariant)
await page.evaluate(() => { window.__posts = []; });
await page.click('.useg[data-uid="c1"]');
await page.waitForSelector(".umodal", { state: "visible" });
await page.click('.ugames .chip[data-g="breaker"]');
await page.waitForTimeout(150);
const charSlots = await page.$$eval(".uslot .sname", els => els.map(e => e.textContent));
const charHasActor = charSlots.some(t => /Paddle|Bricks|Balls|Hero/.test(t));
const charHasBg = charSlots.some(t => /Background/.test(t));
if (charHasActor && !charHasBg) ok("Character offers actor slots, never Background"); else fail("character fit wrong -> " + JSON.stringify(charSlots));

if (errors.length) fail("JS errors on page: " + JSON.stringify(errors.slice(0,4)));
else ok("No JS errors on the page");

await browser.close();
server.close();
console.log(process.exitCode ? "\nAP2 QA: FAILED" : "\nAP2 QA: ALL PASSED");
