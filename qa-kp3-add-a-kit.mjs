// Session KP3 QA — headless end-to-end of the add-to-app loop, from the editor.
//
// qa-kits.mjs proves the loop as data (it drives the real library functions
// against a stubbed planner). This proves it as a PAGE: Mike opens a game, taps
// Library on a slot, taps "Add a kit", searches his 241 kits, taps Add to app,
// and exactly one planner card is filed — with no art moved and no game changed.
//
// Serves public/ statically, stubs the API, fakes the owner sign-in the editor
// gates on, and drives Chromium.
// Run: node qa-kp3-add-a-kit.mjs [repoDir]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import pw from "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
const { chromium } = pw;

const REPO = path.resolve(process.argv[2] || ".");
const PUB = path.join(REPO, "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
let ok = true;
const say = (pass, msg) => { console.log((pass ? "PASS" : "FAIL") + "  " + msg); if (!pass) ok = false; };

// Every POST the page makes is captured, so "asking does nothing else" is a fact
// about traffic rather than a promise in a comment.
const posts = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = decodeURIComponent(u.pathname);
  if (p.startsWith("/api/")) {
    if (req.method === "POST") {
      let b = ""; req.on("data", (c) => (b += c));
      req.on("end", () => { posts.push({ url: p, body: b }); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, task: { id: 7 } })); });
      return;
    }
    if (p === "/api/manifest") {
      const f = path.join(PUB, u.searchParams.get("game") || "", "manifest.json");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(fs.existsSync(f) ? JSON.stringify({ ok: true, manifest: JSON.parse(fs.readFileSync(f, "utf8")) }) : JSON.stringify({ ok: false }));
      return;
    }
    // a planner with no kit cards on it — this run has to create its own
    if (p === "/api/planner") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, tasks: [] })); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, assets: [], layers: [], sprites: [], characters: [], recipes: {} }));
    return;
  }
  if (p === "/") p = "/index.html";
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end("nf"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = "http://127.0.0.1:" + server.address().port;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const OWNER_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + b64({ email: "mstrouss@gmail.com", sub: "1cb8cd9e-fba0-4fcc-850a-5b6afb677b87", exp: 4102444800 }) + ".x";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
await ctx.addInitScript((t) => {
  try { localStorage.setItem("bk_parent_session_v1", JSON.stringify({ access_token: t, refresh_token: "r" })); } catch (e) {}
}, OWNER_JWT);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

await page.goto(base + "/editor.html?game=castleguard", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const libBtns = page.locator("button", { hasText: /^Library$/ });
say((await libBtns.count()) > 0, `the editor opens on a real game with ${await libBtns.count()} Library button(s)`);
await libBtns.first().click();
await page.waitForTimeout(800);
say((await page.locator(".srcchip", { hasText: "My Kits" }).count()) === 1, "the picker shows My Kits — the art already added");

const chip = page.locator(".srcchip", { hasText: "Add a kit" });
say((await chip.count()) === 1, "the picker offers Add a kit");
await chip.first().click();
await page.waitForTimeout(1200);
const shown = await page.locator(".kitc").count();
say(shown > 20, `kits Mike owns but has not added are browsable right there (${shown} shown)`);
say((await page.locator(".kitc .limg").first().evaluate((e) => getComputedStyle(e).backgroundImage)).indexOf("/kenney/previews/") > -1,
  "each kit shows its real preview, not a placeholder");

await page.locator(".kitq").fill("space");
await page.waitForTimeout(400);
const found = await page.locator(".kitc").count();
say(found > 0 && found < shown, `searching narrows the shelf (${found} for "space")`);

const first = page.locator(".kitc").first();
const name = (await first.locator(".kn").textContent()).trim();
posts.length = 0;
await first.locator(".kitb").click();
await page.waitForTimeout(700);

say(posts.length === 1, `tapping Add to app files exactly one thing (${posts.length})`);
const card = posts[0] || { url: "", body: "{}" };
say(card.url === "/api/planner", "the one thing is a planner card :: " + card.url);
const body = JSON.parse(card.body || "{}");
const desc = (body.task && body.task.description) || "";
say(body.op === "add" && body.task && body.task.target === "Kits", "filed as an add under Kits");
say(/\[kit:[a-z0-9_-]+\]/.test(desc), "tagged [kit:<slug>] so the state can be read back");
say(desc.indexOf(name) > -1, "the card names the kit Mike actually tapped :: " + name);
say(/KITS\.md/.test(desc) && /refresh-added/.test(desc), "the card carries the recipe for the next session");
say(!posts.some((p) => /asset-studio|save-game/.test(p.url)), "no art was imported and no game was saved");

say((await first.locator(".kitb").textContent()).trim() === "Asked for", "the button turns into Asked for, so he cannot ask twice");
say((await first.locator(".kitb").isDisabled()), "and it is disabled");
say((await first.locator(".kitnote").count()) === 1, "the card says a session is coming, and where the art lives meanwhile");
say((await page.locator(".kitc").count()) === found, "the kit it asked for is STILL on the shelf — asking never hides a kit");
say(/on the planner/.test(await page.locator("#mstat").textContent()), "Mike is told, in plain words, what just happened");
say(errs.length === 0, "no page errors" + (errs.length ? " :: " + errs.join(" | ") : ""));

await browser.close();
server.close();
console.log(ok ? "ALL CHECKS PASS" : "SOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
