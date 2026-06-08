// /api/list-published-games.js
// PUBLIC gallery endpoint for kid-published games (published_games table).
//   GET /api/list-published-games            -> newest approved games (no html, light list)
//   GET /api/list-published-games?gameId=ID  -> one full game including html (to play it)
//   GET /api/list-published-games?deviceId=D -> a given device's published games
const sbHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(200).json({ games: [] });

  const { gameId, deviceId, limit } = req.query;

  try {
    // Single game (full html) for playing a shared game.
    if (gameId) {
      const r = await fetch(
        supabaseUrl + "/rest/v1/published_games?game_id=eq." + encodeURIComponent(gameId) + "&limit=1",
        { headers: sbHeaders(supabaseKey) }
      );
      if (!r.ok) return res.status(200).json({ game: null });
      const rows = await r.json();
      return res.status(200).json({ game: Array.isArray(rows) ? rows[0] || null : null });
    }

    // Light list (omit the big html column).
    const cols = "select=id,game_id,title,theme,mechanic_name,character_name,creator_name,preview_image_url,play_count,created_at";
    const cap = Math.min(parseInt(limit, 10) || 30, 100);
    let url = supabaseUrl + "/rest/v1/published_games?" + cols + "&order=created_at.desc&limit=" + cap;
    if (deviceId) {
      url += "&device_id=eq." + encodeURIComponent(deviceId);
    } else {
      url += "&moderation_status=eq.approved";
    }
    const r = await fetch(url, { headers: sbHeaders(supabaseKey) });
    if (!r.ok) return res.status(200).json({ games: [] });
    const games = await r.json();
    return res.status(200).json({ games: Array.isArray(games) ? games : [] });
  } catch (e) {
    return res.status(200).json({ games: [] });
  }
}
