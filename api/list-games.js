// /api/list-games.js
export default async function handler(req, res) {
if (req.method !== "GET") return res.status(405).json({error: "GET only"});
const {deviceId} = req.query;
if (!deviceId) return res.status(400).json({error: "deviceId required"});
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) return res.status(200).json({games: []});
try {
const r = await fetch(`${supabaseUrl}/rest/v1/saved_games?device_id=eq.${encodeURIComponent(deviceId)}&order=created_at.desc&limit=20`, {headers: {"apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`}});
if (!r.ok) return res.status(200).json({games: []});
const games = await r.json();
return res.status(200).json({games});
} catch (e) {
return res.status(200).json({games: []});
}
}
