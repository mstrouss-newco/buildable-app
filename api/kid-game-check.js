// /api/kid-game-check.js — THE ROBOT BUILD GATE (Session CB2).
//
// Hand it a manifest and an engine; it plays every level headless and answers,
// per level, beatable / not-beatable / too-long — plus an easier variant when the
// game turned out to be impossible. api/kid-game.js calls it on every save, and
// the answer is stored on the row, so a game nobody can finish is never kept.
//
//   POST { manifest, engine, suggest? }  -> { ok, check:{...} }
//   GET  ?engine=breaker                 -> { ok, sheet }   the engine's cobuild sheet
//
// The playing itself is qa/kid-game-robot.mjs: the SAME headless sandbox the
// qa-*.mjs runners use, driven through each engine's own sim() hook. This file is
// only the door. It is a static import so Vercel traces and ships it.
import { sheetFor } from "./_cobuild.js";
import { ENGINES, checkManifest, robotCheck } from "./kid-game.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const q = new URLSearchParams(String(req.url || "").split("?")[1] || "");
      const engine = String(q.get("engine") || "").trim();
      if (!ENGINES[engine]) return res.status(400).json({ ok: false, error: "engine must be one of " + Object.keys(ENGINES).join(", ") });
      const sheet = await sheetFor(engine);
      if (!sheet) return res.status(503).json({ ok: false, error: "the " + engine + " cobuild sheet could not be read" });
      return res.status(200).json({ ok: true, sheet });
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "GET or POST only" }); }

    const body = await readBody(req);
    const engine = String(body.engine || "").trim();
    const manifest = body.manifest;
    if (!ENGINES[engine]) return res.status(400).json({ ok: false, error: "engine must be one of " + Object.keys(ENGINES).join(", ") });
    if (!manifest || typeof manifest !== "object") return res.status(400).json({ ok: false, error: "manifest required" });

    // Never play something that is not even a valid manifest: the robot would be
    // reporting on junk, and the honest answer is the validation error.
    const valid = await checkManifest(manifest, engine);
    if (!valid.ok) return res.status(400).json({ ok: false, errors: valid.errors });

    const check = await robotCheck(manifest, engine, { suggest: body.suggest !== false });
    return res.status(200).json({ ok: true, check });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
