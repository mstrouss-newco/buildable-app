// /api/manifest.js — Session 4A: read/write a game's manifest (the level-first editor's backend).
//
//   GET  ?game=breaker            -> { ok, source:'override'|'static', manifest, savedAt?, saveId?, qa? }
//                                    An editor-saved override wins; otherwise the static
//                                    public/<game>/manifest.json that ships in the repo.
//   POST { game, manifest }       -> validate + save an override so the change is LIVE now,
//                                    then ask the play-test robot to check it (Session 9E).
//
// Session 4B added the structural gate before a save goes live. Session 9E adds the
// ASYNC half: saving still publishes immediately (the owner never waits on a robot), but
// the save also stashes a revert point, stamps a saveId, and fires a GitHub Action that
// play-tests every level of what just went live. The verdict comes back to
// /api/manifest-qa and the editor shows it. See .github/workflows/editor-qa.yml.
//
// Storage reuses images.js's image_cache table (same trick as asset-studio.js) so there is
// still NO database migration — see KEY in _editorAuth.js for the three keys per game.

import { SUPABASE_URL, SUPABASE_SERVICE_KEY, verifyOwner, sb, readBody, slug, KEY, readBlob, writeBlob } from "./_editorAuth.js";
import { hasRobot } from "../qa/qa-map.mjs";

// Structural validation — GAME-AGNOSTIC server-side guard (Session 4B: the editor now
// saves every game, not just Breaker). Universal fields only: id, name, type, and — for
// games — a non-empty levels array where each level has a unique id, a name, and a
// difficulty 1-5. The deep, per-game level shape (Breaker layout/parts, Survival recipes,
// board opponents, …) is validated CLIENT-side by the shared loader (BuildableManifest.
// validate) before the editor ever POSTs, so this stays a lightweight safety net that
// never wrongly rejects a valid non-Breaker manifest.
//
// What it still cannot do — and why Session 9E exists — is tell you whether a level is
// BEATABLE. A difficulty bumped from 2 to 5 passes every check on this page and can still
// be impossible. Only the robot that plays the game knows that.
function validate(m) {
  const e = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  if (!m.id || typeof m.id !== "string") e.push("missing id");
  if (!m.name || typeof m.name !== "string") e.push("missing name");
  if (m.type !== "game" && m.type !== "studio") e.push("type must be game or studio");
  if (m.type === "studio") {
    if (!m.produces || typeof m.produces !== "string") e.push("studio produces must be a non-empty string");
    if (!m.savesTo || typeof m.savesTo !== "string") e.push("studio savesTo must be a non-empty string");
  }
  if (m.type === "game") {
    if (!Array.isArray(m.levels) || !m.levels.length) e.push("levels must be a non-empty array");
    else {
      const seen = {};
      m.levels.forEach((lv, i) => {
        const at = "levels[" + i + "]";
        if (!lv || typeof lv !== "object") { e.push(at + " is not an object"); return; }
        if (!lv.id || typeof lv.id !== "string") e.push(at + " missing id");
        else if (seen[lv.id]) e.push(at + " duplicate id '" + lv.id + "'"); else seen[lv.id] = 1;
        if (!lv.name) e.push(at + " missing name");
        const d = lv.difficulty;
        if (typeof d !== "number" || d < 1 || d > 5 || (d | 0) !== d) e.push(at + " difficulty must be an integer 1-5");
      });
    }
  }
  return e;
}

