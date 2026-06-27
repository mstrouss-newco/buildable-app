// /api/log-game-event.js  POST {deviceId, kidProfileId, game, event, meta?}
// Records ONE per-kid game event (play | win | lose) into kid_game_events
// (db/create-kid-game-events.sql). Best-effort, no auth (service key), like
// play-creation. Used to learn each kid's favorite games + progress.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const EVENTS = new Set(["play", "win", "lose"]);
function readBody(req) { if (req.body && typeof req.body === "object") return Promise.resolve(req.body); return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL || !KEY) return res.status(200).json({ ok: false });
  const b = await readBody(req);
  const game = (b.game || "").toString().slice(0, 40);
  const event = (b.event || "").toString();
  if (!game || !EVENTS.has(event)) return res.status(400).json({ error: "game and valid event required" });
  const row = {
    kid_profile_id: b.kidProfileId ? String(b.kidProfileId) : null,
    device_id: b.deviceId ? String(b.deviceId) : null,
    game, event,
    meta: b.meta && typeof b.meta === "object" ? b.meta : null,
  };
  try {
    await fetch(`${URL}/rest/v1/kid_game_events`, { method: "POST", headers: H, body: JSON.stringify(row) });
    return res.status(200).json({ ok: true });
  } catch (e) { return res.status(200).json({ ok: false }); }
}
