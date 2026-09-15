// /api/cobuild-forge.js — LAYER THREE (Session CB5).
//
// Layer one builds a kid's game out of a game we already ship. Layer two changes
// it with named recipes. Layer three is the promise underneath both: when a
// child asks for something no engine covers — a lemonade stand, a fishing game —
// the studio writes a BRAND NEW CARTRIDGE rather than handing them the nearest
// thing with a new title.
//
//   POST { op:"forge", plan|idea, kidName?, grownupName?, familyId, kidId? }
//        -> { ok, forge:{ id, status, ... } }        starts, and answers when done
//   POST { op:"status", id }      -> where that forge got to
//   POST { op:"heart", id }       -> a family says they loved it (promotion signal)
//   GET  ?op=queue                -> the review queue (grown-up gate)
//   POST { op:"promote", id }     -> stage a cartridge for promotion (grown-up gate)
//
// THE RULE THAT SHAPES THIS FILE: nothing a model wrote reaches a child until it
// has passed the same gate a shipped game passes, and then some.
//
//   1. STATIC  (api/_forgeSpec.js) only our libraries, no network, no storage,
//              no eval, no emoji, a size cap, and the two hooks the robot needs.
//   2. STRICT  the manifest is validated against the sheet the model wrote, the
//              same strict validation every kid game goes through.
//   3. ROBOT   the CB2 robot PLAYS it, level by level, in the same sandbox it
//              plays Breaker in. A game it cannot finish is not a game.
//   4. CONTRACT while it played, did it actually post the cartridge-contract
//              messages? A game that never says "win" is a game nobody can keep.
//
// A failure at any step is fed back to the model IN ITS OWN TERMS and it tries
// again, up to three times. After that the child gets a game that works — the
// nearest engine, with an honest line — and the attempt lands in the review
// queue as a roadmap signal: this is what kids ask for that we cannot build yet.
//
// WITH NO MODEL KEY none of this can run, and that is a supported state, not an
// error: the forge says so, the studio falls back to layer one, and qa-forge.mjs
// drives the whole path with a stub model so the gate is tested on every run.
import { readPublic, sheetFor } from "./_cobuild.js";
import { manifestLib } from "./_manifestLib.js";
import { askClaude, scoreEngines } from "./_cobuildBrain.js";
import { makeSlug, validSlug } from "./kid-game.js";
import { grownupOk, refuseGrownup } from "./_grownup.js";
import { staticCheck, briefFor, partsFrom, ALLOWED_LIBS, MAX_TRIES } from "./_forgeSpec.js";
import { playManifest } from "../qa/kid-game-robot.mjs";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const enc = encodeURIComponent;
const sb = (path, init) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init && init.headers) || {}) } });
const clean = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n || 120);

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}

