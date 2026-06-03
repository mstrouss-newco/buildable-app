// /api/save-game.js
// Saves a kid's game configuration (hero, boss, world, goal, game type) to Supabase.
// Anonymous — keyed by device ID, no user accounts.
// Returns a short game ID that can be shared in a URL for remix.

import crypto from "crypto";

function shortId() {
  // 8-char URL-safe game ID — enough for ~10M games before collisions matter
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { deviceId, hero, boss, world, goal, gameType, weapon, kidName } = req.body || {};

  if (!deviceId) return res.status(400).json({ error: "deviceId required" });
  if (!hero || !boss || !world || !goal || !gameType) {
    return res.status(400).json({ error: "missing required game fields" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: "save not configured" });
  }

  const gameId = shortId();

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/saved_games`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        game_id: gameId,
        device_id: deviceId,
        hero, boss, world, goal, game_type: gameType, weapon,
        // We deliberately do NOT store kidName to keep saves PII-free.
        // If you want to display names in shared games later, pull from device storage instead.
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("save-game supabase error:", errText);
      return res.status(500).json({ error: "save failed" });
    }

    return res.status(200).json({ gameId, shareUrl: `/?remix=${gameId}` });
  } catch (e) {
    console.error("save-game error:", e);
    return res.status(500).json({ error: e.message });
  }
}
