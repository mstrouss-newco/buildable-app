// /api/top-creations.js
// PUBLIC central-library leaderboard. GET ?kind=song|game|story&deviceId=&limit=
// Ranks by score = hearts*3 + plays, then newest. Returns only public-safe fields.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function sb(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); return r.ok ? r.json() : []; }
const score = (c) => (c.heart_count || 0) * 3 + (c.play_count || 0);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  if (!URL || !KEY) return res.status(200).json({ items: [] });
  const kind = (req.query.kind || "song").toString();
  const deviceId = (req.query.deviceId || "").toString();
  const cap = Math.min(parseInt(req.query.limit, 10) || 40, 100);
  try {
    let items = [];
    if (kind === "song") {
      const rows = await sb("saved_songs?published=eq.true&select=song_id,title,vibe,theme,audio_url,cover_color,kid_name,play_count,heart_count,created_at,meta&order=created_at.desc&limit=100");
      items = rows.map((r) => ({ kind: "song", id: r.song_id, title: r.title, creator: r.kid_name || "A kid", cover_color: r.cover_color, vibe: r.vibe, theme: r.theme, audio_url: r.audio_url, play_count: r.play_count || 0, heart_count: r.heart_count || 0, created_at: r.created_at, meta: r.meta || null }));
    } else if (kind === "story") {
      const rows = await sb("saved_stories?published=eq.true&select=story_id,title,world,cover_color,kid_name,play_count,heart_count,created_at&order=created_at.desc&limit=100");
      items = rows.map((r) => ({ kind: "story", id: r.story_id, title: r.title, creator: r.kid_name || "A kid", cover_color: r.cover_color, world: r.world, play_count: r.play_count || 0, heart_count: r.heart_count || 0, created_at: r.created_at }));
    } else {
      const rows = await sb("published_games?moderation_status=eq.approved&select=game_id,title,theme,mechanic_name,character_name,creator_name,preview_image_url,play_count,heart_count,created_at&order=created_at.desc&limit=100");
      items = rows.map((r) => ({ kind: "game", id: r.game_id, title: r.title, creator: r.creator_name || "A kid", theme: r.theme, mechanic: r.mechanic_name, character: r.character_name, preview_image_url: r.preview_image_url, play_count: r.play_count || 0, heart_count: r.heart_count || 0, created_at: r.created_at }));
    }
    items.sort((a, b) => score(b) - score(a) || (new Date(b.created_at) - new Date(a.created_at)));
    items = items.slice(0, cap);
    if (deviceId && items.length) {
      const ids = items.map((i) => `"${i.id}"`).join(",");
      const hearts = await sb(`creation_hearts?kind=eq.${kind}&device_id=eq.${encodeURIComponent(deviceId)}&creation_id=in.(${ids})&select=creation_id`);
      const set = new Set((hearts || []).map((h) => h.creation_id));
      items.forEach((i) => { i.hearted = set.has(i.id); });
    }
    return res.status(200).json({ items });
  } catch (e) { return res.status(200).json({ items: [] }); }
}