async function readOverride(game) {
  const r = await sb(`image_cache?cache_key=eq.${encodeURIComponent(KEY.live(game))}&select=b64,descriptor&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0]) return null;
  try { return { manifest: JSON.parse(Buffer.from(rows[0].b64, "base64").toString("utf8")), descriptor: rows[0].descriptor }; }
  catch { return null; }
}

// Ask GitHub to run the play-test robot for this save. Best effort by design: the save
// has already gone live, so a dispatch failure must never fail the save — it downgrades
// the QA record to "not-queued" and the editor says so in plain English rather than
// implying the change was checked.
//
// Both values are read from the environment by name; nothing is stored in the repo.
async function requestPlayTest(game, saveId) {
  const token = process.env.GITHUB_QA_TOKEN;
  const repo = process.env.GITHUB_QA_REPO || "mstrouss-newco/buildable-app";
  if (!token) return { ok: false, reason: "the play-test robot is not switched on yet (GITHUB_QA_TOKEN is not set)" };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "editor-qa", client_payload: { game, saveId } }),
    });
    if (r.status === 204) return { ok: true };
    const detail = await r.text().catch(() => "");
    return { ok: false, reason: `GitHub would not start the robot (${r.status}). ${detail.slice(0, 160)}` };
  } catch (err) {
    return { ok: false, reason: `could not reach GitHub: ${String((err && err.message) || err)}` };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const qs = String(req.url || "").split("?")[1] || "";
  const params = new URLSearchParams(qs);
  const game = slug(params.get("game") || "breaker") || "breaker";

  if (req.method === "GET") {
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const ov = await readOverride(game);
        if (ov && ov.manifest) {
          // The QA record carries the saveId, so the robot can tell whether the manifest
          // it is about to test is still the one it was asked to test.
          const qa = await readBlob(KEY.qa(game));
          return res.status(200).json({ ok: true, source: "override", manifest: ov.manifest,
            savedAt: ov.descriptor || null, saveId: (qa && qa.value && qa.value.saveId) || null,
            qa: (qa && qa.value) || null });
        }
      } catch {}
    }
    // no override -> return the static file that ships in public/
    try {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const r = await fetch(`${proto}://${host}/${game}/manifest.json?v=${Date.now()}`, { headers: { "Cache-Control": "no-store" } });
      if (r.ok) { const m = await r.json(); return res.status(200).json({ ok: true, source: "static", manifest: m }); }
      return res.status(404).json({ ok: false, error: "no manifest for " + game });
    } catch (err) { return res.status(200).json({ ok: false, error: String((err && err.message) || err) }); }
  }

  if (req.method === "POST") {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ ok: false, error: "no supabase env" });
    const owner = await verifyOwner(req);
    if (!owner.ok) return res.status(owner.code || 403).json({ ok: false, error: owner.error });
    const b = await readBody(req);
    const g = slug(b.game || game) || "breaker";
    const m = b.manifest;
    const errs = validate(m);
    if (errs.length) return res.status(400).json({ ok: false, errors: errs });
    if (slug(m.id) !== g) return res.status(400).json({ ok: false, errors: ["manifest id '" + m.id + "' does not match game '" + g + "'"] });

    const saveId = g + "-" + Date.now();
    const savedAt = new Date().toISOString();
    const descriptor = g + " manifest saved " + savedAt;

    try {
      // 1. Stash what is live right now so "Put it back" is one click. Only an actual
      //    override becomes a revert point — if the game was still on the file that ships
      //    in the repo, reverting means deleting the override, which the QA endpoint does.
      const current = await readOverride(g);
      const prevQa = await readBlob(KEY.qa(g));
      await writeBlob(KEY.prev(g), {
        game: g,
        manifest: current && current.manifest ? current.manifest : null,
        source: current && current.manifest ? "override" : "static",
        saveId: (prevQa && prevQa.value && prevQa.value.saveId) || null,
        savedAt: (current && current.descriptor) || null,
        stashedAt: savedAt,
      }, g + " previous manifest stashed " + savedAt, "manifest-prev");

      // 2. Publish. This is unchanged from 4A/4B: the save is live immediately.
      const b64 = Buffer.from(JSON.stringify(m), "utf8").toString("base64");
      await sb(`image_cache?cache_key=eq.${encodeURIComponent(KEY.live(g))}`, { method: "DELETE" });
      const r = await sb("image_cache", { method: "POST", body: JSON.stringify({ cache_key: KEY.live(g), descriptor, kind: "manifest", b64 }) });
      if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 200) }); }

      // 3. Line up the play-test. Statuses the editor knows how to explain:
      //    pending | pass | fail | error | no-robot | not-queued
      let qa = { game: g, saveId, savedAt, savedBy: owner.email || null,
        canRevert: true, hasRobot: hasRobot(g), status: "pending",
        summary: "The robot is play-testing every level of this game now." };

      if (!qa.hasRobot) {
        qa.status = "no-robot";
        qa.summary = "This change is live. There is no play-test robot for this game yet, so it was not play-tested.";
      } else {
        const disp = await requestPlayTest(g, saveId);
        if (!disp.ok) {
          qa.status = "not-queued";
          qa.summary = "This change is live, but it was not play-tested: " + disp.reason;
        }
      }
      await writeBlob(KEY.qa(g), qa, g + " qa " + qa.status + " " + savedAt, "manifest-qa");

      return res.status(200).json({ ok: true, savedAt: descriptor, source: "override", saveId, qa });
    } catch (err) { return res.status(200).json({ ok: false, error: String((err && err.message) || err) }); }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method not allowed" });
}
