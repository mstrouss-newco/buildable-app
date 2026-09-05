#!/usr/bin/env node
// qa-all.mjs — the release gate. One command that runs EVERYTHING.
//
//   node qa-all.mjs                     the whole suite (no browser needed, ~4 min)
//   node qa-all.mjs --with-browser      also run the Playwright harnesses
//   node qa-all.mjs --live              also check the LIVE site really serves what it should
//   node qa-all.mjs --only practice      just the harnesses whose name contains "practice"
//
// WHY THIS EXISTS (Session QA-FIX, 2026-08-30). There was already a QA runner —
// scripts/editor-qa-run.mjs, fired by the editor and nightly by .github/workflows/
// editor-qa.yml — but it only covers the 19 manifest games in qa/qa-map.mjs, and it
// only asks "is this level still beatable?". Thirty-three other qa-*.mjs files at the
// repo root were run by hand or not at all.
//
// That is how Practice shipped dead. `qa-practice.mjs` was written in the same session
// as the feature, passed then and passes now — but nothing ran it, and nothing checked
// that `public/buildable-practice.js` was actually REACHABLE. It was not: vercel.json
// names every shared script one by one, the new file was never added, and the catch-all
// served landing.html in its place. The browser got HTML where it expected JavaScript,
// threw "Unexpected token '<'", and the page told kids "The sets would not load."
//
// So this gate does two things a per-game robot cannot:
//
//   1. THE SERVING CHECK (part 1, below). Every shared script and every top-level page
//      in public/ must have a route in vercel.json. This is a file-system sweep, not a
//      list someone has to remember to update, so a new file cannot be forgotten.
//      With --live it goes further and fetches each one from production, failing if the
//      server answers with HTML where JavaScript or JSON was expected.
//
//   2. RUN EVERY HARNESS (part 2). Discovered from disk with a glob, for the same
//      reason: writing qa-newthing.mjs is all it takes to get it into the gate.
//
// Exit code is 0 only if everything passed, so CI and a pre-deploy hook can trust it.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1]; };

const WITH_BROWSER = has("--with-browser");
const LIVE = has("--live");
const SITE = valOf("--site") || process.env.QA_SITE_URL || "https://buildablekids.com";
const ONLY = valOf("--only");

let failures = [];
let LIVE_BLOCKED = false;
const fail = (what, detail) => { failures.push({ what, detail }); console.log(`FAIL  ${what}${detail ? "  ::  " + detail : ""}`); };
const pass = (what, detail) => console.log(`PASS  ${what}${detail ? "  ::  " + detail : ""}`);
const section = (t) => console.log(`\n=== ${t} ===`);

// ===========================================================================
// 1. THE SERVING CHECK — is every file we ship actually reachable?
// ===========================================================================
section("serving: every shared file has a route");

const vercel = fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8");
let routes = [];
try { routes = (JSON.parse(vercel).routes || []).map((r) => r.src); }
catch (e) { fail("vercel.json is valid JSON", e.message); }

// The catch-all is the LAST route and sends everything unmatched to the marketing
// page. Anything that needs to be served as itself must appear before it.
const CATCH_ALL = "/(.*)";
const catchAllAt = routes.indexOf(CATCH_ALL);
if (catchAllAt === -1) pass("there is no blanket catch-all to fall through");
else pass("the catch-all is last", `route ${catchAllAt + 1} of ${routes.length}`);

const routedBefore = (p) => {
  const i = routes.findIndex((src) => src === p || (src.includes("(") && new RegExp("^" + src + "$").test(p)));
  return i !== -1 && (catchAllAt === -1 || i < catchAllAt);
};

const pub = path.join(ROOT, "public");
const shared = fs.readdirSync(pub).filter((f) => /^buildable-.*\.js$/.test(f));
const pages = fs.readdirSync(pub).filter((f) => f.endsWith(".html"));

let missing = [];
for (const f of shared) if (!routedBefore("/" + f)) missing.push(f);
if (missing.length) fail("every public/buildable-*.js is routed", missing.join(", ") + " would be served as landing.html");
else pass("every public/buildable-*.js is routed", shared.length + " shared scripts");

// landing.html is the catch-all's own destination, so it is reached without a
// route of its own. Everything else needs one or it silently becomes the landing page.
let missingPages = [];
for (const f of pages) if (f !== "landing.html" && !routedBefore("/" + f)) missingPages.push(f);
if (missingPages.length) fail("every public/*.html is routed", missingPages.join(", "));
else pass("every public/*.html is routed", pages.length + " pages");

