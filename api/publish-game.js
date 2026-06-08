// /api/publish-game.js
// Publishes a kid-created game to the PUBLIC gallery (published_games table).
// The generated game HTML is assembled from the reusable libraries (no DALL-E),
// so publishing just stores the finished HTML + metadata and returns a share id.
import crypto from "crypto";

function shortId() {
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

const sbHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const {
    deviceId, html, title, theme, mechanicSlug, mechanicName,
    characterName, creatorName, layerIds, spriteIds, previewImageUrl,
  } = req.body || {};

  if (!html || typeof html !== "string") return res.status(400).json({ error: "html required" });
  if (!title) return res.status(400).json({ error: "title required" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: "publish not configured" });

  const gameId = shortId();
  const row = {
    game_id: gameId,
    title: String(title).slice(0, 120),
    html,
    theme: theme || null,
    mechanic_slug: mechanicSlug || null,
    mechanic_name: mechanicName || null,
    character_name: characterName || null,
    creator_name: creatorName ? String(creatorName).slice(0, 40) : null,
    device_id: deviceId || null,
    layer_ids: Array.isArray(layerIds) ? layerIds : null,
    sprite_ids: Array.isArray(spriteIds) ? spriteIds : null,
    preview_image_url: previewImageUrl || null,
    moderation_status: "approved",
  };

  try {
    const r = await fetch(supabaseUrl + "/rest/v1/published_games", {
      method: "POST",
      headers: { ...sbHeaders(supabaseKey), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error("publish-game supabase error:", errText);
      return res.status(500).json({ error: "publish failed" });
    }
    const data = await r.json();
    return res.status(200).json({ gameId, id: data[0] && data[0].id, shareUrl: `/play/${gameId}` });
  } catch (e) {
    console.error("publish-game error:", e);
    return res.status(500).json({ error: e.message });
  }
}