async function rowById(id) {
  if (!URL_ || !KEY || !validSlug(id)) return null;
  const r = await sb(`forge_cartridges?id=eq.${enc(id)}&select=*&limit=1`);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return (Array.isArray(j) && j[0]) || null;
}
async function write(id, patch) {
  if (!URL_ || !KEY) return null;
  patch.updated_at = new Date().toISOString();
  const r = await sb(`forge_cartridges?id=eq.${enc(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
  const j = await r.json().catch(() => null);
  return (Array.isArray(j) && j[0]) || null;
}
async function insert(row) {
  if (!URL_ || !KEY) return null;
  const r = await sb("forge_cartridges", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  const j = await r.json().catch(() => null);
  return (Array.isArray(j) && j[0]) || null;
}

// What the browser is told about a forge. Never the cartridge itself: that is
// served only by /api/forge, inside the sandbox headers.
const publicRow = (r) => r && ({
  id: r.id, status: r.status, name: r.name, idea: r.idea, attempts: r.attempts,
  kidGameId: r.kid_game_id || null, nearest: r.nearest || null,
  problems: r.problems || null, verdict: r.verdict || null,
  plays: r.plays, cleared: r.cleared, hearts: r.hearts, promotedAs: r.promoted_as || null,
  createdAt: r.created_at,
});

// ---------------------------------------------------------------------------
//  THE DOCS, as the system prompt. This is what makes a forged game OURS rather
//  than whatever a model thinks a kids' game looks like: it is handed the same
//  rules a person building an engine here would be told to read first.
// ---------------------------------------------------------------------------
//  These files live at the REPO ROOT, not in public/, and a Vercel function only
//  ships the files its code traces — so vercel.json names them in includeFiles
//  for this endpoint. qa-forge.mjs checks that entry is still there, because the
//  failure mode is silent: the forge would go on writing games with none of the
//  company's rules in front of it. Which is why a missing contract REFUSES.
export const DOC_FILES = ["BUILDING-A-GAME.md", "CARTRIDGE-CONTRACT.md", "GAME-FEEL.md", "HUD-AND-NAV-RULES.md", "MECHANICS.md"];
let DOCS = null;
export async function docs() {
  if (DOCS) return DOCS;
  const [building, contract, feel, hud, mechanics] = await Promise.all(DOC_FILES.map((f) => readPublic(f)));
  DOCS = { building, contract, feel, hud, mechanics };
  return DOCS;
}

// ---------------------------------------------------------------------------
//  THE GATE. Four checks, in the order that fails cheapest first. Every problem
//  comes back as a sentence the model can act on, because the next attempt is
//  literally handed this list.
// ---------------------------------------------------------------------------
export async function gate(parts, opts) {
  const read = (opts && opts.read) || readPublic;
  const problems = [];
  if (parts.missing && parts.missing.length) return { ok: false, problems: parts.missing };

  // 1. static
  const stat = staticCheck(parts.html);
  if (!stat.ok) return { ok: false, problems: stat.problems, stage: "static" };

  // 2. strict, against the sheet the model wrote for its own game
  const lib = await manifestLib();
  if (!lib) return { ok: false, problems: ["the shared manifest loader could not be read"], stage: "strict" };
  const v = lib.validate(parts.manifest, { strict: true, sheet: parts.sheet });
  if (!v.ok) return { ok: false, problems: (v.errors || []).map((e) => "the manifest does not fit your own sheet: " + e), stage: "strict" };

  // 3. the robot plays it, in the same sandbox it plays Breaker in
  const libs = ALLOWED_LIBS.filter((f) => new RegExp("[\"'/]" + f.replace(".", "\\.")).test(parts.html));
  let played;
  try {
    played = await playManifest(parts.manifest, "forge", { read, suggest: false, cartridge: { html: parts.html, libs } });
  } catch (e) {
    return { ok: false, problems: ["the game crashed when the robot tried to play it: " + String((e && e.message) || e)], stage: "robot" };
  }
  if (played.robot !== "played") return { ok: false, problems: [played.note || "the robot could not play it at all"], stage: "robot", played };
  const bad = (played.levels || []).filter((l) => l.verdict === "not-beatable");
  for (const l of bad) problems.push(`level "${l.name}" cannot be finished: ${l.note || "the robot never got to the end"}`);
  const slow = (played.levels || []).filter((l) => l.verdict === "too-long");
  for (const l of slow) problems.push(`level "${l.name}" takes about ${l.seconds} seconds, which is too long for a child; make it shorter`);

  // 4. did it actually TALK to the shell while it played?
  const said = played.said || [];
  const kinds = said.map((m) => (m && (m.kind || m.type)) || "");
  if (kinds.indexOf("win") === -1) problems.push('it never posted {source:"buildable", kind:"win"} while the robot finished it, so a family could never keep it');
  const strays = said.filter((m) => m && m.kind && m.source !== "buildable" && !String(m.type || "").startsWith("nav:"));
  if (strays.length) problems.push('every message to the shell must carry source:"buildable"');

  return { ok: problems.length === 0, problems, stage: "robot", played };
}

// ---------------------------------------------------------------------------
//  ONE ATTEMPT: ask, parse, gate. The model is injected so qa-forge.mjs can
//  drive the whole path with a stub and no key.
// ---------------------------------------------------------------------------
async function attempt(brief, ask, opts) {
  const said = await ask(brief);
  if (!said) return { ok: false, problems: ["the picture of the game never came back"], parts: null };
  const parts = partsFrom(said);
  const g = await gate(parts, opts);
  return { ok: g.ok, problems: g.problems, parts, played: g.played || null, stage: g.stage || null };
}

// The whole forge. Exported so the QA runner drives exactly what production does.
export async function forge({ idea, star, theme, name, levels, ask, read, tries }, onStep) {
  const d = await docs();
  // Never write a game with the rules missing. A cartridge forged without the
  // cartridge contract in front of the model is exactly the thing this card
  // exists to prevent, and it would fail silently rather than loudly.
  if (!d.contract) return { ok: false, attempts: 0, problems: ["the company's own rules could not be read, so nothing was written"], parts: null };
  const sheetExample = await readPublic("breaker/cobuild.json");
  const max = Math.max(1, Math.min(MAX_TRIES, tries || MAX_TRIES));
  let failures = [], last = null;
  for (let t = 1; t <= max; t++) {
    if (onStep) { try { await onStep({ attempt: t, failures }); } catch {} }
    const brief = briefFor({ docs: d, idea, star, theme, name, levels, sheetExample, failures });
    last = await attempt(brief, ask, { read });
    last.attempt = t;
    if (last.ok) return { ok: true, attempts: t, parts: last.parts, played: last.played };
    failures = (last.problems || []).slice(0, 8);
  }
  return { ok: false, attempts: max, problems: failures, parts: (last && last.parts) || null };
}

// ---------------------------------------------------------------------------
//  The handler.
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const qs = new URLSearchParams(String(req.url || "").split("?")[1] || "");
    const body = req.method === "POST" ? await readBody(req) : {};
    const op = body.op || qs.get("op") || "";

    // --- the review queue: the owner's desk. Grown-up gate, every time. ------
    if (op === "queue") {
      if (!grownupOk(req, body)) return refuseGrownup(res);
      if (!URL_ || !KEY) return res.status(200).json({ ok: true, ready: [], failed: [] });
      const r = await sb("forge_cartridges?select=id,kid_game_id,idea,name,status,attempts,problems,nearest,plays,cleared,hearts,promoted_as,created_at&order=created_at.desc&limit=100");
      const all = r.ok ? await r.json().catch(() => []) : [];
      const pick = (s) => (Array.isArray(all) ? all : []).filter((x) => x.status === s).map((x) => publicRow({ ...x }));
      return res.status(200).json({ ok: true, ready: pick("ready"), promoted: pick("promoted"), failed: pick("failed"), forging: pick("forging") });
    }

    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "POST only" }); }

    if (op === "status") {
      const row = await rowById(clean(body.id, 64));
      return res.status(200).json({ ok: !!row, forge: publicRow(row) });
    }

    // A family saying they loved it. One of the three numbers the review queue
    // sorts on, and the only one a child can move.
    if (op === "heart") {
      const row = await rowById(clean(body.id, 64));
      if (!row) return res.status(404).json({ ok: false, error: "no such game" });
      const up = await write(row.id, { hearts: (row.hearts || 0) + 1 });
      return res.status(200).json({ ok: true, forge: publicRow(up || row) });
    }

    // The family beat it. Together with plays and hearts this is what the review
    // queue sorts on: a forged game worth promoting is one that got finished.
    if (op === "cleared") {
      const row = await rowById(clean(body.id, 64));
      if (!row) return res.status(404).json({ ok: false, error: "no such game" });
      const up = await write(row.id, { cleared: (row.cleared || 0) + 1 });
      return res.status(200).json({ ok: true, forge: publicRow(up || row) });
    }

    // --- PROMOTION. The owner says "this one should be a real game." ---------
    //  A serverless function cannot write into public/ — the deployment's disk
    //  is read-only and the repo is the source of truth. So Promote does what it
    //  honestly can: it marks the row promoted and hands back the exact files,
    //  and `node scripts/promote-forge.mjs <id>` writes them into the repo where
    //  a person reviews them like any other change. Nothing a model wrote lands
    //  in main because a button was pressed.
    if (op === "promote") {
      if (!grownupOk(req, body)) return refuseGrownup(res);
      const row = await rowById(clean(body.id, 64));
      if (!row) return res.status(404).json({ ok: false, error: "no such game" });
      if (row.status !== "ready" && row.status !== "promoted") return res.status(400).json({ ok: false, error: "only a game that passed its gate can be promoted" });
      const engineId = clean(body.engine || row.id, 30).replace(/[^a-z0-9-]/g, "") || row.id;
      await write(row.id, { status: "promoted", promoted_as: engineId });
      return res.status(200).json({ ok: true, engine: engineId, files: [
        `public/${engineId}.html`, `public/${engineId}/manifest.json`, `public/${engineId}/cobuild.json`, `qa-${engineId}.mjs`,
      ], next: `node scripts/promote-forge.mjs ${row.id}` });
    }

    // --- THE FORGE ITSELF ---------------------------------------------------
    if (op === "forge") {
      const plan = body.plan || {};
      const idea = clean(body.idea || plan.text, 400);
      if (!idea) return res.status(400).json({ ok: false, error: "tell me what the game is about" });
      const star = clean(body.star || plan.star, 60) || "a brave hero";
      const theme = clean(body.theme || plan.theme, 30) || "jungle";
      const name = clean(body.name || (plan.manifest && plan.manifest.name), 40) || "My New Game";
      const levels = Math.max(1, Math.min(5, parseInt(body.levels || (plan.manifest && (plan.manifest.levels || []).length), 10) || 3));
      const familyId = clean(body.familyId, 64), kidId = clean(body.kidId, 64);

      // The nearest engine is worked out FIRST, so the honest fallback is ready
      // before anything is attempted rather than after everything has failed.
      let nearest = clean(body.nearest, 30);
      if (!nearest) { const ranked = await scoreEngines(idea); nearest = (ranked[0] && ranked[0].engine) || "breaker"; }

      const id = makeSlug(name);
      const row = await insert({
        id, family_id: familyId || null, kid_id: kidId || null,
        kid_name: clean(body.kidName, 40) || null, grownup_name: clean(body.grownupName, 40) || null,
        idea, name, status: "forging", attempts: 0, nearest,
      });

      // No key is a supported state: the studio falls back to layer one and the
      // idea is still recorded, because what a child asked for is worth knowing
      // whether or not we could build it.
      if (!process.env.ANTHROPIC_API_KEY) {
        await write(id, { status: "failed", problems: ["the game writer is switched off right now"] });
        return res.status(200).json({ ok: true, forged: false, reason: "no_model", nearest,
          forge: publicRow({ ...(row || {}), id, status: "failed", nearest, idea, name }) });
      }

      const out = await forge({ idea, star, theme, name, levels,
        ask: (brief) => askClaude(brief, 8000), read: readPublic });

      if (!out.ok) {
        await write(id, { status: "failed", attempts: out.attempts, problems: out.problems || [] });
        return res.status(200).json({ ok: true, forged: false, reason: "did_not_pass", nearest, attempts: out.attempts,
          forge: publicRow({ ...(row || {}), id, status: "failed", attempts: out.attempts, problems: out.problems, nearest, idea, name }) });
      }

      const saved = await write(id, {
        status: "ready", attempts: out.attempts,
        html: out.parts.html, manifest: out.parts.manifest, sheet: out.parts.sheet,
        verdict: { levels: (out.played && out.played.levels) || [], verdict: (out.played && out.played.verdict) || "untested", checkedAt: new Date().toISOString() },
      });
      return res.status(200).json({ ok: true, forged: true, attempts: out.attempts, forge: publicRow(saved || { ...(row || {}), id, status: "ready" }) });
    }

    return res.status(400).json({ ok: false, error: "unknown op" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
