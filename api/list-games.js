// /api/list-games.js
import { thumbForWorld } from "./_thumbs.js";
export default async function handler(req, res) {
if (req.method !== "GET") return res.status(405).json({error: "GET only"});
const {deviceId, kidProfileId} = req.query;
if (!deviceId && !kidProfileId) return res.status(400).json({error: "deviceId or kidProfileId required"});
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) return res.status(200).json({games: []});
try {
const filter = kidProfileId ? `kid_profile_id=eq.${encodeURIComponent(kidProfileId)}` : `device_id=eq.${encodeURIComponent(deviceId)}`;
const r = await fetch(`${supabaseUrl}/rest/v1/saved_games?${filter}&order=created_at.desc&limit=20`, {headers: {"apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`}});
if (!r.ok) return res.status(200).json({games: []});
let games = await r.json();
if (Array.isArray(games)) games = games.map((g) => ({ ...g, thumbnail: thumbForWorld(g.world) || null }));
return res.status(200).json({games});
} catch (e) {
return res.status(200).json({games: []});
}
}
