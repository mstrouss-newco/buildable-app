#!/usr/bin/env node
// Session 9E — the editor's async QA gate, runner half.
//
// The editor's Save already runs a *structure* check (does this manifest make sense?).
// That cannot tell you whether a level is still BEATABLE after a difficulty change.
// This runner closes that gap: it play-tests the manifest that is actually live.
//
// What it does, per game:
//   1. Fetch the LIVE manifest from the site (/api/manifest?game=X). That is the
//      editor-saved override, not the copy of the file that ships in the repo — the
//      whole point is to test what the kid will actually play.
//   2. Write it over public/<game>/manifest.json, because every manifest-driven QA
//      robot reads that path.
//   3. Run that game's robot (qa/qa-map.json says which one) and capture the output.
//   4. Report pass/fail back to /api/manifest-qa so the editor can show the owner a
//      banner and a one-click "Put it back".
//   5. Exit non-zero when a robot fails, so the GitHub Action goes red and GitHub's
//      own failure email reaches the owner even if the site is down.
//
// Usage:
//   node scripts/editor-qa-run.mjs --game breaker --save-id breaker-1723728000000
//   node scripts/editor-qa-run.mjs --all            # nightly sweep of every edited game
//
// Env:
//   QA_SITE_URL        site to read manifests from / report to (default the live site)
//   QA_REPORT_SECRET   shared secret for POSTing the verdict back (set by the owner)
//   QA_RUN_URL         link to this Action run, put in the report so the owner can click through
//
// No secrets are read from or written to the repo — both come from the environment.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = (process.env.QA_SITE_URL || "https://buildablekids.com").replace(/\/+$/, "");
const REPORT_SECRET = process.env.QA_REPORT_SECRET || "";
const RUN_URL = process.env.QA_RUN_URL || "";
const PER_GAME_TIMEOUT_MS = 15 * 60 * 1000; // a slow robot (Breaker plays 8 levels x5) still fits
const MAX_SUMMARY = 4000; // keep the stored report small; the Action log has the full thing

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const wants = (name) => process.argv.includes("--" + name);
const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

function qaMap() {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "qa", "qa-map.json"), "utf8"));
  return j.games || {};
}

async function getJson(url) {
  const r = await fetch(url, { headers: { "Cache-Control": "no-store" } });
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error(`bad JSON from ${url}: ${text.slice(0, 200)}`); }
}

// Run one qa-*.mjs and capture everything it printed.
function runRobot(script) {
  return new Promise((resolve) => {
    const out = [];
    const child = spawn(process.execPath, [script, "."], { cwd: ROOT });
    const timer = setTimeout(() => { out.push(`\n[runner] timed out after ${PER_GAME_TIMEOUT_MS / 60000} minutes`); child.kill("SIGKILL"); }, PER_GAME_TIMEOUT_MS);
    const grab = (buf) => { const s = String(buf); out.push(s); process.stdout.write(s); };
    child.stdout.on("data", grab);
    child.stderr.on("data", grab);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code === null ? 1 : code, output: out.join("") }); });
    child.on("error", (err) => { clearTimeout(timer); resolve({ code: 1, output: `[runner] could not start ${script}: ${err.message}` }); });
  });
}

// Pull the lines a non-technical owner should actually see: the failures, plus the verdict.
function failureLines(output) {
  return output.split("\n")
    .filter((l) => /\bFAIL\b|FAILED|INVALID|Error:|aborting/i.test(l))
    .map((l) => l.trim()).filter(Boolean).slice(0, 25);
}