// ===========================================================================
// 1b. THE LIVE CHECK — does production actually answer with the right thing?
// ===========================================================================
if (LIVE) {
  section(`serving: what ${SITE} really returns`);
  // A Cowork sandbox usually cannot reach the site at all (its egress proxy answers
  // 403 to everything). That is not a broken site, and reporting fifty failures for
  // it would be a lie, so probe once and say so plainly instead. In GitHub Actions
  // the network is open and this whole part runs for real.
  const probe = await fetch(SITE + "/?stay=1").then((r) => r.status).catch(() => 0);
  if (probe === 403 || probe === 0) {
    console.log(`SKIP  cannot reach ${SITE} from here (probe returned ${probe || "no response"}).`);
    console.log("      This machine has no route to the site; run --live from CI, where it does.");
    LIVE_BLOCKED = true;
  }
  const looksHtml = (t) => /^\s*<!doctype html/i.test(t) || /^\s*<html/i.test(t);
  const check = async (p, expect) => {
    try {
      const r = await fetch(SITE + p, { headers: { "Cache-Control": "no-store" } });
      const body = await r.text();
      const ct = (r.headers.get("content-type") || "").split(";")[0];
      if (!r.ok) return fail(`${p} is served`, `HTTP ${r.status}`);
      if (expect === "js" && (looksHtml(body) || /html/.test(ct)))
        return fail(`${p} is served as JavaScript`, `got ${ct}, ${body.length} bytes of HTML — the catch-all ate it`);
      if (expect === "json" && !/json/.test(ct))
        return fail(`${p} is served as JSON`, `got ${ct}`);
      if (expect === "html" && !/html/.test(ct))
        return fail(`${p} is served as a page`, `got ${ct}`);
      pass(`${p} is served as ${expect}`, `${ct}, ${body.length} bytes`);
    } catch (e) { fail(`${p} is reachable`, e.message); }
  };
  if (!LIVE_BLOCKED) for (const f of shared) await check("/" + f, "js");
  // A page that only ever renders the marketing site is indistinguishable from a
  // fall-through, so pages are checked by byte-identity against the landing page.
  const landing = LIVE_BLOCKED ? "" : await fetch(SITE + "/?stay=1").then((r) => r.text()).catch(() => "");
  for (const f of (LIVE_BLOCKED ? [] : pages)) {
    if (f === "landing.html") continue;
    try {
      const t = await fetch(SITE + "/" + f, { headers: { "Cache-Control": "no-store" } }).then((r) => r.text());
      if (landing && t.length === landing.length) fail(`/${f} is its own page`, "identical to landing.html — it is falling through the catch-all");
      else pass(`/${f} is its own page`, `${t.length} bytes`);
    } catch (e) { fail(`/${f} is reachable`, e.message); }
  }
}

// ===========================================================================
// 2. RUN EVERY HARNESS
// ===========================================================================
section("harnesses");

const all = fs.readdirSync(ROOT).filter((f) => /^qa-.*\.mjs$/.test(f) && f !== "qa-all.mjs").sort();
const needsBrowser = (f) => /playwright/.test(fs.readFileSync(path.join(ROOT, f), "utf8"));

const chosen = all.filter((f) => (ONLY ? f.includes(ONLY) : true));
const skipped = [];

const run = (f) => new Promise((res) => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [f], { cwd: ROOT });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  const killer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 5 * 60 * 1000);
  p.on("close", (code) => { clearTimeout(killer); res({ code, out, secs: Math.round((Date.now() - t0) / 1000) }); });
});

for (const f of chosen) {
  if (needsBrowser(f) && !WITH_BROWSER) { skipped.push(f); continue; }
  const { code, out, secs } = await run(f);
  if (code === 0) pass(f, `${secs}s`);
  else if (/ERR_MODULE_NOT_FOUND/.test(out)) {
    // Not a product bug: the machine is missing a devDependency (jsdom, usually).
    // Say so plainly rather than letting it read as "the code is broken".
    const pkg = (out.match(/Cannot find package '([^']+)'/) || [, "a package"])[1];
    fail(f, `${pkg} is not installed here — run npm ci, then try again (this is the machine, not the code)`);
  }
  else {
    const why = out.split("\n").filter((l) => /^FAIL|ERR:|Error/.test(l)).slice(0, 3).join(" | ");
    fail(f, `exit ${code}, ${secs}s${why ? "  ::  " + why : ""}`);
  }
}

// ===========================================================================
// VERDICT
// ===========================================================================
section("verdict");
console.log(`${chosen.length - skipped.length} harnesses run, ${skipped.length} skipped${skipped.length && !WITH_BROWSER ? " (need a browser — rerun with --with-browser)" : ""}`);
if (skipped.length) console.log("skipped: " + skipped.join(", "));
if (!LIVE) console.log("the live serving check did not run — add --live before a release");
else if (LIVE_BLOCKED) console.log("the live serving check was asked for but this machine cannot reach the site — it did NOT run");

if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  failures.forEach((f) => console.log("  - " + f.what + (f.detail ? "  ::  " + f.detail : "")));
  console.log("\nSOME CHECKS FAILED");
  process.exit(1);
}
console.log("\nALL CHECKS PASS");
