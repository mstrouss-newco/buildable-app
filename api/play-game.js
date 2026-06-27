// /api/play-game.js
// Serves a published game so /play/:id actually plays it. Wired via vercel.json
// route  /play/([^/]+) -> /api/play-game?id=$1 . Returns the stored HTML page.
// Buildable-Kids "recipe" games store a tiny page that embeds the live engine
// (play.html / survival.html) with the chosen recipe; older library games store
// their full standalone HTML. Either way we just hand back the saved html.
const sbHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

export default async function handler(req, res) {
  const id = (req.query.id || "").toString();
  if (!id) return res.status(400).send("missing id");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(503).send("not configured");

  try {
    const r = await fetch(
      supabaseUrl + "/rest/v1/published_games?game_id=eq." + encodeURIComponent(id) +
        "&select=html&limit=1",
      { headers: sbHeaders(supabaseKey) }
    );
    const rows = r.ok ? await r.json() : [];
    const game = Array.isArray(rows) ? rows[0] : null;
    if (!game || !game.html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send("<!doctype html><meta charset=utf-8><body style='font-family:sans-serif;background:#0a0a14;color:#fff;text-align:center;padding:60px'>Game not found.</body>");
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(game.html);
  } catch (e) {
    return res.status(500).send("error");
  }
}
