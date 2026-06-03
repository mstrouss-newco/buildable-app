// /api/load-game.js
export default async function handler(req, res) {
if (req.method !== "GET") return res.status(405).json({error: "GET only"});
const {id} = req.query;
if (!id) return res.status(400).json({error: "id required"});
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) return res.status(503).json({error: "load not configured"});
try {
const r = await fetch(`${supabaseUrl}/rest/v1/saved_games?game_id=eq.${encodeURIComponent(id)}&select=game_id,hero,boss,world,goal,game_type,weapon,created_at`, {headers: {"apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`}});
if (!r.ok) return res.status(404).json({error: "not found"});
const rows = await r.json();
if (!rows[0]) return res.status(404).json({error: "not found"});
return res.status(200).json(rows[0]);
} catch (e) {
return res.status(500).json({error: e.message});
}
}
