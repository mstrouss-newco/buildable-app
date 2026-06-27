// /api/kid-game-stats.js  GET ?kidProfileId=  (or ?deviceId=)
// Aggregates kid_game_events into a per-kid summary: total plays, favorite game,
// and per-game plays/wins/losses. Powers the helper's "you love X" nudges and a
// future grown-ups progress view. Read-only, service key, best-effort.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  if (!URL || !KEY) return res.status(200).json({ ok: false, configured: false, games: [] });
  const kidProfileId = (req.query.kidProfileId || "").toString().trim();
  const deviceId = (req.query.deviceId || "").toString().trim();
  if (!kidProfileId && !deviceId) return res.status(400).json({ error: "kidProfileId or deviceId required" });
  const filter = kidProfileId
    ? "kid_profile_id=eq." + encodeURIComponent(kidProfileId)
    : "device_id=eq." + encodeURIComponent(deviceId);
  try {
    const r = await fetch(`${URL}/rest/v1/kid_game_events?${filter}&select=game,event,created_at&order=created_at.desc&limit=2000`, { headers: H });
    if (!r.ok) return res.status(200).json({ ok: false, games: [] });
    const rows = await r.json();
    const by = {};
    let totalPlays = 0, lastGame = null;
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const g = row.game; if (!g) continue;
      if (!by[g]) by[g] = { game: g, plays: 0, wins: 0, losses: 0 };
      if (row.event === "play") { by[g].plays++; totalPlays++; }
      else if (row.event === "win") by[g].wins++;
      else if (row.event === "lose") by[g].losses++;
      if (!lastGame) lastGame = g;
    }
    const games = Object.values(by).sort((a, b) => (b.plays - a.plays) || ((b.wins + b.losses) - (a.wins + a.losses)));
    const favorite = games[0] || null;
    const totalWins = games.reduce((s, x) => s + x.wins, 0);
    const totalLosses = games.reduce((s, x) => s + x.losses, 0);
    return res.status(200).json({ ok: true, totalPlays, totalWins, totalLosses, favorite, lastGame, games });
  } catch (e) { return res.status(200).json({ ok: false, games: [] }); }
}