async function report(body) {
  if (!REPORT_SECRET) {
    console.log("[runner] QA_REPORT_SECRET is not set — ran the robot but could not post the result back to the site.");
    return false;
  }
  try {
    const r = await fetch(`${SITE}/api/manifest-qa`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-qa-secret": REPORT_SECRET },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { console.log(`[runner] report rejected (${r.status}): ${d.error || d.reason || "unknown"}`); return false; }
    console.log(`[runner] reported ${body.status} for ${body.game}${d.stale ? " (site says a newer save superseded this run)" : ""}`);
    return true;
  } catch (err) {
    console.log(`[runner] could not reach ${SITE}/api/manifest-qa: ${err.message}`);
    return false;
  }
}

// Test one game. Returns "pass" | "fail" | "skipped".
async function checkGame(game, expectedSaveId) {
  const map = qaMap();
  const script = map[game];
  console.log(`\n===== ${game} =====`);

  if (!script || !fs.existsSync(path.join(ROOT, script))) {
    console.log(`[runner] no play-test robot for ${game} — reporting that honestly, not as a pass.`);
    await report({ game, saveId: expectedSaveId || null, status: "unavailable",
      summary: `There is no play-test robot for ${game} yet, so this change was not play-tested.` });
    return "skipped";
  }

  // 1. what is actually live right now
  let live;
  try { live = await getJson(`${SITE}/api/manifest?game=${encodeURIComponent(game)}&v=${Date.now()}`); }
  catch (err) {
    console.log(`[runner] could not read the live manifest: ${err.message}`);
    await report({ game, saveId: expectedSaveId || null, status: "error", summary: `Could not read the live manifest for ${game}: ${err.message}` });
    return "fail";
  }
  if (!live || !live.ok || !live.manifest) {
    console.log(`[runner] no manifest for ${game}; nothing to test.`);
    return "skipped";
  }
  if (live.source !== "override") {
    console.log(`[runner] ${game} has no editor save — it is still on the default that ships in the repo. Skipping.`);
    return "skipped";
  }
  // A newer save landed while this run was queued: that save has its own run coming.
  if (expectedSaveId && live.saveId && live.saveId !== expectedSaveId) {
    console.log(`[runner] a newer save (${live.saveId}) superseded ${expectedSaveId}. Skipping this stale run.`);
    return "skipped";
  }
  const saveId = expectedSaveId || live.saveId || null;

  // 2. make the robot read the live manifest instead of the repo's copy
  const target = path.join(ROOT, "public", game, "manifest.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(live.manifest, null, 2) + "\n");
  console.log(`[runner] testing the live saved manifest (${(live.manifest.levels || []).length} level(s)) with ${script}`);

  // 3. play it
  const started = Date.now();
  const { code, output } = await runRobot(script);
  const secs = Math.round((Date.now() - started) / 1000);
  const status = code === 0 ? "pass" : "fail";
  const fails = failureLines(output);
  const summary = (status === "pass"
    ? `The robot play-tested every level of ${game} and they were all beatable (${secs}s).`
    : `The robot could not finish ${game}. ${fails.length ? "What went wrong:" : "The robot stopped with an error."}`
  );

  // 4. tell the site
  await report({ game, saveId, status, summary, failures: fails, durationSeconds: secs,
    runUrl: RUN_URL, log: output.slice(-MAX_SUMMARY) });

  console.log(`[runner] ${game}: ${status.toUpperCase()} in ${secs}s`);
  return status;
}

async function main() {
  const results = {};
  if (wants("all")) {
    // Nightly safety net: re-test every game that has an editor save live.
    const games = Object.keys(qaMap());
    console.log(`[runner] nightly sweep over ${games.length} game(s) against ${SITE}`);
    for (const g of games) {
      try { results[g] = await checkGame(g, null); }
      catch (err) { console.log(`[runner] ${g} blew up: ${err.message}`); results[g] = "fail"; }
    }
  } else {
    const game = slug(arg("game"));
    if (!game) { console.error("usage: editor-qa-run.mjs --game <id> [--save-id <id>] | --all"); process.exit(2); }
    results[game] = await checkGame(game, arg("save-id") || null);
  }

  const failed = Object.entries(results).filter(([, v]) => v === "fail").map(([k]) => k);
  console.log("\n===== summary =====");
  Object.entries(results).forEach(([g, v]) => console.log(`${v.toUpperCase().padEnd(8)} ${g}`));
  if (failed.length) { console.error(`\nQA GATE FAILED: ${failed.join(", ")}`); process.exit(1); }
  console.log("\nQA gate clear.");
}

main().catch((err) => { console.error("[runner] unexpected error:", err); process.exit(1); });
