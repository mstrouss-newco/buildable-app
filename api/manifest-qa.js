// /api/manifest-qa.js — Session 9E: the editor's async QA gate, site half.
//
// The editor saves and publishes immediately (api/manifest.js). A GitHub Action then
// play-tests what went live and lands its verdict here, so the editor can show the owner
// a banner and — when a level turned out to be impossible — put the old version back.
//
//   GET  ?game=breaker                     -> { ok, qa, revert } (owner only)
//   POST { game, saveId, status, ... }     -> the robot reporting in (x-qa-secret header)
//   POST { action:'revert',  game }        -> put the previous manifest back (owner only)
//   POST { action:'recheck', game }        -> ask for another play-test (owner only)
//
// Statuses the editor knows how to explain, all set by this file or api/manifest.js:
//   pending    the robot is playing the game right now
//   pass       every level was beatable
//   fail       a level could not be finished — this is the one that needs the owner
//   error      the robot could not do its job (site unreachable, robot crashed)
//   no-robot   this game has no play-test robot yet
//   not-queued the save is live but the robot was never started (token not set)
//   reverted   the owner put the previous version back
//
// Storage is the same image_cache trick as api/manifest.js — no migration.

import crypto from "crypto";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, verifyOwner, sb, readBody, slug, KEY, readBlob, writeBlob } from "./_editorAuth.js";
import { hasRobot } from "../qa/qa-map.mjs";

const ALLOWED_STATUS = ["pending", "pass", "fail", "error", "no-robot", "not-queued", "reverted"];

// Constant-time compare so a wrong secret cannot be guessed a character at a time.
function secretOk(presented) {
  const expected = process.env.QA_REPORT_SECRET || "";
  if (!expected) return false; // not configured -> nothing is trusted, by design
  const a = Buffer.from(String(presented || ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);

// What the editor needs to offer "Put it back": is there something to go back to, and
// what is it? Never returns the manifest itself — the editor only needs the label.
async function revertInfo(game) {
  const prev = await readBlob(KEY.prev(game));
  if (!prev || !prev.value) return { available: false };
  const p = prev.value;
  return {
    available: true,
    // A first-ever save has no previous override; putting it back means dropping the
    // override so the game falls back to the version that ships in the repo.
    to: p.manifest ? "the version saved before this one" : "the version that ships with the game",
    savedAt: p.savedAt || null,
    stashedAt: p.stashedAt || null,
    levels: p.manifest && Array.isArray(p.manifest.levels) ? p.manifest.levels.length : null,
  };
}

async function doRevert(game) {
  const prev = await readBlob(KEY.prev(game));
  if (!prev || !prev.value) return { ok: false, error: "there is no earlier version stored for this game" };
  const p = prev.value;
  const now = new Date().toISOString();

  // Stash what we are about to replace, so the owner can undo the undo.
  const currentRow = await sb(`image_cache?cache_key=eq.${encodeURIComponent(KEY.live(game))}&select=b64,descriptor&limit=1`);
  let current = null;
  try { const rows = await currentRow.json(); if (Array.isArray(rows) && rows[0]) current = { manifest: JSON.parse(Buffer.from(rows[0].b64, "base64").toString("utf8")), descriptor: rows[0].descriptor }; } catch {}
  const oldQa = await readBlob(KEY.qa(game));

  if (p.manifest) {
    const b64 = Buffer.from(JSON.stringify(p.manifest), "utf8").toString("base64");
    await sb(`image_cache?cache_key=eq.${encodeURIComponent(KEY.live(game))}`, { method: "DELETE" });
    await sb("image_cache", { method: "POST", body: JSON.stringify({ cache_key: KEY.live(game), descriptor: game + " manifest put back " + now, kind: "manifest", b64 }) });
  } else {
    // No earlier override: dropping the override restores the version in the repo.
    await sb(`image_cache?cache_key=eq.${encodeURIComponent(KEY.live(game))}`, { method: "DELETE" });
  }

  await writeBlob(KEY.prev(game), {
    game,
    manifest: current ? current.manifest : null,
    source: current ? "override" : "static",
    saveId: (oldQa && oldQa.value && oldQa.value.saveId) || null,
    savedAt: current ? current.descriptor : null,
    stashedAt: now,
  }, game + " previous manifest stashed " + now, "manifest-prev");

  const qa = {
    game,
    saveId: game + "-" + Date.now(),
    savedAt: now,
    status: "reverted",
    hasRobot: hasRobot(game),
    canRevert: true,
    summary: p.manifest
      ? "Put back the version saved before the change. That version is live now."
      : "Put back the version that ships with the game. That version is live now.",
  };
  await writeBlob(KEY.qa(game), qa, game + " qa reverted " + now, "manifest-qa");
  return { ok: true, qa };
}

// Shared with api/manifest.js in spirit, kept local so a dispatch change here cannot
// accidentally alter the save path. Best effort: never throws.
async function requestPlayTest(game, saveId) {
  const token = process.env.GITHUB_QA_TOKEN;
  const repo = process.env.GITHUB_QA_REPO || "mstrouss-newco/buildable-app";
  if (!token) return { ok: false, reason: "the play-test robot is not switched on yet (GITHUB_QA_TOKEN is not set)" };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "editor-qa", client_payload: { game, saveId } }),
    });
    if (r.status === 204) return { ok: true };
    const detail = await r.text().catch(() => "");
    return { ok: false, reason: `GitHub would not start the robot (${r.status}). ${detail.slice(0, 160)}` };
  } catch (err) { return { ok: false, reason: `could not reach GitHub: ${String((err && err.message) || err)}` }; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ ok: false, error: "no supabase env" });

  const params = new URLSearchParams(String(req.url || "").split("?")[1] || "");

  // ---- the editor asking "how did it go?" ----------------------------------
  if (req.method === "GET") {
    const owner = await verifyOwner(req);
    if (!owner.ok) return res.status(owner.code || 403).json({ ok: false, error: owner.error });
    const game = slug(params.get("game"));
    if (!game) return res.status(400).json({ ok: false, error: "game required" });
    const rec = await readBlob(KEY.qa(game));
    return res.status(200).json({ ok: true, game, qa: (rec && rec.value) || null, revert: await revertInfo(game) });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  const b = await readBody(req);
  const game = slug(b.game);
  if (!game) return res.status(400).json({ ok: false, error: "game required" });

  // ---- the owner pressing "Put it back" or "Check it again" ----------------
  if (b.action === "revert" || b.action === "recheck") {
    const owner = await verifyOwner(req);
    if (!owner.ok) return res.status(owner.code || 403).json({ ok: false, error: owner.error });

    if (b.action === "revert") {
      const out = await doRevert(game);
      return res.status(out.ok ? 200 : 400).json({ ...out, revert: await revertInfo(game) });
    }

    if (!hasRobot(game)) return res.status(200).json({ ok: false, error: "there is no play-test robot for this game yet" });
    const rec = await readBlob(KEY.qa(game));
    const saveId = (rec && rec.value && rec.value.saveId) || game + "-" + Date.now();
    const disp = await requestPlayTest(game, saveId);
    const qa = { ...(rec && rec.value ? rec.value : { game, saveId }), saveId, hasRobot: true,
      status: disp.ok ? "pending" : "not-queued",
      summary: disp.ok ? "The robot is play-testing every level of this game now."
                       : "The robot was not started: " + disp.reason };
    await writeBlob(KEY.qa(game), qa, game + " qa " + qa.status + " " + new Date().toISOString(), "manifest-qa");
    return res.status(200).json({ ok: true, qa });
  }

  // ---- the robot reporting in ---------------------------------------------
  if (!secretOk(req.headers["x-qa-secret"])) return res.status(401).json({ ok: false, error: "bad or missing report secret" });

  const status = ALLOWED_STATUS.includes(b.status) ? b.status : "error";
  const rec = await readBlob(KEY.qa(game));
  const known = (rec && rec.value) || null;

  // A newer save superseded the one this run tested — keep the newer record, and say so
  // rather than letting an old verdict describe a manifest that is no longer live.
  if (known && known.saveId && b.saveId && known.saveId !== b.saveId) {
    return res.status(200).json({ ok: true, stale: true, reason: "a newer save superseded this run" });
  }

  const qa = {
    ...(known || { game }),
    game,
    saveId: b.saveId || (known && known.saveId) || null,
    hasRobot: hasRobot(game),
    canRevert: true,
    status,
    summary: clip(b.summary, 600) || known?.summary || null,
    failures: Array.isArray(b.failures) ? b.failures.slice(0, 25).map((f) => String(f).slice(0, 300)) : [],
    durationSeconds: typeof b.durationSeconds === "number" ? b.durationSeconds : null,
    runUrl: clip(b.runUrl, 300),
    log: clip(b.log, 4000),
    finishedAt: new Date().toISOString(),
  };
  await writeBlob(KEY.qa(game), qa, game + " qa " + status + " " + qa.finishedAt, "manifest-qa");
  return res.status(200).json({ ok: true, recorded: status });
}
